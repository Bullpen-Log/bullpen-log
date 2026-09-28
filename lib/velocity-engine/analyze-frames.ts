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
  DRAG_K_PER_M,
} from './geometry.ts';
import { checkFootage } from './validate.ts';
import {
  measureVelocity,
  MIN_USABLE_BALL_PX,
  type Approach,
  type MeasureResult,
  type MeasureSuccess,
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
 *
 * ── 정확도를 위해 하는 세 가지(2026-09-27, 시험대 scripts/velocity-accuracy.mts 로 재며 넣었다) ──
 *
 * 1. 지름을 **대비 50% 기준 면적**으로 다시 잰다(refineTrack). 감지기는 고정 문턱값(28)으로 자른
 *    테두리 상자로 지름을 어림하는데, 가장자리가 번진 공(초점 · 모션 블러 · 안티앨리어싱)에서는
 *    번진 테두리까지 세어 1~2px 크게 나온다. 지름이 조금 크면 거리는 조금 가까워지는데, 그
 *    '조금'이 멀리 있을수록 커서(z=k/d) 거리의 기울기 = 속도가 낮게 나왔다 — 이상적인 그림에서도
 *    −6~−12km/h, 초점이 흐리면 −23km/h. 번짐은 밝기 분포를 퍼뜨릴 뿐 총량은 보존하므로, 공의
 *    대비(배경보다 얼마나 밝은가)로 정규화한 밝기를 다 더하면 번짐과 무관하게 공의 면적이 나온다.
 * 2. **자동 노출**로 배경 전체가 밝아지는 것을 프레임마다 귀퉁이에서 재서 뺀다(exposureBias).
 *    안 빼면 몇 프레임 뒤 화면 전체가 '움직인 것'이 돼 추적이 끊긴다.
 * 3. 흔들림은 픽셀이 아니라 **8×8 블록 평균**으로 잰다(cornerShift) — 픽셀 잡음(σ6 정도)이 흔들림으로
 *    잘못 잡혀 정상 촬영이 거부되던 것을 막는다.
 */

/** 아이폰 후면 메인 카메라의 대략적인 가로 화각(도) */
export const DEFAULT_FOV_DEG = 69;

/** 분석할 때 줄이는 가로 크기(픽셀) — 왜 720 인지는 analyze-video.ts 에 적었다 */
export const ANALYZE_SHORT_SIDE = 720;
/** @deprecated 이름만 남긴다 — 짧은 변 기준(ANALYZE_SHORT_SIDE)을 쓴다 */
export const ANALYZE_WIDTH = ANALYZE_SHORT_SIDE;

/** 원본 → 분석 배율. 짧은 변을 720 으로 — 가로로 찍어도 세로와 같은 정밀도(예전엔 가로 720 이라 가로 촬영이 0.375 배였다) */
export function analyzeScale(sourceW: number, sourceH: number): number {
  return Math.min(1, ANALYZE_SHORT_SIDE / Math.max(1, Math.min(sourceW, sourceH)));
}

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
  /**
   * 초점거리(원본 픽셀). 공으로 렌즈를 보정했으면 이 값이 화각보다 먼저다 — 화각 가정이 6° 만
   * 틀려도 구속이 15% 어긋난다(lib/velocity-lens.ts).
   */
  focalPx?: number;
  /** 카메라가 얼마나 흔들렸는지(픽셀). 비우면 여기서 잰다 */
  shakePx?: number;
  /** 공이 멀어지나(투수 뒤, 기본) 다가오나(포수 뒤) */
  approach?: Approach;
  /**
   * 포수 뒤에서 찍을 때, 카메라에서 릴리스 지점까지의 거리(m). 다가오는 공은 마지막 몇 m 만
   * 보이므로, 이 거리만큼 공기저항을 되돌려야 릴리스 구속이 나온다. 없으면 릴리스 추정을 안 낸다.
   */
  releaseDistanceM?: number | null;
  /**
   * 꺼낸 장면의 초당 수를 알면(영상 파일의 fps 로 장면마다 꺼냈을 때) 준다. 비우면 남은 장면의
   * 수로 센다 — 그러면 가만히 있는 장면이 같은 장면으로 걸러져 실제보다 적게 나온다.
   */
  fps?: number | null;
  /** 앞에서 몇 장까지 공이 처음 보일 수 있나 — 기본 12(detect.ts 의 trackBall). 영상 파일은 전부 */
  seedFrames?: number;
};

/** 공기저항 상수 — 정의와 설명은 geometry.ts */
export { DRAG_K_PER_M } from './geometry.ts';
/** 130km/h 에서 1m 당 느려지는 양(km/h) — 화면 설명용 */
export const DRAG_KMH_PER_M = Math.round(DRAG_K_PER_M * 130 * 100) / 100;

