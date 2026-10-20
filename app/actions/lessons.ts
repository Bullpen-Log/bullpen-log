'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMaster, requireUser } from '@/lib/dal';
import { requireOrg } from '@/lib/org/access';
import { consentDefaults } from '@/lib/org/rules';
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
} from '@/lib/market/lessons';

/**
 * 덕아웃 레슨 예약(2판, 2026-10-21) — 선수: 요청 · 취소 · 후기(requireUser). 코치: 프로필 공개 · 확정 · 거절 · 끝남(requireMaster → requireOrg).
 * 확정되면 선수는 그 레슨장의 회원이 되고(ShareConsent 는 기본값 — 선수가 /join 에서 바꾼다) 시간표(OrgEvent lesson)에 들어간다.
 */

export type LessonState = { error?: string; success?: string } | undefined;

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
  await prisma.org.update({
    where: { id: org.id },
    data: {
      publicProfile,
      coachIntro,
      coachCareer,
      specialties,
      priceFrom,
      priceNote,
      lessonHours,
    },
  });
  revalidatePath('/master/settings');
  revalidatePath('/dugout/lessons', 'layout');
  return { success: publicProfile ? '덕아웃에 공개했어요.' : '저장했어요(비공개).' };
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
  await prisma.$transaction(async (tx) => {
    const existing = await tx.orgMember.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: b.userId } },
      select: { id: true, status: true },
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
      await tx.shareConsent.create({
        data: { memberId, ...consentDefaults(), byUserId: b.userId },
      });
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
      data: { status: 'CONFIRMED', chosen, reply, memberId, eventId: ev.id },
    });
  });
  revalidatePath('/master', 'layout');
  revalidatePath('/dugout', 'layout');
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
    select: { orgId: true, status: true },
  });
  if (!b || b.status !== 'REQUESTED') return;
  await requireOrg(user, b.orgId);
  await prisma.lessonBooking.update({
    where: { id },
    data: { status: 'DECLINED', reply },
  });
  revalidatePath('/master', 'layout');
  revalidatePath('/dugout', 'layout');
}

/** 레슨을 했다 — 끝남으로. 후기를 쓸 수 있게 된다 */
export async function finishBooking(formData: FormData) {
  const user = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const b = await prisma.lessonBooking.findUnique({
    where: { id },
    select: { orgId: true, status: true },
  });
  if (!b || b.status !== 'CONFIRMED') return;
  await requireOrg(user, b.orgId);
  await prisma.lessonBooking.update({ where: { id }, data: { status: 'DONE' } });
  revalidatePath('/master', 'layout');
  revalidatePath('/dugout', 'layout');
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
    select: { id: true, kind: true, publicProfile: true, ownerId: true },
  });
  if (!org || org.kind !== 'LESSON' || !org.publicProfile)
    return { error: '예약을 받는 레슨장이 아니에요.' };
  if (org.ownerId === user.id) return { error: '내 레슨장에는 예약할 수 없어요.' };
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
  const live = await prisma.lessonBooking.findFirst({
    where: { orgId, userId: user.id, status: 'REQUESTED' },
    select: { id: true },
  });
  if (live) return { error: '이미 보낸 요청이 있어요. 답을 기다려 주세요.' };
  await prisma.lessonBooking.create({
    data: { orgId, userId: user.id, slot1, slot2, note },
  });
  revalidatePath(`/dugout/lessons/${orgId}`);
  revalidatePath('/dugout/me');
  revalidatePath('/master', 'layout');
  return { success: '요청을 보냈어요. 코치가 확정하면 알려 드려요.' };
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
  revalidatePath('/dugout/me');
  revalidatePath(`/dugout/lessons/${b.orgId}`);
  revalidatePath('/master', 'layout');
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
  await prisma.lessonReview.create({
    data: { orgId: b.orgId, userId: user.id, bookingId, rating, body },
  });
  revalidatePath(`/dugout/lessons/${b.orgId}`);
  revalidatePath('/dugout/me');
  return { success: '후기를 남겼어요. 고마워요.' };
}
