import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeading } from '@/components/ui';
import { CalendarDays } from '@/components/icon';
import { BookingActions } from '@/components/master/booking-actions';
import { requireMaster } from '@/lib/dal';
import { requireCurrentOrg } from '@/lib/org/access';
import { loadOrgBookings } from '@/lib/market/lesson-load';
import { bookingStatusLabel, formatSlot } from '@/lib/market/lessons';

/** 덕아웃 레슨 요청(코치 쪽, 2판) — 요청부터. 확정하면 회원 · 시간표에 들어간다 */
export default async function BookingsPage() {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const rows = org.kind === 'LESSON' ? await loadOrgBookings(org.id) : [];
  return (
    <div className="stack-page">
      <PageHeading title="레슨 요청" description={org.kind === 'LESSON' ? '덕아웃에서 온 예약 요청 — 하나를 골라 확정하면 회원이 되고 시간표에 들어가요.' : '팀 계정에는 레슨 요청이 오지 않아요.'} />
      {org.kind === 'LESSON' && (
        <p className="text-xs text-muted">
          요청이 오려면 <Link href="/manage/settings#coach" className="font-semibold text-sky">설정의 코치 프로필</Link>을 공개해야 해요.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="아직 요청이 없어요" description="프로필을 공개하면 덕아웃 레슨 목록에 뜨고, 선수가 시간을 골라 요청해요." />
      ) : (
        <Card className="divide-y divide-line p-0">
          {rows.map((b) => (
            <div key={b.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className={b.status === 'REQUESTED' ? 'text-warn' : b.status === 'CONFIRMED' ? 'text-sky-strong' : undefined}>{bookingStatusLabel(b.status)}</Badge>
                {b.memberId ? (
                  <Link href={`/manage/players/${b.memberId}`} className="font-semibold text-ink hover:text-sky">
                    {b.player.nickname}
                  </Link>
                ) : (
                  <span className="font-semibold text-ink">{b.player.nickname}</span>
                )}
                <span className="text-xs text-muted">투구 기록 {b.player.records}건</span>
                <span className="ml-auto text-xs text-muted">{b.chosen ? formatSlot(b.chosen) : `${formatSlot(b.slot1)}${b.slot2 ? ` 또는 ${formatSlot(b.slot2)}` : ''}`}</span>
              </div>
              {b.note && <p className="text-sm text-ink">“{b.note}”</p>}
              {b.reply && <p className="text-xs text-muted">내 답: {b.reply}</p>}
              <BookingActions id={b.id} status={b.status} slot1={b.slot1.toISOString()} slot2={b.slot2?.toISOString() ?? null} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
