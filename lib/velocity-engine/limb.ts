/**
 * 공의 밝은 윤곽(limb)에 원을 맞춰 지름을 잰다 — 모델 1.6.0 의 거리 자(2026-09-29, 2차 보정).
 *
 * ── 왜 밝기 총량(면적)으로 재지 않는가 ──
 *
 * 1.5.0 은 공 둘레의 밝기를 다 더해 면적으로 지름을 쟀다. 실제 보정 영상 18개(아이폰 15 Pro Max 60fps, 실내
 * 배팅장)에서 그 지름은 '공이 차지한 넓이'가 아니라 '빛 받은 넓이'였다 — 조명이 위 · 앞에서 와 공의 한쪽이
 * 그늘지고, 그늘 쪽 테두리는 밝기가 천천히 배경까지 떨어진다. 그늘진 몫이 영상마다 달라(면적 지름 ÷ 윤곽
 * 지름 = 0.91~0.95) 영상마다 배율이 ±2% 흔들렸고, 먼 공은 뒤 배경이 바뀌면 대비를 잘못 빌려 더 틀렸다.
 * 빛 받은 쪽 테두리는 2px 안팎의 또렷한 계단이라 그늘 · 배경 변화와 상관없이 제자리에 있다.
 *
 * ── 어떻게 재는가 ──
 *
 * 첫 어림 중심에서 72 방향으로 광선을 쏘아, 광선마다 공 밝기(안쪽 최대)와 그 픽셀의 배경 사이에서 밝기가
 * 비율 LIMB_ALPHA 로 떨어지는 곳을 부분 픽셀로 찾는다. 그중 쓸 광선만 남긴다.
 *   - 대비(공 − 배경)가 MIN_RAY_CONTRAST 이상 — 흰 천 앞 · 그늘진 쪽이 빠진다
 *   - 윤곽 밖이 배경이다(가장자리를 지나 반지름의 30% 동안 |α| ≤ EXTERIOR_TOL) — 빛과 그늘의 경계(공
 *     안쪽)나 흰 천 앞에서 천보다 어두운 그늘 면이 빠진다
 *   - 가장자리가 날카롭다(α 0.85 → 0.15 폭이 광선들의 25번째 백분위 × SHARP_RATIO, 최소 SHARP_MIN_PX 이하)
 *     — 그늘 · 번짐(모션 블러 방향)이 빠진다
 * 남은 점(빛 받은 쪽의 또렷한 윤곽)에 원을 맞춘다(Kasa → Tukey 가중 가우스-뉴턴). 원호가 LIMB_MIN_ARC_DEG
 * 보다 좁으면 반지름을 믿을 수 없어 null — 번진 공은 움직임에 수직인 두 옆면만 날카로운데, 그 옆면은 곧아서
 * 원을 맞추면 반지름이 커진다(74f6586f 131° → +18%). 못 잰 장면은 부르는 쪽이 뺀다(채워 넣지 않는다).
 *
 * ── 왜 부호값(영상에 담긴 밝기) 그대로, α 는 0.3 인가 ──
 *
 * 교과서대로라면 선형 빛(sRGB 를 풀어)에서 번진 계단의 가운데(50%) · 가장 가파른 곳이 참 윤곽이다. 실제 영상 13개(흰
 * 천 없음)의 평균 단면을 재 보면 선형 빛에서 윤곽은 깨끗한 대칭 계단(σ≈0.72 분석 px, 안쪽 어깨 없음)이다. 그런데
 * 그 가운데로 잰 지름은 물리에 안 맞는다: 스피드건 없이 궤적 모양만으로 잰 공기저항 K 가 −0.036 /m(공이 날아가며
 * 빨라진다는 뜻 — 야구공은 +0.006~0.009), 스피드건 흩어짐(배율 하나 맞춘 뒤) 5.7km/h. 가장 가파른 곳(기울기 최대 ·
 * 기울기 무게중심)도 K −0.02~−0.03, 4~5km/h. 선형 빛의 면적(화소마다 분모)은 K −0.002, 3.6km/h.
 * 궤적이 물리에 맞는(K 0.006~0.009) 윤곽은 그 가운데보다 분석 0.62px(원본 0.93px) 바깥 — 선형 빛으로 계단의 18%,
 * 부호값으로 광선 최대의 30% 자리 — 이고, 스피드건 흩어짐도 거기서 가장 작다(1.3km/h). 두 잣대(스피드건 없는 물리 ·
 * 스피드건)가 같은 자리를 가리킨다. 감마는 까닭이 아니다(감마는 반쯤 덮인 화소를 밝게 해 윤곽을 오히려 밖으로 민다) —
 * 원인은 모르고 카메라의 영상 처리로 본다. 그래서 α 는 물리 상수가 아니라 이 카메라 · 이 분석 길(브라우저 720)의 실측이다.
 * 같은 윤곽을 선형 빛 α 0.2 로도 찾을 수 있지만(K 0.0085), 광선 최대가 흔들릴 때 선형 문턱이 더 움직여 흩어짐이
 * 2.0km/h 로 컸다 — 부호값 α 0.3 을 쓴다. 중첩 LOO(뺀 클립 없이 도메인 × α 를 고름): 14 개 중 13 번 부호값 0.3,
 * 흩어짐 1.38km/h. 스피드건 없이(K 가 0.006 에 가장 가까운 α) 고르면 0.35/0.3, 1.52km/h.
 * 크기에 따른 치우침이 없다는 다른 증거: 전혀 다른 방법인 부호값 면적(화소마다 분모)과의 비가 지름 7~30px 에서
 * 0.91~0.93 으로 일정하다(선형 빛 50% 윤곽과의 비는 1.01 → 0.94 로 크기에 따라 흐른다).
 *
 * ── 알고 쓰는 약점 ──
 *
 * α ≠ 계단 가운데라 윤곽이 번짐 폭에 따라 밖으로 간다 — 영상 전체를 선형 빛에서 σ 0.6 / 1.0 분석 px 더 흐리면 구속이
 * −3.7% / −8.1%. 그래서 부르는 쪽(analyze-frames.ts measureDiameters)이 궤적의 가장자리 폭(edgePx)으로 흐림을
 * 보정한다(BLUR_KAPPA — 흐린 뒤 −0.2% / +0.2%). 부호값에서 흐려진 것(재표본)은 덜 움직여 보정이 지나치다(+2% / +5.5%).
 * 다른 폰 · 카메라 실시간 영상은 α(또는 배율)를 다시 확인해야 한다 — 스피드건 없이도 여러 공의 궤적 K 를 모아
 * 0.006~0.009 인지로 확인할 수 있다(analyze-frames calibrated 가 아닌 촬영은 ± 를 넓히고 믿음을 '보통'까지 둔다).
 *
 * α 와 상수들의 민감도(2차 검증 — 통계, 최종 엔진 · 18개 · 배율 하나를 다시 맞춘 LOO, 기준 1.55km/h): α 0.25~0.35 는
 * 1.6~1.8, 0.21 · 0.39 는 2.3 · 2.2(배율 ∓4.8%). 스피드건이 고르는 α 는 전부로 0.3 · 흰 천 없는 13개로 0.25 — 스피드건으로
 * 고른 것이 가까운 스피드건 값끼리 뒤섞은 것과 구별되지 않는다(p≈0.26). 스피드건 없는 곡률 K 를 모으면 지금은 0.0126 ± 0.0032
 * (물리 0.006 에서 약 2σ)라 α 0.35 쪽을 가리킨다. ±30% 에 민감한 것: SHARP_RATIO(1.12 · 2.08 → 2.39 · 2.62), EXTERIOR_TOL
 * (0.105 → 2.21), LIMB_MIN_ARC_DEG(126 → 2.39, 195 는 eb05ae07 을 잃음), EDGE_REF_PX(±30% → 배율 ±3.5~3.9%). 이 값들은 이
 * 18개로 **얼렸다** — 더 맞추지 않는다. 다른 폰 · 카메라 실시간은 화각과 함께 이 값들을 다시 확인해야 한다(스피드건 짝
 * 10개쯤).
 *
 * 윤곽은 '공의 참 테두리'가 아니다 — 이 카메라 · 이 분석 길에서 궤적이 물리에 맞는 자리다. 원본 해상도로 보면 선형 빛
 * 50% 테두리가 이 원보다 원본 0.88px 안쪽에 있고(크기 · 영상과 거의 무관, 0.78~1.01), 까닭은 아직 모른다(감마 · 공의
 * 그늘 · 시간 잡음 줄이기는 아님). 지름에 1px 을 더하면 구속이 약 9% 바뀌어, 스피드건 짝은 이 자리를 ±0.3px 까지만
 * 정한다(화각 58.4~61.2° 와 같은 뜻 — 2차 검증 물리).
 *
 * 조명: '빛 받은 쪽 테두리는 또렷하다'는 전제는 빛 받은 테두리가 있어야 성립한다. 해를 등지고(빛이 카메라 쪽에서) 찍으면
 * 공 테두리가 모두 그늘이라(램버트 구) 윤곽이 실제의 0.90~0.97 배로 잡혀 구속이 3~10% 틀릴 수 있다(합성 계산). 옆 · 위
 * 조명은 원호가 180° 밑이 돼 가까운 큰 장면부터 빠진다. 실내 천장 조명(보정 영상)에서만 맞춰 봤다 — 야외는 스피드건
 * 짝(해를 등진 쪽 · 마주한 쪽)을 모아야 한다. 합성 시험대의 이상적인 원판(선형 50% = 실루엣)에서는 이 α 가 지름을 크게 보므로,
 * 시험대의 '실제 카메라' 시나리오는 실측한 카메라 윤곽(가운데가 실루엣보다 원본 0.93px 안쪽)으로 그린다
 * (scripts/velocity-accuracy.mts cameraEdgeSrcPx) — 이것은 α 를 검증하지 않고, 번짐 · 먼 공 · 흰 천 · 다가옴을 본다.
 */

