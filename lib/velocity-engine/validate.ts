import {
  BALL_DIAMETER_M,
  CURVATURE_TRIM_SIGMA,
  MIN_OBSERVATIONS,
  type BallObservation,
  type BallPoint3D,
  type CameraLens,
  type SpeedFit,
} from './geometry.ts';

/**
 * 촬영 조건 검사 — 조건을 못 지킨 촬영은 숫자를 내지 않는다.
 *
 * 이 파일이 이 기능의 안전장치다. 구속은 "틀린 값이 나오는 것"이 "안 나오는
 * 것"보다 훨씬 나쁘다. 130이 나와야 할 자리에 145가 찍히면 선수는 그 숫자를
 * 믿고 훈련을 조절하고, 나중에 틀린 것을 알면 지금까지의 기록 전체를 의심하게
 * 된다. 그래서 조금이라도 미심쩍으면 결과를 내주지 않고 무엇이 잘못됐는지
 * 알려주는 쪽을 택한다.
 *
 * 판단은 전부 규칙이며, 애매하면 거부한다.
 */

/* ------------------------------- 기준값 ------------------------------- */

/**
 * 카메라와 릴리스 지점 사이 허용 거리(m).
 *
 * 참고하는 촬영 방식은 "투수 뒤 1m 이내"를 요구한다. 공이 카메라에서 멀수록
 * 화면에 작게 찍히고, 작을수록 지름 한 픽셀의 오차가 거리 오차로 크게 번진다.
 * 다만 팔을 뻗은 릴리스 지점은 삼각대보다 조금 앞이므로 여유를 둔다.
 */
/*
 * 2.5 → 4 (2026-09-28). 실제 보정 영상(김민, 폰을 투수 뒤 2~2.5m 에 둠)이 화각을 바로잡자(69° → 62°)
 * 릴리스 거리가 2.3~2.9m 로 나와 절반이 TOO_FAR 로 거부됐다. 사람들은 1m 에 못 붙인다 — 4m 까지 받고,
 * 멀어서 공이 작으면 다른 검사(프레임 수 · 궤적 안정)가 거른다.
 */
export const MAX_RELEASE_DISTANCE_M = 4;

/** 이보다 가까우면 공이 프레임을 벗어나거나 초점이 안 맞는다. */
export const MIN_RELEASE_DISTANCE_M = 0.4;

/**
 * 포수 뒤에서 찍을 때(공이 다가옴) 마지막 관측(가장 가까운 공)이 카메라에서 이만큼 안이어야
 * 한다(m). 포수 미트는 카메라 앞 1~3m 다. 릴리스 지점은 화면에 안 잡히므로 대신 이걸 본다.
 */
export const MAX_APPROACH_END_DISTANCE_M = 4;

/** 공이 카메라에서 멀어지나(투수 뒤) 다가오나(포수 뒤) */
export type Approach = 'receding' | 'approaching';

/**
 * 릴리스 지점이 화면 중앙에서 벗어나도 되는 정도.
 * 화면 짧은 변의 절반을 1.0으로 본 비율이며, 참고 앱의 중앙 상자와 비슷하다.
 */
export const MAX_RELEASE_OFFSET_RATIO = 0.45;

/** 공이 이만큼은 멀어져야 속도를 낼 수 있다(m). 너무 짧으면 오차가 지배한다. */
export const MIN_TRAVEL_M = 2.5;

/**
 * 궤적이 직선에서 벗어난 정도의 하한(세 축 R²). 이보다 낮으면 공을 놓친 것으로 본다.
 *
 * 모델 1.6.0 에서 다시 따졌다: 공기저항 곡선 위 장면마다의 거리 잡음이 σ_z 이면 R² ≈ 1 − 12·(σ_z / 이동 거리)². 실제로
 * 본 가장 나쁜 장면 잡음(작은 공 2%)으로 10m 에서 가장 짧게 허락한 이동(2.5m)이면 0.92 — 멀쩡한 공은 이 위에 있다(실제
 * 영상 18개는 모두 0.995 이상). 몇 장이 답을 좌우하는 궤적은 이것이 아니라 잭나이프 SE(MAX_RELATIVE_SE)가 거른다 —
 * 이것은 공이 아닌 것을 따라간 큰 실패만 본다. 그래서 0.9 를 그대로 둔다.
 */
