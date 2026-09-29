import {
  dragDistance,
  fitDrag,
  fitSpeed,
  fitWeights,
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
  MIN_TRAVEL_M,
  gradeConfidence,
  reject,
  type Approach,
  type CameraStability,
  type Confidence,
  type Rejection,
} from './validate.ts';

export type { Approach } from './validate.ts';

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
  /** 공이 멀어지나(투수 뒤, 기본) 다가오나(포수 뒤) */
  approach?: Approach;
  /**
   * 촬영 자세 검사(거리 · 중앙)에 쓸 관측(원본 픽셀). 투수 뒤는 공을 처음 찾은 곳, 포수 뒤는 마지막(가장 가까운) 곳.
   * 지름을 윤곽으로 재며 번진 첫 장면(투수 뒤) · 번진 마지막 장면(포수 뒤)을 뺐을 때, 뺀 만큼 밀린 관측으로
   * 검사하면 멀쩡한 촬영이 '너무 멀다'로 거부된다(analyze-frames.ts). 속도 계산에는 쓰지 않는다. 없으면 계산의 기준 관측.
   */
  framingAnchor?: BallObservation | null;
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
    /** 첫 관측 거리(m) — 투수 뒤에서는 릴리스 지점, 포수 뒤에서는 가장 먼 관측 */
    releaseDistanceM: number;
    durationSec: number;
    /** 첫 · 마지막 관측 시점의 속도(km/h, 공기저항 모델) */
    startKmh: number;
    endKmh: number;
    /** startKmh 의 표준오차(km/h, 1/30초 블록 잭나이프) — 릴리스 구속의 ± 를 낼 때. 블록이 모자라면 null */
    startSeKmh: number | null;
    /** 계산의 첫 관측 시각(초) — 릴리스 구속이 이 시점의 속도다 */
    startT: number;
    /** 양 끝 자르기(다른 것이 붙은 장면)로 시간상 앞 · 뒤에서 뺀 수, 먼 쪽 곡률 검사로 뺀 수 */
    startTrimmed: number;
    endTrimmed: number;
    farTrimmed: number;
    /** 남은 궤적의 곡률이 공기저항 범위를 벗어난 정도(흰 잡음 SE 단위, 0 이면 범위 안) */
    curvatureSigma: number;
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

/**
 * 양 끝 자르기 — 궤적의 맨 앞(시간상 첫) 관측과 맨 뒤 관측을 끝 몇 장을 뺀 고정 기준으로 예측해, 지름이 이만큼(12%) 넘게
 * 어긋나면 공이 아니라 다른 것이 붙은 덩어리로 보고 뺀다. 공기저항으로 날아가는 공은 이웃 장면과 몇 % 안에서
 * 이어진다(윤곽 자로 잰 실제 영상 13개의 첫 장면: 뒤 10장의 예측과 −4.2~+3.4%, 가운데 0.3%). 손과 한 덩어리로
 * 잡힌 장면은 −30% · +45% 였다(1차 조사, 면적 자). 문턱은 둘 사이 어디든 실제 영상의 결과가 같았다(0.12~0.28, 1차
 * 조사) — 실제 첫 장면 어긋남(−4.2~+3.4%)의 세 배쯤인 0.12 로 둬, 15% 부푼 첫 장면(합성 240fps +2.8% · 120fps +5.1%)도
 * 뺀다(2차 검증 — 견고성). 윤곽 자는 번진 릴리스 장면을 이미 빼서 실제 18개에서는 한 번도 자르지 않는다 — 안전장치다.
 *
 * 왜 두 끝 다: 무게가 가까운 쪽에 몰리므로(geometry.ts fitWeights) 가까운 끝의 덩어리 하나가 값을 끌고 간다.
 * 투수 뒤(멀어짐)는 가까운 끝이 시간상 첫 장면(손 · 팔이 붙은 릴리스), 포수 뒤(다가옴)는 마지막 장면(포수 미트 ·
 * 타자 · 손이 붙은 공)이다. 먼 끝(투수 뒤의 마지막, 포수 뒤의 첫 장면)은 투수 몸 · 과녁 천 가장자리가 붙을 수 있다 —
 * 무게는 작아도 계산의 시작 시각(포수 뒤) · 이동 거리 검사를 틀리게 한다. 먼 쪽의 천천히 휜 자는 여기가 아니라
 * 곡률 검사(geometry.ts)가 본다 — 이것은 한 장이 튄 것만 본다.
 */
