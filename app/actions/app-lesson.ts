'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { notify, notifyMany } from '@/lib/notify';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { isDateKey } from '@/lib/org/rules';
import { trainingGuides, visibleExercises, allExercises, allGuides } from '@/lib/library-cache';
import { coachOrg, myMember } from '@/lib/org/app-access';
import { commentCounts } from '@/lib/org/comment-load';
import {
  COACH_STATUSES,
  PLAYER_STATUSES,
  cleanHomeworkItems,
  homeworkDose,
  homeworkProgress,
  isHomeworkStatus,
  isOpenHomework,
  readHomeworkItems,
  type HomeworkStatus,
} from '@/lib/org/homework';
import { addToTodayPlan } from '@/app/actions/plan-edit';
import { COMMENT_KIND_LABEL, cleanCommentBody, isPlayerCommentKind, commentTarget, type CommentKind, type CommentTarget } from '@/lib/org/comments';

/**
 * 팀 · 레슨장 2단계(docs/designs/sinker-team-lesson-contract.md 3절)의 앱 동작 — 숙제(OrgAssignment). JSON 인자 · JSON 답, /api/rpc/app-lesson.<함수>.
 * 코치 쪽은 lib/org/app-access.ts coachOrg, 선수 쪽은 myMember. 숙제는 라이브러리 운동 · 드릴만(lib/org/homework.ts).
 * 완료는 선수의 실제 기록(운동 기록 · 드릴 기록)을 읽을 때 맞춘다(settleHomework) — 운동 화면 코드는 안 건드린다.
 */

const NO_ACCESS = { ok: false as const, to: '/today' };

export type HomeworkLine = { name: string; dose: string; kind: 'exercise' | 'drill' };
export type HomeworkView = {
  id: string;
  status: HomeworkStatus;
  key: string;
  due: string | null;
  doneKey: string | null;
  lines: HomeworkLine[];
  /** 오늘 운동에 넣을 수 있는 운동이 있나(드릴만이면 없음) */
  hasExercise: boolean;
  /** 이 숙제에 단 말 수 · 회원이 쓴 안 푼 말 수 */
  talk: { total: number; open: number };
};

/** 숙제 고르기용 라이브러리 — 트레이닝이 고를 수 있는 운동 · 드릴만(숨김 · '나중에 촬영' 뺌) */
export async function loadHomeworkLibrary(orgId: string): Promise<
  | { ok: false; to: string }
  | { ok: true; exercises: { id: string; name: string; category: string }[]; drills: { id: string; name: string; category: string }[] }
> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const [ex, gd] = await Promise.all([visibleExercises(), trainingGuides()]);
  return {
    ok: true,
    exercises: ex.map((e) => ({ id: e.id, name: e.title, category: e.category })),
    drills: gd.map((g) => ({ id: g.id, name: g.title, category: g.category })),
  };
}

/** 숙제 내기 — 회원 한 명에 한 줄. 일지에서 냈으면 noteId */
export async function assignHomework(
  orgId: string,
  memberId: string,
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const member = await prisma.orgMember.findFirst({
    where: { id: memberId, orgId, role: 'PLAYER', status: 'ACTIVE' },
    select: { id: true, userId: true },
  });
  if (!member) return { ok: false, error: '회원을 찾을 수 없어요.' };
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const [ex, gd] = await Promise.all([visibleExercises(), trainingGuides()]);
  const items = cleanHomeworkItems(o.items, { exercises: new Set(ex.map((e) => e.id)), guides: new Set(gd.map((g) => g.id)) });
  if ('error' in items) return { ok: false, error: items.error };
  const due = typeof o.dueDate === 'string' && o.dueDate ? o.dueDate : null;
  if (due && !isDateKey(due)) return { ok: false, error: '기한 날짜가 올바르지 않아요.' };
  if (due && due < toDateKey(appNow())) return { ok: false, error: '기한은 오늘부터 고를 수 있어요.' };
  let noteId: string | null = null;
  if (typeof o.noteId === 'string' && o.noteId) {
    const note = await prisma.lessonNote.findFirst({ where: { id: o.noteId, memberId: member.id }, select: { id: true } });
    noteId = note?.id ?? null;
  }
  await prisma.orgAssignment.create({
    data: { orgId, memberId: member.id, noteId, assignedById: c.user.id, items, dueDate: due ? dbDate(due) : null },
  });
  if (member.userId)
    await notify(member.userId, { kind: 'lesson', title: '코치가 숙제를 냈어요', body: `${items.length}가지`, link: '/me#lessons' });
  revalidatePath('/manage');
  return { ok: true };
}

