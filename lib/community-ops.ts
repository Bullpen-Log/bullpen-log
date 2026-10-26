import { Prisma, type PrismaClient } from '@prisma/client';
import {
  AUTO_HIDE_REASON,
  RATE_LIMITS,
  gatherState,
  joinBlockReason,
  readMeetupForm,
  shouldAutoHide,
  type RateKind,
} from '@/lib/community';

/**
 * 커뮤니티의 DB 일 가운데 순서 · 동시성이 중요한 것(2026-10-26) — 참가(정원 잠금) · 대화 한 장 · 다시 보내기 막기 · 답 상태 다시 셈 · 자동 임시 가림 · 지표.
 * DB 를 인자로 받는다(lib/prisma 를 직접 부르지 않는다) — 서버 동작(app/actions/community.ts)은 운영 DB 를, 시험(scripts/community-db-selftest.mts)은
 * 따로 띄운 PGlite 를 넘긴다. 알림 · 화면 새로 고침은 부르는 쪽 몫 — 여기서는 무엇이 일어났는지만 돌려준다.
 */
type Db = PrismaClient;

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

// ── 참가 · 신청 ─────────────────────────────────────────────────────────

export type JoinPostInfo = { userId: string; category: string; tag: string | null; title: string };

/**
 * 번개 참가 · 팀 신청 — 글 줄을 잠그고(FOR UPDATE) 정원 · 마감 · 나이 · 차단을 본 뒤 넣는다. 같은 글에 동시에 들어온 신청은 줄을 서서
 * 하나씩 지나가므로 마지막 한 자리에 둘이 몰려도 하나만 들어간다. 이미 참가했으면 joined: false(다시 누름 · 재시도 — 알림을 또 보내지 않게).
 */
