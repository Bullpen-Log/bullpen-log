import {
  backgroundTable,
  buildBackground,
  buildDarkBackground,
  findMovedBlobs,
  trackBall,
  type BackgroundTable,
  type FrameBlobs,
} from './detect.ts';
import {
  focalPxFromFov,
  toPoint3D,
  type BallObservation,
  type CameraLens,
  DRAG_K_PER_M,
  BALL_DIAMETER_M,
} from './geometry.ts';
import {
  checkFootage,
  ERROR_INTERVAL_Z,
  reject,
  speedSigmaRel,
  MAX_RELATIVE_SE,
  SYSTEMATIC_FLOOR_REL,
  type Rejection,
} from './validate.ts';
import {
  measureVelocity,
  MIN_USABLE_BALL_PX,
  type Approach,
  type MeasureResult,
  type MeasureSuccess,
} from './measure.ts';
import { measureLimb, measureLimbPolar, blurCutPx, type LimbFailure, type LumaTransfer } from './limb.ts';

export type { LumaTransfer } from './limb.ts';

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
 * 4. (모델 1.6.0, 2026-09-29 2차 보정) 거리 자는 1 의 면적이 아니라 **빛 받은 쪽의 또렷한 윤곽에 맞춘 원**이다
 *    (limb.ts · measureDiameters). 실제 영상 18개에서 면적 지름은 공의 그늘(영상마다 다른 몫) · 번짐 × 톤 곡선 ·
 *    빌린 대비 · 흰 천 때문에 장면마다 1.3~1.7% 흔들렸고, 윤곽은 0.6% 였다. 면적은 윤곽의 첫 어림과 검사에만
 *    쓴다 — 두 자는 배율이 달라(면적 ≈ 윤곽 × 0.92, 영상마다 0.91~0.95) 한 궤적에 섞지 않는다. 윤곽을 못 잰
 *    장면은 빼고, 모자라면 거부한다(말없이 면적으로 돌아가지 않는다).
 * 5. (2026-10-03, 극성) 1~4 의 길(밝아진 곳만 보는 감지 · 밝은 공의 윤곽)로 못 쟀으면 **두 번째 길**로 한 번 더 잰다 —
 *    밝은 하늘 · 해 받은 벽 앞에서는 공이 배경보다 어두울 수 있다(밖에서 투수 뒤로 찍으면 공이 하늘 앞에서 출발한다).
 *    어두워진 곳도 보고(detect.ts '밝은 배경'), 지름은 화소마다 극성을 가려 '보정 밝기의 밝은 공이었다면'으로 다시 담아
 *    잰다(limb.ts measureLimbPolar). 예전 길로 잰 공은 한 자리도 바뀌지 않는다('PolarBackground' 설명).
 */

/** 아이폰 후면 메인 카메라의 대략적인 가로 화각(도) */
export const DEFAULT_FOV_DEG = 69;

/*
 * 분석 크기(짧은 변 720 — 왜 720 인지는 analyze-video.ts)와 원본 → 분석 배율은 geometry.ts 에 둔다: 맞춤의 무게가
 * 지름의 계통 오차(분석 픽셀)를 원본 픽셀로 옮길 때 같은 값을 써야 해서. 짧은 변 기준이라 가로로 찍어도 세로와 같은
 * 정밀도다(예전엔 가로 720 이라 가로 촬영이 0.375 배였다).
 */
export { ANALYZE_SHORT_SIDE, analyzeScale } from './geometry.ts';
import { ANALYZE_SHORT_SIDE } from './geometry.ts';
/** @deprecated 이름만 남긴다 — 짧은 변 기준(ANALYZE_SHORT_SIDE)을 쓴다 */
export const ANALYZE_WIDTH = ANALYZE_SHORT_SIDE;

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
  /**
   * 구간 안에서 고르게 뽑아 배경에 보탤 장면 수 — 기본 7. 영상 파일에서 공이 나타난 때에 묶은 배경 장면을
   * backgroundSamples 로 줬으면 0 을 준다(analyze-video.ts). 구간 안에서 뽑으면 구간을 어디서 시작하느냐에 따라
   * 배경이 달라져, 같은 공이 구간 자리만으로 0.5~1.8km/h 흔들렸다(2차 조사). 카메라(live-capture)는 기본 그대로.
   */
  inWindowBackground?: number;
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
  /**
   * 장면마다 귀퉁이 블록 평균(cornerMeans) — frames 와 같은 차례. 흔들림을 재며 이미 셌으면(실시간, liveAnalysisInput) 넘겨
   * 노출 치우침을 잴 때 다시 세지 않는다. 값은 같다.
   */
  frameCornerMeans?: Float64Array[];
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
  /** 진단용 — 켜면 결과에 장면마다 찾은 덩어리 전부(blobFrames)를 실어 준다 */
  debug?: boolean;
  /**
   * 밝기 값의 전달 함수 — 기본 'srgb' = 브라우저 캔버스가 준 부호값 그대로. 영상 파일 · 카메라 모두 캔버스에 그린
   * 값이다. 크롬은 BT.709 영상을 곡선을 바꾸지 않고 (Y′−16)·255/219 로 그대로 그린다(2차 조사에서 잼, ±0.04) —
   * 윤곽 비율(α)과 화각이 바로 이 값에서 맞춰졌으므로 영상 파일에도 'bt709' 를 넘기지 않는다(넘기면 파일 값이
   * 카메라 값보다 평균 0.4% 낮아진다, analyze-video.ts). 합성 그림처럼 선형 빛이면 'linear'. 다른 전달 함수는
   * 윤곽을 잴 때 이 부호값으로 옮겨 잰다(limb.ts).
   */
  transfer?: LumaTransfer;
  /**
   * 시험용 — false 면 1.5.0 의 면적 지름을 거리 자로 쓴다(윤곽과 배율이 달라 같은 화각으로 견줄 수 없다).
   * 앱에서는 쓰지 않는다.
   */
  limb?: boolean;
  /**
   * 이 촬영이 윤곽 비율(α) · 화각을 맞춘 조건 안인가 — 아이폰 15 Pro · Pro Max 메인 카메라(24mm) · SDR · 50~70fps 영상
   * 파일(analyze-video.ts 가 파일 머리로 가린다). 모르면 false: 카메라 실시간(live-capture) · 다른 폰 · 240fps · HDR 은
   * 몇 % 다를 수 있어(2차 검증 — 물리: 2~10%) ± 에 OUT_OF_DOMAIN_SIGMA_REL 을 더하고 믿음은 '보통'까지만 준다.
   */
  calibrated?: boolean;
  /**
   * 보정한 조건 밖일 때 ± 에 더할 σ(값에 대한 비율) — 기본 OUT_OF_DOMAIN_SIGMA_REL(4%). 조건마다 모르는 정도가 달라
   * 부르는 쪽이 더 크게 줄 수 있다: HDR 영상 5.5%(analyze-video.ts), 카메라 실시간 6%(live-capture.ts).
   */
  domainSigmaRel?: number;
  /**
   * 받는 가장 낮은 초당 장면 수 — 기본 validate.ts MIN_FPS(50). 영상 파일은 30fps 이하를 늘 막는다(사용자 규칙, 2026-09-28).
   * 카메라 실시간(live-meter.ts)은 0 — 촬영 조건으로는 막지 않고 알림 · 믿음 '낮음' · 넓은 ± 로 대신한다(사용자, 2026-09-30).
   */
  minFps?: number;
  /** 받는 가장 작은 긴 변(원본 px) — 기본 validate.ts MIN_FRAME_WIDTH_PX. 카메라 실시간은 0(위와 같은 까닭) */
  minLongSidePx?: number;
  /**
   * 카메라 실시간만 — 궤적의 가장자리 폭(DiameterReport.edgeWidthPx)이 이 값(분석 px) 이상이면 한 장의 노출 동안 공이 작아지며
   * 번진 것일 수 있다. 값은 그대로 내되 믿음 '낮음', ± 에 exposureBlurSigmaPerPx × (폭 − 1.6px) 를 더한다. 공을 못 이어
   * 거부된 것(장면 부족 · 궤적 불안정 등)은 MOTION_BLUR 로 까닭을 알린다. 비우면 보지 않는다(영상 파일).
   */
  exposureBlurPx?: number | null;
  /** 위 번짐의 σ(값에 대한 비율) — 가장자리 폭이 1.6px 를 넘는 1px 마다 */
  exposureBlurSigmaPerPx?: number;
  /** 믿음의 상한 — 'low' 면 값은 내되 '낮음(참고용)'. 좋은 조건 밖의 카메라 실시간(live-meter.ts liveConditions) */
  confidenceCap?: 'medium' | 'low';
  /**
   * 밝은 배경 앞의 어두운 공도 찾나(아래 '두 번째 길 — 극성') — 기본 true. 예전 길(밝아진 곳만)로 못 쟀을 때만 돈다.
   * 시험용으로 false 면 예전 길만.
   */
  polarity?: boolean;
  /**
   * 대비 길(1.9.0) — 예전 길 · 극성 길로 못 쟀을 때 ① 그물코 잇기(닫힘) 없이, ② 그래도 거부면 가운데 조건까지 없이 한 번씩
   * 더 돈다(아래 '대비 길'). 기본 true. 시험용으로 false 면 1.8.x 와 같은 두 길만.
   */
  fallback?: boolean;
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
  /**
   * releaseKmh 의 ±(km/h, 90% 구간) — 잭나이프 SE 와 바닥(validate.ts)으로. 포수 뒤는 공기저항을 되돌린 몫의
   * 불확실성(K 가 ±25% — 야구공의 항력계수 0.3~0.5)을 더한다.
   */
  errorKmh: number;
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
  /** 진단용(입력 debug) — 장면마다 찾은 덩어리 전부(분석 픽셀 기준) */
  blobFrames?: FrameBlobs[];
  /** 지름을 어떻게 쟀나 — 거리 자 · 뺀 장면과 까닭(분석 JSON 에 남겨 자가 다른 공을 보정에 섞지 않게) */
  diameter: DiameterReport;
  /** 진단용(입력 debug) — 윤곽 전의 첫 어림 궤적(면적 지름, 분석 픽셀) */
  seedTrack?: BallObservation[];
  /** 진단용(입력 debug) — 마지막 단계(measureTrack)에 넘긴 입력 그대로. 맞춤만 바꿔 다시 돌릴 때 */
  trackInput?: TrackMeasureInput;
  /**
   * 대비 길로 잰 것(1.9.0): 'close' 그물코 잇기 없이 · 'center' 거기에 가운데 조건까지 없이. 예전 길 · 극성 길이면 없다.
   * 분석 JSON 에 남겨 스피드건 보정 짝에서 뺀다(밖 · 2배 줌 짝 13개가 평균 2.6~3.5km/h 낮게 읽혔다 — 아직 맞추지 않은 조건).
   */
  fallback?: AnalyzeFallback;
};