export const MIN_FIT_QUALITY = 0.9;

/** 사람이 던질 수 있는 범위(km/h). 밖이면 측정이 틀린 것이다. */
/**
 * 넣은 거리와 공 크기로 본 끝 거리가 이만큼(비율) 넘게 다르면 공을 미트 · 그물까지 따라가지 못한 것(앞에서 놓침) 또는 너머까지 따라간 것 —
 * 끝 장면이 넣은 거리가 아니라 넣은 거리를 엉뚱한 장면에 붙여 값이 크게 틀린다. 2026-10-09 실내(폰 → 미트 18.5m) 13구: 15% 안 8구
 * MAE 1.45km/h, 넘은 4구 +22~+76km/h(공 크기 13.6 · 14.8 · 22.1 · 26.5m). 값은 보이되(막지 않음) 믿음 '낮음' · ± 를 그 차이만큼.
 */
export const INPUT_SIZE_MISMATCH = 0.15;

export const MIN_PLAUSIBLE_KMH = 40;
export const MAX_PLAUSIBLE_KMH = 180;

/**
 * 프레임 사이에 공이 나아갈 수 있는 최대 거리를 정하는 기준 속도(km/h).
 *
 * ── 왜 "지름이 몇 % 줄었나"로 재지 않는가 ──
 *
 * 지름이 줄어드는 속도는 공이 카메라에서 얼마나 떨어져 있느냐에 따라 완전히
 * 다르다. 릴리스 직후(1.2m)에는 조금만 나아가도 지름이 절반으로 줄지만,
 * 15m 밖에서는 같은 거리를 가도 거의 안 변한다. 실제로 재보니 릴리스 직후
 * 축소율이 초당 27배에 달했다.
 *
 * 그래서 지름 자체가 아니라, 지름에서 거리를 구한 뒤 "그 사이 공이 몇 미터
 * 갔는가"로 판단한다. 이건 거리와 무관하게 뜻이 같은 값이라 기준을 하나로
 * 정할 수 있다. 사람이 던질 수 있는 속도보다 빠르게 움직였다면 공이 아니다.
 *
 * 처음에는 프레임당 35%로, 다음에는 초당 12배로 재려다 둘 다 정상 촬영을
 * 거부했다. 재는 대상 자체가 틀렸던 것이다.
 */
export const MAX_STEP_SPEED_KMH = 200;

/**
 * 뒤로 가는 것처럼 보여도 되는 정도(m)의 하한.
 *
 * 240fps처럼 프레임이 촘촘하면 한 프레임에 공이 15cm밖에 안 가는데 잡음은
 * 그대로라, 이웃한 두 프레임만 보면 뒤로 간 것처럼 보이는 일이 흔하다.
 * 그래서 이웃 프레임끼리 재지 않고 CONTINUITY_GAP_SEC 만큼 떨어진 프레임끼리 잰다.
 *
 * 여기에 더해, 허용치를 거리에 따라 늘린다. 아래 설명 참고.
 */
export const MAX_BACKWARD_STEP_M = 0.3;

/**
 * 공 지름을 잴 때 이 정도는 틀릴 수 있다고 보는 값(픽셀).
 *
 * 허용치를 미터로 고정하면 안 된다. 같은 1픽셀 오차라도 공이 가까울 때는
 * 몇 밀리미터, 멀어져 9픽셀로 작아졌을 때는 1미터가 넘는 거리 오차가 된다.
 * 실제로 0.5m 고정으로 뒀더니 촘촘한 촬영이 전부 거부됐다.
 *
 * 그래서 그 거리에서 잡음이 만들어낼 수 있는 오차를 계산해 허용치를 정한다.
 *   거리오차 ≈ 거리² × 픽셀오차 / (공지름 × 초점거리)
 */
export const ASSUMED_DIAMETER_NOISE_PX = 1.2;

/** 잡음으로 설명되는 오차의 몇 배까지 봐줄지 */
const NOISE_TOLERANCE_FACTOR = 3;

