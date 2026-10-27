'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { appNow, appNowMs } from '@/lib/clock';
import { notify, notifyMany } from '@/lib/notify';
import { addToTodayPlan } from '@/app/actions/plan-edit';
import { eventLine, notifyEventPlayers } from '@/lib/org/notify-org';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { allExercises, allGuides, trainingGuides, visibleExercises } from '@/lib/library-cache';
import { isDateKey, ORG_DUPLICATE_MS } from '@/lib/org/rules';
import { coachOrg, myMember } from '@/lib/org/app-access';
import { ORG_LOST, orgOpenHref } from '@/lib/org/space-nav';
import { Prisma } from '@prisma/client';
import { cleanHomeworkItems, homeworkDose, readHomeworkItems } from '@/lib/org/homework';
import { cleanCommentBody } from '@/lib/org/comments';
import { notifyCoaches } from '@/lib/org/notify-org';
import { eventWorkOf } from '@/lib/org/team-work-store';
import {
  activePlayerIds,
  applyTeamWork,
  computeTeamWork,
  ensureRoster,
  needsWrite,
  readSessionPlans,
  rosterOf,
  teamPitchOf,
  type MemberResult,
  type SessionEvent,
} from '@/lib/org/team-session-store';
import {
  cleanException,
  cleanLines,
  cleanValues,
  isPlanScope,
  isValueMode,
  memberPlans,
  planTargets,
  readException,
  readValues,
  resolveLines,
  sameAsGroup,
  type MemberException,
  type PitchValue,
  type PlanScope,
  type ValueMode,
  type WorkLine,
  type WorkStatus,
} from '@/lib/org/team-session';
import { teamOutingsOf } from '@/lib/org/team-load';
import { OUTING_CHECK_DAYS, conflictLine, outingConflicts } from '@/lib/org/outing-check';
import { isOutingTitle } from '@/lib/calendar-event';
import { OUTING_ROLE_LABEL, PITCHING_ROLES, PITCH_LIMIT_MAX, PLAN_TITLE_MAX, copyPlanTargets, eventMemberIds, isOutingRole, weekCopyKey, type OutingRole } from '@/lib/org/team';

/**
 * 팀 훈련(docs/designs/sinker-team-lesson-contract.md 4절 · 11절)의 앱 · 웹 동작 — 활동(전체 · 조 · 개인) · 실제 확인 · 결과 · 등판 계획 · 공지 읽음.
 * JSON 인자 · 답, /api/rpc/app-team.<함수>. 코치 쪽은 lib/org/app-access.ts coachOrg, 선수 쪽은 myMember.
 * 규칙은 lib/org/team-session.ts(선수 한 명의 실제), 저장은 lib/org/team-session-store.ts — 코치가 '이대로 확인'을 눌러야 개인 기록(코치 세트 · 투구)이 생긴다.
 * 참석 응답 · 참석 확인은 2026-10-27 걷었다(안 온 선수는 실제 확인의 '빠짐' 예외로).
 */

/* 조직을 볼 권한이 없음 — 앱 껍데기가 가로채 공간을 다시 확인한다(계약 8-5) */
const NO_ACCESS = { ok: false as const, to: ORG_LOST };
const CONSENT = { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true } as const;

const EVENT_SELECT = { id: true, orgId: true, date: true, time: true, kind: true, title: true, memo: true, status: true, memberId: true, rosterAt: true, confirmedAt: true, confirmedById: true } as const;

async function eventOf(orgId: string, eventId: string) {
  return prisma.orgEvent.findFirst({ where: { id: String(eventId), orgId }, select: EVENT_SELECT });
}

async function activePlayers(orgId: string) {
  return prisma.orgMember.findMany({
    where: { orgId, role: 'PLAYER', status: 'ACTIVE' },
    orderBy: { nickname: 'asc' },
    select: { id: true, nickname: true, tags: true, userId: true, consent: { select: CONSENT } },
  });
}

type Line = { name: string; dose: string; kind: 'exercise' | 'drill' };
async function nameMaps() {
  const [ex, gd] = await Promise.all([allExercises(), allGuides()]);
  return new Map<string, string>([...ex.map((e) => [e.id, e.title] as const), ...gd.map((g) => [g.id, g.title] as const)]);
}
const doseOf = (l: WorkLine) => [homeworkDose(l), l.weightKg ? `${l.weightKg}kg` : ''].filter(Boolean).join(' · ');
function lineViews(lines: readonly WorkLine[], names: ReadonlyMap<string, string>): Line[] {
  return lines.map((i) => ({
    name: names.get(i.exerciseId ?? i.guideId ?? '') ?? '지운 운동',
    dose: doseOf(i),
    kind: i.exerciseId ? ('exercise' as const) : ('drill' as const),
  }));
}

/* ── 코치: 훈련 하나 — 계획(활동 · 명단) · 실제 확인(조 실제 · 예외 · 선수마다 값) · 결과 · 등판 ── */

export type EventMemberView = {
  memberId: string;
  nickname: string;
  tags: string[];
  hasUser: boolean;
  /** 개인 기록에 남길 수 있나 — 가입 · 트레이닝 공유 / 투구 공유 */
  canTrain: boolean;
  canPitch: boolean;
  /** 명단에 담은 뒤 팀을 떠남 */
  left: boolean;
  exception: MemberException | null;
  values: PitchValue[];
  /** 마지막 쓰기 결과(확인 전이면 null) · 까닭 코드 */
  status: WorkStatus | null;
  reasons: string[];
  /** 확인 뒤 바뀐 것이 있어 다시 확인하면 다시 쓰일 선수 */
  pending: boolean;
  /** 지금 셈하면 '확인 필요'로 보류될 운동(일정에 안 이은 같은 날 같은 운동) */
  held: { exerciseId: string; name: string }[];
  /** 선수가 이 훈련에 이은 제 세트 수 — 트레이닝 공유를 켠 선수만 */
  selfSets: number;
  /** 예외의 '줄임'이 지금 조 실제와 같아진 활동 — '예외를 풀까요' */
  sameAsGroup: string[];
  /** 안 푼 정정 요청 */
  fixes: { id: string; body: string }[];
  /** 확정 등판이 선수의 오늘 체크인 답과 날이 다르면 한 줄 — 체크인 공유를 켠 선수만(계약 9-6 ①-5 E) */
  outingNote: string | null;
  outing: { role: OutingRole; pitchLimit: number | null; status: string } | null;
};
export type PlanView = {
  id: string;
  title: string;
  scope: PlanScope;
  groupName: string | null;
  memberIds: string[];
  targets: string[];
  replacesPlanId: string | null;
  valueMode: ValueMode;
  /** 계획 */
  items: WorkLine[];
  lines: Line[];
  /** 조 실제 — 안 고쳤으면 계획으로 채운 값(세트 · 횟수 · 초까지) */
  actual: WorkLine[];
  actualLines: Line[];
  actualSet: boolean;
};
export type EventDetail = {
  kind: 'LESSON' | 'TEAM';
  todayKey: string;
  event: {
    id: string;
    date: string;
    time: string | null;
    kind: string;
    title: string;
    memo: string | null;
    status: string;
    memberId: string | null;
    rosterAt: string | null;
    confirmedAt: string | null;
    confirmedBy: string | null;
  };
  members: EventMemberView[];
  plans: PlanView[];
  /** 명단에 없는 활동 선수 — '명단에 더하기' */
  others: { memberId: string; nickname: string; tags: string[] }[];
  /** 명단 선수들의 태그 — 조 고르기 */
  tags: string[];
  /** 운동 · 드릴 이름(예외 고치기 화면) */
  names: Record<string, string>;
};

