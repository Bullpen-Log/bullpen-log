import 'server-only';
import { prisma } from '@/lib/prisma';
import type { getCurrentUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import {
  POSTS_PER_PAGE,
  ROOM_OPEN_MS,
  isVideoPath,
  joinBlockReason,
  readMeetupForm,
  readTeamForm,
  type PostCategory,
  type PostSort,
} from '@/lib/community';
import { ageFromBirthDate } from '@/lib/profile';
import { appNow } from '@/lib/clock';
import { readCard } from '@/lib/community-cards';

/**
 * 커뮤니티 목록 · 글 하나를 읽는다 — 웹 화면(app/(dugout)/community)과 아이폰 앱 화면(app/actions/community.ts loadApp… →
 * native/src/app/community)이 같이 쓴다. 누가 무엇을 볼 · 누를 수 있는지(가린 글 · 지우기 · 신고 · 좋아요)를 여기서 한 번 정해
 * 두 화면이 어긋나지 않게 한다. 실제 막기는 서버 동작(app/actions/community.ts)이 한 번 더 한다.
 * 보기는 로그인 없이(2026-10-24 김민 — 휴대폰 브라우저로 온 사람도 읽는다): user 가 null 이면 가린 글은 빼고, 누르는 것은 모두 못 한다.
 * 차단한 사람의 글 · 댓글은 막은 사람에게 안 보인다(상대는 모른다).
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
 * 코치 배지 — 레슨장(LESSON)의 마스터 · 스태프로 활동 중인 사람. 더미 코치 조직은 뺀다.
 * ponytail: 글 화면마다 조회 하나 — 사람이 많아지면 User 에 칸을 두거나 기억해 둔다.
 */
async function coachIdsOf(userIds: string[]): Promise<Set<string>> {
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

/** 목록 — page 장부터 pages 장만큼(웹은 한 장씩, 앱은 더 보기로 이어 붙인 만큼). 가린 글은 관리자에게만. */
export async function loadCommunityList(
  user: CommunityUser | null,
  q: {
    category?: PostCategory;
    tag?: string;
    region?: string;
    /** 번개 게시판 — 다가오는 번개만(모일 때 순) 또는 지난 번개만 */
    when?: 'upcoming' | 'past';
    sort: PostSort;
    page: number;
    pages?: number;
  }
) {
  const isAdmin = user?.role === 'ADMIN';
  const blocked = await blockedIdsOf(user);
  const take = POSTS_PER_PAGE * Math.min(MAX_PAGES, Math.max(1, q.pages ?? 1));
  /* 한 장보다 하나 더 읽어 다음 장이 있는지만 안다 — count 쿼리 하나를 아낀다 */
  const rows = await prisma.communityPost.findMany({
    where: {
      ...(q.category ? { category: q.category } : {}),
      ...(q.tag ? { tag: q.tag } : {}),
      ...(q.region ? { region: q.region } : {}),
      ...(q.when === 'upcoming' ? { meetAt: { gte: appNow() } } : q.when === 'past' ? { meetAt: { lt: appNow() } } : {}),
      ...(isAdmin ? {} : { hiddenAt: null }),
      ...(blocked.length > 0 ? { userId: { notIn: blocked } } : {}),
    },
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
      region: true,
      meetAt: true,
      closedAt: true,
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
  const page = hasMore ? rows.slice(0, take) : rows;
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
        region: p.region,
        meetAt: p.meetAt,
        capacity: p.category === 'meetup' ? (readMeetupForm(p.form)?.capacity ?? null) : null,
        closed: p.closedAt !== null,
        joins: p._count.joins,
        hidden: p.hiddenAt !== null,
        createdAt: p.createdAt,
        nickname: p.user.nickname,
        coach: coaches.has(p.userId),
        likes: p._count.likes,
        comments: p._count.comments,
      };
    }),
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
        _count: { select: { likes: true } },
        comments: {
          where: isAdmin ? {} : { hiddenAt: null },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { nickname: true } } },
        },
        joins: {
          orderBy: { createdAt: 'asc' },
          select: { userId: true, user: { select: { nickname: true } } },
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
  const [urls, coaches] = await Promise.all([
    createPlaybackUrls(cardVideo ? [...post.media, cardVideo] : post.media),
    coachIdsOf([post.userId, ...comments.map((c) => c.userId)]),
  ]);

  const isOwner = post.userId === me;
  const hidden = post.hiddenAt !== null;
  const open = user !== null && !(hidden && !isAdmin);
  const question = post.category === 'question';

  /* 번개 · 팀 — 참가 · 신청 상태. 참가자 이름은 글쓴이와 참가자에게만, 남에게는 수만 */
  const meetup = post.category === 'meetup' ? readMeetupForm(post.form) : null;
  const team = post.category === 'team' ? readTeamForm(post.form) : null;
  const joinable = post.category === 'meetup' || post.category === 'team';
  const joined = post.joins.some((j) => j.userId === me);
  const now = appNow().getTime();
  const past = post.meetAt !== null && post.meetAt.getTime() < now;
  const full = meetup !== null && post.joins.length >= meetup.capacity;
  const joinBlock =
    !joinable || !user || joined
      ? null
      : joinBlockReason({
          age: user.birthDate ? ageFromBirthDate(user.birthDate) : null,
          adultOnly: meetup?.age === 'adult',
          isAuthor: isOwner,
          closed: post.closedAt !== null,
          full,
          past,
        });
  return {
    id: post.id,
    userId: post.userId,
    category: post.category,
    tag: post.tag,
    title: post.title,
    body: post.body,
    /* 서명이 안 된 경로(저장소에서 지워짐)는 뺀다 */
    media: post.media
      .filter((m) => urls[m])
      .map((m) => ({ url: urls[m], video: isVideoPath(m) })),
    card,
    /* 투구 기록 카드의 영상 — 기록을 지웠으면 없다 */
    cardVideoUrl: cardVideo ? (urls[cardVideo] ?? null) : null,
    meetup,
    team,
    region: post.region,
    joinable,
    joined,
    joinCount: post.joins.length,
    full,
    past,
    /* 참가 · 신청 단추를 막는 까닭(로그인 안 했거나 이미 참가했으면 null) */
    joinBlock,
    /* 참가자(번개) · 신청자(팀) — 글쓴이 · 참가자에게만 */
    joiners: isOwner || joined ? post.joins.map((j) => ({ userId: j.userId, nickname: j.user.nickname })) : [],
    /* 번개 대화방은 모임 다음 날 닫힌다 */
    roomOpen: post.meetAt === null || now <= post.meetAt.getTime() + ROOM_OPEN_MS,
    meetAt: post.meetAt,
    closed: post.closedAt !== null,
    acceptedCommentId: post.acceptedCommentId,
    createdAt: post.createdAt,
    nickname: post.user.nickname,
    coach: coaches.has(post.userId),
    hidden,
    isAdmin,
    isOwner,
    authorBlocked: blockedSet.has(post.userId),
    liked: post.likes.length > 0,
    likes: post._count.likes,
    /* 댓글 수는 가린 댓글을 빼고 — 목록의 수와 같아야 한다 */
    commentCount: comments.filter((c) => c.hiddenAt === null).length,
    canLike: open,
    canComment: open,
    canDelete: isOwner || isAdmin,
    /* 내 글은 신고하지 않는다 · 가린 글은 이미 운영자가 본 글 */
    canReport: user !== null && !isOwner && !hidden,
    canBlock: user !== null && !isOwner,
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
        canAccept: question && isOwner && !mine && open,
      };
    }),
  };
}

