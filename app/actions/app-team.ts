'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { appNow, appNowMs } from '@/lib/clock';
import { notifyMany } from '@/lib/notify';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { allExercises, allGuides, exercisesByIds, trainingGuides, visibleExercises } from '@/lib/library-cache';
import { memberScope, ORG_DUPLICATE_MS } from '@/lib/org/rules';
import { coachOrg, myMember } from '@/lib/org/app-access';
import { ORG_LOST, orgOpenHref } from '@/lib/org/space-nav';
import { cleanHomeworkItems, homeworkDose, readHomeworkItems } from '@/lib/org/homework';
import { cleanOrgWork, type OrgWorkItem } from '@/lib/org/team-work';
import { eventWorkOf, ownSetsOn, writeOrgWork } from '@/lib/org/team-work-store';
import { teamOutingsOf } from '@/lib/org/team-load';
import { OUTING_CHECK_DAYS, conflictLine, outingConflicts } from '@/lib/org/outing-check';
import { isOutingTitle } from '@/lib/calendar-event';
import {
  ATTEND_NOTE_MAX,
  OUTING_ROLE_LABEL,
  PITCHING_ROLES,
  PITCH_LIMIT_MAX,
  PLAN_TITLE_MAX,
  cleanPlanMembers,
  eventMemberIds,
  isAttendReply,
  isOutingRole,
  planMemberIds,
  planWork,
  replyCounts,
  type AttendReply,
  type OutingRole,
} from '@/lib/org/team';

/**
 * 팀 3단계(docs/designs/sinker-team-lesson-contract.md 4절)의 앱 · 웹 동작 — 참석 · 훈련 메뉴 · 수행일지 · 등판 계획 · 공지 읽음. JSON 인자 · 답, /api/rpc/app-team.<함수>.
 * 코치 쪽은 lib/org/app-access.ts coachOrg, 선수 쪽은 myMember. 규칙은 lib/org/team.ts.
 * 수행일지는 선수의 그날 운동 판에 코치 세트로 붙는다(lib/org/team-work-store.ts writeOrgWork) — 가입했고 트레이닝 공유를 켠 선수만.
 */

/* 조직을 볼 권한이 없음 — 앱 껍데기가 가로채 공간을 다시 확인한다(계약 8-5) */
const NO_ACCESS = { ok: false as const, to: ORG_LOST };
const CONSENT = { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true } as const;

async function eventOf(orgId: string, eventId: string) {
  return prisma.orgEvent.findFirst({
    where: { id: eventId, orgId },
    select: { id: true, date: true, time: true, kind: true, title: true, memo: true, status: true, memberId: true },
  });
}

async function activePlayers(orgId: string) {
  return prisma.orgMember.findMany({
    where: { orgId, role: 'PLAYER', status: 'ACTIVE' },
    orderBy: { nickname: 'asc' },
    select: { id: true, nickname: true, tags: true, userId: true, consent: { select: CONSENT } },
  });
}

type Line = { name: string; dose: string; kind: 'exercise' | 'drill' };
async function linesOf(itemsJson: unknown): Promise<Line[]> {
  const [ex, gd] = await Promise.all([allExercises(), allGuides()]);
  const exName = new Map(ex.map((e) => [e.id, e.title]));
  const gName = new Map(gd.map((g) => [g.id, g.title]));
  return readHomeworkItems(itemsJson).map((i) => ({
    name: (i.exerciseId ? exName.get(i.exerciseId) : i.guideId ? gName.get(i.guideId) : null) ?? '지운 운동',
    dose: homeworkDose(i),
    kind: i.exerciseId ? ('exercise' as const) : ('drill' as const),
  }));
}

/* ── 코치: 일정 하나 — 참석 · 메뉴 · 수행 · 등판 ── */

