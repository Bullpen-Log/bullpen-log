import {
  buildBackground,
  findMovedBlobs,
  trackBall,
  type FrameBlobs,
} from './detect.ts';
import {
  focalPxFromFov,
  toPoint3D,
  type BallObservation,
  type CameraLens,
} from './geometry.ts';
import { checkFootage } from './validate.ts';
import {
  measureVelocity,
  MIN_USABLE_BALL_PX,
  type Approach,
  type MeasureResult,
} from './measure.ts';

export type { Approach } from './measure.ts';

/**
 * 이미 꺼내 둔 프레임(밝기 그림)으로 구속을 잰다 — 계산의 한가운데.
 *
 * 프레임을 어디서 가져오느냐는 두 갈래다.
 *   - 영상 파일: 한 장씩 되감아 꺼낸다 (analyze-video.ts)
 *   - 카메라: 찍히는 대로 받아 둔다 (live-capture.ts)
 * 둘 다 여기로 온다. 계산을 한 곳에 두어야 두 방식의 숫자가 같은 규칙으로 나온다 —
 * 스피드건과 견줘 보정할 때 어느 쪽 값인지 헷갈리지 않는다.
 *
 * 프레임은 분석 해상도(가로 720 정도로 줄인 것)다. 결과의 지름 · 좌표는 원본 해상도로
 * 되돌려 렌즈 정보와 맞춘다.
 */

/** 아이폰 후면 메인 카메라의 대략적인 가로 화각(도) */
export const DEFAULT_FOV_DEG = 69;

/** 분석할 때 줄이는 가로 크기(픽셀) — 왜 720 인지는 analyze-video.ts 에 적었다 */
export const ANALYZE_WIDTH = 720;

export type CapturedFrame = {
  /** 영상 안의 시각(초) */
  t: number;
  /** 밝기 그림(분석 해상도, 0~255). 영상 파일은 Float32Array, 카메라는 Uint8Array */
  luma: ArrayLike<number>;
};

export type AnalyzeFramesInput = {
  /** 시간순 프레임. 같은 장면이 두 번 들어 있어도 된다 — 여기서 거른다 */
  frames: CapturedFrame[];
  /**
   * 배경으로 쓸 장면들 — 공이 없는 프레임(던지기 전)이 가장 좋다. 비우면 frames 안에서
   * 고르게 뽑아 쓴다.
   */
  backgroundSamples?: ArrayLike<number>[];
  /** 분석 해상도 */
  width: number;
  height: number;
  /** 원본 해상도 — 렌즈 계산 기준 */
  sourceWidth: number;
  sourceHeight: number;
  /** 카메라 화각(도). 보정을 하지 않았으면 기본값 */
  fovDeg?: number;
  /** 카메라가 얼마나 흔들렸는지(픽셀). 비우면 여기서 잰다 */
  shakePx?: number;
  /** 공이 멀어지나(투수 뒤, 기본) 다가오나(포수 뒤) */
  approach?: Approach;
};

/**
 * 공기 저항으로 공이 1m 날아갈 때 느려지는 정도(km/h).
 *
 * 메이저리그 추적 자료로는 릴리스에서 홈까지(약 17m) 8~10% 느려진다 — 150km/h 면 1m 에
 * 0.7~0.9km/h. 카메라 값은 구간 평균이라 구간 한가운데의 속도에 가깝고, 릴리스 직후는 그보다
 * 이만큼 × (구간/2) 빠르다. 어림값이다. 스피드건 짝이 쌓이면 보정식이 이 몫까지 흡수하므로,
 * 화면에는 '추정'이라고 적는다.
 */
export const DRAG_KMH_PER_M = 0.8;

/** 측정이 성공했을 때 더 낼 수 있는 것들 */
export type ReleaseInfo = {
  /** 릴리스 직후 구속 추정(km/h) — 구간 평균에 공기 저항만큼 되돌린 값 */
  releaseKmh: number;
  /** 릴리스 포인트가 표적(화면 가운데)에서 좌우 · 상하로 몇 cm 떨어졌나(오른쪽 · 위가 +) */
  dxCm: number;
  dyCm: number;
  /** 카메라에서 릴리스 지점까지(m) */
  distanceM: number;
};

