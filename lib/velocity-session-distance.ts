/**
 * 세션 거리 — 폰과 그물은 세션 내내 그대로인데, 공 하나로 어림한 공 크기 거리는 2~3% 흔들린다. 그래서 끝이 깨끗한 공(맞고 튄 공으로
 * 끝, 이어 찾기 없음)이 3개부터 그 거리들의 중앙값을 같이 쓴다(측정 화면 withSessionDistance 가 앞 공까지 다시 낸다).
 *
 * 그 전(공 1~2개)은 지난 세션 거리를 공 2개 몫으로 섞는다 — 카메라로 잰 세션이 깨끗한 공 3개를 넘기면 그 중앙값을 폰에 남기고(30일),
 * 다음 세션 공이 모두 그것과 6% 안이면 같은 자리로 본다. 사용자: "최대한 세션 1개만에 바로 판단 가능하게".
 * 사파리 '파일로 재기' 밖 13개를 아무 차례로 흘려 본 첫 두 공(평균 오차 · ±5km/h 밖): 기억 없음 2.1 · 8%. 폰 자리와 날마다 다른
 * 치우침이 없으면 1.6 · 6%, 2% 흔들리면 1.9 · 6%, 3% 면 2.2 · 7.5%. 기억을 그대로 쓰면 같은 자리에서 1.6 · 0% 이지만 3% 흔들리면
 * 2.5 · 11% 로 나빠져 섞는다. 두 공 평균(기억 없이 공 2개부터)은 첫 공 하나보다 낫지 않아 쓰지 않는다.
 * 3개째부터는 이번 세션 값만 쓰니 저장되는 값은 기억과 상관없다.
 */

export const SESSION_DIST_MIN = 3;
/** 지난 세션 거리와 '같은 자리'로 볼 차이 — 공 하나의 공 크기 거리는 2~3% 흔들린다 */
export const MEMORY_TOL = 0.06;
/** 지난 세션 거리를 공 몇 개 몫으로 섞나 */
export const MEMORY_WEIGHT = 2;
const MEMORY_KEY = 'bullpen-velocity-dist-memory';
const MEMORY_DAYS = 30;

export type DistMemory = { distM: number; n: number; at: number };

export function loadDistMemory(): DistMemory | null {
  try {
    const m = JSON.parse(
      localStorage.getItem(MEMORY_KEY) ?? 'null'
    ) as DistMemory | null;
    if (!m || !(m.distM > 0) || !(Date.now() - m.at < MEMORY_DAYS * 86_400_000))
      return null;
    return m;
  } catch {
    return null;
  }
}

export function saveDistMemory(m: DistMemory) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
  } catch {
    /* 사생활 보호 모드 등 — 다음 세션은 다시 어림한다 */
  }
}

export function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/** 끝이 깨끗한 공들의 공 크기 거리(m) → 세션 거리. 3개부터 이번 세션 중앙값, 그 전엔 공이 모두 6% 안일 때 지난 세션 거리와 섞음 */
export function sessionDistOf(
  ds: number[],
  memory: DistMemory | null
): { m: number; from: 'session' | 'memory' } | null {
  if (ds.length >= SESSION_DIST_MIN) return { m: medianOf(ds), from: 'session' };
  if (
    memory &&
    ds.length &&
    ds.every((d) => Math.abs(d / memory.distM - 1) <= MEMORY_TOL)
  )
    return {
      m:
        (MEMORY_WEIGHT * memory.distM + ds.reduce((a, d) => a + d, 0)) /
        (MEMORY_WEIGHT + ds.length),
      from: 'memory',
    };
  return null;
}

/* ───────────────────────── 기준 거리(20m)로 잰 세션의 보정 — 엔진 2.4 1단계 ───────────────────────── */

/**
 * 기준 20m 로 잰 공(김민 2026-10-09: 모든 사용자 같은 조건)은 폰 · 미트 자리에 따라 실제 거리가 몇 % 다르고, 구속은 거리에 비례해
 * 같이 틀린다(10-12 밖 22구: 공 크기 거리 가운데 값 21.0m, 원값 −3.7%). 공 하나의 공 크기 거리는 2~4% 흔들리지만 깨끗한 공 셋의
 * 가운데 값은 믿을 만하다 — 그래서 세션 안에서 깨끗한 공 SESSION_DIST_MIN(3)개부터 그 가운데 값으로 세션의 구속을 옮긴다.
 * 기준과 SESSION_CORR_MIN(3%) 안이면 흩어짐일 뿐이라 안 옮기고, SESSION_CORR_MAX(15%) 밖이면 다른 일(끝을 못 봄 · 폰을 옮김)이라 안 옮긴다.
 * 줄자로 잰 세션(distTape)은 옮기지 않는다 — 줄자가 이긴다. 깨끗한 공: 끝 튕김을 봄 · 이어 찾기 없음 · 믿음 높음 · 지름–깊이
 * 기울기 −1 근처(|기울기 + 1| ≤ 0.3) · 공 길 20장 이상.
 */
export const SESSION_CORR_MIN = 0.03;
export const SESSION_CORR_MAX = 0.15;
export const CLEAN_SLOPE_TOL = 0.3;
export const CLEAN_MIN_FRAMES = 20;
/** 줄자 거리와 공 크기 가운데 값이 이만큼 넘게 다르면 자리를 확인하라고 알린다(1단계 d) */
export const TAPE_WARN = 0.07;

export type SizeSample = {
  sizeDistM: number | null;
  sizeSlope: number | null;
  extended: number | null;
  impact: 'rebound' | 'end' | null;
  confidence: string;
  frames: number | null;
};

/** 깨끗한 공이면 그 공 크기 거리(m), 아니면 null */
export function cleanSize(s: SizeSample): number | null {
  if (s.sizeDistM == null || !(s.sizeDistM > 0)) return null;
  if (s.confidence !== 'high') return null;
  if (s.impact !== 'rebound' || (s.extended ?? 0) !== 0) return null;
  if (s.sizeSlope == null || Math.abs(s.sizeSlope + 1) > CLEAN_SLOPE_TOL) return null;
  if ((s.frames ?? 0) < CLEAN_MIN_FRAMES) return null;
  return s.sizeDistM;
}

/**
 * 세션 보정 — 깨끗한 공 셋부터의 가운데 값 m 과 구속 배율 k = (m ÷ 기준)^exponent(엔진 SPEED_DISTANCE_EXPONENT). 옮길 일이 없으면 null.
 * median 은 알리기용으로 늘 돌려준다(줄자 세션의 7% 경고도 이것으로).
 */
export function sessionCorrection(
  samples: SizeSample[],
  baseM: number,
  exponent: number
): { m: number; n: number; k: number; apply: boolean } | null {
  const ds = samples.map(cleanSize).filter((d): d is number => d != null);
  if (ds.length < SESSION_DIST_MIN || !(baseM > 0)) return null;
  const m = Math.round(medianOf(ds) * 10) / 10;
  const off = Math.abs(m / baseM - 1);
  const apply = off > SESSION_CORR_MIN && off <= SESSION_CORR_MAX;
  return { m, n: ds.length, k: apply ? (m / baseM) ** exponent : 1, apply };
}