export async function loadEventDetail(orgId: string, eventId: string): Promise<{ ok: false; to: string } | ({ ok: true } & EventDetail)> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const event = await eventOf(orgId, eventId);
  if (!event) return NO_ACCESS;
  const players = await activePlayers(orgId);
  const t = await computeTeamWork(event);
  const [outings, fixes, names, confirmer] = await Promise.all([
    prisma.orgOuting.findMany({ where: { eventId: event.id } }),
    prisma.orgComment.findMany({ where: { eventId: event.id, kind: 'fix', resolvedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, memberId: true, body: true } }),
    nameMaps(),
    event.confirmedById ? prisma.user.findUnique({ where: { id: event.confirmedById }, select: { nickname: true } }) : null,
  ]);
  const out = new Map(outings.map((o) => [o.memberId, o]));
  /* 등판 확인 — 오늘 체크인의 던지는 일정과 이 일정의 확정 등판(체크인 공유를 켠 선수만, 다른 팀 · 개인 달력은 코치에게 안 보인다) */
  const today = toDateKey(appNow());
  const checkinShared = t.rows.filter((r) => r.member?.userId && r.scope?.checkin && out.get(r.id)?.status === 'confirmed');
  const answers = checkinShared.length
    ? await prisma.dailyCheckin.findMany({ where: { userId: { in: checkinShared.map((r) => r.member!.userId!) }, date: dbDate(today) }, select: { userId: true, throwPlan: true } })
    : [];
  const outingNoteOf = (memberId: string, userId: string | null): string | null => {
    const o = out.get(memberId);
    const plan = answers.find((x) => x.userId === userId)?.throwPlan ?? null;
    if (!o || !plan || !checkinShared.some((r) => r.id === memberId) || !isOutingRole(o.role) || !PITCHING_ROLES.includes(o.role)) return null;
    const one = { orgId, orgName: c.org.name, eventId: event.id, date: toDateKey(event.date), role: o.role, pitchLimit: o.pitchLimit };
    return outingConflicts({ today, outings: [one], throwPlanToday: plan, calendarOutings: [] }).length ? `선수 일정과 달라요 — 오늘 체크인 '${plan}'` : null;
  };
  const planById = new Map(t.plans.map((p) => [p.id, p]));
  const members: EventMemberView[] = t.rows.map((r) => {
    const o = out.get(r.id);
    return {
      memberId: r.id,
      nickname: r.member?.nickname ?? '떠난 선수',
      tags: r.member?.tags ?? [],
      hasUser: !!r.member?.userId,
      canTrain: !!r.member?.userId && !!r.scope?.training,
      canPitch: !!r.member?.userId && !!r.scope?.pitch,
      left: r.member?.status !== 'ACTIVE',
      exception: r.exception,
      values: readValues(r.prev?.values),
      status: (r.prev?.workStatus as WorkStatus | null) ?? null,
      reasons: r.prev?.workReason ? r.prev.workReason.split(',') : [],
      pending: !!event.confirmedAt && needsWrite(r),
      held: r.w.held.map((id) => ({ exerciseId: id, name: names.get(id) ?? '지운 운동' })),
      selfSets: r.linkedSets,
      sameAsGroup: (r.exception?.items ?? []).filter((e) => planById.has(e.planId) && sameAsGroup(e, planById.get(e.planId)!, t.defaults)).map((e) => e.planId),
      fixes: fixes.filter((f) => f.memberId === r.id).map((f) => ({ id: f.id, body: f.body })),
      outingNote: outingNoteOf(r.id, r.member?.userId ?? null),
      outing: o && isOutingRole(o.role) ? { role: o.role, pitchLimit: o.pitchLimit, status: o.status } : null,
    };
  });
  const roster = new Set(t.roster);
  const others = players.filter((p) => !roster.has(p.id)).map((p) => ({ memberId: p.id, nickname: p.nickname, tags: p.tags }));
  const used = new Set<string>();
  for (const p of t.plans) for (const l of [...p.items, ...(p.actualItems ?? [])]) used.add(l.exerciseId ?? l.guideId ?? '');
  for (const m of members) {
    for (const e of m.exception?.items ?? []) for (const l of e.items ?? []) used.add(l.exerciseId ?? l.guideId ?? '');
    for (const x of m.exception?.extra ?? []) for (const l of x.items) used.add(l.exerciseId ?? l.guideId ?? '');
  }
  return {
    ok: true,
    kind: c.org.kind,
    todayKey: today,
    event: {
      id: event.id,
      date: toDateKey(event.date),
      time: event.time,
      kind: event.kind,
      title: event.title,
      memo: event.memo,
      status: event.status,
      memberId: event.memberId,
      rosterAt: event.rosterAt?.toISOString() ?? null,
      confirmedAt: event.confirmedAt?.toISOString() ?? null,
      confirmedBy: confirmer?.nickname ?? null,
    },
    members,
    plans: t.plans.map((p) => {
      const actual = resolveLines(p.actualItems ?? p.items, t.defaults);
      return {
        id: p.id,
        title: p.title,
        scope: p.scope,
        groupName: p.groupName,
        memberIds: [...p.memberIds],
        targets: planTargets(p, t.roster),
        replacesPlanId: p.replacesPlanId,
        valueMode: p.valueMode,
        items: [...p.items],
        lines: lineViews(p.items, names),
        actual,
        actualLines: lineViews(actual, names),
        actualSet: p.actualItems != null,
      };
    }),
    others,
    tags: [...new Set(members.filter((m) => !m.left).flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b, 'ko')),
    names: Object.fromEntries([...used].filter((id) => id && names.has(id)).map((id) => [id, names.get(id)!])),
  };
}

/** 명단 고치기 — 나중에 들어온 선수는 코치가 더할 때만(명단은 준비할 때 담아 고정). 이미 기록한 선수는 빼지 않고 '빠짐'으로 */
export async function setRosterMember(orgId: string, eventId: string, memberId: string, inRoster: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const event = await eventOf(orgId, eventId);
  if (!event || event.memberId) return { ok: false, error: '일정을 찾을 수 없어요.' };
  await ensureRoster(event, await activePlayerIds(orgId));
  const key = { eventId_memberId: { eventId: event.id, memberId: String(memberId) } };
  if (inRoster === true) {
    const m = await prisma.orgMember.findFirst({ where: { id: String(memberId), orgId, role: 'PLAYER', status: 'ACTIVE' }, select: { id: true } });
    if (!m) return { ok: false, error: '이 팀의 선수가 아니에요.' };
    await prisma.orgEventAttendee.upsert({ where: key, create: { eventId: event.id, memberId: m.id }, update: {} });
    return { ok: true };
  }
  const row = await prisma.orgEventAttendee.findUnique({ where: key, select: { workHash: true, workStatus: true } });
  if (!row) return { ok: true };
  if (row.workHash || row.workStatus) return { ok: false, error: '이미 기록한 선수예요. 실제 확인에서 빠짐으로 바꿔 주세요.' };
  await prisma.orgEventAttendee.delete({ where: key });
  return { ok: true };
}

/* ── 코치: 활동(계획) ── */

const GROUP_NAME_MAX = 20;

/**
 * 활동 저장 — 이름 · 대상(전체 · 조 · 개인) · 처방 · 값을 선수마다 받나(투구). 처음 저장할 때 그 순간의 명단을 담는다(ensureRoster).
 * 조는 담은 명단(memberIds)이 대상이고 이름(groupName)은 표시일 뿐. 개인 '바꾸기'는 그 선수의 조 활동 하나를 대신한다.
 */