/** 윤곽을 재는 밝기 비율(부호값) — 설명은 파일 머리 */
export const LIMB_ALPHA = 0.3;
/** 이보다 대비가 작은 광선(0~255)은 윤곽을 믿을 수 없다 — 흰 천 앞 · 그늘 */
export const MIN_RAY_CONTRAST = 35;
/** 광선 수 */
const RAYS = 72;
/** 광선 위 표본 간격(픽셀) */
const STEP = 0.25;
/** 날카로운 광선: 가장자리 폭이 광선들의 25번째 백분위의 이 배수 이하 */
const SHARP_RATIO = 1.6;
/** 날카로움 하한(분석 픽셀) — 렌즈 번짐만으로도 이 정도 폭은 된다 */
const SHARP_MIN_PX = 2.0;
/** 윤곽 밖이 배경인지 — 이 구간 동안 |α| 가 이 안에 머물러야 한다 */
const EXTERIOR_TOL = 0.15;
/** 원호가 이보다 좁으면(도) 반지름을 믿을 수 없다 */
export const LIMB_MIN_ARC_DEG = 180;
/** 맞춘 광선 수 하한 */
const MIN_RAYS_USED = 10;

/**
 * 흐림 보정 — α(0.3)가 번진 계단의 가운데가 아니라서, 영상이 흐릴수록 윤곽 원이 밖으로 간다(초점이 나간 영상을 선형
 * 빛에서 σ 0.6 / 1.0 분석 px 더 흐리면 구속이 −3.7% / −8.1%). 가장자리 폭(edgePx)이 기준 폭보다 넓은 만큼 반지름을
 * BLUR_KAPPA 배 줄인다. 한 궤적(또는 가만히 있는 공 한 번)에 한 값으로 쓴다.
 *  - EDGE_REF_PX 1.40(분석 px, 짧은 변 720): 보정 영상 13개(흰 천 없음)의 궤적 폭 1.34~1.57 의 중앙값 — α 0.3 을
 *    맞춘 영상의 폭이라 이 폭에서는 아무것도 바꾸지 않는다.
 *  - BLUR_KAPPA 0.3: 스피드건 없이 정했다 — 실제 영상 13개를 선형 빛에서 σ 0.6 · 1.0 더 흐렸을 때 구속이 가장 덜
 *    바뀌는 값(−0.2% · +0.2%). ±30%(0.2 · 0.4)에서도 −2.6~+3.3% 로 보정 없음보다 낫다. 흐리지 않은 영상의 스피드건
 *    LOO 는 κ 0~0.5 에서 1.16~1.28 로 같다(한 궤적 한 값이라 흩어짐을 늘리지 않는다).
 *  - 약점: 부호값에서 흐려진 것(브라우저 축소 같은 재표본)은 윤곽이 덜 움직여 지나치게 고친다(σ 0.6 · 1.0 에서
 *    +2.0% · +5.5%, 보정 없이는 −1.2% · −3.0%). 분석은 늘 짧은 변 720 으로 같은 길을 거치므로 초점(광학) 쪽을 택했다.
 */