export type EventMemberView = {
  memberId: string;
  nickname: string;
  tags: string[];
  hasUser: boolean;
  /** 수행일지를 선수 기록에 남길 수 있나 — 가입 · 트레이닝 공유 */
  canTrain: boolean;
  reply: AttendReply | null;
  note: string | null;
  attended: boolean | null;
  /** 이 일정에서 코치가 남긴 세트 수(수행일지) */
  recordedSets: number;
  /** 선수가 그날 메뉴의 운동을 직접 남긴 세트 수 — 트레이닝 공유를 켠 선수만(계약 9-6 ①-6 F) */
  ownSets: number;
  /** 확정 등판이 선수의 오늘 체크인 답과 날이 다르면 한 줄 — 체크인 공유를 켠 선수만(계약 9-6 ①-5 E) */
  outingNote: string | null;
  outing: { role: OutingRole; pitchLimit: number | null; status: string } | null;
};
export type PlanView = { id: string; title: string; memberIds: string[]; targets: string[]; lines: Line[] };
export type EventDetail = {
  kind: 'LESSON' | 'TEAM';
  todayKey: string;
  event: { id: string; date: string; time: string | null; kind: string; title: string; memo: string | null; status: string; memberId: string | null };
  members: EventMemberView[];
  plans: PlanView[];
  counts: Record<AttendReply, number>;
};

export async function loadEventDetail(orgId: string, eventId: string): Promise<{ ok: false; to: string } | ({ ok: true } & EventDetail)> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const event = await eventOf(orgId, eventId);
  if (!event) return NO_ACCESS;
  const players = await activePlayers(orgId);
  const targets = eventMemberIds(event, players.map((p) => p.id));
  const [attendees, plans, outings, sets] = await Promise.all([
    prisma.orgEventAttendee.findMany({ where: { eventId } }),
    prisma.orgPlan.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' } }),
    prisma.orgOuting.findMany({ where: { eventId } }),
    prisma.userExerciseSet.groupBy({ by: ['userId'], where: { orgEventId: eventId }, _count: { _all: true } }),
  ]);
  const att = new Map(attendees.map((a) => [a.memberId, a]));
  const out = new Map(outings.map((o) => [o.memberId, o]));
  const setsOf = new Map(sets.map((s) => [s.userId, s._count._all]));
  /* 메뉴 운동은 선수마다 다르다(대상 메뉴만) — 한 번에 읽고 선수별로 거른다 */
  const planItems = plans.map((p) => ({ targets: planMemberIds(p.memberIds, targets), ids: readHomeworkItems(p.items).map((i) => i.exerciseId).filter((x): x is string => !!x) }));
  const sharing = players.filter((p) => targets.includes(p.id) && p.userId && memberScope(p.consent, true).training);
  const own = await ownSetsOn(
    sharing.map((p) => p.userId!),
    toDateKey(event.date),
    [...new Set(planItems.flatMap((p) => p.ids))]
  );
  /* 등판 확인 — 오늘 체크인의 던지는 일정과 이 일정의 확정 등판(체크인 공유를 켠 선수만, 다른 팀 · 개인 달력은 코치에게 안 보인다) */
  const today = toDateKey(appNow());
  const checkinShared = players.filter((p) => targets.includes(p.id) && p.userId && memberScope(p.consent, true).checkin && out.get(p.id)?.status === 'confirmed');
  const answers = checkinShared.length
    ? await prisma.dailyCheckin.findMany({ where: { userId: { in: checkinShared.map((p) => p.userId!) }, date: dbDate(today) }, select: { userId: true, throwPlan: true } })
    : [];
  const outingNoteOf = (memberId: string, userId: string | null): string | null => {
    const o = out.get(memberId);
    const plan = answers.find((x) => x.userId === userId)?.throwPlan ?? null;
    if (!o || !plan || !checkinShared.some((p) => p.id === memberId) || !isOutingRole(o.role) || !PITCHING_ROLES.includes(o.role)) return null;
    const one = { orgId, orgName: c.org.name, eventId, date: toDateKey(event.date), role: o.role, pitchLimit: o.pitchLimit };
    return outingConflicts({ today, outings: [one], throwPlanToday: plan, calendarOutings: [] }).length ? `선수 일정과 달라요 — 오늘 체크인 '${plan}'` : null;
  };
  const ownOf = (memberId: string, userId: string | null) => {
    if (!userId || !sharing.some((p) => p.id === memberId)) return 0;
    const ids = new Set(planItems.filter((p) => p.targets.includes(memberId)).flatMap((p) => p.ids));
    return own.filter((x) => x.userId === userId && ids.has(x.exerciseId)).length;
  };
  const members = players
    .filter((p) => targets.includes(p.id))
    .map((p) => {
      const a = att.get(p.id);
      const o = out.get(p.id);
      return {
        memberId: p.id,
        nickname: p.nickname,
        tags: p.tags,
        hasUser: !!p.userId,
        canTrain: !!p.userId && memberScope(p.consent, true).training,
        reply: a?.reply && isAttendReply(a.reply) ? a.reply : null,
        note: a?.note ?? null,
        attended: a?.attended ?? null,
        recordedSets: p.userId ? (setsOf.get(p.userId) ?? 0) : 0,
        ownSets: ownOf(p.id, p.userId),
        outingNote: outingNoteOf(p.id, p.userId),
        outing: o && isOutingRole(o.role) ? { role: o.role, pitchLimit: o.pitchLimit, status: o.status } : null,
      };
    });
  return {
    ok: true,
    kind: c.org.kind,
    todayKey: toDateKey(appNow()),
    event: { ...event, date: toDateKey(event.date) },
    members,
    plans: await Promise.all(
      plans.map(async (p) => ({ id: p.id, title: p.title, memberIds: p.memberIds, targets: planMemberIds(p.memberIds, targets), lines: await linesOf(p.items) }))
    ),
    counts: replyCounts(members.map((m) => m.reply)),
  };
}