/** 그 거리에서 지름 잡음이 만들어낼 수 있는 거리 오차(m) */
function expectedDistanceErrorM(z: number, lens: CameraLens): number {
  const k = BALL_DIAMETER_M * lens.focalPx;
  return (z * z * ASSUMED_DIAMETER_NOISE_PX) / k;
}

/**
 * 연속성을 검사할 때 몇 프레임 간격으로 볼지 정하는 최소 시간(초).
 *
 * 이 시간만큼 떨어진 프레임끼리 비교하면, 그 사이 공이 충분히 움직여 잡음에
 * 묻히지 않는다. 촘촘한 촬영에서 정상 영상이 거부되던 문제를 이걸로 잡았다.
 */
export const CONTINUITY_GAP_SEC = 1 / 30;

/** 프레임 간격을 모를 때 쓰는 값(초). 30fps 기준. */
const FALLBACK_FRAME_GAP_SEC = 1 / 30;

/**
 * 촬영 중 카메라가 움직여도 되는 정도(픽셀).
 * 삼각대에 고정했다면 배경은 거의 그대로다. 손으로 들면 이 값을 넘는다.
 */
export const MAX_CAMERA_SHAKE_PX = 6;

/**
 * 쓸 만한 화면 가로 픽셀 수의 최소값.
 *
 * 이 방식은 공의 지름을 픽셀로 재서 거리를 구한다. 화질이 낮으면 조금만
 * 멀어져도 공이 몇 픽셀로 뭉개져 잴 수가 없다. 화각 69도 기준으로 공이
 * 9픽셀이 되는 거리는 가로 720에서 4.2m, 1080에서 6.4m, 1920에서 11.3m다.
 * 릴리스가 1.5m 앞이라고 보면 720에서는 쓸 구간이 2.7m밖에 안 남는다.
 */
export const MIN_FRAME_WIDTH_PX = 1000;

/**
 * 공이 날아가는 동안 담겨야 할 최소 장면 수를 위한 초당 프레임 하한.
 *
 * 실제로 30fps·720p로 찍은 투구 영상을 넣어보니, 공이 손을 떠난 다음
 * 장면에서 이미 네트에 닿아 있었다. 쓸 만한 구간(공이 9픽셀보다 크게 찍히는
 * 구간)을 130km/h로 지나는 데 720p에서 0.076초밖에 안 걸리기 때문이다.
 * 30fps면 그 사이 두세 장, 240fps면 열여덟 장이 담긴다.
 *
 * 30장 급만 막고 60장 급은 받는다(2026-09-28 사용자 — "60프레임 일반 영상도 되게, 30 이하만
 * 막아라"). 60 으로 두었더니 폰의 60fps 영상(59.94 · 어두우면 장면이 늘어지는 가변 fps)이
 * 60 밑으로 세어져 거부됐다. 60fps 에서 공이 담기는 장수가 모자라면 NOT_ENOUGH_FRAMES 가 거른다.
 */
export const MIN_FPS = 50;

/**
 * 영상 자체가 측정에 쓸 수 있는 조건인지 미리 본다.
 *
 * 공을 찾기 전에 알 수 있는 것들이라 먼저 확인한다. 한참 분석한 뒤에
 * "공을 못 찾았다"고만 말하면, 무엇을 고쳐야 하는지 알 수 없다.
 */
export function checkFootage(input: {
  frameWidth: number;
  frameHeight: number;
  /** 영상의 실제 초당 장면 수. 셀 수 없으면 넣지 않는다. */
  fps?: number | null;
  /** 받는 가장 낮은 fps — 기본 MIN_FPS. 카메라 실시간은 0(촬영 조건으로 막지 않는다, AnalyzeFramesInput.minFps) */
  minFps?: number;
  /** 받는 가장 작은 긴 변 — 기본 MIN_FRAME_WIDTH_PX. 카메라 실시간은 0(AnalyzeFramesInput.minLongSidePx) */
  minLongSidePx?: number;
}): Rejection | null {
  // 세로로 찍으면 가로가 짧다. 둘 중 긴 쪽을 기준으로 본다.
  const longSide = Math.max(input.frameWidth, input.frameHeight);
  if (longSide < (input.minLongSidePx ?? MIN_FRAME_WIDTH_PX)) return reject('RESOLUTION_TOO_LOW');
  if (input.fps != null && input.fps > 0 && input.fps < (input.minFps ?? MIN_FPS)) {
    return reject('FRAME_RATE_TOO_LOW');
  }
  return null;
}