export const EDGE_REF_PX = 1.4;
export const BLUR_KAPPA = 0.3;
/** 흐림 보정으로 지름에서 뺄 값(분석 px) */
export function blurCutPx(edgeWidthPx: number): number {
  return 2 * BLUR_KAPPA * (edgeWidthPx - EDGE_REF_PX);
}

export type LimbInput = {
  luma: ArrayLike<number>;
  /** 공이 없을 때의 배경(같은 크기) — 가만히 있는 공처럼 배경 장면이 없으면 한 값(둘레 밝기) */
  background: ArrayLike<number> | number;
  width: number;
  height: number;
  /** 첫 어림 — 중심 · 지름(분석 픽셀) */
  x: number;
  y: number;
  diameterPx: number;
  /** 이 장면의 노출 치우침(analyze-frames 의 exposureBias) */
  bias: number;
};

export type LimbOptions = {
  /** 윤곽 밝기 비율(시험용) — 기본 LIMB_ALPHA */
  alpha?: number;
  /** 원호 하한(도, 시험용) — 기본 LIMB_MIN_ARC_DEG */
  minArcDeg?: number;
  /**
   * 들어온 밝기 값이 어떤 전달 함수로 담겼나 — 기본 'srgb'(브라우저 캔버스가 주는 값: 영상 파일 · 카메라 둘 다).
   * 다른 것이면 표본을 sRGB 부호값으로 옮긴 뒤 잰다(LIMB_ALPHA 가 sRGB 부호값에서 맞춘 값이라).
   */
  transfer?: LumaTransfer;
};

/**
 * 밝기 값의 전달 함수(0~255).
 *   'srgb'   — 브라우저 캔버스가 준 값 그대로(이름과 달리 곡선을 바꾸지 않는다 — '보정한 길'). 데스크톱 크롬은 BT.709
 *              SDR 영상을 곡선을 바꾸지 않고 (Y′−16)·255/219 로 그린다(2차 조사에서 잼, ±0.04). 윤곽 비율 LIMB_ALPHA 는
 *              바로 이 값에서 맞췄다 — 그래서 영상 파일에도 이것을 쓴다. 아이폰 사파리 · 앱 웹뷰는 BT.709 를 색 관리해
 *              그릴 수 있다(감마 약 1.96 — 추정 −1.0%, 표준편차 0.7%, 확인 안 됨).
 *   'bt709'  — 브라우저를 거치지 않은 BT.709 부호값을 직접 줄 때만. 캔버스 값에 이것을 주면 표본을 한 번 더 옮겨
 *              (sRGB 로 다시 부호화) 구속이 평균 −0.2~−0.4% 달라진다 — 영상 파일의 색 상자를 보고 넘기지 말 것
 *   'linear' — 선형 빛(합성 그림 · 원시 센서 값)
 *   { gamma } — 순수 거듭제곱(선형 = 값^gamma)
 */
export type LumaTransfer = 'srgb' | 'bt709' | 'linear' | { gamma: number };

/** 전달 함수 → sRGB 부호값으로 옮기는 함수. 'srgb' 면 null(그대로). 4096 칸 표 + 선형 보간 */
export function toSrgbEncoded(transfer: LumaTransfer | undefined): ((v: number) => number) | null {
  if (transfer == null || transfer === 'srgb') return null;
  const toLinear = (e: number): number => {
    if (transfer === 'linear') return e;
    if (transfer === 'bt709') return e < 0.081 ? e / 4.5 : Math.pow((e + 0.099) / 1.099, 1 / 0.45);
    return Math.pow(e, transfer.gamma);
  };
  const srgb = (l: number) => (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);
  const N = 4096;
  const lut = new Float64Array(N + 1);
  for (let k = 0; k <= N; k++) lut[k] = 255 * srgb(Math.min(1, Math.max(0, toLinear(k / N))));
  return (v: number) => {
    const x = (Math.min(255, Math.max(0, v)) / 255) * N;
    const k = Math.min(N - 1, Math.floor(x));
    const f = x - k;
    return lut[k] * (1 - f) + lut[k + 1] * f;
  };
}

