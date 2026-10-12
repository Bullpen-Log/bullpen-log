import {
  LONG_BREAK_DAYS,
  roundToUnit,
  UNIT_KG,
  weightKindOf,
} from '@/lib/program/next-weight';
import { BEGINNER_LEVEL_NAME } from '@/lib/report/personalize';
import { YOUTH_AGE_THRESHOLD } from '@/lib/report/plan';

/**
 * 프로그램이 아닌 날의 무게 추천 — 순수 함수(DB 를 모른다). 2026-10-09 트레이닝 검토 2-⑤, 2026-10-12 트레이닝 추천 2판 P5-g 로 고침.
 *
 * 프로그램 날은 next-weight.ts 가 '몇 개 더?'(RIR)로 올리고 내린다. 자유 운동은 RIR 을 묻지 않는다 — 그래서 횟수로만 정한다
 * (이중 진행, double progression). 처방 횟수(목표 처방 · 양 조절을 거친 숫자 하나)를 횟수 범위의 위 끝으로, 그 4분의 3(올림)을
 * 아래 끝으로 본다 — 8회면 6~8회, 5회면 4~5회(repFloorOf). 검토안 2판 4-5 '무게: 올림은 2회 연속일 때, 내림은 1회로 바로'.
 *
 *   ① 기준 W = 지난번(가장 최근 세트를 남긴 날)의 가장 무거운 무게. 그 무게로 한 세트가 '본 세트'.
 *   ② 그날을 셋으로 가른다. 그날 처방은 세트 기록에 없어 오늘 처방으로 잰다(아래 ④ 만 그날 처방도 본다).
 *        채움     본 세트가 오늘 처방 세트 수 이상이고 모두 위 끝(처방 횟수) 이상
 *        못 채움  본 세트 하나라도 아래 끝 밑
 *        그 사이  범위 안이거나 세트가 모자람(시간이 없어 끊은 날) — 그대로
 *   ③ 올림 — 지난번과 그 앞 날(prev)이 같은 무게로 둘 다 채움이고 둘 사이가 8일 안이면. 하체 큰 운동 ×1.05, 그 밖 ×1.025
 *      (프로그램과 같은 비율), 적어도 한 단위. 지난번 하루만 채웠으면 그대로('한 번 더 채우면 올려요') — 한 번은 그날 컨디션일 수
 *      있고, 두 번이면 몸이 따라온 것이다. 예전(2026-10-09)에는 한 번 채우면 올렸다.
 *   ④ 내림 — 지난번이 못 채움이면 바로 ×0.95, 적어도 한 단위(가장 가벼운 단위 밑으로는 안 간다). 비율은 프로그램의 '두 번 연속
 *      못 채움'(next-weight.ts missTwice)과 같다. RIR 이 없어도 아래 끝을 못 넘긴 것은 무거웠다는 뜻이고, 내리는 쪽은 틀려도
 *      안전하다(예전에는 '힘들어서'인지 몰라 내리지 않았다). 아래 끝은 그날 처방(FreeLast.plannedReps — 그날 세션 판)과 오늘 처방
 *      중 작은 쪽으로 잰다. 그날 5회를 시켜 5회를 했는데 오늘 8회가 되었다고 '못 채움'으로 치면, 목표가 날마다 바뀌는 사람은
 *      시킨 대로 했는데도 무게가 계단처럼 내려간다(근력 5회 ↔ 기본 10회를 오가는 날). 그날 처방을 모르면 오늘 처방으로 잰다.
 *   ⑤ 쉰 기간 — 8~14일 ×0.9, 15~28일 ×0.85(올리지 않는다), 29일+ 는 숫자 없이(처음처럼). 프로그램의 ④와 같은 값.
 *   ⑥ 바꾼 무게(올림 · 내림 · 쉰 기간)는 장비 단위의 배수로(바벨 2.5 · 덤벨 2 · 머신 2.5) — 올림은 지난 무게보다 무거운 가장 가까운
 *      배수 이상(nextUnitAbove). '그대로'(한 번 채움 · 그 사이 · hold · 처방 횟수 모름 · 더 못 내림)는 지난 무게를 글자 그대로 — 세트
 *      기록은 0.5kg 단위라 바벨 61kg 이 남을 수 있는데, 예전에는 '지난번 61kg 그대로예요'라 하면서 60kg 을 내 말없이 내렸다(2판 P5 검토).
 *      맨몸 · 밴드 · 메디신볼은 추천이 없다.
 *   ⑦ hold — 양을 줄인 날(그날 일정 · 세션 판에 양 조절이 실린 날, lib/report/volume.ts holdsWeight)은 채움이어도 올리지 않고 지난번
 *      무게 그대로(2판 P5-d). 컨디션 · 잠 · 근육통 때문에 세트를 줄인 날 무게를 올리면 줄인 뜻과 반대로 간다. 내림 · 쉰 기간 낮춤은
 *      그대로 — 낮추는 쪽이라 막을 까닭이 없다. P6 의 '올림 멈춤'(⑨)은 올릴 때가 온 자리에 따로 건다.
 *      2판 P5 검토부터 세트는 그대로 두고 무게만 멈추는 날(강도만 담은 조절 — 몸 신호가 걸렸는데 줄일 세트가 없는 날)도 hold 라, 글은
 *      '오늘은 무게를 올리지 않는 날이라 …'(세트를 줄였다고 하지 않는다).
 *   ⑧ cautious — 성장기(만 16세 미만, YOUTH_AGE_THRESHOLD) · 경력 '입문'(BEGINNER_LEVEL_NAME)은 올려도 한 단위만, 운동 화면
 *      처방 줄에 '· 3개 남기고'(cautiousPrescription — free-weight-load.ts 가 붙인다). 프로그램의 '몇 개 남기고'와 같은 뜻 — 끝까지
 *      짜내지 않는다. 내림 · 그대로 · 쉰 기간은 다른 사람과 같다.
 *   ⑨ holdProgress — 영양 추세 깃발(lib/nutrition/fuel-check.ts — 지난 7일 적게 먹음 · 몸무게 감소 · 컨디션 낮음이 겹침, 2판 P6-7)이
 *      선 주에는 두 번 이어 채워 올릴 때가 와도 그대로 두고 그 까닭을 붙인다. ⑦ 과 달리 '한 번 더 채우면 올려요'(아직 올릴 때가 아님)는
 *      그대로 말한다 — 멈추는 것은 실제 올림뿐이다. 내림 · 쉰 기간 낮춤은 그대로. ⑦ 이 같이 걸리면 ⑦ 의 글이 먼저.
 *
 * 운동 시작 때 판에 얼려(FrozenExercise.suggestedKg · suggestNote) 운동 화면의 '추천 N kg 담기'가 쓴다.
 */