export type AnalyzeFallback = 'close' | 'center';

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
  return cornerShiftOfMeans(
    cornerMeans(prev, width, height),
    cornerMeans(curr, width, height)
  );
}

/**
 * 귀퉁이 블록 평균들(eachCornerBlock 의 차례 — 귀퉁이 0 의 블록들, 1, 2, 3). 같은 장면을 여러 번 견줄 때(흔들림은 앞뒤 장면,
 * 노출은 같은 배경과 장면마다) 한 번만 센다 — 블록 평균은 같은 식이라 값이 예전과 똑같다(2026-10-03, 실시간 계산 시간).
 */
export function cornerMeans(
  a: ArrayLike<number>,
  width: number,
  height: number
): Float64Array {
  /* eachCornerBlock · blockMean 과 같은 차례 · 같은 덧셈 차례를 바로 돈다(함수를 블록마다 부르지 않게) — 값이 똑같다 */
  const bw = Math.floor(width * CORNER_RATIO);
  const bh = Math.floor(height * CORNER_RATIO);
  const nx = bw >= BLOCK ? Math.floor((bw - BLOCK) / BLOCK) + 1 : 0;
  const ny = bh >= BLOCK ? Math.floor((bh - BLOCK) / BLOCK) + 1 : 0;
  const out = new Float64Array(4 * nx * ny);
  const corners = [0, 0, width - bw, 0, 0, height - bh, width - bw, height - bh];
  let k = 0;
  for (let c = 0; c < 4; c++) {
    const ox = corners[2 * c];
    const oy = corners[2 * c + 1];
    for (let by = 0; by < ny; by++) {
      const y0 = oy + by * BLOCK;
      for (let bx = 0; bx < nx; bx++) {
        const x0 = ox + bx * BLOCK;
        let s = 0;
        for (let y = y0; y < y0 + BLOCK; y++) {
          const row = y * width;
          for (let x = x0; x < x0 + BLOCK; x++) s += a[row + x];
        }
        out[k++] = s / (BLOCK * BLOCK);
      }
    }
  }
  return out;
}

/** cornerShift 를 블록 평균(cornerMeans)으로 — 귀퉁이마다 블록 수가 같다(네 귀퉁이가 같은 크기) */
export function cornerShiftOfMeans(prev: Float64Array, curr: Float64Array): number {
  const per = curr.length >> 2;
  if (per === 0) return 0;
  const means: number[] = [];
  for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let k = c * per; k < (c + 1) * per; k++) s += Math.abs(curr[k] - prev[k]);
    means.push(s / per);
  }
  means.sort((a, b) => a - b);
  return means[1];
}

/**
 * 자동 노출 — 프레임 전체가 배경보다 얼마나 밝아졌나(중앙값). 귀퉁이 블록 평균으로 잰다.
 * 공이 나타나면 카메라가 노출을 조금 내리거나 올리는데, 그만큼을 빼야 배경이 '움직인 것'이 안 된다.
 */
export function exposureBias(
  background: Float32Array,
  luma: ArrayLike<number>,
  width: number,
  height: number
): number {
  return exposureBiasOfMeans(
    cornerMeans(background, width, height),
    luma,
    width,
    height
  );
}

