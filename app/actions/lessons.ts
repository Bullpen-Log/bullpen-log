'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notify';
import { geocode } from '@/lib/geocode';
import { requireAdmin, requireMaster, requireUser } from '@/lib/dal';
import { requireOrg } from '@/lib/org/access';
import { dbDate } from '@/lib/nutrition/days';
import {
  BOOKING_NOTE_MAX,
  CAREER_MAX,
  HOURS_MAX,
  INTRO_MAX,
  PRICE_NOTE_MAX,
  REVIEW_MAX,
  canConfirm,
  canReview,
  isRating,
  parseSlot,
  readSpecialties,
  slotParts,
  formatSlot,
  isAudience,
  isPayMethod,
  isSpecialty,
  readReviewTags,
  SLOT_MIN_DEFAULT,
} from '@/lib/market/lessons';
import { parseHours, readHours, slotValid, weekdayOf } from '@/lib/market/venues';
import { ORG_NAME_MAX, ORG_REGION_MAX, passUsable } from '@/lib/org/rules';

/**
 * 덕아웃 레슨 예약(2판, 2026-10-21) — 선수: 요청 · 취소 · 후기(requireUser). 코치: 프로필 공개 · 확정 · 거절 · 끝남(requireMaster → requireOrg).
 * 확정되면 선수는 그 레슨장의 회원이 되고(ShareConsent 는 기본값 — 선수가 /join 에서 바꾼다) 시간표(OrgEvent lesson)에 들어간다.
 */

export type LessonState = { error?: string; success?: string; bookingId?: string } | undefined;

/* ── 코치 ── */

export async function updateCoachProfile(
  _prev: LessonState,
  formData: FormData
): Promise<LessonState> {
  const user = await requireMaster();
  const org = await requireOrg(user, String(formData.get('orgId') ?? ''));
  if (org.kind !== 'LESSON') return { error: '레슨장만 코치 프로필을 열 수 있어요.' };
  if (user.role !== 'ADMIN' && org.ownerId !== user.id)
    return { error: '프로필은 레슨장을 만든 사람만 고쳐요.' };
  const publicProfile = formData.get('publicProfile') === 'on';
  const coachIntro =
    String(formData.get('coachIntro') ?? '')
      .trim()
      .slice(0, INTRO_MAX) || null;
  const coachCareer =
    String(formData.get('coachCareer') ?? '')
      .trim()
      .slice(0, CAREER_MAX) || null;
  const specialties = readSpecialties((n) => formData.get(n));
  const rawPrice = String(formData.get('priceFrom') ?? '').replace(/[^\d]/g, '');
  const priceFrom = rawPrice ? Number.parseInt(rawPrice, 10) : null;
  if (priceFrom != null && (priceFrom < 0 || priceFrom > 5_000_000))
    return { error: '가격을 다시 봐 주세요.' };
  const priceNote =
    String(formData.get('priceNote') ?? '')
      .trim()
      .slice(0, PRICE_NOTE_MAX) || null;
  const lessonHours =
    String(formData.get('lessonHours') ?? '')
      .trim()
      .slice(0, HOURS_MAX) || null;
  if (publicProfile && !coachIntro)
    return { error: '공개하려면 소개를 한 줄이라도 적어 주세요.' };
  /* 3판(2026-10-22) — 코치 이름 · 요일별 레슨 시간 · 레슨 길이 · 체험가 · 싱커 기록 봐 줌. 요일 시간은 하나도 안 적으면 비움(예약 화면이 09~21시로 연다) */
  const coachName =
    String(formData.get('coachName') ?? '')
      .trim()
      .slice(0, 30) || null;
  const rawTrial = String(formData.get('trialPrice') ?? '').replace(/[^\d]/g, '');
  const trialPrice = rawTrial ? Number.parseInt(rawTrial, 10) : null;
  if (trialPrice != null && (trialPrice < 0 || trialPrice > 5_000_000))
    return { error: '체험가를 다시 봐 주세요.' };
  const slotMinRaw = Number.parseInt(String(formData.get('slotMin') ?? ''), 10);
  const slotMin = [30, 60, 90, 120].includes(slotMinRaw) ? slotMinRaw : SLOT_MIN_DEFAULT;
  const sinkerReview = formData.get('sinkerReview') === 'on';
  let lessonSlots: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  if (formData.get('slotsOn') === 'on') {
    const read = readHours((n) => formData.get(n));
    if ('error' in read) return { error: read.error };
    lessonSlots = read.hours as Prisma.InputJsonValue;
  }
  /* 관리자는 레슨장 이름 · 지역도 여기서 고친다(관리자 코치 관리 화면) */
  const adminFields =
    user.role === 'ADMIN' && formData.get('adminEdit') === 'on'
      ? {
          name:
            String(formData.get('name') ?? '')
              .trim()
              .slice(0, ORG_NAME_MAX) || org.name,
          region:
            String(formData.get('region') ?? '')
              .trim()
              .slice(0, ORG_REGION_MAX) || null,
        }
      : {};
  /* 레슨장 주소 → 덕아웃 지도 자리(2026-10-24). 칸이 폼에 있을 때만 손댄다(옛 화면이 지우지 않게) */
  let place = {};
  if (formData.has('address')) {
    const address =
      String(formData.get('address') ?? '')
        .trim()
        .slice(0, 120) || null;
    const c = await geocode(address, coachName ?? org.name);
    place = { address, lat: c?.lat ?? null, lng: c?.lng ?? null };
  }
  await prisma.org.update({
    where: { id: org.id },
    data: {
      ...place,
      publicProfile,
      coachIntro,
      coachCareer,
      specialties,
      priceFrom,
      priceNote,
      lessonHours,
      coachName,
      trialPrice,
      slotMin,
      sinkerReview,
      lessonSlots,
      ...adminFields,
    },
  });
  revalidatePath('/manage/settings');
  revalidatePath('/lessons', 'layout');
  revalidatePath('/admin/coaches', 'layout');
  return { success: publicProfile ? '덕아웃에 공개했어요.' : '저장했어요(비공개).' };
}