/**
 * 글에 묶인 대화 — 번개는 글쓴이 · 참가자 한 방, 팀은 신청자와 글쓴이 둘만(글쓴이는 ?thread=신청자 로 고른다). 볼 수 없으면 null.
 */
export async function loadCommunityRoom(
  user: CommunityUser | null,
  post: { id: string; category: string; userId: string; joiners: { userId: string }[]; joined: boolean },
  threadParam?: string
) {
  if (!user) return null;
  const isAuthor = post.userId === user.id;
  let thread: string | null = null;
  if (post.category === 'meetup') {
    if (!isAuthor && !post.joined) return null;
  } else if (post.category === 'team') {
    if (isAuthor) {
      thread = post.joiners.find((j) => j.userId === threadParam)?.userId ?? post.joiners[0]?.userId ?? null;
      if (!thread) return null;
    } else if (post.joined) thread = user.id;
    else return null;
  } else return null;

  const rows = await prisma.communityMessage.findMany({
    where: { postId: post.id, threadUserId: thread },
    orderBy: { createdAt: 'asc' },
    take: 300,
    select: { id: true, senderId: true, body: true, createdAt: true, sender: { select: { nickname: true } } },
  });
  return {
    thread,
    messages: rows.map((m) => ({
      id: m.id,
      mine: m.senderId === user.id,
      nickname: m.sender.nickname,
      body: m.body,
      createdAt: m.createdAt,
    })),
  };
}
