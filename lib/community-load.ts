import 'server-only';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { getCurrentUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import {
  HOT_PERIODS,
  POSTS_PER_PAGE,
  ROOM_OPEN_MS,
  gatherState,
  isVideoPath,
  joinBlockReason,
  readMeetupForm,
  readTeamForm,
  teamFlowOf,
  teamHasGame,
  teamKindOf,
  type AnswerFilter,
  type HotPeriod,
  type PostCategory,
  type PostSort,
} from '@/lib/community';
import { ageFromBirthDate } from '@/lib/profile';
import { appNow } from '@/lib/clock';
import { readCard } from '@/lib/community-cards';
import { loadRoomPage } from '@/lib/community-ops';

/**
 * 커뮤니티 목록 · 글 하나를 읽는다 — 웹 화면(app/(dugout)/community)과 아이폰 앱 화면(app/actions/community.ts loadApp… →
 * native/src/app/community)이 같이 쓴다. 누가 무엇을 볼 · 누를 수 있는지(가린 글 · 지우기 · 신고 · 좋아요)를 여기서 한 번 정해
 * 두 화면이 어긋나지 않게 한다. 실제 막기는 서버 동작(app/actions/community.ts)이 한 번 더 한다.
 * 보기는 로그인 없이(2026-10-24 김민 — 휴대폰 브라우저로 온 사람도 읽는다): user 가 null 이면 가린 글은 빼고, 누르는 것은 모두 못 한다.
 *
 * 차단 규칙(2026-10-26 한 곳): 내가 막은 사람의 글 · 댓글은 목록 · 검색 · 글 화면에서 안 보이고(상대는 모른다), 번개 단체방의 그 사람 말은 접힌다
 * (방 자체는 그대로 — 다른 참가자의 대화를 막지 않는다). 둘 사이에 차단이 있으면(누가 막았든) 그 글에 댓글 · 참가 · 둘만의 대화를 못 한다.
 * 'use server' 파일에 두지 않는다 — user 를 받는 함수가 거기 있으면 누구나 부를 수 있는 입구가 된다.
 */
type CommunityUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** 앱이 한 번에 다시 읽을 수 있는 장 수 — 돌아왔을 때 본 만큼 다시 읽는다(200개까지) */
const MAX_PAGES = 10;

/** 내가 차단한 사람들 */
export async function blockedIdsOf(user: CommunityUser | null): Promise<string[]> {
  if (!user) return [];
  const rows = await prisma.communityBlock.findMany({
    where: { blockerId: user.id },
    select: { blockedId: true },
  });
  return rows.map((r) => r.blockedId);
}

/**
 * 코치 배지 — 레슨장(LESSON)의 마스터 · 스태프로 활동 중인 사람. 더미 코치 조직은 뺀다. 자격을 확인한 표시가 아니다(lib/community.ts COACH_BADGE_NOTE).
 * ponytail: 글 화면마다 조회 하나 — 사람이 많아지면 User 에 칸을 두거나 기억해 둔다.
 */
export async function coachIdsOf(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.orgMember.findMany({
    where: {
      userId: { in: [...new Set(userIds)] },
      role: { in: ['MASTER', 'STAFF'] },
      status: 'ACTIVE',
      org: { kind: 'LESSON', dummy: false },
    },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId).filter((id): id is string => id !== null));
}

export type ListQuery = {
  category?: PostCategory;
  tag?: string;
  region?: string;
  district?: string;
  /** 번개 게시판 — 다가오는 번개만(모일 때 순) 또는 지난 번개만 */
  when?: 'upcoming' | 'past';
  /** 번개 · 팀 — 모집 중인 것만(마감 · 취소 · 다 찬 것 빼고) */
  openOnly?: boolean;
  /** 질문 · 답변 — 답 상태 */
  answer?: AnswerFilter;
  sort: PostSort;
  /** 인기 정렬의 기간 */
  period?: HotPeriod;
  page: number;
  pages?: number;
};

/** 목록 거르기 — 목록과 '거르기 없이 이 게시판에 글이 있나'가 같은 규칙을 쓴다 */
function listWhere(user: CommunityUser | null, q: ListQuery, blocked: string[], now: Date): Prisma.CommunityPostWhereInput {
  const isAdmin = user?.role === 'ADMIN';
  const days = HOT_PERIODS.find((p) => p.key === q.period)?.days ?? 0;
  return {
    ...(q.category ? { category: q.category } : {}),
    ...(q.tag ? { tag: q.tag } : {}),
    ...(q.region ? { region: q.region } : {}),
    ...(q.district ? { district: q.district } : {}),
    ...(q.when === 'upcoming' ? { meetAt: { gte: now } } : q.when === 'past' ? { meetAt: { lt: now } } : {}),
    ...(q.openOnly ? { closedAt: null, outcome: null, OR: [{ meetAt: null }, { meetAt: { gte: now } }] } : {}),
    ...(q.answer === 'none'
      ? { firstAnswerAt: null }
      : q.answer === 'open'
        ? { firstAnswerAt: { not: null }, acceptedCommentId: null }
        : q.answer === 'solved'
          ? { acceptedCommentId: { not: null } }
          : {}),
    ...(q.sort === 'hot' && days > 0 ? { createdAt: { gte: new Date(now.getTime() - days * 86_400_000) } } : {}),
    ...(isAdmin ? {} : { hiddenAt: null }),
    ...(blocked.length > 0 ? { userId: { notIn: blocked } } : {}),
  };
}

/** 목록 — page 장부터 pages 장만큼(웹은 한 장씩, 앱은 더 보기로 이어 붙인 만큼). 가린 글은 관리자에게만. */
export async function loadCommunityList(user: CommunityUser | null, q: ListQuery) {
  const blocked = await blockedIdsOf(user);
  const take = POSTS_PER_PAGE * Math.min(MAX_PAGES, Math.max(1, q.pages ?? 1));
  const now = appNow();
  /* 한 장보다 하나 더 읽어 다음 장이 있는지만 안다 — count 쿼리 하나를 아낀다 */
  const rows = await prisma.communityPost.findMany({
    where: listWhere(user, q, blocked, now),
    orderBy:
      q.when === 'upcoming'
        ? [{ meetAt: 'asc' }]
        : q.when === 'past'
          ? [{ meetAt: 'desc' }]
          : q.sort === 'hot'
            ? [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }],
    skip: (q.page - 1) * POSTS_PER_PAGE,
    take: take + 1,
    select: {
      id: true,
      userId: true,
      category: true,
      tag: true,
      title: true,
      body: true,
      media: true,
      card: true,
      form: true,
      acceptedCommentId: true,
      firstAnswerAt: true,
      region: true,
      district: true,
      meetAt: true,
      closedAt: true,
      outcome: true,
      byStaff: true,
      hiddenAt: true,
      createdAt: true,
      user: { select: { nickname: true } },
      /* 댓글 수는 가린 댓글을 빼고 — 사용자가 보는 수와 같아야 한다 */
      _count: {
        select: { likes: true, joins: true, comments: { where: { hiddenAt: null } } },
      },
    },
  });
  const hasMore = rows.length > take;
  let page = hasMore ? rows.slice(0, take) : rows;
  /*
   * 모집 중만 — 다 찬 번개는 DB 거르기로는 못 뺀다(인원은 양식 JSON 안). 읽은 장에서 뺀다.
   * ponytail: 다 찬 글이 많으면 한 장이 20개보다 짧아진다 — 그때 인원 칸을 따로 둔다.
   */
  if (q.openOnly)
    page = page.filter((p) => {
      const cap = p.category === 'meetup' ? readMeetupForm(p.form)?.capacity ?? null : null;
      return cap === null || p._count.joins < cap;
    });
  /* 목록 썸네일 — 글마다 첫 사진 하나만, 한 번에 서명한다 */
  const firstImages = page
    .map((p) => p.media.find((m) => !isVideoPath(m)))
    .filter((m): m is string => Boolean(m));
  const [urls, coaches] = await Promise.all([
    createPlaybackUrls(firstImages),
    coachIdsOf(page.map((p) => p.userId)),
  ]);
  return {
    hasMore,
    /* 두 줄 미리보기에 본문 전체(최대 5,000자)를 실어 보내지 않는다 */
    posts: page.map((p) => {
      const image = p.media.find((m) => !isVideoPath(m));
      const capacity = p.category === 'meetup' ? (readMeetupForm(p.form)?.capacity ?? null) : null;
      const gathers = p.category === 'meetup' || p.category === 'team';
      return {
        id: p.id,
        category: p.category,
        tag: p.tag,
        title: p.title,
        preview: p.body.length > 160 ? `${p.body.slice(0, 160)}…` : p.body,
        thumb: image ? (urls[image] ?? null) : null,
        hasVideo: p.media.some(isVideoPath),
        hasCard: p.card !== null,
        solved: p.acceptedCommentId !== null,
        answered: p.firstAnswerAt !== null,
        region: p.region,
        district: p.district,
        meetAt: p.meetAt,
        capacity,
        closed: p.closedAt !== null,
        state: gathers
          ? gatherState({ meetAt: p.meetAt, closedAt: p.closedAt, outcome: p.outcome, joins: p._count.joins, capacity, now })
          : null,
        joins: p._count.joins,
        hidden: p.hiddenAt !== null,
        byStaff: p.byStaff,
        createdAt: p.createdAt,
        nickname: p.user.nickname,
        coach: coaches.has(p.userId),
        likes: p._count.likes,
        comments: p._count.comments,
      };
    }),
  };
}

