'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireMaster, requireUser } from '@/lib/dal';
import { isOwnedBy } from '@/lib/storage';
import { dbDate } from '@/lib/nutrition/days';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { isDateKey } from '@/lib/org/rules';
import { isRegion as isMarketRegion, MAX_IMAGES } from '@/lib/market/specs';
import {
  BOOK_DAYS_AHEAD,
  SLOT_MINS,
  VENUE_ADDRESS_MAX,
  VENUE_INTRO_MAX,
  VENUE_NAME_MAX,
  isVenueKind,
  parseHours,
  readHours,
  slotValid,
  upcomingDays,
  weekdayOf,
} from '@/lib/market/venues';

/**
 * 덕아웃 장소 예약(3판, 2026-10-21) — 사장님(마스터 계정): 장소 등록 · 고치기 · 승인 · 거절(requireMaster). 선수: 예약 · 취소(requireUser).
 * 승인형 장소는 사장님이 확정해야 잡히고, 즉시형은 요청하자마자 확정. 같은 칸에 둘은 못 잡는다(요청 · 확정 모두 taken).
 */

export type VenueState = { error?: string; success?: string } | undefined;

function readVenue(formData: FormData, userId: string) {
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2 || name.length > VENUE_NAME_MAX)
    return { error: `이름을 2~${VENUE_NAME_MAX}자로 적어 주세요.` };
  const kind = String(formData.get('kind') ?? '');
  if (!isVenueKind(kind)) return { error: '종류를 골라 주세요.' };
  const region = String(formData.get('region') ?? '');
  if (!isMarketRegion(region) || region === '전국(택배)')
    return { error: '지역을 골라 주세요.' };
  const address =
    String(formData.get('address') ?? '')
      .trim()
      .slice(0, VENUE_ADDRESS_MAX) || null;
  const intro =
    String(formData.get('intro') ?? '')
      .trim()
      .slice(0, VENUE_INTRO_MAX) || null;
  const slotMin = Number.parseInt(String(formData.get('slotMin') ?? '60'), 10);
  if (!(SLOT_MINS as readonly number[]).includes(slotMin))
    return { error: '칸 길이를 골라 주세요.' };
  const rawPrice = String(formData.get('pricePerSlot') ?? '').replace(/[^\d]/g, '');
  const pricePerSlot = rawPrice ? Number.parseInt(rawPrice, 10) : null;
  const priceNote =
    String(formData.get('priceNote') ?? '')
      .trim()
      .slice(0, 80) || null;
  const hours = readHours((n) => formData.get(n));
  if ('error' in hours) return { error: hours.error };
  const approval = formData.get('approval') !== 'off';
  const publicProfile = formData.get('publicProfile') === 'on';
  const images = formData
    .getAll('images')
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, MAX_IMAGES);
  if (images.some((p) => !isOwnedBy(p, userId)))
    return { error: '사진 경로가 올바르지 않아요.' };
  return {
    data: {
      name,
      kind,
      region,
      address,
      intro,
      slotMin,
      pricePerSlot,
      priceNote,
      hours: hours.hours,
      approval,
      publicProfile,
      images,
    },
  };
}

export async function saveVenue(
  _prev: VenueState,
  formData: FormData
): Promise<VenueState> {
  const user = await requireMaster();
  const id = String(formData.get('id') ?? '').trim();
  const read = readVenue(formData, user.id);
  if ('error' in read) return { error: read.error };
  if (id) {
    const found = await prisma.venue.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!found || (found.ownerId !== user.id && user.role !== 'ADMIN'))
      return { error: '내 장소가 아니에요.' };
    await prisma.venue.update({ where: { id }, data: read.data });
  } else {
    const created = await prisma.venue.create({
      data: { ...read.data, ownerId: user.id },
      select: { id: true },
    });
    revalidatePath('/manage/venues');
    revalidatePath('/venues', 'layout');
    redirect(`/manage/venues/${created.id}`);
  }
  revalidatePath('/manage/venues', 'layout');
  revalidatePath('/venues', 'layout');
  return { success: '저장했어요.' };
}

