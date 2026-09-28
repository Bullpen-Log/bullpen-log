/**
 * 영상 속 공의 크기로 거리를 재고, 거리 변화로 구속을 낸다.
 *
 * ── 왜 거리를 입력받지 않아도 되는가 ──
 *
 * 야구공 지름은 7.3cm로 규격이 정해져 있다. 그래서 공 자체가 자(ruler)가 된다.
 * 같은 공이라도 멀면 화면에서 작게, 가까우면 크게 찍히므로, 화면에서 몇 픽셀인지
 * 재면 카메라에서 몇 미터 떨어져 있는지 거꾸로 계산할 수 있다.
 *
 *   실제지름 / 거리 = 픽셀지름 / 초점거리(픽셀)
 *   → 거리 = 실제지름 × 초점거리(픽셀) / 픽셀지름
 *
 * 마운드~포수 거리를 알 필요가 없다. 공과 카메라 사이 거리를 매 프레임 새로
 * 재고 있기 때문이다.
 *
 * ── 왜 투수 바로 뒤에서 찍어야 하는가 ──
 *
 * 공이 카메라에서 멀어지는 방향으로 날아가면 화면 위에서는 거의 제자리에 있고
 * 크기만 줄어든다. 옆에서 찍을 때처럼 화면을 가로지르지 않으니 흔들려 번지는
 * 일이 적어, 일반 카메라로도 공이 또렷하게 찍힌다. 이 방식이 성립하는 핵심
 * 조건이라 촬영 규칙으로 강제한다(lib/velocity-engine/validate.ts).
 */

/** 공식 야구공 지름(m). KBO·MLB 규격은 둘레 22.9~23.5cm → 지름 약 7.3cm. */
export const BALL_DIAMETER_M = 0.073;

/** m/s → km/h */
export const MPS_TO_KMH = 3.6;

/**
 * 공기저항 — 감속 a = K·v² (m/s², v 는 m/s). 거리로 적으면 dv/ds = −K·v, 즉 v(s) = v₀·e^(−K·s).
 * 시간으로 풀면 나아간 거리 s(τ) = ln(1 + K·v₀·τ) / K, 속도 v(τ) = v₀ / (1 + K·v₀·τ).
 *
 * 야구공(145g, 지름 7.3cm, 항력계수 약 0.35, 공기 1.2kg/m³): K = ½·ρ·C_d·A/m ≈ 0.006 /m.
 * 130km/h 면 1m 에 0.78km/h 씩 느려진다 — 메이저리그 추적 자료(릴리스→홈 17m 에 8~10%)와 맞는다.
 * 어림값이다 — 스피드건 짝이 쌓이면 보정식이 남은 차이를 흡수한다.
 */
export const DRAG_K_PER_M = 0.006;

/** 첫 관측 뒤 τ초 동안 나아간 거리(m) — 공기저항 모델 */
export function dragDistance(v0Mps: number, tau: number): number {
  return Math.log(1 + DRAG_K_PER_M * v0Mps * tau) / DRAG_K_PER_M;
}

/**
 * 카메라 렌즈 정보.
 *
 * focalPx 는 "초점거리를 픽셀로 환산한 값"이다. 아이폰 앱에서는 iOS가 알려주는
 * 실제 렌즈 값을 그대로 쓰고, 웹에서는 보정 절차로 구해 저장해 둔다.
 */
export type CameraLens = {
  /** 초점거리(픽셀). 영상 해상도에 딸린 값이라 해상도가 바뀌면 함께 바뀐다. */
  focalPx: number;
  /** 영상 가로 픽셀 — 어떤 해상도 기준의 focalPx 인지 확인하는 데 쓴다 */
  frameWidth: number;
  /** 영상 세로 픽셀 */
  frameHeight: number;
};

/**
 * 화각(도)으로 초점거리를 구한다.
 *
 * 렌즈 정보를 직접 못 받는 환경(웹 업로드 등)에서 기종별 화각을 알 때 쓴다.
 * 아이폰 후면 메인 카메라는 대체로 가로화각 68~70도 근방이다.
 */
export function focalPxFromFov(frameWidth: number, horizontalFovDeg: number): number {
  const half = (horizontalFovDeg * Math.PI) / 180 / 2;
  return frameWidth / 2 / Math.tan(half);
}