export type LimbResult = {
  diameterPx: number;
  /** 윤곽 원의 중심 — 기하학적 중심(밝기 무게중심은 빛 받은 쪽으로 치우친다) */
  x: number;
  y: number;
  /** 맞춤에 쓴 윤곽의 원호(도) */
  arcDeg: number;
  used: number;
  /** 점들이 원에서 벗어난 정도(픽셀, 제곱 중앙값의 제곱근) */
  rms: number;
  /**
   * 쓴 광선들의 가장자리 폭(α 0.85 → 0.15, 부분 픽셀로 보간, 중앙값, 분석 px) — 영상이 얼마나 흐린가. 윤곽 비율 α 가
   * 0.5 가 아니라서 윤곽이 번짐 폭만큼 밖으로 가므로(파일 머리 '알고 쓰는 약점'), 흐린 영상을 알아보는 데 쓴다.
   */
  edgePx: number;
  /** 맞춤에 쓴 광선 가운데 공이 배경보다 어두운 것 — measureLimbPolar 만 */
  darkRays?: number;
};

/** 못 잰 까닭(진단용) — 'contrast': 대비가 모자란 광선이 대부분(밝은 배경 · 그늘), 'arc': 원호가 좁음(번짐 · 가림) */
export type LimbFailure = 'rays' | 'contrast' | 'sharp' | 'fit' | 'arc';

type Pt = { x: number; y: number };

function bilinear(a: ArrayLike<number>, width: number, height: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= width - 1 || iy >= height - 1) return NaN;
  const ax = x - ix;
  const ay = y - iy;
  const i = iy * width + ix;
  return (
    a[i] * (1 - ax) * (1 - ay) +
    a[i + 1] * ax * (1 - ay) +
    a[i + width] * (1 - ax) * ay +
    a[i + width + 1] * ax * ay
  );
}

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** 3×3 연립방정식(가우스 소거) */
function solve3(A: number[][], b: number[]): number[] | null {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= 3; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[3] / row[i]);
}

/** 원 첫 어림(Kasa — 대수적 최소제곱) */
function kasa(pts: Pt[]) {
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const b = [0, 0, 0];
  for (const p of pts) {
    const x = p.x - mx;
    const y = p.y - my;
    const z = x * x + y * y;
    const row = [x, y, 1];
    for (let i = 0; i < 3; i++) {
      b[i] -= row[i] * z;
      for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j];
    }
  }
  const s = solve3(A, b);
  if (!s) return null;
  const [D, E, F] = s;
  return { cx: mx - D / 2, cy: my - E / 2, r: Math.sqrt(Math.max(0, (D * D) / 4 + (E * E) / 4 - F)) };
}

/** 기하 원 맞춤 — 가우스-뉴턴 + Tukey 가중(튀는 점을 누른다) */
function fitCircle(pts: Pt[], init: { cx: number; cy: number; r: number }) {
  let { cx, cy, r } = init;
  let rms = 0;
  for (let it = 0; it < 20; it++) {
    const res = pts.map((p) => Math.hypot(p.x - cx, p.y - cy) - r);
    const scale = 4.685 * (median(res.map(Math.abs)) * 1.4826 + 0.03);
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const g = [0, 0, 0];
    pts.forEach((p, k) => {
      const d = Math.hypot(p.x - cx, p.y - cy) || 1e-9;
      const u = res[k] / scale;
      const w = Math.abs(u) < 1 ? (1 - u * u) ** 2 : 0;
      const J = [-(p.x - cx) / d, -(p.y - cy) / d, -1];
      for (let a = 0; a < 3; a++) {
        g[a] -= w * J[a] * res[k];
        for (let b = 0; b < 3; b++) A[a][b] += w * J[a] * J[b];
      }
    });
    const step = solve3(A, g);
    if (!step) break;
    cx += step[0];
    cy += step[1];
    r += step[2];
    rms = Math.sqrt(median(res.map((v) => v * v)));
    if (Math.abs(step[0]) + Math.abs(step[1]) + Math.abs(step[2]) < 1e-4) break;
  }
  return { cx, cy, r, rms };
}

/**
 * 장면 하나에서 공의 윤곽 원을 맞춘다. 못 믿을 때(쓸 광선 · 원호가 모자람)는 null — 부르는 쪽이 그 장면을 뺀다.
 * 72 광선 × 반지름의 1.7배까지 0.25px 간격 — 지름 30px 공에서 1ms 안팎.
 * `why` 를 주면 못 잰 까닭을 적는다(진단 · 거부 사유용).
 */
