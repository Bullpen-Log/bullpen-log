import { notFound, redirect } from 'next/navigation';
import { PayShell } from '@/components/dugout/pay-shell';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { minToTime } from '@/lib/market/venues';
import { VENUE_FEE_RATE, platformFee } from '@/lib/market/pay';

/** 장소 선결제(4판 껍데기) — 확정된 예약 한 칸 값 */
export default async function PayVenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/dugout/pay/venue/${id}`);
  const b = await prisma.venueBooking.findUnique({
    where: { id },
    select: {
      userId: true,
      status: true,
      date: true,
      startMin: true,
      endMin: true,
      venue: { select: { name: true, pricePerSlot: true, priceNote: true } },
    },
  });
  if (!b || b.userId !== user.id || b.status !== 'CONFIRMED') notFound();
  const price = b.venue.pricePerSlot ?? 0;
  const key = b.date.toISOString().slice(0, 10);
  return (
    <PayShell
      title="장소 선결제"
      subtitle={`${b.venue.name} · ${Number(key.slice(5, 7))}/${Number(key.slice(8))} ${minToTime(b.startMin)}~${minToTime(b.endMin)}`}
      lines={[
        { label: price ? '이용료' : '이용료(가격 미정 — 현장 결제)', amount: price },
        {
          label: `플랫폼 수수료(${Math.round(VENUE_FEE_RATE * 100)}%) — 장소 부담`,
          amount: 0,
        },
      ]}
      note={`선결제하면 노쇼 없이 자리가 확정돼요. 수수료 ${platformFee(price, VENUE_FEE_RATE).toLocaleString('ko-KR')}원은 장소 정산에서 빠져요.${b.venue.priceNote ? ` 장소 메모: ${b.venue.priceNote}` : ''}`}
    />
  );
}