/** 측정이 성공했을 때 더 낼 수 있는 것들 */
export type ReleaseInfo = {
  /**
   * 릴리스 직후 구속 추정(km/h). 투수 뒤: 첫 관측(손에서 떨어져 처음 보인 장면) 시점의 모델
   * 속도. 포수 뒤: 첫 관측(가장 먼 곳)에서 릴리스 지점까지 공기저항을 되돌린 값.
   */
  releaseKmh: number;
  /** 릴리스 포인트가 표적(화면 가운데)에서 좌우 · 상하로 몇 cm 떨어졌나(오른쪽 · 위가 +). 포수 뒤에서는 없다 */
  dxCm: number | null;
  dyCm: number | null;
  /** 카메라에서 릴리스 지점까지(m). 포수 뒤에서는 설정에서 받은 값 */
  distanceM: number | null;
};

export type AnalyzeResult = {
  measure: MeasureResult;
  /** 측정이 성공했을 때만 */
  release: ReleaseInfo | null;
  /** 화면에 궤적을 그릴 때 쓸 관측 (분석 해상도 기준, 다시 잰 지름) */
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
  /** 계산에 쓴 초점거리(원본 픽셀) */
  focalPx: number;
};

/* ───────────────────────── 귀퉁이 — 흔들림 · 노출 ───────────────────────── */

const CORNER_RATIO = 0.15;
const BLOCK = 8;

/**
 * 네 귀퉁이(각 변의 15%)를 BLOCK×BLOCK 씩 돌며 부른다 — 공이 지나가지 않는 자리라 배경만 있다.
 * 세 번째 값은 귀퉁이 번호(0 왼쪽 위 · 1 오른쪽 위 · 2 왼쪽 아래 · 3 오른쪽 아래).
 */
function eachCornerBlock(
  width: number,
  height: number,
  fn: (x0: number, y0: number, corner: number) => void
) {
  const bw = Math.floor(width * CORNER_RATIO);
  const bh = Math.floor(height * CORNER_RATIO);
  const corners: [number, number][] = [
    [0, 0],
    [width - bw, 0],
    [0, height - bh],
    [width - bw, height - bh],
  ];
  corners.forEach(([ox, oy], corner) => {
    for (let y = oy; y + BLOCK <= oy + bh; y += BLOCK) {
      for (let x = ox; x + BLOCK <= ox + bw; x += BLOCK) fn(x, y, corner);
    }
  });
}

function blockMean(
  a: ArrayLike<number>,
  width: number,
  x0: number,
  y0: number
): number {
  let s = 0;
  for (let y = y0; y < y0 + BLOCK; y++) {
    const row = y * width;
    for (let x = x0; x < x0 + BLOCK; x++) s += a[row + x];
  }
  return s / (BLOCK * BLOCK);
}

/**
 * 배경이 프레임 사이에 얼마나 밀렸는지 잰다.
 *
 * 귀퉁이를 8×8 블록으로 나눠 블록 평균끼리 견준다. 픽셀 하나하나로 재면 센서 잡음(σ6 이면
 * 픽셀 차 평균이 7 근처)이 그대로 흔들림으로 잡혀 정상 촬영이 거부된다. 블록 평균은 잡음을
 * 1/8 로 누르고, 카메라가 밀리면 무늬가 통째로 옮겨 가 블록 평균이 크게 달라진다.
 * 정확한 이동량 대신 "고정인가 아닌가"를 가리는 데 쓴다(검사 기준 MAX_CAMERA_SHAKE_PX).
 *
 * 귀퉁이마다 따로 재서 두 번째로 적게 바뀐 귀퉁이의 값을 쓴다. 카메라가 흔들리면 네 귀퉁이가
 * 다 바뀌지만, 투수 · 포수의 몸이 지나가면 그 귀퉁이만 바뀐다. 전체 평균으로 쟀더니 영상 파일
 * (던지기 전 투구 동작까지 훑는다)에서 팔이 한 귀퉁이를 지나간 것을 흔들림으로 보고 거부했다.
 * 두 귀퉁이까지는 몸이 지나가도 된다.
 */
export function cornerShift(
  prev: ArrayLike<number>,
  curr: ArrayLike<number>,
  width: number,
  height: number
): number {
  const sum = [0, 0, 0, 0];
  const count = [0, 0, 0, 0];
  eachCornerBlock(width, height, (x0, y0, corner) => {
    sum[corner] += Math.abs(
      blockMean(curr, width, x0, y0) - blockMean(prev, width, x0, y0)
    );
    count[corner]++;
  });
  const means = sum
    .map((s, i) => (count[i] ? s / count[i] : null))
    .filter((m): m is number => m != null)
    .sort((a, b) => a - b);
  if (means.length === 0) return 0;
  return means[Math.min(1, means.length - 1)];
}