export async function deleteVenue(formData: FormData) {
  const user = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const found = await prisma.venue.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!found || (found.ownerId !== user.id && user.role !== 'ADMIN')) return;
  await prisma.venue.update({
    where: { id },
    data: { hiddenAt: new Date(), publicProfile: false },
  });
  revalidatePath('/manage/venues', 'layout');
  revalidatePath('/venues', 'layout');
  redirect('/manage/venues');
}

/** 사장님 — 승인 · 거절 */
export async function answerVenueBooking(formData: FormData) {
  const user = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const ok = formData.get('ok') === '1';
  const reply =
    String(formData.get('reply') ?? '')
      .trim()
      .slice(0, 300) || null;
  const b = await prisma.venueBooking.findUnique({
    where: { id },
    select: { status: true, venue: { select: { ownerId: true, id: true } } },
  });
  if (
    !b ||
    b.status !== 'REQUESTED' ||
    (b.venue.ownerId !== user.id && user.role !== 'ADMIN')
  )
    return;
  await prisma.venueBooking.update({
    where: { id },
    data: { status: ok ? 'CONFIRMED' : 'DECLINED', reply },
  });
  revalidatePath('/manage/venues', 'layout');
  revalidatePath(`/venues/${b.venue.id}`);
  revalidatePath('/me');
}

/* ── 선수 ── */

export async function bookVenue(
  _prev: VenueState,
  formData: FormData
): Promise<VenueState> {
  const user = await requireUser();
  const venueId = String(formData.get('venueId') ?? '');
  const dateKey = String(formData.get('date') ?? '');
  const startMin = Number.parseInt(String(formData.get('startMin') ?? ''), 10);
  const note =
    String(formData.get('note') ?? '')
      .trim()
      .slice(0, 300) || null;
  const v = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      ownerId: true,
      hours: true,
      slotMin: true,
      approval: true,
      publicProfile: true,
      hiddenAt: true,
    },
  });
  if (!v || v.hiddenAt || !v.publicProfile)
    return { error: '예약을 받는 장소가 아니에요.' };
  if (v.ownerId === user.id) return { error: '내 장소는 여기서 예약하지 않아요.' };
  const todayKey = toDateKey(appNow());
  if (!isDateKey(dateKey) || !upcomingDays(todayKey, BOOK_DAYS_AHEAD).includes(dateKey))
    return { error: `오늘부터 ${BOOK_DAYS_AHEAD}일 안의 날짜만 잡을 수 있어요.` };
  const endMin = startMin + v.slotMin;
  if (
    !Number.isInteger(startMin) ||
    !slotValid(parseHours(v.hours), weekdayOf(dateKey), v.slotMin, startMin, endMin)
  )
    return { error: '영업시간 안의 칸을 골라 주세요.' };
  const taken = await prisma.venueBooking.findFirst({
    where: {
      venueId,
      date: dbDate(dateKey),
      status: { in: ['REQUESTED', 'CONFIRMED'] },
      startMin: { lt: endMin },
      endMin: { gt: startMin },
    },
    select: { id: true },
  });
  if (taken) return { error: '방금 다른 사람이 잡았어요. 다른 칸을 골라 주세요.' };
  await prisma.venueBooking.create({
    data: {
      venueId,
      userId: user.id,
      date: dbDate(dateKey),
      startMin,
      endMin,
      note,
      status: v.approval ? 'REQUESTED' : 'CONFIRMED',
    },
  });
  revalidatePath(`/venues/${venueId}`);
  revalidatePath('/me');
  revalidatePath('/manage/venues', 'layout');
  return {
    success: v.approval ? '요청했어요. 사장님이 승인하면 확정돼요.' : '예약됐어요.',
  };
}

export async function cancelVenueBooking(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const b = await prisma.venueBooking.findUnique({
    where: { id },
    select: { userId: true, status: true, venueId: true },
  });
  if (!b || b.userId !== user.id || !['REQUESTED', 'CONFIRMED'].includes(b.status))
    return;
  await prisma.venueBooking.update({ where: { id }, data: { status: 'CANCELED' } });
  revalidatePath('/me');
  revalidatePath(`/venues/${b.venueId}`);
  revalidatePath('/manage/venues', 'layout');
}
