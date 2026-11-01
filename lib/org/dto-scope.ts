import type { OrgCapability, OrgScope } from '@/lib/org/capabilities';

/**
 * 조직 조회 답(DTO) 가리기(2026-11-01 교정 F05 → 2차 검토 G05) — 순수 규칙. 서버 조회(app/actions/app-org.ts · app-team.ts)가 답을 만든 뒤 보는 사람의 업무 권한 ·
 * **대상 집합**으로 거른다. 가린 것은 **없음(undefined · null · 빈 배열)** 으로 두고 `hidden` 에 무엇을 가렸는지 적는다 — 0 · '없음'과 다르게 읽히게(화면은 '비공개'로 그린다).
 *
 * 종류마다 **대상 술어**가 따로다(G05 — 명단 범위와 훈련 범위는 독립):
 *   - members(roster.read): 어느 회원 줄을 보나. null = 조직 전체, 집합 = 그 회원만(빈 집합 = 아무도). 회원 없는 팀 일정 줄 자체는 일정 권한으로 보인다.
 *   - training(training.read): 개인 수행 · 팔 상태 · 정정 · 브리핑. 대상 집합이 조직 전체가 아니면 **회원 없는(팀 전체) 합계는 내지 않는다** — 합계에 가린 회원이 섞인다.
 *   - checkin: 체크인에서 온 한 줄 — training 과 같은 권한 · 같은 대상(동의는 조회가 따로 본다).
 *   - self 범위는 보는 사람의 실제 회원 줄(selfId)로 푼다.
 * 답은 **허용 목록으로 새로 만든다**(spread 로 베낀 뒤 몇 칸만 지우지 않는다) — 나중에 민감한 칸이 더해져도 목록에 없으면 안 나간다.
 * 지금은 역할 기본 묶음만 서버에 닿아(grants 빈 배열) 코치 = 조직 전체 · training 가능이라 아무것도 안 가린다 — 위임을 잇기 전에 길을 깔아 둔 것.
 */
export type ScopeLens = {
  /** 명단 대상 — null 조직 전체, 집합이면 그 회원만 */
  members: ReadonlySet<string> | null;
  training: boolean;
  /** training 대상 — null 조직 전체(training 이 false 면 뜻 없음) */
  trainingTargets: ReadonlySet<string> | null;
  checkin: boolean;
  checkinTargets: ReadonlySet<string> | null;
};
export type HiddenKind = 'training' | 'checkin' | 'members';

type Target = { scope: OrgScope; targets?: readonly string[] } | null;

/** 업무마다의 범위에서 렌즈를 만든다 — selfId 는 보는 사람의 회원 줄(self 범위를 실제 사람으로) */
export function lensOf(targetOf: (cap: OrgCapability) => Target, selfId: string | null = null): ScopeLens {
  const setOf = (t: Target): ReadonlySet<string> | null => {
    if (!t) return new Set();
    if (t.scope === 'organization') return null;
    if (t.scope === 'self') return new Set(selfId ? [selfId] : []);
    return new Set(t.targets ?? []);
  };
  const roster = targetOf('roster.read');
  const training = targetOf('training.read');
  const trainingTargets = setOf(training);
  return {
    members: setOf(roster),
    training: !!training,
    trainingTargets,
    checkin: !!training,
    checkinTargets: trainingTargets,
  };
}

/* ── 대상 술어 ── */
/** 회원 줄을 보나 — 회원 없는(팀) 줄은 일정 권한으로 늘 보인다 */
export const seeMember = (lens: ScopeLens, memberId: string | null | undefined) => memberId == null || lens.members === null || lens.members.has(memberId);
/** 이 회원(없으면 팀 전체 합계)의 훈련 정보를 보나 — 합계는 대상이 조직 전체일 때만 */
export const seeTraining = (lens: ScopeLens, memberId: string | null | undefined) =>
  lens.training && (memberId == null ? lens.trainingTargets === null : lens.trainingTargets === null || lens.trainingTargets.has(memberId));
export const seeCheckin = (lens: ScopeLens, memberId: string | null | undefined) =>
  lens.checkin && (memberId == null ? lens.checkinTargets === null : lens.checkinTargets === null || lens.checkinTargets.has(memberId));
export const membersAll = (lens: ScopeLens) => lens.members === null;
export const trainingAll = (lens: ScopeLens) => lens.training && lens.trainingTargets === null;
/** 서버가 합계(회원 수 · 동의 대기 수 …)를 낼 때 — 보는 사람의 대상 안 회원만 */
export const visibleMembers = <M extends { id: string }>(lens: ScopeLens, members: readonly M[]): M[] => members.filter((m) => seeMember(lens, m.id));

