'use client';

import { prepareDetachedVideo, waitForFirstFrame } from './video-open.ts';
import { toLuma } from './detect.ts';
import {
  analyzeScale,
  analyzeFrames,
  cornerShift,
  DEFAULT_FOV_DEG,
  type AnalyzeFramesInput,
  type AnalyzeResult,
  type Approach,
  type CapturedFrame,
} from './analyze-frames.ts';
import { focalPxFromFov } from './geometry.ts';
import {
  isHdr,
  planFrameSeeks,
  readVideoColor,
  readVideoFps,
  readVideoFrameTable,
  sampleIndexAt,
  seekTimeOf,
  transferName,
  type FrameTable,
  type VideoColor,
  type VideoTransfer,
} from './video-fps.ts';
import { isCalibratedCamera, readVideoLens, videoFovInfo } from './video-lens.ts';
import {
  analyzeByDistance,
  AUTO_FOV_GUESS_NOTE,
  AUTO_FOV_GUESS_SIGMA_REL,
  type DistanceReport,
} from './analyze-distance.ts';
import {
  anchoredBackgroundTimes,
  coarseGrid,
  denseBandTimes,
  planThrowWindows,
  WINDOW_SEC,
  type AnalysisWindow,
  type ThrowPlan,
  type ThrowSample,
} from './find-throw.ts';

export { DEFAULT_FOV_DEG, type AnalyzeResult } from './analyze-frames.ts';

/**
 * 브라우저에서 영상 파일을 읽어 구속을 잰다.
 *
 * 서버로 영상을 보내지 않는다. 브라우저가 이미 그 파일을 열 수 있고, 영상은
 * 용량이 커서 올리고 내리는 데 시간이 오래 걸리기 때문이다. 폰에서 열어도
 * 같은 코드가 그대로 돈다.
 *
 * 프레임을 한 장씩 꺼내 앞 장과 비교하는 방식이라, 영상 길이에 비례해 시간이
 * 걸린다. 그래서 투구 구간만 잘라 보도록 시작·끝 시각을 받는다.
 *
 * 여기는 프레임을 꺼내는 일만 한다. 계산은 analyze-frames.ts — 카메라로 바로 잴 때와
 * 같은 코드다. 구간을 정하는 계산은 find-throw.ts, 장면 시각 · 색은 video-fps.ts(모두 브라우저 없이 시험한다).
 *
 * 분석 크기(짧은 변 ANALYZE_SHORT_SIDE = 720)를 그렇게 둔 까닭: 원본 그대로 훑으면 브라우저가
 * 버벅인다. 너무 줄이면 멀어진 공이 몇 픽셀로 뭉개져 감지 한계에 걸리므로, 둘 사이에서
 * 720 을 쓴다. 지름을 원본 기준으로 되돌릴 때 이 배율을 함께 곱하므로 결과가 달라지지는
 * 않는다.
 */

/**
 * 한 번에 훑는 최대 프레임 수.
 *
 * 처음에 400장으로 뒀더니 1.2초짜리 영상 하나에 34초가 걸렸다. 프레임을 한 장
 * 꺼낼 때마다 영상을 그 시각으로 되감아야 해서, 장수가 곧 시간이다.
 *
 * 구속을 내는 데는 그만큼 필요하지 않다. 공이 쓸 만한 크기로 찍히는 구간은
 * 릴리스 직후 0.2~0.3초뿐이고, 그 안에서 스무 장 남짓만 있으면 충분하다.
 * 240fps로 찍어도 이 상한 안에서 고르게 뽑아 쓴다.
 */
const MAX_FRAMES = 120;

/**
 * 거친 장면의 가로 크기(픽셀). 160 이던 것을 320 으로 — 던진 때를 공 자체로 찾으려면(find-throw.ts) 막 던진 공
 * (원본 40~50px)이 몇 장 더 보여야 한다. 160 에서는 공이 3~7px 라, 크롬이 실제로 그린 가로 160 장면에서 공을 잴 수
 * 있는 16개 중 2개(89288ada · eb05ae07)를 놓쳤다. 크게 줄이므로 브라우저에 좋은 품질로 줄이게 한다
 * (imageSmoothingQuality 'high' — 작은 공이 깨지지 않게).
 */
const COARSE_WIDTH = 320;

/**
 * 배경을 공 시각에 묶나(find-throw.ts anchoredBackgroundTimes). analyze-frames 가 inWindowBackground 입력을 알아야 효과가
 * 있다 — 모르는 엔진이면 이 장면들이 예전 배경 장면 자리에 더해질 뿐이다.
 */
const ANCHOR_BACKGROUND = true;

/** 구간 밖에서 더 가져오는 배경 장면의 시각 — 영상 처음 · 가운데 · 끝(구간 안이면 뺀다) */
export function backgroundTimes(window: { from: number; to: number }, duration: number): number[] {
  return [0, duration * 0.5, Math.max(0, duration - 0.05)].filter((t) => !(t >= window.from && t <= window.to));
}