/* ------------------------------ 거부 사유 ------------------------------ */

export type RejectCode =
  | 'RESOLUTION_TOO_LOW'
  | 'FRAME_RATE_TOO_LOW'
  | 'NOT_ENOUGH_FRAMES'
  | 'CAMERA_SHAKE'
  | 'TOO_FAR'
  | 'TOO_CLOSE'
  | 'RELEASE_NOT_CENTERED'
  | 'TRAVEL_TOO_SHORT'
  | 'UNSTABLE_TRACK'
  | 'IMPLAUSIBLE_SPEED'
  | 'LENS_UNKNOWN'
  | 'BRIGHT_BACKGROUND'
  | 'MOTION_BLUR';

export type Rejection = {
  code: RejectCode;
  /** 사용자에게 그대로 보여줄 한 줄 */
  message: string;
  /** 다음에 어떻게 찍으면 되는지 */
  fix: string;
};

const REJECTIONS: Record<RejectCode, Omit<Rejection, 'code'>> = {
  RESOLUTION_TOO_LOW: {
    message: '영상 화질이 낮아 공이 너무 작게 찍혔습니다.',
    fix: '카메라 설정에서 1080p 이상으로 바꿔 다시 찍어주세요. 화질이 낮으면 공이 몇 픽셀 안 돼 거리를 잴 수 없습니다.',
  },
  FRAME_RATE_TOO_LOW: {
    message: '초당 장면 수가 부족해 공이 날아가는 모습이 담기지 않았습니다.',
    fix: '60fps 이상으로 찍어주세요(일반 60fps · 슬로모션 120~240fps). 30fps 에서는 공이 손을 떠나 네트에 닿기까지가 한두 장면 사이에 끝나버립니다.',
  },
  NOT_ENOUGH_FRAMES: {
    message: '공을 충분히 잡지 못했습니다.',
    /*
     * 흰 과녁 천 앞으로 날아간 공은 손을 떠난 지 1~3장 만에 배경과 밝기가 같아져 궤적 자체가 안 잡힌다(2차 보정의
     * 3be4d460 · 675d2051) — 그때는 BRIGHT_BACKGROUND 가 아니라 이 까닭으로 끝나므로 여기에도 같은 안내를 둔다.
     */
    fix: '밝은 곳에서, 공이 가려지지 않게 다시 찍어주세요. 공 뒤에 흰 과녁 천 · 흰 벽이 오면 공이 배경에 묻혀 보이지 않습니다 — 카메라를 조금 낮추거나 어두운 천을 쓰세요. 슬로모션으로 찍으면 더 잘 잡힙니다.',
  },
  CAMERA_SHAKE: {
    message: '촬영 중 카메라가 움직였습니다.',
    fix: '삼각대나 고정된 곳에 폰을 거치하고 다시 찍어주세요. 손으로 들고 찍으면 측정할 수 없습니다.',
  },
  TOO_FAR: {
    message: '카메라가 투수에게서 너무 멀리 있습니다.',
    fix: '투수 바로 뒤(릴리스에서 2~3m 안)에 삼각대를 세우고, 공이 손을 떠나는 순간이 화면 가운데 오게 다시 찍어주세요.',
  },
  TOO_CLOSE: {
    message: '카메라가 너무 가깝습니다.',
    fix: '공이 화면에 다 들어오도록 조금만 뒤로 물러나 주세요.',
  },
  RELEASE_NOT_CENTERED: {
    message: '공을 놓는 지점이 화면 중앙에서 벗어났습니다.',
    fix: '릴리스 포인트가 화면 가운데 오도록 폰 높이와 방향을 맞춰주세요.',
  },
  TRAVEL_TOO_SHORT: {
    message: '공이 날아간 구간이 너무 짧습니다.',
    fix: '공이 포수나 네트에 닿을 때까지 녹화를 이어가 주세요.',
  },
  UNSTABLE_TRACK: {
    message: '공의 움직임이 고르지 않아 믿을 수 없는 값입니다.',
    fix: '공이 흐리게 찍혔거나(초점) 너무 짧게 보였을 수 있습니다. 초점을 공이 날아갈 쪽에 맞추고, 공과 배경의 색이 다른 곳에서 다시 찍어주세요.',
  },
  IMPLAUSIBLE_SPEED: {
    message: '측정값이 실제 투구 범위를 벗어났습니다.',
    fix: '공이 아닌 다른 것을 따라갔을 수 있습니다. 촬영 조건을 확인하고 다시 찍어주세요.',
  },
  LENS_UNKNOWN: {
    message: '이 카메라의 렌즈 정보를 아직 모릅니다.',
    fix: '측정 전 카메라 보정을 한 번 해주세요. 한 번만 하면 됩니다.',
  },
  /*
   * 공이 흰 과녁 천 · 흰 벽 · 밝은 조명 앞을 지나 테두리를 잴 수 없는 장면을 빼고 나니 모자란 것(analyze-frames.ts
   * MAX_BRIGHT_FRAC). 공(밝기 205 안팎)과 그 뒤 배경의 밝기가 같으면 공이 어디서 끝나는지 영상에 없다 — 기술로
   * 풀 수 없고 찍는 자리를 바꿔야 한다(2026-09-29 2차 보정: 과녁을 겨눈 공 둘이 끝에서 흰 천 앞을 지났다).
   */
  /*
   * 카메라 실시간만(AnalyzeFramesInput.exposureBlurPx). 한 장의 노출이 길면(초당 30장 급 카메라는 1/30초까지) 멀어지며
   * 작아지는 공이 번져 이어지지 않는다 — 공을 못 이어 거부된 까닭이 번짐일 때 이 말로 바꿔 알린다(값이 나온 번진 공은 거부하지
   * 않고 알림 · 넓은 ± 로 보인다, live-meter.ts). 보정 영상 두 장면을 겹친 1/30초 흉내: 가장자리 폭 2.6~6.2px(또렷한 장면
   * 1.32~1.64px, 2026-09-30 되돌려 보기).
   */
  MOTION_BLUR: {
    message: '공이 번져 찍혀 이어서 잴 수 없었습니다.',
    fix: '한 장의 노출이 길어 날아가는 공이 번집니다(초당 30장 안팎인 카메라에서 흔해요). 더 밝은 곳에서 재면(노출이 짧아져요) 나아지고, 60fps 로 찍는 카메라 · 앱이면 가장 정확합니다.',
  },
  BRIGHT_BACKGROUND: {
    message: '공이 흰 과녁 · 밝은 벽 앞을 지나가 공의 크기를 잴 수 없었습니다.',
    fix: '공 뒤로 어두운 배경이 오게 해 주세요 — 카메라를 조금 낮추거나 옆으로 옮기고, 흰 과녁 천은 어두운 천으로 바꾸면 됩니다. 공과 배경의 밝기가 같으면 공의 테두리가 영상에 남지 않습니다.',
  },
};