export async function savePlan(orgId: string, eventId: string, input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const event = await eventOf(orgId, eventId);
  if (!event) return { ok: false, error: '일정을 찾을 수 없어요.' };
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, PLAN_TITLE_MAX) : '';
  if (!title) return { ok: false, error: '활동 이름을 적어 주세요(예: 전체 워밍업).' };
  const scope: PlanScope = isPlanScope(o.scope) ? o.scope : 'all';
  const valueMode: ValueMode = isValueMode(o.valueMode) ? o.valueMode : 'shared';
  const [ex, gd] = await Promise.all([visibleExercises(), trainingGuides()]);
  const known = { exercises: new Set(ex.map((e) => e.id)), guides: new Set(gd.map((g) => g.id)) };
  /* 투구를 선수마다 받는 활동은 운동 없이도 된다(불펜) */
  const items = valueMode === 'individual' && Array.isArray(o.items) && o.items.length === 0 ? [] : cleanHomeworkItems(o.items, known);
  if ('error' in items) return { ok: false, error: items.error.replace(/숙제로 낼|숙제는|숙제를/g, (m) => (m === '숙제로 낼' ? '활동에 넣을' : m === '숙제는' ? '활동은' : '활동을')) };
  await ensureRoster(event, await activePlayerIds(orgId));
  const roster = await rosterOf({ ...event, rosterAt: event.rosterAt ?? appNow() }, await activePlayerIds(orgId));
  const picked = Array.isArray(o.memberIds) ? [...new Set(o.memberIds.filter((x): x is string => typeof x === 'string' && roster.includes(x)))] : [];
  let memberIds: string[] = [];
  let groupName: string | null = null;
  let replacesPlanId: string | null = null;
  const id = typeof o.id === 'string' && o.id ? o.id : null;
  if (scope === 'group') {
    if (picked.length === 0) return { ok: false, error: '조에 넣을 선수를 골라 주세요.' };
    memberIds = picked;
    groupName = typeof o.groupName === 'string' ? o.groupName.trim().slice(0, GROUP_NAME_MAX) || null : null;
  } else if (scope === 'member') {
    if (picked.length !== 1) return { ok: false, error: '선수 한 명을 골라 주세요.' };
    memberIds = picked;
    if (typeof o.replacesPlanId === 'string' && o.replacesPlanId) {
      const target = (await readSessionPlans(event.id)).find((p) => p.id === o.replacesPlanId && p.scope !== 'member' && p.id !== id);
      if (!target || !planTargets(target, roster).includes(picked[0])) return { ok: false, error: '이 선수가 하는 조 활동을 골라 주세요.' };
      replacesPlanId = target.id;
    }
  }
  const data = { title, items: items as Prisma.InputJsonValue, memberIds, scope, groupName, replacesPlanId, valueMode };
  const targets = planTargets({ memberIds }, roster);
  if (id) {
    const before = await prisma.orgPlan.findFirst({ where: { id, eventId: event.id, orgId }, select: { items: true, memberIds: true, title: true } });
    if (!before) return { ok: false, error: '활동을 찾을 수 없어요.' };
    await prisma.orgPlan.update({ where: { id }, data });
    if (JSON.stringify(before.items) !== JSON.stringify(items) || before.memberIds.join() !== memberIds.join() || before.title !== title)
      await tellPlan(orgId, event, targets, '훈련 메뉴가 바뀌었어요');
    return { ok: true, id };
  }
  /* 같은 활동을 다시 보냈으면(신호 끊김 뒤 재전송) 그 활동을 돌려준다 */
  const recent = await prisma.orgPlan.findMany({
    where: { eventId: event.id, createdById: c.user.id, title, createdAt: { gte: new Date(appNowMs() - ORG_DUPLICATE_MS) } },
    select: { id: true, items: true, memberIds: true },
  });
  const same = recent.find((p) => JSON.stringify(p.items) === JSON.stringify(items) && p.memberIds.join() === memberIds.join());
  if (same) return { ok: true, id: same.id };
  const position = await prisma.orgPlan.count({ where: { eventId: event.id } });
  const made = await prisma.orgPlan.create({ data: { orgId, eventId: event.id, ...data, position, createdById: c.user.id }, select: { id: true } });
  await tellPlan(orgId, event, targets, '훈련 메뉴가 올라왔어요');
  return { ok: true, id: made.id };
}

/** 메뉴 알림 — 2일 안(오늘 · 내일 · 모레)의 살아 있는 일정만, 그 활동 대상 선수에게(계약 9-6 ③-1, 결정 5) */
async function tellPlan(orgId: string, event: { id: string; date: Date; time: string | null; title: string; memberId: string | null; status: string }, targets: string[], title: string) {
  const key = toDateKey(event.date);
  const today = toDateKey(appNow());
  if (event.status === 'canceled' || key < today || key > shiftDateKey(today, 2) || targets.length === 0) return;
  await notifyEventPlayers(orgId, event, { kind: 'team', title, body: eventLine(event), link: orgOpenHref(orgId, 'p', 'schedule', { kind: 'event', id: event.id }) }, targets);
}

/** 활동 지우기 — 그 활동을 대신하던 개인 '바꾸기'도 같이 */
export async function deletePlan(orgId: string, planId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const r = await prisma.orgPlan.deleteMany({ where: { orgId, OR: [{ id: String(planId) }, { replacesPlanId: String(planId) }] } });
  return r.count ? { ok: true } : { ok: false, error: '활동을 찾을 수 없어요.' };
}

/** 활동 고치기 화면 — 적은 값 그대로. 새 활동(빈 번호) · 그새 지운 활동은 plan null(앱 useLoad 가 ok:false 면 화면을 떠나서) */
export async function loadPlan(
  orgId: string,
  planId: string
): Promise<
  | { ok: false; to: string }
  | {
      ok: true;
      plan: { id: string; eventId: string; title: string; items: unknown; memberIds: string[]; scope: PlanScope; groupName: string | null; replacesPlanId: string | null; valueMode: ValueMode } | null;
    }
> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const p = planId
    ? await prisma.orgPlan.findFirst({
        where: { id: String(planId), orgId },
        select: { id: true, eventId: true, title: true, items: true, memberIds: true, scope: true, groupName: true, replacesPlanId: true, valueMode: true },
      })
    : null;
  return {
    ok: true,
    plan: p
      ? { ...p, items: readHomeworkItems(p.items), scope: isPlanScope(p.scope) ? p.scope : 'all', valueMode: isValueMode(p.valueMode) ? p.valueMode : 'shared' }
      : null,
  };
}

/* ── 다시 쓰기(계약 10-4 ②) — 지난 일정의 활동 가져오기 · 한 주 복사. 복사본은 그 날짜의 새 계획: 실제 · 예외 · 결과 · 등판은 안 옮기고,
   원본을 고쳐도 복사본 · 지난 기록은 그대로(행을 새로 만든다). 처방은 라이브러리 운동 · 드릴 그대로 — 개인 엔진 · 안전 거름은 선수 쪽에서 그대로 ── */

export type PlanSource = { id: string; date: string; time: string | null; title: string; plans: string[] };

/** 활동을 가져올 일정 — 활동이 있는 이 조직 일정, 가까운 날부터 30(지난 60일 ~ 앞으로 14일) */
export async function loadPlanSources(orgId: string, eventId: string): Promise<{ ok: false; to: string } | { ok: true; sources: PlanSource[] }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const today = toDateKey(appNow());
  const events = await prisma.orgEvent.findMany({
    where: { orgId, id: { not: String(eventId) }, date: { gte: dbDate(shiftDateKey(today, -60)), lte: dbDate(shiftDateKey(today, 14)) } },
    orderBy: [{ date: 'desc' }, { time: 'desc' }],
    select: { id: true, date: true, time: true, title: true },
  });
  const plans = events.length
    ? await prisma.orgPlan.findMany({ where: { orgId, eventId: { in: events.map((e) => e.id) } }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { eventId: true, title: true } })
    : [];
  const sources = events
    .map((e) => ({ id: e.id, date: toDateKey(e.date), time: e.time, title: e.title, plans: plans.filter((p) => p.eventId === e.id).map((p) => p.title) }))
    .filter((e) => e.plans.length)
    .slice(0, 30);
  return { ok: true, sources };
}

type CopyRow = { id: string; title: string; items: Prisma.InputJsonValue; memberIds: string[]; scope: string; groupName: string | null; replacesPlanId: string | null; valueMode: string; position: number };
const COPY_SELECT = { id: true, title: true, items: true, memberIds: true, scope: true, groupName: true, replacesPlanId: true, valueMode: true, position: true } as const;

/** 복사할 활동 — 새 일정 선수로 대상을 좁히고(아무도 안 남으면 버림), 개인 '바꾸기'는 그 조 활동도 복사될 때만 */
function copyRows(src: readonly (Omit<CopyRow, 'items'> & { items: unknown })[], targets: readonly string[]): CopyRow[] {
  const kept = src.flatMap((p) => {
    const memberIds = copyPlanTargets(p.memberIds, targets);
    return memberIds ? [{ ...p, items: readHomeworkItems(p.items) as Prisma.InputJsonValue, memberIds }] : [];
  });
  const ids = new Set(kept.map((p) => p.id));
  return kept.filter((p) => !p.replacesPlanId || ids.has(p.replacesPlanId));
}