/**
 * 화면에서 잰 공 지름(픽셀) → 카메라로부터의 거리(m).
 *
 * 픽셀 지름이 0이거나 음수면 계산이 성립하지 않으므로 null 을 돌려준다.
 * 여기서 조용히 큰 값을 만들어내면 말도 안 되는 구속이 나온다.
 */
export function distanceFromBallPx(ballPx: number, lens: CameraLens): number | null {
  if (!(ballPx > 0) || !(lens.focalPx > 0)) return null;
  return (BALL_DIAMETER_M * lens.focalPx) / ballPx;
}

/** 프레임 하나에서 관측한 공. 좌표는 화면 픽셀 기준이다. */
export type BallObservation = {
  /** 영상 시작 기준 시각(초) */
  t: number;
  /** 공 중심 x(픽셀) */
  x: number;
  /** 공 중심 y(픽셀) */
  y: number;
  /** 공 지름(픽셀) */
  diameterPx: number;
  /**
   * 공 가운데 배경보다 밝게 잡힌 픽셀의 비율(0~1). 그물 너머로 찍으면 그물코 사이만 잡혀 1 보다 작다 —
   * 밝기 총량으로 면적을 낼 때 이만큼 나눠 되돌린다(analyze-frames.ts 의 refineTrack). 없으면 1.
   */
  visibleFrac?: number;
};

/** 카메라를 원점으로 한 3차원 위치(m). z 가 카메라에서 멀어지는 방향이다. */
export type BallPoint3D = {
  t: number;
  x: number;
  y: number;
  z: number;
};

/**
 * 화면 관측 → 3차원 위치.
 *
 * z 는 공 크기로 구한 거리이고, x·y 는 화면 중심에서 얼마나 벗어났는지를
 * 그 거리만큼 확대해 실제 길이로 바꾼 값이다. 구속만 낼 것이라면 z 만으로도
 * 되지만, 릴리스에서 도달까지의 실제 이동 거리를 재려면 세 축이 모두 필요하다.
 */
export function toPoint3D(obs: BallObservation, lens: CameraLens): BallPoint3D | null {
  const cx = lens.frameWidth / 2;
  const cy = lens.frameHeight / 2;
  const z = distanceFromBallPx(obs.diameterPx * perspectiveFactor(obs, lens), lens);
  if (z == null) return null;

  return {
    t: obs.t,
    x: ((obs.x - cx) * z) / lens.focalPx,
    y: ((obs.y - cy) * z) / lens.focalPx,
    z,
  };
}

/**
 * 가운데서 벗어난 공의 원근 타원 되돌리기.
 *
 * 공이 광축에서 θ 만큼 벗어나 있으면 화면에는 원이 아니라 시선 방향으로 늘어난 타원으로 찍힌다
 * (가로 반지름 f·r/(Z·cosθ), 세로 f·r/Z). 면적으로 잰 지름은 그 기하평균이라 f·D/(Z·√cosθ) —
 * 실제(f·D/Z)보다 1/√cosθ 만큼 크고, 그대로 두면 거리가 가깝게 · 속도가 낮게 나온다(화면
 * 가장자리 θ=25° 에서 −3km/h). tanθ = 화면 중심에서의 거리 / 초점거리.
 */
export function perspectiveFactor(
  obs: Pick<BallObservation, 'x' | 'y'>,
  lens: CameraLens
): number {
  const r = Math.hypot(obs.x - lens.frameWidth / 2, obs.y - lens.frameHeight / 2);
  const cos = lens.focalPx / Math.hypot(lens.focalPx, r);
  return Math.sqrt(cos);
}