/**
 * 자동 노출 — 프레임 전체가 배경보다 얼마나 밝아졌나(중앙값). 귀퉁이 블록 평균으로 잰다.
 * 공이 나타나면 카메라가 노출을 조금 내리거나 올리는데, 그만큼을 빼야 배경이 '움직인 것'이 안 된다.
 */
function exposureBias(
  background: Float32Array,
  luma: ArrayLike<number>,
  width: number,
  height: number
): number {
  const diffs: number[] = [];
  eachCornerBlock(width, height, (x0, y0) => {
    diffs.push(blockMean(luma, width, x0, y0) - blockMean(background, width, x0, y0));
  });
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
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

/* ───────────────────────── 지름 다시 재기 ───────────────────────── */

/** 공의 대비(배경보다 얼마나 밝은가)를 믿고 잴 수 있는 최소 지름(분석 픽셀) — 이보다 작으면 큰 프레임의 값을 빌린다 */
const CORE_MIN_PX = 12;

/** 창 둘레 고리(창 반지름의 배수) — 그 자리의 남은 배경 치우침을 재는 띠 */
const RING_IN = 1.15;
const RING_OUT = 1.5;

/**
 * 추적한 공마다 지름과 중심을 다시 잰다 — 밝기 총량으로 면적을 구한다.
 *
 * 공 둘레의 창 안에서 (밝기 − 배경 − 치우침)을 공의 대비 C 로 나눠 다 더하면 공이 덮은 면적이다.
 * 번짐(초점 · 모션 · 안티앨리어싱)은 밝기를 퍼뜨릴 뿐 총량을 바꾸지 않아 이 면적은 번짐과 무관하다
 * — 그래서 문턱값 · 테두리 상자보다 훨씬 덜 치우친다.
 *
 * 처음에는 픽셀마다 0~1 로 잘라 더했는데(대비 50% 면적), 자르기가 두 가지 치우침을 만들었다:
 * 안쪽에서 잡음이 + 로 튄 픽셀은 1 에 잘리고 − 로 튄 픽셀은 그대로 빠져 면적이 줄고, 바깥 8% 밑을
 * 버리면서 번진 꼬리도 빠졌다 — 시험대에서 지름이 한결같이 1.2%(어두운 공 2%) 작게 나와 구속이
 * 1.5~2.5km/h 높았다. 자르지 않고 더하면 잡음은 +− 로 상쇄되고 꼬리도 다 들어간다(잡음이 면적에
 * 남기는 흔들림은 반지름 5px 에서 0.1% 안). 딴 것(핫 픽셀 · 이웃 물체)이 섞이는 것만 −0.5~1.5 로 막는다.
 *
 * 배경의 남은 치우침(노출 보정의 오차 · 배경 기울기)은 창을 넓게 잡을수록 면적에 그대로 더해지므로,
 * 창 둘레 고리의 중앙값을 그 자리에서 빼 준다.
 *
 *
 * 대비 C 는 공 한가운데(반지름의 절반 안) 중앙값으로 잰다. 멀어져 작아진 공은 가운데까지 번져
 * 대비가 낮게 보이므로, 큰 프레임에서 잰 C 를 빌린다(같은 공 · 같은 빛이면 대비는 같다).
 */
function refineTrack(
  track: BallObservation[],
  lumaAt: Map<number, ArrayLike<number>>,
  biasAt: Map<number, number>,
  background: Float32Array,
  width: number,
  height: number
): BallObservation[] {
  const lumaOf = (t: number) => lumaAt.get(t);
  const coreContrast = (o: BallObservation, luma: ArrayLike<number>, bias: number) => {
    const r = Math.max(1, o.diameterPx / 4);
    const vals: number[] = [];
    const x0 = Math.max(0, Math.floor(o.x - r));
    const x1 = Math.min(width - 1, Math.ceil(o.x + r));
    const y0 = Math.max(0, Math.floor(o.y - r));
    const y1 = Math.min(height - 1, Math.ceil(o.y + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - o.x) ** 2 + (y - o.y) ** 2 > r * r) continue;
        const i = y * width + x;
        vals.push(luma[i] - background[i] - bias);
      }
    }
    if (vals.length < 3) return null;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  };

  /* 공의 대비 — 큰 프레임들의 중앙값 */
  const refs: number[] = [];
  for (const o of track) {
    if (o.diameterPx < CORE_MIN_PX) continue;
    const luma = lumaOf(o.t);
    if (!luma) continue;
    const c = coreContrast(o, luma, biasAt.get(o.t) ?? 0);
    if (c != null && c > 0) refs.push(c);
  }
  refs.sort((a, b) => a - b);
  const refContrast = refs.length ? refs[Math.floor(refs.length / 2)] : null;

  return track.map((o) => {
    const luma = lumaOf(o.t);
    if (!luma) return o;
    const bias = biasAt.get(o.t) ?? 0;
    let C: number | null = null;
    if (o.diameterPx >= CORE_MIN_PX) C = coreContrast(o, luma, bias);
    if (C == null || C <= 0 || (refContrast != null && C < refContrast * 0.6))
      C = refContrast;
    if (C == null || C <= 0) return o;

    /*
     * 창 — 번진 꼬리까지 담게 감지기 지름(문턱값 상자라 실제보다 작다)의 0.9배 + 3px 반지름
     * (= 실제 반지름의 약 1.8배 + 3). 너무 넓히면 이웃 것이 섞인다.
     */
    const R = Math.max(4, o.diameterPx * 0.9 + 3);
    const Ro = R * RING_OUT;
    const x0 = Math.max(0, Math.floor(o.x - Ro));
    const x1 = Math.min(width - 1, Math.ceil(o.x + Ro));
    const y0 = Math.max(0, Math.floor(o.y - Ro));
    const y1 = Math.min(height - 1, Math.ceil(o.y + Ro));

    /* 창 둘레 고리의 중앙값 — 그 자리의 남은 배경 치우침 */
    const ring: number[] = [];
    const rIn2 = (R * RING_IN) ** 2;
    const rOut2 = Ro * Ro;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - o.x) ** 2 + (y - o.y) ** 2;
        if (d2 < rIn2 || d2 > rOut2) continue;
        const i = y * width + x;
        ring.push(luma[i] - background[i] - bias);
      }
    }
    let local = 0;
    if (ring.length >= 8) {
      ring.sort((a, b) => a - b);
      local = ring[Math.floor(ring.length / 2)];
    }

    let area = 0;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    const R2 = R * R;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - o.x) ** 2 + (y - o.y) ** 2 > R2) continue;
        const i = y * width + x;
        let c = (luma[i] - background[i] - bias - local) / C;
        if (c > 1.5) c = 1.5;
        else if (c < -0.5) c = -0.5;
        area += c;
        if (c > 0) {
          sx += c * x;
          sy += c * y;
          sw += c;
        }
      }
    }
    if (area < 3 || sw <= 0) return o;
    /*
     * 그물 너머(visibleFrac < 1)면 그물코 사이만 밝아져 총량이 그 비율만큼 준다 — 나눠 되돌린다.
     * 비율이 너무 낮으면(0.3 밑) 조각이 공인지도 의심스러워 되돌리지 않고 감지기 값을 둔다.
     */
    const vis = o.visibleFrac ?? 1;
    if (vis < 0.3) return o;
    const d = 2 * Math.sqrt(area / vis / Math.PI);
    /* 감지기 값과 너무 다르면(이웃 것이 섞였거나 잘렸거나) 믿지 않는다 */
    if (d < o.diameterPx * 0.6 || d > o.diameterPx * 1.5) return o;
    return { t: o.t, x: sx / sw, y: sy / sw, diameterPx: d, visibleFrac: o.visibleFrac };
  });
}

