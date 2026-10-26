'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { appNow, appNowMs } from '@/lib/clock';
import { notify, notifyMany } from '@/lib/notify';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { isDateKey, ORG_DUPLICATE_MS } from '@/lib/org/rules';
import { trainingGuides, visibleExercises, allExercises, allGuides } from '@/lib/library-cache';
import { coachOrg, myMember } from '@/lib/org/app-access';
import { ORG_LOST, orgOpenHref } from '@/lib/org/space-nav';
import { commentCounts } from '@/lib/org/comment-load';
import {
  COACH_STATUSES,
  PLAYER_STATUSES,
  cleanHomeworkItems,
  homeworkDose,
  homeworkProgress,
  homeworkWindow,
  isHomeworkStatus,
  isOpenHomework,
  isUnsettledHomework,
  readHomeworkItems,
  type HomeworkStatus,
} from '@/lib/org/homework';
import { addToTodayPlan } from '@/app/actions/plan-edit';
import {
  COMMENT_KIND_LABEL,
  NOTE_VIDEOS_MAX,
  ORG_VIDEO_MAX_BYTES,
  cleanCommentBody,
  commentTarget,
  isOwnOrgVideoPath,
  isPlayerCommentKind,
  readAtSec,
  type CommentKind,
  type CommentTarget,
} from '@/lib/org/comments';
import { createOrgVideoUploadTarget, createPlaybackUrls, deleteVideos, isStorageConfigured } from '@/lib/storage';

/**
 * 팀 · 레슨장 2단계(docs/designs/sinker-team-lesson-contract.md 3절)의 앱 동작 — 숙제(OrgAssignment). JSON 인자 · JSON 답, /api/rpc/app-lesson.<함수>.
 * 코치 쪽은 lib/org/app-access.ts coachOrg, 선수 쪽은 myMember. 숙제는 라이브러리 운동 · 드릴만(lib/org/homework.ts).
 * 완료는 선수의 실제 기록(운동 기록 · 드릴 기록)을 읽을 때 맞춘다(settleHomework) — 운동 화면 코드는 안 건드린다.
 */

/* 조직을 볼 권한이 없음 — 앱 껍데기가 가로채 공간을 다시 확인한다(계약 8-5) */
const NO_ACCESS = { ok: false as const, to: ORG_LOST };

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
  /** 완료의 근거(계약 9-6 ①-2) — true 기록(증거 세트의 운동 판) · false 코치 확인. 완료가 아니면 false */
  doneByRecord: boolean;
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
  /* 같은 숙제를 다시 보냈으면(신호 끊김 뒤 재전송) 한 줄만 · 알림도 한 번 */
  const recent = await prisma.orgAssignment.findMany({
    where: { memberId: member.id, assignedById: c.user.id, createdAt: { gte: new Date(appNowMs() - ORG_DUPLICATE_MS) } },
    select: { items: true, dueDate: true },
  });
  if (recent.some((a) => JSON.stringify(a.items) === JSON.stringify(items) && (a.dueDate ? toDateKey(a.dueDate) : null) === due)) return { ok: true };
  await prisma.orgAssignment.create({
    data: { orgId, memberId: member.id, noteId, assignedById: c.user.id, items, dueDate: due ? dbDate(due) : null },
  });
  if (member.userId)
    await notify(member.userId, { kind: 'lesson', title: '코치가 숙제를 냈어요', body: `${items.length}가지`, link: orgOpenHref(orgId, 'p', 'homework') });
  revalidatePath('/manage');
  return { ok: true };
}

/** 코치가 숙제 상태 바꾸기 — 안 함으로 되돌림 · 면제 · 취소(완료는 선수 기록으로만) */
export async function setHomeworkStatus(orgId: string, id: string, status: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  if (!isHomeworkStatus(status) || !COACH_STATUSES.includes(status)) return { ok: false, error: '바꿀 수 없는 상태예요.' };
  /* 'done' 은 코치 확인 — 기록 증거는 안 붙인다(증거는 기록으로 맞출 때만). 되돌리면 증거도 지운다 */
  const a = await prisma.orgAssignment.updateMany({
    where: { id, orgId },
    data: {
      status,
      ...(status === 'assigned' ? { doneAt: null, doneSessionId: null } : status === 'done' ? { doneAt: appNow() } : {}),
    },
  });
  return a.count ? { ok: true } : { ok: false, error: '숙제를 찾을 수 없어요.' };
}

