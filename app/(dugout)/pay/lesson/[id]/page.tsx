import { notFound, redirect } from 'next/navigation';
import { PayShell } from '@/components/dugout/pay-shell';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { formatSlot } from '@/lib/market/lessons';
import { LESSON_FEE_RATE, platformFee } from '@/lib/market/pay';

/** 레슨비 결제(4판 껍데기) — 확정된 예약의 1회 가격. 코치가 가격을 안 적었으면 ‘현장 결제’ */
export default async function PayLessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/pay/lesson/${id}`);
  const b = await prisma.lessonBooking.findUnique({
    where: { id },
    select: {
      userId: true,
      status: true,
      chosen: true,
      org: { select: { name: true, priceFrom: true, priceNote: true } },
    },
  });
  if (!b || b.userId !== user.id || b.status !== 'CONFIRMED') notFound();
  const price = b.org.priceFrom ?? 0;
  return (
    <PayShell
      title="레슨비 결제"
      subtitle={`${b.org.name} · ${b.chosen ? formatSlot(b.chosen) : ''}`}
      lines={[
        {
          label: price ? '레슨 1회' : '레슨 1회(가격 미정 — 현장 결제)',
          amount: price,
        },
        {
          label: `플랫폼 수수료(${Math.round(LESSON_FEE_RATE * 100)}%) — 코치 부담`,
          amount: 0,
        },
      ]}
      note={`코치가 받는 금액에서 ${Math.round(LESSON_FEE_RATE * 100)}%를 덕아웃이 받아요(선수는 더 내지 않아요). ${b.org.priceNote ? `코치 메모: ${b.org.priceNote}. ` : ''}수수료 ${platformFee(price, LESSON_FEE_RATE).toLocaleString('ko-KR')}원은 코치 정산에서 빠져요.`}
    />
  );
}