export function measureLimb(
  input: LimbInput,
  opts: LimbOptions = {},
  why?: { reason?: LimbFailure }
): LimbResult | null {
  const { luma, background, width, height, x: xs, y: ys, bias } = input;
  const alpha = opts.alpha ?? LIMB_ALPHA;
  const minArc = opts.minArcDeg ?? LIMB_MIN_ARC_DEG;
  const canon = toSrgbEncoded(opts.transfer);
  const R = Math.max(2, input.diameterPx / 2);
  const bgAt = (i: number) => (typeof background === 'number' ? background : background[i]);
  const bgBilinear = (px: number, py: number) =>
    typeof background === 'number' ? background : bilinear(background, width, height, px, py);
  const fail = (reason: LimbFailure) => {
    if (why) why.reason = reason;
    return null;
  };

  /* 그 자리의 남은 배경 치우침 — 공 밖 고리의 중앙값(노출 보정의 오차 · 배경 기울기) */
  const rIn = 1.35 * R + 2;
  const rOut = rIn + Math.max(3, 0.5 * R);
  const ring: number[] = [];
  for (let y = Math.max(0, Math.floor(ys - rOut)); y <= Math.min(height - 1, Math.ceil(ys + rOut)); y++) {
    for (let x = Math.max(0, Math.floor(xs - rOut)); x <= Math.min(width - 1, Math.ceil(xs + rOut)); x++) {
      const d = Math.hypot(x - xs, y - ys);
      if (d < rIn || d > rOut) continue;
      const i = y * width + x;
      ring.push(luma[i] - bgAt(i) - bias);
    }
  }
  const offset = median(ring) + bias;

  type Ray = Pt & { w: number; wi: number };
  const rays: Ray[] = [];
  let lowContrast = 0;
  let tried = 0;
  const nS = Math.floor((1.7 * R + 3) / STEP) + 1;
  const cv = new Float64Array(nS);
  const bv = new Float64Array(nS);
  const q0 = Math.round((0.2 * R) / STEP);
  const q1 = Math.round((0.85 * R) / STEP);
  for (let a = 0; a < RAYS; a++) {
    const ang = (2 * Math.PI * a) / RAYS;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    let n = 0;
    for (let q = 0; q < nS; q++) {
      const px = xs + q * STEP * ca;
      const py = ys + q * STEP * sa;
      const c = bilinear(luma, width, height, px, py);
      if (!Number.isFinite(c)) break;
      const b = bgBilinear(px, py) + offset;
      cv[q] = canon ? canon(c) : c;
      bv[q] = canon ? canon(b) : b;
      n = q + 1;
    }
    if (n < q1 + 4) continue;
    /* 공 밝기 — 반지름 0.2~0.85 안의 최대 */
    let ball = -Infinity;
    let qb = -1;
    for (let q = q0; q <= q1; q++) {
      if (cv[q] > ball) {
        ball = cv[q];
        qb = q;
      }
    }
    if (qb < 0) continue;
    tried++;
    const al = (q: number) => (cv[q] - bv[q]) / (ball - bv[q]);
    /*
     * 가려진 표본 — 배경이 공만큼 밝은 곳(대비 < MIN_RAY_CONTRAST)은 공이 덮었는지 알 수 없다. 흰 그물 실(가만히
     * 있어 배경에도 든다: 그 자리는 공이 지나가도 실 밝기 그대로라 α≈0 으로 '공 밖'처럼 보인다) · 흰 천 · 흰 벽.
     * 건너뛰고 본다 — 공 안쪽을 지나는 실에서 윤곽을 찾으면 안 된다. 윤곽 자체가 가려졌으면(맞닿은 두 표본이
     * 다 보이는 곳에서 α 가 떨어지지 않으면) 그 광선은 버린다.
     */
    const masked = (q: number) => ball - bv[q] < MIN_RAY_CONTRAST;
    let qc = -1;
    let sawMask = false;
    for (let q = qb; q < n - 1; q++) {
      if (masked(q) || masked(q + 1)) {
        sawMask = true;
        continue;
      }
      if (al(q) >= alpha && al(q + 1) < alpha) {
        qc = q;
        break;
      }
    }
    if (qc < 0) {
      if (sawMask) lowContrast++;
      continue;
    }
    const a0 = al(qc);
    const a1 = al(qc + 1);
    const rc = (qc + (a0 - alpha) / (a0 - a1)) * STEP;
    /* 가장자리 폭(α 0.85 → 0.15) — 가려진 표본을 만나면 폭을 잴 수 없어 버린다 */
    let qHi = qc;
    let qLo = qc;
    let broken = false;
    while (qHi > qb && al(qHi) < 0.85) {
      qHi--;
      if (masked(qHi)) broken = true;
    }
    while (qLo < n - 1 && al(qLo) > 0.15) {
      qLo++;
      if (masked(qLo)) broken = true;
    }
    if (broken) continue;
    /*
     * 윤곽 밖은 배경이어야 한다. 그늘진 쪽에서는 α 가 떨어진 뒤에도 공의 그늘진 면(배경보다 조금 밝거나, 흰 천
     * 앞이면 더 어둡다)이 이어진다 — 거기서 떨어진 곳은 윤곽이 아니라 빛과 그늘의 경계다(e9ae8712: 흰 천 앞 공의
     * 아래 면이 천보다 어두워 원이 공보다 작게 맞춰졌다).
     */
    const qOut0 = qLo + 1;
    const qOut1 = Math.min(n - 1, qOut0 + Math.max(Math.round(2 / STEP), Math.round((0.3 * R) / STEP)));
    if (qOut1 <= qOut0) continue;
    let clean = true;
    let seen = 0;
    for (let q = qOut0; q <= qOut1 && clean; q++) {
      if (masked(q)) continue;
      seen++;
      if (Math.abs(al(q)) > EXTERIOR_TOL) clean = false;
    }
    /* 밖의 절반 넘게 가려졌으면 배경인지 확인할 수 없다 */
    if (!clean || seen * 2 < qOut1 - qOut0 + 1) continue;
    /* 보간한 폭 — 날카로움 거르기는 위의 칸 단위 폭 그대로(검증한 규칙), 이것은 흐림을 알리는 데만 */
    const qi85 = al(qHi) >= 0.85 && qHi + 1 <= qc ? qHi + (al(qHi) - 0.85) / Math.max(1e-9, al(qHi) - al(qHi + 1)) : qHi;
    const qi15 = al(qLo) <= 0.15 && qLo - 1 >= qc ? qLo - 1 + (al(qLo - 1) - 0.15) / Math.max(1e-9, al(qLo - 1) - al(qLo)) : qLo;
    rays.push({ x: xs + rc * ca, y: ys + rc * sa, w: (qLo - qHi) * STEP, wi: (qi15 - qi85) * STEP });
  }
  return fitLimbRays(rays, tried, lowContrast, minArc, fail);
}

