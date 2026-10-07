import 'server-only';
import { needsWeight } from '@/lib/exercise-meta';
import { formatPrescription } from '@/lib/exercise-meta';
import { goalPrescription } from '@/lib/report/goal-prescription';
import { SLOT_ORDER, type SlotKey, type ThemeKey } from '@/lib/report/theme';
import { orderSession } from '@/lib/report/exercise-order';
import {
  itemRx,
  lighterRx,
  parseProgram,
  withSets,
  prescriptionLine,
  readSessionProgram,
  type ItemRx,
  type SessionProgramTag,
  type SlotKind,
  type VariantKey,
  type WeightMode,
} from '@/lib/program/program';

/**
 * 세션을 시작할 때 찍어 두는 오늘 목록.
 *
 * 왜 찍어 두는가. 운동 중에 목록이 바뀌는 길이 넷 있다 — 홈에서 컨디션을
 * 고치면 안전 재검사가 다시 돌고, 통증을 입력하면 목록이 통째로 사라지고,
 * 다른 탭에서 '일정 다시 만들기'를 누르면 같은 날 줄을 덮어쓰고, 목록에서
 * 운동을 빼면 그날 기록까지 지워진다. 스쿼트 3세트 중에 화면에서 스쿼트가
 * 사라지는 일을 막는다.
 *
 * 미리보기 주소는 담지 않는다. 서명 주소는 한 시간이면 죽는데 세션은 그보다
 * 오래 열려 있을 수 있다. 경로만 담고 화면을 그릴 때마다 새로 발급한다.
 */

export type FrozenExercise = {
  id: string;
  title: string;
  category: string;
  slot: SlotKey;
  /** '3세트 × 10회 · 세트 사이 2분 휴식' 같은 한 줄. 안 채운 운동은 없다. */
  prescription: string | null;
  /** 처방 세트 수. 화면에 '3세트 중 2세트째'로 쓴다. */
  plannedSets: number | null;
  plannedReps: number | null;
  plannedHoldSeconds: number | null;
  /**
   * 세트 사이 쉬는 시간(초) — 운동 화면의 쉬는 시간 링이 이만큼에서 다 찬다. 처방 줄의
   * '세트 사이 2분 휴식'과 같은 값. 2026-10-01 에 더해, 그 앞에 찍은 판에는 없다(undefined) —
   * 그때는 라이브러리 값을 쓴다(lib/workout/run-exercises.ts).
   */
  restSeconds?: number | null;
  perSide: boolean;
  /** 바벨·덤벨처럼 무게를 안 적으면 완료로 남길 수 없는 운동인가 */
  needsWeight: boolean;
  /** 시간형 운동인가 — 횟수 대신 버틴 시간을 받는다 */
  isHold: boolean;
  equipment: string[];
  bodyParts: string[];
  intensity: string;
  thumbPath: string | null;
  /**
   * 근력 · 파워 프로그램의 칸(lib/program/program.ts) — 프로그램 날에 얼린 운동과, 그날 [교체]로 바꿔 넣은 운동(U3)에만 있다.
   * 일차 넘기기의 '처방 세트 절반' 셈과 '몇 개 더?' 물음이 이것을 본다. 프로그램이 아닌 날에는 없다(undefined).
   */
  programSlot?: FrozenProgramSlot | null;
  /** 운동 시작 때 얼린 추천 무게(kg) — 세트 기록의 '추천 담기'와 '추천 vs 실제'에 쓴다. 숫자 없이 안내하는 날은 null */
  suggestedKg?: number | null;
  /**
   * 세트마다 다른 처방(% 방식 — 5/3/1 의 65 · 75 · 85%+ 같은 것). 운동 화면이 그 세트의 무게 · 횟수를 보여 준다.
   * 2026-10-07 에 더했다. 모든 세트가 같은 날 · 그 앞에 찍은 판에는 없다.
   */
  setTargets?: SetTarget[] | null;
};

export type SetTarget = {
  reps: number;
  /** 숫자 없이 안내하는 날(기준 무게가 아직 없음)은 null */
  kg: number | null;
  /** 할 수 있는 만큼, 단 2개 남기고 */
  plus?: boolean;
};

export type FrozenProgramSlot = {
  slot: SlotKind;
  variant: VariantKey;
  /** 그 주 목표 여유(T). 파워 · 몸통은 null */
  reserve: number | null;
  light: boolean;
  /** 고정 운동 대신 그날 대체한 운동인가 — 고정 운동의 무게 흐름에 넣지 않는다(§3) */
  substitute?: boolean;
  /** 그날 −10% · 세트 −1 조정(D19)을 했는가 — 다음 추천의 기준에서 뺀다(U1.4) */
  adjusted?: boolean;
  /** 무게 방식(program.ts 의 WeightMode). 2026-10-07 앞에 찍은 판에는 없다 — 무게 칸이면 reserve 로 본다 */
  mode?: WeightMode;
  /** 앞 운동과 묶음(바로 이어서) */
  group?: boolean;
};

