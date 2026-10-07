import {
  PLUS_RESERVE,
  TM_RATIO,
  setsNeeded,
  type ItemRx,
  type SetRx,
  type VariantKey,
  type WeightMode,
} from '@/lib/program/program';
import { MAX_E1RM_REPS, estimate1RM } from '@/lib/workout/history';
import type { FrozenExercise } from '@/lib/workout/session-plan';

/**
 * 근력 · 파워 프로그램의 무게 추천 — 순수 함수(DB 를 모른다). 설계 8 · U1.1~U1.4 · §13-10.
 * 방식은 셋(program.ts 의 WeightMode): reserve(아래 ①~⑦) · linear(스트롱리프트, ② 만 다르다) · pct(pctWeights).
 *
 *   ① 기준 W = 그 운동의 가장 최근 '보통 날' 기준 세트(가벼운 주 · 조정한 날 · 처방 세트 절반 못 한 날은 뺀다).
 *      기준 세트는 마지막 세트, 세트마다 처방이 다른 % 날은 추정 최대가 가장 큰 세트(lib/program/load.ts historyEntry)
 *   ② 올림 · 그대로 · 줄임 — 처방 횟수가 기준과 같을 때
 *        R ≥ T + 1 → 하체 큰 운동 ×1.05, 상체 · 한쪽 ×1.025
 *        R = T     → 그대로
 *        못 채움 · R < T → 그대로, 두 번 연속이면 ×0.95
 *        R 을 안 답함 → 그대로(×0.95 셈에도 안 넣는다)
 *      또는 횟수 옮기기 — 처방 횟수가 기준과 다를 때(U1.2)
 *        추정 최대 = W × (1 + (한 횟수 + R) / 30) → 새 무게 = 추정 최대 ÷ (1 + (새 횟수 + T) / 30)
 *   ③ 상한 — 한 번에 +10% 또는 +10kg 중 작은 것, 단 최소 한 단위
 *   ④ 쉰 기간 — 8~14일 ×0.9, 15~28일 ×0.85, 29일+ 는 숫자 없이(첫 회처럼)
 *   ⑤ 가벼운 주 ×0.9   ⑥ 오늘 조정 ×0.9(D19)   ⑦ 장비 단위로 반올림(U1.3)
 *
 * 오늘 화면에 보이는 값과 운동 시작 때 얼리는 값(FrozenExercise.suggestedKg)이 같은 함수에서 나온다.
 * 무게는 kg 로 셈하고, lb 로 보는 사람의 화면 반올림은 화면이 한다(roundForDisplay).
 */

export type WeightKind = 'barbell' | 'dumbbell' | 'machine' | 'none';

/** 장비 → 무게 단위(U1.3). 맨몸 · 메디신볼 · 밴드는 무게 추천이 없다. */
export function weightKindOf(equipment: readonly string[]): WeightKind {
  if (equipment.includes('바벨') || equipment.includes('원판')) return 'barbell';
  if (equipment.includes('덤벨') || equipment.includes('케틀벨')) return 'dumbbell';
  if (equipment.includes('케이블')) return 'machine';
  return 'none';
}

/** 한 단위(kg). 덤벨 · 케틀벨은 한 손 무게. */
export const UNIT_KG: Record<Exclude<WeightKind, 'none'>, number> = {
  barbell: 2.5,
  dumbbell: 2,
  machine: 2.5,
};

/** 화면 단위가 lb 일 때의 한 단위 — 원판 · 덤벨 모두 5lb */
export const UNIT_LB = 5;

export type HistoryEntry = {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 그날 처방 횟수 · 목표 여유 */
  prescribedReps: number;
  reserve: number | null;
  /** 가벼운 주였는가 */
  light: boolean;
  /** 그날 −10% · 세트 −1 조정을 했는가 */
  adjusted: boolean;
  /** 처방 세트의 절반 이상을 했는가 */
  halfDone: boolean;
  /** 기준 세트(① — 마지막 세트, % 날은 추정 최대가 가장 큰 세트) */
  lastWeightKg: number | null;
  lastReps: number | null;
  /** 기준 세트의 '몇 개 더?'(0~4, 안 답했으면 null) */
  rir: number | null;
  /** 처방 세트 모두 처방 횟수를 채웠는가 */
  hitReps: boolean;
  /** 그날 무게 방식(2026-10-07 앞에 찍은 판은 없다) — 스트롱리프트 올리기는 스트롱리프트 기록에서만 */
  mode?: WeightMode | null;
};