/** 두 점 사이의 직선 거리(m) */
export function distanceBetween(a: BallPoint3D, b: BallPoint3D): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * 관측 묶음 → 구속(km/h).
 *
 * ── 왜 처음과 끝 두 점만 쓰지 않는가 ──
 *
 * 두 점만 쓰면 그 두 점의 측정 오차가 결과에 그대로 실린다. 공 지름을 반 픽셀만
 * 잘못 재도 구속이 몇 km/h씩 흔들린다. 그래서 모든 프레임을 놓고 "시간에 따라
 * z가 일정하게 줄어드는 직선"을 최소제곱으로 맞춘다. 프레임이 많을수록 개별
 * 오차가 서로 상쇄된다.
 *
 * ── 왜 z 만 쓰지 않고 3차원 속도를 내는가 ──
 *
 * 투수 뒤에서 찍으면 공은 주로 z 방향으로 가지만, 좌우·상하로도 조금 움직인다.
 * 세 축을 함께 맞춰야 실제 이동 속도가 나온다.
 *
 * ── 왜 직선이 아니라 공기저항 곡선에 맞추는가 ──
 *
 * 공은 날아가며 느려진다(1m 에 약 0.8km/h). 가까운 관측에 무게를 많이 두는 가중 직선을
 * 그대로 쓰면 기울기가 가까운 쪽(투수 뒤에서는 빠른 앞부분)으로 쏠려, 구간 평균이 3~5km/h
 * 높게 나왔다(시험대 2026-09-27). 그래서 직선은 진행 방향을 정하는 데만 쓰고, 그 방향 위의
 * 위치에 s(τ) = ln(1 + K·v₀·τ)/K 를 맞춰 v₀ 를 구한다 — 무게를 어디에 두든 치우치지 않는다.
 *
 * 돌려주는 값: 구간 평균(kmh)과 첫 · 마지막 관측 시점의 속도(startKmh · endKmh). 릴리스
 * 구속으로 무엇을 쓸지는 이 함수 밖(analyze-frames)에서 정한다.
 */
export type SpeedFit = {
  /** 구간 평균 속도(km/h) — 첫 관측에서 마지막 관측까지 */
  kmh: number;
  /** 첫 관측 시점의 속도(km/h) — 공기저항 모델로 맞춘 값. 투수 뒤에서는 릴리스 직후 */
  startKmh: number;
  /** 마지막 관측 시점의 속도(km/h) */
  endKmh: number;
  /** 직선이 얼마나 잘 맞았는지 (1에 가까울수록 좋음) */
  fitQuality: number;
  /** 계산에 쓴 관측 수 */
  sampleCount: number;
  /** 첫 관측과 마지막 관측 사이 시간(초) */
  durationSec: number;
  /** 첫 관측 거리(m) — 카메라에서 얼마나 떨어진 곳에서 시작했는지 */
  startDistanceM: number;
  /** 마지막 관측 거리(m) */
  endDistanceM: number;
};

/**
 * 축 하나를 t에 대한 직선으로 맞춰 기울기(속도)와 잔차제곱합을 낸다.
 *
 * 관측마다 가중치를 받는다. 모두 똑같이 취급하면 안 되기 때문이다 — 멀리 있는
 * 공은 화면에 작게 찍혀 지름 한 픽셀의 오차가 거리 오차로 크게 번지는 반면,
 * 가까이 있을 때 잰 값은 훨씬 정확하다. 가중치 없이 맞췄더니 잡음이 조금만
 * 섞여도 오차가 5~27km/h까지 벌어졌다.
 */
function fitAxis(
  ts: number[],
  vs: number[],
  ws: number[]
): { slope: number; ssRes: number; ssTot: number } {
  const n = ts.length;
  const sumW = ws.reduce((a, b) => a + b, 0);
  if (!(sumW > 0)) return { slope: 0, ssRes: 0, ssTot: 0 };

  let meanT = 0;
  let meanV = 0;
  for (let i = 0; i < n; i++) {
    meanT += ws[i] * ts[i];
    meanV += ws[i] * vs[i];
  }
  meanT /= sumW;
  meanV /= sumW;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += ws[i] * (ts[i] - meanT) * (vs[i] - meanV);
    den += ws[i] * (ts[i] - meanT) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanV - slope * meanT;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * ts[i] + intercept;
    ssRes += ws[i] * (vs[i] - predicted) ** 2;
    ssTot += ws[i] * (vs[i] - meanV) ** 2;
  }
  return { slope, ssRes, ssTot };
}

/** 계산에 필요한 최소 관측 수. 이보다 적으면 오차를 걸러낼 수가 없다. */
export const MIN_OBSERVATIONS = 4;

/**
 * 직선에서 크게 벗어난 관측을 걸러낸다.
 *
 * 공 지름을 재다 보면 어떤 프레임은 유난히 크게 틀린다. 최소제곱은 벗어난
 * 값의 제곱을 더하기 때문에, 그런 관측 하나가 결과를 통째로 끌고 간다.
 * 그래서 한 번 맞춰본 뒤 많이 벗어난 것을 빼고 다시 맞춘다.
 *
 * 빼는 기준은 "남은 것들이 보통 얼마나 벗어나는가"로 정한다. 고정된 미터
 * 단위로 정하면, 가까운 구간에서는 너무 느슨하고 먼 구간에서는 너무 빡빡해진다.
 */
