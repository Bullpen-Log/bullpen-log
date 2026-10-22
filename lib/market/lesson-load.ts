import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import {
  averageRating,
  matchCoach,
  medianHours,
  nextOpenLabel,
  reviewSummary,
  QUICK_CONFIRM_HOURS,
  SLOT_MIN_DEFAULT,
  type CoachFacts,
  type PrefKey,
  type SortKey,
  type TimeBandKey,
} from '@/lib/market/lessons';
import { maskName } from '@/lib/market/lessons';
import { parseHours, slotsOf, upcomingDays, weekdayOf, type Slot, type VenueHours } from '@/lib/market/venues';
import { DUMMY_BOOKING_NOTE } from '@/lib/market/lesson-dummy';

/**
 * 덕아웃 레슨 읽기(3판, 2026-10-22 닥터나우식 코치 찾기) — 공개 코치 목록(거르기 · 추천 점수 · 정렬) · 코치 하나(후기 요약 · 주간 시간) ·
 * 그날 레슨 칸 · 내 예약 · 코치의 예약. 레슨 가능 시간은 연습장과 같은 JSON(lib/market/venues.ts VenueHours)이라 그 함수를 같이 쓴다.
 */

const COACH_SELECT = {
  id: true,
  name: true,
  region: true,
  note: true,
  coachIntro: true,
  coachCareer: true,
  coachName: true,
  specialties: true,
  priceFrom: true,
  priceNote: true,
  lessonHours: true,
  lessonSlots: true,
  slotMin: true,
  trialPrice: true,
  sinkerReview: true,
  dummy: true,
  publicProfile: true,
  createdAt: true,
  owner: { select: { nickname: true } },
  _count: {
    select: { members: { where: { role: 'PLAYER', status: 'ACTIVE' } }, reviews: true },
  },
  reviews: { select: { rating: true, tags: true } },
  /* 확정 속도 — 최근 확정 · 끝난 예약 20개의 요청 → 확정 시간 */
  bookings: {
    where: { status: { in: ['CONFIRMED', 'DONE'] }, confirmedAt: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { createdAt: true, confirmedAt: true },
  },
} satisfies Prisma.OrgSelect;

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
  trialPrice: number | null;
  hours: string | null;
  slots: VenueHours | null;
  slotMin: number;
  sinkerReview: boolean;
  dummy: boolean;
  publicProfile: boolean;
  coach: string;
  members: number;
  reviews: number;
  rating: number | null;
  /** 확정까지 걸린 시간의 가운데 값(시간) · 하루 안이면 '빠른 확정' */
  confirmHours: number | null;
  quickConfirm: boolean;
  /** 카드 한 줄 '오늘 19:00부터' — 시간을 안 적었으면 null */
  nextOpen: string | null;
  /** 추천 점수 · 까닭 — 찾기 조건으로 목록을 열었을 때만 */
  match: { score: number; reasons: string[] } | null;
};

type CoachRow = {
  id: string;
  name: string;
  region: string | null;
  note: string | null;
  coachIntro: string | null;
  coachCareer: string | null;
  coachName: string | null;
  specialties: string[];
  priceFrom: number | null;
  priceNote: string | null;
  lessonHours: string | null;
  lessonSlots: unknown;
  slotMin: number;
  trialPrice: number | null;
  sinkerReview: boolean;
  dummy: boolean;
  publicProfile: boolean;
  owner: { nickname: string };
  _count: { members: number; reviews: number };
  reviews: { rating: number; tags: string[] }[];
  bookings: { createdAt: Date; confirmedAt: Date | null }[];
};

/** 한국 시각의 요일 · 몇 분 */
function kstNow(now = appNow()): { weekday: number; min: number; todayKey: string } {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  return {
    weekday: kst.getUTCDay(),
    min: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
    todayKey: toDateKey(now),
  };
}