export const END_CONSISTENCY_TOL = 0.12;
/** 한 끝에서 뺄 수 있는 최대 장 수 — 처음 이어지는 장면에서 멈춘다 */
export const END_MAX_DROP = 3;
/** 예측에 쓰는 옆 관측 수 — 궤적 전체로 예측하면 먼 쪽이 틀어진 궤적에서 멀쩡한 앞 장면을 빼곤 했다(1차 검증: 728 번 중 9 → 1) */
const END_REFERENCE_OBS = 10;
/** 예측하려면 옆에 이만큼은 있어야 한다 */
const END_MIN_REFERENCE = 6;

/**
 * 관측 target 의 거리를 옆 관측 ref 의 공기저항 곡선으로 예측해 (예측 거리 / 잰 거리 − 1) 을 낸다. 지름은 거리에
 * 반비례하므로 이 값이 곧 (잰 지름 / 예측 지름 − 1) 이다. 다가오는 공은 거리가 줄므로 −z 를 나아간 거리로 본다
 * (부호를 뒤집지 않으면 커진 장면을 남기고 줄어든 장면을 뺀다 — 1차 검증이 짚은 것).
 */
function endMismatch(
  target: BallObservation,
  ref: BallObservation[],
  lens: CameraLens,
  sign: number
): number | null {
  const p = toPoint3D(target, lens);
  const pts = ref.map((o) => toPoint3D(o, lens));
  if (!p || pts.some((q) => q == null)) return null;
  const ps = pts as BallPoint3D[];
  const t0 = ps[0].t;
  const fit = fitDrag(
    ps.map((q) => q.t - t0),
    ps.map((q) => sign * q.z),
    fitWeights(ps, lens)
  );
  const zPred = sign * (fit.a + dragDistance(fit.v0, p.t - t0));
  if (!(zPred > 0)) return null;
  return zPred / p.z - 1;
}

/** 시간순 관측의 두 끝에서 이어지지 않는 장면을 뺀다(한 끝에 최대 END_MAX_DROP 장) */
function trimInconsistentEnds(
  obs: BallObservation[],
  lens: CameraLens,
  approach: Approach
): { kept: BallObservation[]; startTrimmed: number; endTrimmed: number } {
  const sign = approach === 'receding' ? 1 : -1;
  const n = obs.length;
  /*
   * 끝의 END_MAX_DROP 장을 뺀 '고정 기준'으로 끝 장면 하나하나를 본다. 바로 옆 장면으로 예측하면 옆도 손 · 미트에 오염됐을
   * 때(두 장 연속) 기준이 함께 끌려가 둘 다 남았다 — 멀어지는 공은 그대로 거부, 다가오는 60fps 는 +17.5% 로 나왔다
   * (2차 검증 — 견고성). 어긋난 가장 바깥쪽 장면까지 뺀다. 실제 보정 영상 18개는 빼는 장면이 없다(값 그대로).
   */
  let start = 0;
  const refS = obs.slice(END_MAX_DROP, END_MAX_DROP + END_REFERENCE_OBS);
  if (refS.length >= END_MIN_REFERENCE && n - END_MAX_DROP >= END_MIN_REFERENCE + END_MAX_DROP) {
    for (let k = 0; k < END_MAX_DROP; k++) {
      const m = endMismatch(obs[k], refS, lens, sign);
      if (m != null && Math.abs(m) > END_CONSISTENCY_TOL) start = k + 1;
    }
  }
  let end = n;
  const refE = obs.slice(Math.max(start, n - END_MAX_DROP - END_REFERENCE_OBS), n - END_MAX_DROP);
  if (refE.length >= END_MIN_REFERENCE && n - start - END_MAX_DROP >= END_MIN_REFERENCE + END_MAX_DROP) {
    for (let k = 0; k < END_MAX_DROP; k++) {
      const m = endMismatch(obs[n - 1 - k], refE, lens, sign);
      if (m != null && Math.abs(m) > END_CONSISTENCY_TOL) end = n - 1 - k;
    }
  }
  return {
    kept: start > 0 || end < n ? obs.slice(start, end) : obs,
    startTrimmed: start,
    endTrimmed: n - end,
  };
}