/** 복사본 만들기 — 바꾸기의 대상 번호를 새 번호로 이어 준다 */
async function createCopies(tx: Prisma.TransactionClient, orgId: string, eventId: string, rows: readonly CopyRow[], createdById: string, from = 0) {
  const newId = new Map<string, string>();
  const ordered = [...rows.filter((r) => !r.replacesPlanId), ...rows.filter((r) => r.replacesPlanId)];
  for (const r of ordered) {
    const made = await tx.orgPlan.create({
      data: {
        orgId,
        eventId,
        title: r.title,
        items: r.items,
        memberIds: r.memberIds,
        scope: r.scope,
        groupName: r.groupName,
        replacesPlanId: r.replacesPlanId ? (newId.get(r.replacesPlanId) ?? null) : null,
        valueMode: r.valueMode,
        position: from + r.position,
        createdById,
      },
      select: { id: true },
    });
    newId.set(r.id, made.id);
  }
}

/** 지난 일정의 활동을 이 일정으로 — 'add' 더하기 · 'replace' 이 일정의 활동을 바꾸기. 2분 안 같은 복사는 한 번 */
export async function copyPlansFrom(orgId: string, fromEventId: string, toEventId: string, mode: unknown): Promise<{ ok: true; copied: number } | { ok: false; error: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  if (mode !== 'add' && mode !== 'replace') return { ok: false, error: '더할지 바꿀지 골라 주세요.' };
  const [from, to] = await Promise.all([eventOf(orgId, fromEventId), eventOf(orgId, toEventId)]);
  if (!from || !to || from.id === to.id) return { ok: false, error: '일정을 찾을 수 없어요.' };
  if (to.status === 'canceled') return { ok: false, error: '취소된 일정이에요.' };
  const active = await activePlayerIds(orgId);
  await ensureRoster(to, active);
  const [src, recent, count] = await Promise.all([
    prisma.orgPlan.findMany({ where: { orgId, eventId: from.id }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: COPY_SELECT }),
    prisma.orgPlan.findMany({ where: { orgId, eventId: to.id, createdById: c.user.id, createdAt: { gte: new Date(appNowMs() - ORG_DUPLICATE_MS) } }, select: { title: true, items: true, memberIds: true } }),
    prisma.orgPlan.count({ where: { eventId: to.id } }),
  ]);
  if (src.length === 0) return { ok: false, error: '가져올 활동이 없어요.' };
  const targets = await rosterOf({ ...to, rosterAt: to.rosterAt ?? appNow() }, active);
  const rows = copyRows(src, targets);
  /* 신호 끊김 뒤 재전송 — 방금 같은 것을 만들었으면 다시 안 만든다 */
  const same = (r: CopyRow) => recent.some((x) => x.title === r.title && JSON.stringify(x.items) === JSON.stringify(r.items) && x.memberIds.join() === r.memberIds.join());
  if (rows.length && rows.every(same)) return { ok: true, copied: 0 };
  await prisma.$transaction(async (tx) => {
    if (mode === 'replace') await tx.orgPlan.deleteMany({ where: { orgId, eventId: to.id } });
    await createCopies(tx, orgId, to.id, rows, c.user.id, mode === 'replace' ? 0 : count);
  });
  const told = [...new Set(rows.flatMap((r) => (r.memberIds.length ? r.memberIds : targets)))];
  if (rows.length) await tellPlan(orgId, to, told, mode === 'replace' ? '훈련 메뉴가 바뀌었어요' : '훈련 메뉴가 올라왔어요');
  return { ok: true, copied: rows.length };
}

/**
 * 한 주 복사 — fromMonday 주의 일정(취소 뺌)과 그 활동을 toMonday 주의 같은 요일로. 같은 날짜 · 시각 · 제목이 이미 있으면 건너뛴다(다시 눌러도 한 번).
 * 떠난 회원의 레슨은 안 옮긴다. 알림은 선수마다 한 번('다음 주 일정 n개가 잡혔어요'). 새 일정의 명단은 처음 고칠 때 담는다.
 */