export type AnalyzeOptions = {
  file: File;
  /** 분석 시작 시각(초). 비우면 처음부터 */
  startSec?: number;
  /** 분석 끝 시각(초). 비우면 끝까지 */
  endSec?: number;
  /**
   * 영상의 fps(video-fps.ts 의 readVideoFps). 알면 그 장면 간격 그대로 꺼내고, 구간을 안 줬으면 던진 때 앞뒤
   * 1초(WINDOW_SEC)만 본다. null 이면 모르는 것으로 보고 예전처럼 촘촘히 훑어 같은 장면을 걸러 낸다.
   * 아예 주지 않으면(undefined) 여기서 파일 머리를 읽는다 — 앱의 '파일로 재기'가 fps 를 넘기지 않아 올린 mp4 · mov 도
   * 촘촘히 훑던 것을 바로잡는다.
   */
  fps?: number | null;
  /** 카메라 화각(도). 보정을 하지 않았으면 기본값을 쓴다 */
  fovDeg?: number;
  /** 진행 상황 알림 (0~1) */
  onProgress?: (ratio: number) => void;
  /** 공이 멀어지나(투수 뒤, 기본) 다가오나(포수 뒤) */
  approach?: Approach;
  /** 공으로 보정한 초점거리(긴 변 픽셀당) — 있으면 화각 대신 쓴다 */
  focalPerLongSide?: number | null;
  /** 포수 뒤: 카메라에서 릴리스 지점까지(m) — 릴리스 구속을 되돌릴 때 */
  releaseDistanceM?: number | null;
  /** 진단용 — 결과에 장면마다 찾은 덩어리 전부를 싣는다(analyze-frames.ts) */
  debug?: boolean;
  /**
   * 엔진 2.0 의 거리 자(m) — 투수 뒤는 카메라 → 그물 · 미트, 포수 뒤는 카메라 → 릴리스. 주면 거리로 잰다(analyze-distance.ts):
   * 구간을 공 앞 0.1초부터 1.55초로 늘려 그물에 닿고 튄 장면까지 꺼낸다. 안 주면 1.x(공 지름으로 거리).
   */
  distanceM?: number | null;
  /** 카메라가 아래로 숙인 각(라디안) — 찍을 때 폰 기울기 센서로 안 값. 모르면 0 */
  tiltRad?: number | null;
  /** 공이 처음 보인 때(초, 영상 시각)를 이미 알면 — 앱 카메라의 공 알림. 구간을 줬을 때 공 찾기를 그 둘레부터 한다 */
  seedT?: number | null;
  /** 거친 훑기에서 날아가는 공을 믿었을 때 한 번(구간 장면을 꺼내기 전) — 조용히 재던 클립이 '인식했어요'로 바뀐다 */
  onBall?: () => void;
  /** 거리를 공 크기로 어림한다(analyze-distance autoDistance) — distanceM 은 첫 어림 */
  distanceAuto?: boolean;
  /** fovDeg 가 잰 값인가(앱 동시 촬영의 videoFieldOfView) — 안 주면 파일의 렌즈 정보 · 렌즈 보정이 있을 때만 잰 값으로 본다 */
  fovKnown?: boolean;
  /**
   * 장면 꺼내기 — 'decode'(기본): 하드웨어 디코더(WebCodecs)로 차례로 풀어 필요한 장면만 그린다, 못 하면 'seek' 로.
   * 'seek': <video> 를 장면마다 되감아 그린다(예전 길 — 견주기 · 시험용)
   */
  frames?: 'decode' | 'seek';
};

/** 엔진 2.0 의 분석 구간(초) — 공 앞 0.1초 + 1.3초 담기 + 여유. 76km/h 공도 20m 그물에 닿고 튀는 장면까지 */
const DISTANCE_WINDOW_SEC = 1.55;

/** 영상 파일로 잰 결과에 덧붙이는 것 — 어느 구간을 어떻게 꺼내 쟀나 */
export type VideoAnalysisInfo = {
  /** 결과를 낸 구간 */
  window: AnalysisWindow;
  /** 재 본 구간들(차례대로)과 그 결과 — 공 구간이 거부돼 예전 구간으로 다시 쟀으면 둘 */
  tried: { kind: AnalysisWindow['kind']; from: number; to: number; ok: boolean; code: string | null }[];
  /** 거친 장면에서 공이 처음 보인 때(초) · 이음 수 · 믿었나. 공을 찾지 않았거나 못 찾았으면 null */
  ballT: number | null;
  ballLinks: number | null;
  ballAccepted: boolean | null;
  /** 가장 크게 움직인 때(초) */
  peak: number | null;
  /** 장면을 어떻게 짚었나 — 'table' 파일의 장면 시각 표 · 'grid' (i+0.5)/fps · 'scan' fps 를 몰라 촘촘히 */
  frameTimes: 'table' | 'grid' | 'scan';
  /** 앞 장면과 한 픽셀도 다르지 않아 버린 장면 수(표와 브라우저 시각이 어긋났다는 뜻 — 보통 0) */
  duplicatesDropped: number;
  /**
   * 파일의 색 정보와 그 전달 함수 이름(진단용). 엔진에는 넘기지 않는다 — 캔버스에 그린 값은 늘 엔진 기본값으로 잰다
   * (video-fps.ts '엔진에 넘기지 않는 까닭'). HDR 이면 신뢰도를 낮추고 알림을 단다.
   */
  color: VideoColor | null;
  transfer: VideoTransfer;
  hdr: boolean;
  /**
   * 보정한 조건 안인가 — 아이폰 15 Pro · Pro Max 메인(24mm) · SDR · 50~70fps(analyze-frames calibrated). 아니면 ± 가
   * 넓고 믿음이 '보통'까지다.
   */
  calibrated: boolean;
  /** 사용자에게 보일 만한 알림(한국어) */
  notes: string[];
  /**
   * 걸린 시간(ms) — 폰에서 어디가 느린지 보려고. coarse: 거친 훑기 되감기 · 그리기, find: 공 찾기 계산,
   * frames: 구간 장면 · 배경 되감기 · 그리기(구간 모두), analyze: analyzeFrames(구간 모두), seeks: 되감은 횟수
   */
  timing: {
    coarseMs: number;
    findMs: number;
    framesMs: number;
    analyzeMs: number;
    totalMs: number;
    seeks: number;
    /** 되감기를 기다린 시간 · 그려 밝기로 읽은 시간(ms, 거친 훑기 · 구간 모두) — 어느 쪽이 느린지 */
    seekWaitMs: number;
    drawMs: number;
    /** 하드웨어 디코더로 푼 장면 수(0 이면 되감기로만 꺼냄) */
    decoded: number;
    /** 디코더를 연 시간(ms, 모듈 · 파일 머리 · 길이) */
    openMs: number;
  };
};

