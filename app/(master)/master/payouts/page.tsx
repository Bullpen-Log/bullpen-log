import { Lock } from '@/components/icon';
import { Badge, Card, PageHeading } from '@/components/ui';
import { requireMaster } from '@/lib/dal';
import { requireCurrentOrg } from '@/lib/org/access';
import { prisma } from '@/lib/prisma';
import {
  LESSON_FEE_RATE,
  VENUE_FEE_RATE,
  monthKeyOf,
  payout,
  platformFee,
} from '@/lib/market/pay';
import { formatPrice } from '@/lib/market/specs';

/**
 * 정산(4판 껍데기) — 이번 달 확정 · 끝난 레슨과 장소 예약을 가격으로 셈한 '받을 돈'. 결제가 열리기 전이라 숫자는 예상이고, 정산 계좌 칸은 잠겨 있다.
 */
export default async function PayoutsPage() {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const now = new Date();
  const month = monthKeyOf(now);
  const from = new Date(`${month}-01T00:00:00+09:00`);
  const [lessons, venueBookings] = await Promise.all([
    org.kind === 'LESSON'
      ? prisma.lessonBooking.findMany({
          where: {
            orgId: org.id,
            status: { in: ['CONFIRMED', 'DONE'] },
            chosen: { gte: from },
          },
          select: {
            id: true,
            status: true,
            chosen: true,
            user: { select: { nickname: true } },
            org: { select: { priceFrom: true } },
          },
        })
      : Promise.resolve([]),
    prisma.venueBooking.findMany({
      where: { venue: { ownerId: user.id }, status: 'CONFIRMED', date: { gte: from } },
      select: {
        id: true,
        date: true,
        startMin: true,
        user: { select: { nickname: true } },
        venue: { select: { name: true, pricePerSlot: true } },
      },
    }),
  ]);
  const lessonGross = lessons.reduce((a, b) => a + (b.org.priceFrom ?? 0), 0);
  const venueGross = venueBookings.reduce((a, b) => a + (b.venue.pricePerSlot ?? 0), 0);
  const rows = [
    { label: '레슨', count: lessons.length, gross: lessonGross, rate: LESSON_FEE_RATE },
    {
      label: '장소',
      count: venueBookings.length,
      gross: venueGross,
      rate: VENUE_FEE_RATE,
    },
  ];
  const net = rows.reduce((a, r) => a + payout(r.gross, r.rate), 0);

  return (
    <div className="stack-page">
      <PageHeading
        title="정산"
        description={`${month.replace('-', '년 ')}월 — 확정 · 끝난 예약을 적어 둔 가격으로 셈한 예상이에요.`}
      />
      <section className="grid grid-cols-3 gap-3">
        {rows.map((r) => (
          <Card key={r.label} className="p-4">
            <p className="text-xs text-muted">
              {r.label} {r.count}건
            </p>
            <p className="mt-1 text-xl font-bold text-ink">
              {formatPrice(payout(r.gross, r.rate))}
            </p>
            <p className="text-[11px] text-muted">
              매출 {formatPrice(r.gross)} · 수수료 {Math.round(r.rate * 100)}%{' '}
              {formatPrice(platformFee(r.gross, r.rate))}
            </p>
          </Card>
        ))}
        <Card className="bg-ink p-4 text-white">
          <p className="text-xs text-white/70">이달 받을 돈(예상)</p>
          <p className="mt-1 text-xl font-black">{formatPrice(net)}</p>
          <p className="text-[11px] text-white/60">결제가 열리면 매달 10일 정산</p>
        </Card>
      </section>

      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-ink">정산 계좌</h2>
        <div className="grid gap-3 opacity-60 sm:grid-cols-3">
          <input
            disabled
            placeholder="은행"
            className="min-h-11 rounded-xl border border-line bg-surface-2 px-4 text-sm"
          />
          <input
            disabled
            placeholder="계좌번호"
            className="min-h-11 rounded-xl border border-line bg-surface-2 px-4 text-sm"
          />
          <input
            disabled
            placeholder="예금주"
            className="min-h-11 rounded-xl border border-line bg-surface-2 px-4 text-sm"
          />
        </div>
        <p className="inline-flex items-center gap-1.5 text-xs text-warn">
          <Lock className="h-3.5 w-3.5" /> 결제 회사 계약과 사업자 확인이 끝나면 열려요.
          그때까지 돈은 지금처럼 직접 받아요.
        </p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">이달 내역</h2>
        <Card className="divide-y divide-line p-0">
          {lessons.length === 0 && venueBookings.length === 0 && (
            <p className="px-4 py-4 text-xs text-muted">이달 확정된 예약이 없어요.</p>
          )}
          {lessons.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Badge>레슨</Badge>
              <span className="text-ink">{b.user.nickname}</span>
              <span className="text-xs text-muted">
                {b.chosen
                  ? new Intl.DateTimeFormat('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      month: 'numeric',
                      day: 'numeric',
                    }).format(b.chosen)
                  : ''}
              </span>
              <span className="ml-auto font-semibold text-ink">
                {formatPrice(b.org.priceFrom ?? 0)}
              </span>
              <Badge className={b.status === 'DONE' ? 'text-ok' : undefined}>
                {b.status === 'DONE' ? '끝남' : '확정'}
              </Badge>
            </div>
          ))}
          {venueBookings.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Badge>장소</Badge>
              <span className="text-ink">{b.user.nickname}</span>
              <span className="text-xs text-muted">
                {b.venue.name} · {Number(b.date.toISOString().slice(5, 7))}/
                {Number(b.date.toISOString().slice(8, 10))}
              </span>
              <span className="ml-auto font-semibold text-ink">
                {formatPrice(b.venue.pricePerSlot ?? 0)}
              </span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
