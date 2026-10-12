import type { SlotKey } from '@/lib/report/theme';
import type { SwapMode } from '@/lib/workout/swap';

/**
 * 운동을 빼거나 바꾼 기록(트레이닝 추천 2판 P2, 2026-10-12).
 *
 * 왜 남기는가. 운동 중에 운동을 빼거나(reorderSession) 바꾸고(changeSessionExercise), 일정 화면에서
 * 빼도(removeFromTodayPlan) 그 사실이 어디에도 안 남았다 — 세션 판 · 일정의 목록만 덮어썼다. 그래서 추천이
 * '사용자가 두 번이나 빼 버린 운동'을 또 맨 앞에 내놓았다. 이제 그날 일정(DailyTrainingSetup.plan 의 swaps)과
 * 세션 판(TrainingSession.plan 의 swaps)에 한 줄씩 남기고, P5 의 점수(두 번 이상 바꿔서 뺀 운동 −2)가 읽는다.
 *
 * 어디에 적는가. 세션에서 바꾼 것은 세션 판에 남기고 그날 일정에도 같이 적는다(둘 다 같은 at). 프로그램 날은
 * 일정 줄이 없어 세션 판이 유일한 기록이다. 일정 화면에서 뺀 것은 일정에만(세션이 열려 있어도 세션 목록은 안 건드리므로).
 *
 * 셈. swappedOutCounts 는 두 출처를 합치고 같은 줄(from · kind · at)은 한 번만 센다 — 쓰기 순서(세션 먼저, 일정 나중)에
 * 걸리지 않게. 'add'(세트를 남겨 더하기로 바뀐 것)는 from 을 실제로 했으니 '바꿔서 뺀' 것으로 세지 않는다.
 *
 * 순수 함수만 둔다(DB · 서버 없음) — 기준선 도구 · 자체 시험이 앱과 같은 규칙을 그대로 쓴다(daily-plan.ts 의
 * strengthDatesFrom 과 같은 까닭). DB 읽기는 lib/report/gather.ts 의 swappedOutRecently.
 */

/** 바꾸기(replace) · 더하기(add)는 lib/workout/swap.ts 의 SwapMode 와 같은 글자, 빼기는 remove */
export type PlanSwapKind = SwapMode | 'remove';

/** 어디서 한 일인가 — 운동 화면(session) · 일정 화면(plan) */
export type PlanSwapWhere = 'session' | 'plan';

export type PlanSwap = {
  /** 뺀 · 바꾼 운동 */
  from: string;
  /** 대신 넣은 운동. 빼기는 null */
  to: string | null;
  kind: PlanSwapKind;
  where: PlanSwapWhere;
  /** from 이 있던 구간 — 옛 줄 · 모르는 줄은 없을 수 있다 */
  slot?: SlotKey;
  /** ISO 시각(appNow().toISOString()) — 두 출처의 같은 줄을 가리는 열쇠이기도 하다 */
  at: string;
};

/** 하루 한 일정(판)에 남기는 기록 상한 — 넘으면 오래된 것부터 버린다. 이 수준이면 이미 신호가 아니다 */
export const MAX_SWAPS_PER_DAY = 40;

/** '최근에 바꿔서 뺐나'를 보는 기간 — 교체 창의 '최근'(lib/report/exercise-recent.ts)과 같은 60일 */
export const SWAP_LOOKBACK_DAYS = 60;

const KINDS: readonly PlanSwapKind[] = ['replace', 'add', 'remove'];
const WHERES: readonly PlanSwapWhere[] = ['session', 'plan'];

function readOne(value: unknown): PlanSwap | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<PlanSwap>;
  if (typeof v.from !== 'string' || v.from === '') return null;
  if (!KINDS.includes(v.kind as PlanSwapKind)) return null;
  if (!WHERES.includes(v.where as PlanSwapWhere)) return null;
  if (typeof v.at !== 'string') return null;
  if (v.to != null && typeof v.to !== 'string') return null;
  return {
    from: v.from,
    to: typeof v.to === 'string' ? v.to : null,
    kind: v.kind as PlanSwapKind,
    where: v.where as PlanSwapWhere,
    ...(typeof v.slot === 'string' ? { slot: v.slot as SlotKey } : {}),
    at: v.at,
  };
}