/**
 * 선수 기록으로 숙제 맞추기(계약 9-6 ①-2) — 아직 안 끝난 숙제마다 선수가 **직접** 남긴 세트(코치 대신 세트 제외)를 낸 시각 ~ 기한(없으면 7일) 안에서 보고
 * 처방 세트 · 횟수(초)를 모두 채웠으면 '완료'(증거 = 그 세트의 운동 판), 무엇이라도 했으면 '하는 중'. 드릴 기록은 시각이 없어 낸 다음 날부터.
 * 읽을 때마다 부른다(코치 · 선수 화면 모두). 계정이 없는 자리는 손으로만. 보고 · 영상만 받은 숙제도 기록이 채워지면 기록 완료로 바꾼다.
 */
async function settleHomework(userId: string | null, rows: { id: string; status: string; createdAt: Date; dueDate: Date | null; items: unknown }[]) {
  const open = rows.filter((r) => isUnsettledHomework(r.status));
  if (!userId || open.length === 0) return new Map<string, { status: HomeworkStatus; doneAt: Date | null; doneSessionId: string | null }>();
  const items = open.map((r) => readHomeworkItems(r.items));
  const windows = open.map((r) => homeworkWindow(r.createdAt, r.dueDate));
  const from = Math.min(...windows.map((w) => w.from));
  const to = Math.max(...windows.map((w) => w.to));
  const exIds = [...new Set(items.flat().map((i) => i.exerciseId).filter((x): x is string => !!x))];
  const gIds = [...new Set(items.flat().map((i) => i.guideId).filter((x): x is string => !!x))];
  const [sets, drillLogs] = await Promise.all([
    exIds.length
      ? prisma.userExerciseSet.findMany({
          where: { userId, exerciseId: { in: exIds }, enteredById: null, recordedAt: { gte: new Date(from), lte: new Date(to) } },
          select: { exerciseId: true, reps: true, holdSeconds: true, weightKg: true, sessionId: true, recordedAt: true },
        })
      : [],
    gIds.length
      ? prisma.userDrillLog.findMany({
          where: { userId, guideId: { in: gIds }, done: true, date: { gte: dbDate(toDateKey(new Date(from))) } },
          select: { guideId: true, date: true },
        })
      : [],
  ]);
  const facts = sets.map((x) => ({ ...x, at: x.recordedAt.getTime() }));
  const changed = new Map<string, { status: HomeworkStatus; doneAt: Date | null; doneSessionId: string | null }>();
  for (const [i, r] of open.entries()) {
    const day = toDateKey(r.createdAt);
    const endKey = toDateKey(new Date(windows[i].to));
    /* 드릴 기록은 날짜뿐 — 낸 날의 기록은 낸 시각 앞일 수 있어 다음 날부터 */
    const drills = new Set(drillLogs.filter((l) => toDateKey(l.date) > day && toDateKey(l.date) <= endKey).map((l) => l.guideId));
    const p = homeworkProgress(items[i], facts, drills, windows[i]);
    if (p.progress === 'all') {
      const now = appNow();
      await prisma.orgAssignment.update({ where: { id: r.id }, data: { status: 'done', doneAt: now, doneSessionId: p.evidence } });
      changed.set(r.id, { status: 'done', doneAt: now, doneSessionId: p.evidence });
    } else if (p.progress === 'some' && r.status === 'assigned') {
      await prisma.orgAssignment.update({ where: { id: r.id }, data: { status: 'in_progress' } });
      changed.set(r.id, { status: 'in_progress', doneAt: null, doneSessionId: null });
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
    select: { id: true, status: true, createdAt: true, items: true, dueDate: true, doneAt: true, doneSessionId: true },
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
      doneByRecord: status === 'done' && !!(now ? now.doneSessionId : r.doneSessionId),
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
  /* 떠난 곳의 숙제는 안 보인다 — 떠난 회원은 받은 일지만 읽기(결정 8, 계약 8-5) */
  if (r.m.status !== 'ACTIVE') return { ok: true, homework: [] };
  return { ok: true, homework: await homeworkOf(r.m.id, r.user.id) };
}

/** 선수: '하는 중' · '했어요'(보고 — 완료 아님, 코치가 확인하거나 기록이 채워지면 완료). 옛 앱의 'done' 은 보고로 받는다 */
export async function markMyHomework(memberId: string, id: string, status: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await myMember(memberId);
  if (!r || r.m.status !== 'ACTIVE') return { ok: false, error: '숙제를 찾을 수 없어요.' };
  const next = status === 'done' ? 'reported' : status;
  if (!isHomeworkStatus(next) || !PLAYER_STATUSES.includes(next)) return { ok: false, error: '바꿀 수 없는 상태예요.' };
  const a = await prisma.orgAssignment.updateMany({
    where: { id, memberId: r.m.id, status: { in: ['assigned', 'in_progress'] } },
    data: { status: next, doneAt: null },
  });
  return a.count ? { ok: true } : { ok: false, error: '이미 끝났거나 없는 숙제예요.' };
}

/** 선수: 숙제의 운동을 오늘 운동 목록에 넣기(트레이닝에서 하면 그 기록으로 숙제가 완료된다) — 오늘 일정이 있어야 한다 */
export async function homeworkToToday(memberId: string, id: string): Promise<{ ok: boolean; added: number; error?: string }> {
  const r = await myMember(memberId);
  if (!r || r.m.status !== 'ACTIVE') return { ok: false, added: 0, error: '숙제를 찾을 수 없어요.' };
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
  /** 회원이 보낸 영상 · 코치가 말한 영상 */
  videoPath: string | null;
  /** 그 영상의 몇 초 */
  atSec: number | null;
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
    select: { id: true, kind: true, body: true, createdAt: true, authorId: true, resolvedAt: true, videoPath: true, atSec: true },
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
    videoPath: r.videoPath,
    atSec: r.atSec,
  }));
}