export type WeightInput = {
  kind: WeightKind;
  /** 하체 큰 운동이면 ×1.05, 아니면 ×1.025 */
  bigLower: boolean;
  /** 오늘 처방 */
  reps: number;
  reserve: number | null;
  light: boolean;
  /** 오늘 −10% 조정(D19) */
  adjusted: boolean;
  /** 마지막 프로그램 세션 뒤 쉰 날 수(없으면 null) */
  gapDays: number | null;
  /** 이 운동의 지난 프로그램 기록 — 순서는 상관없다(날짜로 다시 세운다) */
  history: readonly HistoryEntry[];
  /**
   * 스트롱리프트(linear) — 처방 횟수가 같을 때 '다 채우면 이만큼(kg) 올림, 같은 무게로 세 번 연속 못 채우면 −10%'.
   * 없으면 reserve 방식(② 여유로 올림).
   */
  linearStep?: number;
};

export type WeightReason =
  | { code: 'noWeight' }
  | { code: 'first'; reserve: number | null }
  | { code: 'longBreak'; days: number }
  | { code: 'raise'; prevKg: number; prevReps: number; rir: number; reserve: number }
  | { code: 'hold'; prevKg: number; prevReps: number }
  | { code: 'holdUnanswered'; prevKg: number; prevReps: number }
  | { code: 'missOnce'; prevKg: number; prevReps: number }
  | { code: 'missTwice'; prevKg: number }
  | { code: 'transfer'; prevKg: number; prevReps: number; reps: number }
  | { code: 'linearUp'; prevKg: number; step: number }
  | { code: 'linearDeload'; prevKg: number }
  | { code: 'pct'; tmKg: number };

export type WeightNote = 'cap' | 'gap10' | 'gap15' | 'light' | 'adjusted';

export type WeightSuggestion = {
  /** 추천(kg). 숫자 없이 안내하는 날은 null */
  kg: number | null;
  reason: WeightReason;
  /** 무게를 바꾼 것들 — 화면의 줄 표시 · 까닭 시트에 쓴다(§13-10) */
  notes: WeightNote[];
};

export const LONG_BREAK_DAYS = 29;

const isNormal = (e: HistoryEntry) =>
  !e.light && !e.adjusted && e.halfDone && e.lastWeightKg != null && e.lastWeightKg > 0;

/** 못 채운 날인가 — 처방 횟수를 못 채웠거나 목표보다 덜 남겼다 */
function missed(e: HistoryEntry): boolean | null {
  if (!e.hitReps) return true;
  if (e.rir == null || e.reserve == null) return null; // 모름
  return e.rir < e.reserve;
}

export function roundToUnit(kg: number, kind: WeightKind): number {
  if (kind === 'none') return kg;
  const unit = UNIT_KG[kind];
  return Math.max(unit, Math.round(kg / unit) * unit);
}

/** ④ 쉰 기간 — 8~14일 ×0.9, 15~28일 ×0.85(29일+ 는 LONG_BREAK_DAYS — 숫자 없이). reserve · linear · % 가 같이 쓴다 */
function gapFactor(gapDays: number | null): { factor: number; note: WeightNote | null } {
  if (gapDays != null && gapDays >= 15) return { factor: 0.85, note: 'gap15' };
  if (gapDays != null && gapDays >= 8) return { factor: 0.9, note: 'gap10' };
  return { factor: 1, note: null };
}

/** ⑥ 오늘 조정(D19) */
const ADJUSTED_FACTOR = 0.9;