function toCard(o: CoachRow, now = appNow()): CoachCard {
  const slots = o.lessonSlots ? parseHours(o.lessonSlots) : null;
  const hasSlots = !!slots && Object.values(slots).some(Boolean);
  const confirmHours = medianHours(o.bookings);
  const k = kstNow(now);
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
    trialPrice: o.trialPrice,
    hours: o.lessonHours,
    slots: hasSlots ? slots : null,
    slotMin: o.slotMin || SLOT_MIN_DEFAULT,
    sinkerReview: o.sinkerReview,
    dummy: o.dummy,
    publicProfile: o.publicProfile,
    coach: o.coachName?.trim() || o.owner.nickname,
    members: o._count.members,
    reviews: o._count.reviews,
    rating: averageRating(o.reviews.map((r) => r.rating)),
    confirmHours,
    quickConfirm: confirmHours != null && confirmHours <= QUICK_CONFIRM_HOURS,
    nextOpen: nextOpenLabel(hasSlots ? slots : null, k.weekday, k.min),
    match: null,
  };
}

function factsOf(c: CoachCard): CoachFacts {
  return {
    specialties: c.specialties,
    region: c.region,
    rating: c.rating,
    reviews: c.reviews,
    confirmHours: c.confirmHours,
    sinkerReview: c.sinkerReview,
    trialPrice: c.trialPrice,
    priceFrom: c.priceFrom,
    slots: c.slots,
  };
}

export type CoachFilter = {
  region?: string;
  specialty?: string;
  q?: string;
  prefs?: PrefKey[];
  band?: TimeBandKey;
  /** 찾기 흐름이 고른 요일들(0=일) — 그 요일에 레슨 시간이 있는 코치를 앞으로 */
  weekdays?: number[];
  sort?: SortKey;
};