/** 이 게시판(말머리)에 거르기 없이 글이 있나 — 빈 목록이 '아직 글이 없음'인지 '조건에 맞는 글이 없음'인지 가른다 */
export async function boardHasPosts(user: CommunityUser | null, category?: PostCategory, tag?: string) {
  const blocked = await blockedIdsOf(user);
  const found = await prisma.communityPost.findFirst({
    where: listWhere(user, { category, tag, sort: 'new', page: 1 }, blocked, appNow()),
    select: { id: true },
  });
  return found !== null;
}

/** 답을 기다리는 질문 수(말머리별) — 코치 · 운영자에게 보이는 '답할 질문' */
export async function waitingQuestions() {
  const rows = await prisma.communityPost.groupBy({
    by: ['tag'],
    where: { category: 'question', hiddenAt: null, firstAnswerAt: null },
    _count: { _all: true },
  });
  return {
    total: rows.reduce((n, r) => n + r._count._all, 0),
    byTag: Object.fromEntries(rows.map((r) => [r.tag ?? '', r._count._all])) as Record<string, number>,
  };
}

/** 운영 기록 가운데 그 글 · 댓글에 대한 마지막 가림 사유 · 이의 제기 상태 — 글쓴이에게만 보인다(신고한 사람은 드러내지 않는다) */
async function moderationFor(kind: 'post' | 'comment', targetId: string) {
  const rows = await prisma.communityModeration.findMany({
    where: { kind, targetId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { action: true, reason: true, createdAt: true },
  });
  const hide = rows.find((r) => r.action === 'hide' || r.action === 'autohide');
  return {
    reason: hide?.reason ?? null,
    auto: hide?.action === 'autohide',
    hiddenAt: hide?.createdAt ?? null,
    appealPending: rows[0]?.action === 'appeal',
  };
}

/**
 * 글 하나 — 없거나 볼 수 없으면 null. 가린 글은 관리자와 글쓴이만(글쓴이는 왜 안 보이는지 알아야 한다). 가린 댓글은 관리자에게만.
 * 가린 글은 글쓴이도 좋아요 · 댓글을 못 한다(아무도 못 보는 글이다) — 서버 toggleLike · addComment 가 거절하는 것과 같은 조건.
 * 차단한 사람의 글은 authorBlocked 로 알리고(화면이 '차단 풀기'를 보인다), 그 사람의 댓글은 뺀다.
 */
export async function loadCommunityPost(user: CommunityUser | null, id: string) {
  const isAdmin = user?.role === 'ADMIN';
  /* 로그인 안 한 사람은 누구의 글도 아니다 — 빈 id 로 견주면 '내 것'이 하나도 안 걸린다 */
  const me = user?.id ?? '';
  const [post, blocked] = await Promise.all([
    prisma.communityPost.findUnique({
      where: { id },
      include: {
        user: { select: { nickname: true } },
        /* 내가 눌렀는지만 — 전체 수는 _count 로 */
        likes: { where: { userId: me }, select: { userId: true } },
        saves: { where: { userId: me }, select: { userId: true } },
        _count: { select: { likes: true } },
        comments: {
          where: isAdmin ? {} : { hiddenAt: null },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { nickname: true } } },
        },
        joins: {
          orderBy: { createdAt: 'asc' },
          select: { userId: true, status: true, statusAt: true, user: { select: { nickname: true } } },
        },
      },
    }),
    blockedIdsOf(user),
  ]);
  if (!post || (post.hiddenAt && !isAdmin && post.userId !== me)) return null;

  const blockedSet = new Set(blocked);
  const comments = post.comments.filter((c) => !blockedSet.has(c.userId));
  const card = readCard(post.card);
  const cardVideo = card?.kind === 'pitch' ? card.video : null;
  const isOwner = post.userId === me;
  /* 글쓴이가 나를 막았는가 — 댓글 · 참가를 막되 누가 막았는지는 말하지 않는다 */
  const blockedByAuthor =
    user !== null && !isOwner
      ? (await prisma.communityBlock.count({ where: { blockerId: post.userId, blockedId: me } })) > 0
      : false;
  const [urls, coaches, mod] = await Promise.all([
    createPlaybackUrls(cardVideo ? [...post.media, cardVideo] : post.media),
    coachIdsOf([post.userId, ...comments.map((c) => c.userId)]),
    post.hiddenAt && (isOwner || isAdmin) ? moderationFor('post', post.id) : Promise.resolve(null),
  ]);

  const hidden = post.hiddenAt !== null;
  const open = user !== null && !(hidden && !isAdmin);
  const question = post.category === 'question';

  /* 번개 · 팀 — 참가 · 신청 상태. 참가자 이름은 글쓴이와 참가자에게만, 남에게는 수만 */
  const meetup = post.category === 'meetup' ? readMeetupForm(post.form) : null;
  const team = post.category === 'team' ? readTeamForm(post.form) : null;
  const joinable = post.category === 'meetup' || post.category === 'team';
  const myJoin = post.joins.find((j) => j.userId === me) ?? null;
  const joined = myJoin !== null;
  const nowDate = appNow();
  const now = nowDate.getTime();
  const state = joinable
    ? gatherState({
        meetAt: post.meetAt,
        closedAt: post.closedAt,
        outcome: post.outcome,
        joins: post.joins.length,
        capacity: meetup?.capacity ?? null,
        now: nowDate,
      })
    : null;
  const joinBlock =
    !joinable || !user || joined
      ? null
      : joinBlockReason({
          age: user.birthDate ? ageFromBirthDate(user.birthDate) : null,
          adultOnly: meetup?.age === 'adult',
          isAuthor: isOwner,
          closed: state === 'closed',
          full: state === 'full',
          past: state === 'past' || state === 'held',
          cancelled: state === 'cancelled',
          blocked: blockedByAuthor || blockedSet.has(post.userId),
          word: post.category === 'meetup' ? '지난 번개' : '지난 경기',
        });
  const teamKind = post.category === 'team' ? teamKindOf(post.tag) : null;
  /* 결과(모였어요 · 취소)를 남길 수 있는 글 — 번개, 경기 날짜가 있는 팀 글 */
  const gathers = post.category === 'meetup' || (teamKind !== null && teamHasGame(teamKind));
  const visible = comments.filter((c) => c.hiddenAt === null || isAdmin);
  const acceptedVisible = post.acceptedCommentId ? visible.some((c) => c.id === post.acceptedCommentId) : false;
  return {
    id: post.id,
    userId: post.userId,
    category: post.category,
    tag: post.tag,
    title: post.title,
    body: post.body,
    /* 고치기 화면이 다시 채울 원본 경로 */
    mediaPaths: post.media,
    /* 서명이 안 된 경로(저장소에서 지워짐)는 뺀다 */
    media: post.media
      .filter((m) => urls[m])
      .map((m) => ({ url: urls[m], video: isVideoPath(m), path: m })),
    card,
    /* 투구 기록 카드의 영상 — 기록을 지웠으면 없다 */
    cardVideoUrl: cardVideo ? (urls[cardVideo] ?? null) : null,
    meetup,
    team,
    teamKind,
    teamFlow: post.category === 'team' ? teamFlowOf(post.tag) : null,
    region: post.region,
    district: post.district,
    joinable,
    joined,
    myJoinStatus: myJoin?.status ?? null,
    joinCount: post.joins.length,
    state,
    gathers,
    outcome: post.outcome,
    full: state === 'full',
    past: state === 'past' || state === 'held',
    /* 참가 · 신청 단추를 막는 까닭(로그인 안 했거나 이미 참가했으면 null) */
    joinBlock,
    /* 참가자(번개) · 신청자(팀) — 번개는 글쓴이 · 참가자에게, 팀 신청자는 글쓴이에게만(신청자끼리는 서로 모른다) */
    joiners:
      isOwner || (joined && post.category === 'meetup')
        ? post.joins.map((j) => ({ userId: j.userId, nickname: j.user.nickname, status: j.status }))
        : [],
    /* 번개 대화방은 모임 다음 날 · 취소하면 닫힌다 */
    roomOpen:
      post.outcome !== 'cancelled' &&
      (post.category !== 'meetup' || post.meetAt === null || now <= post.meetAt.getTime() + ROOM_OPEN_MS),
    meetAt: post.meetAt,
    closed: post.closedAt !== null,
    acceptedCommentId: acceptedVisible ? post.acceptedCommentId : null,
    /* 채택된 답이 있는데 내가 막은 사람의 답이라 안 보임 */
    acceptedFromBlocked: post.acceptedCommentId !== null && !acceptedVisible,
    createdAt: post.createdAt,
    editedAt: post.editedAt,
    byStaff: post.byStaff,
    nickname: post.user.nickname,
    coach: coaches.has(post.userId),
    hidden,
    /* 가린 까닭 · 이의 제기 상태 — 글쓴이 · 관리자에게만 */
    moderation: mod,
    isAdmin,
    isOwner,
    authorBlocked: blockedSet.has(post.userId),
    liked: post.likes.length > 0,
    saved: post.saves.length > 0,
    likes: post._count.likes,
    /* 댓글 수는 가린 댓글을 빼고 — 목록의 수와 같아야 한다 */
    commentCount: comments.filter((c) => c.hiddenAt === null).length,
    canLike: open,
    canSave: user !== null,
    canComment: open && !blockedByAuthor,
    canEdit: isOwner,
    canDelete: isOwner || isAdmin,
    /* 내 글은 신고하지 않는다 · 가린 글은 이미 운영자가 본 글 */
    canReport: user !== null && !isOwner && !hidden,
    canBlock: user !== null && !isOwner,
    /* 공개된 글만 공유 — 가린 글 · 대화 · 참가자 정보는 주소에 안 실린다 */
    shareable: !hidden,
    comments: comments.map((c) => {
      const mine = c.userId === me;
      return {
        id: c.id,
        userId: c.userId,
        body: c.body,
        createdAt: c.createdAt,
        nickname: c.user.nickname,
        coach: coaches.has(c.userId),
        hidden: c.hiddenAt !== null,
        accepted: post.acceptedCommentId === c.id,
        mine,
        canDelete: mine || isAdmin,
        canReport: user !== null && !mine,
        canBlock: user !== null && !mine,
        /* 질문 글쓴이가 남의 답을 채택한다(다시 누르면 풀린다) */
        canAccept: question && isOwner && !mine && open && c.hiddenAt === null,
      };
    }),
  };
}

