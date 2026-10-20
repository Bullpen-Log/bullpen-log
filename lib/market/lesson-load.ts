import 'server-only';
import { prisma } from '@/lib/prisma';
import { averageRating } from '@/lib/market/lessons';

/** 덕아웃 레슨 예약 읽기(2판) — 공개 프로필 목록 · 코치 하나 · 내 예약 · 코치의 예약 */

const COACH_SELECT = {
  id: true,
  name: true,
  region: true,
  note: true,
  coachIntro: true,
  coachCareer: true,
  specialties: true,
  priceFrom: true,
  priceNote: true,
  lessonHours: true,
  createdAt: true,
  owner: { select: { nickname: true } },
  _count: {
    select: { members: { where: { role: 'PLAYER', status: 'ACTIVE' } }, reviews: true },
  },
  reviews: { select: { rating: true } },
} as const;

export type CoachCard = {
  id: string;
  name: string;
  region: string | null;
  note: string | null;
  intro: string | null;
  career: string | null;
  specialties: string[];
  priceFrom: number | null;
  priceNote: string | null;
  hours: string | null;
  coach: string;
  members: number;
  reviews: number;
  rating: number | null;
};

function toCard(o: {
  id: string;
  name: string;
  region: string | null;
  note: string | null;
  coachIntro: string | null;
  coachCareer: string | null;
  specialties: string[];
  priceFrom: number | null;
  priceNote: string | null;
  lessonHours: string | null;
  owner: { nickname: string };
  _count: { members: number; reviews: number };
  reviews: { rating: number }[];
}): CoachCard {
  return {
    id: o.id,
    name: o.name,
    region: o.region,
    note: o.note,
    intro: o.coachIntro,
    career: o.coachCareer,
    specialties: o.specialties,
    priceFrom: o.priceFrom,
    priceNote: o.priceNote,
    hours: o.lessonHours,
    coach: o.owner.nickname,
    members: o._count.members,
    reviews: o._count.reviews,
    rating: averageRating(o.reviews.map((r) => r.rating)),
  };
}

export async function loadCoaches(f: {
  region?: string;
  specialty?: string;
  q?: string;
}): Promise<CoachCard[]> {
  const rows = await prisma.org.findMany({
    where: {
      kind: 'LESSON',
      publicProfile: true,
      ...(f.region ? { region: { contains: f.region } } : {}),
      ...(f.specialty ? { specialties: { has: f.specialty } } : {}),
      ...(f.q
        ? {
            OR: [
              { name: { contains: f.q, mode: 'insensitive' } },
              { coachIntro: { contains: f.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ reviews: { _count: 'desc' } }, { createdAt: 'asc' }],
    take: 100,
    select: COACH_SELECT,
  });
  return rows.map(toCard);
}

export type CoachDetail = CoachCard & {
  reviewList: {
    id: string;
    rating: number;
    body: string;
    nickname: string;
    createdAt: Date;
  }[];
  /** 보는 사람의 살아 있는 요청(요청 · 확정) */
  myBooking: {
    id: string;
    status: string;
    slot1: Date;
    slot2: Date | null;
    chosen: Date | null;
  } | null;
};

export async function loadCoach(
  orgId: string,
  viewerId: string | null
): Promise<CoachDetail | null> {
  const o = await prisma.org.findUnique({
    where: { id: orgId },
    select: {
      ...COACH_SELECT,
      kind: true,
      publicProfile: true,
      reviews: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          rating: true,
          body: true,
          createdAt: true,
          user: { select: { nickname: true } },
        },
      },
    },
  });
  if (!o || o.kind !== 'LESSON' || !o.publicProfile) return null;
  const myBooking = viewerId
    ? await prisma.lessonBooking.findFirst({
        where: { orgId, userId: viewerId, status: { in: ['REQUESTED', 'CONFIRMED'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, slot1: true, slot2: true, chosen: true },
      })
    : null;
  return {
    ...toCard({ ...o, reviews: o.reviews.map((r) => ({ rating: r.rating })) }),
    reviewList: o.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      nickname: r.user.nickname,
      createdAt: r.createdAt,
    })),
    myBooking,
  };
}

export type MyBooking = {
  id: string;
  status: string;
  slot1: Date;
  slot2: Date | null;
  chosen: Date | null;
  note: string | null;
  reply: string | null;
  org: { id: string; name: string; coach: string };
  hasReview: boolean;
  createdAt: Date;
};

export async function loadMyBookings(userId: string): Promise<MyBooking[]> {
  const rows = await prisma.lessonBooking.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      slot1: true,
      slot2: true,
      chosen: true,
      note: true,
      reply: true,
      createdAt: true,
      org: { select: { id: true, name: true, owner: { select: { nickname: true } } } },
      review: { select: { id: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    slot1: r.slot1,
    slot2: r.slot2,
    chosen: r.chosen,
    note: r.note,
    reply: r.reply,
    org: { id: r.org.id, name: r.org.name, coach: r.org.owner.nickname },
    hasReview: r.review != null,
    createdAt: r.createdAt,
  }));
}

export type CoachBooking = {
  id: string;
  status: string;
  slot1: Date;
  slot2: Date | null;
  chosen: Date | null;
  note: string | null;
  reply: string | null;
  createdAt: Date;
  player: { id: string; nickname: string; records: number };
  memberId: string | null;
};

/** 코치 쪽 — 이 레슨장의 예약, 요청부터 */
export async function loadOrgBookings(orgId: string): Promise<CoachBooking[]> {
  const rows = await prisma.lessonBooking.findMany({
    where: { orgId },
    orderBy: [{ status: 'asc' }, { slot1: 'asc' }],
    take: 200,
    select: {
      id: true,
      status: true,
      slot1: true,
      slot2: true,
      chosen: true,
      note: true,
      reply: true,
      createdAt: true,
      memberId: true,
      user: {
        select: { id: true, nickname: true, _count: { select: { pitchLogs: true } } },
      },
    },
  });
  const order: Record<string, number> = {
    REQUESTED: 0,
    CONFIRMED: 1,
    DONE: 2,
    DECLINED: 3,
    CANCELED: 4,
  };
  return rows
    .map((r) => ({
      id: r.id,
      status: r.status,
      slot1: r.slot1,
      slot2: r.slot2,
      chosen: r.chosen,
      note: r.note,
      reply: r.reply,
      createdAt: r.createdAt,
      memberId: r.memberId,
      player: {
        id: r.user.id,
        nickname: r.user.nickname,
        records: r.user._count.pitchLogs,
      },
    }))
    .sort(
      (a, b) =>
        (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
        a.slot1.getTime() - b.slot1.getTime()
    );
}

export async function countOrgRequests(orgId: string): Promise<number> {
  return prisma.lessonBooking.count({ where: { orgId, status: 'REQUESTED' } });
}