/** 코치가 숙제 상태 바꾸기 — 안 함으로 되돌림 · 면제 · 취소(완료는 선수 기록으로만) */
export async function setHomeworkStatus(orgId: string, id: string, status: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  if (!isHomeworkStatus(status) || !COACH_STATUSES.includes(status)) return { ok: false, error: '바꿀 수 없는 상태예요.' };
  const a = await prisma.orgAssignment.updateMany({
    where: { id, orgId },
    data: { status, ...(status === 'assigned' ? { doneAt: null, doneSessionId: null } : {}) },
  });
  return a.count ? { ok: true } : { ok: false, error: '숙제를 찾을 수 없어요.' };
}

/**
 * 선수 기록으로 숙제 맞추기 — 아직 할 숙제마다 낸 날부터의 운동 · 드릴 기록을 보고 모두 했으면 '완료'(그날 운동 판을 가리킴),
 * 하나라도 했으면 '하는 중'. 읽을 때마다 부른다(코치 · 선수 화면 모두). 계정이 없는 자리는 손으로만.
 */
async function settleHomework(userId: string | null, rows: { id: string; status: string; createdAt: Date; items: unknown }[]) {
  const open = rows.filter((r) => isOpenHomework(r.status));
  if (!userId || open.length === 0) return new Map<string, { status: HomeworkStatus; doneAt: Date | null }>();
  const items = open.map((r) => readHomeworkItems(r.items));
  const from = dbDate(toDateKey(new Date(Math.min(...open.map((r) => r.createdAt.getTime())))));
  const exIds = [...new Set(items.flat().map((i) => i.exerciseId).filter((x): x is string => !!x))];
  const gIds = [...new Set(items.flat().map((i) => i.guideId).filter((x): x is string => !!x))];
  const [exLogs, drillLogs] = await Promise.all([
    exIds.length
      ? prisma.userExerciseLog.findMany({
          where: { userId, exerciseId: { in: exIds }, date: { gte: from }, OR: [{ completed: true }, { setsDone: { gt: 0 } }] },
          select: { exerciseId: true, date: true },
        })
      : [],
    gIds.length ? prisma.userDrillLog.findMany({ where: { userId, guideId: { in: gIds }, date: { gte: from }, done: true }, select: { guideId: true, date: true } }) : [],
  ]);
  const changed = new Map<string, { status: HomeworkStatus; doneAt: Date | null }>();
  for (const [i, r] of open.entries()) {
    const since = toDateKey(r.createdAt);
    const ex = exLogs.filter((l) => toDateKey(l.date) >= since);
    const dr = drillLogs.filter((l) => toDateKey(l.date) >= since);
    const p = homeworkProgress(items[i], new Set(ex.map((l) => l.exerciseId)), new Set(dr.map((l) => l.guideId)));
    if (p === 'all') {
      const last = [...ex, ...dr].map((l) => l.date).sort((a, b) => b.getTime() - a.getTime())[0];
      const session = await prisma.trainingSession.findFirst({ where: { userId, date: last }, select: { id: true } });
      await prisma.orgAssignment.update({ where: { id: r.id }, data: { status: 'done', doneAt: appNow(), doneSessionId: session?.id ?? null } });
      changed.set(r.id, { status: 'done', doneAt: appNow() });
    } else if (p === 'some' && r.status === 'assigned') {
      await prisma.orgAssignment.update({ where: { id: r.id }, data: { status: 'in_progress' } });
      changed.set(r.id, { status: 'in_progress', doneAt: null });
    }
  }
  return changed;
}

