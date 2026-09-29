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


/* ───────────────────────── 맞춤(모델 1.6.0 — 2차 보정 core-f) ───────────────────────── */

/**
 * 분석 해상도의 짧은 변(픽셀). 영상 · 카메라 프레임을 이 크기로 줄여 공을 찾는다(analyze-frames.ts).
 * 지름의 계통 오차는 이 해상도의 픽셀로 생기므로 무게를 정할 때도 쓴다 — 그래서 여기 둔다.
 */
export const ANALYZE_SHORT_SIDE = 720;

/** 원본 → 분석 배율. 짧은 변을 720 으로(원본이 더 작으면 그대로) */
export function analyzeScale(sourceW: number, sourceH: number): number {
  return Math.min(1, ANALYZE_SHORT_SIDE / Math.max(1, Math.min(sourceW, sourceH)));
}

/**
 * 장면마다의 지름 흰 잡음(상대) — 0.75%.
 *
 * 스피드건 없이 쟀다: 윤곽 자(limb.ts)로 잰 실제 영상 13개(흰 천 없는 것)에서 이웃한 세 장면의 1/d 이차 차분
 * (공기저항 곡률은 0.03% 라 무시)으로 장면 하나의 잡음을 보면 강건 표준편차 0.8%, 크기(원본 12~45px) · 화면 속도 ·
 * 가장자리 폭과 무관했다(9~12px 만 1.6%). 스튜던트 t 최대우도: 상대만 0.72%(t 척도) · 절대 항은 0.04~0.08px 로
 * 거의 없음. 지름의 상대 잡음이 한결같으면 거리 z = f·D/d 의 잡음은 z 에 비례한다(σ_z = z·0.75%).
 */
export const DIAMETER_NOISE_REL = 0.0075;

/**
 * 지름의 계통 오차 — 분석 픽셀 0.5(원본 1080p 에서 0.75px).
 *
 * 흰 잡음과 따로 있는, 한 궤적 안에서 거리에 따라 천천히 변하는 오차다. 윤곽의 자리(부호값 α 0.3)는 공 뒤 배경의
 * 밝기 · 흐림에 따라 픽셀 단위로 조금씩 옮겨 가는데(공이 날아가며 뒤가 어두워지면 윤곽이 바깥으로), 같은 0.5px 도
 * 가까운 큰 공(45px)에서는 1%, 먼 작은 공(12px)에서는 4% 다 — 상대 오차가 거리에 비례해 커진다(σ_z ∝ z²).
 * 이차 차분(흰 잡음)에는 안 보이고, 궤적마다 공기저항 곡률을 풀어 맞춘 값(K_eff)의 흩어짐에 보인다: 13개에서
 * K_eff 가 −0.02~+0.05/m 로, 잭나이프 SE 로 설명되는 것보다 훨씬 넓었다(χ² 77 / 12). 그 넘치는 흩어짐을
 * ΔK = 2δ/(f·D) 로 픽셀로 옮기면 δ ≈ 0.3~1.1 원본 px(가운데 0.75) — 스피드건을 보지 않고 정한 값이다.
 * 이 항 때문에 1/z² 가 아니라, 가까운 공(약 1.5m 밖)부터는 사실상 1/z⁴ 무게가 된다. 스피드건으로 보면
 * 무게를 1/z² 로 낮출수록 흩어짐이 커졌다(배율 LOO 1.67 → 2.2, 1/z⁰ 이면 3.1).
 */
export const DIAMETER_SYSTEMATIC_ANALYSIS_PX = 0.5;

/**
 * 먼 쪽 곡률 검사 — 공은 공기저항만큼만 느려진다(K ≈ 0.006/m, 야구공의 항력계수 0.3~0.5 → 0.0045~0.0078).
 * 궤적 전체의 곡률(흰 잡음 무게의 이차 맞춤으로 K̂)이 이 범위(±CURVATURE_TOL_K)에서 흰 잡음 SE 의 3배 넘게
 * 벗어나면, 먼 쪽 장면의 자가 틀어진 것이다(작은 공일수록 계통 오차가 커서). 가장 먼 장면부터 하나씩 빼 다시 본다.
 * 3σ 는 표준 문턱이고 스피드건으로 고르지 않았다(2.5~3 이 같은 결과, 4 는 효과 절반).
 */
