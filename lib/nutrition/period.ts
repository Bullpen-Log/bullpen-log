/**
 * '언제까지' — 목표 날짜와 주당 속도 사이의 셈(순수). 영양 탭 목표 창과 온보딩 속도 화면이 같이 쓴다
 * (목표 창에만 있던 것을 2026-10-08 인아웃식 온보딩을 만들며 여기로 옮겼다).
 */

/** 고를 수 있는 기간(주) */
export const PERIOD_WEEKS = [4, 8, 12, 16, 24] as const;

/** 두 날짜('YYYY-MM-DD') 사이의 날 수 */
export function dayGap(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000
  );
}

/** '12월 24일' */
export function dateText(key: string) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/** 그 날짜까지 닿으려면 주 몇 kg 이 필요한가(소수 그대로). 남은 것이 없거나 날짜가 오늘 이전이면 null */
export function neededRate(
  remainingKg: number | null,
  todayKey: string,
  endKey: string | null
): number | null {
  if (remainingKg === null || remainingKg <= 0 || endKey === null) return null;
  const weeks = dayGap(todayKey, endKey) / 7;
  return weeks > 0 ? remainingKg / weeks : null;
}

/** 필요한 속도 이상인 가장 느린 선택지, 없으면 가장 빠른(몸에 무리 없는 한도) 속도. 선택지가 없으면 null */
export function pickPace(paces: readonly number[], needed: number): number | null {
  if (paces.length === 0) return null;
  return paces.find((kg) => kg >= needed - 0.005) ?? paces[paces.length - 1];
}