/** 오늘 추천 */
export function suggestWeight(input: WeightInput): WeightSuggestion {
  if (input.kind === 'none')
    return { kg: null, reason: { code: 'noWeight' }, notes: [] };

  /* ④-1 한 달 넘게 쉬었으면 숫자 없이 다시 맞춘다(§13-25) */
  if (input.gapDays != null && input.gapDays >= LONG_BREAK_DAYS) {
    return { kg: null, reason: { code: 'longBreak', days: input.gapDays }, notes: [] };
  }

  const normals = input.history
    .filter(isNormal)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const base = normals[0];
  if (!base)
    return { kg: null, reason: { code: 'first', reserve: input.reserve }, notes: [] };

  const W = base.lastWeightKg as number;
  const prevReps = base.lastReps ?? base.prescribedReps;
  const unit = UNIT_KG[input.kind];
  const notes: WeightNote[] = [];
  let kg: number;
  let reason: WeightReason;

  /* 스트롱리프트는 스트롱리프트 기록(5×5 · 1×5)에서만 한 칸 올린다 — 다른 프로그램의 1×5 최고 세트를 5×5 기준으로 보지 않는다 */
  const otherMode = input.linearStep != null && base.mode !== 'linear';
  if (base.prescribedReps !== input.reps || otherMode) {
    /* ② 횟수 옮기기 — 여유를 양쪽에 넣는다(U1.2). 안 답한 여유는 그날 목표만큼 남겼다고 본다. */
    const R = base.rir ?? base.reserve ?? 0;
    const T = input.reserve ?? 0;
    const e1rm = W * (1 + (prevReps + R) / 30);
    kg = e1rm / (1 + (input.reps + T) / 30);
    reason = { code: 'transfer', prevKg: W, prevReps, reps: input.reps };
  } else if (input.linearStep != null) {
    /* 스트롱리프트 — 다 채웠으면 한 칸, 같은 무게로 세 번 연속 못 채웠으면 −10%, 아니면 그대로 */
    if (base.hitReps) {
      kg = W + input.linearStep;
      reason = { code: 'linearUp', prevKg: W, step: input.linearStep };
    } else if (
      normals.length >= 3 &&
      normals.slice(0, 3).every((e) => !e.hitReps && e.lastWeightKg === W)
    ) {
      kg = W * 0.9;
      reason = { code: 'linearDeload', prevKg: W };
    } else {
      kg = W;
      reason = { code: 'missOnce', prevKg: W, prevReps };
    }
  } else {
    const miss = missed(base);
    if (miss === null) {
      kg = W;
      reason = { code: 'holdUnanswered', prevKg: W, prevReps };
    } else if (miss) {
      const prevMiss = normals[1] ? missed(normals[1]) === true : false;
      if (prevMiss) {
        kg = W * 0.95;
        reason = { code: 'missTwice', prevKg: W };
      } else {
        kg = W;
        reason = { code: 'missOnce', prevKg: W, prevReps };
      }
    } else if ((base.rir as number) >= (base.reserve as number) + 1) {
      kg = W * (input.bigLower ? 1.05 : 1.025);
      reason = {
        code: 'raise',
        prevKg: W,
        prevReps,
        rir: base.rir as number,
        reserve: base.reserve as number,
      };
    } else {
      kg = W;
      reason = { code: 'hold', prevKg: W, prevReps };
    }
  }

  /* ③ 상한 — 올릴 때만. 한 단위보다 작게 오르면 한 단위(U1.3). 스트롱리프트 한 칸은 정해진 폭이라 상한이 없다 */
  if (kg > W && reason.code !== 'linearUp') {
    const cap = Math.min(W * 0.1, 10);
    if (kg - W > cap) {
      kg = W + cap;
      notes.push('cap');
    }
    if (roundToUnit(kg, input.kind) <= roundToUnit(W, input.kind)) {
      kg = roundToUnit(W, input.kind) + unit;
    }
  }

  /* ④ 쉰 기간 */
  const gap = gapFactor(input.gapDays);
  kg *= gap.factor;
  if (gap.note) notes.push(gap.note);
  /* ⑤ 가벼운 주 · ⑥ 오늘 조정 */
  if (input.light) {
    kg *= 0.9;
    notes.push('light');
  }
  if (input.adjusted) {
    kg *= ADJUSTED_FACTOR;
    notes.push('adjusted');
  }

  /* ⑦ 단위 반올림 — 올림이 반올림으로 사라지지 않게 위에서 이미 한 단위를 보장했다 */
  return { kg: roundToUnit(kg, input.kind), reason, notes };
}

/* ─────────────────────────── % 방식(5/3/1 · 저거넛 · 텍사스 · 프렌치 컨트라스트) ─────────────────────────── */

type SetRecord = { weightKg: number | null; reps: number | null; rir: number | null };

/**
 * 기준 무게(TM) = 세트들 중 가장 큰 추정 최대 × 0.9. 추정 최대 = 무게 × (1 + (횟수 + 남긴 개수) / 30)(위 ② 와 같은 식).
 * 기록이 없으면 null. 12회가 넘는 세트는 추정이 흐려 뺀다(MAX_E1RM_REPS).
 * ponytail: % · 스트롱리프트 세트는 '몇 개 더?'를 묻지 않아 rir 이 비어 0 으로 센다 — '+ 세트는 2개 남기고'만큼(5회에서 약 6%) 낮게 잡힌다.
 * 안전한 쪽이라 두었다. 맞추려면 얼린 목표(setTargets)의 + 세트를 PLUS_RESERVE 로 세면 된다.
 */