/** 광선마다 찾은 윤곽 점 → 원(날카로운 광선만 · 원호 검사). measureLimb · measureLimbPolar 가 같이 쓴다 */
function fitLimbRays(
  rays: (Pt & { w: number; wi: number })[],
  tried: number,
  lowContrast: number,
  minArc: number,
  fail: (reason: LimbFailure) => null
): LimbResult | null {
  if (rays.length < MIN_RAYS_USED) {
    /* 대비가 모자라 빠진 광선이 절반을 넘으면 밝은 배경(흰 천 · 흰 벽) 탓으로 본다 */
    return fail(tried > 0 && lowContrast >= tried / 2 ? 'contrast' : 'rays');
  }

  /* 날카로운 광선만 — 그늘 · 번짐은 가장자리가 넓다 */
  const w25 = [...rays.map((r) => r.w)].sort((a, b) => a - b)[Math.floor(rays.length * 0.25)];
  const good = rays.filter((r) => r.w <= Math.max(SHARP_MIN_PX, SHARP_RATIO * w25));
  if (good.length < MIN_RAYS_USED) return fail('sharp');

  const init = kasa(good);
  if (!init) return fail('fit');
  const fit = fitCircle(good, init);
  if (!(fit.r > 1)) return fail('fit');

  /* 쓴 윤곽의 원호 — 점들의 방향을 정렬해 가장 큰 빈틈을 뺀다 */
  const angs = good.map((p) => Math.atan2(p.y - fit.cy, p.x - fit.cx)).sort((a, b) => a - b);
  let gap = 0;
  for (let k = 0; k < angs.length; k++) {
    const next = k + 1 < angs.length ? angs[k + 1] : angs[0] + 2 * Math.PI;
    gap = Math.max(gap, next - angs[k]);
  }
  const arcDeg = ((2 * Math.PI - gap) * 180) / Math.PI;
  if (arcDeg < minArc) return fail('arc');

  return {
    diameterPx: 2 * fit.r,
    x: fit.cx,
    y: fit.cy,
    arcDeg: Math.round(arcDeg),
    used: good.length,
    rms: fit.rms,
    edgePx: Math.round(median(good.map((r) => r.wi)) * 1000) / 1000,
  };
}

/* ───────────────────────── 극성 — 밝은 배경 앞의 어두운 공(2026-10-03) ───────────────────────── */

/**
 * LIMB_ALPHA 0.3 은 밝은 공(실내 보정 영상: 공 ≈ 210 · 배경 ≈ 60)의 부호값에서 맞췄다 — 선형 빛으로는 공이 화소를 16% 덮은
 * 자리다(파일 머리: '계단의 18%'). 공이 배경보다 어두우면(밝은 하늘 앞 그늘진 공) 부호값 α 0.3 은 감마 때문에 전혀 다른 자리
 * (하늘 230 · 공 160 이면 선형 37% — 반지름이 약 0.4px 안쪽, 구속이 몇 % 틀린다)라 그대로 쓸 수 없다.
 *
 * 그래서 공 둘레를 **'같은 덮임이 보정 밝기의 밝은 공이었다면 찍혔을 값'으로 다시 담아**(refEncode) 예전 밝은 공의 규칙
 * 그대로 잰다: 화소마다 선형 빛의 덮임 κ = (lin(값) − lin(배경)) ÷ (lin(공) − lin(배경))를 구해 부호값 enc(lin(60)·(1−κ) +
 * lin(210)·κ) 로 바꾸고, 그 그림에서 α 0.3 · 0.85 · 0.15 와 날카로움 · 원호 규칙을 그대로 쓴다. 공보다 어두운 배경 화소(밝은 공
 * 쪽)도 같은 식이라, 지평선에 걸친 공(위 반쪽 하늘 · 아래 반쪽 땅)도 한 그림에서 한 자로 잰다.
 *
 * 화소에서 다시 담은 뒤 쌍선형으로 표본을 뜬다 — 처음에는 표본(부호값을 쌍선형으로 뜬 것)을 선형으로 바꿔 κ 0.16 을 찾았는데,
 * 부호값 사이의 보간이 감마 때문에 공 쪽으로 치우쳐 지름이 밝은 공보다 1.5~4% 크게 나왔다(합성 '밖-1' −3.7km/h, 같은 그림의
 * 밝은 공은 −0.8). 밝은 공의 α 0.3 은 바로 '부호값에서 보간한' 그 길로 맞춘 값이라 그 길을 따라야 같은 자리가 나온다 — 다시
 * 담자 밝은 공과 0.3~0.7% 안으로 같아졌다(합성, 씨앗 1: 하늘 210 앞 공 60 — 보정 밝기를 뒤집은 그림 — 지름 치우침 +3.3 · +2.2 ·
 * −0.7%, 같은 자리의 밝은 공 210 · 배경 60 은 +2.8 · +1.9 · −1.4%; 씨앗 6개 구속 −2.6 대 −1.1km/h).
 *
 * 가려진 표본(|공 − 배경| < MIN_RAY_CONTRAST)과 '윤곽 밖은 배경' 검사는 실제 부호값으로 본다 — 다시 담은 그림은 밝은 하늘의
 * 잡음을 몇 배로 키운다(감마가 밝은 쪽을 눌러 담았으므로 같은 덮임 차이가 부호값으로는 작다).
 *
 * 전제: 카메라 윤곽(파일 머리 — 선형 50% 보다 원본 0.93px 바깥)이 극성 · 밝기와 상관없이 같은 덮임 자리라는 것. 합성 시험대의
 * 카메라 모형은 그렇게 그려져 있어 맞는 것을 보이지만, 실제 카메라에서는 **확인하지 못했다**(밝은 하늘 앞 공의 스피드건 짝이
 * 없다 — 선명화 · 밖의 톤 매핑이 어두운 테두리에 다르게 들 수 있다). 그래서 이 자로 잰 값은 ± 를 넓히고 믿음을 낮춘다
 * (analyze-frames.ts DARK_POLARITY_SIGMA_REL). 밝은 공의 예전 길(measureLimb)은 한 자리도 바꾸지 않는다 — 보정이 그 길로
 * 얼려져 있다. 이 자는 예전 길로 못 잰 궤적(analyze-frames.ts 두 번째 길)에만 쓴다.
 */