export async function copyWeek(orgId: string, fromMonday: string, toMonday: string): Promise<{ ok: true; events: number; skipped: number } | { ok: false; error: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const monday = (k: string) => isDateKey(k) && new Date(`${k}T00:00:00Z`).getUTCDay() === 1;
  if (!monday(fromMonday) || !monday(toMonday) || fromMonday === toMonday) return { ok: false, error: '복사할 주를 다시 골라 주세요.' };
  const gap = Math.round((Date.parse(`${toMonday}T00:00:00Z`) - Date.parse(`${fromMonday}T00:00:00Z`)) / 86400000);
  const [src, existing, players] = await Promise.all([
    prisma.orgEvent.findMany({
      where: { orgId, date: { gte: dbDate(fromMonday), lte: dbDate(shiftDateKey(fromMonday, 6)) }, status: { not: 'canceled' } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      select: { id: true, date: true, time: true, kind: true, title: true, memo: true, memberId: true },
    }),
    prisma.orgEvent.findMany({ where: { orgId, date: { gte: dbDate(toMonday), lte: dbDate(shiftDateKey(toMonday, 6)) } }, select: { date: true, time: true, title: true } }),
    activePlayers(orgId),
  ]);
  if (src.length === 0) return { ok: false, error: '이 주에 복사할 일정이 없어요.' };
  const taken = new Set(existing.map((e) => weekCopyKey({ date: toDateKey(e.date), time: e.time, title: e.title })));
  const active = players.map((p) => p.id);
  const plans = await prisma.orgPlan.findMany({ where: { orgId, eventId: { in: src.map((e) => e.id) } }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { ...COPY_SELECT, eventId: true } });
  const made: { date: string; memberId: string | null }[] = [];
  let skipped = 0;
  await prisma.$transaction(async (tx) => {
    for (const e of src) {
      const date = shiftDateKey(toDateKey(e.date), gap);
      if (taken.has(weekCopyKey({ date, time: e.time, title: e.title })) || (e.memberId && !active.includes(e.memberId))) {
        skipped += 1;
        continue;
      }
      const ev = await tx.orgEvent.create({
        data: { orgId, date: dbDate(date), time: e.time, kind: e.kind, title: e.title, memo: e.memo, memberId: e.memberId, createdById: c.user.id },
        select: { id: true },
      });
      await createCopies(tx, orgId, ev.id, copyRows(plans.filter((x) => x.eventId === e.id), eventMemberIds(e, active)), c.user.id);
      made.push({ date, memberId: e.memberId });
    }
  });
  /* 선수마다 한 번 — 오늘 · 앞으로의 일정만 센다 */
  const today = toDateKey(appNow());
  const count = new Map<string, number>();
  for (const m of made.filter((x) => x.date >= today))
    for (const p of players.filter((x) => x.userId && eventMemberIds(m, active).includes(x.id))) count.set(p.userId!, (count.get(p.userId!) ?? 0) + 1);
  await Promise.all(
    [...count].map(([userId, n]) => notify(userId, { kind: 'team', title: `${dayLabelOf(toMonday)} 주 일정 ${n}개가 잡혔어요`, link: orgOpenHref(orgId, 'p', 'schedule') }))
  );
  revalidatePath('/manage');
  return { ok: true, events: made.length, skipped };
}

const dayLabelOf = (key: string) => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;

/* ── 코치: 실제 확인 — 조 실제 · 선수 예외 · 선수마다 값을 적어 두고(기록 아님), '이대로 확인'에서 한 번에 선수 기록으로 ── */

async function knownLibrary() {
  const [ex, gd] = await Promise.all([allExercises(), allGuides()]);
  return { exercises: new Set(ex.map((e) => e.id)), guides: new Set(gd.map((g) => g.id)) };
}

/** 조 실제 — 활동 하나가 실제로 한 처방(무게는 조 공통으로 안 적는다). null 이면 계획으로 되돌림 */
export async function saveActual(orgId: string, eventId: string, planId: string, items: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const plan = await prisma.orgPlan.findFirst({ where: { id: String(planId), orgId, eventId: String(eventId) }, select: { id: true } });
  if (!plan) return { ok: false, error: '활동을 찾을 수 없어요.' };
  if (items == null) {
    await prisma.orgPlan.update({ where: { id: plan.id }, data: { actualItems: Prisma.DbNull } });
    return { ok: true };
  }
  const lines = cleanLines(items, await knownLibrary(), false);
  if ('error' in lines) return { ok: false, error: lines.error };
  await prisma.orgPlan.update({ where: { id: plan.id }, data: { actualItems: lines as Prisma.InputJsonValue } });
  return { ok: true };
}

async function rosterEvent(orgId: string, eventId: string) {
  const event = await eventOf(orgId, eventId);
  if (!event || event.memberId) return null;
  const active = await activePlayerIds(orgId);
  await ensureRoster(event, active);
  const withRoster = { ...event, rosterAt: event.rosterAt ?? appNow() };
  return { event: withRoster, roster: await rosterOf(withRoster, active) };
}

/** 선수 한 명의 예외 · 값 — 비우면 '조와 같음'. 적어 두기만 한다(개인 기록은 '이대로 확인' 때) */
export async function saveMemberResult(orgId: string, eventId: string, memberId: string, input: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const r = await rosterEvent(orgId, eventId);
  if (!r) return { ok: false, error: '일정을 찾을 수 없어요.' };
  if (!r.roster.includes(String(memberId))) return { ok: false, error: '이 훈련 명단의 선수가 아니에요.' };
  const mine = memberPlans(await readSessionPlans(r.event.id), r.roster, String(memberId));
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const exception = cleanException(o.exception, mine.map((p) => p.id), await knownLibrary());
  if (exception && 'error' in exception) return { ok: false, error: exception.error };
  const values = cleanValues(o.values, mine.filter((p) => p.valueMode === 'individual').map((p) => p.id));
  if ('error' in values) return { ok: false, error: values.error };
  await prisma.orgEventAttendee.update({
    where: { eventId_memberId: { eventId: r.event.id, memberId: String(memberId) } },
    data: { exception: exception ? (exception as Prisma.InputJsonValue) : Prisma.DbNull, values: values.length ? (values as Prisma.InputJsonValue) : Prisma.DbNull },
  });
  return { ok: true };
}

/** 투구를 선수마다 받는 활동 하나의 칸 — [{ memberId, pitchCount, effortPct, maxVelocity }]. 빈 투구 수는 그 선수 값을 지운다 */
export async function saveTeamValues(orgId: string, eventId: string, planId: string, rows: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const r = await rosterEvent(orgId, eventId);
  if (!r) return { ok: false, error: '일정을 찾을 수 없어요.' };
  const plan = (await readSessionPlans(r.event.id)).find((p) => p.id === String(planId));
  if (!plan || plan.valueMode !== 'individual') return { ok: false, error: '투구를 받는 활동이 아니에요.' };
  const targets = planTargets(plan, r.roster);
  const list = Array.isArray(rows) ? rows : [];
  const attendees = await prisma.orgEventAttendee.findMany({ where: { eventId: r.event.id, memberId: { in: targets } }, select: { memberId: true, values: true } });
  const names = new Map((await prisma.orgMember.findMany({ where: { id: { in: targets } }, select: { id: true, nickname: true } })).map((m) => [m.id, m.nickname]));
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  for (const raw of list) {
    const x = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const memberId = typeof x.memberId === 'string' ? x.memberId : '';
    if (!targets.includes(memberId)) continue;
    const v = cleanValues([{ ...x, planId: plan.id }], [plan.id]);
    if ('error' in v) return { ok: false, error: `${names.get(memberId) ?? '선수'}: ${v.error}` };
    const rest = readValues(attendees.find((a) => a.memberId === memberId)?.values).filter((y) => y.planId !== plan.id);
    const next = [...rest, ...v];
    writes.push(
      prisma.orgEventAttendee.update({
        where: { eventId_memberId: { eventId: r.event.id, memberId } },
        data: { values: next.length ? (next as Prisma.InputJsonValue) : Prisma.DbNull },
      })
    );
  }
  if (writes.length) await prisma.$transaction(writes);
  return { ok: true };
}

/**
 * '이대로 확인' — 훈련의 모든 활동 · 명단 선수에게 한 번에(memberIds 를 주면 그 선수만 — 실패한 선수 다시 보내기).
 * 선수마다 따로 쓰고 결과를 돌려준다. 같은 내용인 선수는 다시 안 쓴다(지문). 오늘까지의 살아 있는 훈련만.
 */
export async function confirmTeamWork(
  orgId: string,
  eventId: string,
  memberIds?: unknown
): Promise<{ ok: true; results: MemberResult[]; changed: number } | { ok: false; error: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const r = await rosterEvent(orgId, eventId);
  if (!r) return { ok: false, error: '일정을 찾을 수 없어요.' };
  if (toDateKey(r.event.date) > toDateKey(appNow())) return { ok: false, error: '아직 오지 않은 훈련이에요. 끝난 뒤에 확인해 주세요.' };
  if (r.event.status === 'canceled') return { ok: false, error: '취소된 훈련이에요.' };
  if ((await prisma.orgPlan.count({ where: { eventId: r.event.id } })) === 0) return { ok: false, error: '활동이 없어요. 활동을 먼저 만들어 주세요.' };
  const only = Array.isArray(memberIds) ? memberIds.filter((x): x is string => typeof x === 'string') : undefined;
  const results = await applyTeamWork({ event: r.event as SessionEvent, coachId: c.user.id, memberIds: only });
  await prisma.orgEvent.update({ where: { id: r.event.id }, data: { confirmedAt: appNow(), confirmedById: c.user.id } });
  revalidatePath('/manage');
  return { ok: true, results, changed: results.filter((x) => x.changed).length };
}

/** 확인 필요 풀기(코치) — 'link' 선수의 그날 그 운동을 이 훈련에 잇기(선수 기록으로 맞춤) · 'separate' 따로 한 운동(팀 기록도 남김) */
export async function resolveTeamCheck(orgId: string, eventId: string, memberId: string, exerciseId: string, answer: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const event = await eventOf(orgId, eventId);
  if (!event?.confirmedAt) return { ok: false, error: '확인한 훈련이 아니에요.' };
  const m = await prisma.orgMember.findFirst({ where: { id: String(memberId), orgId }, select: { id: true, userId: true } });
  if (!m) return { ok: false, error: '선수를 찾을 수 없어요.' };
  return settleCheck(event as SessionEvent & { confirmedById: string | null }, m, String(exerciseId), answer, c.user.id);
}

async function settleCheck(event: SessionEvent & { confirmedById: string | null }, m: { id: string; userId: string | null }, exerciseId: string, answer: unknown, byId: string) {
  if (answer !== 'link' && answer !== 'separate') return { ok: false, error: '팀 훈련이었는지 골라 주세요.' };
  if (!m.userId) return { ok: false, error: '앱 연결 전 선수예요.' };
  if (answer === 'link')
    await prisma.userExerciseSet.updateMany({ where: { userId: m.userId, date: event.date, enteredById: null, orgEventId: null, exerciseId }, data: { orgEventId: event.id } });
  else {
    const row = await prisma.orgEventAttendee.findUnique({ where: { eventId_memberId: { eventId: event.id, memberId: m.id } }, select: { exception: true } });
    const e = readException(row?.exception) ?? { items: [], extra: [], separate: [] };
    const next = { ...e, separate: [...new Set([...e.separate, exerciseId])] };
    await prisma.orgEventAttendee.update({ where: { eventId_memberId: { eventId: event.id, memberId: m.id } }, data: { exception: next as Prisma.InputJsonValue } });
  }
  await applyTeamWork({ event, coachId: event.confirmedById ?? byId, memberIds: [m.id], notifyChanges: false });
  return { ok: true };
}

/** 일정을 지우거나 취소하기 전 — 남긴 기록이 있나(있으면 앱이 '기록도 뺄까요'를 묻는다, 결정 4) */
export async function loadEventWork(orgId: string, eventId: string): Promise<{ ok: false; to: string } | { ok: true; sets: number; players: number }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  if (!(await eventOf(orgId, eventId))) return { ok: true, sets: 0, players: 0 };
  const [work, pitch] = await Promise.all([eventWorkOf(String(eventId)), teamPitchOf(String(eventId))]);
  return { ok: true, sets: work.sets + pitch.rows, players: Math.max(work.players, pitch.userIds.length) };
}

