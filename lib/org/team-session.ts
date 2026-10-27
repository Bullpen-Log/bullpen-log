/**
 * 팀 훈련 — 전체 → 조 → 예외(2026-10-27, docs/designs/sinker-team-lesson-contract.md 11절)의 순수 규칙. 저장은 lib/org/team-session-store.ts.
 *
 * 코치는 훈련 하나를 한 번 확인하고(조 실제), 다르게 한 선수만 고친다(예외). 선수 한 명의 실제는 이 파일의 memberWork 하나가 정한다 —
 * 그 결과만 선수 개인 기록(코치 세트 · 투구 기록)이 되고, 부하 · 요약은 지금처럼 그 기록에서 다시 셈한다(팀 훈련용 부하 계산은 따로 없다).
 * - 계획 · 명단만으로는 아무 기록도 안 생긴다(확인을 눌러야).
 * - 예외의 '줄임' · '다른 운동'은 그 선수가 실제로 한 값이다(조 실제를 고쳐도 안 흔들린다).
 * - 무게는 조 공통으로 적지 않는다 — 예외 줄에서만.
 * - 일정에 이은 선수 기록이 있는 운동은 선수 기록으로 맞추고(코치 세트 안 씀), 안 이은 같은 날 같은 운동은 합치지 않고 '확인 필요'로 보류한다.
 */
import type { HomeworkItem } from '@/lib/org/homework';
import { readEffortInput } from '@/lib/pitch-effort';
import type { OrgSet, OrgWorkItem } from '@/lib/org/team-work';

export const PLAN_SCOPES = ['all', 'group', 'member'] as const;
export type PlanScope = (typeof PLAN_SCOPES)[number];
export const PLAN_SCOPE_LABEL: Record<PlanScope, string> = { all: '전체', group: '조', member: '개인' };
export const isPlanScope = (v: unknown): v is PlanScope => PLAN_SCOPES.includes(v as PlanScope);

export const VALUE_MODES = ['shared', 'individual'] as const;
export type ValueMode = (typeof VALUE_MODES)[number];
export const isValueMode = (v: unknown): v is ValueMode => VALUE_MODES.includes(v as ValueMode);

export const EXCEPTION_KINDS = ['absent', 'reduced', 'substitute'] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];
export const EXCEPTION_LABEL: Record<ExceptionKind, string> = { absent: '빠짐', reduced: '줄임', substitute: '다른 운동' };

export const WORK_STATUSES = ['recorded', 'reconciled', 'needs_check', 'blocked', 'failed', 'absent'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];
export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  recorded: '기록함',
  reconciled: '내 기록으로 맞춤',
  needs_check: '확인 필요',
  blocked: '남길 수 없음',
  failed: '저장 실패',
  absent: '빠짐',
};
export const WORK_REASON_LABEL: Record<string, string> = {
  not_linked: '앱 연결 대기',
  training_private: '트레이닝 비공개',
  pitch_private: '투구 비공개',
  left: '팀을 떠남',
  write_failed: '저장 실패 — 다시 보내 주세요',
  no_pitch: '투구 수 안 적음',
};

export const NOTE_MAX = 80;
export const LINES_MAX = 10;
export const MAX_PITCH_COUNT = 500;

/** 처방 한 줄 — 숙제 · 메뉴와 같은 모양 + 예외 줄에서만 무게 */
export type WorkLine = HomeworkItem & { weightKg?: number };

export type SessionPlan = {
  id: string;
  title: string;
  scope: PlanScope;
  groupName: string | null;
  memberIds: readonly string[];
  replacesPlanId: string | null;
  valueMode: ValueMode;
  position: number;
  items: readonly WorkLine[];
  /** 조 실제 — 없으면 계획(items) 그대로 */
  actualItems: readonly WorkLine[] | null;
};

export type ExceptionItem = { planId: string; kind: ExceptionKind; items?: WorkLine[]; note?: string };
export type MemberException = { items: ExceptionItem[]; extra: { items: WorkLine[]; note?: string }[]; separate: string[] };
export type PitchValue = { planId: string; pitchCount: number; effortPct: number; maxVelocity: number | null };

