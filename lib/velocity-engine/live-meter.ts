import {
  buildBackground,
  DARK_MAX_SPREAD,
  DARK_MIN_BACKGROUND,
  DARK_THRESHOLD,
} from './detect.ts';
import {
  analyzeFrames,
  cornerMeans,
  type AnalyzeFramesInput,
  type AnalyzeResult,
  type Approach,
  type CapturedFrame,
} from './analyze-frames.ts';
import { BALL_DIAMETER_M, focalPxFromFov } from './geometry.ts';
import { analyzeByDistance, type DistanceResult } from './analyze-distance.ts';
import { SeedWatch } from './seed-watch.ts';
import {
  MAX_RELEASE_DISTANCE_M,
  MAX_RELEASE_OFFSET_RATIO,
  MIN_FPS,
  MIN_FRAME_WIDTH_PX,
  reject,
} from './validate.ts';

/**
 * 카메라 실시간 측정의 '판단' — 프레임을 하나씩 받아 배경 → 던짐(공) 알아채기 → 담기 → 계산 넘기기 → 쉬기 → 다시
 * 기다리기를 정한다. 카메라 · 캔버스 · 타이머(DOM)는 live-capture.ts 가 맡고, 여기는 순수 계산만 둔다.
 *
 * 왜 뗐나: 실시간 측정이 제대로 도는지를 폰으로 던져 봐야만 알 수 있으면 고칠 수가 없다. 판단을 DOM 없이 두면
 * 스피드건 값이 있는 실제 영상(보정 영상 18개)을 카메라처럼 한 장씩 흘려 넣어 노드에서 그대로 재 볼 수 있다
 * (lab 의 replay · scripts/velocity-live-test.mts). 브라우저와 노드가 같은 코드를 돈다.
 *
 * 쓰는 법: push(프레임) → 사건들. 'capture' 사건이 오면 그 일감(job)을 계산하고(liveAnalysisInput → analyzeFrames,
 * 메인 스레드든 워커든) 끝나면 finish() 를 부른다 — 쉬는 시간(COOLDOWN)을 걸고 다시 기다린다.
 *
 * ── 던짐을 무엇으로 알아채나(2026-09-30, 실제 영상 18개를 카메라처럼 흘려 본 결과) ──
 *
 * 예전(모델 1.6.0 까지, trigger 'motion'): 잠잠할 때 찍은 배경보다 가운데 상자에서 밝아진 픽셀이 30개를 넘으면 던진
 * 것으로 봤다. 카메라가 투수 2~3m 뒤라 투수의 글러브 · 팔이 화면 가장자리에 걸려 있는데, 배경을 찍을 때 거기 있던
 * 어두운 팔이 움직이면 그 빈자리가 '밝아진 곳'이 돼 던지기 0.15~0.8초 전에 알아채 버렸다. 그 뒤 0.6초만 담으니 공이
 * 담기지 않거나 공이 계산의 앞 12장 밖에 있어, 보정 영상 15개 가운데 4개만 쟀다(파일로는 15개 모두).
 *
 * 지금(trigger 'ball'): 날아가는 공 자체를 찾는다 — 파일에서 던진 때를 찾는 find-throw.ts 와 같은 물리. 가운데 근처에
 * 새로 나타난 둥근 밝은 덩어리가 장면마다 작아지며(멀어짐) 3차원 속도 8~65m/s 로 이어지면 공이다. 서 있는 몸 · 빈자리
 * (유령) · 흔들리는 천은 작아지지 않거나 너무 느려 이어지지 않는다. 공이 처음 보인 장면 앞 PRE 초부터 담는다 — 공이
 * 계산 구간의 앞쪽에 오고, 릴리스 직전 장면도 담긴다. 빠른 계산을 위해 가운데 네모만 반 해상도로 본다.
 *
 * ── 밖에서 한 번도 안 걸렸다(2026-10-03) ──
 *
 * 실내 터널 영상 18개로만 맞춘 판단이라, 보정 영상에 조건을 더해 흘려 보고(장면 빠짐 · 30fps · 표적 벗어남 · 작은 공 · 자동 노출 ·
 * 흔들림 · 반짝이는 잎) 야외 장면을 그려 보니(카메라 높이 · 겨냥 · 하늘) 한 번도 안 걸리는 조건이 다섯 있었다.
 *   ① 표적에 릴리스를 맞추느라 폰을 올려 들면 공이 옆으로 7m/s 넘게 흘러 막혔다 → 옆 속도 상한을 깊이 속도에 비례(lateralCap),
 *      대신 빠른 궤적은 세 이음 · 고른 옆 속도 · 곧은 화면 길(lateralSteady) · 줄기만 하는 화면 속도(WATCH_SPEEDUP), 찾는 네모를 넓힘.
 *   ② 노출이 한 번 바뀌면(팔이 들어올 때 8%) 흔들림으로 보고 배경을 다시 준비하느라 그 공을 놓쳤다 → 노출을 빼고 잰다(cornerMotion).
 *      계산에 넘기는 흔들림(CAMERA_SHAKE)도 같은 값으로 — 그대로면 알아챈 공을 계산이 '카메라가 움직였다'로 거부했다.
 *   ③ 릴리스가 가운데에서 150px 더 벗어나면 0/18 → 씨앗 자리를 넓히고(가운데 밖 궤적은 증거를 더), 끝내 가운데로 안 오면
 *      '릴리스가 중앙에서 벗어났다'고 알린다(analyzeJob).
 *   ④ 던지기 전 글러브 · 몸 조각에 먼저 걸리면 1초 가까이 담고 1.5초 쉬느라 진짜 공을 놓쳤다 → 따라간 것이 공답게 멀어지지 않으면
 *      담는 동안 다시 찾아 옮겨 담고(captureBall), 그런 담기 뒤에는 쉬지 않는다(finish).
 *   ⑤ 밝은 배경(하늘 · 해 받은 벽) 앞에서 공이 배경보다 어둡게 찍히면(해를 마주 봄 · 흐린 하늘) 밝아진 덩어리만 찾아서는 영영
 *      못 알아챘다 → 가만한 밝은 배경 앞에서 어두워진 덩어리도 따로 찾고(BallWatch.blobs — detect.ts '밝은 배경'), 알아채기 전
 *      궤적은 한 극성으로만 잇는다. 계산도 예전 길로 못 쟀으면 두 번째 길(극성)로 다시 잰다(analyze-frames.ts).
 * 남은 것: 공 반쪽이 하늘과 같은 밝기(밖-5)이거나 대비가 35 밑이면 그대로 못 잰다.
 * 되돌려 보기(조건 45가지 × 18개): 알아챈 공 628 → 701/810, 헛 알아챔 67 → 41(던지기 전 26 → 13), 던지지 않을 때(12조건 × 4초)
 * 50 → 45번. 야외 합성(카메라 높이 · 겨냥 · 하늘 17가지 × 2): 13 → 34/34, 헛 알아챔 0. 판단 한 장 0.8 → 1.2ms(노드).
 * ⑤ 를 ①~④ 와 그대로 합치면 어두운 헛것이 늘었다(헛 알아챔 41 → 50, 던지기 전 13 → 18) — 어두운 궤적은 가운데 씨앗 · 세 이음부터
 * (step · confirmed), 공답게 멀어졌나는 씨앗과 같은 극성의 앞부분으로만(followedStrong) 보게 하자 알아챈 공 711/810, 헛 알아챔
 * 39(던지기 전 8), 던지지 않을 때 46번. 실내 보정 영상 18개의 60fps 되돌려 보기에서 ⑤ 는 알아챈 때 · 담은 장면 · 값을 한 글자도
 * 바꾸지 않았다.
 */

export type MeterStatus =
  /** 측정 안 함 */
  | 'idle'
  /** 배경을 준비한다(카메라가 멈추고 장면이 조금 쌓일 때까지) */
  | 'settling'
  /** 던지면 된다 */
  | 'armed'
  /** 던짐을 알아채 담는 중 */
  | 'capturing'
  /** 담은 것을 계산 중(finish() 를 기다린다) */
  | 'analyzing';

/** 한 장면 — 분석 해상도의 밝기(0~255). 카메라는 메모리를 아끼려 Uint8Array 로 준다 */
export type MeterFrame = { t: number; luma: ArrayLike<number> };

/** 공으로 알아챈 것(분석 픽셀) */
export type FoundBall = {
  /** 공이 처음 보인 장면의 시각(초) */
  t: number;
  /** 그 앞 장면의 시각 — 공이 아직 손에 있던 때 */
  prevT: number;
  /** 알아챌 때까지 이은 장면 수 − 1 */
  links: number;
  /** 첫 공까지의 거리(m, 가정한 초점거리로) */
  seedZ: number;
  /** 첫 공의 화면 자리 · 지름(분석 픽셀) */
  x: number;
  y: number;
  d: number;
  /** 알아챌 때까지 이은 공들(분석 픽셀) — 진단용 */
  path: { t: number; x: number; y: number; d: number }[];
  /** 첫 공이 계산의 씨앗 자리(validate.ts MAX_RELEASE_OFFSET_RATIO) 밖이었나 */
  offCenter?: boolean;
  /** 따라가 보니 공답게 멀어졌나(지름이 처음의 0.4배 밑까지, WATCH_STRONG_SHRINK) — 담기를 마칠 때 정한다 */
  strong?: boolean;
};

/** 계산할 일감 — 담은 장면들과 배경 장면들 */
export type CaptureJob = {
  id: number;
  /** 던짐을 알아챈 기준 시각(초) — 공으로 알아챘으면 공이 처음 보인 장면 */
  triggerT: number;
  /**
   * '담는 중'을 알린 장면의 시각(초) — 화면 스레드는 그 알림이 온 벽시계로 영상 클립 안의 던진 때(eventSec)를 잡는다. 그래서 클립
   * 시각 = eventSec + (장면 시각 − hitT). triggerT(공이 처음 보인 장면)는 그보다 2~3장 앞이라 그것으로 맞추면 결과 화면의 궤적이 공보다 늦는다.
   */
  hitT: number;
  /** 담은 장면(시간순) */
  frames: MeterFrame[];
  /** 던지기 전 장면들 — 배경 */
  backgroundSamples: ArrayLike<number>[];
  /** 담은 구간 안에서 배경으로 더 뽑을 장면 수(analyzeFrames inWindowBackground) */
  inWindowBackground: number;
  /** 장면 시각 간격의 중앙값으로 잰 초당 장면 수(모자라면 null) */
  fps: number | null;
  /** 공으로 알아챘으면 그 공 */
  ball: FoundBall | null;
  /** 카메라가 준 장면 시각의 질(고르게 펴기 전) — 실제 폰의 시각이 얼마나 흔들리고 장면이 빠지는지 되짚으려고 */
  timing: FrameTiming;
};

/** 장면 시각의 질 — 간격(ms)의 중앙값 · 표준편차 · 최대, 빠진 장면 수(간격이 중앙값의 1.5배 넘는 곳), 고르게 폈나 */
export type FrameTiming = {
  frames: number;
  medianGapMs: number | null;
  sdGapMs: number | null;
  maxGapMs: number | null;
  dropped: number;
  regularized: boolean;
};

function frameTiming(times: number[], regularized: boolean): FrameTiming {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) * 1000);
  if (!gaps.length)
    return {
      frames: times.length,
      medianGapMs: null,
      sdGapMs: null,
      maxGapMs: null,
      dropped: 0,
      regularized,
    };
  const sorted = [...gaps].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    frames: times.length,
    medianGapMs: r(med),
    sdGapMs: r(sd),
    maxGapMs: r(sorted[sorted.length - 1]),
    dropped: gaps.filter((g) => g > med * 1.5).length,
    regularized,
  };
}

export type MeterEvent =
  | { kind: 'status'; status: MeterStatus }
  /** 실제로 들어오는 초당 장면 수(최근 30장) — 화면에 보인다 */
  | { kind: 'fps'; fps: number }
  | { kind: 'capture'; job: CaptureJob };

export type MeterConfig = {
  /**
   * 던짐을 무엇으로 알아채나 — 'ball' 날아가는 공(기본, 투수 뒤), 'motion' 가운데가 밝아짐(1.6.0 까지 · 포수 뒤는 늘 이것 —
   * 다가오는 공은 실제 영상으로 확인하지 못했다)
   */
  trigger: 'ball' | 'motion';
  /** 초점거리(분석 픽셀) — 공 크기를 거리로 바꿀 때. 없으면 아이폰 영상 화각(59.8°)으로 */
  focalPx: number | null;
  /** 던짐 앞으로 담는 시간(초). 포수 뒤('motion')는 두 배 */
  preSec: number;
  /**
   * 공이 처음 보인 뒤 담는 시간(초) — 영상 파일의 분석 구간(공 앞 0.1초부터 1초, find-throw.ts)과 같게 0.9. 되돌려 보기에서
   * 0.6 이면 계산 배경(구간 안에서 고르게 뽑는 7장)이 공이 머무는 먼 쪽에 몰려 영상 파일 값과 최대 2.9km/h 달랐고, 0.9 면
   * 1.2km/h 안이었다.
   */
  postSec: number;
  /** 'motion' 의 던짐 뒤 담는 시간(초) — 1.6.0 그대로 */
  motionPostSec: number;
  /**
   * 거리 측정(엔진 2.0, analyze-distance.ts) — 공이 그물 · 미트에 닿고 튄 장면까지 있어야 끝 시각을 안다. 그래서 담은 장면을
   * 자르지 않고(analysisTailSec 무시), 120fps 넘게 오면 60fps 남짓으로 솎아 담는다(계산은 60fps 면 된다 — 메모리를 아낀다).
   * DISTANCE_METER_CONFIG 가 담는 시간도 늘린다.
   */
  distanceMode: boolean;
  /** 계산에는 공이 마지막으로 보인 뒤 이만큼(초)까지만 넘긴다(적어도 첫 공 뒤 analysisMinSec) — 배경은 담은 구간 전체에서 */
  analysisTailSec: number;
  analysisMinSec: number;
  /**
   * (실험 · 기본 끔) 공이 사라졌으면 계산할 장면의 끝(공이 마지막으로 보인 뒤 analysisTailSec, 적어도 첫 공 뒤 analysisMinSec)
   * 뒤 이만큼(초)에서 담기를 끝낸다. null 이면 postSec 를 다 채운다.
   *
   * 왜 끄나(2026-10-03, 되돌려 보기 60fps 18개): 0 이면 알아챔 → 일감이 0.87초에서 중앙 0.50초(0.30~0.83)로 줄지만, 계산 배경의
   * 구간 7장이 공 앞 0.12초 ~ 뒤 0.9초에서 고르게 뽑히던 것이 짧은 구간에 몰려 값이 바뀐다 — b3fb4050 108.6 → 105.3(−3.3),
   * eb05ae07 −1.2, af31e8d0 −0.8km/h, 스피드건 LOO 1.0 → 1.2km/h, 영상 파일 값과 최대 0.9 → 2.7km/h. 0.3 이어도 b3fb4050 −3.7 이라
   * 기다림을 줄이면서 값을 지킬 수 있는 자리가 없었다(영상 파일 엔진의 배경과 같은 모양이어야 보정 상수가 맞는다). 일찍 '먼저 보기'
   * 값을 보이고 0.9초 뒤 바꾸는 쓰임새를 위해 남겨 둔다.
   */
  goneEndSec: number | null;
  /** 담는 최대 장면 수 */
  maxFrames: number;
  /** 고리 버퍼 크기(장면) */
  ringSize: number;
  /** 결과를 낸 뒤 이 시간(초)은 다시 던진 것으로 보지 않는다 — 네트에서 튄 공 등 */
  cooldownSec: number;
  /** 계산 배경 — 공보다 0.15~1.2초 앞의 기록 장면 몇 장('ball') */
  historyBackground: number;
  /** 담은 구간 안에서 고르게 뽑아 배경에 보탤 장면 수(analyzeFrames 의 기본과 같은 7) */
  inWindowBackground: number;
  /* ── 'motion'(1.6.0) 의 문턱값 ── */
  /** 가운데 표적 상자 — 화면 가로 · 세로의 이 비율만큼 한가운데 */
  centerBoxRatio: number;
  /** 던지기 전 이만큼 연속으로 잠잠해야 배경을 만든다 */
  quietFrames: number;
  /** 앞 프레임과 견줘 가운데 평균 밝기 차가 이 밑이면 잠잠하다 */
  quietMeanDiff: number;
  /** 배경보다 이만큼 밝아진 픽셀을 '움직였다'로 센다(detect.ts 의 DIFF_THRESHOLD 와 같다) */
  moveThreshold: number;
  /** 가운데에서 움직인 픽셀이 이만큼 넘으면 던진 것으로 본다 */
  triggerMinPx: number;
  /** 상자의 이 비율 넘게 움직였으면 공이 아니라 몸 · 카메라가 움직인 것 */
  triggerMaxRatio: number;
  /** 배경으로 쥐는 잠잠한 장면 수 */
  quietSamples: number;
};

export const DEFAULT_METER_CONFIG: MeterConfig = {
  trigger: 'ball',
  focalPx: null,
  preSec: 0.12,
  postSec: 0.9,
  motionPostSec: 0.6,
  distanceMode: false,
  analysisTailSec: 0.2,
  analysisMinSec: 0.35,
  goneEndSec: null,
  maxFrames: 90,
  ringSize: 80,
  cooldownSec: 1.5,
  historyBackground: 3,
  inWindowBackground: 7,
  centerBoxRatio: 0.4,
  quietFrames: 12,
  quietMeanDiff: 2.0,
  moveThreshold: 28,
  triggerMinPx: 30,
  triggerMaxRatio: 0.35,
  quietSamples: 5,
};

/** 1.6.0 까지의 판단 그대로(되돌려 보기 · 견주기용) */
export const MOTION_METER_CONFIG: Partial<MeterConfig> = { trigger: 'motion' };