/* ── 코치: 등판 계획 ── */

/** 선수 한 명의 등판 — role null 이면 지운다. 고치면 다시 '짜는 중'(확정은 따로) */
export async function saveOuting(orgId: string, eventId: string, memberId: string, role: unknown, pitchLimit: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const event = await eventOf(orgId, eventId);
  if (!event) return { ok: false, error: '일정을 찾을 수 없어요.' };
  if (!(await rosterOf(event, await activePlayerIds(orgId))).includes(String(memberId))) return { ok: false, error: '이 일정의 선수가 아니에요.' };
  if (role == null || role === '') {
    await prisma.orgOuting.deleteMany({ where: { eventId, memberId } });
    return { ok: true };
  }
  if (!isOutingRole(role)) return { ok: false, error: '선발 · 불펜 · 대기 가운데 골라 주세요.' };
  const n = pitchLimit == null || pitchLimit === '' ? null : Number(pitchLimit);
  if (n != null && !(Number.isInteger(n) && n >= 1 && n <= PITCH_LIMIT_MAX)) return { ok: false, error: `투구 수 한도는 1~${PITCH_LIMIT_MAX}구로 적어 주세요.` };
  await prisma.orgOuting.upsert({
    where: { eventId_memberId: { eventId, memberId } },
    create: { orgId, eventId, memberId, role, pitchLimit: n, status: 'draft', updatedById: c.user.id },
    update: { role, pitchLimit: n, status: 'draft', updatedById: c.user.id },
  });
  return { ok: true };
}

/** 짜는 중인 등판을 모두 확정 — 확정만 선수의 다음 등판 재료가 된다. 선수에게 알림 */
export async function confirmOutings(orgId: string, eventId: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const event = await eventOf(orgId, eventId);
  if (!event) return { ok: false, error: '일정을 찾을 수 없어요.' };
  const drafts = await prisma.orgOuting.findMany({ where: { eventId, status: 'draft' }, select: { memberId: true, role: true, pitchLimit: true } });
  if (drafts.length === 0) return { ok: false, error: '확정할 등판이 없어요.' };
  await prisma.orgOuting.updateMany({ where: { eventId, status: 'draft' }, data: { status: 'confirmed', updatedById: c.user.id } });
  const members = await prisma.orgMember.findMany({ where: { id: { in: drafts.map((d) => d.memberId) } }, select: { id: true, userId: true } });
  const day = toDateKey(event.date).slice(5).replace('-', '/');
  for (const d of drafts) {
    const u = members.find((m) => m.id === d.memberId)?.userId;
    if (u && isOutingRole(d.role))
      await notifyMany([u], {
        kind: 'team',
        title: `${day} ${event.title} ${OUTING_ROLE_LABEL[d.role]}로 확정됐어요`,
        body: d.pitchLimit ? `투구 수 한도 ${d.pitchLimit}구` : undefined,
        link: orgOpenHref(orgId, 'p', 'schedule'),
      });
  }
  return { ok: true, count: drafts.length };
}

/* ── 코치: '훈련' 탭(S단계) — 지난 2주 · 다가오는 2주 팀 일정의 활동과 실제 확인 ── */

export type TrainingRow = {
  id: string;
  date: string;
  time: string | null;
  kind: string;
  title: string;
  plans: string[];
  /** 개인 기록이 생긴 선수 수 */
  recorded: number;
  /** '이대로 확인'을 했나 */
  confirmed: boolean;
  /** 확인 필요 · 저장 실패 선수 수 */
  issues: number;
};

export async function loadTeamTraining(orgId: string): Promise<{ ok: false; to: string } | { ok: true; todayKey: string; rows: TrainingRow[] }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const todayKey = toDateKey(appNow());
  const events = await prisma.orgEvent.findMany({
    where: {
      orgId,
      memberId: null,
      kind: { in: ['training', 'game'] },
      status: { not: 'canceled' },
      date: { gte: dbDate(shiftDateKey(todayKey, -14)), lte: dbDate(shiftDateKey(todayKey, 14)) },
    },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
    take: 60,
    select: { id: true, date: true, time: true, kind: true, title: true, confirmedAt: true },
  });
  const ids = events.map((e) => e.id);
  const [plans, results] = ids.length
    ? await Promise.all([
        prisma.orgPlan.findMany({ where: { eventId: { in: ids } }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { eventId: true, title: true } }),
        prisma.orgEventAttendee.findMany({ where: { eventId: { in: ids }, workStatus: { not: null } }, select: { eventId: true, workStatus: true } }),
      ])
    : [[], []];
  return {
    ok: true,
    todayKey,
    rows: events.map((e) => {
      const mine = results.filter((r) => r.eventId === e.id);
      return {
        id: e.id,
        date: toDateKey(e.date),
        time: e.time,
        kind: e.kind,
        title: e.title,
        plans: plans.filter((p) => p.eventId === e.id).map((p) => p.title),
        recorded: mine.filter((r) => r.workStatus === 'recorded' || r.workStatus === 'reconciled').length,
        confirmed: !!e.confirmedAt,
        issues: mine.filter((r) => r.workStatus === 'needs_check' || r.workStatus === 'failed').length,
      };
    }),
  };
}

/* ── 선수: 다가오는 일정 · 내 활동 · 확정된 등판 · 공지 읽음 ── */

export type MyEventView = {
  id: string;
  date: string;
  time: string | null;
  kind: string;
  title: string;
  /** 내가 할 활동 — 전체 · 내 조 · 내 개인(다른 조 활동은 안 보낸다) */
  plans: { title: string; groupName: string | null; scope: PlanScope; lines: Line[] }[];
  outing: { role: OutingRole; pitchLimit: number | null } | null;
  /** 일정 하나 화면에서만(취소된 일정도 연다) */
  status?: string;
};

/** 코치가 남긴 내 수행(지난 2주) — 내 운동 세트를 가리키기만 한다(복사 없음, 계약 8-5) */
export type MyWorkView = { eventId: string; date: string; title: string; sets: number; exercises: string[] };

export async function loadMyTeam(
  memberId: string
): Promise<{ ok: false; to: string } | { ok: true; todayKey: string; events: MyEventView[]; recent: MyWorkView[]; outingCheck: string[] }> {
  const r = await myMember(memberId);
  if (!r) return NO_ACCESS;
  if (r.m.status !== 'ACTIVE') return { ok: true, todayKey: toDateKey(appNow()), events: [], recent: [], outingCheck: [] };
  const today = toDateKey(appNow());
  const events = await prisma.orgEvent.findMany({
    where: {
      orgId: r.m.org.id,
      date: { gte: dbDate(today), lte: dbDate(shiftDateKey(today, 13)) },
      status: { not: 'canceled' },
      OR: [{ memberId: null }, { memberId: r.m.id }],
    },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
    take: 20,
    select: { id: true, date: true, time: true, kind: true, title: true, memberId: true, rosterAt: true },
  });
  return {
    ok: true,
    todayKey: today,
    recent: await myRecentWork(r.m.org.id, r.user.id, today),
    outingCheck: await myOutingCheck(r.m.org.id, r.user.id, today),
    events: await myEventViews(r.m.org.id, r.m.id, events),
  };
}

/** 그 일정에서 내가 할 활동(명단 기준) — 명단을 담은 훈련에 내가 없으면 없음 */
async function myPlansOf(event: { id: string; memberId: string | null; rosterAt: Date | null }, memberId: string, active: readonly string[]) {
  const roster = await rosterOf(event, active);
  return memberPlans(await readSessionPlans(event.id), roster, memberId);
}