/** 허용 목록으로 베낀다 — 목록에 없는 칸은 안 나간다 */
function pick<T extends object, K extends keyof T>(o: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in o) out[k] = o[k];
  return out;
}

/* ── 코치 '오늘' ── */
type TodayEvent = {
  id: string;
  time: string | null;
  kind: string;
  title: string;
  status: string;
  memberId: string | null;
  memberName: string | null;
  targets?: number;
  plans?: number;
  recorded?: number;
  selfRecorded?: number;
  confirmed?: boolean;
  issues?: number;
};
type TodayLike = {
  events: TodayEvent[];
  briefing?: { review: { kind: string; memberId: string | null; [k: string]: unknown }[] };
  alerts: { memberId: string; [k: string]: unknown }[];
  watch: { kind: string; memberId: string; [k: string]: unknown }[];
  counts: { members: number; pending: number; placeholders: number };
};
/** 살필 묶음 가운데 기록에서 온 것(팔 상태) — training 권한이 없으면 뺀다. 동의 · 연결 대기는 명단 일이라 남긴다 */
const TRAINING_WATCH = new Set(['attention', 'insufficient', 'hidden']);
const EVENT_PUBLIC = ['id', 'time', 'kind', 'title', 'status', 'memberId', 'memberName', 'plans', 'confirmed'] as const;
const EVENT_TRAINING = ['recorded', 'selfRecorded', 'issues'] as const;

export function redactToday<T extends TodayLike>(t: T, lens: ScopeLens): T & { hidden: HiddenKind[] } {
  const hidden = new Set<HiddenKind>();
  const events = t.events
    .filter((e) => seeMember(lens, e.memberId))
    .map((e) => {
      const out: TodayEvent = pick(e, EVENT_PUBLIC);
      /* 대상 선수 수(명단 크기) — 회원 하나 일정은 그 회원, 팀 일정은 명단 전체가 보일 때만 */
      if (e.targets != null) {
        if (e.memberId != null || membersAll(lens)) out.targets = e.targets;
        else hidden.add('members');
      }
      if (seeTraining(lens, e.memberId)) Object.assign(out, pick(e, EVENT_TRAINING));
      else if (EVENT_TRAINING.some((k) => e[k] != null)) hidden.add('training');
      return out as typeof e;
    });
  if (t.events.length !== events.length) hidden.add('members');
  const alerts = t.alerts.filter((a) => seeMember(lens, a.memberId) && seeTraining(lens, a.memberId));
  if (alerts.length !== t.alerts.length) hidden.add(lens.training ? 'members' : 'training');
  const watch = t.watch.filter((w) => seeMember(lens, w.memberId) && (!TRAINING_WATCH.has(w.kind) || seeTraining(lens, w.memberId)));
  if (watch.length !== t.watch.length) hidden.add(lens.training ? 'members' : 'training');
  let briefing = t.briefing;
  if (briefing) {
    const review = briefing.review.filter((r) => seeMember(lens, r.memberId) && seeTraining(lens, r.memberId));
    if (review.length !== briefing.review.length) hidden.add('training');
    briefing = { ...briefing, review };
  }
  if (!lens.training) hidden.add('training');
  return { ...t, events, alerts, watch, briefing, hidden: [...hidden] };
}

/* ── 회원 목록 ── */
type MemberRowLike = { memberId: string; nickname?: string; tags?: string[]; hasUser?: boolean; consentPending?: boolean; pitchOk?: boolean; arm?: unknown; watch?: string | null };
const MEMBER_PUBLIC = ['memberId', 'nickname', 'tags', 'hasUser', 'consentPending', 'pitchOk'] as const;
export function redactMembers<T extends MemberRowLike>(rows: T[], lens: ScopeLens): { members: T[]; hidden: HiddenKind[] } {
  const hidden = new Set<HiddenKind>();
  const members = rows
    .filter((m) => {
      const ok = seeMember(lens, m.memberId);
      if (!ok) hidden.add('members');
      return ok;
    })
    .map((m) => {
      const out = pick(m, MEMBER_PUBLIC) as MemberRowLike;
      if (seeTraining(lens, m.memberId)) {
        out.arm = m.arm ?? null;
        out.watch = m.watch ?? null;
      } else {
        hidden.add('training');
        out.arm = null;
        out.watch = m.watch && TRAINING_WATCH.has(m.watch) ? null : (m.watch ?? null);
      }
      return out as T;
    });
  return { members, hidden: [...hidden] };
}