/** 이 사람이 이 글의 대화를 볼 수 있나 — 번개는 글쓴이 · 참가자 한 방, 팀은 신청자 각자와 글쓴이(글쓴이는 ?thread=신청자) */
function roomThread(
  user: CommunityUser,
  post: { category: string; userId: string; joiners: { userId: string }[]; joined: boolean },
  threadParam?: string
): { ok: false } | { ok: true; thread: string | null } {
  const isAuthor = post.userId === user.id;
  if (post.category === 'meetup') return isAuthor || post.joined ? { ok: true, thread: null } : { ok: false };
  if (post.category !== 'team') return { ok: false };
  if (isAuthor) {
    const thread = post.joiners.find((j) => j.userId === threadParam)?.userId ?? post.joiners[0]?.userId ?? null;
    return thread ? { ok: true, thread } : { ok: false };
  }
  return post.joined ? { ok: true, thread: user.id } : { ok: false };
}

type RoomRow = Awaited<ReturnType<typeof loadRoomPage>>['messages'][number];

/** 대화 한 줄 — 가린 말은 '운영자가 가린 말', 내가 막은 사람의 말은 접는다(방은 그대로) */
function roomMessage(m: RoomRow, me: string, blocked: Set<string>, isAdmin: boolean) {
  const hidden = m.hiddenAt !== null && !isAdmin;
  const folded = blocked.has(m.senderId);
  return {
    id: m.id,
    mine: m.senderId === me,
    nickname: m.sender.nickname,
    body: hidden || folded ? '' : m.body,
    note: hidden ? '운영자가 가린 말이에요.' : folded ? '차단한 사람의 말이에요.' : null,
    createdAt: m.createdAt,
    canReport: m.senderId !== me && m.hiddenAt === null,
  };
}

const roomTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });
/** 대화 한 줄을 화면 모양으로(시각 글자) — 첫 장과 이전 장이 같은 모양 */
function roomView(m: ReturnType<typeof roomMessage>) {
  return { id: m.id, mine: m.mine, nickname: m.nickname, body: m.body, note: m.note, canReport: m.canReport, time: roomTime.format(m.createdAt) };
}
export type RoomView = ReturnType<typeof roomView>;

/**
 * 글에 묶인 대화 — 최근 한 장(lib/community-ops.ts loadRoomPage, 최신부터 거꾸로). 볼 수 없으면 null.
 * canWrite 는 서버 sendRoomMessage 와 같은 조건(번개 닫힘 · 취소, 팀 둘만의 방은 둘 사이 차단).
 */
export async function loadCommunityRoom(
  user: CommunityUser | null,
  post: { id: string; category: string; userId: string; joiners: { userId: string }[]; joined: boolean; roomOpen: boolean },
  threadParam?: string
) {
  if (!user) return null;
  const t = roomThread(user, post, threadParam);
  if (!t.ok) return null;
  const [page, blocked, between] = await Promise.all([
    loadRoomPage(prisma, { postId: post.id, thread: t.thread }),
    blockedIdsOf(user),
    t.thread
      ? prisma.communityBlock.count({
          where: {
            OR: [
              { blockerId: post.userId, blockedId: t.thread },
              { blockerId: t.thread, blockedId: post.userId },
            ],
          },
        })
      : Promise.resolve(0),
  ]);
  const set = new Set(blocked);
  return {
    thread: t.thread,
    hasOlder: page.hasOlder,
    canWrite: post.roomOpen && between === 0,
    closedNote: !post.roomOpen ? '대화방이 닫혔어요.' : between > 0 ? '이 대화는 더 이어갈 수 없어요.' : null,
    messages: page.messages.map((m) => roomView(roomMessage(m, user.id, set, user.role === 'ADMIN'))),
  };
}