/** 보정 밝기(공 210 · 배경 60, 부호값) */
const REF_BALL = 210;
const REF_BG = 60;
function srgbLin(v: number): number {
  const e = Math.min(1, Math.max(0, v / 255));
  return e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4);
}
function srgbEnc(l: number): number {
  const x = Math.min(1, Math.max(0, l));
  return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
}
const REF_LIN_BALL = srgbLin(REF_BALL);
const REF_LIN_BG = srgbLin(REF_BG);
/** 선형 덮임 κ → 보정 밝기의 밝은 공이었다면 찍혔을 부호값 */
function refEncode(kappa: number): number {
  return srgbEnc(REF_LIN_BG * (1 - kappa) + REF_LIN_BALL * kappa);
}

export type LimbPolarInput = {
  luma: ArrayLike<number>;
  width: number;
  height: number;
  /** 첫 어림 — 중심 · 지름(분석 픽셀) */
  x: number;
  y: number;
  diameterPx: number;
  /** 공의 밝기(노출 치우침을 뺀 부호값 — 예전 배경의 치우침 기준) */
  level: number;
  /** 밝은 공 쪽 배경(두 번째로 어두운 값)과 그 노출 치우침 */
  background: ArrayLike<number>;
  bias: number;
  /** 어두운 공 쪽 배경(중앙값)과 그 노출 치우침 — 이 배경이 공보다 밝은 화소는 이것으로 */
  darkBackground: ArrayLike<number>;
  darkBias: number;
};

/**
 * 극성을 가리는 윤곽 원(위 설명) — 공 둘레를 다시 담은 그림에서 measureLimb 와 같은 규칙으로. 광선의 극성은 그 윤곽 자리 배경이
 * 공보다 밝으면 어두움(결과의 darkRays).
 */