/** exposureBias 를 배경의 블록 평균(cornerMeans)으로 — 배경은 장면마다 같아 한 번만 센다 */
export function exposureBiasOfMeans(
  backgroundMeans: Float64Array,
  luma: ArrayLike<number>,
  width: number,
  height: number
): number {
  const diffs: number[] = [];
  let k = 0;
  eachCornerBlock(width, height, (x0, y0) => {
    diffs.push(blockMean(luma, width, x0, y0) - backgroundMeans[k++]);
  });
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/** exposureBias 를 장면 · 배경의 블록 평균 둘 다로(이미 센 것) — 블록마다 장면 − 배경, 중앙값. 같은 값이다 */
export function exposureBiasOfBoth(
  backgroundMeans: Float64Array,
  frameMeans: Float64Array
): number {
  const n = Math.min(backgroundMeans.length, frameMeans.length);
  if (n === 0) return 0;
  const diffs: number[] = [];
  for (let k = 0; k < n; k++) diffs.push(frameMeans[k] - backgroundMeans[k]);
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

/* ───────────────────────── 지름 — 윤곽(거리 자) ───────────────────────── */

/**
 * 윤곽 지름 ÷ 첫 어림(면적) 지름이 이 범위 밖이면 그 장면을 뺀다. 실제 공은 1.04~1.10(면적이 그늘 몫만큼
 * 작다) — 크게 벗어나면 윤곽이 딴 것(손 · 흰 천 가장자리)에 맞춰졌거나 첫 어림이 이웃 것을 담은 것이다.
 * 1차 검증이 요구한 장면 단위 검사(e9ae8712 의 흰 천 앞 윤곽 25.6px 은 면적 19.2px 의 1.33 배였다).
 */
const LIMB_GUARD_MIN = 0.8;
const LIMB_GUARD_MAX = 1.3;

/**
 * 밝은 배경 — 화소의 '공 밝기 − 그 화소의 배경'이 공의 보통 대비(큰 장면 가운데의 공 − 배경)의 이 비율보다
 * 작으면, 그 화소는 공이 덮었는지 알 수 없다(흰 과녁 천 · 흰 벽 · 조명). 1차 조사 · 검증(2026-09-29): 0.5~0.65 가
 * 평평한 구간이고 0.35(−30%)에서 흰 천 영상 두 개가 +13 · +28km/h 로 무너졌다 — 엄격한 쪽 0.6.
 *
 * 0.4 로(1.9.0, 2026-10-06): 밖 촬영에서 공 뒤가 표적 그물 위 연회색 구조물(밝기 125~180)이면 0.6 은 20장 중 18장을 '밝은
 * 배경'으로 뺐다(100_d538e2c9). 0.4 는 실내 보정 영상 18개의 릴리스를 0.1 · 평균을 0.3km/h 안에서 지키고(067 · 077 · 096 · 111 의
 * 밝은 배경 거름이 1~2장 줄어 그만큼 장면이 늘었다, 096 은 ± 가 1.9 → 2.6 으로 믿음 '보통') 밖 13개를 모두 잰다
 * (docs/velocity/outdoor-2026-10-03.md ③). 0.35 는 안 된다 — 위 흰 천 영상.
 */
export const MIN_PIXEL_CONTRAST_RATIO = 0.4;
/**
 * 공 원판 안에서 그런 화소가 이 비율을 넘으면 그 장면은 뺀다. 1차 검증: 0.015~0.1 이 평평했고 0.13 부터 흰 천
 * 영상이 +6km/h 로 틀렸다 — 엄격한 쪽 0.05. 윤곽은 가려진 광선을 건너뛰어 반쯤 천에 걸린 공도 원을 맞출 수
 * 있지만(eb05ae07 원판 24% 가 천 — 맞게 잼), 절반쯤 걸리면 원이 커졌다(50% — 1/d 걸음이 앞의 2/3) · e9ae8712
 * (30~40% — 면적의 1.33 배). 어디서 믿음이 끝나는지 날이 서 있어(칼날) 엄격한 쪽에 둔다 — 흰 천 앞은
 * '정확도'가 아니라 '믿을 수 있나'의 문제로 다룬다(모자라면 거부 BRIGHT_BACKGROUND).
 */
export const MAX_BRIGHT_FRAC = 0.05;
/**
 * 감지기가 잰 보이는 비율이 이보다 작으면 그물 너머로 본다 — 흰 그물 실은 공 앞의 가림이라 배경 장면에도
 * 들어 있어 '밝은 배경'처럼 보인다. 그물 장면은 밝은 배경 검사를 하지 않는다(윤곽은 실 표본을 건너뛴다).
 */
const NET_VISIBLE_FRAC = 0.9;
/**
 * 밝은 배경 검사의 원판 반지름 = 첫 어림(면적) 지름 × 이 값 + 1px. 면적 지름은 윤곽의 0.91~0.95 배라 0.55 면
 * 윤곽 반지름 + 여유(공 테두리의 번진 1px)다.
 */
const BRIGHT_DISC_K = 0.55;

/**
 * 흐림과 믿음 · ±. 흐림 보정(limb.ts BLUR_KAPPA)은 여러 영상의 평균은 맞추지만 영상 하나하나는 못 맞춘다 — 보정 영상을
 * 일부러 더 흐리게 하자 가장자리 폭(limb.ts edgePx, 궤적 중앙값) 1.85 · 2.57 · 3.57px 에서 영상마다 흩어짐이 1.85 ·
 * 3.5 · 5.0% 였고(2차 검증 — 물리), 스피드건 오차는 1.55 → 2.4 · 3.7km/h 로 커졌다(2차 검증 — 통계). 그래서
 *  - ± 에는 흐림 σ = BLUR_SIGMA_K × √(폭 − 1.6px) 를 제곱합으로 더한다 — 위 세 점(1.8 · 3.55 · 5.05%)에 맞춘 식,
 *  - 믿음은 EDGE_MEDIUM_PX(1.8px)부터 '보통'까지, EDGE_LOW_PX(2.2px)부터 '낮음'.
 * 문턱 하나(예전 2.6px)면 그 바로 밑의 흐린 영상(+6~7% 틀림)이 '보통'과 좁은 ± 를 그대로 받았다. 보정 영상 13개의
 * 폭은 1.34~1.57px 라 어느 것도 바뀌지 않는다(스피드건 없이 정한 문턱 — 보정 영상 폭의 범위에서).
 */
const BLUR_SIGMA_REF_PX = 1.6;
const BLUR_SIGMA_K = 0.036;
const EDGE_MEDIUM_PX = 1.8;
const EDGE_LOW_PX = 2.2;

/** 가장자리 폭 → 흐림 때문에 더할 예상 σ(값에 대한 비율) */
function blurSigmaRel(edgeWidthPx: number | null): number {
  return edgeWidthPx == null ? 0 : BLUR_SIGMA_K * Math.sqrt(Math.max(0, edgeWidthPx - BLUR_SIGMA_REF_PX));
}

/**
 * 보정한 조건 밖(입력 calibrated 가 아님)의 치우침, 1σ 비율. α 0.3 · 화각 59.8° 는 아이폰 15 Pro Max 카메라 앱 SDR 60fps
 * 영상을 크롬이 그린 값 하나로 맞췄다. 다른 폰(손떨림 보정이 자르는 폭) · 240fps(노출 번짐, 합성 시험 +3%) · HDR · 카메라
 * 실시간(다른 영상 처리) · 조명(해를 등지면 빛 받은 테두리가 없다 — 합성 구 −3~−10%)은 스피드건 짝이 없다. 짝이 쌓일
 * 때까지 ± 에 4% 를 더하고 믿음을 '보통'까지만 준다.
 */
export const OUT_OF_DOMAIN_SIGMA_REL = 0.04;

/**
 * 윤곽 원호가 좁아(그늘 · 옆 · 위 조명) 뺀 장면이 첫 어림의 이만큼 이상이면 믿음은 '보통'까지 — 빛 받은 테두리가 한쪽만
 * 남은 조명이라 자가 몇 % 흔들릴 수 있다(2차 검증 — 물리).
 */
const ARC_DROP_MEDIUM_FRAC = 1 / 3;

/** 장면을 뺀 까닭 — bright: 공 뒤가 공만큼 밝음, limb: 윤곽을 못 잼(번짐 · 가림 · 원호 모자람), guard: 윤곽 ÷ 면적이 공답지 않음 */
export type DiameterDrop = 'bright' | 'limb' | 'guard';

export type DiameterReport = {
  /** 거리 자 — 'limb'(윤곽, 1.6.0) · 'area'(면적, 시험용 limb:false). 자가 다르면 같은 화각 · 보정식을 쓰면 안 된다 */
  ruler: 'limb' | 'area';
  /** 첫 어림(추적) 장면 수 */
  seed: number;
  /** 거리 자로 쓴 장면 수 */
  kept: number;
  drops: Record<DiameterDrop, number>;
  /** 쓸 만한 크기(원본 MIN_USABLE_BALL_PX 이상)인데 밝은 배경 때문에 뺀 장면 수 — 거부 사유 · 믿음 표시에 */
  brightUsable: number;
  /** 윤곽 ÷ 면적의 중앙값(둘 다 잰 장면) — 면적으로만 잰 기준점(릴리스 위치)을 윤곽 자로 옮길 때 */
  limbPerArea: number | null;
  /** 궤적의 가장자리 폭(분석 px, 장면 중앙값들의 중앙값) — 영상이 얼마나 흐린가. 보정 영상은 1.34~1.57 */
  edgeWidthPx: number | null;
  /** 흐림 보정으로 지름에서 뺀 값(분석 px) — limb.ts blurCutPx(edgeWidthPx) */
  blurCorrectionPx: number;
  /** 가장자리 폭이 EDGE_LOW_PX(2.2px) 이상 — 초점이 나간 영상. 믿음 '낮음' */
  blurred: boolean;
  /** 윤곽 원호가 좁아(limb.ts 'arc') 뺀 장면 수 — drops.limb 에 들어 있는 것 가운데 */
  arcDrops: number;
  /**
   * 두 번째 길(극성 — 밝은 배경 앞의 어두운 공)로 잰 것만: 'dark' 윤곽 광선이 거의 다(90% 이상) 공이 배경보다 어두운 것,
   * 'mixed' 섞임(지평선에 걸친 공), 'bright' 다 밝은 것(두 번째 길의 넓힌 감지로 궤적만 이어졌다). 예전 길이면 없다.
   */
  polarity?: 'bright' | 'dark' | 'mixed';
};

function medianOf(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * 공의 밝기(노출 치우침을 뺀 부호값)와 보통 대비 — 큰 장면들(CORE_MIN_PX 이상) 가운데(반지름의 절반 안)의 중앙값.
 * 공의 밝기는 공과 조명의 성질이라 날아가는 내내 거의 같다(실제 영상 18개에서 203~214, 크기와 무관).
 */
function ballLevel(
  track: BallObservation[],
  lumaAt: Map<number, ArrayLike<number>>,
  biasAt: Map<number, number>,
  background: Float32Array,
  width: number,
  height: number
): { level: number; contrast: number } | null {
  const levels: number[] = [];
  const contrasts: number[] = [];
  for (const o of track) {
    if (o.diameterPx < CORE_MIN_PX) continue;
    const luma = lumaAt.get(o.t);
    if (!luma) continue;
    const bias = biasAt.get(o.t) ?? 0;
    const r = Math.max(1, o.diameterPx / 4);
    const lv: number[] = [];
    const cv: number[] = [];
    for (let y = Math.max(0, Math.floor(o.y - r)); y <= Math.min(height - 1, Math.ceil(o.y + r)); y++) {
      for (let x = Math.max(0, Math.floor(o.x - r)); x <= Math.min(width - 1, Math.ceil(o.x + r)); x++) {
        if ((x - o.x) ** 2 + (y - o.y) ** 2 > r * r) continue;
        const i = y * width + x;
        lv.push(luma[i] - bias);
        cv.push(luma[i] - background[i] - bias);
      }
    }
    if (lv.length < 3) continue;
    const c = medianOf(cv);
    if (!(c > 0)) continue;
    levels.push(medianOf(lv));
    contrasts.push(c);
  }
  if (!levels.length) return null;
  return { level: medianOf(levels), contrast: medianOf(contrasts) };
}

/* ───────────────────────── 두 번째 길 — 극성(밝은 배경 앞의 어두운 공) ───────────────────────── */

/**
 * 예전 길(밝아진 곳만 보는 감지 · 밝은 공의 윤곽)로 못 쟀을 때 한 번 더 — 밝은 배경 앞에서는 공이 배경보다 어두울 수 있다
 * (detect.ts '밝은 배경'). 감지는 어두워짐도 보고(가만한 밝은 배경 자리에서만, 중앙값 배경), 지름은 화소마다 극성을 가린다:
 * 배경(중앙값)이 공보다 밝은 화소는 어두운 공 — 중앙값 배경 · 그 노출 치우침, 아니면 밝은 공 — 예전 배경(두 번째로 어두운 값).
 * 지평선에 걸친 공(위 반쪽 하늘 · 아래 반쪽 땅)은 한 장면 안에 두 극성이 섞인다. 거리 자는 이 길에서는 극성과 상관없이 한 가지 —
 * 그 배경과의 선형 덮임을 '보정 밝기의 밝은 공'으로 다시 담아 예전 윤곽 규칙으로 잰다(limb.ts measureLimbPolar). 보정 밝기
 * (공 210 · 배경 60) 근처의 밝은 공이면 예전 자와 같은 자리다.
 *
 * 왜 예전 길이 실패했을 때만: 실내 보정 영상(공이 늘 밝다)의 값은 예전 길로 얼려져 있다. 밝은 바닥 · 흰 천 · 흔들리는 그물이
 * 있는 실제 영상에서 어두워짐까지 보면 덩어리가 늘어(보정 영상 한 장에 1,000~30,000 픽셀) 같은 공의 궤적이 바뀔 수 있다 —
 * 예전 길로 잰 공은 한 자리도 바꾸지 않는다. 대신 예전 길이 잰 '밝은 하늘 앞 밝은 공'(합성 '밖-4')은 그대로다.
 */
type PolarBackground = {
  /** 픽셀마다 표본의 중앙값과 그 자리가 스스로 밝기를 바꾸는 폭(detect.ts buildDarkBackground) */
  med: Float32Array;
  spread: Float32Array;
  /** 장면마다 중앙값 배경에 대한 노출 치우침 */
  biasAt: Map<number, number>;
};

/**
 * 두 번째 길에서 공이 배경보다 어두운 광선으로 잰 값('dark' · 'mixed')의 ± 에 더하는 σ(비율) — 그 윤곽 자리(limb.ts
 * measureLimbPolar)를 실제 카메라로 확인하지 못했다. 다시 담은 자는 합성 그림에서 밝은 공과 지름 0.3~0.7% 안이지만, 실제 카메라의
 * 어두운 테두리(선명화 · 밖의 톤 매핑)가 그 전제를 따르는지 모른다 — 1px 이 구속 약 9% 라 반 px 를 1σ 로 본다.
 */
export const DARK_POLARITY_SIGMA_REL = 0.05;
/**
 * 두 번째 길에서 화소의 대비(공 − 배경, 부호값)가 이보다 작으면 공이 덮었는지 알 수 없다 — 첫 어림(면적)에서 그 화소는 감지기
 * 원판(덮였으면 1)으로 채운다. 하늘 그라데이션처럼 공과 같은 밝기의 띠를 지날 때. 윤곽은 limb.ts MIN_RAY_CONTRAST(35)로 따로 본다.
 */
const POLAR_MIN_PX_CONTRAST = 20;

/** 공 가운데(반지름의 절반 안)의 밝기 중앙값(노출 치우침을 뺀 부호값) — 배경과 무관하다. 표본이 모자라면 null */
function coreLevel(o: BallObservation, luma: ArrayLike<number>, bias: number, width: number, height: number): number | null {
  const r = Math.max(1, o.diameterPx / 4);
  const vals: number[] = [];
  for (let y = Math.max(0, Math.floor(o.y - r)); y <= Math.min(height - 1, Math.ceil(o.y + r)); y++) {
    for (let x = Math.max(0, Math.floor(o.x - r)); x <= Math.min(width - 1, Math.ceil(o.x + r)); x++) {
      if ((x - o.x) ** 2 + (y - o.y) ** 2 > r * r) continue;
      vals.push(luma[y * width + x] - bias);
    }
  }
  return vals.length >= 3 ? medianOf(vals) : null;
}

/** 궤적의 공 밝기 — 큰 장면(CORE_MIN_PX 이상)의 가운데 중앙값들의 중앙값. 큰 장면이 없으면 모든 장면으로 */
function trackLevel(
  track: BallObservation[],
  lumaAt: Map<number, ArrayLike<number>>,
  biasAt: Map<number, number>,
  width: number,
  height: number
): number | null {
  const pick = (minD: number) => {
    const out: number[] = [];
    for (const o of track) {
      if (o.diameterPx < minD) continue;
      const luma = lumaAt.get(o.t);
      if (!luma) continue;
      const v = coreLevel(o, luma, biasAt.get(o.t) ?? 0, width, height);
      if (v != null) out.push(v);
    }
    return out;
  };
  const big = pick(CORE_MIN_PX);
  const all = big.length ? big : pick(0);
  return all.length ? medianOf(all) : null;
}

/**
 * 한 장면의 화소 → 극성을 가린 (보정한 밝기 − 배경, 공 − 배경). level 은 예전 배경의 노출 치우침으로 잰 공 밝기(장면 하나).
 * 중앙값 배경이 공보다 밝으면 어두운 공의 화소다.
 */
function polarPixel(
  i: number,
  luma: ArrayLike<number>,
  bgLo: Float32Array,
  biasLo: number,
  pb: PolarBackground,
  biasMed: number,
  level: number
): { diff: number; den: number } {
  const levelMed = level + biasLo - biasMed;
  const m = pb.med[i];
  if (m > levelMed) return { diff: luma[i] - biasMed - m, den: levelMed - m };
  return { diff: luma[i] - biasLo - bgLo[i], den: level - bgLo[i] };
}

/**
 * refineTrack(밝기 총량 면적)의 극성판 — 화소마다 (밝기 − 배경) ÷ (공 − 배경)을 더한다(공이 고른 밝기면 그 화소의 덮임).
 * 예전 판은 공 하나의 대비 C 로 나눴다 — 배경이 고르면 같고, 지평선처럼 배경이 공의 위아래로 다르면 화소마다 나눠야 한다.
 * 대비가 모자란 화소(POLAR_MIN_PX_CONTRAST)는 감지기 원판으로 채운다.
 */
function refineTrackPolar(
  track: BallObservation[],
  lumaAt: Map<number, ArrayLike<number>>,
  biasAt: Map<number, number>,
  bgLo: Float32Array,
  pb: PolarBackground,
  level: number,
  width: number,
  height: number
): BallObservation[] {
  return track.map((o) => {
    const luma = lumaAt.get(o.t);
    if (!luma) return o;
    const biasLo = biasAt.get(o.t) ?? 0;
    const biasMed = pb.biasAt.get(o.t) ?? 0;
    const own = o.diameterPx >= CORE_MIN_PX ? coreLevel(o, luma, biasLo, width, height) : null;
    const L = own ?? level;
    const R = Math.max(4, o.diameterPx * 0.9 + 3);
    const Ro = R * RING_OUT;
    const x0 = Math.max(0, Math.floor(o.x - Ro));
    const x1 = Math.min(width - 1, Math.ceil(o.x + Ro));
    const y0 = Math.max(0, Math.floor(o.y - Ro));
    const y1 = Math.min(height - 1, Math.ceil(o.y + Ro));
    const ring: number[] = [];
    const rIn2 = (R * RING_IN) ** 2;
    const rOut2 = Ro * Ro;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - o.x) ** 2 + (y - o.y) ** 2;
        if (d2 < rIn2 || d2 > rOut2) continue;
        ring.push(polarPixel(y * width + x, luma, bgLo, biasLo, pb, biasMed, L).diff);
      }
    }
    const local = ring.length >= 8 ? medianOf(ring) : 0;
    const rDet2 = (o.diameterPx / 2) ** 2;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    const R2 = R * R;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - o.x) ** 2 + (y - o.y) ** 2;
        if (d2 > R2) continue;
        const p = polarPixel(y * width + x, luma, bgLo, biasLo, pb, biasMed, L);
        let c: number;
        if (Math.abs(p.den) < POLAR_MIN_PX_CONTRAST) c = d2 <= rDet2 ? 1 : 0;
        else {
          c = (p.diff - local) / p.den;
          if (c > 1.5) c = 1.5;
          else if (c < -0.5) c = -0.5;
        }
        area += c;
        if (c > 0) {
          sx += c * x;
          sy += c * y;
          sw += c;
        }
      }
    }
    if (area < 3 || sw <= 0) return o;
    const vis = o.visibleFrac ?? 1;
    if (vis < 0.3) return o;
    const d = 2 * Math.sqrt(area / vis / Math.PI);
    if (d < o.diameterPx * 0.6 || d > o.diameterPx * 1.5) return o;
    return { t: o.t, x: sx / sw, y: sy / sw, diameterPx: d, visibleFrac: o.visibleFrac };
  });
}