/** 이전 대화 한 장 — 볼 수 있는 사람만(첫 장과 같은 검사) */
export async function loadRoomOlder(user: CommunityUser, postId: string, threadParam: string | undefined, before: string) {
  const post = await loadCommunityPost(user, postId);
  if (!post || post.authorBlocked) return { messages: [] as RoomView[], hasOlder: false };
  const t = roomThread(user, post, threadParam);
  if (!t.ok) return { messages: [] as RoomView[], hasOlder: false };
  const [page, blocked] = await Promise.all([
    loadRoomPage(prisma, { postId, thread: t.thread, before }),
    blockedIdsOf(user),
  ]);
  const set = new Set(blocked);
  return { hasOlder: page.hasOlder, messages: page.messages.map((m) => roomView(roomMessage(m, user.id, set, user.role === 'ADMIN'))) };
}

// ── 내 활동(마이 › 커뮤니티 활동) ─────────────────────────────────────────

export const MY_TABS = [
  { key: 'posts', label: '내 글' },
  { key: 'comments', label: '댓글 단 글' },
  { key: 'saved', label: '저장' },
  { key: 'meetups', label: '참가한 번개' },
  { key: 'team', label: '팀 신청' },
] as const;
export type MyTab = (typeof MY_TABS)[number]['key'];