export function reject(code: RejectCode): Rejection {
  return { code, ...REJECTIONS[code] };
}

/* ------------------------------ 검사 ------------------------------ */

/** 촬영 중 카메라가 고정돼 있었는지 재는 데 쓰는 값 */
export type CameraStability = {
  /** 배경이 프레임 사이에 움직인 최대 픽셀 수 */
  maxBackgroundShiftPx: number;
};

/**
 * 렌즈 정보가 쓸 만한지 확인한다.
 * 초점거리를 모르면 거리를 계산할 수 없고, 그러면 구속도 낼 수 없다.
 */
export function checkLens(lens: CameraLens | null): Rejection | null {
  if (
    !lens ||
    !(lens.focalPx > 0) ||
    !(lens.frameWidth > 0) ||
    !(lens.frameHeight > 0)
  ) {
    return reject('LENS_UNKNOWN');
  }
  return null;
}

/** 촬영 자세(고정·거리·중앙) 검사 */
export function checkFraming({
  first,
  lens,
  stability,
  approach = 'receding',
  maxReleaseOffsetRatio = MAX_RELEASE_OFFSET_RATIO,
}: {
  /** 릴리스 직후 첫 관측 */
  /** 기준 관측 — 멀어지는 공은 첫 관측(릴리스), 다가오는 공은 마지막 관측(가장 가까울 때) */
  first: { obs: BallObservation; point: BallPoint3D };
  lens: CameraLens;
  stability?: CameraStability;
  approach?: Approach;
  /**
   * 릴리스가 가운데에서 벗어나도 되는 비율 — 기본 MAX_RELEASE_OFFSET_RATIO. 대비 길(analyze-frames.ts, 1.9.0)은 Infinity:
   * 0.45 는 픽셀 비율이라 2배 줌에서는 각도로 두 배 엄격해, 낮게 겨눈 밖 촬영의 릴리스가 모두 밖이었다(outdoor-2026-10-03.md).
   */
  maxReleaseOffsetRatio?: number;
}): Rejection | null {
  if (stability && stability.maxBackgroundShiftPx > MAX_CAMERA_SHAKE_PX) {
    return reject('CAMERA_SHAKE');
  }

  /*
   * 다가오는 공(포수 뒤)은 릴리스가 화면에 안 잡힌다 — 가장 가까운 공이 카메라 앞 몇 m 안에
   * 있는지만 보고, '가운데'는 따지지 않는다(공은 스트라이크 존 어디로든 온다).
   */
  if (approach === 'approaching') {
    if (first.point.z > MAX_APPROACH_END_DISTANCE_M) return reject('TOO_FAR');
    if (first.point.z < MIN_RELEASE_DISTANCE_M) return reject('TOO_CLOSE');
    return null;
  }

  if (first.point.z > MAX_RELEASE_DISTANCE_M) return reject('TOO_FAR');
  if (first.point.z < MIN_RELEASE_DISTANCE_M) return reject('TOO_CLOSE');

  // 중앙에서 벗어난 정도 — 화면 짧은 변의 절반을 1.0으로 본다.
  const half = Math.min(lens.frameWidth, lens.frameHeight) / 2;
  const offset = Math.hypot(
    first.obs.x - lens.frameWidth / 2,
    first.obs.y - lens.frameHeight / 2
  );
  if (offset / half > maxReleaseOffsetRatio) {
    return reject('RELEASE_NOT_CENTERED');
  }

  return null;
}