/**
 * 공의 보통 대비 — 큰 장면 가운데 화소의 |공 − 배경|(극성을 가린 배경) 중앙값들의 중앙값. brightFraction 의 극성판이 쓴다.
 */
function polarContrast(
  track: BallObservation[],
  lumaAt: Map<number, ArrayLike<number>>,
  biasAt: Map<number, number>,
  bgLo: Float32Array,
  pb: PolarBackground,
  level: number,
  width: number,
  height: number
): number | null {
  const out: number[] = [];
  for (const o of track) {
    if (o.diameterPx < CORE_MIN_PX) continue;
    const luma = lumaAt.get(o.t);
    if (!luma) continue;
    const biasLo = biasAt.get(o.t) ?? 0;
    const biasMed = pb.biasAt.get(o.t) ?? 0;
    const L = coreLevel(o, luma, biasLo, width, height) ?? level;
    const r = Math.max(1, o.diameterPx / 4);
    const cv: number[] = [];
    for (let y = Math.max(0, Math.floor(o.y - r)); y <= Math.min(height - 1, Math.ceil(o.y + r)); y++) {
      for (let x = Math.max(0, Math.floor(o.x - r)); x <= Math.min(width - 1, Math.ceil(o.x + r)); x++) {
        if ((x - o.x) ** 2 + (y - o.y) ** 2 > r * r) continue;
        cv.push(Math.abs(polarPixel(y * width + x, luma, bgLo, biasLo, pb, biasMed, L).diff));
      }
    }
    if (cv.length >= 3) out.push(medianOf(cv));
  }
  return out.length ? medianOf(out) : null;
}