export function measureLimbPolar(
  input: LimbPolarInput,
  opts: { transfer?: LumaTransfer; minArcDeg?: number } = {},
  why?: { reason?: LimbFailure }
): LimbResult | null {
  const { luma, width, height, x: xs, y: ys } = input;
  const alpha = LIMB_ALPHA;
  const minArc = opts.minArcDeg ?? LIMB_MIN_ARC_DEG;
  const canon = toSrgbEncoded(opts.transfer);
  const enc = (v: number) => (canon ? canon(v) : v);
  const R = Math.max(2, input.diameterPx / 2);
  const fail = (reason: LimbFailure) => {
    if (why) why.reason = reason;
    return null;
  };

  /* 그 자리의 남은 배경 치우침 — 공 밖 고리의 중앙값, 배경마다 따로(measureLimb 와 같은 고리) */
  const rIn = 1.35 * R + 2;
  const rOut = rIn + Math.max(3, 0.5 * R);
  const ringLo: number[] = [];
  const ringMed: number[] = [];
  for (let y = Math.max(0, Math.floor(ys - rOut)); y <= Math.min(height - 1, Math.ceil(ys + rOut)); y++) {
    for (let x = Math.max(0, Math.floor(xs - rOut)); x <= Math.min(width - 1, Math.ceil(xs + rOut)); x++) {
      const d = Math.hypot(x - xs, y - ys);
      if (d < rIn || d > rOut) continue;
      const i = y * width + x;
      ringLo.push(luma[i] - input.background[i] - input.bias);
      ringMed.push(luma[i] - input.darkBackground[i] - input.darkBias);
    }
  }
  const offLo = median(ringLo) + input.bias;
  const offMed = median(ringMed) + input.darkBias;
  /* 이 장면에 찍힌 공 밝기(부호값) — 배경도 이 장면의 노출로 옮겨(+ 고리 치우침) 견준다 */
  const ballV = enc(input.level + input.bias);

  /* 공 둘레 화소 — 실제 부호값의 배경(극성을 가림)과 다시 담은 값 */
  const ext = 1.7 * R + 4;
  const px0 = Math.max(0, Math.floor(xs - ext));
  const px1 = Math.min(width - 1, Math.ceil(xs + ext));
  const py0 = Math.max(0, Math.floor(ys - ext));
  const py1 = Math.min(height - 1, Math.ceil(ys + ext));
  const pw = px1 - px0 + 1;
  const ph = py1 - py0 + 1;
  const reData = new Float64Array(pw * ph);
  const bgData = new Float64Array(pw * ph);
  const lumaData = new Float64Array(pw * ph);
  const darkData = new Uint8Array(pw * ph);
  for (let y = py0; y <= py1; y++) {
    for (let x = px0; x <= px1; x++) {
      const i = y * width + x;
      const k = (y - py0) * pw + (x - px0);
      const bMed = enc(input.darkBackground[i] + offMed);
      const isDark = bMed > ballV;
      const b = isDark ? bMed : enc(input.background[i] + offLo);
      const v = enc(luma[i]);
      const lb = srgbLin(b);
      const den = srgbLin(ballV) - lb;
      reData[k] = refEncode(den !== 0 ? (srgbLin(v) - lb) / den : 0);
      bgData[k] = b;
      lumaData[k] = v;
      darkData[k] = isDark ? 1 : 0;
    }
  }
  const at = (a: Float64Array, px: number, py: number) => bilinear(a, pw, ph, px - px0, py - py0);

  type Ray = Pt & { w: number; wi: number; dark: boolean };
  const rays: Ray[] = [];
  let lowContrast = 0;
  let tried = 0;
  const nS = Math.floor((1.7 * R + 3) / STEP) + 1;
  const rv = new Float64Array(nS);
  const cv = new Float64Array(nS);
  const bv = new Float64Array(nS);
  const q0 = Math.round((0.2 * R) / STEP);
  const q1 = Math.round((0.85 * R) / STEP);
  for (let a = 0; a < RAYS; a++) {
    const ang = (2 * Math.PI * a) / RAYS;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    let n = 0;
    for (let q = 0; q < nS; q++) {
      const px = xs + q * STEP * ca;
      const py = ys + q * STEP * sa;
      const r = at(reData, px, py);
      if (!Number.isFinite(r)) break;
      rv[q] = r;
      cv[q] = at(lumaData, px, py);
      bv[q] = at(bgData, px, py);
      n = q + 1;
    }
    if (n < q1 + 4) continue;
    /* 공 밝기 — 다시 담은 그림에서 반지름 0.2~0.85 안의 최대(measureLimb 와 같은 뜻) */
    let ball = -Infinity;
    let qb = -1;
    for (let q = q0; q <= q1; q++) {
      if (rv[q] > ball) {
        ball = rv[q];
        qb = q;
      }
    }
    if (qb < 0 || !(ball > REF_BG)) continue;
    tried++;
    const al = (q: number) => (rv[q] - REF_BG) / (ball - REF_BG);
    /* 가려진 표본 · 윤곽 밖은 실제 부호값으로(위 설명) — 공과 배경의 차가 모자라면 덮였는지 알 수 없다 */
    const masked = (q: number) => Math.abs(ballV - bv[q]) < MIN_RAY_CONTRAST;
    const outside = (q: number) => (cv[q] - bv[q]) / (ballV - bv[q]);
    let qc = -1;
    let sawMask = false;
    for (let q = qb; q < n - 1; q++) {
      if (masked(q) || masked(q + 1)) {
        sawMask = true;
        continue;
      }
      if (al(q) >= alpha && al(q + 1) < alpha) {
        qc = q;
        break;
      }
    }
    if (qc < 0) {
      if (sawMask) lowContrast++;
      continue;
    }
    const a0 = al(qc);
    const a1 = al(qc + 1);
    const rc = (qc + (a0 - alpha) / (a0 - a1)) * STEP;
    let qHi = qc;
    let qLo = qc;
    let broken = false;
    while (qHi > qb && al(qHi) < 0.85) {
      qHi--;
      if (masked(qHi)) broken = true;
    }
    while (qLo < n - 1 && al(qLo) > 0.15) {
      qLo++;
      if (masked(qLo)) broken = true;
    }
    if (broken) continue;
    const qOut0 = qLo + 1;
    const qOut1 = Math.min(n - 1, qOut0 + Math.max(Math.round(2 / STEP), Math.round((0.3 * R) / STEP)));
    if (qOut1 <= qOut0) continue;
    let clean = true;
    let seen = 0;
    for (let q = qOut0; q <= qOut1 && clean; q++) {
      if (masked(q)) continue;
      seen++;
      if (Math.abs(outside(q)) > EXTERIOR_TOL) clean = false;
    }
    if (!clean || seen * 2 < qOut1 - qOut0 + 1) continue;
    const qi85 = al(qHi) >= 0.85 && qHi + 1 <= qc ? qHi + (al(qHi) - 0.85) / Math.max(1e-9, al(qHi) - al(qHi + 1)) : qHi;
    const qi15 = al(qLo) <= 0.15 && qLo - 1 >= qc ? qLo - 1 + (al(qLo - 1) - 0.15) / Math.max(1e-9, al(qLo - 1) - al(qLo)) : qLo;
    const ex = xs + rc * ca;
    const ey = ys + rc * sa;
    rays.push({
      x: ex,
      y: ey,
      w: (qLo - qHi) * STEP,
      wi: (qi15 - qi85) * STEP,
      dark: bv[n - 1] > ballV,
    });
  }
  const res = fitLimbRays(rays, tried, lowContrast, minArc, fail);
  if (!res) return null;
  /* 맞춤에 쓴 광선(날카로운 것) 가운데 어두운 것 — fitLimbRays 와 같은 거르기로 센다 */
  const w25 = [...rays.map((r) => r.w)].sort((a, b) => a - b)[Math.floor(rays.length * 0.25)];
  res.darkRays = rays.filter((r) => r.dark && r.w <= Math.max(SHARP_MIN_PX, SHARP_RATIO * w25)).length;
  return res;
}

/**
 * 가만히 있는 공(렌즈 보정 — components/velocity/lens-calibration.tsx)을 같은 자로 잰다. 배경 장면이 없으므로
 * 공 둘레 고리의 중앙값을 배경으로 쓴다. 비행 중의 지름과 같은 정의(같은 α · 같은 광선 규칙)여야 보정한 초점
 * 거리가 비행 지름과 맞는다 — 면적으로 잰 보정값은 윤곽 자와 0.91~0.95 배 어긋난다.
 * 분석 해상도(짧은 변 720)의 장면으로 재야 α 가 비행과 같은 뜻이다. 흐림 보정(blurCutPx)도 비행과 똑같이 한다 —
 * 돌려주는 diameterPx 는 보정한 값이다(edgePx 는 그대로 남긴다).
 */
export function measureLimbStatic(
  luma: ArrayLike<number>,
  width: number,
  height: number,
  cx: number,
  cy: number,
  roughD: number
): LimbResult | null {
  const R = roughD / 2;
  const ring: number[] = [];
  const rIn = 1.5 * R + 3;
  const rOut = rIn + Math.max(4, 0.6 * R);
  for (let y = Math.max(0, Math.floor(cy - rOut)); y <= Math.min(height - 1, Math.ceil(cy + rOut)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rOut)); x <= Math.min(width - 1, Math.ceil(cx + rOut)); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= rIn && d <= rOut) ring.push(luma[y * width + x]);
    }
  }
  if (ring.length < 20) return null;
  const r = measureLimb({ luma, background: median(ring), width, height, x: cx, y: cy, diameterPx: roughD, bias: 0 });
  return r ? { ...r, diameterPx: Math.max(1, r.diameterPx - blurCutPx(r.edgePx)) } : null;
}