export type AnalyzeResult = {
  measure: MeasureResult;
  /** 측정이 성공했을 때만 */
  release: ReleaseInfo | null;
  /** 화면에 궤적을 그릴 때 쓸 관측 (분석 해상도 기준) */
  track: BallObservation[];
  /** 분석에 쓴 해상도 */
  analyzeSize: { width: number; height: number };
  /** 원본 해상도 */
  sourceSize: { width: number; height: number };
  /** 영상의 실제 초당 장면 수. 세지 못했으면 null */
  fps: number | null;
  frameCount: number;
  /** 카메라가 얼마나 흔들렸는지 (픽셀) */
  shakePx: number;
};

/**
 * 배경이 프레임 사이에 얼마나 밀렸는지 잰다.
 *
 * 화면 네 귀퉁이는 공이 지나가지 않는 자리라 배경만 있다. 그 부분의 밝기가
 * 프레임마다 얼마나 달라지는지 보면 카메라가 움직였는지 알 수 있다.
 * 정확한 이동량 대신 "고정인가 아닌가"를 가리는 데 쓴다.
 */
export function cornerShift(
  prev: ArrayLike<number>,
  curr: ArrayLike<number>,
  width: number,
  height: number
): number {
  const bw = Math.floor(width * 0.15);
  const bh = Math.floor(height * 0.15);
  let diffSum = 0;
  let n = 0;

  const corners: [number, number][] = [
    [0, 0],
    [width - bw, 0],
    [0, height - bh],
    [width - bw, height - bh],
  ];

  for (const [ox, oy] of corners) {
    for (let y = oy; y < oy + bh; y += 2) {
      for (let x = ox; x < ox + bw; x += 2) {
        const i = y * width + x;
        diffSum += Math.abs(curr[i] - prev[i]);
        n++;
      }
    }
  }

  if (n === 0) return 0;
  /*
   * 밝기 차이를 픽셀 이동량으로 바꾸는 정확한 방법은 없다. 다만 고정된
   * 카메라에서는 이 값이 1~2에 머물고, 손으로 들면 10을 훌쩍 넘는다.
   * 검사 기준(MAX_CAMERA_SHAKE_PX)과 눈금을 맞추려고 그대로 픽셀로 본다.
   */
  return diffSum / n;
}

/**
 * 두 프레임이 사실상 같은 장면인가.
 *
 * 영상은 압축돼 있어 완전히 똑같지는 않으므로, 몇 픽셀만 띄엄띄엄 보고
 * 차이가 거의 없으면 같은 장면으로 본다.
 */
export function isSameFrame(prev: ArrayLike<number>, curr: ArrayLike<number>): boolean {
  let diff = 0;
  let n = 0;
  for (let i = 0; i < prev.length; i += 97) {
    diff += Math.abs(curr[i] - prev[i]);
    n++;
  }
  return n > 0 && diff / n < 0.6;
}

/**
 * 릴리스 포인트와 릴리스 구속 추정.
 *
 * 릴리스 포인트는 '쓸 만한 크기로 찍힌 첫 관측'의 3차원 위치다(measure.ts 가 계산에 쓰는
 * 첫 점과 같다). 화면 가운데 표적에서 얼마나 벗어났는지를 cm 로 — 같은 투수가 공마다 얼마나
 * 같은 자리에서 놓는지(일관성)를 보는 데 쓴다. 카메라가 투수 뒤에 있으므로 오른쪽이 투수의
 * 오른쪽이다. 화면 y 는 아래로 자라므로 뒤집어 위를 + 로 둔다.
 */
function releaseInfo(
  observations: BallObservation[],
  lens: CameraLens,
  kmh: number,
  travelM: number
): ReleaseInfo | null {
  const first = [...observations]
    .sort((a, b) => a.t - b.t)
    .find((o) => o.diameterPx >= MIN_USABLE_BALL_PX);
  const point = first ? toPoint3D(first, lens) : null;
  if (!point) return null;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    releaseKmh: round1(kmh + (DRAG_KMH_PER_M * travelM) / 2),
    dxCm: round1(point.x * 100),
    dyCm: round1(-point.y * 100),
    distanceM: Math.round(point.z * 100) / 100,
  };
}