/**
 * 추적이 매끄러웠는지 검사한다.
 *
 * 공은 멀어지며 조금씩 작아진다. 갑자기 커지거나 확 작아졌다면 공이 아닌 것을
 * 따라간 것이므로, 그런 관측이 섞였으면 결과를 내지 않는다.
 */
export function checkTrackContinuity(
  observations: BallObservation[],
  lens: CameraLens,
  approach: Approach = 'receding'
): Rejection | null {
  if (observations.length < MIN_OBSERVATIONS) return reject('NOT_ENOUGH_FRAMES');

  const sorted = [...observations].sort((a, b) => a.t - b.t);
  const maxStepMps = MAX_STEP_SPEED_KMH / 3.6;

  const zAt = (i: number) => {
    const px = sorted[i].diameterPx;
    return px > 0 ? (BALL_DIAMETER_M * lens.focalPx) / px : null;
  };

  for (let i = 0; i < sorted.length; i++) {
    if (zAt(i) == null) return reject('UNSTABLE_TRACK');

    /*
     * 비교 상대를 CONTINUITY_GAP_SEC 이상 떨어진 뒤 프레임에서 찾는다.
     * 바로 옆 프레임과 비교하면, 촘촘한 촬영에서는 공이 움직인 거리보다
     * 잡음이 커서 정상 궤적도 튀는 것처럼 보인다.
     */
    let j = i + 1;
    while (j < sorted.length && sorted[j].t - sorted[i].t < CONTINUITY_GAP_SEC) j++;
    if (j >= sorted.length) break;

    const from = zAt(i);
    const to = zAt(j);
    if (from == null || to == null) return reject('UNSTABLE_TRACK');

    /* 다가오는 공은 거리가 줄어든다 — 부호를 뒤집어 '나아간 거리'로 같이 본다 */
    const step = approach === 'receding' ? to - from : from - to;
    const gap = sorted[j].t - sorted[i].t;
    const safeGap = gap > 0 ? gap : FALLBACK_FRAME_GAP_SEC;

    /*
     * 두 관측 각각에 잡음이 실릴 수 있으므로, 먼 쪽을 기준으로 허용 폭을 잡는다.
     * 가까울 때는 거의 0에 가깝고, 멀어질수록 알아서 넉넉해진다.
     */
    const slack =
      NOISE_TOLERANCE_FACTOR * expectedDistanceErrorM(Math.max(from, to), lens);

    // 사람이 던질 수 없는 속도로 나아갔다면 공이 아니다.
    if (step > maxStepMps * safeGap + slack) return reject('UNSTABLE_TRACK');

    // 멀어지던 공이 되돌아오는 일은 없다.
    if (step < -(MAX_BACKWARD_STEP_M + slack)) return reject('UNSTABLE_TRACK');
  }
  return null;
}