function dropOutliers(points: BallPoint3D[], weights: number[]): boolean[] {
  const n = points.length;
  const keep = new Array<boolean>(n).fill(true);
  if (n < MIN_OBSERVATIONS + 2) return keep;

  const ts = points.map((p) => p.t);
  const zs = points.map((p) => p.z);
  const { slope, intercept } = fitLine(ts, zs, weights, keep);

  const residuals = points.map((p) => Math.abs(p.z - (slope * p.t + intercept)));
  const sortedRes = [...residuals].sort((a, b) => a - b);
  const median = sortedRes[Math.floor(sortedRes.length / 2)];
  // 중앙값의 3배를 넘으면 튄 것으로 본다. 최소 한 톨의 여유는 남긴다.
  const limit = Math.max(median * 3, 0.05);

  let dropped = 0;
  for (let i = 0; i < n; i++) {
    // 너무 많이 빼면 남는 게 없다. 최대 30%까지만 뺀다.
    if (residuals[i] > limit && dropped < Math.floor(n * 0.3)) {
      keep[i] = false;
      dropped++;
    }
  }
  return keep;
}

/** 가중 직선 맞추기 — 기울기와 절편만 낸다. */
function fitLine(
  ts: number[],
  vs: number[],
  ws: number[],
  keep: boolean[]
): { slope: number; intercept: number } {
  let sumW = 0;
  let meanT = 0;
  let meanV = 0;
  for (let i = 0; i < ts.length; i++) {
    if (!keep[i]) continue;
    sumW += ws[i];
    meanT += ws[i] * ts[i];
    meanV += ws[i] * vs[i];
  }
  if (!(sumW > 0)) return { slope: 0, intercept: 0 };
  meanT /= sumW;
  meanV /= sumW;

  let num = 0;
  let den = 0;
  for (let i = 0; i < ts.length; i++) {
    if (!keep[i]) continue;
    num += ws[i] * (ts[i] - meanT) * (vs[i] - meanV);
    den += ws[i] * (ts[i] - meanT) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanV - slope * meanT };
}