/** brightFraction 의 극성판 — 공 원판 안에서 |공 − 배경| 이 보통 대비의 MIN_PIXEL_CONTRAST_RATIO 보다 작은 화소의 비율 */
function lowContrastFraction(
  o: BallObservation,
  luma: ArrayLike<number>,
  bgLo: Float32Array,
  biasLo: number,
  pb: PolarBackground,
  biasMed: number,
  level: number,
  contrast: number,
  width: number,
  height: number
): number {
  const R = BRIGHT_DISC_K * o.diameterPx + 1;
  const minDen = MIN_PIXEL_CONTRAST_RATIO * contrast;
  let n = 0;
  let low = 0;
  for (let y = Math.max(0, Math.floor(o.y - R)); y <= Math.min(height - 1, Math.ceil(o.y + R)); y++) {
    for (let x = Math.max(0, Math.floor(o.x - R)); x <= Math.min(width - 1, Math.ceil(o.x + R)); x++) {
      if ((x - o.x) ** 2 + (y - o.y) ** 2 > R * R) continue;
      n++;
      if (Math.abs(polarPixel(y * width + x, luma, bgLo, biasLo, pb, biasMed, level).den) < minDen) low++;
    }
  }
  return n ? low / n : 0;
}

/** 공 원판(첫 어림 중심, 반지름 BRIGHT_DISC_K·d + 1) 안에서 배경이 공만큼 밝은 화소의 비율 */
function brightFraction(
  o: BallObservation,
  background: Float32Array,
  width: number,
  height: number,
  ball: { level: number; contrast: number }
): number {
  const R = BRIGHT_DISC_K * o.diameterPx + 1;
  const minDen = MIN_PIXEL_CONTRAST_RATIO * ball.contrast;
  let n = 0;
  let bright = 0;
  for (let y = Math.max(0, Math.floor(o.y - R)); y <= Math.min(height - 1, Math.ceil(o.y + R)); y++) {
    for (let x = Math.max(0, Math.floor(o.x - R)); x <= Math.min(width - 1, Math.ceil(o.x + R)); x++) {
      if ((x - o.x) ** 2 + (y - o.y) ** 2 > R * R) continue;
      n++;
      if (ball.level - background[y * width + x] < minDen) bright++;
    }
  }
  return n ? bright / n : 0;
}

/**
 * 추적한 공마다 거리 자(윤곽 지름)를 잰다. 첫 어림은 refineTrack(면적)의 중심 · 지름.
 *
 * 한 궤적은 한 가지 자로만 잰다. 윤곽을 못 잰 장면은 면적으로 채우지 않고 뺀다 — 면적 지름은 그늘 몫만큼
 * 작고(윤곽의 0.91~0.95 배, 영상마다 다름) 번진 장면에서는 커서, 섞으면 그 장면만 튄다. 빼도 괜찮은 까닭:
 * 1/d 는 시간에 거의 곧아 몇 장이 빠져도 맞춤이 흔들리지 않는다. 남은 장면이 모자라면 measureVelocity 가
 * 거부한다(말없이 면적 궤적으로 돌아가지 않는다 — 1차 검증 요구).
 *
 * 투수 뒤(멀어짐) · 포수 뒤(다가옴) 둘 다 같은 자다 — 자가 모드마다 다르면 화각 하나로 둘 다 맞출 수 없다.
 */
function measureDiameters(
  seed: BallObservation[],
  lumaAt: Map<number, ArrayLike<number>>,
  biasAt: Map<number, number>,
  background: Float32Array,
  width: number,
  height: number,
  minUsablePx: number,
  transfer: LumaTransfer | undefined,
  /** 두 번째 길(극성)이면 중앙값 배경 · 공 밝기 — 비우면 예전 그대로(밝은 공) */
  polar: { pb: PolarBackground; level: number } | null = null
): { track: BallObservation[]; report: DiameterReport } {
  const drops: Record<DiameterDrop, number> = { bright: 0, limb: 0, guard: 0 };
  let brightUsable = 0;
  let arcDrops = 0;
  let usedRays = 0;
  let darkRays = 0;
  const seedD: number[] = [];
  const widths: number[] = [];
  const track: BallObservation[] = [];
  const ball = polar ? null : ballLevel(seed, lumaAt, biasAt, background, width, height);
  const polarC = polar
    ? polarContrast(seed, lumaAt, biasAt, background, polar.pb, polar.level, width, height)
    : null;
  for (const o of seed) {
    const luma = lumaAt.get(o.t);
    if (!luma) continue;
    const bias = biasAt.get(o.t) ?? 0;
    /* 공 뒤가 공만큼 밝으면(흰 천 · 흰 벽) 테두리를 믿을 수 없다 — 그물(공 앞의 가림)은 빼고 본다 */
    const lowBg = (() => {
      if ((o.visibleFrac ?? 1) < NET_VISIBLE_FRAC) return false;
      if (!polar) return ball != null && brightFraction(o, background, width, height, ball) > MAX_BRIGHT_FRAC;
      if (polarC == null) return false;
      /* 극성판 — 공이 배경보다 밝든 어둡든 |공 − 배경| 이 모자란 화소(공과 같은 밝기의 하늘 띠 · 흰 천) */
      const biasMed = polar.pb.biasAt.get(o.t) ?? 0;
      const L =
        (o.diameterPx >= CORE_MIN_PX ? coreLevel(o, luma, bias, width, height) : null) ?? polar.level;
      return (
        lowContrastFraction(o, luma, background, bias, polar.pb, biasMed, L, polarC, width, height) >
        MAX_BRIGHT_FRAC
      );
    })();
    if (lowBg) {
      drops.bright++;
      if (o.diameterPx >= minUsablePx) brightUsable++;
      continue;
    }
    const why: { reason?: LimbFailure } = {};
    const limb = polar
      ? measureLimbPolar(
          {
            luma,
            width,
            height,
            x: o.x,
            y: o.y,
            diameterPx: o.diameterPx,
            level:
              (o.diameterPx >= CORE_MIN_PX ? coreLevel(o, luma, bias, width, height) : null) ?? polar.level,
            background,
            bias,
            darkBackground: polar.pb.med,
            darkBias: polar.pb.biasAt.get(o.t) ?? 0,
          },
          { transfer },
          why
        )
      : measureLimb(
          { luma, background, width, height, x: o.x, y: o.y, diameterPx: o.diameterPx, bias },
          { transfer },
          why
        );
    if (!limb) {
      /* 대비가 모자라 광선 대부분을 못 쓴 것은 밝은 배경 탓이다(limb.ts 'contrast') */
      if (why.reason === 'contrast' && (o.visibleFrac ?? 1) >= NET_VISIBLE_FRAC) {
        drops.bright++;
        if (o.diameterPx >= minUsablePx) brightUsable++;
      } else {
        drops.limb++;
        if (why.reason === 'arc') arcDrops++;
      }
      continue;
    }
    const ratio = limb.diameterPx / o.diameterPx;
    if (ratio < LIMB_GUARD_MIN || ratio > LIMB_GUARD_MAX) {
      drops.guard++;
      continue;
    }
    seedD.push(o.diameterPx);
    widths.push(limb.edgePx);
    usedRays += limb.used;
    darkRays += limb.darkRays ?? 0;
    track.push({
      t: o.t,
      x: limb.x,
      y: limb.y,
      diameterPx: limb.diameterPx,
      visibleFrac: o.visibleFrac,
    });
  }
  /*
   * 흐림 보정 — 궤적 한 값(limb.ts EDGE_REF_PX · BLUR_KAPPA). 장면마다 보정하면 폭의 흔들림이 지름에 들어가 스피드건
   * LOO 가 1.3 → 2.6 으로 나빠졌다. 면적 ÷ 윤곽 비는 보정한 지름으로 잰다(릴리스 위치 기준점이 같은 자가 되게).
   */
  const edgeWidth = widths.length ? medianOf(widths) : null;
  const blurCut = edgeWidth != null ? blurCutPx(edgeWidth) : 0;
  const ratios: number[] = [];
  for (let k = 0; k < track.length; k++) {
    const d = track[k].diameterPx - blurCut;
    track[k] = { ...track[k], diameterPx: Math.max(1, d) };
    ratios.push(track[k].diameterPx / seedD[k]);
  }
  const report: DiameterReport = {
    ruler: 'limb',
    seed: seed.length,
    kept: track.length,
    drops,
    brightUsable,
    limbPerArea: ratios.length ? Math.round(medianOf(ratios) * 1000) / 1000 : null,
    edgeWidthPx: edgeWidth != null ? Math.round(edgeWidth * 1000) / 1000 : null,
    blurCorrectionPx: Math.round(blurCut * 1000) / 1000,
    blurred: edgeWidth != null && edgeWidth >= EDGE_LOW_PX,
    arcDrops,
  };
  if (polar) {
    report.polarity =
      darkRays === 0 ? 'bright' : darkRays >= 0.9 * usedRays ? 'dark' : 'mixed';
  }
  return { track, report };
}

/* ───────────────────────── 릴리스 ───────────────────────── */