/**
 * 거리 측정(엔진 2.0)의 담기 — 공이 처음 보인 뒤 1.3초. 76km/h 공도 20m 그물에 닿고 튀는 장면까지 들어온다(1.0초 남짓 + 튄 뒤
 * 몇 장). 60fps 면 앞 0.12초와 합쳐 85장(1080 세로를 짧은 변 720 으로 줄인 밝기 판이면 78MB).
 */
export const DISTANCE_METER_CONFIG: Partial<MeterConfig> = { distanceMode: true, postSec: 1.3, maxFrames: 100 };

/** 초당 장면 수 — 장면 시각 간격의 중앙값(빠진 장면 · 두 번 온 장면에 휘둘리지 않게) */
export function fpsFromTimes(times: number[]): number | null {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    if (dt > 0) gaps.push(dt);
  }
  gaps.sort((a, b) => a - b);
  return gaps.length >= 3 ? 1 / gaps[Math.floor(gaps.length / 2)] : null;
}

/**
 * 장면 시각을 고르게 편다 — 카메라는 일정한 간격으로 찍지만 브라우저가 알려 주는 시각(mediaTime)은 몇 ms 씩 흔들릴 수 있다.
 * 간격의 중앙값으로 장면마다 번호(빠진 장면은 건너뛴 번호, 앞 장면에서 이어 센다)를 매기고 번호 → 시각을 직선으로 맞춘다. 맞춘 직선에서 가장 먼
 * 장면이 간격의 REGULAR_MAX_RESIDUAL 배 안이면 맞춘 시각을, 아니면(가변 fps · 멈칫) null(그대로 쓴다).
 *
 * 왜: 계산은 장면 시각으로 속도를 낸다. 되돌려 보기에서 시각을 ±3ms 흔들자 영상 파일 값과의 차이가 최대 1.6 → 3.7km/h 로
 * 커졌다. 파일은 장면 시각 표를 같은 방식으로 편다(video-fps.ts frameClock).
 */
const REGULAR_MAX_RESIDUAL = 0.3;
export function regularTimes(times: number[]): number[] | null {
  const n = times.length;
  if (n < 4) return null;
  const gaps: number[] = [];
  for (let i = 1; i < n; i++) gaps.push(times[i] - times[i - 1]);
  const sorted = gaps.filter((g) => g > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return null;
  /*
   * 번호를 매길 간격 후보 둘 — 간격의 중앙값, 그리고 처음 ~ 끝 시간 ÷ (장수 − 1). 중앙값은 장면이 빠져도 맞지만, 시각이
   * 타이머 눈금에 붙어 두 간격이 번갈아 오면(윈도 가짜 카메라 30fps: 31.25 · 46.9ms, 참 간격 33.3ms) 중앙값이 한쪽으로
   * 쏠려 46.9ms 를 두 칸으로 세고 맞춤이 무너졌다(브라우저 시험대, 2026-09-30). 둘 다 맞춰 보고 직선에서 가장 먼 장면이
   * 가까운 쪽을 쓴다 — 고른 카메라(되돌려 보기)에서는 둘이 같은 번호를 매겨 결과가 같다.
   */
  const medianGap = sorted[Math.floor(sorted.length / 2)];
  const spanGap = (times[n - 1] - times[0]) / (n - 1);
  let best: { out: number[]; worst: number } | null = null;
  for (const period of spanGap > 0 && Math.abs(spanGap - medianGap) > 1e-9
    ? [medianGap, spanGap]
    : [medianGap]) {
    const fit = fitGrid(times, period);
    if (fit && (!best || fit.worst < best.worst)) best = fit;
  }
  return best ? best.out : null;
}

/** 간격 period 로 장면 번호를 매기고(앞 장면에서 이어 센다) 번호 → 시각을 직선으로 맞춘다. 직선에서 먼 장면이 있으면 null */
function fitGrid(
  times: number[],
  period: number
): { out: number[]; worst: number } | null {
  const n = times.length;
  if (!(period > 0)) return null;
  /* 번호는 앞 장면에서 이어 센다 — 처음부터의 시간 ÷ 간격으로 세면 간격을 조금만 잘못 재도 뒤로 갈수록 번호가 밀린다 */
  const ks: number[] = [0];
  for (let i = 1; i < n; i++) {
    const step = Math.round((times[i] - times[i - 1]) / period);
    if (step < 1) return null;
    ks.push(ks[i - 1] + step);
  }
  let mk = 0;
  let mt = 0;
  for (let i = 0; i < n; i++) {
    mk += ks[i];
    mt += times[i];
  }
  mk /= n;
  mt /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (ks[i] - mk) * (times[i] - mt);
    den += (ks[i] - mk) ** 2;
  }
  if (!(den > 0)) return null;
  const b = num / den;
  const a = mt - b * mk;
  const out = ks.map((k) => a + b * k);
  let worst = 0;
  for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(out[i] - times[i]));
  /* 맞춘 간격(b) 기준으로 본다 — 후보 간격이 틀렸으면 번호가 어긋나 직선에서 멀어진다 */
  if (worst > REGULAR_MAX_RESIDUAL * b) return null;
  return { out, worst };
}

/* ───────────────────────── 공 찾기(반 해상도, 가운데 네모) ───────────────────────── */

/**
 * 공을 찾는 가운데 네모 — 짧은 변 절반의 이 비율이 가로 · 세로 반 길이(화면 밖으로는 안 나간다). 씨앗(0.45)보다 넓게 — 공은
 * 표적에서 나타나 소실점(미트) 쪽으로 옮겨 가는데, 알아채려면 그동안 세 장은 이 안에 있어야 한다.
 *
 * 1.7.0 은 0.6 정사각형이었다(실내 터널 영상은 카메라가 터널을 따라 놓여 공이 거의 제자리에서 작아졌다). 표적에 릴리스를 맞추느라
 * 폰을 올려 들면 공이 화면 아래(미트 쪽)로 빠르게 흐른다 — 카메라 1.2m · 릴리스 2.2m 앞이면 30fps 세 장째가 가운데에서 213px,
 * 1.3m 앞이면 60fps 두 장 만에 216px 를 넘어 이음이 끊겼다(야외 합성). 세로는 폰을 세우든 눕히든 땅과 하늘 방향이라 더 넓게 둔다
 * (눕힌 화면은 세로가 짧은 변이라 화면 끝까지).
 */
const WATCH_REGION_RATIO_X = 0.85;
const WATCH_REGION_RATIO_Y = 1.1;
/**
 * 씨앗이 될 수 있는 자리 — 짧은 변 절반의 이 비율 안. 계산(detect.ts trackBall · validate.ts)은 0.45 안에서만 공을 찾지만 판단은
 * 넓게 본다: 실내 보정 영상도 첫 공이 이미 가운데에서 150px(0.42) 떨어져 있었고(017af066 · b3fb4050), 그 위로 80px 만 더
 * 벗어나면 18개 가운데 9개, 150px 면 하나도 알아채지 못했다(되돌려 보기 shift). 화면의 표적 원(지름 112 CSS px)은 폭 390px
 * 폰에서 분석 픽셀 반지름 100px(0.29) 남짓이라 사용자가 맞춰도 이만큼은 벗어난다. 알아채면 공이 가운데로 들어온 뒤 장면으로
 * 재고, 끝내 안 들어오면 '릴리스가 화면 중앙에서 벗어났다'고 알린다(analyzeJob) — 아무 반응이 없는 것보다 무엇을 고칠지 안다.
 * 0.6 · 0.7 · 0.8 을 견줬다(되돌려 보기, 150px 위로 옮김 · 던지지 않음 12조건 4초씩): 잡은 수 5 · 15 · 15/18, 헛 알아챔
 * 37 · 44 · 56번(1.7.0 은 0/18 · 50번). 0.7 이 같은 수를 잡으며 헛것이 적다.
 */
const WATCH_SEED_RATIO = 0.7;
/** 이 비율(계산이 공을 찾는 자리와 같다) 밖에서 시작한 궤적은 증거를 더 본다(confirmed) */
const WATCH_INNER_SEED_RATIO = MAX_RELEASE_OFFSET_RATIO;
/**
 * 가운데 밖 씨앗은 이 거리(m) 넘게만 — 카메라 가까이 옆에 있는 것은 공이 아니라 투수의 글러브 · 몸이다(흰 글러브 조각이 1.17m ·
 * 0.57 자리에서 58 → 32px 로 멀어지며 걸렸다 — a3df7d09, 던지지 않을 때 다섯 조건에서). 릴리스는 카메라에서 1.5m 넘게 앞이다
 * (투수 바로 뒤에 둬도 몸 + 내딛는 걸음).
 */
const WATCH_OUTER_SEED_MIN_M = 1.4;
/**
 * 궤적이 화면에서 첫 지름의 이 배 안만 움직였으면 '제자리'로 보고 증거를 더 본다(confirmed). 실제 공은 가장 적게 움직인 것도
 * 0.25 배(89288ada), 헛것은 11px 에 2px(0.18 — 흔들리는 카메라의 테두리 조각)까지 봤다.
 */
const WATCH_STATIONARY_FRAC = 0.2;
/** 깊이가 곧게 느나(depthSteady) — 장면마다 직선에서 이만큼(m) 또는 지름 이만큼(칸)이 흔들린 깊이까지 */
const WATCH_DEPTH_TOL_M = 0.1;
const WATCH_DEPTH_TOL_D = 2;
/**
 * 공의 깊이 속도 범위(m/s) — 위는 find-throw.ts 와 같다. 아래는 알아챌 때 궤적 전체로 보는 값이라 계산이 받는 가장 느린 공
 * (validate.ts MIN_PLAUSIBLE_KMH 40km/h ≈ 11m/s)에 맞춘다 — 8 이면 제자리에서 크기만 1px 씩 흔들리는 밝은 점이 넘었다(거꾸로
 * 돌린 영상 7f8f2d15: 28 → 27 → 28 → 24px, 9.6m/s).
 */
const WATCH_MIN_DEPTH_MPS = 11;
const WATCH_MAX_DEPTH_MPS = 65;
/**
 * 옆 · 위아래 속도 상한(m/s) — 깊이 속도에 비례해 넓힌다.
 *
 * 공의 옆 속도는 카메라 시선과 비행 방향이 벌어진 각 θ 만큼이다(v·sinθ, 깊이 속도는 v·cosθ). 실내 터널 영상 18개는 카메라가
 * 터널을 따라 놓여 θ 가 몇 도뿐이라 릴리스 직후 0.1~4.3m/s 였고, 그래서 1.7.0 은 7m/s 로 좁혔다(30fps 에서 투수 몸 가장자리의
 * 점들을 이은 헛궤적 9.4~11.8m/s 를 막으려고 — b3fb4050). 그런데 화면 안내대로 릴리스 포인트를 한가운데 표적에 맞추면 삼각대가
 * 릴리스보다 낮은 만큼 폰을 올려 들어 θ 가 커진다 — 카메라 1.2m · 릴리스 1.85m · 2.2m 앞 · 팔 쪽 0.35m 면 22°, 110km/h 공이
 * 옆으로 11.5m/s 라 한 번도 알아채지 못했다(야외 합성, 2026-10-03). 그래서 상한을 깊이 속도의 WATCH_LATERAL_PER_DEPTH 배(θ 42°
 * 까지)로 넓히되 7m/s 밑으로는 줄이지 않고, WATCH_MAX_LATERAL_LINK_MPS 는 넘지 않는다. 헛궤적은 이제 크기가 장면마다 줄어야
 * 하고(strict) · 새로 나타나야 하고 · 깊이 속도 11m/s 이상 · 화면 속도가 줄어야(WATCH_SPEEDUP) 해서 이것 없이도 걸린다.
 */
const WATCH_MAX_LATERAL_MPS = 7;
const WATCH_LATERAL_PER_DEPTH = 0.9;
const WATCH_MAX_LATERAL_LINK_MPS = 30;
/**
 * 7m/s 넘게 옆으로 흐르는 궤적의 이음마다 옆 속도가 평균에서 벗어나도 되는 폭 — 이만큼(m/s) 또는 평균의 이 비율 가운데 큰 것.
 * 옆 자리는 (화면 자리 ÷ 지름)으로 재서 반 해상도 지름의 한 칸 흔들림이 가장자리(가운데에서 150px · 지름 13px)에서 이음 하나에
 * 4~5m/s 를 흔든다.
 */
const WATCH_LATERAL_TOL_MPS = 4;
const WATCH_LATERAL_TOL_REL = 0.4;
/** 옆으로 빠른(또는 가운데 밖) 궤적의 화면 걸음이 꺾여도 되는 각(°) — lateralSteady */
const WATCH_FAST_TURN_DEG = 45;
const WATCH_FAST_FIRST_TURN_DEG = 75;
/**
 * 씨앗의 거리 범위(m) — 가까운 쪽은 손 · 팔(detect.ts). 먼 쪽은 1.7.0 의 6.8(find-throw.ts SEED_MAX_M — 영상 파일의 거친 간격용)에서
 * 5.5 로: 보정 영상에 조건 46가지를 더해 흘린 진짜 공의 씨앗은 모두 4.6m 안(판단의 초점거리 69° 기준)이었고, 던지지 않을 때 걸린
 * 헛것 50번 가운데 17번이 5.7~6.8m(지름 10~12px — 흔들림 · 잎이 만든 테두리 조각)였다. 계산은 릴리스 4m 넘으면 어차피 거부한다
 * (validate.ts MAX_RELEASE_DISTANCE_M) — 30fps 에서 한 장 늦게 보인 공(+1m)까지 받게 둔다.
 */
const WATCH_SEED_MIN_M = 0.8;
const WATCH_SEED_MAX_M = 5.5;
/** 두 이음이면 첫 공이 이 거리(m) 안이어야 믿는다 — 먼 점 셋이 우연히 이어진 것을 거른다(find-throw.ts WEAK_SEED_MAX_M) */
const WATCH_WEAK_SEED_MAX_M = 4;
/**
 * 이음 사이 가장 긴 시간 — 장면 간격의 WATCH_MAX_LINK_PERIODS 배(한 장까지 놓쳐도 이어지게), 그리고 WATCH_MAX_LINK_SEC(초)
 * 넘게는 안 된다. 60fps 에서 세 장을 건너뛰어 이은 헛궤적(투수 몸 가장자리의 점들)이 공으로 믿겼다(b3fb4050 · f43a7958).
 */
const WATCH_MAX_LINK_PERIODS = 2.5;
const WATCH_MAX_LINK_SEC = 0.07;
/**
 * 그래도 이음은 적어도 장면 간격의 이 배는 준다 — 15fps 밑(간격 0.067초 넘게)에서는 WATCH_MAX_LINK_SEC 가 바로 옆 장면끼리의
 * 이음까지 막아 공을 영영 못 알아챘다(사용자 규칙: 어떤 촬영 조건에서도 값을 보인다, 2026-09-30). 15fps 이상은 이 값이 안
 * 걸려 되돌려 보기 결과가 그대로다.
 */
const WATCH_MIN_LINK_PERIODS = 1.3;

/** 이음 사이 가장 긴 시간(초) — 장면 간격 period(초)에 따라 */
function maxLinkSec(period: number): number {
  return Math.max(
    Math.min(WATCH_MAX_LINK_SEC, WATCH_MAX_LINK_PERIODS * period),
    WATCH_MIN_LINK_PERIODS * period
  );
}
/**
 * 공은 화면에서 한 방향(소실점 쪽)으로 매끄럽게 옮겨 간다. 두 이음의 화면 이동이 둘 다 이만큼(분석 px) 넘는데 방향이
 * 90° 넘게 꺾이면 공이 아니다 — 투수 몸 가장자리에서 위아래로 튀던 헛궤적(716 → 676 → 762)을 막는다.
 */
const WATCH_TURN_MIN_PX = 3;
/**
 * 화면 속도가 늘면 안 된다 — 곧게 멀어지는 공의 화면 속도는 F·|v⊥·Z − X·vz| / Z² 라 Z 가 커지면 줄기만 한다(공기저항 · 중력으로도
 * 안 는다). 앞 이음의 화면 속도 × WATCH_SPEEDUP + 덩어리 중심 흔들림(반 해상도 한 칸 = 2px 남짓, 손에 붙은 첫 장면은 지름의
 * 1/4 까지 끌린다)까지 받는다. 옆 속도 상한을 넓히며 넣었다 — 이음 하나가 더 멀리 닿으니 화면에서 들쭉날쭉 뛰는 점들을
 * 이을 수 있다.
 */
const WATCH_SPEEDUP = 1.6;
const WATCH_SPEEDUP_MARGIN_PX = 3;
const WATCH_SPEEDUP_MARGIN_D = 0.25;
/** 이만큼(분석 px) 안 움직이고 지름도 1px 안에서 같으면 머무는 것 — 알아채기 전 궤적에는 잇지 않는다 */
const WATCH_STILL_PX = 1.5;
/**
 * 한 이음에서 커져도 되는 비율. 90fps 까지는 알아채기 전 궤적이 이음마다 작아져야 한다(같아도 안 된다) — 릴리스 직후의 공은
 * 60fps 한 장에 10~25%(30fps 면 그 두 배) 작아져 반 해상도 지름의 1px 흔들림보다 훨씬 크고, 크기만 흔들리는 점(20 → 21 → 20 ·
 * 12 → 12 → 12 → 11)은 여기서 걸린다.
 * 그보다 빠른 카메라(120~240fps)는 한 장에 2~5% 만 작아져 1px 흔들림에 묻히므로 8% 까지 봐준다.
 */
