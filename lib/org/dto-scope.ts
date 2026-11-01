import type { OrgCapability, OrgScope } from '@/lib/org/capabilities';

/**
 * 조직 조회 답(DTO) 가리기(2026-11-01 교정 F05) — 순수 규칙. 서버 조회(app/actions/app-org.ts · app-team.ts)가 답을 만든 뒤 보는 사람의 업무 권한 · 대상 범위로 거른다.
 * 가린 것은 **없음(null · 빈 배열)** 으로 두고 `hidden` 에 무엇을 가렸는지 적는다 — 0 · '없음'과 다르게 읽히게(화면은 '볼 권한 없음'으로 그린다).
 *
 * 종류: training(개인 수행 · 팔 상태 · 정정 요청 · 브리핑 — training.read), checkin(체크인에서 온 한 줄 — training.read 와 같은 권한, 동의는 조회가 따로),
 * members(이 사람이 볼 수 있는 회원 — 범위가 조직 전체가 아니면 대상 id 집합).
 * 지금은 역할 기본 묶음만 서버에 닿아 코치 = 조직 전체 · training 가능이라 아무것도 안 가린다 — 위임(grants)을 잇기 전에 길을 깔아 둔 것.
 */
export type ScopeLens = {
  training: boolean;
  checkin: boolean;
  /** null = 조직 전체. 아니면 볼 수 있는 회원 id */
  members: ReadonlySet<string> | null;
};
export type HiddenKind = 'training' | 'checkin' | 'members';

type Target = { scope: OrgScope; targets?: readonly string[] } | null;

/** 업무마다의 범위에서 렌즈를 만든다 — 명단 범위(roster.read)가 회원 집합을, training.read 가 training · checkin 을 정한다 */
export function lensOf(targetOf: (cap: OrgCapability) => Target): ScopeLens {
  const roster = targetOf('roster.read');
  const training = targetOf('training.read');
  const membersOf = (t: Target): ReadonlySet<string> | null => {
    if (!t) return new Set();
    if (t.scope === 'organization') return null;
    if (t.scope === 'self') return new Set();
    return new Set(t.targets ?? []);
  };
  /* 회원 집합 = 명단 범위. 훈련 범위가 더 좁으면 훈련 쪽 가리기는 회원마다(redact 가 training 대상도 본다) */
  const members = membersOf(roster);
  const trainingMembers = membersOf(training);
  return {
    training: !!training,
    checkin: !!training,
    members: members === null && trainingMembers === null ? null : members === null ? null : members,
    ...(training && trainingMembers ? { trainingMembers } : {}),
  } as ScopeLens & { trainingMembers?: ReadonlySet<string> };
}

const seeMember = (lens: ScopeLens, memberId: string | null | undefined) => memberId == null || lens.members === null || lens.members.has(memberId);
const seeTraining = (lens: ScopeLens & { trainingMembers?: ReadonlySet<string> }, memberId: string | null | undefined) =>
  lens.training && (memberId == null || !lens.trainingMembers || lens.trainingMembers.has(memberId));

/* ── 코치 '오늘' ── */
type TodayLike = {
  events: { memberId: string | null; recorded?: number; selfRecorded?: number; issues?: number; [k: string]: unknown }[];
  briefing?: { review: { memberId: string | null; [k: string]: unknown }[] };
  alerts: { memberId: string; [k: string]: unknown }[];
  watch: { kind: string; memberId: string; [k: string]: unknown }[];
  counts: { members: number; pending: number; placeholders: number };
};
/** 살필 묶음 가운데 기록에서 온 것(팔 상태) — training 권한이 없으면 뺀다. 동의 · 연결 대기는 명단 일이라 남긴다 */
const TRAINING_WATCH = new Set(['attention', 'insufficient', 'hidden']);

export function redactToday<T extends TodayLike>(t: T, lens: ScopeLens): T & { hidden: HiddenKind[] } {
  const hidden = new Set<HiddenKind>();
  const events = t.events
    .filter((e) => seeMember(lens, e.memberId) || (lens.members !== null && e.memberId == null))
    .map((e) => {
      if (seeTraining(lens, e.memberId)) return e;
      hidden.add('training');
      const { recorded, selfRecorded, issues, ...rest } = e;
      void recorded; void selfRecorded; void issues;
      return rest as typeof e;
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
  if (!lens.training) {
    briefing = briefing ? { ...briefing, review: [] } : briefing;
    hidden.add('training');
  }
  return { ...t, events, alerts, watch, briefing, hidden: [...hidden] };
}

/* ── 회원 목록 ── */
type MemberRowLike = { memberId: string; arm?: unknown; watch?: string | null; [k: string]: unknown };
export function redactMembers<T extends MemberRowLike>(rows: T[], lens: ScopeLens): { members: T[]; hidden: HiddenKind[] } {
  const hidden = new Set<HiddenKind>();
  const members = rows
    .filter((m) => {
      const ok = seeMember(lens, m.memberId);
      if (!ok) hidden.add('members');
      return ok;
    })
    .map((m) => {
      if (seeTraining(lens, m.memberId)) return m;
      hidden.add('training');
      return { ...m, arm: null, watch: m.watch && TRAINING_WATCH.has(m.watch) ? null : m.watch };
    });
  return { members, hidden: [...hidden] };
}

/* ── 훈련 하나(일정 상세) ── */
type EventDetailLike = {
  members: { memberId: string; exception?: unknown; values?: unknown[]; status?: unknown; reasons?: string[]; held?: unknown[]; selfSets?: number; sameAsGroup?: string[]; fixes?: unknown[]; outingNote?: string | null; pending?: boolean; [k: string]: unknown }[];
  plans: { actual?: unknown[]; actualLines?: unknown[]; actualSet?: boolean; [k: string]: unknown }[];
  others: { memberId: string; [k: string]: unknown }[];
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
      if (seeTraining(lens, m.memberId)) return m;
      hidden.add('training');
      const out = { ...m, exception: null, values: [], status: null, reasons: [], held: [], selfSets: 0, sameAsGroup: [], fixes: [], pending: false };
      if (!lens.checkin) {
        out.outingNote = null;
        hidden.add('checkin');
      }
      return out;
    });
  const others = d.others.filter((o) => seeMember(lens, o.memberId));
  if (others.length !== d.others.length) hidden.add('members');
  let plans = d.plans;
  if (!lens.training) {
    plans = d.plans.map((p) => ({ ...p, actual: [], actualLines: [], actualSet: false }));
    hidden.add('training');
  }
  return { ...d, members, others, plans, hidden: [...hidden] };
}