export type VideoAnalyzeResult = AnalyzeResult & { video: VideoAnalysisInfo; distance?: DistanceReport };

/**
 * HDR(HLG · PQ) 영상은 브라우저가 캔버스에 그릴 때 알 수 없는 곡선으로 SDR 로 바꾼다 — 공 가장자리 밝기와 덮은
 * 비율의 관계가 SDR 과 달라 지름이 몇 % 어긋날 수 있다(확인할 HDR 짝 자료가 없다). 그래서 재기는 하되(아이폰 기본
 * 설정이라 막으면 대부분 못 잰다) 신뢰도를 '중간' 밑으로 두고 SDR 로 찍기를 권한다.
 */
const HDR_NOTE =
  'HDR 영상이라 값이 조금 어긋날 수 있어요. 설정 › 카메라 › 비디오 녹화에서 HDR 비디오를 끄고 찍으면 더 정확합니다.';

/** 보정한 조건의 초당 장면 수 — 60fps 영상(59.94 · 가변 60 포함). 240fps 는 노출 번짐이 달라 합성 시험에서 +3% */
const CALIBRATED_FPS: [number, number] = [50, 70];

/**
 * HDR 의 ± 에 더할 σ(비율). HLG → SDR 로 그릴 때의 밝은 쪽 곡선을 실제 영상에 입혀 보면 값이 −4.4% ± 1.5%(최대 −6.9%)
 * 움직였다(2차 검증 — 견고성). HDR 짝 자료가 생길 때까지 믿음은 '낮음(참고용)', ± 는 이만큼 넓게.
 */
const HDR_SIGMA_REL = 0.055;

/** 보정한 조건 밖(HDR 은 위 알림으로 대신) — 값은 그대로 보이되 ± 가 넓다는 것을 알린다 */
const OUT_OF_DOMAIN_NOTE =
  '스피드건으로 맞춘 촬영(아이폰 15 Pro · 1배 · 60fps)과 달라 ±를 넓게 잡았어요. 스피드건 값을 같이 적어 두면 이 조건도 맞출 수 있어요.';

function waitForEvent(
  el: HTMLVideoElement,
  event: string,
  ms: number
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      el.removeEventListener(event, ok_);
      el.removeEventListener('error', fail);
      clearTimeout(timer);
      resolve(ok);
    };
    const ok_ = () => finish(true);
    const fail = () => finish(false);
    const timer = setTimeout(() => finish(false), ms);
    el.addEventListener(event, ok_);
    el.addEventListener('error', fail);
  });
}