/* ───────────────────────── 릴리스 ───────────────────────── */

/**
 * 릴리스 포인트와 릴리스 구속 추정.
 *
 * 투수 뒤: 릴리스 포인트는 '쓸 만한 크기로 찍힌 첫 관측'의 3차원 위치다(measure.ts 가 계산에
 * 쓰는 첫 점과 같다). 화면 가운데 표적에서 얼마나 벗어났는지를 cm 로 — 같은 투수가 공마다
 * 얼마나 같은 자리에서 놓는지(일관성)를 보는 데 쓴다. 카메라가 투수 뒤에 있으므로 오른쪽이
 * 투수의 오른쪽이다. 화면 y 는 아래로 자라므로 뒤집어 위를 + 로 둔다. 릴리스 구속은 그 첫 관측
 * 시점의 모델 속도(startKmh) — 첫 관측이 릴리스보다 한두 장 늦어도 그 사이 손실은 0.5km/h 안이다.
 *
 * 포수 뒤: 공이 마지막 몇 m 에 와서야 잴 만큼 커지므로 첫 관측 시점 속도는 릴리스보다 한참 낮다
 * (17m 면 약 8%). 설정에서 받은 카메라 → 릴리스 거리(releaseDistanceM)와 첫 관측 거리의 차이만큼
 * 되돌린다: v₀ = v·e^(K·gap). 거리를 모르면 릴리스 추정을 내지 않는다.
 */
