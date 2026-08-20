import {
  fitSpeed,
  toPoint3D,
  type BallObservation,
  type BallPoint3D,
  type CameraLens,
} from './geometry.ts';
import {
  checkFit,
  checkFraming,
  checkLens,
  checkTrackContinuity,
  estimateErrorKmh,
  gradeConfidence,
  reject,
  type CameraStability,
  type Confidence,
  type Rejection,
} from './validate.ts';

/**
 * 구속 측정의 진입점.
 *
 * 프레임마다 찾아낸 공(위치·지름)을 받아 구속 하나를 낸다.
 * 회전수·무브먼트·구종은 다루지 않는다 — 이 기능은 구속만 잰다.
 *
 * 결과는 성공 아니면 거부 둘 중 하나이며, 어중간한 값을 내주지 않는다.
 * 조건을 못 지킨 촬영에서 그럴듯한 숫자가 나오는 것이 가장 나쁜 실패다.
 */

export type MeasureInput = {
  /** 프레임마다 찾은 공. 시간순이 아니어도 된다. */
  observations: BallObservation[];
  lens: CameraLens | null;
  /** 배경이 얼마나 흔들렸는지 — 삼각대 고정 여부 판정에 쓴다 */
  stability?: CameraStability;
};

export type MeasureSuccess = {
  ok: true;
  /** 구간 평균 구속(km/h), 소수 첫째 자리 */
  kmh: number;
  /** ± 오차 어림(km/h) */
  errorKmh: number;
  confidence: Confidence;
  /** 화면에 근거로 보여줄 값들 */
  detail: {
    frames: number;
    fitQuality: number;
    travelM: number;
    releaseDistanceM: number;
    durationSec: number;
  };
};

export type MeasureFailure = { ok: false } & Rejection;

export type MeasureResult = MeasureSuccess | MeasureFailure;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 이보다 작게 찍힌 공은 계산에서 뺀다(픽셀).
 *
 * 공이 멀어지면 화면에서 몇 픽셀까지 작아지는데, 그 구간은 지름을 반 픽셀만
 * 잘못 재도 거리가 몇 미터씩 튄다. 어차피 결과에 거의 기여하지 못하는 값이라
 * (멀수록 가중치가 낮다) 아예 빼는 편이 낫다.
 *
 * 처음에는 이 구간까지 검사에 넣었다가, 잡음이 조금만 섞여도 정상 촬영이
 * 전부 거부되는 것을 보고 넣었다. 뒤쪽 몇 프레임을 버려도 앞쪽 정확한
 * 구간만으로 속도를 내는 데는 문제가 없다.
 */
export const MIN_USABLE_BALL_PX = 9;

export function measureVelocity(input: MeasureInput): MeasureResult {
  const { observations, lens, stability } = input;

  // 1) 렌즈를 모르면 거리를 못 구한다. 여기서 막지 않으면 뒤가 전부 무의미하다.
  const lensProblem = checkLens(lens);
  if (lensProblem) return { ok: false, ...lensProblem };
  const camera = lens as CameraLens;

  /*
   * 2) 믿을 수 있는 크기로 찍힌 관측만 남긴다.
   *    단, 앞부분(가까울 때)이 잘려나가면 안 되므로 뒤에서부터 자른다.
   */
  const byTime = [...observations].sort((a, b) => a.t - b.t);
  const usable: BallObservation[] = [];
  for (const obs of byTime) {
    if (obs.diameterPx < MIN_USABLE_BALL_PX) break;
    usable.push(obs);
  }

  // 3) 추적이 매끄러웠는지 — 공이 아닌 것을 따라간 흔적이 있으면 여기서 걸린다.
  const trackProblem = checkTrackContinuity(usable, camera);
  if (trackProblem) return { ok: false, ...trackProblem };

  const sorted = usable;

  // 4) 화면 관측을 3차원 위치로. 하나라도 변환에 실패하면 그 촬영은 쓸 수 없다.
  const points: BallPoint3D[] = [];
  for (const obs of sorted) {
    const point = toPoint3D(obs, camera);
    if (!point) return { ok: false, ...reject('UNSTABLE_TRACK') };
    points.push(point);
  }

  // 5) 촬영 자세 — 고정했는지, 1m 이내인지, 릴리스가 중앙인지.
  const framingProblem = checkFraming({
    first: { obs: sorted[0], point: points[0] },
    lens: camera,
    stability,
  });
  if (framingProblem) return { ok: false, ...framingProblem };

  // 6) 속도를 낸다. 모든 프레임을 직선에 맞춰 개별 오차를 상쇄시킨다.
  const fit = fitSpeed(points);
  if (!fit) return { ok: false, ...reject('NOT_ENOUGH_FRAMES') };

  // 7) 나온 값이 쓸 만한지 마지막으로 본다.
  const fitProblem = checkFit(fit);
  if (fitProblem) return { ok: false, ...fitProblem };

  return {
    ok: true,
    kmh: round1(fit.kmh),
    errorKmh: round1(estimateErrorKmh(fit, camera)),
    confidence: gradeConfidence(fit),
    detail: {
      frames: fit.sampleCount,
      fitQuality: Math.round(fit.fitQuality * 1000) / 1000,
      travelM: round1(Math.abs(fit.endDistanceM - fit.startDistanceM)),
      releaseDistanceM: round1(fit.startDistanceM),
      durationSec: Math.round(fit.durationSec * 1000) / 1000,
    },
  };
}