const WATCH_GROW_TOL = 1.08;
const WATCH_STRICT_GROW_MAX_FPS = 90;
/** 씨앗 — 지난 이만큼(장)의 장면에 같은 자리 · 비슷한 크기로 있었으면 새로 나타난 것이 아니다(깜박이는 점) */
const WATCH_NEW_LOOKBACK = 3;
/** 알아채려면 공이 적어도 이만큼(초) 이어져야 한다 — 240fps 의 세 장(8ms)으로는 물리를 못 믿는다 */
const WATCH_MIN_CONFIRM_SEC = 0.03;
/** 덩어리 모양 — find-throw.ts 와 같다(반 해상도) */
const WATCH_MIN_PIXELS = 6;
const WATCH_MIN_ASPECT = 0.55;
const WATCH_MAX_ASPECT = 1.8;
const WATCH_MIN_FILL = 0.45;
/**
 * 장면마다 이을 덩어리는 큰 것부터 이만큼까지. 1.7.0 은 40 이었는데 찾는 네모를 넓히자 카메라가 흔들리는 장면(±6px 3Hz)에서
 * 테두리 조각이 40개를 넘겨 작은 공이 빠졌다(7f8f2d15, 되돌려 보기 sway). 이음은 덩어리 수에 비례해 늘 뿐이라(궤적 60 × 80) 넉넉히.
 */
const WATCH_MAX_CANDIDATES = 80;
/** 앞 장면의 같은 자리(지름의 이 비율 안) · 같은 크기(이 비율 안)에 있던 덩어리는 머무는 것 — 씨앗이 아니다 */
const WATCH_STATIC_POS = 0.25;
const WATCH_STATIC_SIZE = 0.15;
/** 공이 사라졌다고 볼 때 — 이음 없이 이만큼(초) 지났거나 지름이 이 밑(분석 px, 원본 9px 이면 6px) */
const WATCH_GONE_SEC = 0.1;
const WATCH_GONE_D = 6;
/** 따라간 것을 공으로 믿을 만큼 줄었나 — 처음 지름의 이 배 밑까지(followedStrong) */
const WATCH_STRONG_SHRINK = 0.4;
/** 따라가는 것이 이만큼(초) 더 작아지지 않으면 사라진 것으로 본다(follow) */
const WATCH_STALL_SEC = 0.15;
/**
 * 진짜 공은 이 시간(초) 안에 공답게 멀어진다(WATCH_STRONG_SHRINK) — 40km/h(11m/s) 공도 2m 에서 0.27초면 거리가 2.5배다. 넘도록
 * 아니면 놓고 다시 찾는다(captureBall). 흰 글러브 조각이 40 → 34 → 32 → 30px 로 조금씩 작아지며 따라가지는 동안 0.67초 뒤의
 * 진짜 공을 놓쳤다(a3df7d09 에 장면 빠짐 · 잎 · 지나가는 사람을 더해 흘림).
 */
const WATCH_STRONG_WITHIN_SEC = 0.3;
/** 공답게 멀어졌나(followedStrong)의 곧은 깊이 폭 — 이만큼(m) 또는 지름 이만큼(칸)이 흔들린 깊이까지 */
const WATCH_STRONG_DEPTH_TOL_M = 0.25;
const WATCH_STRONG_DEPTH_TOL_D = 3;

/** 덩어리 — dark: 배경보다 어두워져 잡힌 것(밝은 배경 앞, 어두워짐 따로 잇기) */
type WatchBlob = { x: number; y: number; d: number; px: number; dark?: boolean };
type WatchPoint = { t: number; x: number; y: number; d: number; dark?: boolean };

/** a → b 사이 공의 옆 · 위아래 이동(m) — 화면 자리 ÷ 지름 × 공 지름(초점거리와 상관없다) */
function lateralShiftM(a: WatchPoint, b: WatchPoint, cx: number, cy: number): number {
  const lx = ((b.x - cx) / b.d - (a.x - cx) / a.d) * BALL_DIAMETER_M;
  const ly = ((b.y - cy) / b.d - (a.y - cy) / a.d) * BALL_DIAMETER_M;
  return Math.hypot(lx, ly);
}

/** 깊이 속도 vz(m/s)에서 받는 옆 속도 상한(m/s) — WATCH_MAX_LATERAL_MPS 참고 */
function lateralCap(vz: number): number {
  return Math.min(
    WATCH_MAX_LATERAL_LINK_MPS,
    Math.max(WATCH_MAX_LATERAL_MPS, WATCH_LATERAL_PER_DEPTH * vz)
  );
}

/**
 * 가운데 네모를 반 해상도로 줄여 배경(중앙값)보다 밝은(가만한 밝은 배경 앞이면 어두운) 둥근 덩어리를 찾고, 장면마다 멀어지는 공으로
 * 잇는다.
 * 계산은 장면마다 2ms 안팎(세로 화면 306×396 반 해상도 픽셀 — 1.7.0 의 216×216 보다 2.6배) — 카메라 한 장 사이(60fps 16.7ms)에
 * 넉넉하다.
 */
class BallWatch {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  private readonly width: number;
  /** 초점거리 × 공 지름(분석 px · m) — 거리 z = k / 지름. 렌즈 보정 · 화각이 바뀌면 LiveMeter.setFocalPx 가 고친다 */
  k: number;
  private readonly cx: number;
  private readonly cy: number;
  private readonly halfShort: number;
  private bg: Float32Array | null = null;
  private spread: Float32Array | null = null;
  private prevBlobs: WatchBlob[][] = [];
  private chains: WatchPoint[][] = [];
  private followed: WatchPoint[] | null = null;
  private readonly mask: Uint8Array;
  private readonly stack: Int32Array;
  private readonly scratch: Float32Array;
  private readonly hist = new Int32Array(511);

  constructor(width: number, height: number, focalPx: number) {
    this.width = width;
    const short = Math.min(width, height);
    /* 반 해상도 가로 · 세로 = 분석 해상도 네모(2·반 길이)의 절반 */
    const halfW = Math.floor(Math.min(width / 2, (short / 2) * WATCH_REGION_RATIO_X));
    const halfH = Math.floor(Math.min(height / 2, (short / 2) * WATCH_REGION_RATIO_Y));
    this.w = halfW;
    this.h = halfH;
    this.x0 = Math.floor(width / 2) - halfW;
    this.y0 = Math.floor(height / 2) - halfH;
    this.k = focalPx * BALL_DIAMETER_M;
    this.cx = width / 2;
    this.cy = height / 2;
    this.halfShort = short / 2;
    this.mask = new Uint8Array(this.w * this.h);
    this.stack = new Int32Array(this.w * this.h);
    this.scratch = new Float32Array(this.w * this.h);
  }

  /** 가운데 네모를 2×2 평균으로 줄인다 */
  region(luma: ArrayLike<number>, into?: Float32Array): Float32Array {
    const { w, h, x0, y0 } = this;
    const out = into ?? new Float32Array(w * h);
    const W = this.width;
    for (let j = 0; j < h; j++) {
      const r0 = (y0 + 2 * j) * W + x0;
      const r1 = r0 + W;
      const o = j * w;
      for (let i = 0; i < w; i++) {
        const a = r0 + 2 * i;
        const b = r1 + 2 * i;
        out[o + i] = (luma[a] + luma[a + 1] + luma[b] + luma[b + 1]) * 0.25;
      }
    }
    return out;
  }

  /**
   * 이번 장면의 네모(region)를 늘 같은 판에 — 장면마다 새 판(세로 화면 0.5MB)을 만들면 쓰레기 치우기가 잦아진다. 쥐어 둘 때(기록 ·
   * 배경)는 복사한다(LiveMeter.record).
   */
  regionNow(luma: ArrayLike<number>): Float32Array {
    return this.region(luma, this.scratch);
  }

  hasBackground(): boolean {
    return this.bg != null;
  }

  /**
   * 배경 = 픽셀마다 장면들의 중앙값 — 잠깐 지나간 팔 · 글러브 · 공은 빠지고, 오래 있는 것만 남는다. 그 자리가 스스로 밝기를 바꾸는
   * 폭('두 번째로 밝은 값 − 중앙값')도 같이 둔다 — 어두워짐은 폭이 작은(가만한) 밝은 배경에서만 본다(detect.ts DARK_MAX_SPREAD).
   */
  setBackground(regions: Float32Array[]) {
    const m = regions.length;
    if (!m) return;
    const n = this.w * this.h;
    const bg = new Float32Array(n);
    const spread = new Float32Array(n);
    if (m === 7) {
      /*
       * 늘 쓰는 7장은 정렬 그물(13번 견주기, Devillard opt_med7)로 — 넓힌 네모에서 삽입 정렬이 0.25초마다 몇 ms 씩 걸렸다. 값은 같다.
       * 그물은 가운데 값만 맞춰 주므로 흔들림 폭에 쓸 두 번째로 밝은 값은 따로 센다(같은 값이 둘이면 그 값 — 정렬한 bucket[5] 와 같다).
       */
      const [r0, r1, r2, r3, r4, r5, r6] = regions;
      for (let p = 0; p < n; p++) {
        let a = r0[p];
        let b = r1[p];
        let c = r2[p];
        let d = r3[p];
        let e = r4[p];
        let f = r5[p];
        let g = r6[p];
        let hi = a;
        let hi2 = -Infinity;
        for (let s = 1; s < 7; s++) {
          const v = regions[s][p];
          if (v > hi) {
            hi2 = hi;
            hi = v;
          } else if (v > hi2) hi2 = v;
        }
        let t: number;
        if (a > f) {
          t = a;
          a = f;
          f = t;
        }
        if (a > d) {
          t = a;
          a = d;
          d = t;
        }
        if (b > g) {
          t = b;
          b = g;
          g = t;
        }
        if (c > e) {
          t = c;
          c = e;
          e = t;
        }
        if (a > b) {
          t = a;
          a = b;
          b = t;
        }
        if (d > f) {
          t = d;
          d = f;
          f = t;
        }
        if (c > g) {
          t = c;
          c = g;
          g = t;
        }
        if (c > d) {
          t = c;
          c = d;
          d = t;
        }
        if (d > g) {
          t = d;
          d = g;
          g = t;
        }
        if (e > f) {
          t = e;
          e = f;
          f = t;
        }
        if (b > e) {
          t = b;
          b = e;
          e = t;
        }
        if (b > d) {
          t = b;
          b = d;
          d = t;
        }
        if (d > e) {
          t = d;
          d = e;
          e = t;
        }
        bg[p] = d;
        spread[p] = hi2 - d;
      }
      this.bg = bg;
      this.spread = spread;
      return;
    }
    const bucket = new Float32Array(m);
    for (let p = 0; p < n; p++) {
      for (let s = 0; s < m; s++) {
        const v = regions[s][p];
        let j = s - 1;
        while (j >= 0 && bucket[j] > v) {
          bucket[j + 1] = bucket[j];
          j--;
        }
        bucket[j + 1] = v;
      }
      bg[p] = bucket[m >> 1];
      spread[p] = m >= 3 ? bucket[m - 2] - bucket[m >> 1] : 0;
    }
    this.bg = bg;
    this.spread = spread;
  }

  reset() {
    this.bg = null;
    this.spread = null;
    this.prevBlobs = [];
    this.chains = [];
    this.followed = null;
  }

  /** 배경보다 밝은(밝은 배경 앞이면 어두운) 둥근 덩어리(분석 픽셀 좌표) */
  private blobs(reg: Float32Array): WatchBlob[] {
    const bg = this.bg;
    if (!bg) return [];
    const { w, h, mask, hist } = this;
    const n = w * h;
    /* 자동 노출 — 성기게 짚은 (밝기 − 배경)의 중앙값(find-throw.ts 와 같다) */
    hist.fill(0);
    let count = 0;
    for (let p = 0; p < n; p += 13) {
      const d = Math.round(reg[p] - bg[p]);
      hist[Math.max(-255, Math.min(255, d)) + 255]++;
      count++;
    }
    let acc = 0;
    let median = 0;
    for (let q = 0; q < hist.length; q++) {
      acc += hist[q];
      if (acc * 2 >= count) {
        median = q - 255;
        break;
      }
    }
    const threshold = DIFF_THRESHOLD + median;
    /*
     * 밝은 배경(하늘) 앞의 어두운 공도 — 배경(중앙값)이 DARK_MIN_BACKGROUND 이상이고 가만한(DARK_MAX_SPREAD) 자리에서
     * DARK_THRESHOLD 넘게 어두워진 곳(detect.ts '밝은 배경'). 밖에서 투수 뒤로 찍으면 공이 하늘 앞에서 출발해, 밝아진 곳만 보면
     * 공을 영영 못 알아챈다. 배경이 이미 중앙값이라 어두운 공이 머문 자리도 배경이 공이 되지 않는다.
     *
     * 밝아진 곳(1)과 어두워진 곳(3)은 따로 잇는다 — 합쳐 이으면 실내 보정 영상에서 투수 손(밝음)에 밝은 바닥 앞의 팔(어두움)이
     * 붙어 덩어리가 커지고, 그 '커진 손'이 다음 장면의 손과 '작아지는' 이음이 돼 한 장 먼저 알아챘다(9f3f2654, 값 75.8 → 76.1).
     * 따로 이으면 밝은 덩어리는 예전과 한 픽셀도 다르지 않다. 지평선에 걸친 공은 반원 둘로 갈려 그 장면에서는 못 잇지만,
     * 알아채기는 릴리스 직후 몇 장(공이 한쪽 배경 앞에 있을 때)이면 된다 — 계산(analyze-frames 두 번째 길)은 합쳐 잇는다.
     */
    const darkTh = median - DARK_THRESHOLD;
    const spread = this.spread;
    /*
     * 켜진 픽셀의 처음 · 끝 자리(밝아짐 · 어두워짐 따로) — 덩어리 찾기는 그 사이만 훑는다(같은 덩어리 · 같은 차례). 어두워진 곳이
     * 없으면(실내는 대개) 건너뛴다 — 어두워짐을 더하며 장면마다 판을 한 번 더 훑던 몫(판단 한 장 +0.6ms, 노드)을 줄인다.
     */
    let b0 = 0;
    let b1 = -1;
    let d0 = 0;
    let d1 = -1;
    for (let p = 0; p < n; p++) {
      const d = reg[p] - bg[p];
      if (d > threshold) {
        mask[p] = 1;
        if (b1 < 0) b0 = p;
        b1 = p;
      } else if (
        d < darkTh &&
        spread != null &&
        bg[p] >= DARK_MIN_BACKGROUND &&
        spread[p] <= DARK_MAX_SPREAD
      ) {
        mask[p] = 3;
        if (d1 < 0) d0 = p;
        d1 = p;
      } else mask[p] = 0;
    }
    const out = this.fill(1, b0, b1);
    if (out.length > WATCH_MAX_CANDIDATES) {
      out.sort((a, b) => b.px - a.px);
      out.length = WATCH_MAX_CANDIDATES;
    }
    if (d1 < 0) return out;
    const dark = this.fill(3, d0, d1);
    for (const b of dark) b.dark = true;
    if (dark.length > WATCH_MAX_CANDIDATES) {
      dark.sort((a, b) => b.px - a.px);
      dark.length = WATCH_MAX_CANDIDATES;
    }
    return dark.length ? out.concat(dark) : out;
  }