export type Defaults = ReadonlyMap<string, { sets: number | null; reps: number | null; holdSeconds: number | null }>;

const EMPTY_EXCEPTION: MemberException = { items: [], extra: [], separate: [] };

/* ── 명단 · 대상 ── */

/** 활동의 대상 — 담은 명단이 비면 훈련 명단 모두(전체 · 옛 메뉴), 있으면 그 가운데 훈련 명단에 있는 사람(조 · 개인) */
export function planTargets(plan: Pick<SessionPlan, 'memberIds'>, roster: readonly string[]): string[] {
  return plan.memberIds.length === 0 ? [...roster] : roster.filter((id) => plan.memberIds.includes(id));
}

/** 이 선수가 할 활동(차례대로) — 그 선수의 개인 '바꾸기'가 대신하는 조 활동은 뺀다 */
export function memberPlans<P extends SessionPlan>(plans: readonly P[], roster: readonly string[], memberId: string): P[] {
  const mine = plans.filter((p) => planTargets(p, roster).includes(memberId));
  const replaced = new Set(mine.filter((p) => p.scope === 'member' && p.replacesPlanId).map((p) => p.replacesPlanId!));
  return mine.filter((p) => !replaced.has(p.id)).sort((a, b) => a.position - b.position);
}

/* ── 처방 → 세트 ── */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** 처방 줄을 화면에 보일 값으로 채움(세트 · 횟수 · 초가 비면 라이브러리 기본값) — 조 실제를 미리 채울 때 */
export function resolveLines(lines: readonly WorkLine[], defaults: Defaults): WorkLine[] {
  return lines.map((l) => {
    if (!l.exerciseId) return { ...l };
    const d = defaults.get(l.exerciseId);
    const sets = clamp(l.sets ?? d?.sets ?? 1, 1, 10);
    const hold = l.holdSec ?? (l.reps ? undefined : (d?.holdSeconds ?? undefined));
    const reps = l.reps ?? (hold ? undefined : (d?.reps ?? undefined));
    return { ...l, sets, ...(reps ? { reps } : { reps: undefined }), ...(hold ? { holdSec: hold } : { holdSec: undefined }) };
  });
}

/** 처방 줄 → 코치 세트(운동만 — 드릴은 세트가 아니다). 같은 운동이 여러 줄이면 세트를 이어 붙인다(서로 다른 활동의 같은 운동은 둘 다 실제) */
export function linesToWork(lines: readonly WorkLine[], defaults: Defaults): OrgWorkItem[] {
  const out = new Map<string, OrgSet[]>();
  for (const l of resolveLines(lines, defaults)) {
    if (!l.exerciseId || !defaults.has(l.exerciseId)) continue;
    const set: OrgSet = { weightKg: l.weightKg ?? null, reps: l.reps ?? null, holdSeconds: l.holdSec ?? null };
    const list = [...(out.get(l.exerciseId) ?? []), ...Array.from({ length: l.sets ?? 1 }, () => ({ ...set }))];
    out.set(l.exerciseId, list.slice(0, 20));
  }
  return [...out].map(([exerciseId, sets]) => ({ exerciseId, sets }));
}

export const drillIdsOf = (lines: readonly WorkLine[]) => lines.map((l) => l.guideId).filter((x): x is string => !!x);

/* ── 선수 한 명의 실제 ── */

export type MemberWorkInput = {
  memberId: string;
  roster: readonly string[];
  plans: readonly SessionPlan[];
  exception: MemberException | null;
  values: readonly PitchValue[];
  defaults: Defaults;
  /** 선수가 이 훈련에 이은 제 세트의 운동 */
  linked: ReadonlySet<string>;
  /** 선수가 그날 따로 남긴(어느 일정에도 안 이은) 제 세트의 운동 */
  sameDay: ReadonlySet<string>;
  hasUser: boolean;
  active: boolean;
  canTrain: boolean;
  canPitch: boolean;
};