/** 회원 한 명의 숙제(새 것부터 20) — 기록으로 맞춘 뒤 */
async function homeworkOf(memberId: string, userId: string | null): Promise<HomeworkView[]> {
  const rows = await prisma.orgAssignment.findMany({
    where: { memberId, status: { not: 'canceled' } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, status: true, createdAt: true, items: true, dueDate: true, doneAt: true },
  });
  const changed = await settleHomework(userId, rows);
  const [ex, gd, talk] = await Promise.all([
    allExercises(),
    allGuides(),
    commentCounts(
      rows.map((r) => ({ assignmentId: r.id })),
      userId
    ),
  ]);
  const exName = new Map(ex.map((e) => [e.id, e.title]));
  const gName = new Map(gd.map((g) => [g.id, g.title]));
  return rows.map((r) => {
    const now = changed.get(r.id);
    const status = (now?.status ?? r.status) as HomeworkStatus;
    const doneAt = now ? now.doneAt : r.doneAt;
    const items = readHomeworkItems(r.items);
    return {
      id: r.id,
      status,
      key: toDateKey(r.createdAt),
      due: r.dueDate ? toDateKey(r.dueDate) : null,
      doneKey: doneAt ? toDateKey(doneAt) : null,
      hasExercise: items.some((i) => i.exerciseId),
      talk: talk.get(r.id) ?? { total: 0, open: 0 },
      lines: items.map((i) => ({
        name: (i.exerciseId ? exName.get(i.exerciseId) : i.guideId ? gName.get(i.guideId) : null) ?? '지운 운동',
        dose: homeworkDose(i),
        kind: i.exerciseId ? ('exercise' as const) : ('drill' as const),
      })),
    };
  });
}

/** 코치: 회원 카드의 숙제 */
export async function loadMemberHomework(orgId: string, memberId: string): Promise<{ ok: false; to: string } | { ok: true; homework: HomeworkView[] }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const m = await prisma.orgMember.findFirst({ where: { id: memberId, orgId, role: 'PLAYER' }, select: { id: true, userId: true } });
  if (!m) return NO_ACCESS;
  return { ok: true, homework: await homeworkOf(m.id, m.userId) };
}

/** 선수: 내 숙제 */
export async function loadMyHomework(memberId: string): Promise<{ ok: false; to: string } | { ok: true; homework: HomeworkView[] }> {
  const r = await myMember(memberId);
  if (!r) return NO_ACCESS;
  return { ok: true, homework: await homeworkOf(r.m.id, r.user.id) };
}

/** 선수: '하는 중' · '했어요'(기록 없이 했을 때) */
export async function markMyHomework(memberId: string, id: string, status: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await myMember(memberId);
  if (!r) return { ok: false, error: '숙제를 찾을 수 없어요.' };
  if (!isHomeworkStatus(status) || !PLAYER_STATUSES.includes(status)) return { ok: false, error: '바꿀 수 없는 상태예요.' };
  const a = await prisma.orgAssignment.updateMany({
    where: { id, memberId: r.m.id, status: { in: ['assigned', 'in_progress'] } },
    data: { status, doneAt: status === 'done' ? appNow() : null },
  });
  return a.count ? { ok: true } : { ok: false, error: '이미 끝났거나 없는 숙제예요.' };
}

/** 선수: 숙제의 운동을 오늘 운동 목록에 넣기(트레이닝에서 하면 그 기록으로 숙제가 완료된다) — 오늘 일정이 있어야 한다 */
export async function homeworkToToday(memberId: string, id: string): Promise<{ ok: boolean; added: number; error?: string }> {
  const r = await myMember(memberId);
  if (!r) return { ok: false, added: 0, error: '숙제를 찾을 수 없어요.' };
  const a = await prisma.orgAssignment.findFirst({ where: { id, memberId: r.m.id }, select: { items: true, status: true } });
  if (!a || !isOpenHomework(a.status)) return { ok: false, added: 0, error: '이미 끝났거나 없는 숙제예요.' };
  const ids = readHomeworkItems(a.items)
    .map((i) => i.exerciseId)
    .filter((x): x is string => !!x);
  if (ids.length === 0) return { ok: false, added: 0, error: '오늘 운동에 넣을 운동이 없어요(드릴만 있어요).' };
  let added = 0;
  for (const exId of ids) {
    const res = await addToTodayPlan(exId);
    if ('ok' in res) added += 1;
    else if (res.error === '오늘 만들어 둔 일정이 없어요.') return { ok: false, added: 0, error: '트레이닝에서 오늘 운동을 먼저 만들어 주세요.' };
  }
  if (a.status === 'assigned') await prisma.orgAssignment.update({ where: { id }, data: { status: 'in_progress' } });
  return { ok: true, added };
}