  /** mask 에서 값이 cls 인 픽셀끼리 이은 둥근 덩어리(분석 픽셀 좌표) — 지난 픽셀은 cls + 1 로 표시. from ~ to 는 cls 픽셀이 있는 자리 */
  private fill(cls: number, from: number, to: number): WatchBlob[] {
    const { w, h, mask, stack } = this;
    const seen = cls + 1;
    const out: WatchBlob[] = [];
    for (let start = from; start <= to; start++) {
      if (mask[start] !== cls) continue;
      let top = 0;
      stack[top++] = start;
      mask[start] = seen;
      let px = 0;
      let sx = 0;
      let sy = 0;
      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;
      while (top > 0) {
        const p = stack[--top];
        const x = p % w;
        const y = (p - x) / w;
        px++;
        sx += x;
        sy += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > 0 && mask[p - 1] === cls) {
          mask[p - 1] = seen;
          stack[top++] = p - 1;
        }
        if (x < w - 1 && mask[p + 1] === cls) {
          mask[p + 1] = seen;
          stack[top++] = p + 1;
        }
        if (y > 0 && mask[p - w] === cls) {
          mask[p - w] = seen;
          stack[top++] = p - w;
        }
        if (y < h - 1 && mask[p + w] === cls) {
          mask[p + w] = seen;
          stack[top++] = p + w;
        }
      }
      if (px < WATCH_MIN_PIXELS) continue;
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (bw / bh < WATCH_MIN_ASPECT || bw / bh > WATCH_MAX_ASPECT) continue;
      if (px / (bw * bh) < WATCH_MIN_FILL) continue;
      out.push({
        x: this.x0 + 2 * (sx / px) + 0.5,
        y: this.y0 + 2 * (sy / px) + 0.5,
        d: bw + bh, // 반 해상도 (가로 + 세로) / 2 × 2
        px,
      });
    }
    return out;
  }

  /** a → b 가 멀어지는 공 한 걸음으로 가능한가 */
  private linkOk(
    a: WatchPoint,
    b: WatchPoint,
    maxDt: number,
    before: WatchPoint | null,
    strict: boolean,
    period: number
  ): boolean {
    const dt = b.t - a.t;
    if (!(dt > 0) || dt > maxDt) return false;
    if (b.d > a.d * WATCH_GROW_TOL) return false;
    if (strict) {
      /*
       * 알아채기 전 궤적은 한 극성으로만 — 어두워진 덩어리(밝은 배경 앞)와 밝아진 덩어리를 잇지 않는다. 실내 보정 영상에서 밝은
       * 바닥 앞을 지나는 투수 손(어두움, 59 → 58px)에서 막 놓은 공(밝음, 37px)으로 이어 릴리스 0.036초 전에 알아챘다(f43a7958 ·
       * d931be81). 공이 지평선을 넘는 것은 날아가는 도중이라, 알아챈 뒤 따라가기(follow)는 두 극성을 다 잇는다.
       */
      if (!!a.dark !== !!b.dark) return false;
      if (b.d >= a.d && period >= 1 / WATCH_STRICT_GROW_MAX_FPS) return false;
      const mx = b.x - a.x;
      const my = b.y - a.y;
      if (Math.hypot(mx, my) < WATCH_STILL_PX && Math.abs(b.d - a.d) < 1) return false;
      if (before) {
        const ux = a.x - before.x;
        const uy = a.y - before.y;
        const prev = Math.hypot(ux, uy);
        const step = Math.hypot(mx, my);
        if (
          prev >= WATCH_TURN_MIN_PX &&
          step >= WATCH_TURN_MIN_PX &&
          ux * mx + uy * my < 0
        )
          return false;
        /* 멀어지는 공의 화면 속도는 1/Z² 로 줄기만 한다 — 앞 이음보다 크게 빨라지면 공이 아니다 */
        const prevDt = a.t - before.t;
        if (
          prevDt > 0 &&
          step >
            WATCH_SPEEDUP * prev * (dt / prevDt) +
              WATCH_SPEEDUP_MARGIN_PX +
              WATCH_SPEEDUP_MARGIN_D * a.d
        )
          return false;
      }
    }
    const vz = (this.k / b.d - this.k / a.d) / dt;
    if (vz > WATCH_MAX_DEPTH_MPS) return false;
    return lateralShiftM(a, b, this.cx, this.cy) / dt <= lateralCap(vz);
  }

  /** 이어진 궤적을 공으로 믿나 — 적어도 WATCH_MIN_CONFIRM_SEC 동안 두 이음 이상, 전체 깊이 속도가 공답게 */
  private confirmed(chain: WatchPoint[]): boolean {
    const links = chain.length - 1;
    if (links < 2) return false;
    const a = chain[0];
    const b = chain[chain.length - 1];
    const dt = b.t - a.t;
    if (dt < WATCH_MIN_CONFIRM_SEC) return false;
    const vz = (this.k / b.d - this.k / a.d) / dt;
    if (vz < WATCH_MIN_DEPTH_MPS || vz > WATCH_MAX_DEPTH_MPS) return false;
    /* 옆 속도도 궤적 전체로 한 번 더 — 이음 하나보다 길게 재서 덜 흔들린다 */
    if (lateralShiftM(a, b, this.cx, this.cy) / dt > lateralCap(vz)) return false;
    /*
     * 가운데(WATCH_INNER_SEED_RATIO) 밖에서 시작한 궤적은 증거를 더 본다 — 세 이음 이상, 옆 속도 · 깊이 속도가 고르다. 거기는
     * 투수의 글러브 · 팔이 걸리는 자리다: 흰 글러브가 앞으로 나가며 쪼개진 조각들(58 → 40 → 34px)이 두 이음만으로는 16 · 18m/s 로
     * 멀어지는 공처럼 보였다(a3df7d09, 릴리스 0.7초 전).
     */
    const outer =
      Math.hypot(a.x - this.cx, a.y - this.cy) / this.halfShort >
      WATCH_INNER_SEED_RATIO;
    if (outer && (links < 3 || !this.depthSteady(chain))) return false;
    /*
     * 화면에서 거의 안 움직이며 작아지기만 한 궤적도 증거를 더 본다(네 이음 · 깊이가 곧게). 시선과 비행선이 딱 맞으면 공도
     * 제자리에서 작아지지만, 실제 영상 18개의 공은 두 이음 동안 첫 지름의 0.25배(89288ada, 34px 에 8.6px) 넘게 움직였다. 제자리에서
     * 크기만 줄어 보이는 것은 대개 흔들리는 카메라 · 반짝이는 잎이 만든 테두리 조각이나 글러브 무늬다(9f3f2654 를 0.8배로 줄여
     * 흘리자 14 → 13 → 11px 이 2px 움직이며 릴리스 0.34초 전에 걸렸다).
     */
    if (
      Math.hypot(b.x - a.x, b.y - a.y) < WATCH_STATIONARY_FRAC * a.d &&
      (links < 4 || !this.depthSteady(chain))
    )
      return false;
    if (!this.lateralSteady(chain, outer)) return false;
    /*
     * 어두운 궤적(밝은 배경 앞, 알아채기 전에는 한 극성만 잇는다)은 두 이음 약한 씨앗 규칙(가까우면 두 이음으로 믿음)을 쓰지 않는다 —
     * 세 이음부터. 넓힌 판단(씨앗 자리 · 옆 속도 · 다시 찾기)과 어두워짐 감지를 합치자 실내 보정 영상을 흐리게 · 밝게 눌러 흘린
     * 되돌려 보기에서 어두운 헛것이 늘었는데(던진 뒤 그물 · 흰 천의 그늘, 던지기 전 몸 그늘 — 45조건 헛 알아챔 41 → 50), 그 대부분이
     * 두 이음이었다(017a · 675d bright=0.2, 3be4 · 675d lowc, 3be4 scale=0.8, 7f8f shake=4). 진짜 어두운 공(흰 천 앞의 3be4 · 675d,
     * 하늘 앞 합성 공)은 세 이음 넘게 이어졌다 — 알아채는 때만 한 장 늦고 공이 처음 보인 장면(ball.t)은 그대로다.
     */
    if (a.dark) return links >= 3;
    return links >= 3 || this.k / a.d <= WATCH_WEAK_SEED_MAX_M;
  }

  /**
   * 깊이(z = k / 지름)가 시간에 곧게 느나 — 곧게 날아가는 공은 0.1초 남짓 동안 깊이 속도가 거의 같다(공기저항 2%). 장면마다
   * 직선에서 벗어난 것이 WATCH_DEPTH_TOL_M 또는 지름 WATCH_DEPTH_TOL_D 칸이 흔들린 만큼(z·칸/지름) 안이어야 한다.
   */
  private depthSteady(
    chain: WatchPoint[],
    tolM = WATCH_DEPTH_TOL_M,
    tolD = WATCH_DEPTH_TOL_D
  ): boolean {
    const n = chain.length;
    const zs = chain.map((p) => this.k / p.d);
    const ts = chain.map((p) => p.t);
    const mt = ts.reduce((s, v) => s + v, 0) / n;
    const mz = zs.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (ts[i] - mt) * (zs[i] - mz);
      den += (ts[i] - mt) ** 2;
    }
    if (!(den > 0)) return false;
    const slope = num / den;
    return chain.every(
      (p, i) =>
        Math.abs(zs[i] - (mz + slope * (ts[i] - mt))) <=
        Math.max(tolM, (tolD * zs[i]) / p.d)
    );
  }

  /**
   * 옆으로 빠르게(WATCH_MAX_LATERAL_MPS 넘게) 흐르는 궤적은 증거를 더 본다 — 세 이음 이상이고, 이음마다의 옆 속도(벡터)가 고르다.
   * 곧게 날아가는 공의 옆 속도(m/s)는 시선과 벌어진 각 그대로라 장면마다 같다(공기저항은 0.1초에 2% 남짓). 상한을 넓혔더니
   * 던지기 전 글러브의 두 조각(19px → 13px, 65px 떨어짐 — 크기 차로 깊이 50m/s 라 옆 17m/s 도 받아짐)과 그 자리에 머문 조각이
   * 공으로 이어졌다(f43a7958, 릴리스 0.52초 전). 7m/s 안의 궤적은 1.7.0 그대로다. always 면 느려도 본다(가운데 밖 궤적).
   *
   * 화면의 길도 곧아야 한다 — 3차원의 곧은 선은 화면에서도 곧은 선이다. 이웃한 두 걸음(둘 다 WATCH_TURN_MIN_PX 넘게)의 방향이
   * WATCH_FAST_TURN_DEG 넘게 꺾이면 공이 아니다(첫 걸음은 손에 붙은 첫 장면이 지름의 1/4 까지 끌려 WATCH_FAST_FIRST_TURN_DEG).
   * 던지는 팔이 호를 그리며 내려오는 조각들(211,676/16 → 166,771/13 → 141,792/10 → 131,781/8 — 옆 21m/s · 깊이 29m/s, 이음마다
   * 옆 속도도 고르다)이 b3fb4050 의 릴리스 0.34초 전에 걸렸는데, 걸음 방향이 115° → 140° → 228° 로 돌았다.
   */
  private lateralSteady(chain: WatchPoint[], always = false): boolean {
    const vs: [number, number][] = [];
    let fast = always;
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1];
      const b = chain[i];
      const dt = b.t - a.t;
      const vx =
        (((b.x - this.cx) / b.d - (a.x - this.cx) / a.d) * BALL_DIAMETER_M) / dt;
      const vy =
        (((b.y - this.cy) / b.d - (a.y - this.cy) / a.d) * BALL_DIAMETER_M) / dt;
      vs.push([vx, vy]);
      if (Math.hypot(vx, vy) > WATCH_MAX_LATERAL_MPS) fast = true;
    }
    if (!fast) return true;
    if (vs.length < 3) return false;
    const mx = vs.reduce((s, v) => s + v[0], 0) / vs.length;
    const my = vs.reduce((s, v) => s + v[1], 0) / vs.length;
    const tol = Math.max(
      WATCH_LATERAL_TOL_MPS,
      WATCH_LATERAL_TOL_REL * Math.hypot(mx, my)
    );
    if (!vs.every((v) => Math.hypot(v[0] - mx, v[1] - my) <= tol)) return false;
    for (let i = 2; i < chain.length; i++) {
      const ux = chain[i - 1].x - chain[i - 2].x;
      const uy = chain[i - 1].y - chain[i - 2].y;
      const wx = chain[i].x - chain[i - 1].x;
      const wy = chain[i].y - chain[i - 1].y;
      const lu = Math.hypot(ux, uy);
      const lw = Math.hypot(wx, wy);
      if (lu < WATCH_TURN_MIN_PX || lw < WATCH_TURN_MIN_PX) continue;
      const limit = i === 2 ? WATCH_FAST_FIRST_TURN_DEG : WATCH_FAST_TURN_DEG;
      if ((ux * wx + uy * wy) / (lu * lw) < Math.cos((limit * Math.PI) / 180))
        return false;
    }
    return true;
  }

  private bestLink(
    chain: WatchPoint[],
    blobs: WatchBlob[],
    t: number,
    maxDt: number,
    strict: boolean,
    period: number
  ): WatchPoint | null {
    const last = chain[chain.length - 1];
    const before = chain.length >= 2 ? chain[chain.length - 2] : null;
    let best: WatchPoint | null = null;
    let cost = Infinity;
    for (const b of blobs) {
      const p: WatchPoint = b.dark
        ? { t, x: b.x, y: b.y, d: b.d, dark: true }
        : { t, x: b.x, y: b.y, d: b.d };
      if (!this.linkOk(last, p, maxDt, before, strict, period)) continue;
      const c = Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, last.d);
      if (c < cost) {
        cost = c;
        best = p;
      }
    }
    return best;
  }

  /**
   * 장면 하나를 본다. 공으로 믿을 궤적이 생기면 그 궤적을 돌려주고 그것만 따라간다(follow).
   * @param period 장면 간격(초) — 이음 사이 시간의 상한을 정한다
   */
  step(t: number, reg: Float32Array, period: number): WatchPoint[] | null {
    const blobs = this.blobs(reg);
    const maxDt = maxLinkSec(period);
    /* 1) 이어 가기 — 오래 끊긴 궤적은 버린다 */
    const next: WatchPoint[][] = [];
    let found: WatchPoint[] | null = null;
    for (const chain of this.chains) {
      const last = chain[chain.length - 1];
      if (t - last.t > maxDt) continue;
      const p = this.bestLink(chain, blobs, t, maxDt, true, period);
      const c = p ? [...chain, p] : chain;
      next.push(c);
      if (p && !found && this.confirmed(c)) found = c;
    }
    /* 2) 씨앗 — 가운데 근처에 새로 나타난, 릴리스 거리의 크기인 덩어리 */
    for (const b of blobs) {
      const off = Math.hypot(b.x - this.cx, b.y - this.cy) / this.halfShort;
      if (off > WATCH_SEED_RATIO) continue;
      const z = this.k / b.d;
      if (z < WATCH_SEED_MIN_M || z > WATCH_SEED_MAX_M) continue;
      if (off > WATCH_INNER_SEED_RATIO && z < WATCH_OUTER_SEED_MIN_M) continue;
      /*
       * 어두운 덩어리는 가운데(WATCH_INNER_SEED_RATIO, 1.7.0 의 씨앗 자리) 안에서만 씨앗이 된다 — 어두워짐 감지는 그 자리에서 맞추고
       * 확인했다. 넓힌 띠(0.45~0.7)는 투수의 글러브 · 몸이 걸리는 자리라 밝은 바닥 앞을 지나는 몸 그늘이 공처럼 작아지며 이어졌다
       * (9f3f lowc=0.4 0.53 자리 3이음 · 819b sway=3 0.62 자리 4이음 — 둘 다 던지기 전에 걸려 진짜 공을 놓쳤다).
       */
      if (b.dark && off > WATCH_INNER_SEED_RATIO) continue;
      const stays = this.prevBlobs.some((frame) =>
        frame.some(
          (o) =>
            Math.hypot(o.x - b.x, o.y - b.y) <= Math.max(2, WATCH_STATIC_POS * b.d) &&
            Math.abs(o.d - b.d) <= WATCH_STATIC_SIZE * b.d
        )
      );
      if (stays) continue;
      next.push([
        b.dark
          ? { t, x: b.x, y: b.y, d: b.d, dark: true }
          : { t, x: b.x, y: b.y, d: b.d },
      ]);
    }
    /* 궤적이 너무 많으면(잡음) 최근 것 · 긴 것만 */
    if (next.length > 60) {
      next.sort((a, b) => b.length - a.length || b[b.length - 1].t - a[a.length - 1].t);
      next.length = 60;
    }
    this.chains = next;
    this.prevBlobs.push(blobs);
    if (this.prevBlobs.length > WATCH_NEW_LOOKBACK) this.prevBlobs.shift();
    if (found) {
      this.followed = found;
      this.chains = [];
    }
    return found;
  }

  /** 알아챈 공을 계속 따라간다(담기를 언제 멈출지). 공이 사라졌으면 true */
  follow(t: number, reg: Float32Array, period: number): boolean {
    const chain = this.followed;
    if (!chain) return true;
    const blobs = this.blobs(reg);
    /* 따라가는 동안에도 덩어리를 쥔다 — 그 뒤 다시 찾을 때(step) '새로 나타났나'를 지금 장면들과 견주게 */
    this.prevBlobs.push(blobs);
    if (this.prevBlobs.length > WATCH_NEW_LOOKBACK) this.prevBlobs.shift();
    const p = this.bestLink(chain, blobs, t, maxLinkSec(period) * 2, false, period);
    if (p) chain.push(p);
    const tail = chain[chain.length - 1];
    /* 느린 카메라(10fps 급)는 한 장만 놓쳐도 0.1초가 지나 — 적어도 한 간격 반은 기다린다(60 · 30fps 는 그대로) */
    if (t - tail.t > Math.max(WATCH_GONE_SEC, 1.5 * period) || tail.d < WATCH_GONE_D)
      return true;
    /*
     * 더 작아지지 않고 머물면 공이 아니다 — 멀어지는 공은 10m 밖(지름 7px)에서도 0.05초에 한 칸씩 준다. 글러브처럼 제자리에서
     * 크기만 흔들리는 것을 따라가면 끝나지 않아(f43a7958 을 위로 150px 옮겨 흘리자 릴리스 0.5초 전부터) 담는 내내 다시 찾지
     * 못했다. WATCH_STALL_SEC 동안 가장 작았던 지름보다 작아지지 않으면 사라진 것으로 본다.
     */
    let minD = Infinity;
    let minT = chain[0].t;
    for (const q of chain)
      if (q.d < minD) {
        minD = q.d;
        minT = q.t;
      }
    return t - minT > Math.max(WATCH_STALL_SEC, 3 * period);
  }

  /** 따라간 공이 마지막으로 보인 시각 */
  lastSeen(): number | null {
    const c = this.followed;
    return c ? c[c.length - 1].t : null;
  }

  /**
   * 따라간 것이 공답게 멀어졌나 — 지름이 처음의 WATCH_STRONG_SHRINK 배 밑까지 줄었으면 그렇다. 진짜 공은 0.1초 안에 거리가 두 배가
   * 넘어 지름이 반 밑으로 준다(30m/s, 2.3 → 4.6m). 던지기 전 글러브 · 몸에서 이어진 헛궤적은 몇 장 만에 사라진다(9f3f2654 를
   * 0.8배로 줄여 흘리자 글러브 무늬 14 → 13 → 11px 이 릴리스 0.34초 전에 걸렸다).
   */
  followedStrong(): boolean {
    const all = this.followed;
    if (!all || all.length < 3) return false;
    /*
     * 씨앗과 같은 극성으로 이어진 앞부분만 본다. 따라가기는 지평선을 넘는 공 때문에 두 극성을 다 잇는데, 던지기 전 헛것(밝은 덩어리)이
     * 밝은 바닥 앞의 몸 그늘(어두운 덩어리)로 건너가 '공답게 멀어진' 것처럼 보이면 다시 찾지 않고 쉬어 버려 진짜 공을 놓쳤다
     * (9f3f2654 를 위로 150px 옮겨 흘림 — 릴리스 0.44초 전의 28 → 24 → 19px). 진짜 공은 한 극성으로도 0.3초 안에 충분히 준다.
     */
    const flip = all.findIndex((q) => !!q.dark !== !!all[0].dark);
    const c = flip < 0 ? all : all.slice(0, flip);
    if (c.length < 3) return false;
    /*
     * 처음 WATCH_STRONG_WITHIN_SEC 안에 그만큼 줄어야 하고, 줄어드는 동안(처음 그 크기에 닿을 때까지) 깊이가 곧게 늘었어야 한다 —
     * 따라가기(follow)는 너그러워 공이 아닌 것을 따라가다 근처의 작은 점으로 건너뛰곤 했다(글러브 조각 40 → 34 → 32 → 30 다음
     * 14 → 11 … 5px 로 '멀어진' 것처럼 — a3df7d09 에 지나가는 사람을 더해 흘림). 닿은 뒤는 보지 않는다: 작은 공은 멀어지면 지름이
     * 몇 칸에서 멈춰(9f3f · 7f8f 를 0.5배로 줄임: 20 → 16 → 13 → 11 → 9 → 8 → 8 → 8 → 7) 깊이가 곧지 않아 보인다. 곧은 깊이의 폭은
     * confirmed 보다 너그럽게(WATCH_STRONG_DEPTH_TOL_*).
     */
    const reach = c.findIndex(
      (q) =>
        q.t - c[0].t <= WATCH_STRONG_WITHIN_SEC && q.d <= c[0].d * WATCH_STRONG_SHRINK
    );
    if (reach < 2) return false;
    return this.depthSteady(
      c.slice(0, reach + 1),
      WATCH_STRONG_DEPTH_TOL_M,
      WATCH_STRONG_DEPTH_TOL_D
    );
  }

  clearFollow() {
    this.followed = null;
    this.chains = [];
  }
}