/** 그 자리의 영상 — 일지에 붙인 영상 + 회원이 말과 함께 보낸 영상(코치 말의 videoPath 는 이 가운데 하나를 가리킨다) */
async function targetVideos(t: CommentTarget): Promise<string[]> {
  const [note, sent] = await Promise.all([
    'noteId' in t ? prisma.lessonNote.findUnique({ where: { id: t.noteId }, select: { videoPaths: true } }) : null,
    prisma.orgComment.findMany({
      where: { ...('noteId' in t ? { noteId: t.noteId } : { assignmentId: t.assignmentId }), kind: { not: 'comment' }, videoPath: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { videoPath: true },
    }),
  ]);
  return [...new Set([...(note?.videoPaths ?? []), ...sent.map((x) => x.videoPath!)])];
}

/** 코치: 일지 · 숙제 하나의 말 */
export async function loadCoachThread(orgId: string, kind: unknown, id: unknown): Promise<{ ok: false; to: string } | { ok: true; comments: CommentView[]; videos: string[] }> {
  const c = await coachOrg(orgId);
  const t = commentTarget(kind, id);
  if (!c || !t) return NO_ACCESS;
  const owner = await targetOwner(t);
  if (!owner || owner.orgId !== orgId) return NO_ACCESS;
  const [comments, videos] = await Promise.all([threadOf(t, owner.userId, c.user.id), targetVideos(t)]);
  return { ok: true, comments, videos };
}

/** 선수: 내 일지 · 숙제 하나의 말 */
export async function loadMyThread(memberId: string, kind: unknown, id: unknown): Promise<{ ok: false; to: string } | { ok: true; comments: CommentView[]; videos: string[] }> {
  const r = await myMember(memberId);
  const t = commentTarget(kind, id);
  if (!r || !t) return NO_ACCESS;
  const owner = await targetOwner(t);
  if (!owner || owner.memberId !== r.m.id) return NO_ACCESS;
  const [comments, videos] = await Promise.all([threadOf(t, r.user.id, r.user.id), targetVideos(t)]);
  return { ok: true, comments, videos };
}

/** 코치가 말 달기 — 그 자리에서 안 푼 회원 말은 답한 것으로 푼다 */
export async function addCoachComment(
  orgId: string,
  kind: unknown,
  id: unknown,
  body: unknown,
  /** 영상 시점 말 — 그 자리의 영상 하나와 초 */
  videoPath?: unknown,
  atSec?: unknown
): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  const t = commentTarget(kind, id);
  const text = cleanCommentBody(body);
  if (!c || !t) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  if (!text) return { ok: false, error: '할 말을 적어 주세요.' };
  const owner = await targetOwner(t);
  if (!owner || owner.orgId !== orgId) return { ok: false, error: '일지 · 숙제를 찾을 수 없어요.' };
  let video: string | null = null;
  if (typeof videoPath === 'string' && videoPath) {
    if (!(await targetVideos(t)).includes(videoPath)) return { ok: false, error: '그 영상을 찾을 수 없어요.' };
    video = videoPath;
  }
  const where = 'noteId' in t ? { noteId: t.noteId } : { assignmentId: t.assignmentId };
  if (await sameComment(where, c.user.id, text, video)) return { ok: true };
  await prisma.$transaction([
    prisma.orgComment.create({
      data: { orgId, memberId: owner.memberId, ...where, authorId: c.user.id, kind: 'comment', body: text, videoPath: video, atSec: video ? readAtSec(atSec) : null },
    }),
    ...(owner.userId ? [prisma.orgComment.updateMany({ where: { ...where, authorId: owner.userId, resolvedAt: null }, data: { resolvedAt: appNow() } })] : []),
  ]);
  if (owner.userId) await notify(owner.userId, { kind: 'lesson', title: '코치가 답을 남겼어요', body: text.slice(0, 60), link: orgOpenHref(orgId, 'p', 'noteId' in t ? 'notes' : 'homework') });
  return { ok: true };
}