/** 두 장면이 한 픽셀도 다르지 않은가 — 대개 첫 몇백 픽셀에서 다름이 나와 바로 끝난다 */
function sameExact(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** 지금 시각(ms) — 걸린 시간 재기용 */
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function analyzeVideo(options: AnalyzeOptions): Promise<VideoAnalyzeResult> {
  const startedAt = now();
  const timing = {
    coarseMs: 0,
    findMs: 0,
    framesMs: 0,
    analyzeMs: 0,
    totalMs: 0,
    seeks: 0,
    seekWaitMs: 0,
    drawMs: 0,
    decoded: 0,
    openMs: 0,
  };
  const {
    file,
    startSec,
    endSec,
    fovDeg = DEFAULT_FOV_DEG,
    onProgress,
    approach = 'receding',
    focalPerLongSide = null,
    releaseDistanceM = null,
    debug = false,
  } = options;
  const distanceM = options.distanceM && options.distanceM > 0 ? options.distanceM : null;
  const nativeFps = options.fps === undefined ? await readVideoFps(file) : options.fps;
  const fps = nativeFps != null && nativeFps > 0 ? nativeFps : null;
  /* 장면 시각 표 · 색 — moov 만 읽는다(수십 KB) */
  const table: FrameTable | null = fps ? await readVideoFrameTable(file) : null;
  const color = await readVideoColor(file);
  const transfer = transferName(color);
  const hdr = isHdr(color);
  /* 보정한 조건 안인가(analyze-frames calibrated) — 렌즈 · fps · HDR 모두 파일 머리(moov)에서 */
  const lensInfo = await readVideoLens(file);
  const calibrated =
    isCalibratedCamera(lensInfo) &&
    fps != null &&
    fps >= CALIBRATED_FPS[0] &&
    fps <= CALIBRATED_FPS[1] &&
    !hdr &&
    approach === 'receding';

  /*
   * 하드웨어 디코더(WebCodecs) — 열리면 크기 · 길이도 여기서 읽고 장면도 여기서 푼다. <video> 는 되감기 길(거친 훑기 · 디코더가
   * 못 푼 장면)이 필요할 때만 깨운다 — 깨우기(첫 장면 기다림)만 해도 시간이 들고, 시뮬레이터 웹킷은 앱 클립(fMP4)의 첫 장면을 30초
   * 안에 못 받았다(2026-10-09).
   */
  const o0 = now();
  const dec = options.frames !== 'seek' ? await openDecoder(file).catch(() => null) : null;
  timing.openMs = now() - o0;
  let decodeOk = dec != null;
  const url = URL.createObjectURL(file);
  let video: HTMLVideoElement | null = null;
  const getVideo = async () => {
    if (video) return video;
    const v = document.createElement('video');
    /*
     * 아이폰 웹킷은 preload='auto' 여도 길이 · 크기(loadedmetadata)에서 멈춰 첫 장면(loadeddata)이 안 온다 — 소리 없이 한 번 틀었다
     * 멈춰 깨운다(video-open.ts). 그냥 기다리면 측정 화면 '파일로 재기'가 30초 뒤 '영상을 열지 못했습니다'로 끝났다(2026-10-07,
     * iOS 시뮬레이터 사파리로 재현).
     */
    prepareDetachedVideo(v);
    v.src = url;
    video = v;
    if ((await waitForFirstFrame(v, 30_000)) !== 'ok') throw new Error('영상을 열지 못했습니다.');
    return v;
  };

  try {
    const sourceW = dec?.width ?? (await getVideo()).videoWidth;
    const sourceH = dec?.height ?? (await getVideo()).videoHeight;
    if (!sourceW || !sourceH) throw new Error('영상 크기를 읽지 못했습니다.');

    const scale = analyzeScale(sourceW, sourceH);
    const width = Math.round(sourceW * scale);
    const height = Math.round(sourceH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('화면을 준비하지 못했습니다.');

    /* 되감아 그린다. 표가 있으면 늘 그 장면의 한가운데를 짚는다(경계에 걸려 앞 · 뒤 장면을 오가지 않게) */
    const seekTo = async (t: number) => {
      const v = await getVideo();
      timing.seeks++;
      const s0 = now();
      v.currentTime = t;
      const ok = await waitForEvent(v, 'seeked', 10_000);
      timing.seekWaitMs += now() - s0;
      return ok;
    };
    const snap = (t: number) => (table ? seekTimeOf(table, sampleIndexAt(table, t)) : t);
    const grab = () => {
      const d0 = now();
      ctx.drawImage(video as HTMLVideoElement, 0, 0, width, height);
      const luma = toLuma(ctx.getImageData(0, 0, width, height).data, width, height);
      timing.drawMs += now() - d0;
      return luma;
    };

    /*
     * 1) 훑을 구간. 구간을 받았으면 그대로. fps 를 아는 긴 영상은 거친 장면에서 날아가는 공 자체를 찾아 그 직전부터
     *    1초(find-throw.ts) — 예전처럼 화면이 가장 크게 바뀐 때로 잡으면 카메라 앞 몸의 움직임(던지기 전 글러브 팔 ·
     *    던진 뒤 따라 나오는 몸 · 영상 첫머리 준비 동작)에 끌려, 구간이 던지기 전에 끝나거나(89288ada) 릴리스 첫 장면을
     *    잘랐다(af31e8d0 · f43a7958). 공으로 잡은 구간에서 재지 못하면 예전 구간으로 한 번 더 잰다.
     */
    const duration = dec?.duration ?? (await getVideo()).duration;
    let plan: ThrowPlan | null = null;
    let windows: AnalysisWindow[];
    let progressFrom = 0;
    if (startSec != null || endSec != null) {
      const from = Math.max(0, startSec ?? 0);
      windows = [{ kind: 'range', from, to: Math.min(endSec ?? duration, duration) }];
    } else if (fps && duration > WINDOW_SEC) {
      const focalLong = focalPerLongSide
        ? focalPerLongSide * Math.max(sourceW, sourceH)
        : focalPxFromFov(Math.max(sourceW, sourceH), fovDeg);
      const c0 = now();
      plan = await planFromCoarse(await getVideo(), duration, table, approach, focalLong / sourceW, timing, (r) =>
        onProgress?.(r * 0.15)
      );
      if (plan.ball?.accepted) options.onBall?.();
      timing.coarseMs = now() - c0 - timing.findMs;
      progressFrom = 0.15;
      windows = plan.windows;
    } else {
      windows = [{ kind: 'whole', from: 0, to: duration }];
    }
    /* 엔진 2.0 은 그물에 닿고 튄 장면까지 — 구간을 늘린다(시작은 그대로 공 앞 0.1초) */
    if (distanceM && startSec == null && endSec == null)
      windows = windows.map((w) => (w.kind === 'whole' ? w : { ...w, to: Math.min(duration, w.from + DISTANCE_WINDOW_SEC) }));

    /*
     * 2) 구간마다 장면을 꺼내 잰다. 꺼낸 장면은 장면 번호로 기억해 두 구간이 겹치는 만큼 다시 되감지 않는다 —
     *    다음 구간으로 넘어갈 때 그 구간에 없는 장면은 버려 메모리는 한 구간(최대 120장)만큼만 쓴다.
     */
    const cache = new Map<string, Float32Array>();
    /*
     * 배경: 공을 믿었으면 공 시각에 묶은 장면들(find-throw.ts anchoredBackgroundTimes)만 쓰고 구간 안에서 따로 뽑지 않게
     * 한다(inWindowBackground 0) — 어느 구간으로 재든 배경이 같아 값이 구간 자리에 흔들리지 않는다. 공을 못 찾았으면 예전처럼
     * 구간 밖 처음 · 가운데 · 끝 + 엔진이 구간 안에서 뽑는 7장.
     */
    const anchorT = ANCHOR_BACKGROUND && plan?.ball?.accepted ? plan.ball.prevT : null;
    const sampleKey = (t: number) => (table ? `s${sampleIndexAt(table, t)}` : `b${t}`);
    const tried: VideoAnalysisInfo['tried'] = [];
    let duplicatesDropped = 0;
    let first: { result: AnalyzeResult; window: AnalysisWindow } | null = null;
    let firstError: unknown = null;
    const span = 0.8 - progressFrom;
    for (const [w, win] of windows.entries()) {
      if (!(win.to - win.from > 0)) continue;
      const p0 = progressFrom + (w === 0 ? 0 : span * 0.8);
      const p1 = w === 0 ? progressFrom + span : 0.95;
      /*
       * 꺼낼 시각들. fps 를 알면 예전 격자((i+0.5)/fps)의 장면을 그대로 꺼내되 표로 그 장면의 한가운데를 짚고
       * 고르게 편 시계로 이름표를 단다(video-fps.ts planFrameSeeks). fps 를 모르면 흔한 촬영 프레임(240fps)까지
       * 담을 수 있게 촘촘히 훑고, 같은 장면이 두 번 나오면 걸러낸다(analyzeFrames).
       */
      let planned: { key: string; seek: number; t: number }[];
      let sampleFps: number | null = null;
      if (fps) {
        const p = planFrameSeeks({ from: win.from, to: win.to, fps, table, maxFrames: MAX_FRAMES });
        planned = p.frames.map((f) => ({ key: f.sample != null ? `s${f.sample}` : `t${f.seek}`, seek: f.seek, t: f.t }));
        sampleFps = p.sampleFps;
      } else {
        const step = Math.max((win.to - win.from) / MAX_FRAMES, 1 / 240);
        planned = [];
        for (let t = win.from; t <= win.to; t += step) planned.push({ key: `t${t}`, seek: t, t });
      }
      const bgPlan = (anchorT != null ? anchoredBackgroundTimes(anchorT, duration) : backgroundTimes(win, duration)).map(
        (t) => ({ key: sampleKey(t), seek: snap(t) })
      );
      const keep = new Set([...planned.map((q) => q.key), ...bgPlan.map((b) => b.key)]);
      for (const k of [...cache.keys()]) if (!keep.has(k)) cache.delete(k);

      /*
       * 프레임을 한 장씩 꺼내 밝기만 남겨 둔다. 흔들림은 여기서 잰다 — 같은 장면을 걸러내기 전의 모든 장면이 기준이다.
       * fps 를 알면 같은 장면 거르기(analyzeFrames 의 isSameFrame)를 끈다 — 장면마다 한 번씩 꺼냈으면 거를 것이 없고,
       * 거르면 멀어져 작아진 공이 든 장면까지 '같은 장면'(드문드문 짚어 본 밝기 차이가 작다)으로 버려졌다. 대신 앞 장과
       * 한 픽셀도 다르지 않은 장면만 버린다 — 표와 브라우저의 시각이 어긋나 같은 장면을 두 번 받았을 때의 안전장치.
       */
      const frames: CapturedFrame[] = [];
      let shakePx = 0;
      const f0 = now();
      /* 하드웨어 디코더로 이 구간 · 배경 장면을 한 번에 — 되감기(장면마다 'seeked' 기다림)를 건너뛴다. 못 풀면 아래 되감기가 마저 */
      if (dec && decodeOk) {
        decodeOk = await dec
          .fill(
            [...planned, ...bgPlan],
            cache,
            { width, height },
            (draw) => {
              draw(ctx, width, height);
              return toLuma(ctx.getImageData(0, 0, width, height).data, width, height);
            },
            (ms) => {
              timing.drawMs += ms;
              timing.decoded++;
            }
          )
          .then(() => true)
          .catch(() => false);
      }
      for (const [k, q] of planned.entries()) {
        let luma = cache.get(q.key);
        if (!luma) {
          if (!(await seekTo(q.seek))) break;
          luma = grab();
          cache.set(q.key, luma);
        }
        const prev = frames[frames.length - 1];
        if (prev) {
          shakePx = Math.max(shakePx, cornerShift(prev.luma, luma, width, height));
          if (fps && sameExact(prev.luma, luma)) {
            duplicatesDropped++;
            continue;
          }
        }
        frames.push({ t: q.t, luma });
        // 프레임 꺼내기가 전체 작업의 대부분이라 여기까지를 8할로 본다.
        onProgress?.(p0 + ((k + 1) / planned.length) * (p1 - p0));
      }

      /* 배경 장면 — 구간 장면과 겹치면(장면 번호가 같으면) 다시 되감지 않는다 */
      const backgroundSamples: Float32Array[] = [];
      for (const b of bgPlan) {
        let luma = cache.get(b.key);
        if (!luma) {
          if (!(await seekTo(b.seek))) continue;
          luma = grab();
          cache.set(b.key, luma);
        }
        backgroundSamples.push(luma);
      }
      timing.framesMs += now() - f0;

      const input: AnalyzeFramesInput = {
        frames,
        backgroundSamples,
        width,
        height,
        sourceWidth: sourceW,
        sourceHeight: sourceH,
        fovDeg,
        focalPx: focalPerLongSide ? focalPerLongSide * Math.max(sourceW, sourceH) : undefined,
        shakePx,
        approach,
        releaseDistanceM,
        /*
         * 초당 장면 수는 센 값 대신 꺼낸 간격으로 준다. 가만히 있는 장면은 앞 장과 똑같아 걸러지므로 남은 장수로
         * 세면 60fps 영상도 50 밑으로 나와 '장면 수 부족'으로 거부됐다.
         */
        fps: sampleFps,
        debug,
        /* 구간이 던지기 한참 전부터라 공이 처음 보이는 장면이 뒤쪽에 있을 수 있다 — 전부에서 찾는다 */
        seedFrames: Number.POSITIVE_INFINITY,
        /*
         * transfer 는 넘기지 않는다 — 캔버스 값은 카메라로 바로 잴 때와 같은 엔진 기본값으로 잰다. 파일의 색 상자대로
         * 'bt709' 를 넘기면 구속이 평균 −0.38% 달라져 카메라와 배율이 어긋난다(video-fps.ts '엔진에 넘기지 않는 까닭').
         */
        /* 공 시각에 묶은 배경을 줬으면 구간 안에서 더 뽑지 않는다(analyze-frames 의 새 입력 — 없으면 7) */
        ...(anchorT != null ? { inWindowBackground: 0 } : {}),
        calibrated,
        ...(hdr ? { domainSigmaRel: HDR_SIGMA_REL } : {}),
      };
      let result: AnalyzeResult & { distance?: DistanceReport };
      const a0 = now();
      try {
        result = distanceM
          ? analyzeByDistance({
              frames,
              backgroundSamples,
              width,
              height,
              sourceWidth: sourceW,
              sourceHeight: sourceH,
              focalPx: focalPerLongSide
                ? focalPerLongSide * Math.max(sourceW, sourceH)
                : focalPxFromFov(Math.max(sourceW, sourceH), fovDeg),
              distanceM,
              approach,
              tiltRad: options.tiltRad ?? 0,
              fps: sampleFps,
              seedHint: plan?.ball?.accepted
                ? { t: plan.ball.t }
                : options.seedT != null
                  ? { t: options.seedT }
                  : null,
              shakePx,
              autoDistance: options.distanceAuto ?? false,
            })
          : analyzeFrames(input);
        timing.analyzeMs += now() - a0;
      } catch (e) {
        timing.analyzeMs += now() - a0;
        /* 장면이 3장도 안 되는 등 — 다음 구간이 있으면 그것으로 */
        tried.push({ kind: win.kind, from: win.from, to: win.to, ok: false, code: 'ERROR' });
        firstError ??= e;
        continue;
      }
      tried.push({
        kind: win.kind,
        from: win.from,
        to: win.to,
        ok: result.measure.ok,
        code: result.measure.ok ? null : result.measure.code,
      });
      first ??= { result, window: win };
      if (result.measure.ok) {
        first = { result, window: win };
        break;
      }
    }
    onProgress?.(1);
    if (!first) throw firstError instanceof Error ? firstError : new Error('영상을 재지 못했습니다.');

    const { result, window } = first;
    const notes: string[] = [];
    if (distanceM) {
      /* 엔진 2.0 은 공 지름을 쓰지 않아 HDR · 다른 카메라의 알림이 맞지 않는다 — 끝을 이어 찾았을 때만 */
      const d = (result as { distance?: DistanceReport }).distance;
      if (result.measure.ok && d && d.extended > 0)
        notes.push('공이 그물 · 미트 앞에서 흐려져 끝을 이어 찾아 쟀어요. 값이 조금 어긋날 수 있어요.');
      /*
       * 공 크기로 어림한 거리는 초점거리에 비례한다 — 렌즈 정보(아이폰 메인 센서)도 렌즈 보정도 없으면 화각을 짐작한 만큼 틀린다.
       * ± 를 넓히고 믿음을 '낮음'으로, 거리를 재서 넣게 권한다.
       */
      const fovKnown = options.fovKnown ?? (videoFovInfo(lensInfo) != null || !!focalPerLongSide);
      if (result.measure.ok && d?.distanceSource === 'ball' && !fovKnown) {
        const m = result.measure;
        m.errorKmh = Math.round(1.645 * m.kmh * Math.hypot(m.errorKmh / 1.645 / m.kmh, AUTO_FOV_GUESS_SIGMA_REL) * 10) / 10;
        m.confidence = 'low';
        notes.push(AUTO_FOV_GUESS_NOTE);
      }
    } else if (hdr) {
      notes.push(HDR_NOTE);
      /* 믿음은 '낮음(참고용)' — 값은 그대로 보인다(± 는 analyzeFrames 가 HDR_SIGMA_REL 로 넓혔다) */
      if (result.measure.ok) result.measure.confidence = 'low';
    } else if (!calibrated && result.measure.ok) {
      notes.push(OUT_OF_DOMAIN_NOTE);
    }
    return {
      ...result,
      video: {
        window,
        tried,
        ballT: plan?.ball ? plan.ball.t : null,
        ballLinks: plan?.ball ? plan.ball.links : null,
        ballAccepted: plan?.ball ? plan.ball.accepted : null,
        peak: plan?.peak ?? null,
        frameTimes: fps ? (table ? 'table' : 'grid') : 'scan',
        duplicatesDropped,
        color,
        transfer,
        hdr,
        calibrated,
        notes,
        timing: { ...timing, totalMs: now() - startedAt },
      },
    };
  } finally {
    if (video) (video as HTMLVideoElement).src = '';
    URL.revokeObjectURL(url);
    dec?.dispose();
  }
}

/**
 * 디코더 미리 데우기 — 측정을 시작할 때(DualCapture.arm) 한 번. 디코더 모듈을 받아 두고, 밝기 만들기(lumaOfSample)를 빈 장면으로 한 번
 * 돌려 JIT 를 데우고 Y 버퍼를 잡아 둔다 — 첫 공 계산에서 이것들이 0.4초쯤 먹었다(2026-10-09 폰, 가짜 공).
 */
export async function warmDecoder(): Promise<void> {
  if (typeof VideoDecoder === 'undefined') return;
  await import('mediabunny');
  const w = 1920;
  const h = 1080;
  await lumaOfSample(
    {
      format: 'NV12',
      rotation: 90,
      codedWidth: w,
      visibleRect: { left: 0, top: 0, width: w, height: h },
      colorSpace: { fullRange: false },
      allocationSize: () => (w * h * 3) / 2,
      copyTo: async () => [{ offset: 0, stride: w }],
    },
    720,
    1280
  );
}

/** 영상 범위(16~235) → 0~255, 반올림 · 자름 — 맥 도구 native-decode(decode-range.swift src)와 같은 셈 */
const VIDEO_RANGE = Uint8Array.from({ length: 256 }, (_, v) => Math.max(0, Math.min(255, Math.round(((v - 16) * 255) / 219))));
const FULL_RANGE = Uint8Array.from({ length: 256 }, (_, v) => v);
let yBuffer = new Uint8Array(0);

/**
 * 풀어낸 장면의 밝기 면(Y, NV12 · I420)을 분석 크기 밝기로 — 범위를 펴고(VIDEO_RANGE), 돌림(rotation)을 반영해, 이중선형으로 줄여
 * 반올림한다. 맥 도구(~/bullpen-velocity-lab/native-decode, 실험대 app-rerun · session-audit 가 쓰는 장면)와 한 셈이라, 맥에서
 * 재 본 값이 앱 값과 같다. 예전 캔버스 길(drawImage → RGB → 0.299R+0.587G+0.114B)은 브라우저마다 줄이는 필터 · 색 변환이
 * 달라(크롬 · 웹킷 픽셀 차 최대 1~10) 같은 영상도 값이 조금씩 갈렸다. 다른 형식이면 null — 캔버스로 그린다.
 */
export async function lumaOfSample(
  sample: {
    format: string | null;
    rotation: number;
    codedWidth: number;
    visibleRect: { left: number; top: number; width: number; height: number };
    colorSpace: { fullRange?: boolean | null };
    allocationSize: () => number;
    copyTo: (dest: Uint8Array) => Promise<{ offset: number; stride: number }[]>;
  },
  W: number,
  H: number
): Promise<Float32Array | null> {
  if (sample.format !== 'NV12' && sample.format !== 'I420') return null;
  const need = sample.allocationSize();
  if (yBuffer.length < need) yBuffer = new Uint8Array(need);
  const layout = await sample.copyTo(yBuffer);
  const { offset, stride } = layout[0];
  const { left, top, width: w, height: h } = sample.visibleRect;
  const lut = sample.colorSpace.fullRange ? FULL_RANGE : VIDEO_RANGE;
  const rot = ((sample.rotation % 360) + 360) % 360;
  const PW = rot === 90 || rot === 270 ? h : w;
  const PH = rot === 90 || rot === 270 ? w : h;
  /* 세로 자리 (x, y) → 원본 자리의 첫 칸: col[x] + row[y] */
  const col = (x: number) =>
    rot === 0 ? x : rot === 90 ? (h - 1 - x) * stride : rot === 180 ? w - 1 - x : x * stride;
  const row = (y: number) =>
    rot === 0 ? y * stride : rot === 90 ? y : rot === 180 ? (h - 1 - y) * stride : w - 1 - y;
  const base = offset + top * stride + left;
  const kx = PW / W;
  const ky = PH / H;
  const cx0 = new Int32Array(W);
  const cx1 = new Int32Array(W);
  const fxs = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    const sx = (x + 0.5) * kx - 0.5;
    const x0 = Math.max(0, Math.floor(sx));
    cx0[x] = col(x0);
    cx1[x] = col(Math.min(PW - 1, x0 + 1));
    fxs[x] = sx - x0;
  }
  const out = new Float32Array(W * H);
  const y = yBuffer;
  for (let oy = 0; oy < H; oy++) {
    const sy = (oy + 0.5) * ky - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const r0 = base + row(y0);
    const r1 = base + row(Math.min(PH - 1, y0 + 1));
    const fy = sy - y0;
    const o = oy * W;
    for (let x = 0; x < W; x++) {
      const fx = fxs[x];
      const a = lut[y[r0 + cx0[x]]] * (1 - fx) + lut[y[r0 + cx1[x]]] * fx;
      const b = lut[y[r1 + cx0[x]]] * (1 - fx) + lut[y[r1 + cx1[x]]] * fx;
      out[o + x] = Math.max(0, Math.min(255, Math.round(a * (1 - fy) + b * fy)));
    }
  }
  return out;
}

/**
 * 하드웨어 디코더(WebCodecs, mediabunny) — 크기(돌림 반영) · 길이와, 장면을 차례로 풀어 아직 없는 장면만 grab 으로 그려 cache 에
 * 넣는 fill. <video> 되감기는 장면마다 'seeked' 를 기다려 앱 클립 100장에 1초 넘게 들었다(2026-10-09 폰). 그리기 · 밝기 셈
 * (drawImage → getImageData → toLuma)은 되감기 길과 같고, 짚는 시각(seek)도 같다 — 그 시각에 보이는 장면(시작이 그 시각 이하인
 * 마지막 장면). 웹코덱이 없거나 코덱을 못 풀면 null — 되감기로 꺼낸다. fill 이 던지면 부르는 쪽이 되감기로 마저 꺼낸다.
 */
async function openDecoder(file: File) {
  if (typeof VideoDecoder === 'undefined') return null;
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) {
      input.dispose();
      return null;
    }
    const [width, height, duration] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.computeDuration(),
    ]);
    const sink = new VideoSampleSink(track);
    return {
      width,
      height,
      duration,
      async fill(
        wants: { key: string; seek: number }[],
        cache: Map<string, Float32Array>,
        size: { width: number; height: number },
        grab: (draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void) => Float32Array,
        /* 한 장을 밝기로 만드는 데 든 시간(ms) — 풀기 기다림은 빼고 */
        onFrame: (ms: number) => void
      ) {
        const seen = new Set<string>();
        const todo = wants
          .filter((w) => !cache.has(w.key) && !seen.has(w.key) && seen.add(w.key))
          .sort((a, b) => a.seek - b.seek);
        let i = 0;
        for await (const sample of sink.samplesAtTimestamps(todo.map((w) => w.seek))) {
          const w = todo[i++];
          if (!sample) continue;
          try {
            /* 밝기 면(Y)을 바로 — 캔버스 그리기 · RGB 읽기를 건너뛰고 맥 실험실 도구와 같은 장면을 만든다. 못 읽는 형식이면 그려서 */
            const t0 = now();
            const luma = await lumaOfSample(sample, size.width, size.height).catch(() => null);
            cache.set(w.key, luma ?? grab((ctx, dw, dh) => sample.draw(ctx, 0, 0, dw, dh)));
            onFrame(now() - t0);
          } finally {
            sample.close();
          }
        }
      },
      dispose: () => input.dispose(),
    };
  } catch (e) {
    input.dispose();
    throw e;
  }
}