/** detect.ts 의 DIFF_THRESHOLD 와 같다 */
const DIFF_THRESHOLD = 28;

/* ───────────────────────── 배경 장면 기록 ───────────────────────── */

/** 이만큼(초)마다 한 장씩 따로 쥔다 — 고리 버퍼(80장)는 240fps 면 0.33초라 던지기 전 배경을 담기에 짧다 */
const HISTORY_STEP_SEC = 0.1;
/** 쥐는 장수(1.2초치) */
const HISTORY_SIZE = 12;
/** 공 찾기 배경을 이만큼(초)마다 새로 만든다 — 조명 · 노출이 바뀌어도 따라가게 */
const WATCH_BG_REFRESH_SEC = 0.25;
/** 공 찾기 배경에 쓰는 장수 · 그 가운데 가장 최근 것은 이만큼(초) 앞 것까지만(막 나타난 공이 배경에 들지 않게) */
const WATCH_BG_SAMPLES = 7;
const WATCH_BG_SKIP_SEC = 0.05;
/** 배경을 만들려면 기록이 적어도 이만큼(장) */
const WATCH_BG_MIN_SAMPLES = 4;
/** 장면 사이 귀퉁이가 이만큼(밝기) 넘게 바뀌면 카메라가 움직인 것 — 배경을 다시 만든다(validate.ts MAX_CAMERA_SHAKE_PX) */
const SHAKE_RESET_PX = 6;

/* ───────────────────────── 카메라가 움직였나(노출 변화는 빼고) ───────────────────────── */

/**
 * 노출로 볼 밝기 곱의 범위 — 자동 노출은 한 장 사이에 이만큼 넘게 바뀌지 않는다. 이 밖이면 노출이 아니라 장면이 바뀐 것으로
 * 보고(맞춤이 무늬의 변화를 먹지 않게) 곱을 끝값에 묶는다.
 */
const EXPOSURE_GAIN_MIN = 0.8;
const EXPOSURE_GAIN_MAX = 1.25;

/**
 * 장면 사이 귀퉁이가 얼마나 바뀌었나 — cornerShift(analyze-frames.ts)처럼 블록 평균끼리 견주되, 화면 전체의 밝기 곱 하나(노출)를
 * 먼저 빼고 남은 차이의 평균으로 잰다. 두 번째로 적게 바뀐 귀퉁이의 값(투수 · 포수의 몸이 두 귀퉁이까지는 지나가도 된다 —
 * cornerShift 와 같다).
 *
 * 밝기 곱은 귀퉁이마다 '지금 ≈ 곱 × 앞'으로 맞춘 곱의 가운데 값(넷 중 가운데 둘의 평균)이다. 노출이 바뀌면 네 귀퉁이가 같은 곱으로
 * 오르내려 빼고 나면 남는 것이 없고, 카메라가 밀리면 무늬가 옮겨 가 블록마다 제멋대로 바뀌는데 평균 밝기는 거의 그대로라 곱이 1
 * 근처 — cornerShift 와 같은 값이 남는다(귀퉁이마다 곱 · 더하기를 따로 맞추면 무늬가 옮겨 간 것까지 맞춤이 먹어 흔들림을 덜
 * 쟀다 — ±2px 로 흔든 영상에서 계산이 흔들린 공을 받아 영상 파일 값과 4.5km/h 까지 벌어졌다).
 *
 * 왜: cornerShift 는 노출 변화도 '흔들림'으로 봐서, 팔이 들어오며 노출이 8% 바뀌자 배경을 버리고 다시 준비하느라(0.4초) 그 공을
 * 18개 모두 놓쳤다(되돌려 보기 gain=jump 0/18, 2026-10-03). 야외는 해 · 구름 · 몸이 지나가며 자동 노출이 늘 움직인다.
 */
function cornerMotion(prev: Float64Array, cur: Float64Array): number {
  /* 블록 평균은 analyze-frames.ts cornerMeans(귀퉁이 0 의 블록들, 1, 2, 3 — 귀퉁이마다 블록 수가 같다)를 그대로 쓴다 */
  const per = Math.min(prev.length, cur.length) >> 2;
  if (per === 0) return 0;
  const gains: number[] = [];
  for (let c = 0; c < 4; c++) {
    let sab = 0;
    let saa = 0;
    for (let i = c * per; i < (c + 1) * per; i++) {
      sab += prev[i] * cur[i];
      saa += prev[i] * prev[i];
    }
    if (saa > 0) gains.push(sab / saa);
  }
  if (!gains.length) return 0;
  const sorted = [...gains].sort((x, y) => x - y);
  const m = sorted.length;
  const mid = m % 2 ? sorted[m >> 1] : (sorted[m / 2 - 1] + sorted[m / 2]) / 2;
  /*
   * 곱은 가운데 값과 귀퉁이마다의 곱을 다 대 보고 남는 차이가 가장 적은 것으로 — 몸이 두 귀퉁이를 덮으면 가운데 값이 그 귀퉁이 곱에
   * 끌려 깨끗한 귀퉁이에도 차이가 남았다(실내 111: 아래 두 귀퉁이를 투수가 덮자 위 둘이 7 → '움직임'으로 배경을 버리고 0.5초 동안
   * 공을 못 봤다). 카메라가 밀린 것은 무늬가 옮겨 가 어느 곱으로도 셋 넘는 귀퉁이에 차이가 남는다.
   */
  let best = Infinity;
  for (const g of [mid, ...gains]) {
    const gain = Math.min(EXPOSURE_GAIN_MAX, Math.max(EXPOSURE_GAIN_MIN, g));
    const res: number[] = [];
    for (let c = 0; c < 4; c++) {
      let r = 0;
      for (let i = c * per; i < (c + 1) * per; i++) r += Math.abs(cur[i] - gain * prev[i]);
      res.push(r / per);
    }
    res.sort((x, y) => x - y);
    best = Math.min(best, res[1]);
  }
  return best;
}
/** 계산 배경('history')은 첫 공보다 이만큼(초) 앞 장면까지만 — 손에 든 공 · 막 던진 팔이 들지 않게 */
const HISTORY_BG_GAP_SEC = 0.15;
/** 헛 알아챔 뒤 다시 찾기(captureBall) — 담는 동안 이만큼(번)까지 다른 공으로 옮겨 담는다 */
const RETARGET_MAX = 2;

type HistoryEntry = { t: number; luma: ArrayLike<number>; reg: Float32Array | null };

export class LiveMeter {
  readonly config: MeterConfig;
  readonly width: number;
  readonly height: number;
  /** 공이 멀어지나(투수 뒤) 다가오나(포수 뒤) — 다가오면 앞을 더 길게 담는다 */
  approach: Approach;
  private status: MeterStatus = 'idle';
  private ring: MeterFrame[] = [];
  private lastTimes: number[] = [];
  /** fps 알림을 10장마다 내려고 세는 수 — lastTimes 길이로 세면 30장이 찬 뒤 매 장면 나간다 */
  private fpsTick = 0;
  private center = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private watch: BallWatch | null = null;
  /** 거리 측정(엔진 2.0)의 알아채기 — 반 해상도 전체 화면에서 멀어지며 작아지는 둥근 덩어리(seed-watch.ts) */
  private seedWatch: SeedWatch | null = null;
  private history: HistoryEntry[] = [];
  private bgBuiltAt = -Infinity;

  private quietRun = 0;
  private background: Float32Array | null = null;
  private quietSamples: ArrayLike<number>[] = [];
  private triggerT: number | null = null;
  /** '담는 중'을 알린 장면의 시각 — CaptureJob.hitT */
  private hitT: number | null = null;
  private ball: FoundBall | null = null;
  /** 던지기 전 배경 장면 — 공을 알아챈 순간 기록에서 골라 둔다(담는 1초 동안 기록이 밀려나므로) */
  private preBackground: ArrayLike<number>[] = [];
  private captured: MeterFrame[] = [];
  private goneAt: number | null = null;
  private cooldownUntil = 0;
  private seq = 0;
  private pendingBackground: Float32Array | null = null;
  /**
   * 앞 장면의 귀퉁이 블록 평균(카메라가 움직였나 — cornerMotion). 장면마다 한 번만 센다 — 같은 장면 버퍼 · 같은 시각일 때만 다시
   * 쓴다(값은 새로 센 것과 똑같다).
   */
  private corners: { t: number; luma: ArrayLike<number>; means: Float64Array } | null =
    null;
  /** 담는 중 — 따라간 것이 공답지 않게 사라졌나, 다른 공으로 옮겨 담은 횟수(captureBall) */
  private weakFollow = false;
  private retargets = 0;
  /** 마지막 일감의 공이 공답게 멀어지지 않았다(쉬는 시간을 걸지 않는다 — finish) */
  private lastJobWeak = false;

  /* 매개변수 속성(constructor(readonly width …))은 쓰지 않는다 — 노드의 타입 지우기가 못 읽어 시험이 안 돈다 */
  constructor(
    width: number,
    height: number,
    approach: Approach = 'receding',
    config: Partial<MeterConfig> = {}
  ) {
    this.width = width;
    this.height = height;
    this.approach = approach;
    this.config = { ...DEFAULT_METER_CONFIG, ...config };
    const bw = Math.floor(width * this.config.centerBoxRatio);
    const bh = Math.floor(height * this.config.centerBoxRatio);
    this.center = {
      x0: Math.floor((width - bw) / 2),
      y0: Math.floor((height - bh) / 2),
      x1: Math.floor((width + bw) / 2),
      y1: Math.floor((height + bh) / 2),
    };
    if (this.config.trigger === 'ball') {
      const focal =
        this.config.focalPx && this.config.focalPx > 0
          ? this.config.focalPx
          : focalPxFromFov(Math.max(width, height), 59.8);
      this.watch = new BallWatch(width, height, focal);
    }
    if (this.config.distanceMode) this.seedWatch = new SeedWatch(width, height);
  }

  /** 공으로 알아채나 — 다가오는 공(포수 뒤)은 실제 영상으로 확인하지 못해 1.6.0 의 'motion' 을 쓴다 */
  private get byBall(): boolean {
    return this.watch != null && this.approach === 'receding';
  }

  getStatus(): MeterStatus {
    return this.status;
  }

  /** 초점거리(분석 px)가 바뀌었다 — 렌즈 보정 · 화각. 0 이하면 무시 */
  setFocalPx(focalPx: number) {
    if (!(focalPx > 0)) return;
    this.config.focalPx = focalPx;
    if (this.watch) this.watch.k = focalPx * BALL_DIAMETER_M;
  }

  /** 거리 측정(엔진 2.0) 담기로 바꾸거나 되돌린다 — 담는 중이면 다음 공부터 */
  setDistanceMode(on: boolean) {
    const base = on ? { ...DEFAULT_METER_CONFIG, ...DISTANCE_METER_CONFIG } : DEFAULT_METER_CONFIG;
    this.config.distanceMode = on;
    this.config.postSec = base.postSec;
    this.config.maxFrames = base.maxFrames;
    if (on && !this.seedWatch) this.seedWatch = new SeedWatch(this.width, this.height);
    if (!on) this.seedWatch = null;
  }

  /** 가장 최근 장면 — 렌즈 보정이 공 크기를 잴 때 */
  lastFrame(): MeterFrame | null {
    return this.ring[this.ring.length - 1] ?? null;
  }

  private setStatus(next: MeterStatus, out: MeterEvent[]) {
    if (this.status === next) return;
    this.status = next;
    out.push({ kind: 'status', status: next });
  }

  private resetArm() {
    this.quietRun = 0;
    this.background = null;
    this.quietSamples = [];
    this.triggerT = null;
    this.hitT = null;
    this.ball = null;
    this.preBackground = [];
    this.captured = [];
    this.goneAt = null;
    this.weakFollow = false;
    this.retargets = 0;
    this.watch?.reset();
    this.seedWatch?.reset();
    this.bgBuiltAt = -Infinity;
  }

  /** 던지기를 기다리기 시작한다 */
  arm(): MeterEvent[] {
    const out: MeterEvent[] = [];
    this.resetArm();
    this.setStatus('settling', out);
    return out;
  }

  /** 기다리기를 멈춘다 */
  disarm(): MeterEvent[] {
    const out: MeterEvent[] = [];
    this.resetArm();
    this.setStatus('idle', out);
    return out;
  }

  /** 카메라를 껐다 — 장면도 버린다 */
  clear(): MeterEvent[] {
    this.ring = [];
    this.lastTimes = [];
    this.fpsTick = 0;
    this.history = [];
    this.corners = null;
    return this.disarm();
  }

  /** 장면 하나. 같은 시각(또는 앞선 시각)이 다시 오면 버린다 */
  push(frame: MeterFrame): MeterEvent[] {
    const out: MeterEvent[] = [];
    const last = this.ring[this.ring.length - 1];
    if (last && frame.t <= last.t) return out;
    this.ring.push(frame);
    if (this.ring.length > this.config.ringSize) this.ring.shift();
    this.trackFps(frame.t, out);
    if (this.byBall) this.pushBall(frame, last, out);
    else this.pushMotion(frame, last, out);
    return out;
  }

  /**
   * 계산이 끝났다(성공 · 거부 · 오류 모두). 배경은 그대로 두고 곧장 다음 공을 기다린다 — 카메라는 안 움직였다.
   * @param manual 수동 모드면 다음 공은 단추(arm)를 눌러야 기다린다
   */
  finish(manual = false): MeterEvent[] {
    const out: MeterEvent[] = [];
    if (this.status !== 'analyzing') return out;
    const background = this.pendingBackground;
    this.pendingBackground = null;
    this.background = background;
    /*
     * 쉬는 시간은 공을 따라가 멀어지는 것을 본 뒤에만 — 네트에서 튄 공 같은 뒤끝을 막으려는 것이라, 따라간 것이 공답지 않게 사라진
     * 담기(헛 알아챔이었을 수 있다) 뒤에는 쉬지 않는다. 쉬면 그 1.5초 안에 던진 진짜 공을 놓친다.
     */
    this.cooldownUntil =
      (this.ring[this.ring.length - 1]?.t ?? 0) +
      (this.lastJobWeak ? 0 : this.config.cooldownSec);
    if (manual) {
      this.resetArm();
      this.setStatus('idle', out);
    } else if (this.seedWatch && this.approach === 'receding') {
      this.seedWatch.clearFollow();
      this.setStatus(this.seedWatch.hasBackground() ? 'armed' : 'settling', out);
    } else if (this.byBall) {
      this.watch?.clearFollow();
      this.setStatus(this.watch?.hasBackground() ? 'armed' : 'settling', out);
    } else {
      this.setStatus(background ? 'armed' : 'settling', out);
    }
    return out;
  }

  /** 장면 간격(초) — 최근 장면 시각 간격의 중앙값. 모르면 1/60 */
  private period(): number {
    const f = fpsFromTimes(this.lastTimes);
    return f ? 1 / f : 1 / 60;
  }

  private trackFps(t: number, out: MeterEvent[]) {
    this.lastTimes.push(t);
    if (this.lastTimes.length > 30) this.lastTimes.shift();
    this.fpsTick++;
    if (this.lastTimes.length >= 10 && this.fpsTick % 10 === 0) {
      const span = t - this.lastTimes[0];
      if (span > 0) out.push({ kind: 'fps', fps: (this.lastTimes.length - 1) / span });
    }
  }

  /* ───────── 공으로 알아채기 ───────── */