/** 관리자 — 공개 켜고 끄기 한 번에(관리자 코치 관리 화면의 스위치) */
export async function adminSetCoachPublic(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('orgId') ?? '');
  const on = formData.get('publicProfile') === 'on';
  const org = await prisma.org.findUnique({ where: { id }, select: { kind: true, coachIntro: true } });
  if (!org || org.kind !== 'LESSON') return;
  await prisma.org.update({
    where: { id },
    data: { publicProfile: on, coachIntro: on && !org.coachIntro ? '소개를 준비 중이에요.' : undefined },
  });
  revalidatePath('/admin/coaches', 'layout');
  revalidatePath('/lessons', 'layout');
}

/** 코치가 요청 하나를 확정(which 1 · 2) — 회원 줄 · 시간표 줄을 만든다 */
export async function confirmBooking(formData: FormData) {
  const user = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const which = formData.get('which') === '2' ? 2 : 1;
  const reply =
    String(formData.get('reply') ?? '')
      .trim()
      .slice(0, BOOKING_NOTE_MAX) || null;
  const b = await prisma.lessonBooking.findUnique({
    where: { id },
    select: {
      id: true,
      orgId: true,
      userId: true,
      status: true,
      slot1: true,
      slot2: true,
      user: { select: { nickname: true } },
    },
  });
  if (!b) return;
  const org = await requireOrg(user, b.orgId);
  if (!canConfirm(b, which, new Date())) return;
  const chosen = which === 2 ? b.slot2! : b.slot1;
  const { dateKey, time } = slotParts(chosen);
  const consentPending = await prisma.$transaction(async (tx) => {
    const existing = await tx.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: b.userId } },
      select: { id: true, status: true, consent: { select: { memberId: true } } },
    });
    let memberId: string;
    if (existing) {
      memberId = existing.id;
      if (existing.status !== 'ACTIVE')
        await tx.orgMember.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', leftAt: null },
        });
    } else {
      const m = await tx.orgMember.create({
        data: {
          orgId: org.id,
          userId: b.userId,
          role: 'PLAYER',
          status: 'ACTIVE',
          nickname: b.user.nickname,
        },
        select: { id: true },
      });
      memberId = m.id;
      /* 공유 동의는 만들지 않는다 — 예약 확정은 회원 연결만, 무엇을 보여 줄지는 선수가 싱커에서 고른다(2026-10-25 0단계 계약 2-1).
         동의 줄이 없는 계정 회원은 아무것도 안 보인다(lib/org/access.ts memberScope) */
    }
    const ev = await tx.orgEvent.create({
      data: {
        orgId: org.id,
        date: dbDate(dateKey),
        time,
        kind: 'lesson',
        title: `${b.user.nickname} 레슨(덕아웃 예약)`,
        memberId,
        createdById: user.id,
      },
      select: { id: true },
    });
    await tx.lessonBooking.update({
      where: { id },
      data: { status: 'CONFIRMED', chosen, reply, memberId, eventId: ev.id, confirmedAt: new Date() },
    });
    return !existing?.consent;
  });
  await notify(b.userId, {
    kind: 'booking',
    title: '레슨 예약이 확정됐어요',
    body: formatSlot(chosen),
    link: '/me',
  });
  if (consentPending)
    await notify(b.userId, {
      kind: 'lesson',
      title: `${org.name}에 연결됐어요`,
      body: '코치에게 보여 줄 기록을 싱커에서 골라 주세요.',
      link: '/join',
    });
  revalidatePath('/manage', 'layout');
  revalidatePath('/', 'layout');
}