export type MemberWork = {
  status: WorkStatus;
  reasons: string[];
  /** 개인 기록에 쓸 코치 세트(맞춤 · 보류한 운동은 뺌) */
  work: OrgWorkItem[];
  /** 개인 기록에 쓸 투구(값을 선수마다 받는 활동) */
  pitch: PitchValue[];
  /** 투구를 받는 이 선수의 활동 — 값이 없으면 그 활동의 옛 투구 줄을 지운다 */
  pitchPlanIds: string[];
  drills: string[];
  reconciled: string[];
  held: string[];
  /** 코치 세트를 건드려도 되나(가입 · 트레이닝 공유 · 팀에 있음) — 아니면 지금 기록을 그대로 둔다 */
  writeTraining: boolean;
  writePitch: boolean;
};

export function memberWork(a: MemberWorkInput): MemberWork {
  const ex = a.exception ?? EMPTY_EXCEPTION;
  const plans = memberPlans(a.plans, a.roster, a.memberId);
  const byPlan = new Map(ex.items.map((i) => [i.planId, i]));
  const lines: WorkLine[] = [];
  const drills: string[] = [];
  const pitch: PitchValue[] = [];
  const pitchPlanIds: string[] = [];
  const reasons: string[] = [];
  let absent = 0;
  for (const p of plans) {
    const e = byPlan.get(p.id);
    if (p.valueMode === 'individual') pitchPlanIds.push(p.id);
    if (e?.kind === 'absent') {
      absent += 1;
      continue;
    }
    const use = e && (e.kind === 'reduced' || e.kind === 'substitute') ? (e.items ?? []) : (p.actualItems ?? p.items);
    drills.push(...drillIdsOf(use));
    lines.push(...use);
    /* 투구는 선수마다 적은 값만 — 조 공통값이 없다(같은 투구 수를 조 전체에 넣는 길이 없다) */
    if (p.valueMode === 'individual') {
      const v = a.values.find((x) => x.planId === p.id);
      if (v && v.pitchCount > 0) pitch.push(v);
      else reasons.push('no_pitch');
    }
  }
  for (const x of ex.extra) {
    lines.push(...x.items);
    drills.push(...drillIdsOf(x.items));
  }
  const absentAll = plans.length > 0 && absent === plans.length && ex.extra.length === 0;
  const all = linesToWork(lines, a.defaults);
  const reconciled = all.filter((w) => a.linked.has(w.exerciseId)).map((w) => w.exerciseId);
  const held = all.filter((w) => !a.linked.has(w.exerciseId) && a.sameDay.has(w.exerciseId) && !ex.separate.includes(w.exerciseId)).map((w) => w.exerciseId);
  let work = all.filter((w) => !reconciled.includes(w.exerciseId) && !held.includes(w.exerciseId));

  if (!a.active || !a.hasUser) {
    return {
      status: 'blocked',
      reasons: [a.active ? 'not_linked' : 'left'],
      work: [],
      pitch: [],
      pitchPlanIds,
      drills,
      reconciled: [],
      held: [],
      writeTraining: false,
      writePitch: false,
    };
  }
  let writeTraining = true;
  let writePitch = true;
  if (!a.canTrain) {
    writeTraining = false;
    if (all.length) reasons.push('training_private');
    work = [];
  }
  let keptPitch = pitch;
  if (!a.canPitch) {
    writePitch = false;
    if (pitch.length) reasons.push('pitch_private');
    keptPitch = [];
  }
  const status: WorkStatus = absentAll
    ? 'absent'
    : held.length && writeTraining
      ? 'needs_check'
      : !work.length && !keptPitch.length && !reconciled.length && reasons.some((r) => r === 'training_private' || r === 'pitch_private')
        ? 'blocked'
        : reconciled.length && writeTraining
          ? 'reconciled'
          : 'recorded';
  return {
    status,
    reasons: [...new Set(reasons)],
    work: absentAll ? [] : work,
    pitch: absentAll ? [] : keptPitch,
    pitchPlanIds,
    drills: absentAll ? [] : [...new Set(drills)],
    reconciled: writeTraining ? reconciled : [],
    held: writeTraining ? held : [],
    writeTraining,
    writePitch,
  };
}