export type FreeLast = {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 그날 세트(순서대로) — 무게 · 횟수 */
  sets: readonly { weightKg: number | null; reps: number | null }[];
  /**
   * 그날 처방 횟수(그날 세션 판의 FrozenExercise.plannedReps, 2판 P5-g). 모르면(옛 판 · 판에 없는 운동) 없음 — 오늘 처방으로 잰다.
   * 내림(④)의 아래 끝에만 쓴다.
   */
  plannedReps?: number | null;
};

export type FreeSuggestion = {
  kg: number;
  /** 왜 이 무게인가 — 운동 화면이 추천 단추 밑에 한 줄로 적는다 */
  note: string;
};

/** 올리는 비율 — 프로그램(next-weight.ts ②)과 같다 */
const RAISE_BIG_LOWER = 1.05;
const RAISE_OTHER = 1.025;
/** 내리는 비율(④) — 프로그램의 '두 번 연속 못 채움'(next-weight.ts missTwice)과 같은 5% */
const LOWER_RATIO = 0.95;

/** 횟수 범위의 아래 끝 = 처방 횟수(위 끝)의 이만큼(올림) — 8회 → 6, 5회 → 4, 10회 → 8, 15회 → 12 */
export const REP_FLOOR_RATIO = 0.75;

/**
 * 두 번 이어 채움으로 치는 두 날 사이(③) — 쉰 기간 낮춤(⑤ 8일)과 같은 선. 그보다 벌어지면 앞 날은 쉬기 전 일이라 몸이
 * 따라왔다는 증거가 못 된다.
 */
export const STREAK_MAX_GAP_DAYS = 8;

/** 조심해서 드는 사람(⑧ 성장기 · 입문)이 세트마다 남기는 개수 — 처방 줄 꼬리 '· 3개 남기고' */
export const CAUTIOUS_RESERVE = 3;

const RESERVE_TAIL = `${CAUTIOUS_RESERVE}개 남기고`;

/** 횟수 범위의 아래 끝 — 처방 횟수의 4분의 3(올림), 적어도 1 */
export function repFloorOf(reps: number): number {
  return Math.max(1, Math.ceil(reps * REP_FLOOR_RATIO));
}