/** 실제 참석 확인 — true 왔어요 · false 안 왔어요 · null 지우기 */
export async function setAttended(orgId: string, eventId: string, memberId: string, attended: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const event = await eventOf(orgId, eventId);
  if (!event) return { ok: false, error: '일정을 찾을 수 없어요.' };
  const players = await activePlayers(orgId);
  if (!eventMemberIds(event, players.map((p) => p.id)).includes(memberId)) return { ok: false, error: '이 일정의 선수가 아니에요.' };
  const value = attended === true || attended === false ? attended : null;
  await prisma.orgEventAttendee.upsert({
    where: { eventId_memberId: { eventId, memberId } },
    create: { eventId, memberId, attended: value },
    update: { attended: value },
  });
  return { ok: true };
}

/** '모두 왔어요' — 못 간다고 답한 선수 빼고 모두 참석으로 */
export async function markAllAttended(orgId: string, eventId: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const event = await eventOf(orgId, eventId);
  if (!event) return { ok: false, error: '일정을 찾을 수 없어요.' };
  const players = await activePlayers(orgId);
  const targets = eventMemberIds(event, players.map((p) => p.id));
  const rows = await prisma.orgEventAttendee.findMany({ where: { eventId }, select: { memberId: true, reply: true } });
  const no = new Set(rows.filter((r) => r.reply === 'no').map((r) => r.memberId));
  const ids = targets.filter((id) => !no.has(id));
  await prisma.$transaction(
    ids.map((memberId) =>
      prisma.orgEventAttendee.upsert({ where: { eventId_memberId: { eventId, memberId } }, create: { eventId, memberId, attended: true }, update: { attended: true } })
    )
  );
  return { ok: true, count: ids.length };
}

/* ── 코치: 훈련 메뉴 ── */