/* ── 일지 · 숙제에 다는 말 · 코치 '받은 것'(2단계) ── */

export type CommentView = {
  id: string;
  kind: CommentKind;
  body: string;
  key: string;
  byCoach: boolean;
  author: string | null;
  mine: boolean;
  resolved: boolean;
};

/** 그 자리가 이 회원(조직)의 것인가 — 회원 id · 조직 id 를 돌려준다 */
async function targetOwner(t: CommentTarget): Promise<{ memberId: string; orgId: string; userId: string | null } | null> {
  if ('noteId' in t) {
    const n = await prisma.lessonNote.findUnique({ where: { id: t.noteId }, select: { memberId: true, member: { select: { orgId: true, userId: true } } } });
    return n ? { memberId: n.memberId, orgId: n.member.orgId, userId: n.member.userId } : null;
  }
  const a = await prisma.orgAssignment.findUnique({ where: { id: t.assignmentId }, select: { memberId: true, orgId: true } });
  if (!a) return null;
  const m = await prisma.orgMember.findUnique({ where: { id: a.memberId }, select: { userId: true } });
  return { memberId: a.memberId, orgId: a.orgId, userId: m?.userId ?? null };
}

async function threadOf(t: CommentTarget, memberUserId: string | null, viewerId: string): Promise<CommentView[]> {
  const rows = await prisma.orgComment.findMany({
    where: 'noteId' in t ? { noteId: t.noteId } : { assignmentId: t.assignmentId },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { id: true, kind: true, body: true, createdAt: true, authorId: true, resolvedAt: true },
  });
  const authors = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } }, select: { id: true, nickname: true } });
  const nameOf = new Map(authors.map((a) => [a.id, a.nickname]));
  return rows.map((r) => ({
    id: r.id,
    kind: (r.kind in COMMENT_KIND_LABEL ? r.kind : 'comment') as CommentKind,
    body: r.body,
    key: toDateKey(r.createdAt),
    byCoach: r.authorId !== memberUserId,
    author: nameOf.get(r.authorId) ?? null,
    mine: r.authorId === viewerId,
    resolved: r.resolvedAt != null,
  }));
}

/** 코치: 일지 · 숙제 하나의 말 */
export async function loadCoachThread(orgId: string, kind: unknown, id: unknown): Promise<{ ok: false; to: string } | { ok: true; comments: CommentView[] }> {
  const c = await coachOrg(orgId);
  const t = commentTarget(kind, id);
  if (!c || !t) return NO_ACCESS;
  const owner = await targetOwner(t);
  if (!owner || owner.orgId !== orgId) return NO_ACCESS;
  return { ok: true, comments: await threadOf(t, owner.userId, c.user.id) };
}

/** 선수: 내 일지 · 숙제 하나의 말 */
export async function loadMyThread(memberId: string, kind: unknown, id: unknown): Promise<{ ok: false; to: string } | { ok: true; comments: CommentView[] }> {
  const r = await myMember(memberId);
  const t = commentTarget(kind, id);
  if (!r || !t) return NO_ACCESS;
  const owner = await targetOwner(t);
  if (!owner || owner.memberId !== r.m.id) return NO_ACCESS;
  return { ok: true, comments: await threadOf(t, r.user.id, r.user.id) };
}

/** 코치가 말 달기 — 그 자리에서 안 푼 회원 말은 답한 것으로 푼다 */
export async function addCoachComment(orgId: string, kind: unknown, id: unknown, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  const t = commentTarget(kind, id);
  const text = cleanCommentBody(body);
  if (!c || !t) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  if (!text) return { ok: false, error: '할 말을 적어 주세요.' };
  const owner = await targetOwner(t);
  if (!owner || owner.orgId !== orgId) return { ok: false, error: '일지 · 숙제를 찾을 수 없어요.' };
  const where = 'noteId' in t ? { noteId: t.noteId } : { assignmentId: t.assignmentId };
  await prisma.$transaction([
    prisma.orgComment.create({ data: { orgId, memberId: owner.memberId, ...where, authorId: c.user.id, kind: 'comment', body: text } }),
    ...(owner.userId ? [prisma.orgComment.updateMany({ where: { ...where, authorId: owner.userId, resolvedAt: null }, data: { resolvedAt: appNow() } })] : []),
  ]);
  if (owner.userId) await notify(owner.userId, { kind: 'lesson', title: '코치가 답을 남겼어요', body: text.slice(0, 60), link: '/me#lessons' });
  return { ok: true };
}