export async function declineBooking(formData: FormData) {
  const user = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const reply =
    String(formData.get('reply') ?? '')
      .trim()
      .slice(0, BOOKING_NOTE_MAX) || null;
  const b = await prisma.lessonBooking.findUnique({
    where: { id },
    select: { orgId: true, status: true, userId: true },
  });
  if (!b || b.status !== 'REQUESTED') return;
  await requireOrg(user, b.orgId);
  await prisma.lessonBooking.update({
    where: { id },
    data: { status: 'DECLINED', reply },
  });
  await notify(b.userId, {
    kind: 'booking',
    title: '레슨 요청을 받지 못했어요',
    body: '다른 시간으로 다시 요청해 보세요.',
    link: '/me',
  });
  revalidatePath('/manage', 'layout');
  revalidatePath('/', 'layout');
}

/**
 * 레슨을 했다 — 끝남으로. 후기를 쓸 수 있게 된다. 수강권은 여기서 한 회 준다 — 쓸 수 있는 것 가운데 기한이 가까운 것부터.
 * 수강권 차감은 덕아웃 운영의 일이라 싱커의 레슨 노트 저장에서 옮겨 왔다(2026-10-25 0단계 계약 2-1).
 */
export async function finishBooking(formData: FormData) {
  const user = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const b = await prisma.lessonBooking.findUnique({
    where: { id },
    select: { orgId: true, status: true, memberId: true, chosen: true, slot1: true },
  });
  if (!b || b.status !== 'CONFIRMED') return;
  await requireOrg(user, b.orgId);
  const lessonDay = slotParts(b.chosen ?? b.slot1).dateKey;
  await prisma.$transaction(async (tx) => {
    await tx.lessonBooking.update({ where: { id }, data: { status: 'DONE' } });
    if (!b.memberId) return;
    const passes = await tx.lessonPass.findMany({
      where: { memberId: b.memberId },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, total: true, used: true, expiresAt: true },
    });
    const pick = passes.find((p) => passUsable(p, lessonDay));
    if (pick)
      await tx.lessonPass.update({ where: { id: pick.id }, data: { used: { increment: 1 } } });
  });
  revalidatePath('/manage', 'layout');
  revalidatePath('/', 'layout');
}

/* ── 선수 ── */