export async function savePlan(orgId: string, eventId: string, input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const event = await eventOf(orgId, eventId);
  if (!event) return { ok: false, error: '일정을 찾을 수 없어요.' };
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, PLAN_TITLE_MAX) : '';
  if (!title) return { ok: false, error: '메뉴 이름을 적어 주세요(예: 투수조).' };
  const [ex, gd, players] = await Promise.all([visibleExercises(), trainingGuides(), activePlayers(orgId)]);
  const items = cleanHomeworkItems(o.items, { exercises: new Set(ex.map((e) => e.id)), guides: new Set(gd.map((g) => g.id)) });
  if ('error' in items) return { ok: false, error: items.error.replace(/숙제/g, '메뉴') };
  const memberIds = cleanPlanMembers(o.memberIds, eventMemberIds(event, players.map((p) => p.id)));
  const id = typeof o.id === 'string' && o.id ? o.id : null;
  if (id) {
    const r = await prisma.orgPlan.updateMany({ where: { id, eventId, orgId }, data: { title, items, memberIds } });
    if (!r.count) return { ok: false, error: '메뉴를 찾을 수 없어요.' };
    return { ok: true, id };
  }
  /* 같은 메뉴를 다시 보냈으면(신호 끊김 뒤 재전송) 그 메뉴를 돌려준다 */
  const recent = await prisma.orgPlan.findMany({
    where: { eventId, createdById: c.user.id, title, createdAt: { gte: new Date(appNowMs() - ORG_DUPLICATE_MS) } },
    select: { id: true, items: true, memberIds: true },
  });
  const same = recent.find((p) => JSON.stringify(p.items) === JSON.stringify(items) && p.memberIds.join() === memberIds.join());
  if (same) return { ok: true, id: same.id };
  const made = await prisma.orgPlan.create({ data: { orgId, eventId, title, items, memberIds, createdById: c.user.id }, select: { id: true } });
  return { ok: true, id: made.id };
}

export async function deletePlan(orgId: string, planId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const r = await prisma.orgPlan.deleteMany({ where: { id: planId, orgId } });
  return r.count ? { ok: true } : { ok: false, error: '메뉴를 찾을 수 없어요.' };
}

/** 메뉴 고치기 화면 — 적은 값 그대로. 새 메뉴(빈 번호) · 그새 지운 메뉴는 plan null(앱 useLoad 가 ok:false 면 화면을 떠나서) */
export async function loadPlan(
  orgId: string,
  planId: string
): Promise<{ ok: false; to: string } | { ok: true; plan: { id: string; eventId: string; title: string; items: unknown; memberIds: string[] } | null }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const p = planId
    ? await prisma.orgPlan.findFirst({ where: { id: planId, orgId }, select: { id: true, eventId: true, title: true, items: true, memberIds: true } })
    : null;
  return { ok: true, plan: p ? { ...p, items: readHomeworkItems(p.items) } : null };
}

/* ── 코치: 수행일지 — 선수의 그날 운동 판에 코치 세트로(writeOrgWork) ── */

type WorkCheck = { ok: true; userId: string; dateKey: string } | { ok: false; error: string };

async function workTarget(orgId: string, eventId: string, memberId: string): Promise<WorkCheck & { event?: NonNullable<Awaited<ReturnType<typeof eventOf>>> }> {
  const event = await eventOf(orgId, eventId);
  if (!event) return { ok: false, error: '일정을 찾을 수 없어요.' };
  const dateKey = toDateKey(event.date);
  if (dateKey > toDateKey(appNow())) return { ok: false, error: '아직 오지 않은 일정이에요. 끝난 뒤에 기록해 주세요.' };
  const players = await activePlayers(orgId);
  const p = players.find((x) => x.id === memberId);
  if (!p || !eventMemberIds(event, players.map((x) => x.id)).includes(memberId)) return { ok: false, error: '이 일정의 선수가 아니에요.' };
  if (!p.userId) return { ok: false, error: '가입 전 자리라 선수 기록에 남길 수 없어요.' };
  if (!memberScope(p.consent, true).training) return { ok: false, error: '트레이닝 공유를 안 켜서 선수 기록에 남길 수 없어요.' };
  return { ok: true, userId: p.userId, dateKey, event };
}

/** 그 선수가 대상인 메뉴들 */
async function plansFor(eventId: string, memberId: string, targets: readonly string[]) {
  const plans = await prisma.orgPlan.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' }, select: { items: true, memberIds: true } });
  return plans.filter((p) => planMemberIds(p.memberIds, targets).includes(memberId)).map((p) => ({ items: readHomeworkItems(p.items) }));
}