export function trainingMax(sets: readonly SetRecord[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (!s.weightKg || s.weightKg <= 0 || !s.reps || s.reps > MAX_E1RM_REPS) continue;
    const e1rm = s.weightKg * (1 + (s.reps + (s.rir ?? 0)) / 30);
    if (best == null || e1rm > best) best = e1rm;
  }
  return best == null ? null : best * TM_RATIO;
}

export type PctInput = {
  kind: WeightKind;
  /** 기준 무게(kg) — 4주 동안 그대로. 아직 없으면 null(첫 회는 숫자 없이) */
  tmKg: number | null;
  sets: readonly SetRx[];
  adjusted: boolean;
  gapDays: number | null;
};

/**
 * 세트마다 무게 = TM × % 를 장비 단위로. 가벼운 주는 % 에 이미 들어 있어 따로 낮추지 않는다.
 * 쉰 기간 · 오늘 조정은 reserve 방식과 같게 낮춘다. 추천(kg)은 본 세트(가장 무거운 세트).
 */
export function pctWeights(input: PctInput): {
  kgs: (number | null)[];
  suggestion: WeightSuggestion;
} {
  const none = (reason: WeightReason) => ({
    kgs: input.sets.map(() => null),
    suggestion: { kg: null, reason, notes: [] },
  });
  if (input.kind === 'none') return none({ code: 'noWeight' });
  if (input.gapDays != null && input.gapDays >= LONG_BREAK_DAYS) {
    return none({ code: 'longBreak', days: input.gapDays });
  }
  if (input.tmKg == null) return none({ code: 'first', reserve: PLUS_RESERVE });

  const notes: WeightNote[] = [];
  const gap = gapFactor(input.gapDays);
  let factor = gap.factor;
  if (gap.note) notes.push(gap.note);
  if (input.adjusted) {
    factor *= ADJUSTED_FACTOR;
    notes.push('adjusted');
  }
  const tm = input.tmKg;
  const kgs = input.sets.map((s) => roundToUnit(tm * (s.pct ?? 0) * factor, input.kind));
  return {
    kgs,
    suggestion: {
      kg: Math.max(...kgs),
      reason: { code: 'pct', tmKg: roundToUnit(tm, input.kind) },
      notes,
    },
  };
}

/** 비슷한 횟수(±3회)의 날이 사흘 이상이면, 그 날들의 가운데값보다 이만큼 넘게 큰 날은 잘못 적은 기록으로 본다 */
const TM_OUTLIER = 1.15;
const TM_SIMILAR_REPS = 3;

/**
 * 기준 무게를 정할 세트 — 시작 전 기록이 있으면 그것만, 없으면 시작한 뒤 첫날만(그 뒤 기록은 4주 동안 안 본다).
 * 추정에 못 쓰는 세트(무게 없음 · 12회 넘음)는 먼저 뺀다. 날마다 최고 추정치를 내고 그중 가장 큰 값 — 단 비슷한
 * 횟수의 날이 사흘 이상이면 그 가운데값보다 15% 넘게 큰 날(잘못 적은 세트)은 뺀다. 횟수가 다른 가벼운 날은 견주지 않는다.
 */
export function tmFromSets(
  sets: readonly (SetRecord & { date: Date })[],
  startKey: string
): number | null {
  const start = new Date(`${startKey}T00:00:00.000Z`).getTime();
  const usable = sets.filter((s) => trainingMax([s]) != null);
  const before = usable.filter((s) => s.date.getTime() < start);
  const since = usable.filter((s) => s.date.getTime() >= start).map((s) => s.date.getTime());
  const firstDay = since.length > 0 ? Math.min(...since) : null;
  const pool = before.length > 0 ? before : usable.filter((s) => s.date.getTime() === firstDay);
  /* 날마다 최고 세트(추정치 · 그 횟수) */
  const best = new Map<number, { tm: number; reps: number }>();
  for (const s of pool) {
    const tm = trainingMax([s]) as number;
    const cur = best.get(s.date.getTime());
    if (!cur || tm > cur.tm) best.set(s.date.getTime(), { tm, reps: s.reps as number });
  }
  const days = [...best.values()].sort((a, b) => b.tm - a.tm);
  if (days.length === 0) return null;
  /* 가장 큰 날부터 — 비슷한 횟수의 날이 사흘 이상이고 그 가운데값보다 15% 넘게 크면 건너뛴다 */
  for (const d of days) {
    const like = days
      .filter((x) => Math.abs(x.reps - d.reps) <= TM_SIMILAR_REPS)
      .map((x) => x.tm)
      .sort((a, b) => a - b);
    if (like.length < 3 || d.tm <= like[Math.floor(like.length / 2)] * TM_OUTLIER) return d.tm;
  }
  return days[days.length - 1].tm;
}