/**
 * 조심해서 들 사람인가(⑧) — 성장기(만 16세 미만) 또는 경력 '입문'. 나이를 모르면 경력만 본다.
 * 트레이닝의 성장기 선(lib/report/plan.ts YOUTH_AGE_THRESHOLD) · 입문 선(lib/report/personalize.ts)과 같은 값을 쓴다.
 */
export function liftCautious(profile: {
  age: number | null;
  trainingLevel?: string | null;
}): boolean {
  return (
    (profile.age != null && profile.age < YOUTH_AGE_THRESHOLD) ||
    profile.trainingLevel === BEGINNER_LEVEL_NAME
  );
}

/**
 * 처방 줄에 '· 3개 남기고'를 붙인다(⑧) — '3세트 × 8회 · 3개 남기고 · 세트 사이 2분 휴식'. 횟수 바로 뒤(휴식 앞)에 두어 무엇을
 * 남기는지 읽히게 한다. 이미 붙어 있으면 그대로(두 번 불러도 한 번), 줄이 없으면 없음.
 */
export function cautiousPrescription(line: string | null): string | null {
  if (line == null || line.includes(RESERVE_TAIL)) return line;
  const at = line.indexOf(' · 세트 사이 ');
  return at < 0
    ? `${line} · ${RESERVE_TAIL}`
    : `${line.slice(0, at)} · ${RESERVE_TAIL}${line.slice(at)}`;
}