export async function joinPost(
  db: Db,
  postId: string,
  actor: { id: string; age: number | null },
  now: Date
): Promise<{ error: string } | { joined: boolean; post: JoinPostInfo }> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "CommunityPost" WHERE "id" = ${postId} FOR UPDATE`;
    if (locked.length === 0) return { error: '글을 찾지 못했어요.' };
    const post = await tx.communityPost.findUnique({
      where: { id: postId },
      select: { userId: true, category: true, tag: true, title: true, form: true, meetAt: true, closedAt: true, outcome: true, hiddenAt: true },
    });
    if (!post || post.hiddenAt || (post.category !== 'meetup' && post.category !== 'team'))
      return { error: '글을 찾지 못했어요.' };
    const info = { userId: post.userId, category: post.category, tag: post.tag, title: post.title };
    const mine = await tx.communityJoin.findUnique({
      where: { postId_userId: { postId, userId: actor.id } },
      select: { userId: true },
    });
    if (mine) return { joined: false, post: info };
    const [blocked, joins] = await Promise.all([
      tx.communityBlock.count({
        where: {
          OR: [
            { blockerId: post.userId, blockedId: actor.id },
            { blockerId: actor.id, blockedId: post.userId },
          ],
        },
      }),
      tx.communityJoin.count({ where: { postId } }),
    ]);
    const meetup = post.category === 'meetup' ? readMeetupForm(post.form) : null;
    const state = gatherState({
      meetAt: post.meetAt,
      closedAt: post.closedAt,
      outcome: post.outcome,
      joins,
      capacity: meetup?.capacity ?? null,
      now,
    });
    const reason = joinBlockReason({
      age: actor.age,
      adultOnly: meetup?.age === 'adult',
      isAuthor: post.userId === actor.id,
      closed: state === 'closed',
      full: state === 'full',
      past: state === 'past' || state === 'held',
      cancelled: state === 'cancelled',
      blocked: blocked > 0,
      word: post.category === 'meetup' ? '지난 번개' : '지난 경기',
    });
    if (reason) return { error: reason };
    await tx.communityJoin.create({ data: { postId, userId: actor.id } });
    return { joined: true, post: info };
  });
}

/** 참가 · 신청 취소 — 없으면 left: false(다시 누름). 지난 번개 · 진행을 마친 신청은 못 뺀다 */
export async function leavePost(
  db: Db,
  postId: string,
  userId: string,
  now: Date
): Promise<{ error: string } | { left: boolean }> {
  const post = await db.communityPost.findUnique({
    where: { id: postId },
    select: { category: true, meetAt: true },
  });
  if (!post) return { error: '글을 찾지 못했어요.' };
  const join = await db.communityJoin.findUnique({
    where: { postId_userId: { postId, userId } },
    select: { status: true },
  });
  if (!join) return { left: false };
  if (post.category === 'meetup' && post.meetAt && post.meetAt.getTime() < now.getTime())
    return { error: '지난 번개는 취소할 수 없어요.' };
  if (join.status === 'done') return { error: '진행을 마친 신청은 취소할 수 없어요.' };
  const { count } = await db.communityJoin.deleteMany({ where: { postId, userId } });
  return { left: count > 0 };
}

// ── 질문의 답 상태 ───────────────────────────────────────────────────────

/**
 * 질문의 첫 답 시각 · 채택을 지금 댓글로 다시 맞춘다 — 댓글이 생기고 · 지워지고 · 가려지고 · 되살아날 때마다 부른다(더하고 빼는 수가 아니라 다시 셈이라 어긋나지 않는다).
 * 채택한 답이 지워졌거나 가려졌으면 채택을 푼다(목록이 '해결됨'인데 답이 없는 일이 없게). 되살려도 채택은 저절로 안 돌아온다 — 글쓴이가 다시 고른다.
 */
export async function refreshAnswerState(db: Db, postId: string): Promise<void> {
  const post = await db.communityPost.findUnique({
    where: { id: postId },
    select: { userId: true, category: true, acceptedCommentId: true, firstAnswerAt: true },
  });
  if (!post || post.category !== 'question') return;
  const first = await db.communityComment.findFirst({
    where: { postId, hiddenAt: null, userId: { not: post.userId } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  let accepted = post.acceptedCommentId;
  if (accepted) {
    const c = await db.communityComment.findUnique({
      where: { id: accepted },
      select: { postId: true, hiddenAt: true },
    });
    if (!c || c.postId !== postId || c.hiddenAt) accepted = null;
  }
  const firstAnswerAt = first?.createdAt ?? null;
  if (firstAnswerAt?.getTime() === post.firstAnswerAt?.getTime() && accepted === post.acceptedCommentId) return;
  await db.communityPost.update({ where: { id: postId }, data: { firstAnswerAt, acceptedCommentId: accepted } });
}

// ── 글에 묶인 대화 ───────────────────────────────────────────────────────

/** 한 번에 읽는 말 수 — 처음엔 가장 최근 것, '이전 대화 보기'로 더 */
export const ROOM_PAGE = 50;

/**
 * 대화 한 장 — 최신부터 거꾸로 읽어(예전엔 오래된 것부터 300개라 대화가 길어지면 새 말이 안 보였다) 화면 차례(오래된 → 새)로 돌려준다.
 * before 를 주면 그 말보다 앞의 한 장.
 */
export async function loadRoomPage(
  db: Db,
  q: { postId: string; thread: string | null; before?: string | null }
) {
  const rows = await db.communityMessage.findMany({
    where: { postId: q.postId, threadUserId: q.thread },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(q.before ? { cursor: { id: q.before }, skip: 1 } : {}),
    take: ROOM_PAGE + 1,
    select: {
      id: true,
      senderId: true,
      body: true,
      hiddenAt: true,
      createdAt: true,
      sender: { select: { nickname: true } },
    },
  });
  return { hasOlder: rows.length > ROOM_PAGE, messages: rows.slice(0, ROOM_PAGE).reverse() };
}

/** 말 넣기 — 같은 보낸 번호(clientId)면 새로 안 만든다(응답이 끊겨 다시 보냄). created 가 false 면 이미 있던 것 */
export async function addRoomMessage(
  db: Db,
  m: { postId: string; thread: string | null; senderId: string; body: string; clientId: string | null }
): Promise<{ created: boolean }> {
  if (m.clientId) {
    const same = await db.communityMessage.findUnique({
      where: { senderId_clientId: { senderId: m.senderId, clientId: m.clientId } },
      select: { id: true },
    });
    if (same) return { created: false };
  }
  try {
    await db.communityMessage.create({
      data: { postId: m.postId, threadUserId: m.thread, senderId: m.senderId, body: m.body, clientId: m.clientId },
    });
    return { created: true };
  } catch (e) {
    if (isUnique(e)) return { created: false };
    throw e;
  }
}

// ── 도배 막기 ────────────────────────────────────────────────────────────

/** 그 사람이 최근(RATE_LIMITS 의 창 안)에 남긴 수 — now 는 DB 시각과 견주므로 실제 시각 */
export async function recentCount(db: Db, kind: RateKind, userId: string, now: Date): Promise<number> {
  const createdAt = { gte: new Date(now.getTime() - RATE_LIMITS[kind].windowMs) };
  if (kind === 'post') return db.communityPost.count({ where: { userId, createdAt } });
  if (kind === 'comment') return db.communityComment.count({ where: { userId, createdAt } });
  if (kind === 'message') return db.communityMessage.count({ where: { senderId: userId, createdAt } });
  return db.communityReport.count({ where: { reporterId: userId, createdAt } });
}

// ── 운영 — 기록 · 자동 임시 가림 ─────────────────────────────────────────

export type ModKind = 'post' | 'comment' | 'message';
const REPORT_FIELD = { post: 'postId', comment: 'commentId', message: 'messageId' } as const;

export async function logModeration(
  db: Db,
  m: { kind: ModKind; targetId: string; action: string; reason?: string | null; actorId: string | null }
) {
  await db.communityModeration.create({
    data: { kind: m.kind, targetId: m.targetId, action: m.action, reason: m.reason || null, actorId: m.actorId },
  });
}

/** 가린 대상의 글쓴이(또는 보낸 사람)와 지금 가림 — 없으면 null */
async function targetOf(db: Db, kind: ModKind, id: string) {
  if (kind === 'post') {
    const p = await db.communityPost.findUnique({
      where: { id },
      select: { hiddenAt: true, byStaff: true, user: { select: { role: true } } },
    });
    return p && { hiddenAt: p.hiddenAt, staff: p.byStaff || p.user.role !== 'USER' };
  }
  if (kind === 'comment') {
    const c = await db.communityComment.findUnique({ where: { id }, select: { hiddenAt: true, user: { select: { role: true } } } });
    return c && { hiddenAt: c.hiddenAt, staff: c.user.role !== 'USER' };
  }
  const m = await db.communityMessage.findUnique({ where: { id }, select: { hiddenAt: true, sender: { select: { role: true } } } });
  return m && { hiddenAt: m.hiddenAt, staff: m.sender.role !== 'USER' };
}

/** 가리기 · 되살리기(운영자 · 자동 공통) — 바뀌었으면 true. 이유 · 누가는 기록에 남는다 */
export async function setTargetHidden(
  db: Db,
  t: { kind: ModKind; id: string; hidden: boolean; reason?: string | null; actorId: string | null },
  now: Date
): Promise<boolean> {
  const hiddenAt = t.hidden ? now : null;
  const where = { id: t.id, hiddenAt: t.hidden ? null : { not: null } };
  const { count } =
    t.kind === 'post'
      ? await db.communityPost.updateMany({ where, data: { hiddenAt } })
      : t.kind === 'comment'
        ? await db.communityComment.updateMany({ where, data: { hiddenAt } })
        : await db.communityMessage.updateMany({ where, data: { hiddenAt } });
  if (count === 0) return false;
  await logModeration(db, {
    kind: t.kind,
    targetId: t.id,
    action: t.hidden ? (t.actorId ? 'hide' : 'autohide') : 'unhide',
    reason: t.reason,
    actorId: t.actorId,
  });
  return true;
}

/**
 * 신고가 들어온 뒤 — 기준(lib/community.ts AUTO_HIDE · shouldAutoHide)을 넘으면 운영자가 보기 전 잠시 가린다. 가렸으면 true.
 */
export async function maybeAutoHide(db: Db, kind: ModKind, id: string, now: Date): Promise<boolean> {
  const target = await targetOf(db, kind, id);
  if (!target) return false;
  const field = REPORT_FIELD[kind];
  const reports = await db.communityReport.findMany({
    where: { [field]: id },
    select: { reporterId: true, createdAt: true, reporter: { select: { createdAt: true } } },
  });
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const [dismissed, reviewed] = await Promise.all([
    db.communityReport.groupBy({
      by: ['reporterId'],
      where: { reporterId: { in: reports.map((r) => r.reporterId) }, outcome: 'dismissed', resolvedAt: { gte: since } },
      _count: { _all: true },
    }),
    db.communityModeration.count({
      where: { kind, targetId: id, actorId: { not: null }, action: { in: ['unhide', 'resolve'] } },
    }),
  ]);
  const dismissedOf = new Map(dismissed.map((d) => [d.reporterId, d._count._all]));
  const hide = shouldAutoHide({
    reports: reports.map((r) => ({
      createdAt: r.createdAt,
      reporterSince: r.reporter.createdAt,
      reporterDismissed: dismissedOf.get(r.reporterId) ?? 0,
    })),
    now,
    alreadyHidden: target.hiddenAt !== null,
    authorIsStaff: target.staff,
    adminReviewed: reviewed > 0,
  });
  if (!hide) return false;
  return setTargetHidden(db, { kind, id, hidden: true, reason: AUTO_HIDE_REASON, actorId: null }, now);
}

// ── 운영 지표 ────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60_000;
const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * 운영 지표(2026-10-26) — 실제 줄로 셀 수 있는 것만. 분모가 0 이거나 그 기록이 없으면 null(화면은 '집계 전').
 * 운영자 = 역할이 ADMIN · MANAGER 인 사람 + 운영자 표시 글. 페이지 조회는 세지 않는다(재참여는 글 · 댓글 · 신청으로만).
 */
export async function communityMetrics(db: Db, now: Date) {
  const staff = new Set(
    (await db.user.findMany({ where: { role: { in: ['ADMIN', 'MANAGER'] } }, select: { id: true } })).map((u) => u.id)
  );
  const t = now.getTime();
  const d28 = new Date(t - 28 * DAY);
  const d30 = new Date(t - 30 * DAY);

  const [posts28, questions, unanswered, meetJoins, meetHeld, meetPending, teamJoins, teamDone, openReports, resolved] =
    await Promise.all([
      db.communityPost.findMany({
        where: { createdAt: { gte: d28 }, byStaff: false },
        select: { userId: true, createdAt: true },
      }),
      db.communityPost.findMany({
        where: { category: 'question', createdAt: { gte: d30 }, hiddenAt: null },
        select: { createdAt: true, firstAnswerAt: true },
      }),
      db.communityPost.count({ where: { category: 'question', hiddenAt: null, firstAnswerAt: null } }),
      db.communityJoin.count({ where: { createdAt: { gte: d30 }, post: { category: 'meetup' } } }),
      db.communityPost.count({ where: { category: 'meetup', outcome: 'held', outcomeAt: { gte: d30 } } }),
      db.communityPost.count({ where: { category: 'meetup', outcome: null, meetAt: { gte: d30, lt: now } } }),
      db.communityJoin.count({ where: { createdAt: { gte: d30 }, post: { category: 'team' } } }),
      db.communityJoin.count({ where: { status: 'done', statusAt: { gte: d30 }, post: { category: 'team' } } }),
      db.communityReport.findMany({ where: { resolvedAt: null }, select: { createdAt: true } }),
      db.communityReport.findMany({ where: { resolvedAt: { gte: d30 } }, select: { createdAt: true, resolvedAt: true } }),
    ]);

  /* 주마다(오늘부터 거꾸로 7일씩 넷) — 운영자 빼고 */
  const weeks = [0, 1, 2, 3].map((i) => {
    const end = t - i * 7 * DAY;
    const start = end - 7 * DAY;
    const rows = posts28.filter((p) => !staff.has(p.userId) && p.createdAt.getTime() >= start && p.createdAt.getTime() < end);
    return { start: new Date(start), end: new Date(end), posts: rows.length, writers: new Set(rows.map((r) => r.userId)).size };
  });

  const answered = questions.filter((q) => q.firstAnswerAt);
  const answerHours = answered.map((q) => (q.firstAnswerAt!.getTime() - q.createdAt.getTime()) / 3_600_000);

  /*
   * 첫 참여 뒤 7일 — 첫 참여가 37~7일 전인 사람(7일을 다 지켜본 사람)만. 첫 참여 24시간 뒤 ~ 7일 안에 다시 글 · 댓글 · 신청을 남겼으면 재참여.
   * ponytail: 사람마다 첫 참여를 전체 기간 groupBy 로 센다 — 글 · 댓글이 수만 개가 되면 SQL 한 줄(집계 표)로 바꾼다.
   */
  const [pFirst, cFirst, jFirst] = await Promise.all([
    db.communityPost.groupBy({ by: ['userId'], _min: { createdAt: true } }),
    db.communityComment.groupBy({ by: ['userId'], _min: { createdAt: true } }),
    db.communityJoin.groupBy({ by: ['userId'], _min: { createdAt: true } }),
  ]);
  const first = new Map<string, number>();
  for (const r of [...pFirst, ...cFirst, ...jFirst]) {
    const at = r._min.createdAt?.getTime();
    if (at === undefined || staff.has(r.userId)) continue;
    first.set(r.userId, Math.min(first.get(r.userId) ?? Infinity, at));
  }
  const cohort = [...first].filter(([, at]) => at >= t - 37 * DAY && at < t - 7 * DAY);
  let returned = 0;
  if (cohort.length > 0) {
    const ids = cohort.map(([id]) => id);
    const since = new Date(t - 37 * DAY);
    const [ps, cs, js] = await Promise.all([
      db.communityPost.findMany({ where: { userId: { in: ids }, createdAt: { gte: since } }, select: { userId: true, createdAt: true } }),
      db.communityComment.findMany({ where: { userId: { in: ids }, createdAt: { gte: since } }, select: { userId: true, createdAt: true } }),
      db.communityJoin.findMany({ where: { userId: { in: ids }, createdAt: { gte: since } }, select: { userId: true, createdAt: true } }),
    ]);
    const acts = [...ps, ...cs, ...js];
    for (const [id, at] of cohort)
      if (acts.some((a) => a.userId === id && a.createdAt.getTime() > at + DAY && a.createdAt.getTime() <= at + 7 * DAY)) returned++;
  }

  const resolveHours = resolved.map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 3_600_000);
  const oldestOpenHours = openReports.length
    ? Math.max(...openReports.map((r) => (t - r.createdAt.getTime()) / 3_600_000))
    : null;

  return {
    weeks,
    questions: {
      total: questions.length,
      answered: answered.length,
      rate: questions.length ? answered.length / questions.length : null,
      medianFirstAnswerHours: median(answerHours),
      within24h: questions.length ? answerHours.filter((h) => h <= 24).length / questions.length : null,
    },
    unanswered,
    meetups: { joins: meetJoins, held: meetHeld, pending: meetPending },
    team: { joins: teamJoins, done: teamDone },
    retention: { cohort: cohort.length, returned, rate: cohort.length ? returned / cohort.length : null },
    reports: { open: openReports.length, oldestOpenHours, resolved: resolved.length, medianResolveHours: median(resolveHours) },
  };
}
