import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, PageHeading } from '@/components/ui';
import { BackLink } from '@/components/back-link';
import { CoachProfileForm } from '@/components/master/coach-profile-form';
import { requireAdmin } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { parseHours } from '@/lib/market/venues';

export const metadata: Metadata = { title: '코치 편집' };

/** 관리자가 코치 하나를 편집 — 코치 자신의 설정 폼(components/master/coach-profile-form.tsx)에 이름 · 지역 칸을 더한 것. 저장은 updateCoachProfile(관리자는 모든 조직) */
export default async function AdminCoachEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const o = await prisma.org.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      name: true,
      region: true,
      dummy: true,
      publicProfile: true,
      coachIntro: true,
      coachCareer: true,
      coachName: true,
      specialties: true,
      priceFrom: true,
      priceNote: true,
      lessonHours: true,
      trialPrice: true,
      slotMin: true,
      sinkerReview: true,
      lessonSlots: true,
      owner: { select: { nickname: true, email: true } },
      _count: { select: { bookings: true, reviews: true } },
    },
  });
  if (!o || o.kind !== 'LESSON') notFound();
  return (
    <div className="stack-page">
      <BackLink href="/admin/coaches">코치 관리</BackLink>
      <PageHeading
        title={`${o.coachName?.trim() || o.owner.nickname} 코치`}
        description={`${o.name} · 주인 ${o.owner.nickname} (${o.owner.email}) · 예약 ${o._count.bookings} · 후기 ${o._count.reviews}`}
        action={
          <Link href={`/lessons/${o.id}`} className="text-sm font-semibold text-sky">
            덕아웃에서 보기 ›
          </Link>
        }
      />
      {o.dummy && (
        <p>
          <Badge className="text-warn">더미 코치</Badge>
        </p>
      )}
      <Card>
        <CoachProfileForm
          admin
          canEdit
          profile={{
            orgId: o.id,
            name: o.name,
            region: o.region,
            publicProfile: o.publicProfile,
            coachIntro: o.coachIntro,
            coachCareer: o.coachCareer,
            coachName: o.coachName,
            specialties: o.specialties,
            priceFrom: o.priceFrom,
            priceNote: o.priceNote,
            lessonHours: o.lessonHours,
            trialPrice: o.trialPrice,
            slotMin: o.slotMin,
            sinkerReview: o.sinkerReview,
            lessonSlots: o.lessonSlots ? parseHours(o.lessonSlots) : null,
          }}
        />
      </Card>
    </div>
  );
}
