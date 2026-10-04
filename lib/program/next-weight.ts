/**
 * 근력 · 파워 프로그램의 무게 추천 — 순수 함수(DB 를 모른다). 설계 8 · U1.1~U1.4 · §13-10.
 *
 *   ① 기준 W = 그 운동의 가장 최근 '보통 날' 마지막 세트(가벼운 주 · 조정한 날 · 처방 세트 절반 못 한 날은 뺀다)
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
  /** 마지막 세트 */
  lastWeightKg: number | null;
  lastReps: number | null;
  /** 마지막 세트 뒤 '몇 개 더?'(0~4, 안 답했으면 null) */
  rir: number | null;
  /** 처방 세트 모두 처방 횟수를 채웠는가 */
  hitReps: boolean;
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
  | { code: 'transfer'; prevKg: number; prevReps: number; reps: number };

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

  if (base.prescribedReps !== input.reps) {
    /* ② 횟수 옮기기 — 여유를 양쪽에 넣는다(U1.2). 안 답한 여유는 그날 목표만큼 남겼다고 본다. */
    const R = base.rir ?? base.reserve ?? 0;
    const T = input.reserve ?? 0;
    const e1rm = W * (1 + (prevReps + R) / 30);
    kg = e1rm / (1 + (input.reps + T) / 30);
    reason = { code: 'transfer', prevKg: W, prevReps, reps: input.reps };
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

  /* ③ 상한 — 올릴 때만. 한 단위보다 작게 오르면 한 단위(U1.3) */
  if (kg > W) {
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
  if (input.gapDays != null && input.gapDays >= 15) {
    kg *= 0.85;
    notes.push('gap15');
  } else if (input.gapDays != null && input.gapDays >= 8) {
    kg *= 0.9;
    notes.push('gap10');
  }
  /* ⑤ 가벼운 주 · ⑥ 오늘 조정 */
  if (input.light) {
    kg *= 0.9;
    notes.push('light');
  }
  if (input.adjusted) {
    kg *= 0.9;
    notes.push('adjusted');
  }

  /* ⑦ 단위 반올림 — 올림이 반올림으로 사라지지 않게 위에서 이미 한 단위를 보장했다 */
  return { kg: roundToUnit(kg, input.kind), reason, notes };
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
  return null;
}