  private pushBall(frame: MeterFrame, prev: MeterFrame | undefined, out: MeterEvent[]) {
    const watch = this.watch!;
    const status = this.status;
    if (status === 'idle' || status === 'analyzing') {
      /* 기다리지 않을 때도 배경 기록은 쌓아 둔다 — 다시 기다리기 시작하면 바로 배경을 만들게 */
      this.record(frame, null);
      return;
    }
    const reg = watch.regionNow(frame.luma);
    this.record(frame, reg);
    /*
     * 카메라가 움직였으면 배경을 버리고 다시 쌓는다(담는 중이면 그대로 — 계산이 흔들림을 따로 본다). 노출이 바뀐 것은 움직임으로
     * 보지 않는다(cornerMotion). 귀퉁이 블록 평균(cornerMeans)은 장면마다 한 번만 센다 — 앞 장면 것을 쥐어 둔다.
     */
    let moved = false;
    if (status !== 'capturing') {
      const corners = cornerMeans(frame.luma, this.width, this.height);
      const kept = this.corners;
      const before =
        prev && kept && kept.t === prev.t && kept.luma === prev.luma
          ? kept.means
          : prev
            ? cornerMeans(prev.luma, this.width, this.height)
            : null;
      moved = !!before && cornerMotion(before, corners) > SHAKE_RESET_PX;
      this.corners = { t: frame.t, luma: frame.luma, means: corners };
    }
    if (moved) {
      this.history = [{ t: frame.t, luma: frame.luma, reg: reg.slice() }];
      watch.reset();
      this.seedWatch?.reset();
      this.bgBuiltAt = -Infinity;
      this.setStatus('settling', out);
      return;
    }
    if (status === 'capturing') {
      this.captureBall(frame, reg, out);
      return;
    }
    /* 거리 측정(엔진 2.0)은 반 해상도 전체 화면의 씨앗 규칙으로 알아챈다(seed-watch.ts) */
    if (this.seedWatch) {
      const seeds = this.seedWatch.step(frame.t, frame.luma);
      if (!this.seedWatch.hasBackground()) return;
      if (status === 'settling') this.setStatus('armed', out);
      if (!seeds || frame.t < this.cooldownUntil) return;
      this.takeBall(seeds as WatchPoint[], this.ring);
      this.retargets = 0;
      this.hitT = frame.t;
      this.setStatus('capturing', out);
      return;
    }
    /* 배경(중앙값) — 쌓였으면 만들고, 일정 간격으로 새로 만든다 */
    if (frame.t - this.bgBuiltAt >= WATCH_BG_REFRESH_SEC || !watch.hasBackground()) {
      const regs = this.history
        .filter((h) => h.reg && h.t <= frame.t - WATCH_BG_SKIP_SEC)
        .slice(-WATCH_BG_SAMPLES)
        .map((h) => h.reg as Float32Array);
      if (regs.length >= WATCH_BG_MIN_SAMPLES) {
        watch.setBackground(regs);
        this.bgBuiltAt = frame.t;
      }
    }
    if (!watch.hasBackground()) return;
    if (status === 'settling') this.setStatus('armed', out);
    const found = watch.step(frame.t, reg, this.period());
    if (!found) return;
    if (frame.t < this.cooldownUntil) {
      watch.clearFollow();
      return;
    }
    this.takeBall(found, this.ring);
    this.retargets = 0;
    this.hitT = frame.t;
    this.setStatus('capturing', out);
    /* 이미 담긴 장면들로도 공이 사라졌을 수 있다(30fps) — 다음 장면부터 본다 */
  }

  /** 알아챈 공(found)으로 담기를 맞춘다 — 공 앞 preSec 부터 frames 에서 담고, 던지기 전 배경을 고른다 */
  private takeBall(found: WatchPoint[], frames: MeterFrame[]) {
    const watch = this.watch!;
    const first = found[0];
    const idx = frames.findIndex((f) => f.t >= first.t);
    const prevT = idx > 0 ? frames[idx - 1].t : first.t;
    this.ball = {
      t: first.t,
      prevT,
      links: found.length - 1,
      seedZ: Math.round((watch.k / first.d) * 100) / 100,
      x: first.x,
      y: first.y,
      d: first.d,
      path: found.map((q) => ({
        t: q.t,
        x: Math.round(q.x),
        y: Math.round(q.y),
        d: q.d,
      })),
      offCenter:
        Math.hypot(first.x - this.width / 2, first.y - this.height / 2) /
          (Math.min(this.width, this.height) / 2) >
        MAX_RELEASE_OFFSET_RATIO,
    };
    this.triggerT = first.t;
    this.captured = frames.filter((f) => f.t >= first.t - this.preSecFor(watch.k / first.d));
    /* 거리 측정은 60fps 남짓으로 솎는다(captureBall 과 같게) — 120 · 240fps 고리 버퍼가 담는 칸을 다 먹지 않게 */
    if (this.config.distanceMode) {
      const kept: MeterFrame[] = [];
      for (const f of this.captured) if (!kept.length || f.t - kept[kept.length - 1].t >= 0.85 / 60) kept.push(f);
      this.captured = kept;
    }
    this.preBackground = this.pickPreBackground(first.t);
    this.goneAt = null;
  }

  /**
   * 공 앞으로 담는 시간. 거리 측정은 판단이 멀리서야 공을 알아챌 때가 있다(실내 114 — 11m 에서 처음 둥글게 보임) — 그만큼 앞에서부터
   * 담아야 계산이 가까운 공(4m 안쪽)을 찾는다. 느린 공(18m/s)으로 쳐서 거꾸로, 0.6초까지. 가까이서 알아챈 공은 그대로 — 앞을 더
   * 담으면 계산 배경(담은 구간에서 고르게 뽑음)에 와인드업이 섞여 값이 흔들렸다(되돌려 보기 129 · 실내 086 · 111).
   */
  private preSecFor(seedZ: number): number {
    const pre = this.config.preSec;
    if (!this.config.distanceMode || !(seedZ > 4)) return pre;
    return Math.min(0.6, pre + (seedZ - 4) / 18);
  }

  private captureBall(frame: MeterFrame, reg: Float32Array, out: MeterEvent[]) {
    if (this.triggerT == null) return;
    /* 거리 측정은 60fps 남짓이면 된다 — 120 · 240fps 면 솎아 담는다(찾기 · 따라가기는 모든 장면으로 한다) */
    const lastKept = this.captured[this.captured.length - 1];
    if (!this.config.distanceMode || !lastKept || frame.t - lastKept.t >= 0.85 / 60) this.captured.push(frame);
    /* 거리 측정은 따라가지 않는다 — 장면을 자르지 않고 정한 시간만큼 담는다(그물에 닿고 튄 장면까지) */
    if (this.config.distanceMode) {
      if (frame.t - this.triggerT >= this.config.postSec || this.captured.length >= this.config.maxFrames) this.emitJob(out);
      return;
    }
    const watch = this.watch!;
    const period = this.period();
    /* 공을 계속 따라가 언제 사라졌는지 안다 — 계산할 장면을 거기서 자른다(emitJob) */
    if (this.goneAt == null && watch.follow(frame.t, reg, period)) {
      this.goneAt = watch.lastSeen() ?? frame.t;
      this.weakFollow = !watch.followedStrong();
    } else if (
      this.goneAt == null &&
      this.ball &&
      frame.t - this.ball.t > WATCH_STRONG_WITHIN_SEC &&
      !watch.followedStrong()
    ) {
      /* 그만큼 따라가도 공답게 멀어지지 않았으면(조금씩 작아지며 남는 글러브) 공이 아니다 — 놓고 다시 찾는다 */
      this.goneAt = watch.lastSeen() ?? frame.t;
      this.weakFollow = true;
    }
    /*
     * 따라간 것이 공답게 멀어지지 않고 금방 사라졌으면(던지기 전 글러브 · 몸에서 이어진 헛궤적) 담는 동안에도 다시 찾는다 — 진짜
     * 공이 나타나면 그 공으로 옮겨 담는다(takeBall, 담은 장면에서 공 앞 preSec 부터 — 새 공은 처음 알아챈 것보다 뒤라 그 장면이
     * 다 담겨 있다). 1.7.0 은 헛 알아챔 뒤 1초 가까이 담고 쉬느라 그 사이에 던진 공을 놓쳤다(흰 글러브가 앞으로 나가며 쪼개진
     * 조각 58 → 40 → 34 → 32 → 30px 이 릴리스 0.7초 전에 걸린 a3df7d09). 진짜 공을 따라간 뒤에는 다시 찾지 않는다(뒤에 걸린
     * 것이 진짜 공을 밀어내지 않게). 담기가 끝나도 못 찾았으면 쉬지 않고 바로 다시 기다린다(finish).
     */
    if (this.goneAt != null && this.weakFollow && this.retargets < RETARGET_MAX) {
      const found = watch.step(frame.t, reg, period);
      if (found) {
        this.takeBall(found, this.captured);
        this.retargets++;
        this.weakFollow = false;
      }
    }
    const early = this.config.goneEndSec;
    const doneEarly =
      early != null &&
      this.goneAt != null &&
      this.ball != null &&
      frame.t >=
        Math.max(
          this.ball.t + this.config.analysisMinSec,
          this.goneAt + this.config.analysisTailSec
        ) +
          early;
    if (
      doneEarly ||
      frame.t - this.triggerT >= this.config.postSec ||
      this.captured.length >= this.config.maxFrames
    ) {
      this.emitJob(out);
    }
  }

  /**
   * 계산 배경의 던지기 전 장면 — 공보다 HISTORY_BG_GAP_SEC 넘게 앞선 기록 장면에서 고르게 historyBackground 장. 공을 알아챈
   * 순간에 고른다: 기록은 1.2초치라, 담는 동안(60fps 1초) 계속 쌓으면 던지기 전 장면이 한두 장만 남는다(셀프테스트가 찾음).
   */
  private pickPreBackground(ballT: number): ArrayLike<number>[] {
    const older = this.history.filter((h) => h.t <= ballT - HISTORY_BG_GAP_SEC);
    const want = Math.min(this.config.historyBackground, older.length);
    const picked: ArrayLike<number>[] = [];
    for (let j = 0; j < want; j++) {
      picked.push(
        older[
          want === 1
            ? older.length - 1
            : Math.round((j * (older.length - 1)) / (want - 1))
        ].luma
      );
    }
    return picked;
  }

  /** 배경 기록 — HISTORY_STEP_SEC 마다 한 장. reg 는 이번 장면의 판(regionNow)이라 쥘 때 복사한다 */
  private record(frame: MeterFrame, reg: Float32Array | null) {
    const last = this.history[this.history.length - 1];
    if (last && frame.t - last.t < HISTORY_STEP_SEC) return;
    this.history.push({
      t: frame.t,
      luma: frame.luma,
      reg: reg ? reg.slice() : (this.watch?.region(frame.luma) ?? null),
    });
    if (this.history.length > HISTORY_SIZE) this.history.shift();
  }

  /* ───────── 1.6.0 까지: 가운데가 밝아지면 ───────── */

  private pushMotion(
    frame: MeterFrame,
    prev: MeterFrame | undefined,
    out: MeterEvent[]
  ) {
    switch (this.status) {
      case 'settling':
        this.settle(frame, prev, out);
        break;
      case 'armed':
        this.watchMotion(frame, out);
        break;
      case 'capturing':
        this.captureMotion(frame, out);
        break;
      default:
        break;
    }
  }

  /** 가운데 상자 안에서 앞 프레임과의 평균 밝기 차 */
  private centerMeanDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
    const { x0, y0, x1, y1 } = this.center;
    let sum = 0;
    let n = 0;
    for (let y = y0; y < y1; y += 2) {
      const row = y * this.width;
      for (let x = x0; x < x1; x += 2) {
        sum += Math.abs(a[row + x] - b[row + x]);
        n++;
      }
    }
    return n ? sum / n : 0;
  }

  /** 가운데 상자 안에서 배경보다 밝아진 픽셀 수 */
  private centerMovedPx(luma: ArrayLike<number>, background: Float32Array): number {
    const { x0, y0, x1, y1 } = this.center;
    const th = this.config.moveThreshold;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const row = y * this.width;
      for (let x = x0; x < x1; x++) {
        if (luma[row + x] - background[row + x] > th) n++;
      }
    }
    return n;
  }

  /* 잠잠해지길 기다린다. 충분히 잠잠하면 배경을 만들고 '던지세요' */
  private settle(frame: MeterFrame, prev: MeterFrame | undefined, out: MeterEvent[]) {
    if (!prev) return;
    if (this.centerMeanDiff(frame.luma, prev.luma) < this.config.quietMeanDiff) {
      this.quietRun++;
      this.quietSamples.push(frame.luma);
      if (this.quietSamples.length > this.config.quietSamples)
        this.quietSamples.shift();
    } else {
      this.quietRun = 0;
      this.quietSamples = [];
    }
    if (this.quietRun >= this.config.quietFrames && this.quietSamples.length >= 3) {
      this.background = buildBackground(this.quietSamples);
      this.setStatus('armed', out);
    }
  }

  /* 던졌는지 본다 */
  private watchMotion(frame: MeterFrame, out: MeterEvent[]) {
    const background = this.background;
    if (!background) return;
    if (frame.t < this.cooldownUntil) return;

    const moved = this.centerMovedPx(frame.luma, background);
    const boxPx = (this.center.x1 - this.center.x0) * (this.center.y1 - this.center.y0);
    if (moved < this.config.triggerMinPx) return;
    if (moved > boxPx * this.config.triggerMaxRatio) {
      /* 화면이 통째로 바뀌었다 — 카메라가 움직였거나 사람이 지나갔다. 다시 잠잠해질 때까지 */
      this.resetArm();
      this.setStatus('settling', out);
      return;
    }

    this.triggerT = frame.t;
    /*
     * 던지기 직전 프레임도 담는다 — 릴리스 순간이 표적에 닿기 한두 장 앞일 수 있다. 다가오는 공은 가운데가 밝아지기
     * 한참 전부터 멀리서 작게 보여 앞을 두 배 담는다.
     */
    const pre =
      this.approach === 'approaching' ? this.config.preSec * 2 : this.config.preSec;
    this.captured = this.ring.filter((f) => f.t >= frame.t - pre);
    this.hitT = frame.t;
    this.setStatus('capturing', out);
  }

  /* 던진 뒤 프레임을 모은다. 시간이나 장수가 차면 계산으로 넘긴다 */
  private captureMotion(frame: MeterFrame, out: MeterEvent[]) {
    if (this.triggerT == null) return;
    /* 거리 측정(엔진 2.0)은 60fps 남짓으로 솎아 담고, 와인드업에 먼저 반응해도 공이 미트까지 오게 담기 시간(1.3초)을 다 채운다 */
    const lastKept = this.captured[this.captured.length - 1];
    if (!this.config.distanceMode || !lastKept || frame.t - lastKept.t >= 0.85 / 60) this.captured.push(frame);
    const enough =
      frame.t - this.triggerT >= (this.config.distanceMode ? this.config.postSec : this.config.motionPostSec) ||
      this.captured.length >= this.config.maxFrames;
    if (!enough) return;
    this.emitJob(out);
  }

  /* ───────── 일감 ───────── */

  private emitJob(out: MeterEvent[]) {
    const frames = this.captured;
    const triggerT = this.triggerT as number;
    let backgroundSamples: ArrayLike<number>[] = this.quietSamples;
    let analysisFrames = frames;
    let inWindow = this.config.inWindowBackground;
    const ball = this.ball
      ? { ...this.ball, strong: this.watch?.followedStrong() ?? false }
      : null;
    this.lastJobWeak = !!ball && !ball.strong;
    if (ball && frames.length > 3) {
      /*
       * 계산 배경 — 공보다 HISTORY_BG_GAP_SEC 넘게 앞선 기록 장면 몇 장 + 담은 구간 전체에서 고르게 뽑은 7장. 영상 파일의
       * 배경(영상 처음 · 가운데 · 끝 + 공 구간 7장, find-throw.ts anchoredBackgroundTimes)과 같은 모양이다. 1.6.0 은 '잠잠할
       * 때(측정 시작 무렵) 찍은 5장'이었는데, 실제로는 몇 분 전 장면일 수 있어(조명 · 투수 자리) 던지기 직전 것으로 바꿨다.
       * 되돌려 보기 18개에서 두 가지가 같은 정확도였다(스피드건 LOO 1.0~1.1km/h).
       */
      const picked: ArrayLike<number>[] = [...this.preBackground];
      const m = Math.min(inWindow, frames.length);
      for (let i = 0; i < m; i++)
        picked.push(
          frames[Math.floor((i * (frames.length - 1)) / Math.max(1, m - 1))].luma
        );
      backgroundSamples = picked;
      inWindow = 0;
      /* 계산할 장면 — 공이 마지막으로 보인 뒤 조금까지(찾기는 반 해상도라 계산보다 먼저 놓친다). 값은 자르지 않은 것과 같았다 */
      const seen = this.watch?.lastSeen() ?? frames[frames.length - 1].t;
      const until = Math.max(
        ball.t + this.config.analysisMinSec,
        seen + this.config.analysisTailSec
      );
      /* 거리 측정은 그물 · 미트에 닿고 튄 장면까지 넘긴다 — 판단은 반 해상도라 먼 공을 일찍 놓친다 */
      if (!this.config.distanceMode) analysisFrames = frames.filter((f) => f.t <= until);
    }
    /* 장면 시각을 고르게 편다(regularTimes) — 흔들림이 크면 그대로 */
    const rawTimes = analysisFrames.map((f) => f.t);
    const even = regularTimes(rawTimes);
    if (even)
      analysisFrames = analysisFrames.map((f, i) => ({ t: even[i], luma: f.luma }));
    const job: CaptureJob = {
      id: ++this.seq,
      triggerT,
      hitT: this.hitT ?? triggerT,
      frames: analysisFrames,
      backgroundSamples,
      inWindowBackground: inWindow,
      fps: fpsFromTimes(analysisFrames.map((f) => f.t)),
      ball,
      timing: frameTiming(rawTimes, even != null),
    };
    this.pendingBackground = this.background;
    this.captured = [];
    this.triggerT = null;
    this.hitT = null;
    this.ball = null;
    this.preBackground = [];
    this.goneAt = null;
    this.weakFollow = false;
    this.retargets = 0;
    this.setStatus('analyzing', out);
    out.push({ kind: 'capture', job });
  }
}

/* ───────────────────────── 일감 넘기기(워커 사이) ───────────────────────── */

/**
 * 계산 워커로 넘길 일감 — 장면 밝기를 버퍼 하나에 모은 것. 버퍼는 넘기기(transfer)로 보내 복사가 없다.
 *
 * 왜(2026-10-03): 예전에는 일감을 그대로 postMessage 했다(structured clone). 장면 버퍼는 판단의 고리 · 배경 기록과 같은
 * 것이라 넘길 수 없어 복사됐는데, 브라우저는 보낼 때 한 번(직렬화) · 받을 때 한 번 더 복사한다 — 공 하나에 30~60MB 를 두 번.
 * 여기서 한 번만 복사해(TypedArray.set) 넘기면 받는 쪽은 복사 없이 그 버퍼를 본다. 같은 장면(구간 배경으로 뽑힌 계산 장면)은
 * 한 번만 담는다. 노드 MessageChannel 로 보내고 받기: 공 하나(보정 영상 18개의 일감, 평균 41MB) 85~106 → 23~34ms(부하 걸린
 * PC, 2026-10-03). 받은 쪽 계산은 한 바이트도 다르지 않다.
 */