export function fitSpeed(points: BallPoint3D[]): SpeedFit | null {
  if (points.length < MIN_OBSERVATIONS) return null;

  const all = [...points].sort((a, b) => a.t - b.t);

  // 먼저 대략 맞춰보고 크게 튄 관측을 뺀 뒤, 남은 것으로 다시 맞춘다.
  const minZAll = Math.min(...all.map((p) => p.z));
  const roughWeights = all.map((p) => (minZAll / p.z) ** 4);
  const keep = dropOutliers(all, roughWeights);
  const sorted = all.filter((_, i) => keep[i]);
  if (sorted.length < MIN_OBSERVATIONS) return null;
  const ts = sorted.map((p) => p.t);
  const durationSec = ts[ts.length - 1] - ts[0];
  if (!(durationSec > 0)) return null;

  /*
   * 관측마다 얼마나 믿을지 정한다.
   *
   * 거리 오차는 거리의 제곱에 비례해 커진다(멀수록 공이 작게 찍히고, 같은 한
   * 픽셀이 더 먼 거리를 뜻하게 되므로). 최소제곱에서 가중치는 오차 분산의
   * 역수를 쓰는 것이 맞으므로 1/z⁴ 이 된다. 다만 그대로 쓰면 가장 가까운
   * 한두 프레임만 결과를 좌우하므로, 가장 가까운 관측 기준으로 정규화하고
   * 하한을 둬서 먼 프레임도 발언권을 남긴다.
   */
  const minZ = Math.min(...sorted.map((p) => p.z));
  const weights = sorted.map((p) => (minZ / p.z) ** 4);

  const fx = fitAxis(
    ts,
    sorted.map((p) => p.x),
    weights
  );
  const fy = fitAxis(
    ts,
    sorted.map((p) => p.y),
    weights
  );
  const fz = fitAxis(
    ts,
    sorted.map((p) => p.z),
    weights
  );

  const speedLinear = Math.hypot(fx.slope, fy.slope, fz.slope);

  /* 진행 방향(단위 벡터). 기울기가 전혀 없으면 카메라 축 */
  const u =
    speedLinear > 0
      ? {
          x: fx.slope / speedLinear,
          y: fy.slope / speedLinear,
          z: fz.slope / speedLinear,
        }
      : { x: 0, y: 0, z: 1 };

  /* 그 방향 위의 위치 s_i 에 공기저항 곡선을 맞춘다 */
  const t0 = ts[0];
  const taus = ts.map((t) => t - t0);
  const along = sorted.map((p) => p.x * u.x + p.y * u.y + p.z * u.z);
  const drag = fitDrag(taus, along, weights);
  const tauEnd = taus[taus.length - 1];
  const travel = dragDistance(drag.v0, tauEnd);
  const avgMps = travel / tauEnd;
  const endMps = drag.v0 / (1 + DRAG_K_PER_M * drag.v0 * tauEnd);

  /*
   * 맞음새 — 세 축을 합친 R². 공이 실제로 한 직선을 따라 모델대로 날아갔다면 1에 가깝고,
   * 감지가 튀었거나 공이 아닌 것을 따라갔다면 뚝 떨어진다. 낮으면 결과를 내주지 않는다
   * (판정은 validate.ts).
   */
  const sHat = taus.map((tau) => drag.a + dragDistance(drag.v0, tau));
  let sumW = 0;
  const c = { x: 0, y: 0, z: 0 };
  const mean = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < sorted.length; i++) {
    const w = weights[i];
    const p = sorted[i];
    sumW += w;
    c.x += w * (p.x - u.x * sHat[i]);
    c.y += w * (p.y - u.y * sHat[i]);
    c.z += w * (p.z - u.z * sHat[i]);
    mean.x += w * p.x;
    mean.y += w * p.y;
    mean.z += w * p.z;
  }
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < sorted.length; i++) {
    const w = weights[i];
    const p = sorted[i];
    ssRes +=
      w *
      ((p.x - (c.x / sumW + u.x * sHat[i])) ** 2 +
        (p.y - (c.y / sumW + u.y * sHat[i])) ** 2 +
        (p.z - (c.z / sumW + u.z * sHat[i])) ** 2);
    ssTot +=
      w *
      ((p.x - mean.x / sumW) ** 2 +
        (p.y - mean.y / sumW) ** 2 +
        (p.z - mean.z / sumW) ** 2);
  }
  const fitQuality = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  return {
    kmh: avgMps * MPS_TO_KMH,
    startKmh: drag.v0 * MPS_TO_KMH,
    endKmh: endMps * MPS_TO_KMH,
    fitQuality,
    sampleCount: sorted.length,
    durationSec,
    startDistanceM: sorted[0].z,
    endDistanceM: sorted[sorted.length - 1].z,
  };
}

/**
 * 궤적 위 위치 s_i 에 s = a + ln(1 + K·v₀·τ)/K 를 가중 최소제곱으로 맞춰 v₀ 를 낸다.
 *
 * 매개변수는 v₀ 하나(a 는 v₀ 가 정해지면 닫힌 꼴로 나온다)라, 1m/s 격자로 골짜기를 찾고
 * 황금분할로 조인다. 관측 90개 × 평가 130번 — 1ms 안이다.
 */
function fitDrag(
  taus: number[],
  ss: number[],
  ws: number[]
): { v0: number; a: number; ssRes: number } {
  const sumW = ws.reduce((p, q) => p + q, 0);
  const cost = (v0: number) => {
    let a = 0;
    for (let i = 0; i < taus.length; i++)
      a += ws[i] * (ss[i] - dragDistance(v0, taus[i]));
    a /= sumW;
    let res = 0;
    for (let i = 0; i < taus.length; i++) {
      const e = ss[i] - a - dragDistance(v0, taus[i]);
      res += ws[i] * e * e;
    }
    return { a, res };
  };
  const V_MIN = 1;
  const V_MAX = 90;
  let bestV = V_MIN;
  let bestRes = Infinity;
  for (let v = V_MIN; v <= V_MAX; v += 1) {
    const r = cost(v).res;
    if (r < bestRes) {
      bestRes = r;
      bestV = v;
    }
  }
  let lo = Math.max(V_MIN, bestV - 1.5);
  let hi = Math.min(V_MAX, bestV + 1.5);
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - phi * (hi - lo);
  let x2 = lo + phi * (hi - lo);
  let f1 = cost(x1).res;
  let f2 = cost(x2).res;
  for (let k = 0; k < 40; k++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - phi * (hi - lo);
      f1 = cost(x1).res;
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + phi * (hi - lo);
      f2 = cost(x2).res;
    }
  }
  const v0 = (lo + hi) / 2;
  const { a, res } = cost(v0);
  return { v0, a, ssRes: res };
}