function daysBetween(fromKey: string, toKey: string) {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

type WorkingSet = { weightKg: number; reps: number | null };

/** 그날의 기준 무게와 본 세트(①) — 무게를 적은 세트가 없으면 null */
function workingOf(day: FreeLast): { top: number; working: WorkingSet[] } | null {
  const weighted = day.sets.filter((s): s is WorkingSet => (s.weightKg ?? 0) > 0);
  if (weighted.length === 0) return null;
  const top = Math.max(...weighted.map((s) => s.weightKg));
  return { top, working: weighted.filter((s) => Math.abs(s.weightKg - top) < 0.01) };
}

/** 채움(②) — 본 세트가 처방 세트 수 이상이고 모두 처방 횟수 이상 */
function filled(working: readonly WorkingSet[], sets: number, reps: number): boolean {
  return (
    working.length >= sets && working.every((s) => s.reps != null && s.reps >= reps)
  );
}

/** 세션 판에서 읽은 처방 횟수는 저장된 값이라 다시 본다 — 양의 정수가 아니면 모르는 것으로 */
function knownReps(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

export function suggestFreeWeight(input: {
  equipment: readonly string[];
  /** 하체 큰 운동(하체 스트렝스)이면 ×1.05 */
  bigLower: boolean;
  plannedSets: number | null;
  plannedReps: number | null;
  last: FreeLast | null;
  /** 그 앞에 세트를 남긴 날(last 보다 앞) — 두 번 이어 채웠는지 본다(③). 없으면 지난번 하루뿐이라 올리지 않는다 */
  prev?: FreeLast | null;
  /** 오늘 'YYYY-MM-DD' */
  todayKey: string;
  /** 양을 줄인 날인가(⑦) — 다 채웠어도 올리지 않는다. 안 주면 보통 날 */
  hold?: boolean;
  /** 조심해서 들 사람인가(⑧, liftCautious) — 올려도 한 단위만. 안 주면 보통 */
  cautious?: boolean;
  /**
   * 올림 멈춤의 까닭(⑨, 2판 P6-7) — 영양 추세 깃발(lib/nutrition/fuel-check.ts FUEL_HOLD_TEXT)이 선 주에 넘긴다. 두 번 이어 채워 올릴
   * 때가 와도 그대로 두고 이 글을 붙인다. 안 주거나 빈 글이면 보통.
   */
  holdProgress?: string;
}): FreeSuggestion | null {
  const kind = weightKindOf(input.equipment);
  if (kind === 'none' || !input.last) return null;

  const last = workingOf(input.last);
  if (!last) return null;

  const gap = daysBetween(input.last.date, input.todayKey);
  if (gap >= LONG_BREAK_DAYS) return null;

  const { top, working } = last;
  const unit = UNIT_KG[kind];
  const prev = `지난번 ${top}kg`;

  /* ⑤ 쉰 기간 — 낮춰서, 올리지 않는다 */
  if (gap >= 15) {
    return { kg: roundToUnit(top * 0.85, kind), note: `${gap}일 쉬어서 ${prev}보다 15% 낮췄어요` };
  }
  if (gap >= 8) {
    return { kg: roundToUnit(top * 0.9, kind), note: `${gap}일 쉬어서 ${prev}보다 10% 낮췄어요` };
  }

  const reps = input.plannedReps;
  const sets = input.plannedSets ?? 1;
  if (reps == null) return { kg: top, note: `${prev} 그대로예요` };

  /* ④ 못 채움 — 바로 내린다. 아래 끝은 그날 처방과 오늘 처방 중 작은 쪽으로(머리 주석) */
  const floor = repFloorOf(Math.min(knownReps(input.last.plannedReps) ?? reps, reps));
  if (working.some((s) => s.reps != null && s.reps < floor)) {
    const lowered = roundToUnit(Math.min(top * LOWER_RATIO, top - unit), kind);
    if (lowered < top) {
      return {
        kg: lowered,
        note: `${prev}에서 ${floor}회가 안 된 세트가 있어 ${round1(top - lowered)}kg 낮췄어요`,
      };
    }
    /* 가장 가벼운 단위 — 더 내릴 무게가 없다 */
    return {
      kg: top,
      note: `${prev}에서 ${floor}회가 안 된 세트가 있었어요. 더 낮출 무게가 없어 그대로예요`,
    };
  }

  /* ③ 채움 */
  if (filled(working, sets, reps)) {
    if (input.hold) {
      /* ⑦ 양을 줄인 날 — 올릴 만큼 채웠어도 그대로. 다음 보통 날에 다시 본다(P6 의 올림 멈춤은 아래 ⑨) */
      return {
        kg: top,
        note: `오늘은 무게를 올리지 않는 날이라 ${prev} 그대로예요`,
      };
    }
    const earlier = input.prev ?? null;
    const before = earlier ? workingOf(earlier) : null;
    const twice =
      earlier != null &&
      before != null &&
      earlier.date < input.last.date &&
      daysBetween(earlier.date, input.last.date) < STREAK_MAX_GAP_DAYS &&
      Math.abs(before.top - top) < 0.01 &&
      filled(before.working, sets, reps);
    if (!twice) {
      return {
        kg: top,
        note: `${prev} × ${reps}회를 ${sets}세트 다 채웠어요. 한 번 더 채우면 올려요`,
      };
    }
    if (input.holdProgress) {
      /* ⑨ 올림 멈춤 — 올릴 때가 왔지만 먹는 양 · 몸무게 · 컨디션이 함께 낮은 주라 그대로(성장기 · 입문의 한 단위도 멈춘다) */
      return {
        kg: top,
        note: `${prev} × ${reps}회를 ${sets}세트 두 번 이어 채웠어요. ${input.holdProgress}`,
      };
    }
    const done = `${top}kg × ${reps}회 ${sets}세트를 두 번 이어 채워서`;
    if (input.cautious) {
      /* ⑧ 성장기 · 입문 — 한 단위만 */
      const raised = nextUnitAbove(top, unit);
      return {
        kg: raised,
        note: `${done} ${round1(raised - top)}kg만 올렸어요. ${CAUTIOUS_RESERVE}개는 남기고 멈춰요`,
      };
    }
    const ratio = input.bigLower ? RAISE_BIG_LOWER : RAISE_OTHER;
    const raised = Math.max(roundToUnit(top * ratio, kind), nextUnitAbove(top, unit));
    return { kg: raised, note: `${done} ${round1(raised - top)}kg 올렸어요` };
  }

  /* 그 사이 — 범위 안이거나 세트가 모자란 날. 그대로 */
  return {
    kg: top,
    note: `${prev}에서 ${reps}회 × ${sets}세트를 두 번 이어 채우면 올려요`,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * top 보다 무거운 가장 가까운 단위 배수(⑥) — 바벨 60 → 62.5, 61 → 62.5, 61.5 → 62.5, 덤벨 21 → 22. 세트 기록은 0.5kg 단위라 단위 밖 무게가
 * 남는다(바벨 61kg). 예전 top + unit 은 63.5kg 처럼 장비로 못 만드는 무게를 냈다(2판 P5 검토). top 이 단위 배수면 top + unit 과 같다.
 */
function nextUnitAbove(top: number, unit: number): number {
  return Math.round((Math.floor(top / unit + 1e-9) + 1) * unit * 100) / 100;
}
