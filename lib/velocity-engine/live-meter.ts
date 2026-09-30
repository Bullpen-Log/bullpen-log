import { buildBackground } from './detect.ts';
import {
  analyzeFrames,
  cornerShift,
  type AnalyzeFramesInput,
  type AnalyzeResult,
  type Approach,
  type CapturedFrame,
} from './analyze-frames.ts';
import { BALL_DIAMETER_M, focalPxFromFov } from './geometry.ts';
import { MIN_FPS, MIN_FRAME_WIDTH_PX } from './validate.ts';

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
 * 계산 구간의 앞쪽에 오고, 릴리스 직전 장면도 담긴다. 빠른 계산을 위해 가운데 정사각형만 반 해상도로 본다.
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
};

/** 계산할 일감 — 담은 장면들과 배경 장면들 */
export type CaptureJob = {
  id: number;
  /** 던짐을 알아챈 기준 시각(초) — 공으로 알아챘으면 공이 처음 보인 장면 */
  triggerT: number;
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
  /** 계산에는 공이 마지막으로 보인 뒤 이만큼(초)까지만 넘긴다(적어도 첫 공 뒤 analysisMinSec) — 배경은 담은 구간 전체에서 */
  analysisTailSec: number;
  analysisMinSec: number;
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
  analysisTailSec: 0.2,
  analysisMinSec: 0.35,
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

/* ───────────────────────── 공 찾기(반 해상도, 가운데 정사각형) ───────────────────────── */

/** 가운데 정사각형 — 짧은 변 절반의 이 비율이 한 변의 절반. 씨앗(0.45)보다 넓게 — 공이 소실점으로 모이며 조금 옮겨 간다 */
const WATCH_REGION_RATIO = 0.6;
/** 씨앗이 될 수 있는 자리 — 짧은 변 절반의 이 비율 안(detect.ts trackBall · validate.ts 와 같다) */
const WATCH_SEED_RATIO = 0.45;
/**
 * 공의 깊이 속도 범위(m/s) — 위는 find-throw.ts 와 같다. 아래는 알아챌 때 궤적 전체로 보는 값이라 계산이 받는 가장 느린 공
 * (validate.ts MIN_PLAUSIBLE_KMH 40km/h ≈ 11m/s)에 맞춘다 — 8 이면 제자리에서 크기만 1px 씩 흔들리는 밝은 점이 넘었다(거꾸로
 * 돌린 영상 7f8f2d15: 28 → 27 → 28 → 24px, 9.6m/s).
 */
const WATCH_MIN_DEPTH_MPS = 11;
const WATCH_MAX_DEPTH_MPS = 65;
/**
 * 옆 · 위아래 속도 상한(m/s). 영상 파일(find-throw.ts)은 거친 장면 간격이 길어 12 로 넉넉히 두지만, 카메라는 장면마다 보므로
 * 좁힌다 — 되돌려 보기 18개(60 · 30fps, 번짐 흉내 포함)의 진짜 공은 릴리스 직후 0.1~4.3m/s 였고, 30fps 에서 투수 몸 가장자리의
 * 점들을 이은 헛궤적은 9.4~11.8m/s 였다(b3fb4050, 던지기 0.34초 전에 알아채 공을 놓쳤다).
 */
const WATCH_MAX_LATERAL_MPS = 7;
/** 씨앗의 거리 범위(m) — 가까운 쪽은 손 · 팔(detect.ts), 먼 쪽은 릴리스 4m + 한 간격(find-throw.ts SEED_MAX_M) */
const WATCH_SEED_MIN_M = 0.8;
const WATCH_SEED_MAX_M = 6.8;
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
const WATCH_MAX_CANDIDATES = 40;
/** 앞 장면의 같은 자리(지름의 이 비율 안) · 같은 크기(이 비율 안)에 있던 덩어리는 머무는 것 — 씨앗이 아니다 */
const WATCH_STATIC_POS = 0.25;
const WATCH_STATIC_SIZE = 0.15;
/** 공이 사라졌다고 볼 때 — 이음 없이 이만큼(초) 지났거나 지름이 이 밑(분석 px, 원본 9px 이면 6px) */
const WATCH_GONE_SEC = 0.1;
const WATCH_GONE_D = 6;

type WatchBlob = { x: number; y: number; d: number; px: number };
type WatchPoint = { t: number; x: number; y: number; d: number };

/**
 * 가운데 정사각형을 반 해상도로 줄여 배경(중앙값)보다 밝은 둥근 덩어리를 찾고, 장면마다 멀어지는 공으로 잇는다.
 * 계산은 장면마다 1ms 안팎(216×216 반 해상도 픽셀) — 카메라 한 장 사이(60fps 16.7ms)에 넉넉하다.
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
  private prevBlobs: WatchBlob[][] = [];
  private chains: WatchPoint[][] = [];
  private followed: WatchPoint[] | null = null;
  private readonly mask: Uint8Array;
  private readonly stack: Int32Array;
  private readonly hist = new Int32Array(511);

  constructor(width: number, height: number, focalPx: number) {
    this.width = width;
    const short = Math.min(width, height);
    const halfSide = Math.floor((short / 2) * WATCH_REGION_RATIO);
    this.w = halfSide; // 반 해상도 한 변 = 분석 해상도 한 변(2·halfSide)의 절반
    this.h = halfSide;
    this.x0 = Math.floor(width / 2) - halfSide;
    this.y0 = Math.floor(height / 2) - halfSide;
    this.k = focalPx * BALL_DIAMETER_M;
    this.cx = width / 2;
    this.cy = height / 2;
    this.halfShort = short / 2;
    this.mask = new Uint8Array(this.w * this.h);
    this.stack = new Int32Array(this.w * this.h);
  }

  /** 가운데 정사각형을 2×2 평균으로 줄인다 */
  region(luma: ArrayLike<number>): Float32Array {
    const out = new Float32Array(this.w * this.h);
    const W = this.width;
    for (let j = 0; j < this.h; j++) {
      const r0 = (this.y0 + 2 * j) * W + this.x0;
      const r1 = r0 + W;
      for (let i = 0; i < this.w; i++) {
        const a = r0 + 2 * i;
        const b = r1 + 2 * i;
        out[j * this.w + i] = (luma[a] + luma[a + 1] + luma[b] + luma[b + 1]) * 0.25;
      }
    }
    return out;
  }

  hasBackground(): boolean {
    return this.bg != null;
  }

  /** 배경 = 픽셀마다 장면들의 중앙값 — 잠깐 지나간 팔 · 글러브 · 공은 빠지고, 오래 있는 것만 남는다 */
  setBackground(regions: Float32Array[]) {
    const m = regions.length;
    if (!m) return;
    const n = this.w * this.h;
    const bg = new Float32Array(n);
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
    }
    this.bg = bg;
  }

  reset() {
    this.bg = null;
    this.prevBlobs = [];
    this.chains = [];
    this.followed = null;
  }

  /** 배경보다 밝은 둥근 덩어리(분석 픽셀 좌표) */
  private blobs(reg: Float32Array): WatchBlob[] {
    const bg = this.bg;
    if (!bg) return [];
    const { w, h, mask, stack, hist } = this;
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
    for (let p = 0; p < n; p++) mask[p] = reg[p] - bg[p] > threshold ? 1 : 0;
    const out: WatchBlob[] = [];
    for (let start = 0; start < n; start++) {
      if (mask[start] !== 1) continue;
      let top = 0;
      stack[top++] = start;
      mask[start] = 2;
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
        if (x > 0 && mask[p - 1] === 1) {
          mask[p - 1] = 2;
          stack[top++] = p - 1;
        }
        if (x < w - 1 && mask[p + 1] === 1) {
          mask[p + 1] = 2;
          stack[top++] = p + 1;
        }
        if (y > 0 && mask[p - w] === 1) {
          mask[p - w] = 2;
          stack[top++] = p - w;
        }
        if (y < h - 1 && mask[p + w] === 1) {
          mask[p + w] = 2;
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
    if (out.length > WATCH_MAX_CANDIDATES) {
      out.sort((a, b) => b.px - a.px);
      out.length = WATCH_MAX_CANDIDATES;
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
      if (b.d >= a.d && period >= 1 / WATCH_STRICT_GROW_MAX_FPS) return false;
      const mx = b.x - a.x;
      const my = b.y - a.y;
      if (Math.hypot(mx, my) < WATCH_STILL_PX && Math.abs(b.d - a.d) < 1) return false;
      if (before) {
        const ux = a.x - before.x;
        const uy = a.y - before.y;
        if (
          Math.hypot(ux, uy) >= WATCH_TURN_MIN_PX &&
          Math.hypot(mx, my) >= WATCH_TURN_MIN_PX &&
          ux * mx + uy * my < 0
        )
          return false;
      }
    }
    const vz = (this.k / b.d - this.k / a.d) / dt;
    if (vz > WATCH_MAX_DEPTH_MPS) return false;
    const lx = ((b.x - this.cx) / b.d - (a.x - this.cx) / a.d) * BALL_DIAMETER_M;
    const ly = ((b.y - this.cy) / b.d - (a.y - this.cy) / a.d) * BALL_DIAMETER_M;
    return Math.hypot(lx, ly) / dt <= WATCH_MAX_LATERAL_MPS;
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
    return links >= 3 || this.k / a.d <= WATCH_WEAK_SEED_MAX_M;
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
      const p = { t, x: b.x, y: b.y, d: b.d };
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
      if (Math.hypot(b.x - this.cx, b.y - this.cy) / this.halfShort > WATCH_SEED_RATIO)
        continue;
      const z = this.k / b.d;
      if (z < WATCH_SEED_MIN_M || z > WATCH_SEED_MAX_M) continue;
      const stays = this.prevBlobs.some((frame) =>
        frame.some(
          (o) =>
            Math.hypot(o.x - b.x, o.y - b.y) <= Math.max(2, WATCH_STATIC_POS * b.d) &&
            Math.abs(o.d - b.d) <= WATCH_STATIC_SIZE * b.d
        )
      );
      if (stays) continue;
      next.push([{ t, x: b.x, y: b.y, d: b.d }]);
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
    const p = this.bestLink(
      chain,
      this.blobs(reg),
      t,
      maxLinkSec(period) * 2,
      false,
      period
    );
    if (p) chain.push(p);
    const tail = chain[chain.length - 1];
    /* 느린 카메라(10fps 급)는 한 장만 놓쳐도 0.1초가 지나 — 적어도 한 간격 반은 기다린다(60 · 30fps 는 그대로) */
    return t - tail.t > Math.max(WATCH_GONE_SEC, 1.5 * period) || tail.d < WATCH_GONE_D;
  }

  /** 따라간 공이 마지막으로 보인 시각 */
  lastSeen(): number | null {
    const c = this.followed;
    return c ? c[c.length - 1].t : null;
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
/** 장면 사이 귀퉁이가 이만큼(픽셀) 넘게 바뀌면 카메라가 움직인 것 — 배경을 다시 만든다(validate.ts MAX_CAMERA_SHAKE_PX) */
const SHAKE_RESET_PX = 6;
/** 계산 배경('history')은 첫 공보다 이만큼(초) 앞 장면까지만 — 손에 든 공 · 막 던진 팔이 들지 않게 */
const HISTORY_BG_GAP_SEC = 0.15;

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
  private history: HistoryEntry[] = [];
  private bgBuiltAt = -Infinity;

  private quietRun = 0;
  private background: Float32Array | null = null;
  private quietSamples: ArrayLike<number>[] = [];
  private triggerT: number | null = null;
  private ball: FoundBall | null = null;
  /** 던지기 전 배경 장면 — 공을 알아챈 순간 기록에서 골라 둔다(담는 1초 동안 기록이 밀려나므로) */
  private preBackground: ArrayLike<number>[] = [];
  private captured: MeterFrame[] = [];
  private goneAt: number | null = null;
  private cooldownUntil = 0;
  private seq = 0;
  private pendingBackground: Float32Array | null = null;

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
    this.ball = null;
    this.preBackground = [];
    this.captured = [];
    this.goneAt = null;
    this.watch?.reset();
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
    this.cooldownUntil =
      (this.ring[this.ring.length - 1]?.t ?? 0) + this.config.cooldownSec;
    if (manual) {
      this.resetArm();
      this.setStatus('idle', out);
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
    const reg = watch.region(frame.luma);
    this.record(frame, reg);
    /* 카메라가 움직였으면 배경을 버리고 다시 쌓는다(담는 중이면 그대로 — 계산이 흔들림을 따로 본다) */
    if (
      prev &&
      status !== 'capturing' &&
      cornerShift(prev.luma, frame.luma, this.width, this.height) > SHAKE_RESET_PX
    ) {
      this.history = [{ t: frame.t, luma: frame.luma, reg }];
      watch.reset();
      this.bgBuiltAt = -Infinity;
      this.setStatus('settling', out);
      return;
    }
    if (status === 'capturing') {
      this.captureBall(frame, reg, out);
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
    const first = found[0];
    const idx = this.ring.findIndex((f) => f.t >= first.t);
    const prevT = idx > 0 ? this.ring[idx - 1].t : first.t;
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
    };
    this.triggerT = first.t;
    this.captured = this.ring.filter((f) => f.t >= first.t - this.config.preSec);
    this.preBackground = this.pickPreBackground(first.t);
    this.goneAt = null;
    this.setStatus('capturing', out);
    /* 이미 담긴 장면들로도 공이 사라졌을 수 있다(30fps) — 다음 장면부터 본다 */
  }

  private captureBall(frame: MeterFrame, reg: Float32Array, out: MeterEvent[]) {
    if (this.triggerT == null) return;
    this.captured.push(frame);
    /* 공을 계속 따라가 언제 사라졌는지 안다 — 계산할 장면을 거기서 자른다(emitJob) */
    if (this.goneAt == null && this.watch!.follow(frame.t, reg, this.period())) {
      this.goneAt = this.watch!.lastSeen() ?? frame.t;
    }
    if (
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

  /** 배경 기록 — HISTORY_STEP_SEC 마다 한 장 */
  private record(frame: MeterFrame, reg: Float32Array | null) {
    const last = this.history[this.history.length - 1];
    if (last && frame.t - last.t < HISTORY_STEP_SEC) return;
    this.history.push({
      t: frame.t,
      luma: frame.luma,
      reg: reg ?? this.watch?.region(frame.luma) ?? null,
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
    this.setStatus('capturing', out);
  }

  /* 던진 뒤 프레임을 모은다. 시간이나 장수가 차면 계산으로 넘긴다 */
  private captureMotion(frame: MeterFrame, out: MeterEvent[]) {
    if (this.triggerT == null) return;
    this.captured.push(frame);
    const enough =
      frame.t - this.triggerT >= this.config.motionPostSec ||
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
    const ball = this.ball;
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
      analysisFrames = frames.filter((f) => f.t <= until);
    }
    /* 장면 시각을 고르게 편다(regularTimes) — 흔들림이 크면 그대로 */
    const rawTimes = analysisFrames.map((f) => f.t);
    const even = regularTimes(rawTimes);
    if (even)
      analysisFrames = analysisFrames.map((f, i) => ({ t: even[i], luma: f.luma }));
    const job: CaptureJob = {
      id: ++this.seq,
      triggerT,
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
    this.ball = null;
    this.preBackground = [];
    this.goneAt = null;
    this.setStatus('analyzing', out);
    out.push({ kind: 'capture', job });
  }
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
  | 'LOW_FPS'
  | 'TIMING'
  | 'APPROACH'
  | 'LOW_RES'
  | 'CROPPED'
  | 'FOV_GUESS'
  | 'ZOOM'
  | 'HDR'
  | 'BLUR';
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
  for (const i of items) if (i.text) notes.push({ code: i.code, text: i.text });
  return {
    notes,
    sigmaRel:
      Math.round(
        Math.hypot(LIVE_DOMAIN_SIGMA_REL, ...items.map((i) => i.sigma)) * 1000
      ) / 1000,
    fps,
    focalFrom: camera.focalPx && camera.focalPx > 0 ? 'lens' : 'fov',
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
  let shakePx = 0;
  for (let i = 1; i < frames.length; i++) {
    shakePx = Math.max(
      shakePx,
      cornerShift(frames[i - 1].luma, frames[i].luma, camera.width, camera.height)
    );
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

/** 일감을 계산한다(워커 · 메인 스레드 · 노드 시험 모두 이것) — 결과에 촬영 조건 알림(live)을 붙인다 */
export function analyzeJob(
  job: CaptureJob,
  camera: LiveCamera,
  extra: Partial<AnalyzeFramesInput> = {}
): LiveAnalyzeResult {
  const result = analyzeFrames(liveAnalysisInput(job, camera, extra));
  return { ...result, live: liveReport(job.fps, camera, result, job.timing ?? null) };
}
