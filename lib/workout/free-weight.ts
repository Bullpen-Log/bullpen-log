import {
  LONG_BREAK_DAYS,
  roundToUnit,
  UNIT_KG,
  weightKindOf,
} from '@/lib/program/next-weight';

/**
 * 프로그램이 아닌 날의 무게 추천 — 순수 함수(DB 를 모른다). 2026-10-09 트레이닝 검토 2-⑤.
 *
 * 프로그램 날은 next-weight.ts 가 '몇 개 더?'(RIR)로 올리고 내린다. 자유 운동은 RIR 을 묻지 않아 지난번 숫자만
 * 보여 줬고("지난번 60kg × 8회"), 올릴지 말지는 사람이 매번 셈했다. 여기서는 묻지 않아도 아는 것으로만 정한다 —
 * 이중 진행(double progression): 처방 세트를 다 처방 횟수 이상으로 채웠으면 올리고, 아니면 그대로.
 *
 *   ① 기준 W = 지난번(가장 최근 세트를 남긴 날)의 가장 무거운 무게. 그 무게로 한 세트가 '본 세트'.
 *   ② 본 세트가 처방 세트 수만큼 있고 모두 처방 횟수 이상 → 올림(하체 큰 운동 ×1.05, 그 밖 ×1.025 — 프로그램과 같은 비율,
 *      적어도 한 단위). 처방 횟수를 모르면 그대로. 못 채웠으면 그대로 — 내리지는 않는다(RIR 이 없어 '힘들어서'인지 모른다).
 *   ③ 쉰 기간 — 8~14일 ×0.9, 15~28일 ×0.85(올리지 않는다), 29일+ 는 숫자 없이(처음처럼). 프로그램의 ④와 같은 값.
 *   ④ 장비 단위로 반올림(바벨 2.5 · 덤벨 2 · 머신 2.5). 맨몸 · 밴드 · 메디신볼은 추천이 없다.
 *
 * 운동 시작 때 판에 얼려(FrozenExercise.suggestedKg · suggestNote) 운동 화면의 '추천 N kg 담기'가 쓴다.
 */

export type FreeLast = {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 그날 세트(순서대로) — 무게 · 횟수 */
  sets: readonly { weightKg: number | null; reps: number | null }[];
};

export type FreeSuggestion = {
  kg: number;
  /** 왜 이 무게인가 — 운동 화면이 추천 단추 밑에 한 줄로 적는다 */
  note: string;
};

/** 올리는 비율 — 프로그램(next-weight.ts ②)과 같다 */
const RAISE_BIG_LOWER = 1.05;
const RAISE_OTHER = 1.025;

function daysBetween(fromKey: string, toKey: string) {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function suggestFreeWeight(input: {
  equipment: readonly string[];
  /** 하체 큰 운동(하체 스트렝스)이면 ×1.05 */
  bigLower: boolean;
  plannedSets: number | null;
  plannedReps: number | null;
  last: FreeLast | null;
  /** 오늘 'YYYY-MM-DD' */
  todayKey: string;
}): FreeSuggestion | null {
  const kind = weightKindOf(input.equipment);
  if (kind === 'none' || !input.last) return null;

  const weighted = input.last.sets.filter(
    (s): s is { weightKg: number; reps: number | null } => (s.weightKg ?? 0) > 0
  );
  if (weighted.length === 0) return null;

  const gap = daysBetween(input.last.date, input.todayKey);
  if (gap >= LONG_BREAK_DAYS) return null;

  const top = Math.max(...weighted.map((s) => s.weightKg));
  const working = weighted.filter((s) => Math.abs(s.weightKg - top) < 0.01);
  const prev = `지난번 ${top}kg`;

  /* ③ 쉰 기간 — 낮춰서, 올리지 않는다 */
  if (gap >= 15) {
    return { kg: roundToUnit(top * 0.85, kind), note: `${gap}일 쉬어서 ${prev}보다 15% 낮췄어요` };
  }
  if (gap >= 8) {
    return { kg: roundToUnit(top * 0.9, kind), note: `${gap}일 쉬어서 ${prev}보다 10% 낮췄어요` };
  }

  /* ② 다 채웠으면 올린다 */
  const reps = input.plannedReps;
  const sets = input.plannedSets ?? 1;
  const hit =
    reps != null &&
    working.length >= sets &&
    working.every((s) => s.reps != null && s.reps >= reps);
  if (hit) {
    const ratio = input.bigLower ? RAISE_BIG_LOWER : RAISE_OTHER;
    const raised = Math.max(roundToUnit(top * ratio, kind), top + UNIT_KG[kind]);
    return {
      kg: raised,
      note: `${prev} × ${reps}회를 ${sets}세트 다 채워서 ${round1(raised - top)}kg 올렸어요`,
    };
  }
  return {
    kg: roundToUnit(top, kind),
    note:
      reps == null
        ? `${prev} 그대로예요`
        : `${prev}에서 ${reps}회 × ${sets}세트를 다 채우면 다음에 올려요`,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