/**
 * 릴리스 포인트와 릴리스 구속 추정.
 *
 * 투수 뒤: 릴리스 포인트는 '공을 처음 찾은 곳'(anchor — 첫 어림 궤적에서 쓸 만한 크기로 찍힌 첫 관측)의 3차원
 * 위치다. 윤곽은 번진 첫 장면을 빼곤 해서 계산의 첫 점이 그보다 한두 장 늦을 수 있는데, 포인트는 공을 놓은
 * 자리를 보여 줘야 해서 처음 찾은 곳으로 한다. 그 관측의 지름은 면적(자가 다름)이라 궤적의 '윤곽 ÷ 면적'
 * 중앙값을 곱해 윤곽 자로 옮긴다. 화면 가운데 표적에서 얼마나 벗어났는지를 cm 로 — 같은 투수가 공마다
 * 얼마나 같은 자리에서 놓는지(일관성)를 보는 데 쓴다. 카메라가 투수 뒤에 있으므로 오른쪽이 투수의 오른쪽이다.
 * 화면 y 는 아래로 자라므로 뒤집어 위를 + 로 둔다. 릴리스 구속은 계산의 첫 관측 시점의 모델 속도(startKmh).
 * 공을 처음 찾은 시각까지 공기저항으로 되돌리지 않는다 — 1차 검증에서 되돌리면 스피드건과 더 어긋났다(첫
 * 어림의 첫 덩어리가 손일 때가 있다). 그 사이 손실은 60fps 두세 장이면 1% 안팎이고 배율 보정에 흡수된다.
 *
 * 포수 뒤: 공이 마지막 몇 m 에 와서야 잴 만큼 커지므로 첫 관측 시점 속도는 릴리스보다 한참 낮다
 * (17m 면 약 8%). 설정에서 받은 카메라 → 릴리스 거리(releaseDistanceM)와 첫 관측 거리의 차이만큼
 * 되돌린다: v₀ = v·e^(K·gap). 거리를 모르면 릴리스 추정을 내지 않는다.
 */
/** 공기저항 상수 K 의 상대 불확실성 — 야구공의 항력계수 0.3~0.5(K 0.0045~0.0078)를 1σ 로 */
const RELEASE_DRAG_REL_SD = 0.25;

/** 첫 관측 시점 속도의 예상 σ(비율) — SE 를 못 냈으면 거부 문턱만큼 */
function startSigmaRel(measure: MeasureSuccess): number {
  const se = measure.detail.startSeKmh;
  return se != null
    ? speedSigmaRel(se, measure.detail.startKmh)
    : Math.hypot(MAX_RELATIVE_SE, SYSTEMATIC_FLOOR_REL);
}

function releaseInfo(
  observations: BallObservation[],
  lens: CameraLens,
  measure: MeasureSuccess,
  approach: Approach,
  releaseDistanceM: number | null | undefined,
  anchor: BallObservation | null,
  /** 잭나이프가 못 보는 σ(비율) — 흐림 · 보정 조건 밖(measureTrack) */
  extraSigmaRel = 0
): ReleaseInfo | null {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const sigmaRel = Math.hypot(startSigmaRel(measure), extraSigmaRel);
  if (approach === 'approaching') {
    if (!(releaseDistanceM != null && releaseDistanceM > 0)) return null;
    const gap = Math.max(0, releaseDistanceM - measure.detail.releaseDistanceM);
    const kmh = measure.detail.startKmh * Math.exp(DRAG_K_PER_M * gap);
    return {
      releaseKmh: round1(kmh),
      errorKmh: round1(ERROR_INTERVAL_Z * kmh * Math.hypot(sigmaRel, RELEASE_DRAG_REL_SD * DRAG_K_PER_M * gap)),
      dxCm: null,
      dyCm: null,
      distanceM: Math.round(releaseDistanceM * 100) / 100,
    };
  }
  const first =
    anchor ??
    [...observations]
      .sort((a, b) => a.t - b.t)
      .find((o) => o.diameterPx >= MIN_USABLE_BALL_PX);
  const point = first ? toPoint3D(first, lens) : null;
  if (!point) return null;
  return {
    releaseKmh: round1(measure.detail.startKmh),
    errorKmh: round1(ERROR_INTERVAL_Z * measure.detail.startKmh * sigmaRel),
    dxCm: round1(point.x * 100),
    dyCm: round1(-point.y * 100),
    distanceM: Math.round(point.z * 100) / 100,
  };
}

/* ───────────────────────── 본체 ───────────────────────── */

/** 장면이 모자라 거부된 것 — 밝은 배경에 뺀 장면 탓이면 그 까닭(BRIGHT_BACKGROUND)으로 바꿔 알린다 */
const SHORTAGE_CODES = new Set(['NOT_ENOUGH_FRAMES', 'TRAVEL_TOO_SHORT']);