/** 쓸 내용의 지문 — 같으면 다시 안 쓴다(다시 보내기 · 다시 확인) */
export function workHash(w: Pick<MemberWork, 'work' | 'pitch' | 'pitchPlanIds' | 'writeTraining' | 'writePitch'>): string {
  return stable({ w: w.work, p: w.pitch, pp: w.pitchPlanIds, t: w.writeTraining, q: w.writePitch });
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** 예외의 '줄임'이 새 조 실제와 같아졌나 — 코치 화면에 '예외를 풀까요' */
export function sameAsGroup(e: ExceptionItem, plan: Pick<SessionPlan, 'items' | 'actualItems'>, defaults: Defaults): boolean {
  if (e.kind !== 'reduced' || !e.items) return false;
  return stable(linesToWork(e.items, defaults)) === stable(linesToWork(plan.actualItems ?? plan.items, defaults));
}

/* ── 들어온 값 거르기 ── */

const num = (v: unknown, min: number, max: number, int: boolean): number | undefined => {
  const n = typeof v === 'number' ? v : v == null || v === '' ? NaN : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return int ? Math.round(n) : Math.round(n * 10) / 10;
};

export type Known = { exercises: ReadonlySet<string>; guides: ReadonlySet<string> };

/** 처방 줄 거르기 — 아는 운동 · 드릴만, 세트 1~10 · 횟수 1~200 · 초 1~600 · 무게(allowWeight 일 때만) 0.5~500 */
export function cleanLines(raw: unknown, known: Known, allowWeight: boolean): WorkLine[] | { error: string } {
  if (!Array.isArray(raw)) return { error: '운동을 다시 골라 주세요.' };
  if (raw.length > LINES_MAX) return { error: `운동은 ${LINES_MAX}개까지예요.` };
  const out: WorkLine[] = [];
  for (const r of raw) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const exerciseId = typeof o.exerciseId === 'string' && known.exercises.has(o.exerciseId) ? o.exerciseId : undefined;
    const guideId = !exerciseId && typeof o.guideId === 'string' && known.guides.has(o.guideId) ? o.guideId : undefined;
    if (!exerciseId && !guideId) return { error: '없는 운동이 섞여 있어요. 다시 골라 주세요.' };
    const note = typeof o.note === 'string' ? o.note.trim().slice(0, NOTE_MAX) : '';
    const sets = num(o.sets, 1, 10, true);
    const reps = num(o.reps, 1, 200, true);
    const holdSec = num(o.holdSec, 1, 600, true);
    const weightKg = allowWeight ? num(o.weightKg, 0.5, 500, false) : undefined;
    out.push({
      ...(exerciseId ? { exerciseId } : { guideId }),
      ...(sets ? { sets } : {}),
      ...(reps ? { reps } : {}),
      ...(holdSec ? { holdSec } : {}),
      ...(weightKg ? { weightKg } : {}),
      ...(note ? { note } : {}),
    });
  }
  return out;
}

