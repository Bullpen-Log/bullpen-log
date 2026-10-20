import 'server-only';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';
import { dbDate } from '@/lib/nutrition/days';
import {
  parseHours,
  slotsOf,
  weekdayOf,
  type Slot,
  type VenueHours,
} from '@/lib/market/venues';

/** 덕아웃 장소 읽기(3판) — 목록 · 하나(그날 칸) · 내 예약 · 사장님의 예약 */

const VENUE_SELECT = {
  id: true,
  ownerId: true,
  name: true,
  kind: true,
  region: true,
  address: true,
  intro: true,
  slotMin: true,
  pricePerSlot: true,
  priceNote: true,
  hours: true,
  approval: true,
  images: true,
  publicProfile: true,
  hiddenAt: true,
  owner: { select: { nickname: true } },
} as const;

export type VenueCard = {
  id: string;
  name: string;
  kind: string;
  region: string;
  address: string | null;
  intro: string | null;
  slotMin: number;
  pricePerSlot: number | null;
  priceNote: string | null;
  hours: VenueHours;
  approval: boolean;
  image: string | null;
  images: string[];
  owner: string;
  mine: boolean;
  publicProfile: boolean;
};

async function urlsOf(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  return createPlaybackUrls(paths).catch(() => ({}) as Record<string, string>);
}

function toCard(
  v: {
    id: string;
    ownerId: string;
    name: string;
    kind: string;
    region: string;
    address: string | null;
    intro: string | null;
    slotMin: number;
    pricePerSlot: number | null;
    priceNote: string | null;
    hours: unknown;
    approval: boolean;
    images: string[];
    publicProfile: boolean;
    owner: { nickname: string };
  },
  urls: Record<string, string>,
  viewerId: string | null
): VenueCard {
  return {
    id: v.id,
    name: v.name,
    kind: v.kind,
    region: v.region,
    address: v.address,
    intro: v.intro,
    slotMin: v.slotMin,
    pricePerSlot: v.pricePerSlot,
    priceNote: v.priceNote,
    hours: parseHours(v.hours),
    approval: v.approval,
    image: v.images[0] ? (urls[v.images[0]] ?? null) : null,
    images: v.images.map((p) => urls[p]).filter((u): u is string => !!u),
    owner: v.owner.nickname,
    mine: viewerId === v.ownerId,
    publicProfile: v.publicProfile,
  };
}

export async function loadVenues(
  f: { region?: string; kind?: string; q?: string },
  viewerId: string | null
): Promise<VenueCard[]> {
  const rows = await prisma.venue.findMany({
    where: {
      publicProfile: true,
      hiddenAt: null,
      ...(f.region ? { region: f.region } : {}),
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.q
        ? {
            OR: [
              { name: { contains: f.q, mode: 'insensitive' } },
              { address: { contains: f.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: VENUE_SELECT,
  });
  const urls = await urlsOf(rows.flatMap((r) => (r.images[0] ? [r.images[0]] : [])));
  return rows.map((r) => toCard(r, urls, viewerId));
}

export async function loadVenue(
  id: string,
  viewerId: string | null
): Promise<VenueCard | null> {
  const v = await prisma.venue.findUnique({ where: { id }, select: VENUE_SELECT });
  if (!v || v.hiddenAt) return null;
  if (!v.publicProfile && v.ownerId !== viewerId) return null;
  const urls = await urlsOf(v.images);
  return toCard(v, urls, viewerId);
}

/** 그날의 칸 — 확정 · 요청 중인 예약은 taken. 오늘이면 지난 칸은 past */
export async function loadDaySlots(
  venue: VenueCard,
  dateKey: string,
  todayKey: string,
  nowMin: number
): Promise<Slot[]> {
  const booked = await prisma.venueBooking.findMany({
    where: {
      venueId: venue.id,
      date: dbDate(dateKey),
      status: { in: ['REQUESTED', 'CONFIRMED'] },
    },
    select: { startMin: true, endMin: true },
  });
  return slotsOf(
    venue.hours,
    weekdayOf(dateKey),
    venue.slotMin,
    booked,
    dateKey === todayKey ? nowMin : -1
  );
}

export type VenueBookingRow = {
  id: string;
  status: string;
  dateKey: string;
  startMin: number;
  endMin: number;
  note: string | null;
  reply: string | null;
  createdAt: Date;
  venue: { id: string; name: string; approval: boolean };
  user: { id: string; nickname: string };
};

const BOOKING_SELECT = {
  id: true,
  status: true,
  date: true,
  startMin: true,
  endMin: true,
  note: true,
  reply: true,
  createdAt: true,
  venue: { select: { id: true, name: true, approval: true } },
  user: { select: { id: true, nickname: true } },
} as const;

function toBooking(r: {
  id: string;
  status: string;
  date: Date;
  startMin: number;
  endMin: number;
  note: string | null;
  reply: string | null;
  createdAt: Date;
  venue: { id: string; name: string; approval: boolean };
  user: { id: string; nickname: string };
}): VenueBookingRow {
  return { ...r, dateKey: r.date.toISOString().slice(0, 10) };
}

export async function loadMyVenueBookings(userId: string): Promise<VenueBookingRow[]> {
  const rows = await prisma.venueBooking.findMany({
    where: { userId },
    orderBy: [{ date: 'desc' }, { startMin: 'desc' }],
    take: 50,
    select: BOOKING_SELECT,
  });
  return rows.map(toBooking);
}

/** 사장님 쪽 — 내 장소들의 예약(앞날 · 요청 먼저) */
export async function loadOwnerVenueBookings(
  ownerId: string,
  fromKey: string
): Promise<VenueBookingRow[]> {
  const rows = await prisma.venueBooking.findMany({
    where: { venue: { ownerId }, date: { gte: dbDate(fromKey) } },
    orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
    take: 200,
    select: BOOKING_SELECT,
  });
  return rows
    .map(toBooking)
    .sort(
      (a, b) => (a.status === 'REQUESTED' ? 0 : 1) - (b.status === 'REQUESTED' ? 0 : 1)
    );
}

export async function loadMyVenues(ownerId: string): Promise<VenueCard[]> {
  const rows = await prisma.venue.findMany({
    where: { ownerId, hiddenAt: null },
    orderBy: { createdAt: 'asc' },
    select: VENUE_SELECT,
  });
  const urls = await urlsOf(rows.flatMap((r) => (r.images[0] ? [r.images[0]] : [])));
  return rows.map((r) => toCard(r, urls, ownerId));
}

export async function countVenueRequests(ownerId: string): Promise<number> {
  return prisma.venueBooking.count({
    where: { venue: { ownerId }, status: 'REQUESTED' },
  });
}