export const CURVATURE_TRIM_SIGMA = 3;
export const CURVATURE_TOL_K = 0.003;
/** 먼 쪽을 빼도 이만큼은 남긴다 — 관측 수 · 처음 수의 비율 */
const CURVATURE_TRIM_MIN_N = 6;
const CURVATURE_TRIM_MAX_FRAC = 0.5;

/**
 * 잭나이프 블록 길이(초) — 1/30초(60fps 두 장, 240fps 여덟 장). 붙어 있는 장면의 잡음은 서로 닮아(가장자리 폭 ·
 * 배경이 같다) 한 장씩 빼면 흔들림을 작게 본다. 시간으로 정해야 fps 가 달라도 뜻이 같다.
 */
export const JACKKNIFE_BLOCK_SEC = 1 / 30;

export type SpeedFit = {
  /** 구간 평균 속도(km/h) — 첫 관측에서 마지막 관측까지 */
  kmh: number;
  /** 첫 관측 시점의 속도(km/h) — 공기저항 모델로 맞춘 값. 투수 뒤에서는 릴리스 직후 */
  startKmh: number;
  /** 마지막 관측 시점의 속도(km/h) */
  endKmh: number;
  /** 세 축을 합친 R² (1에 가까울수록 좋음) — 공이 아닌 것을 따라간 큰 실패만 거른다 */
  fitQuality: number;
  /** 계산에 쓴 관측 수 */
  sampleCount: number;
  /** 첫 관측과 마지막 관측 사이 시간(초) */
  durationSec: number;
  /** 계산에 쓴 첫 관측의 시각(초) — startKmh 가 이 시점의 속도 */
  startT: number;
  /** 첫 관측 거리(m) — 카메라에서 얼마나 떨어진 곳에서 시작했는지 */
  startDistanceM: number;
  /** 마지막 관측 거리(m) */
  endDistanceM: number;
  /** startKmh 의 표준오차(km/h) — 시간 블록 잭나이프. 블록이 3개 안 되면 NaN */
  startSeKmh: number;
  /** kmh(구간 평균)의 표준오차(km/h) */
  avgSeKmh: number;
  /** 잭나이프 블록 수 */
  jackknifeBlocks: number;
  /** 먼 쪽 곡률 검사로 뺀 장면 수 */
  farTrimmed: number;
  /** 남은 궤적의 곡률 K̂(/m, 흰 잡음 무게 이차 맞춤) — 공기저항 0.006 근처가 정상 */
  curvatureK: number;
  /** (K̂ − 0.006) 가 허용 범위를 넘은 정도(흰 잡음 SE 단위, 범위 안이면 0) — 3 을 넘으면 자가 틀어진 궤적 */
  curvatureSigma: number;
};

/** 가중 직선 — 기울기와 절편 */
function fitLine(ts: number[], vs: number[], ws: number[]): { slope: number; intercept: number } {
  let sumW = 0;
  let meanT = 0;
  let meanV = 0;
  for (let i = 0; i < ts.length; i++) {
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
    num += ws[i] * (ts[i] - meanT) * (vs[i] - meanV);
    den += ws[i] * (ts[i] - meanT) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanV - slope * meanT };
}

/** 계산에 필요한 최소 관측 수. 이보다 적으면 오차를 걸러낼 수가 없다. */
export const MIN_OBSERVATIONS = 4;

/** 원본 픽셀로 옮긴 계통 오차(px) — 분석 해상도가 원본보다 작으면 그만큼 크다 */
function systematicSourcePx(lens: CameraLens): number {
  return DIAMETER_SYSTEMATIC_ANALYSIS_PX / analyzeScale(lens.frameWidth, lens.frameHeight);
}