/*
 * ───────────────────── 불확실성 · 믿음(모델 1.6.0 — 2차 보정 core-f) ─────────────────────
 *
 * 값의 흔들림 σ = hypot(잭나이프 SE, 바닥 × 값).
 *  - 잭나이프 SE(geometry.ts fitSpeed): 1/30초 블록을 하나씩 빼고 다시 맞춘 값의 흩어짐 — 이 궤적의 장면 잡음과
 *    몇 장에 기대는 정도를 그대로 잰다. 실제 영상 14개(흰 천 없는 것)에서 가운데 1.1~1.3%, 제곱평균 1.27km/h 로
 *    스피드건과의 차이(배율 LOO 제곱평균 1.16~1.27km/h — 건 자체의 잡음까지 든 값)와 크기가 같았다.
 *  - 바닥(SYSTEMATIC_FLOOR_REL): 잭나이프가 못 보는 궤적 전체의 치우침 — 자의 배율이 영상마다 조금씩 다른 것
 *    (가장자리 폭 · 배경 밝기), 릴리스와 첫 관측 사이의 몇 장. 장면을 아무리 모아도 줄지 않는다.
 */

/** 잭나이프가 못 보는 궤적마다의 치우침(값에 대한 비율) — 설명은 위 */
export const SYSTEMATIC_FLOOR_REL = 0.01;

/**
 * 잭나이프 SE 가 값의 이만큼(5%)을 넘으면 거부한다. 그 궤적은 몇 장이 답을 좌우한다(공이 아닌 것을 따라갔거나 너무
 * 짧다). 5% 면 90% 구간이 ±8%(110km/h 에서 ±9km/h) — 직구와 변화구를 가를 수도 없어 숫자로 내면 안 된다. 실제 영상
 * 18개의 모든 구간에서 가장 큰 값은 4.4%(흰 천 가장자리의 eb05ae07, 먼 장면 넷)였다.
 */
export const MAX_RELATIVE_SE = 0.05;

/** 화면의 ± 는 90% 구간(정규분포 1.645σ) */
export const ERROR_INTERVAL_Z = 1.645;

/**
 * 믿음 등급 — 예상 σ(값에 대한 비율)로 나눈다. 높음: 1.5% 이하(110km/h 에서 90% 구간 ±2.7km/h, 스피드건끼리의 차이
 * 수준), 보통: 3% 이하(±5.4km/h), 그 밖은 낮음(참고용). 높음은 잭나이프 블록이 다섯 개 이상일 때만 — 블록이 적으면
 * SE 자체를 믿을 수 없다(블록 셋이면 SE 의 상대 흔들림이 50% 가 넘는다).
 */
export const HIGH_MAX_SIGMA_REL = 0.015;
export const MEDIUM_MAX_SIGMA_REL = 0.03;
export const HIGH_MIN_JACKKNIFE_BLOCKS = 5;

