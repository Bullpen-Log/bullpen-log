import 'server-only';
import { prisma } from '@/lib/prisma';
import type { getCurrentUser } from '@/lib/dal';
import { POSTS_PER_PAGE, type PostCategory, type PostSort } from '@/lib/community';

/**
 * 커뮤니티 목록 · 글 하나를 읽는다 — 웹 화면(app/(app)/community)과 아이폰 앱 화면(app/actions/community.ts loadApp… →
 * native/src/app/community)이 같이 쓴다. 누가 무엇을 볼 · 누를 수 있는지(가린 글 · 지우기 · 신고 · 좋아요)를 여기서 한 번 정해
 * 두 화면이 어긋나지 않게 한다. 실제 막기는 서버 동작(app/actions/community.ts)이 한 번 더 한다.
 * 'use server' 파일에 두지 않는다 — user 를 받는 함수가 거기 있으면 누구나 부를 수 있는 입구가 된다.
 */
type CommunityUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** 앱이 한 번에 다시 읽을 수 있는 장 수 — 돌아왔을 때 본 만큼 다시 읽는다(200개까지) */
const MAX_PAGES = 10;

/** 목록 — page 장부터 pages 장만큼(웹은 한 장씩, 앱은 더 보기로 이어 붙인 만큼). 가린 글은 관리자에게만. */
export async function loadCommunityList(
  user: CommunityUser,
  q: { category?: PostCategory; sort: PostSort; page: number; pages?: number }
) {
  const isAdmin = user.role === 'ADMIN';
  const take = POSTS_PER_PAGE * Math.min(MAX_PAGES, Math.max(1, q.pages ?? 1));
  /* 한 장보다 하나 더 읽어 다음 장이 있는지만 안다 — count 쿼리 하나를 아낀다 */
  const rows = await prisma.communityPost.findMany({
    where: {
      ...(q.category ? { category: q.category } : {}),
      ...(isAdmin ? {} : { hiddenAt: null }),
    },
    orderBy:
      q.sort === 'hot'
        ? [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }],
    skip: (q.page - 1) * POSTS_PER_PAGE,
    take: take + 1,
    select: {
      id: true,
      category: true,
      title: true,
      body: true,
      hiddenAt: true,
      createdAt: true,
      user: { select: { nickname: true } },
      /* 댓글 수는 가린 댓글을 빼고 — 사용자가 보는 수와 같아야 한다 */
      _count: { select: { likes: true, comments: { where: { hiddenAt: null } } } },
    },
  });
  const hasMore = rows.length > take;
  return {
    hasMore,
    /* 두 줄 미리보기에 본문 전체(최대 5,000자)를 실어 보내지 않는다 */
    posts: (hasMore ? rows.slice(0, take) : rows).map((p) => ({
      id: p.id,
      category: p.category,
      title: p.title,
      preview: p.body.length > 160 ? `${p.body.slice(0, 160)}…` : p.body,
      hidden: p.hiddenAt !== null,
      createdAt: p.createdAt,
      nickname: p.user.nickname,
      likes: p._count.likes,
      comments: p._count.comments,
    })),
  };
}

/**
 * 글 하나 — 없거나 볼 수 없으면 null. 가린 글은 관리자와 글쓴이만(글쓴이는 왜 안 보이는지 알아야 한다). 가린 댓글은 관리자에게만.
 * 가린 글은 글쓴이도 좋아요 · 댓글을 못 한다(아무도 못 보는 글이다) — 서버 toggleLike · addComment 가 거절하는 것과 같은 조건.
 */
export async function loadCommunityPost(user: CommunityUser, id: string) {
  const isAdmin = user.role === 'ADMIN';
  const post = await prisma.communityPost.findUnique({
    where: { id },
    include: {
      user: { select: { nickname: true } },
      /* 내가 눌렀는지만 — 전체 수는 _count 로 */
      likes: { where: { userId: user.id }, select: { userId: true } },
      _count: { select: { likes: true } },
      comments: {
        where: isAdmin ? {} : { hiddenAt: null },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { nickname: true } } },
      },
    },
  });
  if (!post || (post.hiddenAt && !isAdmin && post.userId !== user.id)) return null;

  const isOwner = post.userId === user.id;
  const hidden = post.hiddenAt !== null;
  const open = !(hidden && !isAdmin);
  return {
    id: post.id,
    category: post.category,
    title: post.title,
    body: post.body,
    createdAt: post.createdAt,
    nickname: post.user.nickname,
    hidden,
    isAdmin,
    liked: post.likes.length > 0,
    likes: post._count.likes,
    /* 댓글 수는 가린 댓글을 빼고 — 목록의 수와 같아야 한다 */
    commentCount: post.comments.filter((c) => c.hiddenAt === null).length,
    canLike: open,
    canComment: open,
    canDelete: isOwner || isAdmin,
    /* 내 글은 신고하지 않는다 · 가린 글은 이미 운영자가 본 글 */
    canReport: !isOwner && !hidden,
    comments: post.comments.map((c) => {
      const mine = c.userId === user.id;
      return {
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        nickname: c.user.nickname,
        hidden: c.hiddenAt !== null,
        mine,
        canDelete: mine || isAdmin,
        canReport: !mine,
      };
    }),
  };
}