export function analyzeFrames(input: AnalyzeFramesInput): AnalyzeResult {
  const {
    width,
    height,
    sourceWidth,
    sourceHeight,
    fovDeg = DEFAULT_FOV_DEG,
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
  /* 준 배경이 없으면 0 을 받아도 구간 안에서 뽑는다 — 배경이 비면 아무것도 못 찾는다 */
  const inWindowWanted = samples.length > 0 ? (input.inWindowBackground ?? 7) : 7;
  const inWindow = Math.min(Math.max(0, Math.floor(inWindowWanted)), frames.length);
  for (let i = 0; i < inWindow; i++) {
    samples.push(
      frames[Math.floor((i * (frames.length - 1)) / Math.max(1, inWindow - 1))].luma
    );
  }
  const background = buildBackground(samples);

  /* 3) 프레임마다 노출 치우침을 재고, 배경과 견줘 움직인 덩어리를 찾고, 공을 이어붙인다. */
  const lumaAt = new Map<number, ArrayLike<number>>();
  const biasAt = new Map<number, number>();
  /* 배경의 귀퉁이 블록 평균은 장면마다 같다 — 한 번만 센다(값은 exposureBias 와 똑같다) */
  const backgroundMeans = cornerMeans(background, width, height);
  /* 카메라 장면(정수)이면 정수 배경표로 4픽셀씩 견준다 — 덩어리는 한 픽셀도 다르지 않다(detect.ts backgroundTable) */
  const table = backgroundTable(background);
  const givenMeans =
    input.frameCornerMeans && input.frameCornerMeans.length === input.frames.length
      ? new Map(input.frames.map((f, i) => [f.luma, input.frameCornerMeans![i]]))
      : null;
  const biasList = frames.map((f) => {
    const fm = givenMeans?.get(f.luma);
    const bias = fm
      ? exposureBiasOfBoth(backgroundMeans, fm)
      : exposureBiasOfMeans(backgroundMeans, f.luma, width, height);
    lumaAt.set(f.t, f.luma);
    biasAt.set(f.t, bias);
    return bias;
  });
  /*
   * 렌즈의 초점거리. 공으로 보정한 값(focalPx)이 있으면 그것, 없으면 화각 가정으로 구한다.
   *
   * 화각은 화면의 '긴 쪽'을 기준으로 잰다. 폰에 적힌 화각(약 69도)은 가로로 눕혀 찍었을 때의
   * 값이다. 세로로 찍으면 같은 렌즈인데도 가로가 짧아져, 짧은 쪽에 그 화각을 대입하면 초점거리를
   * 실제보다 작게 본다. 그러면 공이 실제보다 가까이 있다고 계산돼 구속이 낮게 나온다. 초점거리는
   * 방향과 무관한 렌즈의 성질이므로, 긴 쪽으로 한 번 구해 두면 가로 · 세로 어느 쪽으로 찍어도
   * 같은 값을 쓴다. 추적에도 넘긴다(분석 픽셀 기준) — 크기 변화가 물리적으로 가능한지 보려고.
   */
  const focalPx =
    input.focalPx && input.focalPx > 0
      ? input.focalPx
      : focalPxFromFov(Math.max(sourceWidth, sourceHeight), fovDeg);

  /* 3~6) 예전 길(밝아진 곳만) — 못 쟀으면 두 번째 길(극성, 'PolarBackground' 설명)로 한 번 더 */
  const ctx: PassContext = {
    input,
    frames,
    background,
    table,
    biasList,
    lumaAt,
    biasAt,
    focalPx,
    shakePx,
    measuredFps,
  };
  const first = analyzePass(ctx, null);
  if (first.measure.ok || input.polarity === false || input.limb === false) return first;
  const { background: med, spread } = buildDarkBackground(samples);
  const biasMedAt = new Map<number, number>();
  /* 중앙값 배경의 귀퉁이 블록 평균도 한 번만 — 장면 쪽은 위에서 받은 것을 다시 쓴다(값은 exposureBias 와 같다) */
  const medMeans = cornerMeans(med, width, height);
  const biasMedList = frames.map((f) => {
    const fm = givenMeans?.get(f.luma);
    const bias = fm
      ? exposureBiasOfBoth(medMeans, fm)
      : exposureBiasOfMeans(medMeans, f.luma, width, height);
    biasMedAt.set(f.t, bias);
    return bias;
  });
  const second = analyzePass(ctx, { med, spread, biasAt: biasMedAt }, biasMedList);
  if (second.measure.ok || input.fallback === false) return second.measure.ok ? second : first;

  /*
   * 대비 길(1.9.0) — 밖 · 표적 그물 앞(docs/velocity/outdoor-2026-10-03.md). 거부됐을 때만 돈다 — 늘 끄면 실내 보정 영상
   * 15개 중 7개의 값이 바뀌고(f43a7958 83.8 → 80.5) 카메라 앞 흰 그물 너머 촬영이 전부 거부된다. 실내 18개 중 잰 15개는 첫
   * 길에서 끝나 값이 같고, 거부된 3개(094 밝은 배경 · 118 둘 장면 부족)는 대비 길 둘을 돌아도 거부라 first 를 그대로 돌려준다 —
   * 값 · 거부 까닭 모두 그대로(대비 길로 잰 영상 0). 거부되는 입력은 길이 넷이라 계산 시간이 두 길분 늘어난다.
   *   ③ 그물코 잇기(닫힘) 없이 — 흔들리는 표적 그물의 격자가 '움직인 픽셀'이 되면 닫힘이 공을 격자에 붙여 공 후보가
   *      사라진다(8개). 밝아짐만 본다(극성 길과 닫힘 0 의 조합은 실험하지 않았다).
   *   ④ 거기에 가운데 조건까지 없이 — 씨앗 자리(trackBall seedCenterRatio)와 릴리스 검사(validate.ts)의 0.45 는 픽셀 비율이라
   *      2배 줌에서는 각도로 두 배 엄격하다(광축에서 4.2°). 조건을 통째로 풀면 실내 2개가 0.6~1.1km/h 바뀌므로 여기서만.
   * 어느 길로 쟀는지 result.fallback 에 남긴다 — 보정 짝에서 빼고 믿음은 '보통'까지(measureTrack).
   */
  const third = analyzePass(ctx, null, [], { closeRadius: 0, fallback: 'close' });
  if (third.measure.ok) return third;
  const fourth = analyzePass(ctx, null, [], {
    closeRadius: 0,
    centerRatio: Number.POSITIVE_INFINITY,
    fallback: 'center',
  });
  return fourth.measure.ok ? fourth : first;
}

/** 대비 길의 설정(analyzeFrames) — 닫힘 반지름 · 씨앗 · 릴리스의 가운데 조건 · 결과에 남길 표시 */
type PassOptions = {
  closeRadius?: number;
  centerRatio?: number;
  fallback?: AnalyzeFallback;
};

/** analyzeFrames 의 한 길(예전 길 · 두 번째 길)이 함께 쓰는 것 — 장면 · 배경 · 노출 치우침 · 초점거리 · 흔들림 */
type PassContext = {
  input: AnalyzeFramesInput;
  frames: CapturedFrame[];
  background: Float32Array;
  /** 배경의 정수 배경표(detect.ts backgroundTable) — 카메라 장면이면 4픽셀씩 견준다 */
  table: BackgroundTable | null;
  biasList: number[];
  lumaAt: Map<number, ArrayLike<number>>;
  biasAt: Map<number, number>;
  focalPx: number;
  shakePx: number;
  measuredFps: number | null;
};

/**
 * 3~6) 감지 → 추적 → 첫 어림 → 거리 자 → 맞춤. polar 를 주면 두 번째 길(극성 — 'PolarBackground' 설명): 어두워짐도 보고
 * 지름을 화소마다 극성을 가려 잰다. polarBias 는 장면마다 중앙값 배경에 대한 노출 치우침(장면 차례).
 */
function analyzePass(
  ctx: PassContext,
  polar: PolarBackground | null,
  polarBias: number[] = [],
  pass: PassOptions = {}
): AnalyzeResult {
  const { input, frames, background, table, biasList, lumaAt, biasAt, focalPx, shakePx, measuredFps } =
    ctx;
  const { width, height, sourceWidth, sourceHeight, approach = 'receding' } = input;
  const blobFrames: FrameBlobs[] = frames.map((f, k) => ({
    t: f.t,
    blobs: findMovedBlobs(
      background,
      f.luma,
      width,
      height,
      biasList[k],
      table,
      polar ? { background: polar.med, spread: polar.spread, bias: polarBias[k] ?? 0 } : undefined,
      pass.closeRadius
    ),
  }));
  const rough = trackBall(blobFrames, {
    frameWidth: width,
    frameHeight: height,
    approach,
    seedFrames: input.seedFrames,
    focalDiameterPx: focalPx * (width / sourceWidth) * BALL_DIAMETER_M,
    ...(pass.centerRatio != null ? { seedCenterRatio: pass.centerRatio } : {}),
  });

  /* 두 번째 길 — 공의 밝기(배경과 무관)로 화소마다 극성을 가린다. 궤적이 없으면 아래가 알아서 거부한다 */
  const level = polar ? trackLevel(rough, lumaAt, biasAt, width, height) : null;
  const polarFor = polar && level != null ? { pb: polar, level } : null;

  /* 4) 첫 어림 — 지름 · 중심을 밝기 총량(면적)으로. 윤곽을 어디서 찾을지 · 검사 · 릴리스 위치에만 쓴다 */
  const seedTrack = polarFor
    ? refineTrackPolar(rough, lumaAt, biasAt, background, polarFor.pb, polarFor.level, width, height)
    : refineTrack(rough, lumaAt, biasAt, background, width, height);
  const scale = width / sourceWidth;

  /* 5) 거리 자 — 빛 받은 쪽 윤곽의 원(limb.ts). 시험용 limb:false 면 1.5.0 의 면적 */
  const measured =
    input.limb === false
      ? {
          track: seedTrack,
          report: {
            ruler: 'area' as const,
            seed: seedTrack.length,
            kept: seedTrack.length,
            drops: { bright: 0, limb: 0, guard: 0 },
            brightUsable: 0,
            limbPerArea: null,
            edgeWidthPx: null,
            blurCorrectionPx: 0,
            blurred: false,
            arcDrops: 0,
          },
        }
      : measureDiameters(
          seedTrack,
          lumaAt,
          biasAt,
          background,
          width,
          height,
          MIN_USABLE_BALL_PX * scale,
          input.transfer,
          polarFor
        );
  const track = measured.track;
  const diameter: DiameterReport = measured.report;

  // 지름·좌표를 원본 해상도 기준으로 되돌린다. 렌즈 정보가 원본 기준이기 때문이다.
  const toSource = (o: BallObservation, k = 1): BallObservation => ({
    t: o.t,
    x: o.x / scale,
    y: o.y / scale,
    diameterPx: (o.diameterPx * k) / scale,
  });
  const scaled: BallObservation[] = track.map((o) => toSource(o));

  /*
   * 촬영 자세 검사(거리 · 중앙)와 릴리스 포인트의 기준 관측 — 투수 뒤는 공을 처음 찾은 곳, 포수 뒤는 가장
   * 가까운 곳. 윤곽은 번진 장면(투수 뒤의 첫 장면 · 포수 뒤의 마지막 장면)을 빼곤 해서, 뺀 만큼 밀린 관측으로
   * 검사하면 멀쩡한 촬영이 '너무 멀다'로 거부된다(1차 검증: 거꾸로 돌린 실제 영상 셋이 포수 뒤로 TOO_FAR).
   * 그래서 첫 어림 궤적에서 쓸 만한 크기(원본 9px 이상)의 끝 관측을 쓰고, 지름은 윤곽 자로 옮긴다.
   */
  const anchor = (() => {
    if (diameter.ruler !== 'limb' || diameter.limbPerArea == null) return null;
    const usable = [...seedTrack]
      .sort((a, b) => a.t - b.t)
      .filter((o) => o.diameterPx / scale >= MIN_USABLE_BALL_PX);
    const at = approach === 'receding' ? usable[0] : usable[usable.length - 1];
    return at ? toSource(at, diameter.limbPerArea) : null;
  })();

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
    minFps: input.minFps,
    minLongSidePx: input.minLongSidePx,
  });

  const trackInput: TrackMeasureInput = {
    observations: scaled,
    anchor,
    lens,
    shakePx,
    approach,
    diameter,
    footage,
    releaseDistanceM: input.releaseDistanceM,
    calibrated: input.calibrated === true,
    domainSigmaRel: input.domainSigmaRel,
    exposureBlurPx: input.exposureBlurPx,
    exposureBlurSigmaPerPx: input.exposureBlurSigmaPerPx,
    confidenceCap: input.confidenceCap,
    ...(pass.centerRatio != null ? { maxReleaseOffsetRatio: pass.centerRatio } : {}),
    ...(pass.fallback ? { fallback: pass.fallback } : {}),
  };
  const { measure, release } = measureTrack(trackInput);

  return {
    measure,
    release,
    fps: measuredFps,
    track,
    analyzeSize: { width, height },
    sourceSize: { width: sourceWidth, height: sourceHeight },
    frameCount: frames.length,
    shakePx: Math.round(shakePx * 10) / 10,
    focalPx: Math.round(focalPx),
    diameter,
    ...(pass.fallback ? { fallback: pass.fallback } : {}),
    ...(input.debug ? { blobFrames, seedTrack, trackInput } : {}),
  };
}

/**
 * 거리 자로 잰 궤적(원본 픽셀) → 구속 · 릴리스. analyzeFrames 의 마지막 단계를 떼어 둔 것 — 영상 처리(감지 · 추적 ·
 * 지름)는 그대로 두고 맞춤 · 판정만 바꿔 볼 때 같은 코드로 다시 돌리려고(2차 보정 실험실).
 */
