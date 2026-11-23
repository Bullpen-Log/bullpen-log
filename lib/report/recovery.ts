import { intensityLevel } from '@/lib/exercise-meta';

/**
 * 부위별 회복도 — 최근 운동으로 부위마다 0~100% 를 어림한다(2026-11-23 김민, Fitbod 의 Muscle Recovery 를 작게).
 *
 * 왜 두는가. 매일 일정은 하체 날 · 상체 날을 번갈고 '최근 사흘에 한 운동'을 뒤로 보낼 뿐이라, 같은 부위를 다른 운동으로 이틀 이어
 * 쓰는 것을 모른다(월요일 스쿼트 → 수요일 런지). 부위마다 얼마나 썼고 며칠 지났는지를 세어, 덜 회복된 부위의 운동을 뒤로 민다
 * (lib/report/score.ts 'tired'). 화면은 같은 값을 막대로 보인다.
 *
 * 셈(운동 기록만 본다 — 던진 공 수는 넣지 않는다, 2026-11-23 김민)
 *   ① 세트 하나의 피로 = 강도 값(SET_FATIGUE — 매우 낮음 0.25 · 낮음 0.5 · 중간 1 · 높음 1.5 · 매우 높음 2).
 *      운동의 부위 가운데 맨 앞이 주 부위(×1), 나머지는 보조(×SECONDARY_SHARE 0.5).
 *   ② 하루에 한 부위가 받은 피로의 합을 FULL_FATIGUE(10 — 무거운 운동 서너 개)로 나눠 0~1 로(그날의 쓴 정도 f).
 *   ③ 그날의 피로는 2 + 3f 일에 걸쳐 고르게 풀린다 — 가볍게 쓴 날은 이틀, 다 쓴 날은 닷새.
 *   ④ 여러 날의 남은 피로를 더해(1 에서 막는다) 회복도 = 100 × (1 − 남은 피로).
 * 숫자는 우리가 정한 어림이다(Fitbod 도 식을 밝히지 않는다) — 48~72시간에 대부분 풀리고 길어도 엿새 안이라는 범위에 맞췄다.
 *
 * 순수 파일 — DB · 날짜 함수 · 난수 없음.
 */

/** 세트 하나의 피로 — 강도 단계(1~5)마다 */
const SET_FATIGUE: readonly number[] = [0, 0.25, 0.5, 1, 1.5, 2];
/** 보조 부위(맨 앞이 아닌 부위)가 받는 몫 */
export const SECONDARY_SHARE = 0.5;
/** 하루에 이만큼 받으면 그 부위를 다 쓴 날 */
export const FULL_FATIGUE = 10;
/** 이 날수보다 앞의 운동은 보지 않는다 — 다 쓴 날도 닷새면 풀린다(③) */
export const RECOVERY_WINDOW_DAYS = 6;
/** 이보다 낮으면 덜 회복된 부위 — 그 부위가 주 부위인 운동을 뒤로 민다(score.ts) */
export const TIRED_BELOW = 50;

/** 부위로 세지 않는 이름 — 온몸 운동(유산소 · 버피)은 어느 한 부위의 회복을 깎지 않는다 */
const WHOLE_BODY = '전신';

export type RecoveryItem = {
  /** 맨 앞이 주 부위 */
  bodyParts: readonly string[];
  intensity: string;
  /** 그날 그 운동을 한 세트 수 */
  sets: number;
};

/** 하루치 — daysAgo 0 은 오늘(이미 한 운동) */
export type RecoveryDay = { daysAgo: number; items: readonly RecoveryItem[] };

/** 부위 → 회복도(0~100, 정수). 최근에 안 쓴 부위는 지도에 없다(= 100) */
export function partRecovery(days: readonly RecoveryDay[]): Map<string, number> {
  const left = new Map<string, number>();
  for (const day of days) {
    if (day.daysAgo < 0 || day.daysAgo > RECOVERY_WINDOW_DAYS) continue;
    const got = new Map<string, number>();
    for (const item of day.items) {
      const perSet = SET_FATIGUE[intensityLevel(item.intensity)] ?? 1;
      item.bodyParts.forEach((part, i) => {
        if (part === WHOLE_BODY) return;
        const share = i === 0 ? 1 : SECONDARY_SHARE;
        got.set(part, (got.get(part) ?? 0) + item.sets * perSet * share);
      });
    }
    for (const [part, sum] of got) {
      const f = Math.min(1, sum / FULL_FATIGUE);
      const remaining = f * Math.max(0, 1 - day.daysAgo / (2 + 3 * f));
      if (remaining > 0) left.set(part, (left.get(part) ?? 0) + remaining);
    }
  }
  const out = new Map<string, number>();
  for (const [part, sum] of left) out.set(part, Math.round(100 * (1 - Math.min(1, sum))));
  return out;
}

/** 운동의 주 부위(맨 앞, 온몸은 건너뜀)가 덜 회복됐으면 그 부위와 회복도 — 아니면 null */
export function tiredPartOf(
  bodyParts: readonly string[],
  recovery: ReadonlyMap<string, number>
): { part: string; pct: number } | null {
  const part = bodyParts.find((p) => p !== WHOLE_BODY);
  if (part == null) return null;
  const pct = recovery.get(part);
  return pct != null && pct < TIRED_BELOW ? { part, pct } : null;
}