export type PackedJob = Omit<CaptureJob, 'frames' | 'backgroundSamples'> & {
  frames: { t: number; slot: number }[];
  backgroundSlots: number[];
  /** 칸 하나의 바이트 수(장면 크기를 4 의 배수로 올림 — 4픽셀씩 읽는 길이 맞게) · 장면 크기 */
  slotBytes: number;
  lumaLength: number;
  buffer: ArrayBuffer;
};

/** 일감 → 버퍼 하나. 장면이 모두 같은 크기의 Uint8Array 가 아니면 null(그대로 보낸다) */
export function packJob(job: CaptureJob): PackedJob | null {
  const slotOf = new Map<ArrayLike<number>, number>();
  const order: Uint8Array[] = [];
  const first = job.frames[0]?.luma ?? job.backgroundSamples[0];
  if (!first) return null;
  const lumaLength = first.length;
  const slot = (l: ArrayLike<number>): number => {
    const got = slotOf.get(l);
    if (got != null) return got;
    if (!(l instanceof Uint8Array) || l.length !== lumaLength) return -1;
    slotOf.set(l, order.length);
    order.push(l);
    return order.length - 1;
  };
  const frames = job.frames.map((f) => ({ t: f.t, slot: slot(f.luma) }));
  const backgroundSlots = job.backgroundSamples.map(slot);
  if (frames.some((f) => f.slot < 0) || backgroundSlots.some((s) => s < 0)) return null;
  const slotBytes = (lumaLength + 3) & ~3;
  const all = new Uint8Array(slotBytes * order.length);
  order.forEach((l, i) => all.set(l, i * slotBytes));
  return {
    id: job.id,
    triggerT: job.triggerT,
    hitT: job.hitT,
    inWindowBackground: job.inWindowBackground,
    fps: job.fps,
    ball: job.ball,
    timing: job.timing,
    frames,
    backgroundSlots,
    slotBytes,
    lumaLength,
    buffer: all.buffer,
  };
}

/** 버퍼 하나 → 일감(장면은 버퍼를 보는 창 — 복사 없음) */
export function unpackJob(p: PackedJob): CaptureJob {
  const view = (s: number) => new Uint8Array(p.buffer, s * p.slotBytes, p.lumaLength);
  return {
    id: p.id,
    triggerT: p.triggerT,
    hitT: p.hitT,
    inWindowBackground: p.inWindowBackground,
    fps: p.fps,
    ball: p.ball,
    timing: p.timing,
    frames: p.frames.map((f) => ({ t: f.t, luma: view(f.slot) })),
    backgroundSamples: p.backgroundSlots.map(view),
  };
}

/* ───────────────────────── 계산 — 카메라 · 촬영 조건 ───────────────────────── */

/** 계산에 넘길 카메라 · 렌즈 설정. 워커로 넘기므로 값만 둔다(structured clone) */
export type LiveCamera = {
  /** 분석 해상도 */
  width: number;
  height: number;
  /** 카메라가 준 원본 해상도(화면에 보이는 방향) */
  sourceWidth: number;
  sourceHeight: number;
  /** 설정의 화각(°) — 카메라 고유 비율(16:9 · 4:3) 화면의 긴 변 기준 */
  fovDeg: number;
  /**
   * 렌즈 보정으로 잰 초점거리(원본 픽셀) — 있으면 화각보다 먼저. 잘림 · 줌은 고치지 않는다: 렌즈 보정은 같은 비율 · 같은
   * 줌일 때만 쓴다(lib/velocity-lens.ts lensMatches)
   */
  focalPx?: number;
  approach: Approach;
  releaseDistanceM: number | null;
  /** 화면 비율이 카메라 고유 비율이 아니다 — 브라우저가 잘라서 줬다(isCroppedAspect) */
  cropped?: boolean;
  /** 카메라가 알려 준 줌 배율(모르면 null) — 1 이 아니면 화각으로 낸 초점거리에 곱한다 */
  zoom?: number | null;
  /** HDR(HLG · PQ) 장면 — 카메라 장면(VideoFrame)의 색 정보로 알 때만 true */
  hdr?: boolean;
  /**
   * 엔진 2.0 의 거리 자(m) — 투수 뒤는 카메라 → 그물 · 미트, 포수 뒤는 카메라 → 릴리스. 있으면 거리로 잰다(analyze-distance.ts),
   * 없으면 1.x(공 지름으로 거리).
   */
  distanceM?: number | null;
  /** 카메라가 아래로 숙인 각(라디안, 폰 기울기 센서) — 모르면 0 */
  tiltRad?: number | null;
};

/**
 * 카메라 고유 비율 — 폰 · 웹캠의 영상은 16:9, 사진 틀 그대로면 4:3. 브라우저는 요청한 크기에 맞추려 가운데를 잘라 줄 수
 * 있다(크롬 resizeMode 'crop-and-scale': 세로 카메라에 1920×1080 을 청하자 1080×1080 이 왔고, 화각을 긴 변 1080 에 대어
 * 96km/h 공이 52.5km/h 로 나왔다 — 2026-09-30 브라우저 시험대). 이 범위 밖의 비율이면 잘린 것으로 본다.
 */
const NATIVE_ASPECTS: [number, number][] = [
  [1.3, 1.36],
  [1.74, 1.8],
];
export function isCroppedAspect(width: number, height: number): boolean {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (!(short > 0)) return false;
  const r = long / short;
  return !NATIVE_ASPECTS.some(([a, b]) => r >= a && r <= b);
}

/**
 * 초점거리(원본 픽셀) — 렌즈 보정이 있으면 그것, 없으면 설정 화각에서. 잘려 온 화면이면 잘리기 전의 긴 변을 짐작한다: 잘라
 * 줄 때 브라우저는 키우지 않으므로 한 변은 원래 크기다 — 16:9 보다 길쭉하면 긴 변이, 아니면 짧은 변이 그대로(16:9 를 청했으므로
 * 짧은 변 × 16/9). 줌을 알면 곱한다(디지털 줌은 가운데를 잘라 키운다). 잘림 · 줌이 없으면 focalPxFromFov(긴 변, 화각) 그대로.
 */
export function liveFocalPx(camera: LiveCamera): number {
  if (camera.focalPx && camera.focalPx > 0) return camera.focalPx;
  const long = Math.max(camera.sourceWidth, camera.sourceHeight);
  const short = Math.min(camera.sourceWidth, camera.sourceHeight);
  const nominalLong =
    camera.cropped && short > 0 && long / short <= 1.8 ? (short * 16) / 9 : long;
  const zoom = camera.zoom && camera.zoom > 0 ? camera.zoom : 1;
  return focalPxFromFov(nominalLong, camera.fovDeg) * zoom;
}

/**
 * 카메라 실시간 측정의 ± 에 늘 더할 σ(값에 대한 비율). 윤곽 자 · 화각은 아이폰 카메라 앱 영상 파일로 맞췄고 실시간(웹뷰 ·
 * getUserMedia)은 스피드건 짝이 없다 — 같은 화각이면 1.5.0 보다 평균 6% 낮게 읽는다(영상 14개, −13.5~+2.7%, 2차 검증 —
 * 견고성). 어느 쪽이 맞는지 짝이 없어, 짝이 쌓일 때까지 ± 를 넓히고 믿음은 '보통'까지(analyze-frames calibrated 없음).
 */
export const LIVE_DOMAIN_SIGMA_REL = 0.06;

/*
 * ── 좋은 조건 밖의 카메라 실시간(사용자 규칙, 2026-09-30) ──
 *
 * "어떤 조건에서도 카메라는 켜지고 잰 값은 보여야 한다." 초당 장면 수 · 잘린 화면 · 짐작한 화각 · 줌 · HDR · 작은 화면 ·
 * 번진 공 때문에 값을 막지 않는다. 대신 알림(한국어)을 붙이고, 믿음은 '낮음(참고용)', ± 는 아래 σ 만큼 넓힌다. 공을 못
 * 찾았거나 공이 찍힌 장면이 모자란 것(진짜로 못 잰 것)은 예전처럼 거부 까닭을 보인다. 영상 파일은 그대로(30fps 이하 막음).
 *
 * 좋은 조건 = 50fps 이상 · 고유 비율 · 렌즈 보정(잰 초점거리) · 줌 1 · SDR · 긴 변 1000px 이상 · 또렷한 공. 그래도 스피드건
 * 짝이 없어 믿음은 '보통'까지다.
 */

/** 이 초당 장면 수부터 좋은 조건(영상 파일의 문턱과 같다) */
export const LIVE_GOOD_FPS = MIN_FPS;
/**
 * 초당 50장 밑의 σ. 근거(2026-09-30, 보정 영상 18개를 한 장 걸러 30fps 로 흘려 봄, 노출은 60fps 그대로): 잰 것 13/15, 스피드건
 * LOO 1.0~1.8km/h, 영상 파일 값과 최대 2.3~4.2km/h(3.7%) — 3% 였다. 그런데 노출이 1/30초에 가까우면(두 장면을 75/25 로 섞어
 * 흉내) 번짐 문턱 바로 밑(가장자리 1.65~1.8px)에서 −10.7 · +11% 가 번짐 알림 없이 ± 의 0.87 을 썼다(정확도 검증) — 4.5% 로
 * 넓힌다. 25fps 밑은 시험한 자료가 없어 장면 간격만큼 키운 짐작이다.
 */
export const LIVE_LOW_FPS_SIGMA_REL = 0.045;
const LIVE_LOW_FPS_REF = 25;
/**
 * 화각을 설정 값으로 짐작했을 때(렌즈 보정 없음)의 σ. 같은 아이폰 메인 카메라라도 손떨림 보정이 자르면 59.8°(카메라 앱 영상,
 * 2차 보정), 안 자르면 70° 안팎이다 — 설정 기본 69° 로 두면 −16 ~ +4% 가 날 수 있다. 실제로 카메라 앱 영상을 가짜 카메라로
 * 흘려 측정 화면(69°)에서 재자 파일 값보다 16% 낮았다(2026-09-30 브라우저 시험대). σ 10% 면 늘 붙는 6% 와 합쳐 90% 구간
 * ±19% 로 그만큼을 덮는다. 렌즈 보정을 하면 이 몫이 빠진다.
 */
export const LIVE_FOV_GUESS_SIGMA_REL = 0.1;
/**
 * 잘려 온 화면의 σ — 잘리기 전 비율을 16:9 로 짐작한다(청한 비율). 실제로 4:3 이었으면 33% 틀린다. 1080×1080 처럼 잘려 오는
 * 일은 resizeMode 'none' 으로 막지만(live-capture.ts), 못 막으면 이만큼.
 */
export const LIVE_CROP_SIGMA_REL = 0.15;
/** 줌이 1 이 아닐 때의 σ — 디지털 줌이면 배율만큼 고치면 맞지만, 아이폰은 줌을 바꾸면 다른 렌즈로 넘어갈 수 있다(화각을 모른다) */
export const LIVE_ZOOM_SIGMA_REL = 0.1;
/** HDR 장면의 σ — 영상 파일과 같다(analyze-video.ts HDR_SIGMA_REL: HLG → SDR 곡선을 입혀 보면 −4.4 ± 1.5%) */
export const LIVE_HDR_SIGMA_REL = 0.055;
/**
 * 노출 번짐 — 궤적의 가장자리 폭이 이만큼(분석 px) 이상이면 한 장의 노출 동안 공이 작아지며 번진 것으로 본다(파일의 '보통'
 * 문턱과 같다. 또렷한 공은 60 · 30fps 모두 1.32~1.64px 였다).
 */
export const LIVE_BLUR_PX = 1.8;
/**
 * 노출 번짐의 σ — 가장자리 폭이 1.6px 를 넘는 1px 마다. 근거(2026-09-30): 보정 영상 두 장면을 겹쳐 1/30초 노출을 흉내 내자
 * 값이 나온 17개가 −5 ~ +36%(16개가 높게, 폭 2.6~6.2px). 1px 당 5% 면 17개 모두 90% 구간 안, 6% 로 여유를 둔다(± 중앙값 20%).
 */
export const LIVE_EXPOSURE_BLUR_SIGMA_PER_PX = 0.06;
/** 줌을 1 로 보는 폭 */
const ZOOM_TOL = 0.05;

/**
 * 장면 시각이 고르지 않음 — 간격의 표준편차가 중앙값의 이 비율을 넘고 고르게 펴지 못했으면(regularTimes 실패). 폰이 바쁘거나
 * 뜨거워 장면이 들쭉날쭉 오면 시각이 공의 자리와 어긋나 값이 크게 틀린다(브라우저 시험대, CPU 가 모자랄 때: 간격 6~60ms 에서
 * 96km/h 공이 47.9, 98km/h 공이 131.9 — 2026-09-30 실시간 검증). 좋은 60fps 는 0.05 안팎.
 */
export const LIVE_TIMING_JITTER = 0.25;
/**
 * 포수 뒤(다가오는 공) 카메라 실시간의 σ — 스피드건 짝이 하나도 없다. 게다가 판단은 1.6.0 의 'motion'(가운데가 밝아짐)이라,
 * 투수가 화면에 보이면 와인드업(다리 들기, 릴리스 0.9초 전)에 먼저 반응해 그 뒤의 공을 쉬는 시간에 놓친다(합성 시험, 정확도
 * 검증). 포수 뒤 영상 + 스피드건이 생기면 다가오는 공으로 알아채기를 만든다. 그때까지 알림 · '낮음'.
 */
export const LIVE_APPROACH_SIGMA_REL = 0.05;

/** 고르지 않은 시각의 σ — 흔들림 비율의 0.4배(0.25 → 10%), 30% 까지 */
const LIVE_TIMING_SIGMA_PER_JITTER = 0.4;
const LIVE_TIMING_SIGMA_MAX = 0.3;

export type LiveNoteCode =
  | 'END_GUESS'
  | 'SHAKE'
  | 'LOW_FPS'
  | 'TIMING'
  | 'APPROACH'
  | 'LOW_RES'
  | 'CROPPED'
  | 'FOV_GUESS'
  | 'ZOOM'
  | 'HDR'
  | 'BLUR'
  | 'DARK_BALL'
  /** 대비 길(1.9.0)로 잰 공 — 그물 앞 · 릴리스가 가운데 밖. 아직 스피드건으로 맞추지 않은 조건이라 값이 낮게 나올 수 있다 */
  | 'FALLBACK';
export type LiveNote = { code: LiveNoteCode; text: string };

/** 장면을 어디서 어떻게 받나 — 'worker-stream' 워커가 카메라 장면을 직접, 'worker-frames' 화면 스레드가 캔버스로, 'main' 워커 없이 */
export type LivePipeline = 'worker-stream' | 'worker-frames' | 'main';

/** 결과에 붙는 촬영 조건 — 화면이 알림으로 보인다 */
export type LiveReport = {
  /** 좋은 조건 밖이라 붙인 알림(한국어, 중요한 것부터) */
  notes: LiveNote[];
  /** ± 에 더한 촬영 조건의 σ(비율) — 늘 붙는 LIVE_DOMAIN_SIGMA_REL 포함, 번짐은 빼고(번짐은 analyzeFrames 가 더한다) */
  sigmaRel: number;
  /** 계산에 쓴 초당 장면 수 */
  fps: number | null;
  /** 초점거리를 어디서 — 'lens' 렌즈 보정, 'fov' 설정 화각(짐작) */
  focalFrom: 'lens' | 'fov';
  /** 카메라에 걸린 줌(모르면 null) — 거리 측정은 2배를 청한다. 실제 폰에서 걸렸는지 되짚으려고 */
  zoom?: number | null;
  /** 장면 시각의 질(일감의 timing) — 모르면 null */
  timing: FrameTiming | null;
  /** 장면을 어떻게 받았나(live-capture.ts 가 붙인다 — 실제 폰에서 어느 길로 도는지 되짚으려고) */
  pipeline?: LivePipeline;
  /** 측정 워커가 본 카메라 장면(진단) — 형식 · 돌림 · 보이는 크기, 화면과 방향이 달라 워커가 더 돌린 각(rotationFix) */
  frame?: {
    format: string;
    rotation: number;
    visible: [number, number];
    rotationFix: number;
  } | null;
  /**
   * 판단(BallWatch)이 본 공 — 공으로 알아챈 일감만. strong: 따라가 보니 공답게 멀어졌다, offCenter: 첫 공이 씨앗 자리 밖이었다.
   * 화면이 거부를 잡음으로 걸러 버릴지 정할 때 쓴다(velocity-screen.tsx addResult): 공답게 따라간 것은 잡음이 아니다 —
   * '공은 봤는데 못 쟀어요'와 까닭을 보인다(1.9.0, 밖에서 8개 중 6개가 조용히 버려졌다 — outdoor-2026-10-03.md).
   */
  ball?: { strong: boolean; offCenter: boolean } | null;
};

export type LiveAnalyzeResult = AnalyzeResult & { live: LiveReport };

/** 숫자 뒤 '이라/라' — 끝자리를 읽는 소리가 모음으로 끝나면(이 · 사 · 오 · 구) '라' */
function iraOf(n: number): string {
  return [2, 4, 5, 9].includes(Math.abs(Math.round(n)) % 10) ? '라' : '이라';
}

/** 초당 장면이 좋은 조건(50) 밑이면 그 알림 — 화면이 첫 공 전에도 보인다(결과의 LOW_FPS 와 같은 말) */
export function liveFpsNote(fps: number | null): string | null {
  if (fps == null || !(fps > 0) || fps >= LIVE_GOOD_FPS) return null;
  const n = Math.round(fps);
  return `초당 장면이 ${n}${iraOf(n)} 값이 부정확할 수 있어요. 60fps 로 찍히는 카메라면 더 정확해요.`;
}