export type FrozenPlan = {
  themeKey: ThemeKey;
  themeLabel: string;
  /**
   * 오늘 목표(근력 향상 …) — 운동 중에 바꿔 넣는 운동도 같은 횟수로 찍으려고 둔다(goal-prescription.ts).
   * 2026-10-03 에 더했다. 그 앞에 찍은 판에는 없다(null) — 그때는 오늘 일정의 목표를 쓴다.
   */
  goal?: string | null;
  /**
   * 근력 · 파워 프로그램 날이면 그 일차(U2). 다시 열기 · 운동 중 바꾸기에서도 지켜야 일차를 한 번만 넘긴다.
   * 프로그램이 아닌 날은 없다(null).
   */
  program?: SessionProgramTag | null;
  exercises: FrozenExercise[];
};

type SourceExercise = {
  id: string;
  title: string;
  category: string;
  bodyParts: string[];
  intensity: string;
  /** 하는 차례를 정할 때 본다(lib/report/exercise-order.ts) — 없으면 보조 운동으로 친다 */
  movementPattern?: string | null;
  equipment: string[];
  sets: number | null;
  reps: number | null;
  holdSeconds: number | null;
  restSeconds: number | null;
  perSide: boolean;
  thumbPath: string | null;
};

/**
 * 운동 하나를 세션이 쓸 모양으로 찍는다.
 *
 * 시작할 때 목록 전체를 찍는 freezePlan 과, 운동 중에 바꾸거나 더하는 운동
 * (app/actions/workout.ts 의 changeSessionExercise)이 같이 쓴다. 둘이 따로
 * 찍으면 바꿔 넣은 운동만 처방 줄이나 무게 필수 여부가 다르게 나온다.
 */
export function freezeExercise(ex: SourceExercise, slot: SlotKey): FrozenExercise {
  return {
    id: ex.id,
    title: ex.title,
    category: ex.category,
    slot,
    prescription: formatPrescription(ex),
    plannedSets: ex.sets,
    plannedReps: ex.reps,
    plannedHoldSeconds: ex.holdSeconds,
    restSeconds: ex.restSeconds,
    perSide: ex.perSide,
    needsWeight: needsWeight(ex.equipment),
    /* 버티기 초가 적혀 있고 횟수가 없으면 시간형이다 */
    isHold: ex.holdSeconds != null && ex.reps == null,
    equipment: ex.equipment,
    bodyParts: ex.bodyParts,
    intensity: ex.intensity,
    thumbPath: ex.thumbPath,
  };
}

/**
 * 오늘 목록을 세션이 쓸 모양으로 찍는다.
 *
 * 구간 순서(SLOT_ORDER)로 다시 줄을 세운다. 직접 더한 운동은 배열 맨 뒤에
 * 붙기 때문에, 그대로 두면 암케어를 하고 나서 본운동을 하게 된다. 구간 안은
 * 하는 차례(lib/report/exercise-order.ts)로 — 트레이닝 화면 목록과 같다.
 */
export function freezePlan(
  themeKey: ThemeKey,
  themeLabel: string,
  picks: readonly { exerciseId: string; slot: SlotKey }[],
  byId: Map<string, SourceExercise>,
  /** 오늘 목표 — 세트 · 횟수를 목표에 맞춰 찍는다(트레이닝 화면 목록과 같은 값) */
  goal: string | null = null
): FrozenPlan {
  /* 구간 차례 다음 구간 안의 하는 차례 — 트레이닝 화면 목록과 같은 차례(lib/report/exercise-order.ts) */
  const found = picks
    .map((p) => ({ slot: p.slot, ex: byId.get(p.exerciseId) }))
    .filter((p): p is { slot: SlotKey; ex: SourceExercise } => p.ex != null);
  const exercises = orderSession(found, SLOT_ORDER).map(({ slot, ex }) =>
    freezeExercise(goalPrescription(ex, goal), slot)
  );

  return { themeKey, themeLabel, goal, exercises };
}

/** 찍어 둔 것을 다시 읽는다. 모양이 아니면 null — 옛 세션일 수 있다. */
export function readFrozenPlan(value: unknown): FrozenPlan | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<FrozenPlan>;
  if (typeof v.themeKey !== 'string' || !Array.isArray(v.exercises)) return null;
  const program = readSessionProgram(v.program);
  return {
    themeKey: v.themeKey as ThemeKey,
    themeLabel: typeof v.themeLabel === 'string' ? v.themeLabel : '오늘의 운동',
    goal: typeof v.goal === 'string' ? v.goal : null,
    exercises: v.exercises as FrozenExercise[],
    /* 프로그램 날만 붙인다 — 프로그램이 아닌 판은 예전과 똑같은 모양으로 읽는다(회귀 시험 RG) */
    ...(program ? { program } : {}),
  };
}

/**
 * 프로그램 날의 운동 하나.
 *
 * 세트 · 횟수 · 휴식은 그날 처방(lib/program/program.ts 의 ItemRx — '가볍게'면 이미 세트를 줄인 것), 처방 줄은 '4세트 × 5회 · 2개 남기고'.
 * % 방식은 세트마다 목표(setTargets)를 싣는다. 버티기(초)로 하는 운동은 처방 횟수 대신 그 운동의 시간을 그대로 쓰고 세트만 맞춘다.
 * 시작할 때(app/actions/program.ts)와 운동 중 [교체](U3)가 같이 쓴다 — 둘이 따로 찍으면 바꾼 운동만 처방이 달라진다.
 */