/**
 * 관측마다의 무게 = 1/σ_z². σ_z = z · hypot(흰 잡음 0.75%, 계통 δ/d) 이고 d = f·D/z 라 δ/d = δ·z/(f·D).
 * 가까운 큰 공은 1/z², 먼 작은 공은 1/z⁴ 로 줄어든다. 절대 크기는 상관없어(비율만 쓴다) 가장 큰 무게를 1 로 맞춘다.
 *
 * zs 를 주면 잰 거리 대신 그 거리(맞춘 곡선 위의 거리)로 무게를 낸다 — fitSpeed 설명의 '두 번 맞춤'.
 */
export function fitWeights(points: BallPoint3D[], lens: CameraLens, zs?: number[]): number[] {
  const fD = lens.focalPx * BALL_DIAMETER_M;
  const A = systematicSourcePx(lens);
  const inv = points.map((p, i) => {
    const z = zs ? zs[i] : p.z;
    return 1 / (z * z * (DIAMETER_NOISE_REL ** 2 + ((A * z) / fD) ** 2));
  });
  const max = Math.max(...inv);
  return inv.map((w) => w / max);
}

/** 무게 ws 로 진행 방향 u 를 정하고, 그 방향 위 위치에 공기저항 곡선을 맞춘다 */
function solveTrack(points: BallPoint3D[], taus: number[], ws: number[]) {
  const fx = fitLine(taus, points.map((p) => p.x), ws).slope;
  const fy = fitLine(taus, points.map((p) => p.y), ws).slope;
  const fz = fitLine(taus, points.map((p) => p.z), ws).slope;
  const speed = Math.hypot(fx, fy, fz);
  /* 진행 방향(단위 벡터). 기울기가 전혀 없으면 카메라 축 */
  const u = speed > 0 ? { x: fx / speed, y: fy / speed, z: fz / speed } : { x: 0, y: 0, z: 1 };
  const along = points.map((p) => p.x * u.x + p.y * u.y + p.z * u.z);
  return { u, along, drag: fitDrag(taus, along, ws) };
}

/**
 * 궤적 전체의 곡률 — 진행 방향 위치에 s = a + b·τ + c·τ² 를 흰 잡음 무게(1/z²)로 맞춰 K̂ = −2c/b²(공기저항이면
 * s = v₀τ − K·v₀²τ²/2 + …, 60fps 궤적에서 셋째 항은 0.1% 안). SE 는 최소제곱 공분산에 잔차 크기(χ²/자유도, 1 밑이면 1)를
 * 곱해 — 잡음이 모형보다 큰 궤적에서 멀쩡한 장면을 빼지 않게.
 */
export function trackCurvature(points: BallPoint3D[]): { k: number; se: number } | null {
  const n = points.length;
  if (n < 5) return null;
  const t0 = points[0].t;
  const taus = points.map((p) => p.t - t0);
  const w = points.map((p) => 1 / (p.z * DIAMETER_NOISE_REL) ** 2);
  const vx = fitLine(taus, points.map((p) => p.x), w).slope;
  const vy = fitLine(taus, points.map((p) => p.y), w).slope;
  const vz = fitLine(taus, points.map((p) => p.z), w).slope;
  const sp = Math.hypot(vx, vy, vz);
  if (!(sp > 0)) return null;
  const s = points.map((p) => (p.x * vx + p.y * vy + p.z * vz) / sp);
  const M = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const r = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const f = [1, taus[i], taus[i] * taus[i]];
    for (let a = 0; a < 3; a++) {
      r[a] += w[i] * f[a] * s[i];
      for (let b = 0; b < 3; b++) M[a][b] += w[i] * f[a] * f[b];
    }
  }
  const inv = invert3(M);
  if (!inv) return null;
  const beta = [0, 1, 2].map((a) => inv[a][0] * r[0] + inv[a][1] * r[1] + inv[a][2] * r[2]);
  let chi = 0;
  for (let i = 0; i < n; i++) {
    const e = s[i] - beta[0] - beta[1] * taus[i] - beta[2] * taus[i] * taus[i];
    chi += w[i] * e * e;
  }
  const scale = Math.max(1, chi / (n - 3));
  const b = beta[1];
  const c = beta[2];
  if (!(Math.abs(b) > 0)) return null;
  const k = (-2 * c) / (b * b);
  /* K̂ 의 분산 — 기울기(∂K/∂b = 4c/b³, ∂K/∂c = −2/b²)로 옮긴다 */
  const g = [0, (4 * c) / (b * b * b), -2 / (b * b)];
  let v = 0;
  for (let a = 0; a < 3; a++) for (let bb = 0; bb < 3; bb++) v += g[a] * inv[a][bb] * g[bb];
  return { k, se: Math.sqrt(Math.max(0, v) * scale) };
}