/** 선수에게 보일 일정 줄 — 내 활동 · 확정 등판(loadMyTeam · loadMyEvent 같이) */
async function myEventViews(
  orgId: string,
  memberId: string,
  events: { id: string; date: Date; time: string | null; kind: string; title: string; memberId: string | null; rosterAt: Date | null; status?: string }[]
): Promise<MyEventView[]> {
  if (events.length === 0) return [];
  const [outings, active, names] = await Promise.all([
    prisma.orgOuting.findMany({ where: { eventId: { in: events.map((e) => e.id) }, memberId, status: 'confirmed' } }),
    activePlayerIds(orgId),
    nameMaps(),
  ]);
  return Promise.all(
    events.map(async (e) => {
      const o = outings.find((x) => x.eventId === e.id);
      const mine = await myPlansOf(e, memberId, active);
      return {
        id: e.id,
        date: toDateKey(e.date),
        time: e.time,
        kind: e.kind,
        title: e.title,
        plans: mine.map((p) => ({ title: p.title, groupName: p.groupName, scope: p.scope, lines: lineViews(p.items, names) })),
        outing: o && isOutingRole(o.role) ? { role: o.role, pitchLimit: o.pitchLimit } : null,
        ...(e.status ? { status: e.status } : {}),
      };
    })
  );
}

/* ── 선수: 일정 하나(계약 9-6 ③-2 · 11-6) — 내 활동 · 확정 등판 · 팀 훈련 기록(코치 확인) · 그 일정에서 내가 한 기록 ── */

/** 내 일정이고 이 조직 것인가 — 레슨 · 개인 지도(memberId 있음)는 그 회원만 */
async function myEventOf(orgId: string, memberId: string, eventId: string) {
  return prisma.orgEvent.findFirst({
    where: { id: String(eventId), orgId, OR: [{ memberId: null }, { memberId }] },
    select: { id: true, orgId: true, date: true, time: true, kind: true, title: true, memberId: true, status: true, rosterAt: true, confirmedAt: true, confirmedById: true },
  });
}

/** 그 일정에서 내가 할 활동의 운동(드릴 빼고) */
async function myMenuExercises(orgId: string, memberId: string, event: { id: string; memberId: string | null; rosterAt: Date | null }): Promise<string[]> {
  const plans = await myPlansOf(event, memberId, await activePlayerIds(orgId));
  return [...new Set(plans.flatMap((p) => [...p.items, ...(p.actualItems ?? [])].map((i) => i.exerciseId).filter((x): x is string => !!x)))];
}

type SetSummary = { sets: number; exercises: string[] };
async function setSummary(where: { userId: string; orgEventId?: string | null; enteredById: null | { not: null }; date?: Date; exerciseId?: { in: string[] } }): Promise<SetSummary> {
  const sets = await prisma.userExerciseSet.findMany({ where, select: { exerciseId: true } });
  if (sets.length === 0) return { sets: 0, exercises: [] };
  const names = new Map((await allExercises()).map((e) => [e.id, e.title]));
  return { sets: sets.length, exercises: [...new Set(sets.map((s) => names.get(s.exerciseId) ?? '지운 운동'))] };
}

/** 팀 훈련 기록 · 코치 확인 카드 — 남은 기록 그대로(코치 세트 · 팀 투구 줄) + 결과 · 보류된 운동 · 정정 요청 */
export type MyTeamResult = {
  confirmedAt: string;
  coach: string | null;
  status: WorkStatus | null;
  reasons: string[];
  /** 활동마다 내 결과 — 같음 · 빠짐 · 줄임 · 다른 운동 */
  activities: { title: string; state: 'same' | 'absent' | 'reduced' | 'substitute'; note: string | null }[];
  pitch: { pitchCount: number; effortPct: number | null; maxVelocity: number | null }[];
  drills: string[];
  held: { exerciseId: string; name: string }[];
  fixOpen: boolean;
};

export async function loadMyEvent(
  memberId: string,
  eventId: string
): Promise<
  | { ok: false; to: string }
  | { ok: true; todayKey: string; left: boolean; event: MyEventView | null; coach: SetSummary; mine: SetSummary; candidates: number; result: MyTeamResult | null }
> {
  const r = await myMember(memberId);
  if (!r) return NO_ACCESS;
  const today = toDateKey(appNow());
  const none = { sets: 0, exercises: [] };
  const e = r.m.status === 'ACTIVE' ? await myEventOf(r.m.org.id, r.m.id, eventId) : null;
  if (!e) return { ok: true, todayKey: today, left: r.m.status !== 'ACTIVE', event: null, coach: none, mine: none, candidates: 0, result: null };
  const ids = await myMenuExercises(r.m.org.id, r.m.id, e);
  const [view, coach, mine, candidates, result] = await Promise.all([
    myEventViews(r.m.org.id, r.m.id, [e]),
    setSummary({ userId: r.user.id, orgEventId: e.id, enteredById: { not: null } }),
    setSummary({ userId: r.user.id, orgEventId: e.id, enteredById: null }),
    ids.length
      ? prisma.userExerciseSet.count({ where: { userId: r.user.id, date: e.date, enteredById: null, orgEventId: null, exerciseId: { in: ids } } })
      : 0,
    e.confirmedAt ? myTeamResult(e as SessionEvent & { confirmedAt: Date; confirmedById: string | null }, r.m.id, r.user.id) : null,
  ]);
  return { ok: true, todayKey: today, left: false, event: view[0] ?? null, coach, mine, candidates, result };
}

async function myTeamResult(event: SessionEvent & { confirmedAt: Date; confirmedById: string | null }, memberId: string, userId: string): Promise<MyTeamResult | null> {
  const t = await computeTeamWork(event, [memberId]);
  const row = t.rows[0];
  if (!row) return null;
  const [coach, pitch, fix, names] = await Promise.all([
    event.confirmedById ? prisma.user.findUnique({ where: { id: event.confirmedById }, select: { nickname: true } }) : null,
    prisma.pitchLog.findMany({ where: { userId, clientKey: { startsWith: `team:${event.id}:` } }, select: { pitchCount: true, effortPct: true, maxVelocity: true } }),
    prisma.orgComment.count({ where: { eventId: event.id, memberId, kind: 'fix', resolvedAt: null } }),
    nameMaps(),
  ]);
  const byPlan = new Map((row.exception?.items ?? []).map((i) => [i.planId, i]));
  return {
    confirmedAt: event.confirmedAt.toISOString(),
    coach: coach?.nickname ?? null,
    status: (row.prev?.workStatus as WorkStatus | null) ?? null,
    reasons: row.prev?.workReason ? row.prev.workReason.split(',') : [],
    activities: memberPlans(t.plans, t.roster, memberId).map((p) => {
      const x = byPlan.get(p.id);
      return { title: p.title, state: x?.kind ?? 'same', note: x?.note ?? null };
    }),
    pitch,
    drills: row.w.drills.map((id) => names.get(id) ?? '지운 드릴'),
    held: row.w.held.map((id) => ({ exerciseId: id, name: names.get(id) ?? '지운 운동' })),
    fixOpen: fix > 0,
  };
}

/** 내 기록이 바뀐 뒤(잇기 · 풀기) — 코치가 확인한 훈련이면 내 결과를 다시 셈해 쓴다(맞춤 · 확인 필요가 바로 풀리게) */
async function reapplyMine(event: { id: string; confirmedAt: Date | null; confirmedById: string | null } & SessionEvent, memberId: string) {
  if (!event.confirmedAt || !event.confirmedById || event.memberId) return;
  await applyTeamWork({ event, coachId: event.confirmedById, memberIds: [memberId], notifyChanges: false });
}

/**
 * 내 기록을 이 일정에 잇기 — '운동하기'로 한 뒤(since = 시작 시각) 또는 '내 기록 잇기'(그날 내 활동 운동). 선수 세트에 일정을 달 뿐 세트는 그대로라
 * 부하 · 달력은 한 번만 센다. 이은 운동은 코치 확인에서 내 기록으로 맞춘다(결정 3). 활동이 없으면 since 뒤의 세트만.
 */