async function defaultsOf(ids: string[]) {
  const ex = await exercisesByIds(ids);
  return new Map(ex.map((e) => [e.id, { sets: e.sets, reps: e.reps, holdSeconds: e.holdSeconds }]));
}

/**
 * 선수 한 명의 수행 기록 — 'plan' 메뉴대로 했어요 · 'clear' 기록 빼기 · 'custom' 고친 기록(items). 이 일정의 코치 세트를 통째로 바꾼다(다시 보내도 같은 결과).
 * 'plan' 은 선수가 그날 메뉴의 운동을 직접 남겼으면 멈추고 own(그 세트 수)을 돌려준다 — 같은 훈련을 두 번 세지 않게(계약 9-6 ①-6 F, 결정 3).
 * 따로 한 운동이면 'plan-anyway' 로 다시 보낸다.
 */
export async function recordWork(
  orgId: string,
  eventId: string,
  memberId: string,
  mode: unknown,
  custom?: unknown
): Promise<{ ok: true; sets: number } | { ok: false; error: string; own?: number }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const t = await workTarget(orgId, eventId, memberId);
  if (!t.ok) return t;
  let items: OrgWorkItem[];
  if (mode === 'clear') items = [];
  else if (mode === 'custom') {
    const all = await allExercises();
    const clean = cleanOrgWork(custom, new Set(all.map((e) => e.id)));
    if ('error' in clean) return { ok: false, error: clean.error };
    items = clean;
  } else if (mode === 'plan' || mode === 'plan-anyway') {
    const players = await activePlayers(orgId);
    const plans = await plansFor(eventId, memberId, eventMemberIds(t.event!, players.map((p) => p.id)));
    if (plans.length === 0) return { ok: false, error: '이 선수가 할 메뉴가 없어요. 메뉴를 먼저 만들어 주세요.' };
    const ids = plans.flatMap((p) => p.items.map((i) => i.exerciseId).filter((x): x is string => !!x));
    const own = mode === 'plan' ? (await ownSetsOn([t.userId], t.dateKey, ids)).length : 0;
    if (own)
      return { ok: false, own, error: `선수가 그날 이 메뉴의 운동을 직접 남겼어요(${own}세트). 같은 훈련이면 남기지 마세요 — 두 번 셈해져요.` };
    items = planWork(plans, await defaultsOf(ids));
    if (items.length === 0) return { ok: false, error: '메뉴에 운동이 없어요(드릴은 선수 운동 기록에 안 들어가요).' };
  } else return { ok: false, error: '기록 방법을 골라 주세요.' };
  await writeOrgWork({ userId: t.userId, dateKey: t.dateKey, orgEventId: eventId, enteredById: c.user.id, items });
  revalidatePath('/manage');
  return { ok: true, sets: items.reduce((n, i) => n + i.sets.length, 0) };
}

/** 일정을 지우거나 취소하기 전 — 남긴 수행일지가 있나(있으면 앱이 '수행일지도 뺄까요'를 묻는다, 결정 4) */
export async function loadEventWork(orgId: string, eventId: string): Promise<{ ok: false; to: string } | { ok: true; sets: number; players: number }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  if (!(await eventOf(orgId, eventId))) return { ok: true, sets: 0, players: 0 };
  return { ok: true, ...(await eventWorkOf(eventId)) };
}

/** 참석한 선수 모두 '메뉴대로' — 참석 확인(왔어요)한 선수 가운데 선수 기록에 남길 수 있고 메뉴가 있는 사람만 */
export async function recordAttendedAsPlan(orgId: string, eventId: string): Promise<{ ok: true; done: number; skipped: number; own: number } | { ok: false; error: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const came = await prisma.orgEventAttendee.findMany({ where: { eventId, attended: true }, select: { memberId: true } });
  if (came.length === 0) return { ok: false, error: '참석 확인(왔어요)한 선수가 없어요. 참석부터 확인해 주세요.' };
  let done = 0;
  let skipped = 0;
  /* 선수가 직접 남긴 사람은 건너뛴다(한 명씩 '따로 한 운동'으로 남길 수 있다) */
  let own = 0;
  for (const a of came) {
    const r = await recordWork(orgId, eventId, a.memberId, 'plan');
    if (r.ok) done += 1;
    else if (r.own) own += 1;
    else skipped += 1;
  }
  return { ok: true, done, skipped, own };
}

