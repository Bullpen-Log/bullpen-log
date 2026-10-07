import type { DayDetail } from '@/lib/day-detail';
import { pickCheckinBody } from '@/lib/checkin';
import { throwDayKind, type GuideSignals } from '@/lib/nutrition/guide';
import {
  trainingKindOf,
  type AdviceInput,
  type TrainingKind,
} from '@/lib/nutrition/advice';
import type { MealKey } from '@/lib/nutrition/meta';

/**
 * 읽어 온 자료 → 영양 조언의 입력(순수 — DB 없음, 시험이 돌린다). 읽는 쪽은 lib/nutrition/advice-load.ts.
 *
 * 홈 카드와 영양 탭이 같은 길로 간다: 그날 요약(lib/day-detail.ts — 먹은 합 · 목표 · 한 운동), 오늘 · 어제 체크인의 던지는 일정 ·
 * 식사 칸, 오늘 투구 기록, 트레이닝 세션의 움직인 시간. 지난 날은 조언을 하지 않으니 점수만 남는다(advice.ts).
 */

/** 서비스 기준 시각(한국)은 UTC+9(lib/pitch-stats.ts SERVICE_TIME_ZONE) */
const SERVICE_UTC_OFFSET_HOURS = 9;

/** 지금 몇 시인가(한국, 0~23) — 저녁에 "아침을 챙기세요"라고 하지 않게 */
export function serviceHour(now: Date) {
  return (now.getUTCHours() + SERVICE_UTC_OFFSET_HOURS) % 24;
}

export type CheckinSignals = {
  nutrition: string | null;
  skippedMeals: string[];
  appetite: number | null;
  soreness: number | null;
  throwPlan: string | null;
};

/** 그날 요약의 한 운동 가운데 여기서 보는 칸 */
export type ExerciseLike = {
  category: string;
  done: boolean;
  /** 유산소처럼 시간으로 적은 운동의 실제 초. 없으면 null */
  holdSecondsDone: number | null;
};

export type AssembleArgs = {
  date: string;
  today: string;
  /** 한국 시각 0~23 */
  hour: number;
  detail: {
    nutrition: DayDetail['nutrition'];
    training: { exercises: ExerciseLike[] };
  };
  checkinToday: CheckinSignals | null;
  /** 어제 체크인의 '던지는 일정'만 — '내일 등판'이면 오늘이 등판일 */
  throwPlanYesterday: string | null;
  pitches: GuideSignals['pitches'];
  /** 오늘 트레이닝 세션에서 움직인 시간(초)의 합 */
  activeSeconds: number;
};

/**
 * 오늘 한 운동을 넷으로 묶는다 — 마친 것(done)만. 유산소는 실제로 적은 시간, 나머지는 세션의 움직인 시간을 종류 수로 나눈다
 * (운동마다 시간이 없다). 한 운동이 없으면 빈 배열.
 */
export function trainingKinds(
  exercises: ExerciseLike[],
  activeSeconds: number
): AdviceInput['training'] {
  const kinds = new Map<TrainingKind, number>();
  for (const e of exercises) {
    if (!e.done) continue;
    const kind = trainingKindOf(e.category);
    if (!kind) continue;
    const seconds = kind === 'aerobic' ? (e.holdSecondsDone ?? 0) : 0;
    kinds.set(kind, (kinds.get(kind) ?? 0) + seconds);
  }
  if (kinds.size === 0) return [];
  const share = activeSeconds / 60 / kinds.size;
  return [...kinds].map(([kind, seconds]) => ({
    kind,
    minutes: Math.round(kind === 'aerobic' && seconds > 0 ? seconds / 60 : share),
  }));
}

export function assembleAdviceInput(a: AssembleArgs): AdviceInput {
  const n = a.detail.nutrition;
  const eatenMeals: Partial<Record<MealKey, number>> = {};
  for (const m of n.meals) eatenMeals[m.meal] = m.kcal;
  const logged = n.meals.length > 0;
  let checkin: AdviceInput['checkin'] = null;
  if (a.checkinToday) {
    const body = pickCheckinBody(a.checkinToday);
    checkin = {
      meals: { amount: body.nutrition, skipped: body.skippedMeals as MealKey[] },
      appetite: a.checkinToday.appetite,
      soreness: a.checkinToday.soreness,
    };
  }
  return {
    date: a.date,
    today: a.today,
    target: n.target,
    eaten: logged
      ? { kcal: n.kcal, carbs: n.carbs, protein: n.protein, fat: n.fat }
      : null,
    eatenMeals,
    body: { weightKg: n.weightKg, ageBand: n.ageBand, goal: n.goal },
    checkin,
    throwKind:
      a.date === a.today
        ? throwDayKind({
            planToday: a.checkinToday?.throwPlan ?? null,
            planYesterday: a.throwPlanYesterday,
            appetite: a.checkinToday?.appetite ?? null,
            pitches: a.pitches,
          })
        : null,
    training: trainingKinds(a.detail.training.exercises, a.activeSeconds),
    weight: null,
    hour: a.hour,
  };
}