export function analyzeFrames(input: AnalyzeFramesInput): AnalyzeResult {
  const {
    width,
    height,
    sourceWidth,
    sourceHeight,
    fovDeg = DEFAULT_FOV_DEG,
    approach = 'receding',
  } = input;

  /*
   * 1) 같은 장면이 두 번 나오면 건너뛴다.
   *
   * 영상 파일은 실제 프레임 수를 알 수 없어 촘촘히 꺼내므로 같은 장면이 두세 번씩
   * 온다. 그대로 두면 공이 멈춰 있는 것처럼 보여 속도가 낮게 나온다. 카메라에서
   * 받은 프레임은 대개 다 다르지만 같은 규칙을 적용해 둔다.
   */
  const frames: CapturedFrame[] = [];
  let shakePx = input.shakePx ?? 0;
  for (const f of input.frames) {
    const prev = frames[frames.length - 1];
    if (prev) {
      if (input.shakePx == null) {
        shakePx = Math.max(shakePx, cornerShift(prev.luma, f.luma, width, height));
      }
      if (isSameFrame(prev.luma, f.luma)) continue;
    }
    frames.push(f);
  }

  if (frames.length < 3) throw new Error('영상에서 프레임을 충분히 읽지 못했습니다.');

  const times = frames.map((f) => f.t);
  /*
   * 남은 수로 실제 초당 장면 수를 센다. 브라우저는 이 값을 알려주지 않아 직접 세는
   * 수밖에 없다.
   */
  const measuredFps =
    times.length > 1 ? (times.length - 1) / (times[times.length - 1] - times[0]) : null;

  /*
   * 2) 배경 기준선. 부르는 쪽이 준 장면(던지기 전)에 구간 안에서 고르게 뽑은 몇 장을
   *    보탠다 — 공이 오래 머무는 자리도 배경으로 채워지게.
   */
  const samples: ArrayLike<number>[] = [...(input.backgroundSamples ?? [])];
  const inWindow = Math.min(7, frames.length);
  for (let i = 0; i < inWindow; i++) {
    samples.push(
      frames[Math.floor((i * (frames.length - 1)) / Math.max(1, inWindow - 1))].luma
    );
  }
  const background = buildBackground(samples);

  // 3) 프레임마다 배경과 견줘 움직인 덩어리를 찾고, 공을 이어붙인다.
  const blobFrames: FrameBlobs[] = frames.map((f) => ({
    t: f.t,
    blobs: findMovedBlobs(background, f.luma, width, height),
  }));
  const track = trackBall(blobFrames, {
    frameWidth: width,
    frameHeight: height,
    approach,
  });

  // 지름·좌표를 원본 해상도 기준으로 되돌린다. 렌즈 정보가 원본 기준이기 때문이다.
  const scale = width / sourceWidth;
  const scaled: BallObservation[] = track.map((o) => ({
    t: o.t,
    x: o.x / scale,
    y: o.y / scale,
    diameterPx: o.diameterPx / scale,
  }));

  /*
   * 렌즈의 초점거리는 화면의 '긴 쪽'을 기준으로 구한다.
   *
   * 폰에 적힌 화각(약 69도)은 가로로 눕혀 찍었을 때의 값이다. 세로로 찍으면
   * 같은 렌즈인데도 가로가 짧아져, 짧은 쪽에 그 화각을 대입하면 초점거리를
   * 실제보다 작게 본다. 그러면 공이 실제보다 가까이 있다고 계산돼 구속이
   * 낮게 나온다. 초점거리는 방향과 무관한 렌즈의 성질이므로, 긴 쪽으로 한 번
   * 구해 두면 가로·세로 어느 쪽으로 찍어도 같은 값을 쓴다.
   */
  const lens: CameraLens = {
    focalPx: focalPxFromFov(Math.max(sourceWidth, sourceHeight), fovDeg),
    frameWidth: sourceWidth,
    frameHeight: sourceHeight,
  };

  /*
   * 촬영 자체가 안 되는 조건이면 그것부터 알려준다.
   * 공을 못 찾았다고만 하면 무엇을 고쳐야 할지 알 수 없다.
   */
  const footage = checkFootage({
    frameWidth: sourceWidth,
    frameHeight: sourceHeight,
    fps: measuredFps,
  });

  const measure: MeasureResult = footage
    ? { ok: false, ...footage }
    : measureVelocity({
        observations: scaled,
        lens,
        stability: { maxBackgroundShiftPx: shakePx },
        approach,
      });

  return {
    measure,
    /* 릴리스 포인트는 멀어지는 공(투수 뒤)에서만 잡힌다 — 다가오는 공은 릴리스가 화면 밖 */
    release:
      measure.ok && approach === 'receding'
        ? releaseInfo(scaled, lens, measure.kmh, measure.detail.travelM)
        : null,
    fps: measuredFps,
    track,
    analyzeSize: { width, height },
    sourceSize: { width: sourceWidth, height: sourceHeight },
    frameCount: frames.length,
    shakePx: Math.round(shakePx * 10) / 10,
  };
}