/**
 * 저장된 일정 · 세션 판에서 기록을 읽는다. 없거나(옛 줄) 모양이 다르면 [] — 모양이 맞는 줄만 남긴다.
 * DailyPlan 이든 FrozenPlan 이든 swaps 칸만 본다(version 은 안 본다 — 기록은 두 모양에 같은 꼴로 들어간다).
 */
export function readPlanSwaps(value: unknown): PlanSwap[] {
  if (!value || typeof value !== 'object') return [];
  const swaps = (value as { swaps?: unknown }).swaps;
  if (!Array.isArray(swaps)) return [];
  return swaps.flatMap((s) => {
    const one = readOne(s);
    return one ? [one] : [];
  });
}

/**
 * 기록을 뒤에 붙인 새 일정(판). 다른 칸은 그대로. 상한을 넘으면 오래된 것부터 버린다.
 *
 * 붙일 것이 없으면 같은 객체를 그대로 돌려준다(swaps 키를 더하지 않는다) — 순서만 바꾼 판 · 기록 없는 일정은
 * 예전과 글자 하나 같은 모양으로 저장돼야 한다(옛 판 회귀 약속, program-selftest RG).
 */
export function withSwaps<T extends { swaps?: PlanSwap[] }>(
  plan: T,
  entries: readonly PlanSwap[]
): T {
  if (entries.length === 0) return plan;
  const all = [...readPlanSwaps(plan), ...entries];
  return { ...plan, swaps: all.slice(Math.max(0, all.length - MAX_SWAPS_PER_DAY)) };
}

/**
 * '다시 만들기'가 그날 기록을 잇는다 — 새로 만든 일정(next)에 지금 저장돼 있던 일정(before)의 기록을 붙인다.
 * before 가 없거나 옛 모양이면 next 그대로. (app/actions/training-setup.ts 의 generateTodayPlan)
 */
export function carrySwaps<T extends { swaps?: PlanSwap[] }>(
  next: T,
  before: unknown
): T {
  return withSwaps(next, readPlanSwaps(before));
}

/**
 * 일정(판) 하나에서 '바꿔서 뺀'(replace · remove) 운동 — 고르기 점수(lib/report/score.ts, 2판 P5)가 '다시 만들기' 전의 오늘 일정에서
 * 읽어, 방금 뺀 운동을 새 일정 앞에 되돌리지 않게 한다(60일 셈 swappedOutCounts 는 두 번부터라 오늘 한 번 뺀 것을 못 잡는다).
 * 'add' 는 from 을 실제로 했으니 안 넣는다. 모양이 안 맞으면 빈 집합.
 */
export function swappedOutOf(value: unknown): Set<string> {
  return new Set(
    readPlanSwaps(value)
      .filter((s) => s.kind !== 'add')
      .map((s) => s.from)
  );
}

/**
 * 기간 안에 '바꿔서 뺀'(replace · remove) 운동별 횟수.
 *
 * 두 출처(그날 일정 · 세션 판)를 합치고 같은 줄(from · kind · at)은 한 번만 센다 — 세션에서 바꾼 것은 두 곳에 같은
 * at 으로 적히고, 일정이 나중에 생긴 날(프로그램 날 · 멈춘 날에 먼저 운동한 뒤 일정을 만든 날)은 세션 판에만 있다.
 * 날짜 키는 sinceKey ≤ date ≤ untilKey(오늘 포함 — 오늘 빼고 '다시 만들기'한 날 P5 가 그 운동을 안 되돌리게).
 * 'add' 는 from 을 실제로 했으니 안 센다. 같은 입력이면 같은 답(순서까지).
 */
export function swappedOutCounts({
  plans,
  sessions,
  sinceKey,
  untilKey,
}: {
  /** 저장된 일정 — 날짜 키(YYYY-MM-DD)와 DailyTrainingSetup.plan 그대로 */
  plans: { date: string; plan: unknown }[];
  /** 세션 판 — 날짜 키와 TrainingSession.plan 그대로 */
  sessions: { date: string; plan: unknown }[];
  sinceKey: string;
  untilKey: string;
}): Map<string, number> {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of [...plans, ...sessions]) {
    if (row.date < sinceKey || row.date > untilKey) continue;
    for (const s of readPlanSwaps(row.plan)) {
      if (s.kind === 'add') continue;
      const key = `${row.date}|${s.from}|${s.kind}|${s.at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(s.from, (counts.get(s.from) ?? 0) + 1);
    }
  }
  return counts;
}
