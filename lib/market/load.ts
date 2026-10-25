import 'server-only';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';
import { PER_PAGE, type ListingFilter } from '@/lib/market/specs';

/**
 * 덕아웃 장터 읽기(2026-10-20) — 로그인 없이 본다(viewer 가 null). 가린 물건은 주인과 관리자만. 사진은 비공개 저장소라 서명 주소를 만든다
 * (lib/storage.ts createPlaybackUrls — 30분 돌려쓴다). 쓰기는 app/actions/market.ts · chat.ts.
 */

export type Viewer = { id: string; role: string } | null;

const CARD_SELECT = {
  id: true,
  category: true,
  title: true,
  price: true,
  condition: true,
  specs: true,
  region: true,
  images: true,
  status: true,
  hiddenAt: true,
  createdAt: true,
  userId: true,
  _count: { select: { favorites: true, chats: true } },
} as const;

export type ListingCard = {
  id: string;
  category: string;
  title: string;
  price: number;
  condition: string;
  specs: unknown;
  region: string;
  image: string | null;
  status: string;
  hidden: boolean;
  createdAt: Date;
  mine: boolean;
  favorites: number;
  chats: number;
};

async function urlsOf(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  return createPlaybackUrls(paths).catch(() => ({}) as Record<string, string>);
}

function toCard(
  row: {
    id: string;
    category: string;
    title: string;
    price: number;
    condition: string;
    specs: unknown;
    region: string;
    images: string[];
    status: string;
    hiddenAt: Date | null;
    createdAt: Date;
    userId: string;
    _count: { favorites: number; chats: number };
  },
  urls: Record<string, string>,
  viewer: Viewer
): ListingCard {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    price: row.price,
    condition: row.condition,
    specs: row.specs,
    region: row.region,
    image: row.images[0] ? (urls[row.images[0]] ?? null) : null,
    status: row.status,
    hidden: row.hiddenAt != null,
    createdAt: row.createdAt,
    mine: viewer?.id === row.userId,
    favorites: row._count.favorites,
    chats: row._count.chats,
  };
}

