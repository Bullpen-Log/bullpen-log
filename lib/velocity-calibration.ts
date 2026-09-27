/**
 * 구속 측정 보정 — 카메라로 잰 값을 스피드건 값에 맞춘다.
 *
 * 카메라 방식은 공이 날아간 구간의 평균 속도라 릴리스 직후를 재는 스피드건보다 몇 km/h
 * 낮게 나온다(그리고 렌즈 화각이 조금만 달라도 전체가 같이 밀린다). 그래서 스피드건과
 * 같이 재며 짝(카메라 값, 건 값)을 모으고, 그 짝으로 '건 값 ≈ a × 카메라 값 + b' 를 맞춘다.
 *
 * 짝은 브라우저(localStorage)에만 둔다 — 시제품이라 DB 표를 새로 만들지 않았다. 팀이 모은
 * 짝은 '복사' 로 글자로 뽑아 나눈다. 쓸 만해지면 표로 옮기고 화각 · 계수를 계정에 둔다.
 */

export const CAL_KEY = 'bullpen-velocity-cal';
export const FOV_KEY = 'bullpen-velocity-fov';

export type CalPair = {
  /** 카메라로 잰 값(km/h, 보정 전) */
  measured: number;
  /** 스피드건 값(km/h) */
  gun: number;
  /** 언제(ISO) */
  at: string;
};

export type CalFit = {
  scale: number;
  offset: number;
  /** 몇 짝으로 맞췄나. 0 이면 보정 없음 */
  n: number;
};

const IDENTITY: CalFit = { scale: 1, offset: 0, n: 0 };

export function loadPairs(): CalPair[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CAL_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is CalPair =>
        !!p &&
        typeof p === 'object' &&
        Number.isFinite((p as CalPair).measured) &&
        Number.isFinite((p as CalPair).gun)
    );
  } catch {
    return [];
  }
}

export function savePairs(pairs: CalPair[]) {
  try {
    localStorage.setItem(CAL_KEY, JSON.stringify(pairs));
  } catch {
    /* 사생활 보호 모드 등 — 저장이 안 되면 이번 세션만 쓴다 */
  }
}

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
    /* 위와 같다 */
  }
}

/**
 * 짝으로 보정식을 맞춘다.
 *
 * - 짝이 없으면 그대로.
 * - 셋 미만이면 기울기는 1 로 두고 차이의 평균만 더한다 — 두 점으로 기울기까지 맞추면
 *   한 번의 오차가 전체를 흔든다.
 * - 셋 이상이면 최소제곱 직선. 다만 기울기는 0.8~1.25 밖으로 못 나간다 — 카메라 값이
 *   건 값과 그렇게까지 다른 비율일 리 없고, 그 밖이면 짝 하나가 잘못 적힌 것이다.
 */
export function fitCalibration(pairs: CalPair[]): CalFit {
  const n = pairs.length;
  if (n === 0) return IDENTITY;
  if (n < 3) {
    const offset = pairs.reduce((s, p) => s + (p.gun - p.measured), 0) / n;
    return { scale: 1, offset: round2(offset), n };
  }
  const mx = pairs.reduce((s, p) => s + p.measured, 0) / n;
  const my = pairs.reduce((s, p) => s + p.gun, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of pairs) {
    sxx += (p.measured - mx) ** 2;
    sxy += (p.measured - mx) * (p.gun - my);
  }
  let scale = sxx > 0 ? sxy / sxx : 1;
  scale = Math.min(1.25, Math.max(0.8, scale));
  const offset = my - scale * mx;
  return { scale: round3(scale), offset: round2(offset), n };
}

export function applyCalibration(kmh: number, fit: CalFit): number {
  return Math.round((kmh * fit.scale + fit.offset) * 10) / 10;
}

/** 짝을 글자로 — 팀과 나누거나 표에 붙여 넣을 때 */
export function pairsToText(pairs: CalPair[]): string {
  const lines = pairs.map(
    (p) => `${p.at.slice(0, 16).replace('T', ' ')}\t${p.measured}\t${p.gun}`
  );
  return ['시각\t카메라(km/h)\t스피드건(km/h)', ...lines].join('\n');
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