/** 판 하나 · 운동 하나의 기록 → 무게 추천의 기준(①) */
export function historyEntry(
  date: string,
  ex: Pick<FrozenExercise, 'plannedSets' | 'plannedReps' | 'setTargets' | 'programSlot'>,
  sets: readonly {
    setNo: number;
    weightKg: number | null;
    reps: number | null;
    rir: number | null;
  }[]
): HistoryEntry {
  const planned = ex.plannedSets ?? sets.length;
  const plannedReps = ex.plannedReps ?? 0;
  const targets = ex.setTargets ?? null;
  /* 처방 세트는 뒤쪽 — 준비 세트를 적었으면 앞에 붙는다(warmupLine 은 '적지 않아도 돼요'지만 적는 사람도 있다) */
  const working = sets.slice(-planned);
  /* 기준 세트 — 세트마다 처방이 다르면(% 방식) 추정 최대가 가장 큰 세트, 아니면 마지막 세트 */
  const e1rm = (x: (typeof sets)[number]) =>
    x.weightKg != null && x.reps != null ? (estimate1RM(x.weightKg, x.reps) ?? 0) : 0;
  const refIndex = targets
    ? working.reduce((best, x, i) => (e1rm(x) > e1rm(working[best]) ? i : best), 0)
    : working.length - 1;
  const ref = working[refIndex];
  return {
    date,
    prescribedReps: plannedReps,
    /* + 세트는 '2개 남기고'로 한 것이라 그만큼 남긴 셈이다 */
    reserve:
      ex.programSlot?.reserve ?? (targets?.[refIndex]?.plus ? PLUS_RESERVE : null),
    light: ex.programSlot?.light ?? false,
    adjusted: ex.programSlot?.adjusted ?? false,
    halfDone: sets.length >= setsNeeded(planned),
    lastWeightKg: ref.weightKg,
    lastReps: ref.reps,
    rir: ref.rir,
    hitReps:
      working.length >= planned &&
      working.every((x, i) => (x.reps ?? 0) >= (targets?.[i]?.reps ?? plannedReps)),
    mode: ex.programSlot?.mode ?? null,
  };
}

/** 스트롱리프트의 한 칸 — 덤벨은 한 손 한 단위, 데드리프트(힌지)는 5kg, 나머지 2.5kg(원본) */
export function linearStep(variant: VariantKey, kind: WeightKind): number {
  if (kind === 'dumbbell') return UNIT_KG.dumbbell;
  return variant === 'hinge' ? 5 : 2.5;
}

/** 스트롱리프트 첫 회 — '5회를 3개 남기고 들 수 있는 무게' */
const LINEAR_FIRST_RESERVE = 3;

/**
 * 처방 하나의 무게 — 카드 · 운동 시작 · 운동 중 [교체]가 같이 쓴다(U1.4).
 * pct 는 세트마다(kgs), linear · reserve 는 한 무게(모든 세트), none 은 없음.
 */
export function weighItem(
  rx: ItemRx,
  ex: { equipment: string[] },
  ctx: {
    adjusted: boolean;
    gapDays: number | null;
    history: readonly HistoryEntry[];
    tmKg: number | null;
  }
): { suggestion: WeightSuggestion | null; kgs: (number | null)[] | null } {
  const kind = weightKindOf(ex.equipment);
  if (rx.mode === 'none') return { suggestion: null, kgs: null };
  if (rx.mode === 'pct') {
    const r = pctWeights({
      kind,
      tmKg: ctx.tmKg,
      sets: rx.sets,
      adjusted: ctx.adjusted,
      gapDays: ctx.gapDays,
    });
    return { suggestion: r.suggestion, kgs: r.kgs };
  }
  const linear = rx.mode === 'linear';
  return {
    suggestion: suggestWeight({
      kind,
      bigLower: rx.slot === 'bigLower',
      reps: rx.reps,
      reserve: linear ? LINEAR_FIRST_RESERVE : rx.reserve,
      light: rx.light,
      adjusted: ctx.adjusted,
      gapDays: ctx.gapDays,
      history: ctx.history,
      ...(linear ? { linearStep: linearStep(rx.variant, kind) } : {}),
    }),
    kgs: null,
  };
}

