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
import { hasOrgLoadFields, orgLoadFieldsError, readOrgLoadFields, type OrgLoadFields, type OrgSet, type OrgWorkItem } from '@/lib/org/team-work';
import { normalizeSetLoad } from '@/lib/workout/load/recorded';
import { describeLoad } from '@/lib/workout/load/describe';
import {
  BAND_ROLE_LABEL,
  acceptsBand,
  acceptsMass,
  massFieldLabel,
  type BandRole,
  type LoadMode,
  type MassBasis,
  type RecordingContract,
} from '@/lib/workout/load/contract';

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
  /* EX-LOAD01 R1-03 — 무게 · 수량 검사에 걸려 아무것도 안 썼다(어느 운동 · 세트인지는 loadIssue 한 줄) */
  load_rejected: '무게 · 수량을 고쳐 주세요',
  /* v2 판이라 코치 세트를 쓰지 않고 복구함에 남겼다(선수 기록과 맞추기 전) */
  v2_deferred: '선수 기록과 맞추기 전',
};

export const NOTE_MAX = 80;
export const LINES_MAX = 10;
export const MAX_PITCH_COUNT = 500;

/**
 * 처방 한 줄 — 숙제 · 메뉴와 같은 모양 + 예외 줄에서만 무게. EX-LOAD01 R1-03 — 예외 줄(선수가 실제로 한 값)은 무게 기록 칸(OrgLoadFields — 밴드 ·
 * 섞인 무게 · 서로 다른 무게 · 기구 이름)도 운동 화면의 세트와 같은 약속으로 실을 수 있다. 없으면 kg 숫자만(옛 길).
 */
export type WorkLine = HomeworkItem & { weightKg?: number } & OrgLoadFields;

/* ── EX-LOAD01 R1-03 — 처방 줄 운동의 기록 계약(권위: 서버가 라이브러리로 푼 것) ── */

/**
 * 처방 줄 운동의 기록 계약 요약 — 서버가 지금 라이브러리 장비 · 검토 예외로 푼 계약(lib/workout/load/contract.ts)을 화면에 싣는다.
 * 웹 · 앱 코치 화면은 kg 칸 · kg 표시를 이것으로만 정한다(화면이 가진 장비로 짐작하지 않는다). 처방은 계획 · 목표이고, 실제 세트는 코치 기록으로
 * 쓸 때 그 선수 판의 얼린 계약으로 다시 검사한다(lib/org/team-work-core.ts).
 */
export type LineLoadInfo = {
  mode: LoadMode;
  /** kg 숫자를 받는가(섞인 무게는 무게 성분) */
  mass: boolean;
  /** 무게 칸 이름 — '무게(한 손 · 한 개)' · '케이블 설정값'. mass 일 때만 */
  label: string | null;
  basis: MassBasis | null;
  /** 밴드를 받는가(밴드 · 섞인 무게) — 코치 칸은 밴드를 적지 않는다(선수가 운동 화면에서 고른다) */
  band: boolean;
  bandRole: BandRole | null;
  /** 둘 중 하나를 고르는 운동의 변형 */
  variants: ('band' | 'mass')[] | null;
  /** 판단에 쓴 장비 */
  equipment: string[];
};

export function lineLoadOf(c: RecordingContract, displayApparatus?: (name: string) => string): LineLoadInfo {
  const mass = acceptsMass(c);
  return {
    mode: c.mode,
    mass,
    label: mass ? massFieldLabel(c, displayApparatus) : null,
    basis: c.massBasis,
    band: acceptsBand(c),
    bandRole: c.bandRole,
    variants: c.variants ? c.variants.map((v) => v.key) : null,
    equipment: [...c.sourceEquipment],
  };
}

/** kg 뒤에 붙일 짧은 뜻 — 한 손인지 봉 포함인지 기구 설정값인지 */
const BASIS_SHORT: Record<MassBasis, string> = {
  barbellTotal: '봉 포함',
  perImplement: '한 손',
  platesHeld: '원판 합',
  implement: '도구',
  stackSetting: '기구 설정값',
  added: '더한 무게',
};

/** 무게 칸이 없을 때 그 운동을 무엇으로 적는지 한마디(화면 보조 글) */
export function lineLoadHint(info: LineLoadInfo | null | undefined): string | null {
  if (!info) return null;
  switch (info.mode) {
    case 'none':
      return '무게 없이 횟수 · 시간';
    case 'band':
      return info.bandRole ? `${BAND_ROLE_LABEL[info.bandRole]} · 선수가 고름` : '밴드 · 선수가 고름';
    case 'combined':
      return `${info.label ?? '무게'} + 밴드`;
    case 'alternative':
      return '밴드 또는 무게';
    case 'unresolved':
      return '장비 확인 중 · 무게 없이';
    default:
      return info.label;
  }
}

/**
 * 처방 줄의 무게 글 — 계약이 kg 을 받을 때만 'Xkg(한 손)'. 받지 않거나(맨몸 · 밴드 · 확인 중) 계약을 모르면(지운 운동) 보통 무게로 보이지 않는다
 * (rawKg 로 따로 — '기록하지 않는 무게'). 기록하지 않는 kg 은 지우지 않고 그대로 들고 있는다(코치가 고칠 때 보인다).
 */