/** 같은 사람이 같은 자리에 같은 말을 2분 안에 또 보냈나(재전송) */
async function sameComment(where: { noteId: string } | { assignmentId: string }, authorId: string, body: string, videoPath: string | null, kind?: string): Promise<boolean> {
  const dup = await prisma.orgComment.findFirst({
    where: { ...where, authorId, body, videoPath, ...(kind ? { kind } : {}), createdAt: { gte: new Date(appNowMs() - ORG_DUPLICATE_MS) } },
    select: { id: true },
  });
  return dup != null;
}

/** 선수가 질문 · 정정 요청 — 떠난 곳은 못 쓴다. 조직 대표 · 그 일지를 쓴 코치 · 그 숙제를 낸 코치에게 알림 */
export async function addMyComment(
  memberId: string,
  place: unknown,
  id: unknown,
  kind: unknown,
  body: unknown,
  /** 내가 올린 조직 영상(myVideoUpload) — 숙제 영상(submit)은 꼭 */
  videoPath?: unknown
): Promise<{ ok: boolean; error?: string }> {
  const r = await myMember(memberId);
  const t = commentTarget(place, id);
  if (!r || !t || r.m.status !== 'ACTIVE') return { ok: false, error: '말을 남길 수 없어요.' };
  if (!isPlayerCommentKind(kind)) return { ok: false, error: '질문인지 정정 요청인지 골라 주세요.' };
  const video = videoPath == null || videoPath === '' ? null : isOwnOrgVideoPath(videoPath, r.user.id) ? videoPath : undefined;
  if (video === undefined) return { ok: false, error: '영상을 다시 올려 주세요.' };
  if (kind === 'submit' && (!video || !('assignmentId' in t))) return { ok: false, error: '숙제에 보낼 영상을 골라 주세요.' };
  const text = cleanCommentBody(body) ?? (kind === 'submit' ? '숙제 영상을 보냈어요.' : null);
  if (!text) return { ok: false, error: '할 말을 적어 주세요.' };
  const owner = await targetOwner(t);
  if (!owner || owner.memberId !== r.m.id) return { ok: false, error: '일지 · 숙제를 찾을 수 없어요.' };
  const where = 'noteId' in t ? { noteId: t.noteId } : { assignmentId: t.assignmentId };
  if (await sameComment(where, r.user.id, text, video, kind)) return { ok: true };
  await prisma.orgComment.create({ data: { orgId: owner.orgId, memberId: r.m.id, ...where, authorId: r.user.id, kind, body: text, videoPath: video } });
  /* 숙제 영상은 '영상 받음'(완료 아님 — 코치가 보고 확인하거나 기록이 채워지면 완료, 계약 9-6 ①-2) */
  if (kind === 'submit' && 'assignmentId' in t)
    await prisma.orgAssignment.updateMany({
      where: { id: t.assignmentId, memberId: r.m.id, status: { in: ['assigned', 'in_progress', 'reported'] } },
      data: { status: 'submitted' },
    });
  /* 알림은 대표 · 그 일지를 쓴 코치 · 그 숙제를 낸 코치에게(계약 9-6 ①-7 H) */
  const [org, note, hw] = await Promise.all([
    prisma.org.findUnique({ where: { id: owner.orgId }, select: { ownerId: true } }),
    'noteId' in t ? prisma.lessonNote.findUnique({ where: { id: t.noteId }, select: { authorId: true } }) : null,
    'assignmentId' in t ? prisma.orgAssignment.findUnique({ where: { id: t.assignmentId }, select: { assignedById: true } }) : null,
  ]);
  await notifyMany([org?.ownerId, note?.authorId, hw?.assignedById].filter((x): x is string => !!x), {
    kind: 'lesson',
    title: kind === 'fix' ? '회원이 정정을 요청했어요' : kind === 'submit' ? '회원이 숙제 영상을 보냈어요' : '회원이 질문을 남겼어요',
    body: text.slice(0, 60),
    link: orgOpenHref(owner.orgId, 'c', 'inbox'),
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

/* ── 조직 영상 — 일지 영상 · 숙제 영상(서로 보는 영상이라 저장소에, lib/storage.ts createOrgVideoUploadTarget) ── */

type UploadTarget = { ok: true; path: string; signedUrl: string } | { ok: false; error: string };

async function videoTarget(userId: string, meta: unknown): Promise<UploadTarget> {
  if (!isStorageConfigured()) return { ok: false, error: '영상 저장소가 아직 설정되지 않았어요.' };
  const o = (meta && typeof meta === 'object' ? meta : {}) as Record<string, unknown>;
  const name = typeof o.fileName === 'string' && o.fileName ? o.fileName : 'video.mov';
  if (typeof o.fileType !== 'string' || !o.fileType.startsWith('video/')) return { ok: false, error: '영상 파일만 올릴 수 있어요.' };
  const size = Number(o.fileSize);
  if (Number.isFinite(size) && size > ORG_VIDEO_MAX_BYTES) return { ok: false, error: `영상은 ${ORG_VIDEO_MAX_BYTES / 1024 / 1024}MB 이하만 올릴 수 있어요.` };
  try {
    const t = await createOrgVideoUploadTarget(userId, name);
    return { ok: true, path: t.path, signedUrl: t.signedUrl };
  } catch {
    return { ok: false, error: '올릴 준비를 못 했어요. 다시 해 주세요.' };
  }
}

/** 코치 영상 올리기 주소(일지에 붙일 영상) */
export async function coachVideoUpload(orgId: string, meta: unknown): Promise<UploadTarget> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  return videoTarget(c.user.id, meta);
}

/** 선수 영상 올리기 주소(숙제 영상 · 질문에 붙일 영상) */
export async function myVideoUpload(memberId: string, meta: unknown): Promise<UploadTarget> {
  const r = await myMember(memberId);
  if (!r || r.m.status !== 'ACTIVE') return { ok: false, error: '영상을 올릴 수 없어요.' };
  return videoTarget(r.user.id, meta);
}

/** 일지에 영상 붙이기 — 코치가 올린 조직 영상만, 일지 하나에 두 개 */
export async function addNoteVideo(orgId: string, noteId: string, path: unknown): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  if (!isOwnOrgVideoPath(path, c.user.id)) return { ok: false, error: '영상을 다시 올려 주세요.' };
  const note = await prisma.lessonNote.findFirst({ where: { id: noteId, member: { orgId } }, select: { id: true, videoPaths: true, member: { select: { userId: true } } } });
  if (!note) return { ok: false, error: '일지를 찾을 수 없어요.' };
  if (note.videoPaths.includes(path)) return { ok: true };
  if (note.videoPaths.length >= NOTE_VIDEOS_MAX) return { ok: false, error: `일지 하나에 영상은 ${NOTE_VIDEOS_MAX}개까지예요.` };
  await prisma.lessonNote.update({ where: { id: note.id }, data: { videoPaths: [...note.videoPaths, path], editedById: c.user.id } });
  if (note.member.userId) await notify(note.member.userId, { kind: 'lesson', title: '코치가 일지에 영상을 붙였어요', link: orgOpenHref(orgId, 'p', 'notes') });
  return { ok: true };
}

/** 일지 영상 빼기 — 올린 코치의 파일이면 저장소에서도 지운다(조직 영상 앞말이라 다른 파일은 안 건드림) */
export async function removeNoteVideo(orgId: string, noteId: string, path: string): Promise<{ ok: boolean; error?: string }> {
  const c = await coachOrg(orgId);
  if (!c) return { ok: false, error: '이 곳을 관리할 권한이 없어요.' };
  const note = await prisma.lessonNote.findFirst({ where: { id: noteId, member: { orgId } }, select: { id: true, videoPaths: true } });
  if (!note || !note.videoPaths.includes(path)) return { ok: false, error: '영상을 찾을 수 없어요.' };
  await prisma.lessonNote.update({ where: { id: note.id }, data: { videoPaths: note.videoPaths.filter((p) => p !== path), editedById: c.user.id } });
  if (isOwnOrgVideoPath(path, c.user.id)) await deleteVideos([path]);
  return { ok: true };
}

/** 영상이 이 조직 · 이 회원의 일지 · 말에 걸려 있나 — 재생 주소는 걸린 것만 */
async function allowedVideos(paths: unknown, scope: { orgId: string } | { memberId: string }): Promise<string[]> {
  const want = Array.isArray(paths) ? [...new Set(paths.filter((p): p is string => typeof p === 'string' && p.length < 200))].slice(0, 10) : [];
  if (want.length === 0) return [];
  const memberWhere = 'orgId' in scope ? { member: { orgId: scope.orgId } } : { memberId: scope.memberId };
  const [notes, comments] = await Promise.all([
    prisma.lessonNote.findMany({ where: { ...memberWhere, videoPaths: { hasSome: want } }, select: { videoPaths: true } }),
    prisma.orgComment.findMany({ where: { ...('orgId' in scope ? { orgId: scope.orgId } : { memberId: scope.memberId }), videoPath: { in: want } }, select: { videoPath: true } }),
  ]);
  const ok = new Set([...notes.flatMap((n) => n.videoPaths), ...comments.map((x) => x.videoPath)]);
  return want.filter((p) => ok.has(p));
}

/** 코치: 조직 영상 재생 주소 */
export async function coachVideoUrls(orgId: string, paths: unknown): Promise<{ ok: false; to: string } | { ok: true; urls: Record<string, string> }> {
  const c = await coachOrg(orgId);
  if (!c) return NO_ACCESS;
  return { ok: true, urls: await createPlaybackUrls(await allowedVideos(paths, { orgId })) };
}

/** 선수: 내 일지 · 숙제 영상 재생 주소 */
export async function myVideoUrls(memberId: string, paths: unknown): Promise<{ ok: false; to: string } | { ok: true; urls: Record<string, string> }> {
  const r = await myMember(memberId);
  if (!r) return NO_ACCESS;
  return { ok: true, urls: await createPlaybackUrls(await allowedVideos(paths, { memberId: r.m.id })) };
}