/** 목록 — 거르기 · 정렬 · 장. 거래 완료는 all 일 때만. 가린 것은 관리자에게만(흐리게) */
export async function loadListings(
  f: ListingFilter,
  viewer: Viewer
): Promise<{ items: ListingCard[]; hasMore: boolean }> {
  const isAdmin = viewer?.role === 'ADMIN';
  const rows = await prisma.listing.findMany({
    where: {
      ...(isAdmin ? {} : { hiddenAt: null }),
      ...(f.all ? {} : { status: { in: ['ACTIVE', 'RESERVED'] } }),
      ...(f.category ? { category: f.category } : {}),
      ...(f.condition ? { condition: f.condition } : {}),
      ...(f.region ? { region: f.region } : {}),
      ...(f.q
        ? {
            OR: [
              { title: { contains: f.q, mode: 'insensitive' } },
              { body: { contains: f.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy:
      f.sort === 'cheap'
        ? [{ price: 'asc' }, { createdAt: 'desc' }]
        : f.sort === 'expensive'
          ? [{ price: 'desc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }],
    skip: (f.page - 1) * PER_PAGE,
    take: PER_PAGE + 1,
    select: CARD_SELECT,
  });
  const hasMore = rows.length > PER_PAGE;
  const page = hasMore ? rows.slice(0, PER_PAGE) : rows;
  const urls = await urlsOf(page.flatMap((r) => (r.images[0] ? [r.images[0]] : [])));
  return { items: page.map((r) => toCard(r, urls, viewer)), hasMore };
}

/** 홈 피드용 — 최신 판매 중 몇 개 */
export async function loadLatestListings(
  take: number,
  viewer: Viewer
): Promise<ListingCard[]> {
  const rows = await prisma.listing.findMany({
    where: { hiddenAt: null, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    take,
    select: CARD_SELECT,
  });
  const urls = await urlsOf(rows.flatMap((r) => (r.images[0] ? [r.images[0]] : [])));
  return rows.map((r) => toCard(r, urls, viewer));
}

export type ListingDetail = ListingCard & {
  body: string;
  images: string[];
  views: number;
  updatedAt: Date;
  seller: {
    id: string;
    nickname: string;
    since: Date;
    listings: number;
  };
  favorite: boolean;
  /** 보는 사람(사는 쪽)과 주인 사이의 채팅방 — 있으면 그 방으로 */
  chatId: string | null;
};

/** 물건 하나 — 없거나 볼 수 없으면 null. 가린 물건은 주인 · 관리자만 */
export async function loadListing(
  id: string,
  viewer: Viewer
): Promise<ListingDetail | null> {
  const row = await prisma.listing.findUnique({
    where: { id },
    select: {
      ...CARD_SELECT,
      body: true,
      views: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          nickname: true,
          createdAt: true,
          /* 투구 기록 수는 거래 신뢰의 근거가 아니라 안 읽는다(2026-10-25 규칙 7 — 싱커 활동을 판매자 신호로 쓰지 않는다) */
          _count: {
            select: { listings: { where: { hiddenAt: null } } },
          },
        },
      },
      favorites: viewer
        ? { where: { userId: viewer.id }, select: { userId: true } }
        : false,
      chats: viewer ? { where: { buyerId: viewer.id }, select: { id: true } } : false,
    },
  });
  if (!row) return null;
  if (row.hiddenAt && viewer?.role !== 'ADMIN' && viewer?.id !== row.userId)
    return null;
  const urls = await urlsOf(row.images);
  const card = toCard(row, urls, viewer);
  return {
    ...card,
    body: row.body,
    images: row.images.map((p) => urls[p]).filter((u): u is string => !!u),
    views: row.views,
    updatedAt: row.updatedAt,
    seller: {
      id: row.user.id,
      nickname: row.user.nickname,
      since: row.user.createdAt,
      listings: row.user._count.listings,
    },
    favorite: Array.isArray(row.favorites) && row.favorites.length > 0,
    chatId: Array.isArray(row.chats) && row.chats[0] ? row.chats[0].id : null,
  };
}

/** 내 물건(판매자 화면) — 가린 것 포함, 새 것부터 */
export async function loadMyListings(userId: string): Promise<ListingCard[]> {
  const rows = await prisma.listing.findMany({
    where: { userId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: CARD_SELECT,
  });
  const urls = await urlsOf(rows.flatMap((r) => (r.images[0] ? [r.images[0]] : [])));
  return rows.map((r) => toCard(r, urls, { id: userId, role: 'USER' }));
}

/** 찜한 물건 */
export async function loadFavorites(userId: string): Promise<ListingCard[]> {
  const rows = await prisma.listingFavorite.findMany({
    where: { userId, listing: { hiddenAt: null } },
    orderBy: { createdAt: 'desc' },
    select: { listing: { select: CARD_SELECT } },
  });
  const items = rows.map((r) => r.listing);
  const urls = await urlsOf(items.flatMap((r) => (r.images[0] ? [r.images[0]] : [])));
  return items.map((r) => toCard(r, urls, { id: userId, role: 'USER' }));
}

/* ── 채팅 ── */

export type ConversationRow = {
  id: string;
  /** avatarUrl — 프로필 사진(서명 주소), 없으면 null(채팅 목록 · 방 머리, 2026-10-24) */
  other: { id: string; nickname: string; avatarUrl: string | null };
  listing: {
    id: string;
    title: string;
    price: number;
    image: string | null;
    status: string;
  } | null;
  lastText: string | null;
  lastAt: Date;
  unread: number;
  role: 'buyer' | 'seller';
};

/** 내 채팅방 — 마지막 말이 최근인 것부터. 안 읽은 수는 내가 읽은 때 뒤의 상대 말 */
export async function loadConversations(userId: string): Promise<ConversationRow[]> {
  const rows = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    orderBy: { lastAt: 'desc' },
    take: 100,
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      lastText: true,
      lastAt: true,
      buyerReadAt: true,
      sellerReadAt: true,
      buyer: { select: { id: true, nickname: true, avatarPath: true } },
      seller: { select: { id: true, nickname: true, avatarPath: true } },
      listing: {
        select: { id: true, title: true, price: true, images: true, status: true },
      },
    },
  });
  const urls = await urlsOf(
    rows.flatMap((r) => [
      ...(r.listing?.images[0] ? [r.listing.images[0]] : []),
      ...(r.buyerId === userId ? [r.seller.avatarPath] : [r.buyer.avatarPath]).filter((p): p is string => !!p),
    ])
  );
  const unreadCounts = await Promise.all(
    rows.map((r) => {
      const mine = r.buyerId === userId;
      const readAt = mine ? r.buyerReadAt : r.sellerReadAt;
      return prisma.message.count({
        where: {
          conversationId: r.id,
          senderId: { not: userId },
          ...(readAt ? { createdAt: { gt: readAt } } : {}),
        },
      });
    })
  );
  return rows.map((r, i) => {
    const mine = r.buyerId === userId;
    const o = mine ? r.seller : r.buyer;
    return {
      id: r.id,
      other: { id: o.id, nickname: o.nickname, avatarUrl: o.avatarPath ? (urls[o.avatarPath] ?? null) : null },
      listing: r.listing
        ? {
            id: r.listing.id,
            title: r.listing.title,
            price: r.listing.price,
            image: r.listing.images[0] ? (urls[r.listing.images[0]] ?? null) : null,
            status: r.listing.status,
          }
        : null,
      lastText: r.lastText,
      lastAt: r.lastAt,
      unread: unreadCounts[i],
      role: mine ? 'buyer' : 'seller',
    };
  });
}

export type ConversationDetail = ConversationRow & {
  messages: { id: string; mine: boolean; body: string; createdAt: Date }[];
  myId: string;
};

/** 채팅방 하나 — 내 방이 아니면 null. 읽은 때를 지금으로 적는다(안 읽은 수가 0 이 된다) */
export async function loadConversation(
  id: string,
  userId: string
): Promise<ConversationDetail | null> {
  const r = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      lastText: true,
      lastAt: true,
      buyer: { select: { id: true, nickname: true, avatarPath: true } },
      seller: { select: { id: true, nickname: true, avatarPath: true } },
      listing: {
        select: { id: true, title: true, price: true, images: true, status: true },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 500,
        select: { id: true, senderId: true, body: true, createdAt: true },
      },
    },
  });
  if (!r || (r.buyerId !== userId && r.sellerId !== userId)) return null;
  const mine = r.buyerId === userId;
  await prisma.conversation.update({
    where: { id },
    data: mine ? { buyerReadAt: new Date() } : { sellerReadAt: new Date() },
  });
  const o = mine ? r.seller : r.buyer;
  const urls = await urlsOf([
    ...(r.listing?.images[0] ? [r.listing.images[0]] : []),
    ...(o.avatarPath ? [o.avatarPath] : []),
  ]);
  return {
    id: r.id,
    other: { id: o.id, nickname: o.nickname, avatarUrl: o.avatarPath ? (urls[o.avatarPath] ?? null) : null },
    listing: r.listing
      ? {
          id: r.listing.id,
          title: r.listing.title,
          price: r.listing.price,
          image: r.listing.images[0] ? (urls[r.listing.images[0]] ?? null) : null,
          status: r.listing.status,
        }
      : null,
    lastText: r.lastText,
    lastAt: r.lastAt,
    unread: 0,
    role: mine ? 'buyer' : 'seller',
    myId: userId,
    messages: r.messages.map((m) => ({
      id: m.id,
      mine: m.senderId === userId,
      body: m.body,
      createdAt: m.createdAt,
    })),
  };
}

/** 안 읽은 채팅이 있나 — 껍데기의 점 */
export async function countUnread(userId: string): Promise<number> {
  const rows = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    select: { id: true, buyerId: true, buyerReadAt: true, sellerReadAt: true },
    take: 100,
  });
  if (rows.length === 0) return 0;
  const counts = await Promise.all(
    rows.map((r) => {
      const readAt = r.buyerId === userId ? r.buyerReadAt : r.sellerReadAt;
      return prisma.message.count({
        where: {
          conversationId: r.id,
          senderId: { not: userId },
          ...(readAt ? { createdAt: { gt: readAt } } : {}),
        },
      });
    })
  );
  return counts.reduce((a, b) => a + b, 0);
}

/* ── 피드(소통) — 로그인 없이 보는 최신 글 ── */

export async function loadPublicPosts(take: number) {
  const rows = await prisma.communityPost.findMany({
    where: { hiddenAt: null },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      category: true,
      title: true,
      body: true,
      createdAt: true,
      user: { select: { nickname: true } },
      _count: { select: { likes: true, comments: { where: { hiddenAt: null } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    category: p.category,
    title: p.title,
    preview: p.body.length > 120 ? `${p.body.slice(0, 120)}…` : p.body,
    createdAt: p.createdAt,
    nickname: p.user.nickname,
    likes: p._count.likes,
    comments: p._count.comments,
  }));
}
