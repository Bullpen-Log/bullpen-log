'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/dal';
import { geocode } from '@/lib/geocode';
import { DUMMY_BOOKING_NOTE, DUMMY_MAX_AT_ONCE, makeDummyCoach } from '@/lib/market/lesson-dummy';

/**
 * 관리자 코치 관리(2026-10-22) — 더미 코치 넣기 · 지우기. 편집 · 공개 스위치는 app/actions/lessons.ts(updateCoachProfile · adminSetCoachPublic)를 그대로 쓴다.
 * 더미 코치는 관리자 계정이 주인인 Org(kind LESSON · dummy true)이고, 끝난 예약 + 후기(관리자 계정 이름으로)를 같이 만들어 별점 · 확정 속도가 보이게 한다.
 */
function revalidate() {
  revalidatePath('/admin/coaches', 'layout');
  revalidatePath('/lessons', 'layout');
}

export async function createDummyCoaches(formData: FormData) {
  const admin = await requireAdmin();
  const n = Math.min(DUMMY_MAX_AT_ONCE, Math.max(1, Number.parseInt(String(formData.get('count') ?? '3'), 10) || 3));
  const base = Date.now();
  const existing = await prisma.org.count({ where: { dummy: true } });
  for (let i = 0; i < n; i++) {
    const d = makeDummyCoach(existing + i + 1 + (base % 1000));
    // 지도에도 뜨게 — 주소가 없으니 지역(시 · 구) 가운데에서 1km 안쪽으로 조금씩 흩는다(같은 구의 더미가 한 점에 겹치지 않게)
    const at = await geocode(d.region);
    const coords = at ? { lat: at.lat + (Math.random() - 0.5) * 0.018, lng: at.lng + (Math.random() - 0.5) * 0.022 } : {};
    await prisma.$transaction(async (tx) => {
      const org = await tx.org.create({
        data: {
          kind: 'LESSON',
          name: d.name,
          region: d.region,
          ...coords,
          note: '더미 코치(관리자가 넣음)',
          ownerId: admin.id,
          publicProfile: true,
          coachIntro: d.intro,
          coachCareer: d.career,
          coachName: d.coachName,
          specialties: d.specialties,
          priceFrom: d.priceFrom,
          trialPrice: d.trialPrice,
          priceNote: d.priceNote,
          slotMin: d.slotMin,
          sinkerReview: d.sinkerReview,
          lessonSlots: d.slots as Prisma.InputJsonValue,
          dummy: true,
        },
        select: { id: true },
      });
      for (const r of d.reviews) {
        const createdAt = new Date(base - r.daysAgo * 86_400_000);
        const confirmedAt = new Date(createdAt.getTime() + r.confirmHours * 3_600_000);
        const slot = new Date(createdAt.getTime() + 3 * 86_400_000);
        const b = await tx.lessonBooking.create({
          data: {
            orgId: org.id,
            userId: admin.id,
            status: 'DONE',
            slot1: slot,
            chosen: slot,
            createdAt,
            confirmedAt,
            note: DUMMY_BOOKING_NOTE,
          },
          select: { id: true },
        });
        await tx.lessonReview.create({
          data: {
            orgId: org.id,
            userId: admin.id,
            bookingId: b.id,
            rating: r.rating,
            body: r.body,
            tags: r.tags,
            createdAt: new Date(slot.getTime() + 86_400_000),
          },
        });
      }
    });
  }
  revalidate();
}

/** 더미 코치 하나 지우기 — 진짜 레슨장은 여기서 못 지운다 */
export async function deleteDummyCoach(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('orgId') ?? '');
  await prisma.org.deleteMany({ where: { id, dummy: true } });
  revalidate();
}

/** 더미 코치 전부 지우기 */
export async function deleteAllDummyCoaches() {
  await requireAdmin();
  await prisma.org.deleteMany({ where: { dummy: true } });
  revalidate();
}