/** 선수가 질문 · 정정 요청 — 떠난 곳은 못 쓴다. 조직 대표와 그 일지를 쓴 코치에게 알림 */
export async function addMyComment(memberId: string, place: unknown, id: unknown, kind: unknown, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await myMember(memberId);
  const t = commentTarget(place, id);
  const text = cleanCommentBody(body);
  if (!r || !t || r.m.status !== 'ACTIVE') return { ok: false, error: '말을 남길 수 없어요.' };
  if (!isPlayerCommentKind(kind)) return { ok: false, error: '질문인지 정정 요청인지 골라 주세요.' };
  if (!text) return { ok: false, error: '할 말을 적어 주세요.' };
  const owner = await targetOwner(t);
  if (!owner || owner.memberId !== r.m.id) return { ok: false, error: '일지 · 숙제를 찾을 수 없어요.' };
  const where = 'noteId' in t ? { noteId: t.noteId } : { assignmentId: t.assignmentId };
  await prisma.orgComment.create({ data: { orgId: owner.orgId, memberId: r.m.id, ...where, authorId: r.user.id, kind, body: text } });
  const [org, note] = await Promise.all([
    prisma.org.findUnique({ where: { id: owner.orgId }, select: { ownerId: true } }),
    'noteId' in t ? prisma.lessonNote.findUnique({ where: { id: t.noteId }, select: { authorId: true } }) : null,
  ]);
  await notifyMany([org?.ownerId, note?.authorId].filter((x): x is string => !!x), {
    kind: 'lesson',
    title: kind === 'fix' ? '회원이 정정을 요청했어요' : '회원이 질문을 남겼어요',
    body: text.slice(0, 60),
    link: '/manage',
  });
  return { ok: true };
}

/** 코치: 받은 것 하나 풀기(답 없이 처리했을 때) */
export async function resolveComment(orgId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const r = await prisma.orgComment.updateMany({ where: { id, orgId, resolvedAt: null }, data: { resolvedAt: appNow() } });
  return r.count ? { ok: true } : { ok: false, error: '이미 풀었거나 없는 말이에요.' };
}

export type InboxItem = {
  id: string;
  memberId: string;
  nickname: string;
  kind: CommentKind;
  body: string;
  key: string;
  /** 어디에 단 말인가 — 일지(날짜) · 숙제 */
  where: string;
};

/** 코치 '받은 것' — 회원이 쓴 말 가운데 안 푼 것, 새 것부터 30 */
export async function loadInbox(orgId: string): Promise<{ ok: false; to: string } | { ok: true; items: InboxItem[] }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  const members = await prisma.orgMember.findMany({ where: { orgId, role: 'PLAYER', userId: { not: null } }, select: { id: true, userId: true, nickname: true } });
  const players = members.map((m) => m.userId!);
  const rows = players.length
    ? await prisma.orgComment.findMany({
        where: { orgId, resolvedAt: null, authorId: { in: players } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, memberId: true, kind: true, body: true, createdAt: true, noteId: true, assignmentId: true },
      })
    : [];
  const notes = await prisma.lessonNote.findMany({ where: { id: { in: rows.map((r) => r.noteId).filter((x): x is string => !!x) } }, select: { id: true, date: true } });
  const noteDay = new Map(notes.map((n) => [n.id, toDateKey(n.date)]));
  const nameOf = new Map(members.map((m) => [m.id, m.nickname]));
  return {
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      memberId: r.memberId,
      nickname: nameOf.get(r.memberId) ?? '떠난 회원',
      kind: (r.kind in COMMENT_KIND_LABEL ? r.kind : 'question') as CommentKind,
      body: r.body,
      key: toDateKey(r.createdAt),
      where: r.noteId ? `${noteDay.get(r.noteId) ?? ''} 일지` : r.assignmentId ? '숙제' : '',
    })),
  };
}