export function measureVelocity(input: MeasureInput): MeasureResult {
  const { observations, lens, stability, approach = 'receding' } = input;

  // 1) 렌즈를 모르면 거리를 못 구한다. 여기서 막지 않으면 뒤가 전부 무의미하다.
  const lensProblem = checkLens(lens);
  if (lensProblem) return { ok: false, ...lensProblem };
  const camera = lens as CameraLens;

  /*
   * 2) 믿을 수 있는 크기로 찍힌 관측만 남긴다.
   *    단, 앞부분(가까울 때)이 잘려나가면 안 되므로 뒤에서부터 자른다.
   */
  const byTime = [...observations].sort((a, b) => a.t - b.t);
  /* 다가오는 공은 앞쪽(멀 때)이 작다 — 뒤에서부터 보아 앞을 자른다 */
  const ordered = approach === 'receding' ? byTime : [...byTime].reverse();
  const kept: BallObservation[] = [];
  for (const obs of ordered) {
    if (obs.diameterPx < MIN_USABLE_BALL_PX) break;
    kept.push(obs);
  }
  const inOrder = approach === 'receding' ? kept : kept.reverse();
  /* 2-1) 두 끝에서 다른 것이 붙은 장면(손 · 팔 · 미트)을 뺀다 — 윤곽 자에서는 드물다(실제 18개에서 0번). 안전장치 */
  const { kept: usable, startTrimmed, endTrimmed } = trimInconsistentEnds(inOrder, camera, approach);

  // 3) 추적이 매끄러웠는지 — 공이 아닌 것을 따라간 흔적이 있으면 여기서 걸린다.
  const trackProblem = checkTrackContinuity(usable, camera, approach);
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
  const anchor = approach === 'receding' ? 0 : sorted.length - 1;
  const anchorObs = input.framingAnchor ?? sorted[anchor];
  const anchorPoint =
    anchorObs === sorted[anchor] ? points[anchor] : toPoint3D(anchorObs, camera);
  if (!anchorPoint) return { ok: false, ...reject('UNSTABLE_TRACK') };
  const framingProblem = checkFraming({
    first: { obs: anchorObs, point: anchorPoint },
    lens: camera,
    stability,
    approach,
  });
  if (framingProblem) return { ok: false, ...framingProblem };

  // 6) 속도를 낸다. 모든 프레임을 공기저항 곡선에 맞춰 개별 오차를 상쇄시킨다(먼 쪽 곡률 검사 · 잭나이프 포함).
  const fit = fitSpeed(points, camera, { minTravelM: MIN_TRAVEL_M });
  if (!fit) return { ok: false, ...reject('NOT_ENOUGH_FRAMES') };

  // 7) 나온 값이 쓸 만한지 마지막으로 본다.
  const fitProblem = checkFit(fit);
  if (fitProblem) return { ok: false, ...fitProblem };

  return {
    ok: true,
    kmh: round1(fit.kmh),
    errorKmh: round1(estimateErrorKmh(fit)),
    confidence: gradeConfidence(fit),
    detail: {
      frames: fit.sampleCount,
      fitQuality: Math.round(fit.fitQuality * 1000) / 1000,
      travelM: round1(Math.abs(fit.endDistanceM - fit.startDistanceM)),
      releaseDistanceM: round1(fit.startDistanceM),
      durationSec: Math.round(fit.durationSec * 1000) / 1000,
      startKmh: round1(fit.startKmh),
      endKmh: round1(fit.endKmh),
      startSeKmh: Number.isFinite(fit.startSeKmh) ? Math.round(fit.startSeKmh * 100) / 100 : null,
      startT: fit.startT,
      startTrimmed,
      endTrimmed,
      farTrimmed: fit.farTrimmed,
      curvatureSigma: Math.round(fit.curvatureSigma * 10) / 10,
    },
  };
}