/** 공개 코치 목록 — 거르기(DB) → 점수(matchCoach) → 정렬. 찾기 조건이 있으면 카드마다 '왜 추천' 까닭이 붙는다 */
export async function loadCoaches(f: CoachFilter): Promise<CoachCard[]> {
  const rows = await prisma.org.findMany({
    where: {
      kind: 'LESSON',
      publicProfile: true,
      ...(f.region ? { region: { contains: f.region, mode: 'insensitive' } } : {}),
      ...(f.specialty ? { specialties: { has: f.specialty } } : {}),
      ...(f.q
        ? {
            OR: [
              { name: { contains: f.q, mode: 'insensitive' } },
              { coachName: { contains: f.q, mode: 'insensitive' } },
              { coachIntro: { contains: f.q, mode: 'insensitive' } },
              { region: { contains: f.q, mode: 'insensitive' } },
              { owner: { nickname: { contains: f.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    take: 200,
    select: COACH_SELECT,
  });
  const now = appNow();
  const k = kstNow(now);
  const weekday = f.weekdays?.[0] ?? k.weekday;
  const scored = rows.map((r) => {
    const c = toCard(r, now);
    const m = matchCoach(factsOf(c), {
      specialty: f.specialty,
      prefs: f.prefs,
      band: f.band,
      weekday,
    });
    /* 고른 요일 가운데 하나라도 레슨 시간이 있으면 +, 시간을 안 적은 코치는 그대로 */
    const dayOk =
      !f.weekdays || !c.slots || f.weekdays.some((d) => c.slots?.[String(d)]);
    const score = m.score + (dayOk ? 0 : -25);
    const asked = !!(f.specialty || f.prefs?.length || f.band || f.weekdays);
    return { ...c, match: asked ? { score, reasons: m.reasons } : null, _score: score };
  });
  const sort = f.sort ?? 'match';
  scored.sort((a, b) => {
    if (sort === 'rating')
      return (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews || b._score - a._score;
    if (sort === 'price')
      return (
        (a.priceFrom ?? Number.MAX_SAFE_INTEGER) - (b.priceFrom ?? Number.MAX_SAFE_INTEGER) ||
        b._score - a._score
      );
    if (sort === 'quick')
      return (
        (a.confirmHours ?? Number.MAX_SAFE_INTEGER) - (b.confirmHours ?? Number.MAX_SAFE_INTEGER) ||
        b._score - a._score
      );
    return b._score - a._score || b.reviews - a.reviews;
  });
  return scored.map((c) => {
    const { _score, ...rest } = c;
    void _score;
    return rest;
  });
}

/** 허브의 '추천 코치' — 후기 · 확정 속도 · 체험가로 점수 매겨 위 n 명 */
export async function loadRecommendedCoaches(n = 6): Promise<CoachCard[]> {
  const all = await loadCoaches({ prefs: ['rated', 'quick'] });
  return all.map((c) => ({ ...c, match: null })).slice(0, n);
}

/** 허브의 '빠른 예약' — 오늘 · 내일 레슨 시간이 열린 코치 */
export async function loadQuickCoaches(n = 6): Promise<CoachCard[]> {
  const all = await loadCoaches({});
  return all
    .filter((c) => c.nextOpen && /^(오늘|내일)/.test(c.nextOpen))
    .map((c) => ({ ...c, match: null }))
    .slice(0, n);
}

/** 비교함 — 고른 코치 몇(최대 COMPARE_MAX)을 차례대로 */
export async function loadCoachesByIds(ids: string[]): Promise<CoachCard[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.org.findMany({
    where: { id: { in: ids }, kind: 'LESSON', publicProfile: true },
    select: COACH_SELECT,
  });
  const now = appNow();
  const map = new Map(rows.map((r) => [r.id, toCard(r, now)]));
  return ids.map((id) => map.get(id)).filter((c): c is CoachCard => !!c);
}

export type CoachDetail = CoachCard & {
  reviewList: {
    id: string;
    rating: number;
    body: string;
    tags: string[];
    nickname: string;
    createdAt: Date;
  }[];
  summary: ReturnType<typeof reviewSummary>;
  /** 보는 사람의 살아 있는 요청(요청 · 확정) */
  myBooking: {
    id: string;
    status: string;
    slot1: Date;
    slot2: Date | null;
    chosen: Date | null;
  } | null;
  /** 보는 사람이 이 레슨장의 주인인가 */
  mine: boolean;
};

export async function loadCoach(
  orgId: string,
  viewerId: string | null,
  /** 관리자 미리보기 — 비공개도 본다 */
  includeHidden = false
): Promise<CoachDetail | null> {
  const o = await prisma.org.findUnique({
    where: { id: orgId },
    select: {
      ...COACH_SELECT,
      kind: true,
      ownerId: true,
      reviews: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          rating: true,
          body: true,
          tags: true,
          createdAt: true,
          user: { select: { nickname: true } },
        },
      },
    },
  });
  if (!o || o.kind !== 'LESSON' || (!o.publicProfile && !includeHidden)) return null;
  const myBooking = viewerId
    ? await prisma.lessonBooking.findFirst({
        where: { orgId, userId: viewerId, status: { in: ['REQUESTED', 'CONFIRMED'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, slot1: true, slot2: true, chosen: true },
      })
    : null;
  const flat = o.reviews.map((r) => ({ rating: r.rating, tags: r.tags }));
  return {
    ...toCard({ ...o, reviews: flat }),
    reviewList: o.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      tags: r.tags,
      nickname: maskName(r.user.nickname),
      createdAt: r.createdAt,
    })),
    summary: reviewSummary(flat),
    myBooking,
    /* 더미 코치는 주인(관리자)도 예약해 본다 — 화면을 끝까지 눌러 보려고 */
    mine: !!viewerId && o.ownerId === viewerId && !o.dummy,
  };
}

export type DaySlots = { dateKey: string; slots: Slot[] };

/**
 * 예약 화면의 날짜 띠 · 그날 칸 — 코치의 요일별 레슨 시간을 slotMin 으로 자르고, 확정된 예약과 겹치면 taken.
 * 레슨 시간을 안 적은 코치는 날마다 09:00~21:00 을 연 것으로 본다(코치가 확정하며 고르니 넉넉히).
 */
export async function loadCoachDays(
  coach: Pick<CoachCard, 'id' | 'slots' | 'slotMin'>,
  n = 14
): Promise<{ todayKey: string; days: string[]; byDay: DaySlots[] }> {
  const now = appNow();
  const k = kstNow(now);
  const days = upcomingDays(k.todayKey, n);
  const from = new Date(`${days[0]}T00:00:00+09:00`);
  const to = new Date(`${days[days.length - 1]}T23:59:59+09:00`);
  const booked = await prisma.lessonBooking.findMany({
    where: { orgId: coach.id, status: 'CONFIRMED', chosen: { gte: from, lte: to } },
    select: { chosen: true },
  });
  const takenByDay = new Map<string, number[]>();
  for (const b of booked) {
    if (!b.chosen) continue;
    const kst = new Date(b.chosen.getTime() + 9 * 3_600_000);
    const key = kst.toISOString().slice(0, 10);
    const list = takenByDay.get(key) ?? [];
    list.push(kst.getUTCHours() * 60 + kst.getUTCMinutes());
    takenByDay.set(key, list);
  }
  const hours: VenueHours =
    coach.slots ??
    Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: '09:00', close: '21:00' }]));
  const byDay = days.map((dateKey) => {
    const taken = (takenByDay.get(dateKey) ?? []).map((s) => ({
      startMin: s,
      endMin: s + coach.slotMin,
    }));
    /* 오늘은 지금부터 2시간 뒤 칸부터(lib/market/lessons.ts BOOKING_MIN_HOURS_AHEAD) */
    const nowMin = dateKey === k.todayKey ? k.min + 120 : -1;
    return { dateKey, slots: slotsOf(hours, weekdayOf(dateKey), coach.slotMin, taken, nowMin) };
  });
  return { todayKey: k.todayKey, days, byDay };
}

export type MyBooking = {
  id: string;
  status: string;
  slot1: Date;
  slot2: Date | null;
  chosen: Date | null;
  note: string | null;
  reply: string | null;
  audience: string | null;
  payMethod: string | null;
  org: { id: string; name: string; coach: string; priceFrom: number | null };
  hasReview: boolean;
  createdAt: Date;
};

export async function loadMyBookings(userId: string): Promise<MyBooking[]> {
  const rows = await prisma.lessonBooking.findMany({
    /* 더미 코치에 딸려 만든 가짜 예약(관리자 계정 이름으로 적힌 것, app/actions/admin-coaches.ts)은 관리자의 '내 것'에 안 보인다 */
    where: { userId, NOT: { AND: [{ note: DUMMY_BOOKING_NOTE }, { org: { dummy: true } }] } },
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
      audience: true,
      payMethod: true,
      createdAt: true,
      org: {
        select: {
          id: true,
          name: true,
          coachName: true,
          priceFrom: true,
          owner: { select: { nickname: true } },
        },
      },
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
    audience: r.audience,
    payMethod: r.payMethod,
    org: {
      id: r.org.id,
      name: r.org.name,
      coach: r.org.coachName?.trim() || r.org.owner.nickname,
      priceFrom: r.org.priceFrom,
    },
    hasReview: r.review != null,
    createdAt: r.createdAt,
  }));
}