export async function requestBooking(
  _prev: LessonState,
  formData: FormData
): Promise<LessonState> {
  const user = await requireUser();
  const orgId = String(formData.get('orgId') ?? '');
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { id: true, kind: true, publicProfile: true, ownerId: true, dummy: true },
  });
  if (!org || org.kind !== 'LESSON' || !org.publicProfile)
    return { error: '예약을 받는 레슨장이 아니에요.' };
  /* 더미 코치(관리자가 넣음)는 주인인 관리자도 예약해 본다 */
  if (org.ownerId === user.id && !org.dummy) return { error: '내 레슨장에는 예약할 수 없어요.' };
  const now = new Date();
  const slot1 = parseSlot(formData.get('slot1'), now);
  if (!slot1)
    return { error: '첫째 희망 시간을 2시간 뒤부터 60일 안으로 골라 주세요.' };
  const raw2 = String(formData.get('slot2') ?? '').trim();
  const slot2 = raw2 ? parseSlot(raw2, now) : null;
  if (raw2 && !slot2) return { error: '둘째 희망 시간을 다시 골라 주세요.' };
  const note =
    String(formData.get('note') ?? '')
      .trim()
      .slice(0, BOOKING_NOTE_MAX) || null;
  /* 3판 — 무엇을 · 누가 받나 · 결제 수단(저장만). 코치가 요일별 레슨 시간을 적었으면 그 칸에 맞아야 한다 */
  const specialtyRaw = String(formData.get('specialty') ?? '');
  const specialty = isSpecialty(specialtyRaw) ? specialtyRaw : null;
  const audienceRaw = String(formData.get('audience') ?? '');
  const audience = isAudience(audienceRaw) ? audienceRaw : null;
  const payRaw = String(formData.get('payMethod') ?? '');
  const payMethod = isPayMethod(payRaw) ? payRaw : null;
  const coach = await prisma.org.findUnique({
    where: { id: orgId },
    select: { lessonSlots: true, slotMin: true },
  });
  if (coach?.lessonSlots) {
    const hours = parseHours(coach.lessonSlots);
    const fits = (d: Date) => {
      if (Object.values(hours).every((h) => h == null)) return true;
      const kst = new Date(d.getTime() + 9 * 3_600_000);
      const key = kst.toISOString().slice(0, 10);
      const start = kst.getUTCHours() * 60 + kst.getUTCMinutes();
      return slotValid(hours, weekdayOf(key), coach.slotMin || SLOT_MIN_DEFAULT, start, start + (coach.slotMin || SLOT_MIN_DEFAULT));
    };
    if (!fits(slot1) || (slot2 && !fits(slot2)))
      return { error: '코치의 레슨 시간 안의 칸을 골라 주세요.' };
  }
  const live = await prisma.lessonBooking.findFirst({
    where: { orgId, userId: user.id, status: 'REQUESTED' },
    select: { id: true },
  });
  if (live) return { error: '이미 보낸 요청이 있어요. 답을 기다려 주세요.' };
  await notify(org.ownerId, {
    kind: 'booking',
    title: `${user.nickname} 님이 레슨을 요청했어요`,
    body: formatSlot(slot1),
    link: '/manage/bookings',
  });
  const created = await prisma.lessonBooking.create({
    data: { orgId, userId: user.id, slot1, slot2, note, specialty, audience, payMethod },
    select: { id: true },
  });
  revalidatePath(`/lessons/${orgId}`);
  revalidatePath('/me');
  revalidatePath('/manage', 'layout');
  return { success: '요청을 보냈어요. 코치가 확정하면 알려 드려요.', bookingId: created.id };
}

export async function cancelBooking(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const b = await prisma.lessonBooking.findUnique({
    where: { id },
    select: { userId: true, status: true, orgId: true, eventId: true },
  });
  if (!b || b.userId !== user.id || !['REQUESTED', 'CONFIRMED'].includes(b.status))
    return;
  await prisma.$transaction(async (tx) => {
    await tx.lessonBooking.update({ where: { id }, data: { status: 'CANCELED' } });
    if (b.eventId) await tx.orgEvent.deleteMany({ where: { id: b.eventId } });
  });
  revalidatePath('/me');
  revalidatePath(`/lessons/${b.orgId}`);
  revalidatePath('/manage', 'layout');
}

export async function writeReview(
  _prev: LessonState,
  formData: FormData
): Promise<LessonState> {
  const user = await requireUser();
  const bookingId = String(formData.get('bookingId') ?? '');
  const rating = Number.parseInt(String(formData.get('rating') ?? ''), 10);
  const body = String(formData.get('body') ?? '')
    .trim()
    .slice(0, REVIEW_MAX);
  if (!isRating(rating)) return { error: '별점을 골라 주세요.' };
  if (body.length < 5) return { error: '후기를 5자 이상 적어 주세요.' };
  const b = await prisma.lessonBooking.findUnique({
    where: { id: bookingId },
    select: {
      userId: true,
      orgId: true,
      status: true,
      review: { select: { id: true } },
    },
  });
  if (!b || b.userId !== user.id) return { error: '내 예약이 아니에요.' };
  if (!canReview({ status: b.status, hasReview: b.review != null }))
    return { error: '끝난 레슨에만 후기를 쓸 수 있어요.' };
  const tags = readReviewTags((n) => formData.get(n));
  await prisma.lessonReview.create({
    data: { orgId: b.orgId, userId: user.id, bookingId, rating, body, tags },
  });
  revalidatePath(`/lessons/${b.orgId}`);
  revalidatePath('/me');
  return { success: '후기를 남겼어요. 고마워요.' };
}