export function freezeProgramExercise(
  ex: SourceExercise,
  rx: ItemRx,
  opts: {
    substitute?: boolean;
    adjusted?: boolean;
    suggestedKg: number | null;
    /** 세트마다 무게(% 방식) — rx.sets 와 같은 길이 */
    kgs?: readonly (number | null)[] | null;
  }
): FrozenExercise {
  const sets = rx.sets.length;
  const isHold = ex.holdSeconds != null && ex.reps == null;
  const base = freezeExercise(
    {
      ...ex,
      sets,
      reps: isHold ? null : rx.reps,
      restSeconds: rx.restSeconds,
    },
    rx.slot === 'core' ? 'core' : 'main'
  );
  return {
    ...base,
    /* 좌우 각각은 운동 화면이 따로 붙인다(perSide) — 여기 넣으면 두 번 나온다 */
    prescription: isHold ? base.prescription : prescriptionLine(rx, { kgs: opts.kgs ?? undefined }),
    programSlot: {
      slot: rx.slot,
      variant: rx.variant,
      reserve: rx.reserve,
      light: rx.light,
      mode: rx.mode,
      ...(rx.group ? { group: true } : {}),
      ...(opts.substitute ? { substitute: true } : {}),
      ...(opts.adjusted ? { adjusted: true } : {}),
    },
    suggestedKg: opts.suggestedKg,
    ...(rx.mode === 'pct'
      ? {
          setTargets: rx.sets.map((s, i) => ({
            reps: s.reps,
            kg: opts.kgs?.[i] ?? null,
            ...(s.plus ? { plus: true } : {}),
          })),
        }
      : {}),
  };
}

/**
 * 다시 여는 판의 목록 — 그 판이 쓰던 목록을 지키고, 오늘 목록에 새로 들어온 운동만 뒤에 붙인다.
 *
 * 예전에는 오늘 일정으로 새로 찍어, 바꿔 넣은 운동(과 그 세트)이 목록에서 빠져 고치지도 지우지도 못했다
 * ('오늘 목록에 없는 운동'). 쓰던 판의 program(프로그램 일차)도 그대로 남는다(U2 — 다시 열고 다시 마쳐도 일차는 한 번).
 */
export function mergeReopened(kept: FrozenPlan | null, plan: FrozenPlan): FrozenPlan {
  if (!kept || kept.exercises.length === 0) return plan;
  return {
    ...kept,
    exercises: [
      ...kept.exercises,
      ...plan.exercises.filter((e) => !kept.exercises.some((k) => k.id === e.id)),
    ],
  };
}

/**
 * 운동 중 [교체]로 넣는 운동의 처방 — 프로그램 날의 프로그램 칸에서 바꾸면 그날 그 운동의 처방을 이어받는다(U3).
 * 세트를 남긴 뒤 바꾸면(서버가 '더하기'로 넣는다) 남은 세트만 이어 하고, 바뀐 운동의 처방 세트는 남긴 만큼으로 줄인다 —
 * 그래야 '처방 세트 절반' 셈이 늘지 않는다(§13-17). 프로그램이 아닌 날 · 프로그램 칸이 아닌 운동은 null(지금 그대로).
 */
export function programSwapRx(
  plan: FrozenPlan,
  from: FrozenExercise,
  loggedFromSets: number
): { rx: ItemRx; fromPlannedSets: number | null } | null {
  if (!plan.program || !from.programSlot) return null;
  const program = parseProgram(plan.program.key);
  const base = program ? itemRx(program, plan.program.day, from.programSlot.variant) : null;
  if (!base) return null;
  const full = from.programSlot.adjusted ? lighterRx(base) : base;
  const planned = from.plannedSets ?? full.sets.length;
  const left = loggedFromSets > 0 ? Math.max(1, planned - loggedFromSets) : planned;
  /* 남은 세트는 뒤쪽 — 5/3/1 이면 아직 안 한 무거운 세트들 */
  const rx = {
    ...withSets(full, full.sets.slice(Math.max(0, full.sets.length - left))),
    restSeconds: from.restSeconds ?? full.restSeconds,
  };
  return { rx, fromPlannedSets: loggedFromSets > 0 ? loggedFromSets : null };
}

export function programSwapEntry(
  plan: FrozenPlan,
  from: FrozenExercise,
  to: SourceExercise,
  loggedFromSets: number,
  weigh: (rx: ItemRx) => {
    suggestedKg: number | null;
    kgs?: readonly (number | null)[] | null;
  }
): { entry: FrozenExercise; fromPlannedSets: number | null } | null {
  const swap = programSwapRx(plan, from, loggedFromSets);
  if (!swap || !from.programSlot) return null;
  const entry = freezeProgramExercise(to, swap.rx, {
    substitute: true,
    adjusted: from.programSlot.adjusted,
    ...weigh(swap.rx),
  });
  return { entry, fromPlannedSets: swap.fromPlannedSets };
}