function releaseInfo(
  observations: BallObservation[],
  lens: CameraLens,
  measure: MeasureSuccess,
  approach: Approach,
  releaseDistanceM: number | null | undefined
): ReleaseInfo | null {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  if (approach === 'approaching') {
    if (!(releaseDistanceM != null && releaseDistanceM > 0)) return null;
    const gap = Math.max(0, releaseDistanceM - measure.detail.releaseDistanceM);
    return {
      releaseKmh: round1(measure.detail.startKmh * Math.exp(DRAG_K_PER_M * gap)),
      dxCm: null,
      dyCm: null,
      distanceM: Math.round(releaseDistanceM * 100) / 100,
    };
  }
  const first = [...observations]
    .sort((a, b) => a.t - b.t)
    .find((o) => o.diameterPx >= MIN_USABLE_BALL_PX);
  const point = first ? toPoint3D(first, lens) : null;
  if (!point) return null;
  return {
    releaseKmh: round1(measure.detail.startKmh),
    dxCm: round1(point.x * 100),
    dyCm: round1(-point.y * 100),
    distanceM: Math.round(point.z * 100) / 100,
  };
}

/* ───────────────────────── 본체 ───────────────────────── */

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
      /* 초당 장면 수를 받았으면 장면마다 한 번씩 꺼낸 것이라 거르지 않는다(analyze-video.ts) */
      if (input.fps == null && isSameFrame(prev.luma, f.luma)) continue;
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
    input.fps ??
    (times.length > 1 ? (times.length - 1) / (times[times.length - 1] - times[0]) : null);

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

  /* 3) 프레임마다 노출 치우침을 재고, 배경과 견줘 움직인 덩어리를 찾고, 공을 이어붙인다. */
  const lumaAt = new Map<number, ArrayLike<number>>();
  const biasAt = new Map<number, number>();
  const blobFrames: FrameBlobs[] = frames.map((f) => {
    const bias = exposureBias(background, f.luma, width, height);
    lumaAt.set(f.t, f.luma);
    biasAt.set(f.t, bias);
    return { t: f.t, blobs: findMovedBlobs(background, f.luma, width, height, bias) };
  });
  const rough = trackBall(blobFrames, {
    frameWidth: width,
    frameHeight: height,
    approach,
    seedFrames: input.seedFrames,
  });

  /* 4) 지름 · 중심을 대비 50% 면적으로 다시 잰다 — 번짐에 치우치지 않게 */
  const track = refineTrack(rough, lumaAt, biasAt, background, width, height);

  // 지름·좌표를 원본 해상도 기준으로 되돌린다. 렌즈 정보가 원본 기준이기 때문이다.
  const scale = width / sourceWidth;
  const scaled: BallObservation[] = track.map((o) => ({
    t: o.t,
    x: o.x / scale,
    y: o.y / scale,
    diameterPx: o.diameterPx / scale,
  }));

  /*
   * 렌즈의 초점거리. 공으로 보정한 값(focalPx)이 있으면 그것, 없으면 화각 가정으로 구한다.
   *
   * 화각은 화면의 '긴 쪽'을 기준으로 잰다. 폰에 적힌 화각(약 69도)은 가로로 눕혀 찍었을 때의
   * 값이다. 세로로 찍으면 같은 렌즈인데도 가로가 짧아져, 짧은 쪽에 그 화각을 대입하면 초점거리를
   * 실제보다 작게 본다. 그러면 공이 실제보다 가까이 있다고 계산돼 구속이 낮게 나온다. 초점거리는
   * 방향과 무관한 렌즈의 성질이므로, 긴 쪽으로 한 번 구해 두면 가로 · 세로 어느 쪽으로 찍어도
   * 같은 값을 쓴다.
   */
  const focalPx =
    input.focalPx && input.focalPx > 0
      ? input.focalPx
      : focalPxFromFov(Math.max(sourceWidth, sourceHeight), fovDeg);
  const lens: CameraLens = {
    focalPx,
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
    release: measure.ok
      ? releaseInfo(scaled, lens, measure, approach, input.releaseDistanceM)
      : null,
    fps: measuredFps,
    track,
    analyzeSize: { width, height },
    sourceSize: { width: sourceWidth, height: sourceHeight },
    frameCount: frames.length,
    shakePx: Math.round(shakePx * 10) / 10,
    focalPx: Math.round(focalPx),
  };
}
