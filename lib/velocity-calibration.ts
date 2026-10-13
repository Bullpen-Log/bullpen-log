/**
 * 구속 측정 보정 — 카메라로 잰 값을 스피드건 값에 맞춘다.
 *
 * 카메라 방식은 공이 날아간 구간의 평균 속도라 릴리스 직후를 재는 스피드건보다 몇 km/h
 * 낮게 나온다(그리고 렌즈 화각이 조금만 달라도 전체가 같이 밀린다). 그래서 스피드건과
 * 같이 재며 짝(카메라 값, 건 값)을 모으고, 그 짝으로 '건 값 ≈ a × 카메라 값' 을 맞춘다(아래 fitCalibration).
 *
 * 짝은 공마다 DB 에 있다(VelocityPitch.rawKmh · gunKmh). 서버가 그 사람 것을 모아 식을 맞추고
 * (app/actions/velocity.ts), 세션을 저장할 때 그때의 식을 세션에 박아 둔다. 화각은 기기마다
 * 달라 브라우저(localStorage)에 둔다.
 */

export const FOV_KEY = 'bullpen-velocity-fov';

export type CalPair = {
  /** 카메라로 잰 값(km/h, 보정 전) */
  measured: number;
  /** 스피드건 값(km/h) */
  gun: number;
};

export type CalFit = {
  scale: number;
  offset: number;
  /** 몇 짝으로 맞췄나. 0 이면 보정 없음 */
  n: number;
};

export const NO_CALIBRATION: CalFit = { scale: 1, offset: 0, n: 0 };

export function loadFov(fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const n = Number(localStorage.getItem(FOV_KEY));
    return n >= 30 && n <= 120 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function saveFov(fovDeg: number) {
  try {
    localStorage.setItem(FOV_KEY, String(fovDeg));
  } catch {
    /* 사생활 보호 모드 등 — 저장이 안 되면 이번만 쓴다 */
  }
}

/**
 * 짝으로 보정식을 맞춘다 — 비율 하나(건 값 ≈ a × 카메라 값), a 는 짝마다의 '건 ÷ 카메라' 의 가운데 값.
 *
 * 예전에는 최소제곱 직선(a × 카메라 + b)이었다. 카메라 값이 흔들리면(믿음 낮은 공 · 튄 짝) 직선의 기울기가 1 보다 눕는다 —
 * 2026-10-12 김민 밖 22구: 10-09 실내 짝 13개(12개가 믿음 낮음, 65~80km/h 에 몰림, 111/97 · 70/97 같은 튄 짝)로 맞춘
 * 식이 ×0.8(하한) + 14.55 라, 원값 127 이 116 으로(건 129) — 빠를수록 많이 깎았다. 원값 자체는 빠르기와 상관없이 고르게
 * 약 2% 낮았다(90 밑 −3.1% · 110 위 −2.8%). 남는 치우침은 거리 · 화각 같은 비율 오차라 비율 하나가 물리에 맞고, 가운데 값은
 * 튄 짝 몇 개에 흔들리지 않는다. 짝이 셋 미만이면 보정하지 않는다(한 번의 오차가 전체를 흔든다). 0.9~1.1 밖이면 그 끝에서 멈춘다.
 */
export const MIN_CAL_PAIRS = 3;

export function fitCalibration(pairs: CalPair[]): CalFit {
  const ratios = pairs
    .filter((p) => p.measured > 0 && p.gun > 0)
    .map((p) => p.gun / p.measured)
    .sort((a, b) => a - b);
  const n = ratios.length;
  if (n < MIN_CAL_PAIRS) return { scale: 1, offset: 0, n };
  const mid = n % 2 ? ratios[(n - 1) / 2] : (ratios[n / 2 - 1] + ratios[n / 2]) / 2;
  return { scale: round3(Math.min(1.1, Math.max(0.9, mid))), offset: 0, n };
}

export function applyCalibration(kmh: number, fit: CalFit): number {
  return Math.round((kmh * fit.scale + fit.offset) * 10) / 10;
}

/** '×1.02 +1.3 (짝 4)' — 화면에 보여 줄 한 줄. 짝이 없으면 null */
export function calibrationText(fit: CalFit): string | null {
  if (fit.n === 0) return null;
  if (fit.n < MIN_CAL_PAIRS) return `짝 ${fit.n} · ${MIN_CAL_PAIRS}개부터 보정`;
  const add = fit.offset ? ` ${fit.offset >= 0 ? '+' : ''}${fit.offset}` : '';
  return `×${fit.scale}${add} (짝 ${fit.n})`;
}

/** 짝을 글자로 — 팀과 나누거나 표에 붙여 넣을 때 */
export function pairsToText(pairs: CalPair[]): string {
  return [
    '카메라(km/h)\t스피드건(km/h)',
    ...pairs.map((p) => `${p.measured}\t${p.gun}`),
  ].join('\n');
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