export async function linkMyWork(memberId: string, eventId: string, since?: unknown): Promise<{ ok: true; linked: number } | { ok: false; error: string }> {
  const r = await myMember(memberId);
  if (!r || r.m.status !== 'ACTIVE') return { ok: false, error: '이을 수 없어요.' };
  const e = await myEventOf(r.m.org.id, r.m.id, eventId);
  if (!e || e.status === 'canceled') return { ok: false, error: '일정을 찾을 수 없어요.' };
  if (toDateKey(e.date) > toDateKey(appNow())) return { ok: false, error: '아직 오지 않은 일정이에요.' };
  const ids = await myMenuExercises(r.m.org.id, r.m.id, e);
  const from = typeof since === 'number' && Number.isFinite(since) ? new Date(since) : null;
  if (!ids.length && !from) return { ok: true, linked: 0 };
  const res = await prisma.userExerciseSet.updateMany({
    where: { userId: r.user.id, date: e.date, enteredById: null, orgEventId: null, ...(ids.length ? { exerciseId: { in: ids } } : {}), ...(from ? { recordedAt: { gte: from } } : {}) },
    data: { orgEventId: e.id },
  });
  if (res.count) await reapplyMine(e, r.m.id);
  return { ok: true, linked: res.count };
}

/** 일정 활동을 오늘 운동에 넣기 — '운동하기' 앞에(숙제 homeworkToToday 와 같은 길). 오늘 일정만 */
export async function menuToToday(memberId: string, eventId: string): Promise<{ ok: boolean; added: number; error?: string }> {
  const r = await myMember(memberId);
  if (!r || r.m.status !== 'ACTIVE') return { ok: false, added: 0, error: '일정을 찾을 수 없어요.' };
  const e = await myEventOf(r.m.org.id, r.m.id, eventId);
  if (!e || e.status === 'canceled' || toDateKey(e.date) !== toDateKey(appNow())) return { ok: false, added: 0, error: '오늘 일정에서만 할 수 있어요.' };
  let added = 0;
  for (const exId of await myMenuExercises(r.m.org.id, r.m.id, e)) {
    const res = await addToTodayPlan(exId);
    if ('ok' in res) added += 1;
    else if (res.error === '오늘 만들어 둔 일정이 없어요.') return { ok: false, added: 0, error: '트레이닝에서 오늘 운동을 먼저 만들어 주세요.' };
  }
  return { ok: true, added };
}

/** 잘못 이었으면 풀기 — 내 세트에서 이 일정만 뗀다(세트는 그대로) */
export async function unlinkMyWork(memberId: string, eventId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await myMember(memberId);
  if (!r) return { ok: false, error: '풀 수 없어요.' };
  const res = await prisma.userExerciseSet.updateMany({ where: { userId: r.user.id, orgEventId: String(eventId), enteredById: null }, data: { orgEventId: null } });
  const e = res.count && r.m.status === 'ACTIVE' ? await myEventOf(r.m.org.id, r.m.id, eventId) : null;
  if (e) await reapplyMine(e, r.m.id);
  return { ok: true };
}

/** '오늘 ○○가 팀 훈련이었나요?' — 'link' 팀 훈련에 잇기(내 기록으로 맞춤) · 'separate' 따로 한 운동(팀 기록도 남김) */
export async function answerTeamCheck(memberId: string, eventId: string, exerciseId: string, answer: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await myMember(memberId);
  if (!r || r.m.status !== 'ACTIVE') return { ok: false, error: '답할 수 없어요.' };
  const e = await myEventOf(r.m.org.id, r.m.id, eventId);
  if (!e?.confirmedAt || e.memberId) return { ok: false, error: '코치가 확인한 팀 훈련이 아니에요.' };
  return settleCheck(e, { id: r.m.id, userId: r.user.id }, String(exerciseId), answer, e.confirmedById ?? r.user.id);
}

/** 팀 훈련 기록 '고쳐 주세요' — 코치 받은 것 · 훈련 화면 결과 줄로. 선수는 다시 확인하지 않는다 */
export async function requestTeamFix(memberId: string, eventId: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await myMember(memberId);
  if (!r || r.m.status !== 'ACTIVE') return { ok: false, error: '보낼 수 없어요.' };
  const e = await myEventOf(r.m.org.id, r.m.id, eventId);
  if (!e?.confirmedAt) return { ok: false, error: '코치가 확인한 훈련만 고쳐 달라고 할 수 있어요.' };
  const text = cleanCommentBody(body);
  if (!text) return { ok: false, error: '무엇이 다른지 적어 주세요.' };
  await prisma.orgComment.create({ data: { orgId: r.m.org.id, memberId: r.m.id, eventId: e.id, authorId: r.user.id, kind: 'fix', body: text } });
  await notifyCoaches(r.m.org.id, {
    kind: 'team',
    title: `${r.m.nickname}님이 팀 훈련 기록을 고쳐 달라고 했어요`,
    body: eventLine(e),
    link: orgOpenHref(r.m.org.id, 'c', 'inbox', { kind: 'event', id: e.id, member: r.m.id }),
  });
  return { ok: true };
}

/** 이 팀의 확정 등판이 체크인 답 · 내 달력 · 다른 팀 등판과 날이 다른지(계약 9-6 ①-5 E) — 선수 본인의 것만 읽는다 */
async function myOutingCheck(orgId: string, userId: string, today: string): Promise<string[]> {
  const from = dbDate(today);
  const to = dbDate(shiftDateKey(today, OUTING_CHECK_DAYS));
  const [outings, checkin, calendar] = await Promise.all([
    teamOutingsOf(userId, from, to),
    prisma.dailyCheckin.findFirst({ where: { userId, date: from }, select: { throwPlan: true } }),
    prisma.calendarEvent.findMany({ where: { userId, date: { gte: from, lte: to } }, select: { date: true, title: true } }),
  ]);
  if (!outings.some((o) => o.orgId === orgId)) return [];
  return outingConflicts({
    today,
    outings,
    throwPlanToday: checkin?.throwPlan ?? null,
    calendarOutings: calendar.filter((e) => isOutingTitle(e.title)).map((e) => toDateKey(e.date)),
  })
    .filter((c) => c.outing.orgId === orgId || (c.kind === 'teams' && c.other.orgId === orgId))
    .map((c) => conflictLine(c, today));
}

async function myRecentWork(orgId: string, userId: string, today: string): Promise<MyWorkView[]> {
  const events = await prisma.orgEvent.findMany({
    where: { orgId, date: { gte: dbDate(shiftDateKey(today, -14)), lte: dbDate(today) } },
    orderBy: [{ date: 'desc' }, { time: 'desc' }],
    select: { id: true, date: true, title: true },
  });
  if (events.length === 0) return [];
  const sets = await prisma.userExerciseSet.findMany({
    where: { userId, orgEventId: { in: events.map((e) => e.id) }, enteredById: { not: null } },
    select: { orgEventId: true, exerciseId: true },
  });
  if (sets.length === 0) return [];
  const names = new Map((await allExercises()).map((e) => [e.id, e.title]));
  return events
    .map((e) => {
      const mine = sets.filter((s) => s.orgEventId === e.id);
      return { eventId: e.id, date: toDateKey(e.date), title: e.title, sets: mine.length, exercises: [...new Set(mine.map((s) => names.get(s.exerciseId) ?? '지운 운동'))] };
    })
    .filter((w) => w.sets > 0);
}

/** 공지를 봤다 — 선수 공간이 공지를 보일 때 */
export async function markNoticesRead(memberId: string, noticeIds: unknown): Promise<{ ok: boolean }> {
  const r = await myMember(memberId);
  if (!r || r.m.status !== 'ACTIVE') return { ok: false };
  const ids = Array.isArray(noticeIds) ? noticeIds.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  if (ids.length === 0) return { ok: true };
  const mine = await prisma.orgNotice.findMany({ where: { id: { in: ids }, orgId: r.m.org.id }, select: { id: true } });
  if (mine.length) await prisma.orgNoticeRead.createMany({ data: mine.map((n) => ({ noticeId: n.id, memberId: r.m.id })), skipDuplicates: true });
  return { ok: true };
}