/** 고친 기록 화면 — 이 일정에서 남긴 코치 세트(없으면 메뉴 처방을 미리 채움) */
export async function loadMemberWork(
  orgId: string,
  eventId: string,
  memberId: string
): Promise<
  | { ok: false; to: string }
  | { ok: true; nickname: string; recorded: boolean; items: { exerciseId: string; name: string; sets: { weightKg: number | null; reps: number | null; holdSeconds: number | null }[] }[] }
> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const event = await eventOf(orgId, eventId);
  if (!event) return NO_ACCESS;
  const players = await activePlayers(orgId);
  const p = players.find((x) => x.id === memberId);
  if (!p) return NO_ACCESS;
  const names = new Map((await allExercises()).map((e) => [e.id, e.title]));
  const sets = p.userId
    ? await prisma.userExerciseSet.findMany({
        where: { userId: p.userId, orgEventId: eventId },
        orderBy: [{ exerciseId: 'asc' }, { setNo: 'asc' }],
        select: { exerciseId: true, weightKg: true, reps: true, holdSeconds: true },
      })
    : [];
  let items: OrgWorkItem[];
  if (sets.length) {
    const by = new Map<string, OrgWorkItem['sets']>();
    for (const s of sets) by.set(s.exerciseId, [...(by.get(s.exerciseId) ?? []), { weightKg: s.weightKg, reps: s.reps, holdSeconds: s.holdSeconds }]);
    items = [...by].map(([exerciseId, list]) => ({ exerciseId, sets: list }));
  } else {
    const plans = await plansFor(eventId, memberId, eventMemberIds(event, players.map((x) => x.id)));
    const ids = plans.flatMap((pl) => pl.items.map((i) => i.exerciseId).filter((x): x is string => !!x));
    items = planWork(plans, await defaultsOf(ids));
  }
  return { ok: true, nickname: p.nickname, recorded: sets.length > 0, items: items.map((i) => ({ ...i, name: names.get(i.exerciseId) ?? '지운 운동' })) };
}

/* ── 코치: 등판 계획 ── */

/** 선수 한 명의 등판 — role null 이면 지운다. 고치면 다시 '짜는 중'(확정은 따로) */
export async function saveOuting(orgId: string, eventId: string, memberId: string, role: unknown, pitchLimit: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const event = await eventOf(orgId, eventId);
  if (!event) return { ok: false, error: '일정을 찾을 수 없어요.' };
  const players = await activePlayers(orgId);
  if (!eventMemberIds(event, players.map((p) => p.id)).includes(memberId)) return { ok: false, error: '이 일정의 선수가 아니에요.' };
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

/* ── 코치: '훈련' 탭(S단계) — 지난 2주 · 다가오는 2주 팀 일정의 메뉴와 수행일지 남김 ── */

export type TrainingRow = {
  id: string;
  date: string;
  time: string | null;
  kind: string;
  title: string;
  plans: string[];
  /** 수행일지를 남긴 선수 수 */
  recorded: number;
  /** 왔어요로 확인한 선수 수 */
  attended: number;
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
    select: { id: true, date: true, time: true, kind: true, title: true },
  });
  const ids = events.map((e) => e.id);
  const [plans, sets, came] = ids.length
    ? await Promise.all([
        prisma.orgPlan.findMany({ where: { eventId: { in: ids } }, orderBy: { createdAt: 'asc' }, select: { eventId: true, title: true } }),
        prisma.userExerciseSet.groupBy({ by: ['orgEventId', 'userId'], where: { orgEventId: { in: ids } } }),
        prisma.orgEventAttendee.groupBy({ by: ['eventId'], where: { eventId: { in: ids }, attended: true }, _count: { _all: true } }),
      ])
    : [[], [], []];
  return {
    ok: true,
    todayKey,
    rows: events.map((e) => ({
      id: e.id,
      date: toDateKey(e.date),
      time: e.time,
      kind: e.kind,
      title: e.title,
      plans: plans.filter((p) => p.eventId === e.id).map((p) => p.title),
      recorded: sets.filter((s) => s.orgEventId === e.id).length,
      attended: came.find((a) => a.eventId === e.id)?._count._all ?? 0,
    })),
  };
}