function invert3(m: number[][]): number[][] | null {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-300)) return null;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

/** 곡률이 공기저항 범위를 벗어난 정도(SE 단위, 범위 안이면 0) */
function curvatureExcess(q: { k: number; se: number } | null): number {
  if (!q || !(q.se > 0)) return 0;
  return Math.max(0, Math.abs(q.k - DRAG_K_PER_M) - CURVATURE_TOL_K) / q.se;
}

export type FitSpeedOptions = {
  /** 먼 쪽을 빼도 남아야 할 이동 거리(m) — 이보다 짧아지게는 빼지 않는다(짧은 궤적 거부는 validate 가) */
  minTravelM?: number;
};

/**
 * 관측 묶음 → 구속(km/h).
 *
 * ── 왜 모든 프레임을 곡선 하나에 맞추는가 ──
 *
 * 두 점만 쓰면 그 두 점의 측정 오차가 결과에 그대로 실린다. 그래서 진행 방향(가중 직선)을 정하고, 그 방향 위의
 * 위치에 공기저항 곡선 s(τ) = a + ln(1 + K·v₀·τ)/K 를 가중 최소제곱으로 맞춰 v₀(첫 관측 시점의 속도)를 낸다.
 * K 는 물리값(0.006)으로 고정 — 궤적마다 풀면 먼 쪽 자의 틀어짐까지 곡률로 받아들여 흩어짐이 두세 배가 됐다.
 *
 * ── 무게(모델 1.6.0) ──
 *
 * 1/σ_z² 이고 σ_z 는 흰 잡음(상대 0.75%)과 계통 오차(분석 0.5px)를 합친 것(fitWeights). 예전의 (가장 가까운 z / z)⁴ 와
 * 튄 관측 빼기(z 직선에서 3×중앙값)는 없앴다 — 직선 빼기는 공기저항의 휨을 튄 것으로 보고 먼 장면을 한쪽으로만 뺐다.
 * 대신 먼 쪽 곡률 검사(CURVATURE_TRIM_SIGMA): 궤적의 곡률이 공기저항으로 설명되지 않으면 먼 장면부터 뺀다.
 * 무게는 잰 거리가 아니라 첫 맞춤의 곡선 위 거리로 낸다(두 번 맞춤 — 아래 2) 설명). 실제 영상에서는 1/z² 보다 가까운
 * 쪽에 훨씬 몰린다(1.2m 밖은 사실상 1/z⁴) — 흰 잡음만 보면 1/z² 가 맞지만, 먼 쪽 자의 천천히 휜 오차가 궤적마다 있어서다
 * (DIAMETER_SYSTEMATIC_ANALYSIS_PX 설명). 스피드건 LOO: 1/z² 1.8~1.9 → 이 무게 1.4~1.5km/h(곡률 검사 포함).
 *
 * ── 불확실성 ──
 *
 * 1/30초 블록 잭나이프로 startKmh · kmh 의 표준오차를 낸다(블록마다 빼고 다시 맞춘 값의 흩어짐). 공이 아닌 것을
 * 따라간 궤적은 몇 장이 답을 좌우해 크게 나온다(validate.ts 가 거부 · 믿음에 쓴다).
 *
 * 돌려주는 값: 구간 평균(kmh)과 첫 · 마지막 관측 시점의 속도(startKmh · endKmh). 릴리스 구속으로 무엇을 쓸지는
 * 이 함수 밖(analyze-frames)에서 정한다.
 */