/**
 * 거친 훑기 — 영상 전체에서 고른 격자(예전과 같은 48장, find-throw.ts coarseGrid)를 가로 COARSE_WIDTH 로 꺼내 가장
 * 크게 움직인 때를 재고, 긴 영상이면 그 앞뒤 띠를 더 촘촘히 꺼낸 뒤(denseBandTimes) 공을 찾아 구간을 정한다.
 *
 * 비용(2026-09-29, 데스크톱 크롬 · 1080×1920 H.264): 되감기 중앙값 약 19ms, 가로 320 'high' 로 그리기 · 읽기 약 50ms —
 * 48장이면 3초 남짓. 폰은 몇 배 느릴 수 있다. 공 찾기 계산은 노드에서 0.1~0.3초.
 *
 * @param focalPerSourceWidth 초점거리 ÷ 원본 가로(거친 장면 가로를 곱하면 그 장면의 초점거리)
 */
async function planFromCoarse(
  video: HTMLVideoElement,
  duration: number,
  table: FrameTable | null,
  approach: Approach,
  focalPerSourceWidth: number,
  timing: { findMs: number; seeks: number; seekWaitMs: number; drawMs: number },
  onProgress?: (ratio: number) => void
): Promise<ThrowPlan> {
  const w = COARSE_WIDTH;
  const h = Math.max(1, Math.round((w * video.videoHeight) / video.videoWidth));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { times, step } = coarseGrid(duration);
  if (!ctx) return { windows: [{ kind: 'whole', from: 0, to: duration }], ball: null, peak: null };
  /* 크게 줄이므로(원본 1080 → 320) 미리 흐려 줄이게 한다 — 작은 공이 깨지지 않게 */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  /* 표가 있으면 격자 시각에 보이는 장면의 한가운데를 짚고, 공 찾기에는 그 장면의 시계 시각을 쓴다 */
  const at = (t: number) => {
    if (!table) return { seek: t, label: t };
    const k = sampleIndexAt(table, t);
    return { seek: seekTimeOf(table, k), label: table.clock(k) };
  };
  const samples: (ThrowSample & { grid: number })[] = [];
  const drawAt = async (t: number) => {
    const { seek, label } = at(t);
    timing.seeks++;
    const s0 = now();
    video.currentTime = seek;
    const ok = await waitForEvent(video, 'seeked', 10_000);
    timing.seekWaitMs += now() - s0;
    if (!ok) return null;
    const d0 = now();
    ctx.drawImage(video, 0, 0, w, h);
    const luma = toLuma(ctx.getImageData(0, 0, w, h).data, w, h);
    timing.drawMs += now() - d0;
    return { label, luma };
  };

  /* 고른 격자 — 가장 크게 움직인 때는 예전과 똑같이(앞 장과 차이 합이 가장 큰 사이의 한가운데) */
  let prev: Float32Array | null = null;
  let best = -1;
  let peak: number | null = null;
  for (const [j, t] of times.entries()) {
    const got = await drawAt(t);
    if (!got) break;
    if (prev) {
      let diff = 0;
      for (let i = 0; i < got.luma.length; i++) diff += Math.abs(got.luma[i] - prev[i]);
      if (diff > best) {
        best = diff;
        peak = t - step / 2;
      }
    }
    prev = got.luma;
    /* 공 찾기용으로 한 바이트씩(가로 320 · 48장이면 9MB 남짓) */
    if (approach === 'receding') samples.push({ grid: t, t: got.label, luma: Uint8Array.from(got.luma, (v) => Math.round(v)) });
    onProgress?.(((j + 1) / times.length) * 0.8);
  }
  if (approach === 'receding') {
    const band = denseBandTimes(duration, step, peak);
    for (const [j, t] of band.entries()) {
      const got = await drawAt(t);
      if (!got) break;
      samples.push({ grid: t, t: got.label, luma: Uint8Array.from(got.luma, (v) => Math.round(v)) });
      onProgress?.(0.8 + ((j + 1) / band.length) * 0.2);
    }
    samples.sort((a, b) => a.t - b.t);
  }
  onProgress?.(1);
  const p0 = now();
  const plan = planThrowWindows({
    duration,
    approach: approach === 'approaching' ? 'approaching' : 'receding',
    samples,
    width: w,
    height: h,
    focalPx: focalPerSourceWidth * w,
    peak,
  });
  timing.findMs = now() - p0;
  return plan;
}