export function lineWeightText(
  l: Pick<WorkLine, 'weightKg' | 'load' | 'variant'>,
  info: LineLoadInfo | null | undefined,
  /** 서버처럼 계약 전체를 들고 있으면 공용 말하기(lib/workout/load/describe.ts describeLoad — 복구 화면 · 마치기 창과 같은 글) */
  contract?: RecordingContract | null
): { text: string | null; rawKg: number | null } {
  /* EX-LOAD01 R1-03 — 무게 기록 칸(밴드 · 섞인 무게 · 서로 다른 무게 · 기구 이름)을 실은 줄은 그 기록 그대로 말한다(kg 하나로 줄이지 않는다) */
  if (l.load !== undefined && l.load !== null) {
    const d = describeLoad({ weightKg: l.weightKg ?? null, load: l.load, variant: l.variant ?? null }, { contract: contract ?? null });
    return { text: d.text, rawKg: d.excludedKg };
  }
  if (!l.weightKg) return { text: null, rawKg: null };
  if (!info || !info.mass) return { text: null, rawKg: l.weightKg };
  if (contract) {
    const d = describeLoad({ weightKg: l.weightKg }, { contract });
    return d.text ? { text: d.text, rawKg: null } : { text: null, rawKg: d.excludedKg ?? l.weightKg };
  }
  return { text: `${l.weightKg}kg${info.basis ? `(${BASIS_SHORT[info.basis]})` : ''}`, rawKg: null };
}

/** 코치 기록 실패 한 줄(쓰기 전 검사 · 지난 확인의 실패) — 화면이 그대로 보인다 */
export type LoadIssue = { code: string; error: string; exerciseId: string | null; setIndex: number | null };

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
    /* 무게 기록 칸은 있으면 그대로 세트로(없으면 옛 길 — 칸을 만들지 않는다) */
    const lf = readOrgLoadFields(l as Record<string, unknown>);
    const set: OrgSet = { weightKg: l.weightKg ?? null, reps: l.reps ?? null, holdSeconds: l.holdSec ?? null, ...('error' in lf ? {} : lf) };
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

/**
 * EX-LOAD01 R1-03 — 무게를 받는가(권위 있는 계약에서). false 면 그 운동 줄의 kg 을 받지 않고 고칠 곳을 알린다(맨몸 · 밴드 · 확인 중인 운동에 kg 을
 * 적지 않게). null(모름)이면 거르지 않는다 — 코치 기록이 쓸 때 그 선수 판의 계약으로 다시 검사한다.
 */
export type LineLoadCheck = {
  massOf?: (exerciseId: string) => boolean | null;
  nameOf?: (exerciseId: string) => string | null;
  /**
   * 권위 있는 계약(서버가 라이브러리로 푼 것) — 주면 무게 기록 칸(밴드 · 섞인 무게 · 서로 다른 무게 · 기구 이름)을 받을 때 운동 화면과 같은 정규화로
   * 먼저 본다(받지 않을 값을 적어 두지 않게). 실제로 쓸 때 그 선수 판의 계약으로 다시 본다.
   */
  contractOf?: (exerciseId: string) => RecordingContract | null;
  /** 구조화 저장이 켜져 있나 — 꺼져 있으면 밴드 · 섞인 무게 같은 새 기록은 받지 않고 까닭을 알린다 */
  structured?: boolean;
};

/** 처방 줄 거르기 — 아는 운동 · 드릴만, 세트 1~10 · 횟수 1~200 · 초 1~600 · 무게(allowWeight 일 때만) 0.5~500 */
export function cleanLines(raw: unknown, known: Known, allowWeight: boolean, check?: LineLoadCheck): WorkLine[] | { error: string } {
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
    const name = exerciseId ? check?.nameOf?.(exerciseId) : null;
    /* EX-LOAD01 R1-03 — 무게 기록 칸(새 화면)은 무게를 받는 줄(예외)에서만, 모양을 보고 그대로 싣는다. 조 공통 줄에는 무게가 없다 */
    const lf = allowWeight && exerciseId ? readOrgLoadFields(o) : {};
    if ('error' in lf) return { error: `${name ? `${name}: ` : ''}${lf.error}` };
    const shape = orgLoadFieldsError(lf);
    if (shape) return { error: `${name ? `${name}: ` : ''}${shape}` };
    if (hasOrgLoadFields(lf) && exerciseId && check?.contractOf) {
      const c = check.contractOf(exerciseId);
      if (c) {
        const r = normalizeSetLoad({
          hasProtocol: lf.loadProtocol !== undefined,
          protocol: lf.loadProtocol,
          resolver: lf.loadResolver,
          contract: c,
          variant: lf.variant,
          weightKg: weightKg ?? null,
          hasLoad: lf.load !== undefined,
          load: lf.load,
          structured: check.structured === true,
        });
        if (!r.ok) return { error: `${name ? `${name}: ` : ''}${r.error}` };
      }
    } else if (weightKg && exerciseId && check?.massOf?.(exerciseId) === false) {
      return { error: `${name ? `${name}: ` : ''}이 운동은 무게 없이 횟수 · 시간으로 기록해요. 적힌 무게를 지워 주세요.` };
    }
    out.push({
      ...(exerciseId ? { exerciseId } : { guideId }),
      ...(sets ? { sets } : {}),
      ...(reps ? { reps } : {}),
      ...(holdSec ? { holdSec } : {}),
      ...(weightKg ? { weightKg } : {}),
      ...lf,
      ...(note ? { note } : {}),
    });
  }
  return out;
}

/** 선수 예외 거르기 — 이 훈련 활동만, 활동마다 하나, '줄임' · '다른 운동'은 줄이 있어야 */
export function cleanException(raw: unknown, planIds: readonly string[], known: Known, check?: LineLoadCheck): MemberException | null | { error: string } {
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
    const lines = cleanLines(x.items, known, true, check);
    if ('error' in lines) return lines;
    if (!lines.length) return { error: '실제로 한 운동을 적어 주세요.' };
    items.push({ planId: x.planId, kind, items: lines, ...(note ? { note } : {}) });
  }
  const extra: MemberException['extra'] = [];
  for (const r of Array.isArray(o.extra) ? o.extra.slice(0, 3) : []) {
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const lines = cleanLines(x.items, known, true, check);
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