const MY_TAKE = 50;
const mySelect = {
  id: true,
  category: true,
  tag: true,
  title: true,
  meetAt: true,
  closedAt: true,
  outcome: true,
  hiddenAt: true,
  acceptedCommentId: true,
  firstAnswerAt: true,
  createdAt: true,
  form: true,
  _count: { select: { joins: true, comments: { where: { hiddenAt: null } } } },
} as const;
type MyPost = Prisma.CommunityPostGetPayload<{ select: typeof mySelect }>;

/**
 * 내 활동 — 탭 하나씩(내 글 · 댓글 단 글 · 저장 · 참가한 번개 · 팀 신청). 가린 글은 내 글에서만 보인다(왜 가렸는지 볼 수 있게).
 * ponytail: 탭마다 최근 50개 — 더 많아지면 장 넘기기.
 */
export async function loadMyCommunity(user: CommunityUser, tab: MyTab) {
  const now = appNow();
  const toItem = (p: MyPost, extra: { joinStatus?: string; at?: Date } = {}) => {
    const capacity = p.category === 'meetup' ? (readMeetupForm(p.form)?.capacity ?? null) : null;
    return {
      id: p.id,
      category: p.category,
      tag: p.tag,
      title: p.title,
      meetAt: p.meetAt,
      hidden: p.hiddenAt !== null,
      solved: p.acceptedCommentId !== null,
      answered: p.firstAnswerAt !== null,
      comments: p._count.comments,
      state:
        p.category === 'meetup' || p.category === 'team'
          ? gatherState({ meetAt: p.meetAt, closedAt: p.closedAt, outcome: p.outcome, joins: p._count.joins, capacity, now })
          : null,
      joinStatus: extra.joinStatus ?? null,
      at: extra.at ?? p.createdAt,
    };
  };
  if (tab === 'posts') {
    const rows = await prisma.communityPost.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: MY_TAKE,
      select: mySelect,
    });
    return rows.map((p) => toItem(p));
  }
  if (tab === 'comments') {
    /* 글마다 한 줄(댓글이 여럿이어도) — 내가 마지막으로 단 때 순 */
    const rows = await prisma.communityComment.groupBy({
      by: ['postId'],
      where: { userId: user.id },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: MY_TAKE,
    });
    const posts = await prisma.communityPost.findMany({
      where: { id: { in: rows.map((r) => r.postId) }, hiddenAt: null },
      select: mySelect,
    });
    const by = new Map(posts.map((p) => [p.id, p]));
    return rows.flatMap((r) => {
      const p = by.get(r.postId);
      return p ? [toItem(p, { at: r._max.createdAt ?? undefined })] : [];
    });
  }
  if (tab === 'saved') {
    const rows = await prisma.communitySave.findMany({
      where: { userId: user.id, post: { hiddenAt: null } },
      orderBy: { createdAt: 'desc' },
      take: MY_TAKE,
      select: { createdAt: true, post: { select: mySelect } },
    });
    return rows.map((r) => toItem(r.post, { at: r.createdAt }));
  }
  const rows = await prisma.communityJoin.findMany({
    where: { userId: user.id, post: { category: tab === 'meetups' ? 'meetup' : 'team', hiddenAt: null } },
    orderBy: { createdAt: 'desc' },
    take: MY_TAKE,
    select: { status: true, createdAt: true, post: { select: mySelect } },
  });
  return rows.map((r) => toItem(r.post, { joinStatus: r.status, at: r.createdAt }));
}