/** 허브의 '내 레슨' — 가장 가까운 살아 있는 예약 하나 */
export async function loadUpcomingBooking(userId: string): Promise<MyBooking | null> {
  const all = await loadMyBookings(userId);
  const live = all.filter((b) => b.status === 'REQUESTED' || b.status === 'CONFIRMED');
  live.sort((a, b) => (a.chosen ?? a.slot1).getTime() - (b.chosen ?? b.slot1).getTime());
  return live[0] ?? null;
}

export type CoachBooking = {
  id: string;
  status: string;
  slot1: Date;
  slot2: Date | null;
  chosen: Date | null;
  note: string | null;
  reply: string | null;
  audience: string | null;
  specialty: string | null;
  payMethod: string | null;
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
      audience: true,
      specialty: true,
      payMethod: true,
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
      audience: r.audience,
      specialty: r.specialty,
      payMethod: r.payMethod,
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

/* ── 관리자(2026-10-22) — 등록된 코치 모두(비공개 · 더미 포함) ── */

export type AdminCoachRow = CoachCard & {
  ownerNickname: string;
  ownerEmail: string;
  requests: number;
  createdAt: Date;
};

export async function loadAllCoaches(): Promise<AdminCoachRow[]> {
  const rows = await prisma.org.findMany({
    where: { kind: 'LESSON' },
    orderBy: [{ publicProfile: 'desc' }, { createdAt: 'desc' }],
    select: {
      ...COACH_SELECT,
      owner: { select: { nickname: true, email: true } },
      _count: {
        select: {
          members: { where: { role: 'PLAYER', status: 'ACTIVE' } },
          reviews: true,
          bookings: { where: { status: 'REQUESTED' } },
        },
      },
    },
  });
  const now = appNow();
  return rows.map((r) => ({
    ...toCard(r, now),
    ownerNickname: r.owner.nickname,
    ownerEmail: r.owner.email,
    requests: r._count.bookings,
    createdAt: r.createdAt,
  }));
}
