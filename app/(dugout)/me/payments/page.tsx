import Link from 'next/link';
import { DugoutPageHeader, SectionHead } from '@/components/dugout/ui';
import { redirect } from 'next/navigation';
import { RoundLock } from '@/components/round-icon';
import { Card } from '@/components/ui';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { formatPrice } from '@/lib/market/specs';
import { formatSlot } from '@/lib/market/lessons';

/** 결제 내역 · 결제 수단(4판 껍데기) — 결제가 열리기 전이라 내역은 ‘결제 예정’으로 확정 예약만, 수단 등록은 잠김 */
export default async function PaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/me/payments');
  const [lessons, venues] = await Promise.all([
    prisma.lessonBooking.findMany({
      where: { userId: user.id, status: 'CONFIRMED' },
      orderBy: { chosen: 'desc' },
      take: 20,
      select: {
        id: true,
        chosen: true,
        org: { select: { name: true, priceFrom: true } },
      },
    }),
    prisma.venueBooking.findMany({
      where: { userId: user.id, status: 'CONFIRMED' },
      orderBy: { date: 'desc' },
      take: 20,
      select: {
        id: true,
        date: true,
        venue: { select: { name: true, pricePerSlot: true } },
      },
    }),
  ]);
  const rows = [
    ...lessons.map((b) => ({
      id: b.id,
      href: `/pay/lesson/${b.id}`,
      kind: '레슨',
      name: b.org.name,
      when: b.chosen ? formatSlot(b.chosen) : '',
      amount: b.org.priceFrom ?? 0,
    })),
    ...venues.map((b) => ({
      id: b.id,
      href: `/pay/venue/${b.id}`,
      kind: '장소',
      name: b.venue.name,
      when: `${Number(b.date.toISOString().slice(5, 7))}/${Number(b.date.toISOString().slice(8, 10))}`,
      amount: b.venue.pricePerSlot ?? 0,
    })),
  ];
  return (
    <div className="max-w-3xl space-y-6">
      <DugoutPageHeader title="결제" crumbs={[{ label: '마이', href: '/me' }, { label: '결제' }]} />

      <Card className="space-y-3">
        <h2 className="text-base font-bold text-ink">결제 수단</h2>
        <div className="grid gap-2 opacity-60 sm:grid-cols-3">
          {['카드 등록', '계좌 등록', '간편결제 연결'].map((l) => (
            <button
              key={l}
              type="button"
              disabled
              className="min-h-12 rounded-xl border border-dashed border-line text-sm font-semibold text-muted"
            >
              + {l}
            </button>
          ))}
        </div>
        <p className="inline-flex items-center gap-1.5 text-xs text-warn">
          <RoundLock className="h-3.5 w-3.5" /> 결제 회사 계약과 본인 인증이 끝나면 열려요.
        </p>
      </Card>

      <section className="space-y-4">
        <SectionHead title="결제 예정 · 내역" />
        <Card className="divide-y divide-line p-0">
          {rows.length === 0 && (
            <p className="px-4 py-4 text-xs text-muted">
              아직 결제할 것이 없어요. 레슨이나 장소 예약이 확정되면 여기 떠요.
            </p>
          )}
          {rows.map((r) => (
            <Link
              key={r.id}
              href={r.href}
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                {r.kind}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">
                {r.name} <span className="text-xs text-muted">· {r.when}</span>
              </span>
              <span className="font-semibold text-ink">{formatPrice(r.amount)}</span>
              <span className="text-[11px] text-warn">결제 예정</span>
            </Link>
          ))}
        </Card>
      </section>
    </div>
  );
}