/* ── 선수: 다가오는 일정 · 참석 응답 · 메뉴 · 확정된 등판 · 공지 읽음 ── */

export type MyEventView = {
  id: string;
  date: string;
  time: string | null;
  kind: string;
  title: string;
  reply: AttendReply | null;
  note: string | null;
  plans: { title: string; lines: Line[] }[];
  outing: { role: OutingRole; pitchLimit: number | null } | null;
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
    select: { id: true, date: true, time: true, kind: true, title: true, memberId: true },
  });
  const ids = events.map((e) => e.id);
  const [att, plans, outings, players] = await Promise.all([
    prisma.orgEventAttendee.findMany({ where: { eventId: { in: ids }, memberId: r.m.id } }),
    prisma.orgPlan.findMany({ where: { eventId: { in: ids } }, orderBy: { createdAt: 'asc' }, select: { eventId: true, title: true, items: true, memberIds: true } }),
    prisma.orgOuting.findMany({ where: { eventId: { in: ids }, memberId: r.m.id, status: 'confirmed' } }),
    prisma.orgMember.findMany({ where: { orgId: r.m.org.id, role: 'PLAYER', status: 'ACTIVE' }, select: { id: true } }),
  ]);
  const all = players.map((p) => p.id);
  return {
    ok: true,
    todayKey: today,
    recent: await myRecentWork(r.m.org.id, r.user.id, today),
    outingCheck: await myOutingCheck(r.m.org.id, r.user.id, today),
    events: await Promise.all(
      events.map(async (e) => {
        const a = att.find((x) => x.eventId === e.id);
        const o = outings.find((x) => x.eventId === e.id);
        const targets = eventMemberIds(e, all);
        const mine = plans.filter((p) => p.eventId === e.id && planMemberIds(p.memberIds, targets).includes(r.m.id));
        return {
          id: e.id,
          date: toDateKey(e.date),
          time: e.time,
          kind: e.kind,
          title: e.title,
          reply: a?.reply && isAttendReply(a.reply) ? a.reply : null,
          note: a?.note ?? null,
          plans: await Promise.all(mine.map(async (p) => ({ title: p.title, lines: await linesOf(p.items) }))),
          outing: o && isOutingRole(o.role) ? { role: o.role, pitchLimit: o.pitchLimit } : null,
        };
      })
    ),
  };
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
    where: { userId, orgEventId: { in: events.map((e) => e.id) } },
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

/** 참석 응답 — 가요 · 못 가요 · 아직 몰라요(+ 한 줄) */
export async function replyEvent(memberId: string, eventId: string, reply: unknown, note: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await myMember(memberId);
  if (!r || r.m.status !== 'ACTIVE') return { ok: false, error: '응답할 수 없어요.' };
  if (!isAttendReply(reply)) return { ok: false, error: '가요 · 못 가요 · 아직 몰라요 가운데 골라 주세요.' };
  const event = await prisma.orgEvent.findFirst({ where: { id: eventId, orgId: r.m.org.id, OR: [{ memberId: null }, { memberId: r.m.id }] }, select: { id: true } });
  if (!event) return { ok: false, error: '일정을 찾을 수 없어요.' };
  const text = typeof note === 'string' ? note.trim().slice(0, ATTEND_NOTE_MAX) || null : null;
  await prisma.orgEventAttendee.upsert({
    where: { eventId_memberId: { eventId, memberId: r.m.id } },
    create: { eventId, memberId: r.m.id, reply, note: text },
    update: { reply, note: text },
  });
  return { ok: true };
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