/** 선수 예외 거르기 — 이 훈련 활동만, 활동마다 하나, '줄임' · '다른 운동'은 줄이 있어야 */
export function cleanException(raw: unknown, planIds: readonly string[], known: Known): MemberException | null | { error: string } {
  if (raw == null) return null;
  const o = (typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const items: ExceptionItem[] = [];
  for (const r of Array.isArray(o.items) ? o.items : []) {
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (typeof x.planId !== 'string' || !planIds.includes(x.planId)) return { error: '없는 활동이 섞여 있어요.' };
    if (!EXCEPTION_KINDS.includes(x.kind as ExceptionKind)) return { error: '예외 종류를 골라 주세요.' };
    if (items.some((i) => i.planId === x.planId)) return { error: '한 활동에 예외는 하나예요.' };
    const kind = x.kind as ExceptionKind;
    const note = typeof x.note === 'string' ? x.note.trim().slice(0, NOTE_MAX) : '';
    if (kind === 'absent') {
      items.push({ planId: x.planId, kind, ...(note ? { note } : {}) });
      continue;
    }
    const lines = cleanLines(x.items, known, true);
    if ('error' in lines) return lines;
    if (!lines.length) return { error: '실제로 한 운동을 적어 주세요.' };
    items.push({ planId: x.planId, kind, items: lines, ...(note ? { note } : {}) });
  }
  const extra: MemberException['extra'] = [];
  for (const r of Array.isArray(o.extra) ? o.extra.slice(0, 3) : []) {
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const lines = cleanLines(x.items, known, true);
    if ('error' in lines) return lines;
    if (!lines.length) continue;
    const note = typeof x.note === 'string' ? x.note.trim().slice(0, NOTE_MAX) : '';
    extra.push({ items: lines, ...(note ? { note } : {}) });
  }
  const separate = Array.isArray(o.separate) ? [...new Set(o.separate.filter((x): x is string => typeof x === 'string' && known.exercises.has(x)))] : [];
  if (!items.length && !extra.length && !separate.length) return null;
  return { items, extra, separate };
}

/** 예외 읽기(DB Json) — 모양이 틀리면 빈 예외 */
export function readException(raw: unknown): MemberException | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const items = (Array.isArray(o.items) ? o.items : []).filter(
    (x): x is ExceptionItem => !!x && typeof x === 'object' && typeof (x as ExceptionItem).planId === 'string' && EXCEPTION_KINDS.includes((x as ExceptionItem).kind)
  );
  const extra = (Array.isArray(o.extra) ? o.extra : []).filter((x): x is MemberException['extra'][number] => !!x && typeof x === 'object' && Array.isArray((x as { items?: unknown }).items));
  const separate = Array.isArray(o.separate) ? o.separate.filter((x): x is string => typeof x === 'string') : [];
  return items.length || extra.length || separate.length ? { items, extra, separate } : null;
}

/** 선수마다 값(투구) 거르기 — 투구를 받는 활동만, 투구 수 1~500 · 체감 강도(필수, lib/pitch-effort.ts) · 구속 30~200(투구 기록 API · createPitchLogs 와 같은 선) */
export function cleanValues(raw: unknown, individualPlanIds: readonly string[]): PitchValue[] | { error: string } {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return { error: '투구 수를 다시 적어 주세요.' };
  const out: PitchValue[] = [];
  for (const r of raw) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (typeof o.planId !== 'string' || !individualPlanIds.includes(o.planId)) return { error: '투구를 받는 활동이 아니에요.' };
    if (o.pitchCount == null || o.pitchCount === '') continue;
    const pitchCount = num(o.pitchCount, 1, MAX_PITCH_COUNT, true);
    if (!pitchCount) return { error: `투구 수는 1~${MAX_PITCH_COUNT}구로 적어 주세요.` };
    const effort = readEffortInput({ effortPct: o.effortPct }, false);
    if ('error' in effort || effort.effortPct == null) return { error: '던진 공이 있으면 강도도 골라 주세요.' };
    const effortPct = effort.effortPct;
    const maxVelocity = o.maxVelocity == null || o.maxVelocity === '' ? null : (num(o.maxVelocity, 30, 200, false) ?? NaN);
    if (Number.isNaN(maxVelocity)) return { error: '구속은 30~200km/h 사이로 적어 주세요.' };
    out.push({ planId: o.planId, pitchCount, effortPct, maxVelocity: maxVelocity as number | null });
  }
  return out;
}

export function readValues(raw: unknown): PitchValue[] {
  return (Array.isArray(raw) ? raw : []).filter(
    (x): x is PitchValue => !!x && typeof x === 'object' && typeof (x as PitchValue).planId === 'string' && typeof (x as PitchValue).pitchCount === 'number'
  );
}

/** 투구 기록 열쇠 — 같은 훈련 · 활동이면 다시 보내도 한 줄 */
export const teamPitchKey = (eventId: string, planId: string) => `team:${eventId}:${planId}`;

/** 확인 단추의 요약 — 같음 n · 예외 m(빠짐 포함) */
export function confirmSummary(roster: readonly string[], exceptions: ReadonlyMap<string, MemberException | null>): { same: number; exceptions: number } {
  const ex = roster.filter((id) => {
    const e = exceptions.get(id);
    return !!e && (e.items.length > 0 || e.extra.length > 0);
  }).length;
  return { same: roster.length - ex, exceptions: ex };
}