/** lb 로 보는 사람의 화면 값 — kg 추천을 lb 로 바꿔 5lb 단위로 */
export function roundForDisplay(kg: number, unit: 'kg' | 'lb'): number {
  if (unit === 'kg') return kg;
  return Math.round((kg * 2.20462) / UNIT_LB) * UNIT_LB;
}

/* ─────────────────────────── 까닭 문구(§13-10) ─────────────────────────── */

function kgText(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)}kg`;
}

/** 까닭 시트의 한 문장 — 해요체, 줄표 없이 */
export function reasonText(s: WeightSuggestion): string {
  const r = s.reason;
  let main: string;
  switch (r.code) {
    case 'noWeight':
      main = '무게 없이 하는 운동이에요.';
      break;
    case 'first':
      main =
        r.reserve != null
          ? `처음이라 숫자 없이 가요. 이번 주는 ${r.reserve}개 남는 무게로 해요.`
          : '처음이라 숫자 없이 가요.';
      break;
    case 'longBreak':
      main = `${r.days}일 쉬었어요. 숫자 없이 다시 맞춰요.`;
      break;
    case 'raise':
      main = `지난번 ${kgText(r.prevKg)} × ${r.prevReps}에서 ${r.rir}개 남았어요(목표 ${r.reserve}). 그래서 올렸어요.`;
      break;
    case 'hold':
      main = `지난번 ${kgText(r.prevKg)} × ${r.prevReps}, 목표만큼 남았어요. 그대로 해요.`;
      break;
    case 'holdUnanswered':
      main = `지난번 ${kgText(r.prevKg)} × ${r.prevReps}. 몇 개 더 할 수 있었는지 몰라서 그대로 해요.`;
      break;
    case 'missOnce':
      main = `지난번 ${kgText(r.prevKg)}에서 목표를 못 채웠어요. 그대로 한 번 더 해요.`;
      break;
    case 'missTwice':
      main = `두 번 연속 목표를 못 채웠어요. ${kgText(r.prevKg)}에서 5% 낮췄어요.`;
      break;
    case 'transfer':
      main = `${r.prevReps}회에서 ${r.reps}회로 바뀌어 지난 기록(${kgText(r.prevKg)})으로 계산했어요.`;
      break;
    case 'linearUp':
      main = `지난번 ${kgText(r.prevKg)}에서 다 채웠어요. ${kgText(r.step)} 올렸어요.`;
      break;
    case 'linearDeload':
      main = `${kgText(r.prevKg)}를 세 번 연속 다 못 채웠어요. 10% 낮췄어요.`;
      break;
    case 'pct':
      main = `기준 무게 ${kgText(r.tmKg)}(추정 최대의 90%)에 그날 %를 곱했어요. 4주 동안 기준 무게는 그대로예요.`;
      break;
  }
  const extra: string[] = [];
  if (s.notes.includes('cap')) extra.push('한 번에 10%까지만 올려요.');
  if (s.notes.includes('gap15')) extra.push('오래 쉬어서 15% 낮췄어요.');
  if (s.notes.includes('gap10')) extra.push('쉬어서 10% 낮췄어요.');
  if (s.notes.includes('light'))
    extra.push('가벼운 주라 10% 낮췄어요. 다음 주에 돌아와요.');
  if (s.notes.includes('adjusted')) extra.push('오늘 몸 상태로 10% 낮췄어요.');
  return [main, ...extra].join(' ');
}

/** 오늘 카드 줄의 작은 표시(§13-10) — 내려간 숫자에만 */
export function weightTag(s: WeightSuggestion): string | null {
  if (s.notes.includes('adjusted')) return '−10% 오늘 컨디션';
  if (s.notes.includes('light')) return '가벼운 주';
  if (s.notes.includes('gap15') || s.notes.includes('gap10')) return '오래 쉼';
  if (s.reason.code === 'missTwice') return '−5%';
  if (s.reason.code === 'linearDeload') return '−10%';
  return null;
}