export type TrackMeasureInput = {
  /** 거리 자로 잰 관측(원본 픽셀) */
  observations: BallObservation[];
  /** 촬영 자세 · 릴리스 포인트의 기준 관측(원본 픽셀, 윤곽 자로 옮긴 것) — analyzeFrames 설명 */
  anchor: BallObservation | null;
  lens: CameraLens;
  shakePx: number;
  approach: Approach;
  diameter: DiameterReport;
  /** 영상 자체의 거부 사유(해상도 · fps) — 있으면 재지 않는다 */
  footage: Rejection | null;
  releaseDistanceM?: number | null;
  /** 보정한 조건 안인가(AnalyzeFramesInput.calibrated) — 아니면 ± 를 넓히고 믿음은 '보통'까지 */
  calibrated?: boolean;
  /** 보정한 조건 밖일 때 ± 에 더할 σ(비율) — AnalyzeFramesInput.domainSigmaRel */
  domainSigmaRel?: number;
  /** 노출 번짐 문턱(분석 px) · σ — AnalyzeFramesInput.exposureBlurPx · exposureBlurSigmaPerPx */
  exposureBlurPx?: number | null;
  exposureBlurSigmaPerPx?: number;
  /** 믿음의 상한 — AnalyzeFramesInput.confidenceCap */
  confidenceCap?: 'medium' | 'low';
  /** 릴리스가 가운데에서 벗어나도 되는 비율 — 대비 길 ④ 만 Infinity(measure.ts · validate.ts checkFraming) */
  maxReleaseOffsetRatio?: number;
  /** 대비 길로 잰 것 — 믿음은 '보통'까지(스피드건으로 맞추지 않은 조건) */
  fallback?: AnalyzeFallback;
};

/** 번짐 탓일 수 있는 거부 — 노출 번짐이 문턱을 넘었으면 이 까닭들은 MOTION_BLUR 로 바꿔 알린다(무엇을 고칠지가 분명하게) */
const BLUR_OVERRIDABLE = new Set(['NOT_ENOUGH_FRAMES', 'TRAVEL_TOO_SHORT', 'UNSTABLE_TRACK', 'IMPLAUSIBLE_SPEED']);

export function measureTrack(input: TrackMeasureInput): {
  measure: MeasureResult;
  release: ReleaseInfo | null;
} {
  const { observations, anchor, lens, shakePx, approach, diameter, footage } = input;
  let measure: MeasureResult = footage
    ? { ok: false, ...footage }
    : measureVelocity({
        observations,
        lens,
        stability: { maxBackgroundShiftPx: shakePx },
        approach,
        framingAnchor: anchor,
        maxReleaseOffsetRatio: input.maxReleaseOffsetRatio,
      });

  /*
   * 장면이 모자라 거부됐는데 공 뒤가 밝아 뺀 장면이 있으면, 그 까닭을 알린다 — '공을 못 잡았다'만으로는 무엇을
   * 고칠지 모른다(과녁을 겨눈 공은 끝에서 흰 과녁 천 앞을 지난다).
   */
  /*
   * 밝은 배경 탓일 때만 — 밝은 배경으로 뺀 장면이 윤곽을 못 잰 장면보다 적지 않을 때. 한 장이라도 밝은 배경이면 이름을
   * 바꾸던 때는, 흐려서(윤곽 실패가 대부분) 못 잰 영상에도 '흰 과녁' 안내가 붙었다(2차 검증 — 견고성). 공이 천에 묻혀
   * 추적이 몇 장에서 끊기면 밝은 배경으로 뺀 장면은 한두 장뿐이어도 까닭은 천이다(합성 '흰 과녁 5m': 4장 중 1장).
   */
  if (
    !measure.ok &&
    SHORTAGE_CODES.has(measure.code) &&
    diameter.brightUsable > 0 &&
    diameter.brightUsable >= diameter.drops.limb
  ) {
    measure = { ok: false, ...reject('BRIGHT_BACKGROUND') };
  }
  /*
   * 믿음을 낮출 것 — 두 가지 다 값은 내되 'low' 로(값을 버리지는 않는다):
   *  - 초점이 크게 나간 영상(흐림 보정의 시험 범위 밖 — EDGE_MAX_PX)
   *  - 흰 천 · 흰 벽 앞이라 뺀 장면이 쓸 만한 크기 장면의 3분의 1 이상 — 남은 장면이 궤적의 앞쪽에 몰려 있다
   *    (1차 검증: eb05ae07 처럼 천 가장자리에 걸친 먼 장면은 넣고 빼기가 칼날이다)
   */
  if (measure.ok && measure.confidence !== 'low') {
    const usable = measure.detail.frames + diameter.brightUsable;
    if (diameter.blurred || (diameter.brightUsable > 0 && diameter.brightUsable * 3 >= usable)) {
      measure = { ...measure, confidence: 'low' };
    }
  }
  /*
   * 믿음 '보통'까지(값 · ± 는 아래):
   *  - 가장자리 폭 EDGE_MEDIUM_PX(1.8px) 이상 — 조금 흐린 영상
   *  - 보정한 조건 밖 — 다른 폰 · 카메라 실시간 · 240fps · HDR(AnalyzeFramesInput.calibrated 설명)
   *  - 윤곽 원호가 좁아 뺀 장면이 첫 어림의 3분의 1 이상 — 빛 받은 테두리가 한쪽만 남은 조명
   */
  if (measure.ok && measure.confidence === 'high') {
    const edge = diameter.edgeWidthPx;
    const arcLimited = diameter.seed > 0 && diameter.arcDrops >= ARC_DROP_MEDIUM_FRAC * diameter.seed;
    if ((edge != null && edge >= EDGE_MEDIUM_PX) || input.calibrated !== true || arcLimited) {
      measure = { ...measure, confidence: 'medium' };
    }
  }
  /*
   * 노출 번짐(카메라 실시간만) — 흐림 보정은 초점 흐림(둥글게 퍼짐)의 평균을 맞춘 것이라, 한 장 안에서 공이 작아지며 생긴
   * 번짐(1/30초 노출)은 크게 틀린다: 보정 영상 두 장면을 겹쳐 흉내 내자 17개 중 16개가 높게, −5~+36%(가장자리 폭 2.6~6.2px,
   * 또렷한 장면 1.32~1.64px — 2026-09-30 되돌려 보기). 사용자 규칙(2026-09-30: 촬영 조건으로는 값을 막지 않는다)으로 값은
   * 내되 믿음 '낮음'에 ± 를 넓힌다(아래 exposureSigma). 공을 못 이어 거부된 것은 번짐이 까닭이라고 알린다.
   */
  const exposureBlurred =
    input.exposureBlurPx != null && diameter.edgeWidthPx != null && diameter.edgeWidthPx >= input.exposureBlurPx;
  if (exposureBlurred && !measure.ok && BLUR_OVERRIDABLE.has(measure.code)) {
    measure = { ok: false, ...reject('MOTION_BLUR') };
  }
  if (measure.ok && (input.confidenceCap === 'low' || exposureBlurred)) measure = { ...measure, confidence: 'low' };
  if (measure.ok && input.confidenceCap === 'medium' && measure.confidence === 'high') {
    measure = { ...measure, confidence: 'medium' };
  }
  /*
   * 밝은 배경 앞의 어두운 공(두 번째 길 — 'dark' · 'mixed') — 윤곽 자리를 실제 카메라로 확인하지 못했다(limb.ts '어두운 공의
   * 윤곽'). 믿음은 '보통'까지, ± 에 DARK_POLARITY_SIGMA_REL 을 더한다(아래).
   */
  const darkBall = diameter.polarity === 'dark' || diameter.polarity === 'mixed';
  if (measure.ok && darkBall && measure.confidence === 'high') measure = { ...measure, confidence: 'medium' };
  /* 대비 길(1.9.0)로 잰 것도 '보통'까지 — 밖 · 2배 줌 짝 13개가 평균 2.6~3.5km/h 낮게 읽혔고 아직 그 조건을 맞추지 않았다 */
  if (measure.ok && input.fallback && measure.confidence === 'high') measure = { ...measure, confidence: 'medium' };
  /* ± 에 잭나이프가 못 보는 σ(흐림 · 보정 조건 밖)를 더한다 — 구간 평균 · 릴리스 둘 다 */
  /*
   * σ 는 1.6px 부터 서서히 켠다(알림 · '낮음'은 문턱 exposureBlurPx 부터) — 문턱에서 계단처럼 켜면 그 바로 밑(1.65~1.8px, 1/30초에
   * 가까운 노출)의 −10.7 · +11% 가 ± 끝에 걸렸다(2026-09-30 정확도 검증).
   */
  const exposureSigma =
    input.exposureBlurPx != null && diameter.edgeWidthPx != null && diameter.edgeWidthPx > BLUR_SIGMA_REF_PX
      ? (input.exposureBlurSigmaPerPx ?? 0) * (diameter.edgeWidthPx - BLUR_SIGMA_REF_PX)
      : 0;
  const extraSigmaRel = darkBall
    ? Math.hypot(
        blurSigmaRel(diameter.edgeWidthPx),
        input.calibrated === true ? 0 : (input.domainSigmaRel ?? OUT_OF_DOMAIN_SIGMA_REL),
        exposureSigma,
        DARK_POLARITY_SIGMA_REL
      )
    : Math.hypot(
        blurSigmaRel(diameter.edgeWidthPx),
        input.calibrated === true ? 0 : (input.domainSigmaRel ?? OUT_OF_DOMAIN_SIGMA_REL),
        exposureSigma
      );
  if (measure.ok && extraSigmaRel > 0) {
    measure = {
      ...measure,
      errorKmh:
        Math.round(Math.hypot(measure.errorKmh, ERROR_INTERVAL_Z * extraSigmaRel * measure.kmh) * 10) / 10,
    };
  }
  return {
    measure,
    release: measure.ok
      ? releaseInfo(observations, lens, measure, approach, input.releaseDistanceM, anchor, extraSigmaRel)
      : null,
  };
}