/** 예상 σ(값에 대한 비율). SE 를 못 냈으면(블록 셋 미만) 무한대 */
export function speedSigmaRel(seKmh: number, kmh: number): number {
  if (!Number.isFinite(seKmh) || !(kmh > 0)) return Number.POSITIVE_INFINITY;
  return Math.hypot(seKmh / kmh, SYSTEMATIC_FLOOR_REL);
}

/** 계산된 속도가 쓸 만한지 검사 */
export function checkFit(fit: SpeedFit): Rejection | null {
  if (fit.sampleCount < MIN_OBSERVATIONS) return reject('NOT_ENOUGH_FRAMES');
  if (fit.fitQuality < MIN_FIT_QUALITY) return reject('UNSTABLE_TRACK');

  const travel = Math.abs(fit.endDistanceM - fit.startDistanceM);
  if (travel < MIN_TRAVEL_M) return reject('TRAVEL_TOO_SHORT');

  if (fit.kmh < MIN_PLAUSIBLE_KMH || fit.kmh > MAX_PLAUSIBLE_KMH) {
    return reject('IMPLAUSIBLE_SPEED');
  }
  /* 몇 장이 답을 좌우하는 궤적 — 숫자를 내지 않는다(SE 를 못 냈으면 여기서는 보지 않고 믿음을 낮춘다) */
  if (Number.isFinite(fit.startSeKmh) && fit.startSeKmh > MAX_RELATIVE_SE * fit.startKmh) {
    return reject('UNSTABLE_TRACK');
  }
  return null;
}

/**
 * 이 측정을 얼마나 믿을 수 있는지 — 예상 σ(릴리스 값 기준)로 나눈다(위 설명). 그 밖에 낮추는 것:
 *  - 먼 쪽을 빼고도 궤적의 곡률이 공기저항으로 설명되지 않는 궤적(geometry.ts curvatureSigma > 3)은 높음이 될 수 없다 —
 *    자가 궤적을 따라 틀어져 있다는 뜻이고, 그 치우침은 잭나이프에 안 잡힌다.
 * 낮게 나오면 화면에서 "참고용"이라고 알린다.
 */
export type Confidence = 'high' | 'medium' | 'low';

/** 곡률이 문턱에서 이만큼(σ) 아래까지 오면 '높음'을 주지 않는다 — 위 설명 */
const CURVATURE_HIGH_MARGIN = 0.5;

export function gradeConfidence(fit: SpeedFit): Confidence {
  const sigma = speedSigmaRel(fit.startSeKmh, fit.startKmh);
  /*
   * 곡률이 문턱(CURVATURE_TRIM_SIGMA 3σ) 근처면 먼 쪽을 자르느냐 마느냐가 칼날이다 — 화각을 1° 만 바꿔도 a3df7d09 가
   * 2.6% 뛰었다(2차 검증 — 통계). 문턱보다 0.5σ 아래부터 '높음'을 주지 않는다.
   */
  const bent = fit.curvatureSigma > CURVATURE_TRIM_SIGMA - CURVATURE_HIGH_MARGIN;
  if (sigma <= HIGH_MAX_SIGMA_REL && fit.jackknifeBlocks >= HIGH_MIN_JACKKNIFE_BLOCKS && !bent) {
    return 'high';
  }
  if (sigma <= MEDIUM_MAX_SIGMA_REL) return 'medium';
  return 'low';
}

/**
 * 구간 평균(kmh)의 ± (km/h, 90% 구간). SE 를 못 냈으면 거부 문턱(5%)만큼 흔들린다고 본다.
 * 릴리스 구속의 ± 는 analyze-frames.ts releaseInfo 가 같은 식으로(startSeKmh) 낸다.
 */
export function estimateErrorKmh(fit: SpeedFit): number {
  const rel = Number.isFinite(fit.avgSeKmh)
    ? speedSigmaRel(fit.avgSeKmh, fit.kmh)
    : Math.hypot(MAX_RELATIVE_SE, SYSTEMATIC_FLOOR_REL);
  return ERROR_INTERVAL_Z * rel * fit.kmh;
}