/* ── 훈련 하나(일정 상세) ── */
type EventMemberLike = {
  memberId: string;
  nickname?: string;
  tags?: string[];
  hasUser?: boolean;
  canTrain?: boolean;
  canPitch?: boolean;
  left?: boolean;
  outing?: unknown;
  exception?: unknown;
  values?: unknown[];
  status?: unknown;
  reasons?: string[];
  pending?: boolean;
  held?: unknown[];
  selfSets?: number;
  sameAsGroup?: string[];
  fixes?: unknown[];
  outingNote?: string | null;
};
const EVENT_MEMBER_PUBLIC = ['memberId', 'nickname', 'tags', 'hasUser', 'canTrain', 'canPitch', 'left', 'outing'] as const;
const EVENT_MEMBER_TRAINING = ['exception', 'values', 'status', 'reasons', 'pending', 'held', 'selfSets', 'sameAsGroup', 'fixes'] as const;
const TRAINING_EMPTY = { exception: null, values: [], status: null, reasons: [], pending: false, held: [], selfSets: 0, sameAsGroup: [], fixes: [] } as const;
type EventDetailLike = {
  members: EventMemberLike[];
  plans: { memberIds?: string[]; targets?: string[]; actual?: unknown[]; actualLines?: unknown[]; actualSet?: boolean; [k: string]: unknown }[];
  others: { memberId: string; [k: string]: unknown }[];
  tags?: string[];
};
export function redactEventDetail<T extends EventDetailLike>(d: T, lens: ScopeLens): T & { hidden: HiddenKind[] } {
  const hidden = new Set<HiddenKind>();
  const members = d.members
    .filter((m) => {
      const ok = seeMember(lens, m.memberId);
      if (!ok) hidden.add('members');
      return ok;
    })
    .map((m) => {
      const out: EventMemberLike = pick(m, EVENT_MEMBER_PUBLIC);
      if (seeTraining(lens, m.memberId)) Object.assign(out, pick(m, EVENT_MEMBER_TRAINING));
      else {
        hidden.add('training');
        Object.assign(out, TRAINING_EMPTY);
      }
      if (seeCheckin(lens, m.memberId)) out.outingNote = m.outingNote ?? null;
      else {
        out.outingNote = null;
        if (m.outingNote) hidden.add('checkin');
      }
      return out as typeof m;
    });
  const visible = new Set(members.map((m) => m.memberId));
  const others = d.others.filter((o) => seeMember(lens, o.memberId));
  if (others.length !== d.others.length) hidden.add('members');
  /* 조 실제(팀 전체 값)는 training 대상이 조직 전체일 때만 · 조 대상 회원은 보이는 회원만 */
  const plans = d.plans.map((p) => {
    const out = { ...p };
    if (!trainingAll(lens)) {
      if (p.actualSet || p.actual?.length) hidden.add('training');
      out.actual = [];
      out.actualLines = [];
      out.actualSet = false;
    }
    if (!membersAll(lens)) {
      if (p.memberIds) out.memberIds = p.memberIds.filter((id) => visible.has(id));
      if (p.targets) out.targets = p.targets.filter((id) => visible.has(id));
    }
    return out;
  });
  const tags = d.tags && !membersAll(lens) ? [...new Set(members.flatMap((m) => m.tags ?? []))] : d.tags;
  return { ...d, members, others, plans, ...(tags !== undefined ? { tags } : {}), hidden: [...hidden] };
}

/* ── 코치 '훈련' 탭 목록(팀 일정 합계) ── */
type TrainingRowLike = { recorded?: number; issues?: number; [k: string]: unknown };
/** 팀 전체 합계(기록 선수 수 · 확인 필요 수)는 training 대상이 조직 전체일 때만 — 아니면 칸을 뺀다(0 이 아니라 '비공개') */
export function redactTrainingRows<T extends TrainingRowLike>(rows: T[], lens: ScopeLens): { rows: T[]; hidden: HiddenKind[] } {
  if (trainingAll(lens)) return { rows, hidden: [] };
  return {
    rows: rows.map((r) => {
      const { recorded, issues, ...rest } = r;
      void recorded;
      void issues;
      return rest as T;
    }),
    hidden: ['training'],
  };
}
