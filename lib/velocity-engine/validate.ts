import {
  BALL_DIAMETER_M,
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
export const MAX_RELEASE_DISTANCE_M = 2.5;

/** 이보다 가까우면 공이 프레임을 벗어나거나 초점이 안 맞는다. */
export const MIN_RELEASE_DISTANCE_M = 0.4;

/**
 * 릴리스 지점이 화면 중앙에서 벗어나도 되는 정도.
 * 화면 짧은 변의 절반을 1.0으로 본 비율이며, 참고 앱의 중앙 상자와 비슷하다.
 */
export const MAX_RELEASE_OFFSET_RATIO = 0.45;

/** 공이 이만큼은 멀어져야 속도를 낼 수 있다(m). 너무 짧으면 오차가 지배한다. */
export const MIN_TRAVEL_M = 2.5;

/** 궤적이 직선에서 벗어난 정도의 하한. 이보다 낮으면 공을 놓친 것으로 본다. */
export const MIN_FIT_QUALITY = 0.9;

/** 사람이 던질 수 있는 범위(km/h). 밖이면 측정이 틀린 것이다. */
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
 */
export const MIN_FPS = 60;

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
}): Rejection | null {
  // 세로로 찍으면 가로가 짧다. 둘 중 긴 쪽을 기준으로 본다.
  const longSide = Math.max(input.frameWidth, input.frameHeight);
  if (longSide < MIN_FRAME_WIDTH_PX) return reject('RESOLUTION_TOO_LOW');
  if (input.fps != null && input.fps > 0 && input.fps < MIN_FPS) {
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
  | 'LENS_UNKNOWN';

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
    fix: '슬로모션으로 찍어주세요. 일반 촬영(30장/초)에서는 공이 손을 떠나 네트에 닿기까지가 한두 장면 사이에 끝나버립니다.',
  },
  NOT_ENOUGH_FRAMES: {
    message: '공을 충분히 잡지 못했습니다.',
    fix: '밝은 곳에서, 공이 가려지지 않게 다시 찍어주세요. 슬로모션으로 찍으면 더 잘 잡힙니다.',
  },
  CAMERA_SHAKE: {
    message: '촬영 중 카메라가 움직였습니다.',
    fix: '삼각대나 고정된 곳에 폰을 거치하고 다시 찍어주세요. 손으로 들고 찍으면 측정할 수 없습니다.',
  },
  TOO_FAR: {
    message: '카메라가 투수에게서 너무 멀리 있습니다.',
    fix: '투수 바로 뒤 1m 이내에 삼각대를 세우고 다시 찍어주세요.',
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
    fix: '공과 배경이 비슷한 색이면 놓치기 쉽습니다. 배경이 단순한 곳에서 다시 찍어주세요.',
  },
  IMPLAUSIBLE_SPEED: {
    message: '측정값이 실제 투구 범위를 벗어났습니다.',
    fix: '공이 아닌 다른 것을 따라갔을 수 있습니다. 촬영 조건을 확인하고 다시 찍어주세요.',
  },
  LENS_UNKNOWN: {
    message: '이 카메라의 렌즈 정보를 아직 모릅니다.',
    fix: '측정 전 카메라 보정을 한 번 해주세요. 한 번만 하면 됩니다.',
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
}: {
  /** 릴리스 직후 첫 관측 */
  first: { obs: BallObservation; point: BallPoint3D };
  lens: CameraLens;
  stability?: CameraStability;
}): Rejection | null {
  if (stability && stability.maxBackgroundShiftPx > MAX_CAMERA_SHAKE_PX) {
    return reject('CAMERA_SHAKE');
  }

  if (first.point.z > MAX_RELEASE_DISTANCE_M) return reject('TOO_FAR');
  if (first.point.z < MIN_RELEASE_DISTANCE_M) return reject('TOO_CLOSE');

  // 중앙에서 벗어난 정도 — 화면 짧은 변의 절반을 1.0으로 본다.
  const half = Math.min(lens.frameWidth, lens.frameHeight) / 2;
  const offset = Math.hypot(
    first.obs.x - lens.frameWidth / 2,
    first.obs.y - lens.frameHeight / 2
  );
  if (offset / half > MAX_RELEASE_OFFSET_RATIO) {
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
  lens: CameraLens
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

    const step = to - from;
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

/** 계산된 속도가 쓸 만한지 검사 */
export function checkFit(fit: SpeedFit): Rejection | null {
  if (fit.sampleCount < MIN_OBSERVATIONS) return reject('NOT_ENOUGH_FRAMES');
  if (fit.fitQuality < MIN_FIT_QUALITY) return reject('UNSTABLE_TRACK');

  const travel = Math.abs(fit.endDistanceM - fit.startDistanceM);
  if (travel < MIN_TRAVEL_M) return reject('TRAVEL_TOO_SHORT');

  if (fit.kmh < MIN_PLAUSIBLE_KMH || fit.kmh > MAX_PLAUSIBLE_KMH) {
    return reject('IMPLAUSIBLE_SPEED');
  }
  return null;
}

/**
 * 이 측정을 얼마나 믿을 수 있는지.
 *
 * 통과했다고 다 같은 품질은 아니다. 프레임이 많고 직선에 잘 맞고 가까이서
 * 찍었을수록 믿을 만하다. 낮게 나오면 화면에서 "참고용"이라고 알린다.
 */
export type Confidence = 'high' | 'medium' | 'low';

export function gradeConfidence(fit: SpeedFit): Confidence {
  const travel = Math.abs(fit.endDistanceM - fit.startDistanceM);
  if (fit.sampleCount >= 12 && fit.fitQuality >= 0.985 && travel >= 6) return 'high';
  if (fit.sampleCount >= 7 && fit.fitQuality >= 0.96 && travel >= 4) return 'medium';
  return 'low';
}

/**
 * 잰 값이 얼마나 흔들릴 수 있는지 어림한다(± km/h).
 *
 * 지름을 반 픽셀 잘못 재는 것을 기준으로 잡는다. 공이 작게 찍힐수록(멀수록)
 * 같은 반 픽셀이 더 큰 오차가 되므로, 마지막 관측의 공 크기를 기준으로 본다.
 */
export function estimateErrorKmh(fit: SpeedFit, lens: CameraLens): number {
  const endBallPx = (BALL_DIAMETER_M * lens.focalPx) / fit.endDistanceM;
  if (!(endBallPx > 0)) return Number.POSITIVE_INFINITY;

  const relative = 0.5 / endBallPx;
  // 프레임이 많을수록 개별 오차가 서로 상쇄된다.
  const averaged = relative / Math.sqrt(Math.max(1, fit.sampleCount));
  return fit.kmh * averaged * 2;
}