export function fitSpeed(
  points: BallPoint3D[],
  lens: CameraLens,
  opts: FitSpeedOptions = {}
): SpeedFit | null {
  if (points.length < MIN_OBSERVATIONS) return null;
  let sorted = [...points].sort((a, b) => a.t - b.t);

  /*
   * 1) 먼 쪽 곡률 검사. 먼 쪽 = z 가 큰 끝(투수 뒤는 마지막 장면, 포수 뒤는 첫 장면). 빼도 MIN 관측 · 처음의 절반 ·
   *    이동 거리(opts.minTravelM)는 남긴다 — 그 안에서 못 맞추면 빼지 않고 곡률 벗어남만 알린다(믿음 낮춤).
   */
  const minTravel = opts.minTravelM ?? 0;
  const n0 = sorted.length;
  let farTrimmed = 0;
  for (;;) {
    if (sorted.length <= CURVATURE_TRIM_MIN_N) break;
    if (farTrimmed >= Math.floor(n0 * CURVATURE_TRIM_MAX_FRAC)) break;
    if (curvatureExcess(trackCurvature(sorted)) <= CURVATURE_TRIM_SIGMA) break;
    const farAtEnd = sorted[sorted.length - 1].z >= sorted[0].z;
    const next = farAtEnd ? sorted.slice(0, -1) : sorted.slice(1);
    if (Math.abs(next[next.length - 1].z - next[0].z) < minTravel) break;
    sorted = next;
    farTrimmed++;
  }

  const n = sorted.length;
  const t0 = sorted[0].t;
  const taus = sorted.map((p) => p.t - t0);
  const tauEnd = taus[n - 1];
  if (!(tauEnd > 0)) return null;

  /*
   * 2) 무게 · 방향 · 공기저항 곡선 — 두 번 맞춘다. 무게를 잰 거리로 내면 지름을 크게 잰 장면(거리가 짧게 나옴)이
   *    무게까지 더 받아, 잡음이 곧 치우침이 된다(가상 투구 240fps · 지름 잡음 1px 에서 −1.7~−3.3km/h, 잭나이프가
   *    이를 못 봐 90% 구간이 69~75% 만 덮었다). 첫 맞춤의 곡선 위 거리로 무게를 다시 내면 치우침이 +0.2 안, 구간이
   *    89~91% 를 덮는다(lab/core-f/tmpeng/secheck.mts). 실제 영상의 지름 잡음(0.8%)에서는 작지만 공짜다.
   */
  const w0 = fitWeights(sorted, lens);
  const pass1 = solveTrack(sorted, taus, w0);
  const s1 = taus.map((tau) => pass1.drag.a + dragDistance(pass1.drag.v0, tau));
  let sw0 = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    sw0 += w0[i];
    cz += w0[i] * (sorted[i].z - pass1.u.z * s1[i]);
  }
  cz /= sw0;
  const zModel = s1.map((s) => Math.max(0.3, cz + pass1.u.z * s));
  const weights = fitWeights(sorted, lens, zModel);
  const { u, drag } = solveTrack(sorted, taus, weights);
  const travel = dragDistance(drag.v0, tauEnd);
  const avgMps = travel / tauEnd;
  const endMps = drag.v0 / (1 + DRAG_K_PER_M * drag.v0 * tauEnd);

  /*
   * 3) 맞음새 — 세 축을 합친 R². 공이 실제로 한 직선을 따라 모델대로 날아갔다면 1에 가깝고, 감지가 튀었거나
   *    공이 아닌 것을 따라갔다면 뚝 떨어진다. 실제 영상 18개의 궤적은 모두 0.995 이상.
   */
  const sHat = taus.map((tau) => drag.a + dragDistance(drag.v0, tau));
  let sumW = 0;
  const c = { x: 0, y: 0, z: 0 };
  const mean = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < n; i++) {
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
  for (let i = 0; i < n; i++) {
    const w = weights[i];
    const p = sorted[i];
    ssRes +=
      w *
      ((p.x - (c.x / sumW + u.x * sHat[i])) ** 2 +
        (p.y - (c.y / sumW + u.y * sHat[i])) ** 2 +
        (p.z - (c.z / sumW + u.z * sHat[i])) ** 2);
    ssTot +=
      w *
      ((p.x - mean.x / sumW) ** 2 + (p.y - mean.y / sumW) ** 2 + (p.z - mean.z / sumW) ** 2);
  }
  const fitQuality = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  /*
   * 4) 잭나이프 — 시간 블록(≥ JACKKNIFE_BLOCK_SEC)을 하나씩 빼고 다시 맞춘다. 첫 블록을 뺀 복제는 첫 관측이 늦어지므로
   *    그 속도를 공기저항으로 전체의 첫 관측 시각까지 되돌려 견준다. 구간 평균은 전체 구간 [0, τ_end] 그대로.
   *    SE² = (g−1)/g · Σ(복제 − 평균)².
   */
  const startReps: number[] = [];
  const avgReps: number[] = [];
  let b0 = 0;
  while (b0 < n) {
    let b1 = b0 + 1;
    while (b1 < n && sorted[b1].t - sorted[b0].t < JACKKNIFE_BLOCK_SEC - 1e-9) b1++;
    const keepIdx: number[] = [];
    for (let i = 0; i < n; i++) if (i < b0 || i >= b1) keepIdx.push(i);
    if (keepIdx.length >= MIN_OBSERVATIONS) {
      const sub = keepIdx.map((i) => sorted[i]);
      const st0 = sub[0].t;
      const f = solveTrack(
        sub,
        sub.map((p) => p.t - st0),
        keepIdx.map((i) => weights[i])
      );
      const back = 1 - DRAG_K_PER_M * f.drag.v0 * (st0 - t0);
      const v = back > 0.5 ? f.drag.v0 / back : f.drag.v0;
      startReps.push(v);
      avgReps.push(dragDistance(v, tauEnd) / tauEnd);
    }
    b0 = b1;
  }
  const jackSe = (reps: number[]) => {
    const g = reps.length;
    if (g < 3) return Number.NaN;
    const m = reps.reduce((a, b) => a + b, 0) / g;
    return Math.sqrt(((g - 1) / g) * reps.reduce((a, x) => a + (x - m) ** 2, 0)) * MPS_TO_KMH;
  };

  const curv = trackCurvature(sorted);
  return {
    kmh: avgMps * MPS_TO_KMH,
    startKmh: drag.v0 * MPS_TO_KMH,
    endKmh: endMps * MPS_TO_KMH,
    fitQuality,
    sampleCount: n,
    durationSec: tauEnd,
    startT: t0,
    startDistanceM: sorted[0].z,
    endDistanceM: sorted[n - 1].z,
    startSeKmh: jackSe(startReps),
    avgSeKmh: jackSe(avgReps),
    jackknifeBlocks: startReps.length,
    farTrimmed,
    curvatureK: curv ? curv.k : Number.NaN,
    curvatureSigma: curvatureExcess(curv),
  };
}

/**
 * 궤적 위 위치 s_i 에 s = a + ln(1 + K·v₀·τ)/K 를 가중 최소제곱으로 맞춰 v₀ 를 낸다.
 *
 * 매개변수는 v₀ 하나(a 는 v₀ 가 정해지면 닫힌 꼴로 나온다)라, 1m/s 격자로 골짜기를 찾고
 * 황금분할로 조인다. 관측 90개 × 평가 130번 — 1ms 안이다. τ 가 음수여도(첫 관측 앞을 예측할 때) 된다.
 */
export function fitDrag(
  taus: number[],
  ss: number[],
  ws: number[]
): { v0: number; a: number; ssRes: number } {
  const sumW = ws.reduce((p, q) => p + q, 0);
  const cost = (v0: number) => {
    let a = 0;
    for (let i = 0; i < taus.length; i++) a += ws[i] * (ss[i] - dragDistance(v0, taus[i]));
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