type ConditionItem = { code: LiveNoteCode; sigma: number; text: string };

/** 장면 시각의 흔들림(간격 표준편차 ÷ 중앙값) — 고르게 폈거나 모르면 0 */
export function timingJitter(timing: FrameTiming | null): number {
  if (!timing || timing.regularized) return 0;
  const med = timing.medianGapMs;
  const sd = timing.sdGapMs;
  return med != null && med > 0 && sd != null ? sd / med : 0;
}

/** 분석 전에 아는 조건들(초당 장면 수 · 장면 시각 · 화면 · 초점거리 · 줌 · HDR). text 가 빈 것은 알림 없이 σ 만 */
function preConditions(
  fps: number | null,
  camera: LiveCamera,
  timing: FrameTiming | null
): ConditionItem[] {
  const out: ConditionItem[] = [];
  const fromFov = !(camera.focalPx && camera.focalPx > 0);
  const fpsNote = liveFpsNote(fps);
  if (fpsNote && fps != null) {
    out.push({
      code: 'LOW_FPS',
      sigma: LIVE_LOW_FPS_SIGMA_REL * Math.max(1, LIVE_LOW_FPS_REF / fps),
      text: fpsNote,
    });
  }
  const jitter = timingJitter(timing);
  if (jitter > LIVE_TIMING_JITTER) {
    out.push({
      code: 'TIMING',
      sigma: Math.min(LIVE_TIMING_SIGMA_MAX, LIVE_TIMING_SIGMA_PER_JITTER * jitter),
      text: '장면이 고르게 오지 않아 값이 크게 틀릴 수 있어요. 다른 앱을 닫거나 폰이 식은 뒤에 재면 나아져요.',
    });
  }
  if (camera.approach === 'approaching') {
    out.push({
      code: 'APPROACH',
      sigma: LIVE_APPROACH_SIGMA_REL,
      text: '포수 뒤 실시간 측정은 아직 스피드건으로 확인하지 못해 참고용이에요. 투수가 화면에 보이면 와인드업에 먼저 반응해 공을 놓칠 수 있어요.',
    });
  }
  if (fromFov && camera.cropped) {
    out.push({
      code: 'CROPPED',
      sigma: LIVE_CROP_SIGMA_REL,
      text: `카메라 화면이 잘려 와서(${camera.sourceWidth}×${camera.sourceHeight}) 화각을 짐작했어요 — 값이 크게 틀릴 수 있어요.`,
    });
  }
  if (fromFov && camera.zoom != null && Math.abs(camera.zoom - 1) > ZOOM_TOL) {
    const z = Math.round(camera.zoom * 10) / 10;
    out.push({
      code: 'ZOOM',
      sigma: LIVE_ZOOM_SIGMA_REL,
      text: `줌이 ${z}배라 값이 부정확할 수 있어요. 1배로 두면 더 정확해요.`,
    });
  }
  if (camera.hdr) {
    out.push({
      code: 'HDR',
      sigma: LIVE_HDR_SIGMA_REL,
      text: 'HDR 화면이라 값이 조금 어긋날 수 있어요.',
    });
  }
  if (Math.max(camera.sourceWidth, camera.sourceHeight) < MIN_FRAME_WIDTH_PX) {
    out.push({
      code: 'LOW_RES',
      sigma: 0, // 작은 공의 흔들림은 잭나이프 ± 가 본다
      text: `카메라 화면이 작아(${camera.sourceWidth}×${camera.sourceHeight}) 값이 부정확할 수 있어요.`,
    });
  }
  if (fromFov) {
    out.push({
      code: 'FOV_GUESS',
      sigma: LIVE_FOV_GUESS_SIGMA_REL,
      /* 잘린 화면이면 위 알림이 이미 '화각을 짐작했다'고 말한다 */
      text: camera.cropped
        ? ''
        : `화각을 ${Math.round(camera.fovDeg)}°로 짐작해서 쟀어요. 렌즈 보정을 하면 더 정확해요.`,
    });
  }
  return out;
}

/** 분석 전 조건의 σ(늘 붙는 실시간 σ 포함) · 믿음을 '낮음'으로 낮출지 */
export function liveConditionSigma(
  fps: number | null,
  camera: LiveCamera,
  timing: FrameTiming | null = null
): { sigmaRel: number; low: boolean } {
  const items = preConditions(fps, camera, timing);
  return {
    sigmaRel: Math.hypot(LIVE_DOMAIN_SIGMA_REL, ...items.map((i) => i.sigma)),
    low: items.length > 0,
  };
}

/** 결과에 붙일 촬영 조건 알림 — 분석 전 조건 + 값이 나온 번진 공 */
export function liveReport(
  fps: number | null,
  camera: LiveCamera,
  result: AnalyzeResult | null,
  timing: FrameTiming | null = null
): LiveReport {
  const items = preConditions(fps, camera, timing);
  const notes: LiveNote[] = [];
  const edge = result?.diameter.edgeWidthPx ?? null;
  if (result?.measure.ok && edge != null && edge >= LIVE_BLUR_PX) {
    notes.push({
      code: 'BLUR',
      text: '공이 번져 찍혀 값이 크게 틀릴 수 있어요(대개 실제보다 높게 나와요). 밝은 곳이나 60fps 카메라에서 재면 나아져요.',
    });
  }
  /*
   * 밝은 배경(하늘 · 해 받은 벽) 앞에서 공이 배경보다 어둡게 찍혀 두 번째 길(극성)로 잰 공 — 그 윤곽 자리를 스피드건으로 확인하지
   * 못했다(analyze-frames.ts DARK_POLARITY_SIGMA_REL — ± 는 analyzeFrames 가 이미 넓혔다).
   */
  const polarity = result?.diameter.polarity;
  if (result?.measure.ok && (polarity === 'dark' || polarity === 'mixed')) {
    notes.push({
      code: 'DARK_BALL',
      text: '밝은 하늘 · 벽 앞이라 공이 배경보다 어둡게 찍혀 다른 방법으로 쟀어요. 아직 스피드건으로 확인하지 못한 조건이라 값이 조금 어긋날 수 있어요.',
    });
  }
  /*
   * 대비 길(1.9.0, analyze-frames.ts '대비 길')로 잰 공 — 그물코 잇기 없이('close') · 가운데 조건 없이('center'). 밖 · 2배 줌의
   * 스피드건 짝 13개가 평균 3km/h 낮게 읽혀 아직 맞추지 않은 조건이다(보정 짝에서도 뺀다). 믿음은 analyzeFrames 가 '보통'까지로 내렸다.
   */
  if (result?.measure.ok && result.fallback) {
    notes.push({
      code: 'FALLBACK',
      text:
        result.fallback === 'center'
          ? '공을 놓는 지점이 화면 가운데에서 벗어나 다른 방법으로 쟀어요. 값이 조금 낮게 나올 수 있어요. 폰 높이를 릴리스에 맞추면 더 정확해요.'
          : '그물 앞이라 다른 방법으로 쟀어요. 아직 스피드건으로 확인하지 못한 조건이라 값이 조금 낮게 나올 수 있어요.',
    });
  }
  for (const i of items) if (i.text) notes.push({ code: i.code, text: i.text });
  return {
    notes,
    sigmaRel:
      Math.round(
        Math.hypot(LIVE_DOMAIN_SIGMA_REL, ...items.map((i) => i.sigma)) * 1000
      ) / 1000,
    fps,
    focalFrom: camera.focalPx && camera.focalPx > 0 ? 'lens' : 'fov',
    zoom: camera.zoom ?? null,
    timing,
  };
}

/** 일감 → analyzeFrames 입력. 순수 함수라 워커에서도 부를 수 있다 */
export function liveAnalysisInput(
  job: CaptureJob,
  camera: LiveCamera,
  /** 시험용 — 입력을 더 얹는다 */
  extra: Partial<AnalyzeFramesInput> = {}
): AnalyzeFramesInput {
  const { frames } = job;
  /*
   * 카메라 흔들림(계산이 CAMERA_SHAKE 로 거부하는 값) — 판단과 같이 노출 변화는 빼고 잰다(cornerMotion). cornerShift 로 재면 팔이
   * 들어오며 노출이 8% 바뀐 공을 판단이 알아채도 계산이 '카메라가 움직였다'로 거부했다(되돌려 보기 gain=jump: 18개 중 14개).
   * 귀퉁이 블록 평균은 장면마다 한 번만 세어 계산의 노출 치우침에도 넘긴다(frameCornerMeans — 값은 다시 센 것과 같다).
   */
  let shakePx = 0;
  const frameCornerMeans: Float64Array[] = [];
  for (let i = 0; i < frames.length; i++) {
    const means = cornerMeans(frames[i].luma, camera.width, camera.height);
    if (i > 0)
      shakePx = Math.max(shakePx, cornerMotion(frameCornerMeans[i - 1], means));
    frameCornerMeans.push(means);
  }
  const captured: CapturedFrame[] = frames.map((f) => ({ t: f.t, luma: f.luma }));
  const cond = liveConditionSigma(job.fps, camera, job.timing ?? null);
  return {
    frames: captured,
    backgroundSamples: job.backgroundSamples,
    inWindowBackground: job.inWindowBackground,
    width: camera.width,
    height: camera.height,
    sourceWidth: camera.sourceWidth,
    sourceHeight: camera.sourceHeight,
    fovDeg: camera.fovDeg,
    /*
     * 초점거리 — 잘린 화면 · 줌을 고친 값(liveFocalPx)을 넘긴다. 엔진은 focalPx 가 있으면 화각을 보지 않는다. 잘림 · 줌이
     * 없으면 엔진이 화각으로 낼 값과 같다(focalPxFromFov(긴 변, 화각)).
     */
    focalPx: liveFocalPx(camera),
    shakePx,
    /* 흔들림을 재며 센 귀퉁이 블록 평균 — 노출 치우침이 다시 세지 않는다(값은 같다) */
    frameCornerMeans,
    approach: camera.approach,
    releaseDistanceM: camera.releaseDistanceM,
    /*
     * 초당 장면 수를 장면 시각(mediaTime) 간격의 중앙값으로 재서 넘긴다 — 안 넘기면 엔진이 '같은 장면'을 걸러 작아진 공
     * 장면을 버리고(실시간 흉내에서 43장 중 3~7장), 남은 장수로 센 fps 가 50 밑이면 '초당 장면 수 부족'으로 거부했다.
     */
    fps: job.fps,
    /*
     * 공으로 알아챘으면 공은 구간 앞 0.12초 뒤에 처음 보인다 — 60fps 면 8번째 장면이지만 120 · 240fps 면 15 · 30번째라, 엔진의
     * 기본(앞 12장 안에서 씨앗)으로는 공을 못 찾았다(셀프테스트). 영상 파일처럼 전부에서 찾는다. 포수 뒤('motion')도 같다 — 앞
     * 0.24초가 60fps 면 14장이라 기본으로는 깨끗한 합성 장면에서도 늘 '장면 부족'이었다(1.6.0 부터, 2026-09-30 정확도 검증).
     */
    seedFrames: Number.POSITIVE_INFINITY,
    /* 촬영 조건으로는 막지 않는다(위 '좋은 조건 밖') — 초당 장면 수 · 화면 크기 문턱을 끄고 알림 · σ 로 대신한다 */
    minFps: 0,
    minLongSidePx: 0,
    domainSigmaRel: cond.sigmaRel,
    confidenceCap: cond.low ? 'low' : 'medium',
    exposureBlurPx: LIVE_BLUR_PX,
    exposureBlurSigmaPerPx: LIVE_EXPOSURE_BLUR_SIGMA_PER_PX,
    ...extra,
  };
}

/**
 * 엔진 2.0(거리 자)의 촬영 조건 알림 — 1.x 의 알림 중 공 지름으로 거리를 재서 생긴 것(화각 짐작 · 줌 · 잘린 화면 · HDR)은 뺀다.
 * 2.0 은 크기를 사용자가 넣은 거리로 정해 초점거리 · 밝기 곡선의 영향이 작다(옆 · 위아래 성분에만 든다). 남는 것: 초당 장면 ·
 * 장면 시각 · 포수 뒤(확인 못 함) · 작은 화면, 그리고 끝을 이어 찾아 정한 공.
 */
export function distanceLiveReport(
  fps: number | null,
  camera: LiveCamera,
  result: DistanceResult | null,
  timing: FrameTiming | null = null
): LiveReport {
  const keep = new Set<LiveNoteCode>(['LOW_FPS', 'TIMING', 'APPROACH', 'LOW_RES']);
  const items = preConditions(fps, camera, timing).filter((i) => keep.has(i.code));
  const notes: LiveNote[] = [];
  if (result?.measure.ok && result.distance.shaky) {
    notes.push({
      code: 'SHAKE',
      text: '찍는 동안 화면이 조금 흔들렸어요. 폰을 단단히 고정하면 더 정확해요.',
    });
  }
  if (result?.measure.ok && result.distance.extended > 0) {
    notes.push({
      code: 'END_GUESS',
      text: '공이 그물 · 미트 앞에서 흐려져 끝을 이어 찾아 쟀어요. 값이 조금 어긋날 수 있어요(공 뒤에 흰 천이 없으면 더 정확해요).',
    });
  }
  for (const i of items) if (i.text) notes.push({ code: i.code, text: i.text });
  return {
    notes,
    sigmaRel: Math.round(Math.hypot(0, ...items.map((i) => i.sigma)) * 1000) / 1000,
    fps,
    focalFrom: camera.focalPx && camera.focalPx > 0 ? 'lens' : 'fov',
    zoom: camera.zoom ?? null,
    timing,
  };
}

/** 엔진 2.0 — 담은 장면 + 거리 자로 잰다(analyze-distance.ts). 촬영 조건의 σ 는 ± 에 더한다 */
export function analyzeJobByDistance(job: CaptureJob, camera: LiveCamera): LiveAnalyzeResult {
  let shakePx = 0;
  let prev: Float64Array | null = null;
  for (const f of job.frames) {
    const m = cornerMeans(f.luma, camera.width, camera.height);
    if (prev) shakePx = Math.max(shakePx, cornerMotion(prev, m));
    prev = m;
  }
  const result = analyzeByDistance({
    frames: job.frames.map((f) => ({ t: f.t, luma: f.luma })),
    backgroundSamples: job.backgroundSamples,
    width: camera.width,
    height: camera.height,
    sourceWidth: camera.sourceWidth,
    sourceHeight: camera.sourceHeight,
    focalPx: liveFocalPx(camera),
    distanceM: camera.distanceM as number,
    approach: camera.approach,
    tiltRad: camera.tiltRad ?? 0,
    fps: job.fps,
    seedHint: job.ball ? { t: job.ball.t, x: job.ball.x, y: job.ball.y } : null,
    shakePx,
  });
  const live = distanceLiveReport(job.fps, camera, result, job.timing ?? null);
  const m = result.measure;
  if (m.ok && live.sigmaRel > 0 && m.kmh > 0) {
    const base = m.errorKmh / 1.645 / m.kmh;
    m.errorKmh = Math.round(1.645 * m.kmh * Math.hypot(base, live.sigmaRel) * 10) / 10;
    if (m.confidence === 'high') m.confidence = 'medium';
  }
  return { ...result, live };
}

/** 일감을 계산한다(워커 · 메인 스레드 · 노드 시험 모두 이것) — 결과에 촬영 조건 알림(live)을 붙인다 */
export function analyzeJob(
  job: CaptureJob,
  camera: LiveCamera,
  extra: Partial<AnalyzeFramesInput> = {}
): LiveAnalyzeResult {
  /* 거리를 넣었으면 엔진 2.0(거리 자). 시험 · 되돌려 보기(거리 없음)는 1.x 그대로 */
  if (camera.distanceM && camera.distanceM > 0) return analyzeJobByDistance(job, camera);
  let result = analyzeFrames(liveAnalysisInput(job, camera, extra));
  /*
   * 판단은 가운데에서 꽤 벗어난 곳(WATCH_SEED_RATIO)에서 나타난 공도 알아채는데, 계산은 공을 가운데(MAX_RELEASE_OFFSET_RATIO)
   * 에서만 찾는다 — 공이 끝내 가운데로 오지 않으면 '공을 충분히 잡지 못했다' 같은 까닭으로 끝난다. 판단이 따라간 것이 공답게
   * 멀어졌으면(strong) 무엇을 고칠지 분명한 까닭(릴리스가 표적에서 벗어남)으로 바꿔 알린다.
   */
  if (
    !result.measure.ok &&
    job.ball?.offCenter &&
    job.ball.strong &&
    (OFF_CENTER_OVERRIDABLE.has(result.measure.code) ||
      /* 가운데로 들어온 뒤의 먼 장면으로만 재서 '너무 멀다'가 된 것 — 판단이 본 첫 공은 가까웠다 */
      (result.measure.code === 'TOO_FAR' && job.ball.seedZ <= MAX_RELEASE_DISTANCE_M))
  ) {
    result = { ...result, measure: { ok: false, ...reject('RELEASE_NOT_CENTERED') } };
  }
  return {
    ...result,
    live: {
      ...liveReport(job.fps, camera, result, job.timing ?? null),
      ball: job.ball ? { strong: job.ball.strong === true, offCenter: job.ball.offCenter === true } : null,
    },
  };
}

/** 공을 못 찾거나 못 이어 끝난 까닭들 — 릴리스가 표적에서 벗어난 공이면 그 까닭으로 바꿔 알린다(analyzeJob) */
const OFF_CENTER_OVERRIDABLE = new Set([
  'NOT_ENOUGH_FRAMES',
  'TRAVEL_TOO_SHORT',
  'UNSTABLE_TRACK',
  'IMPLAUSIBLE_SPEED',
]);
