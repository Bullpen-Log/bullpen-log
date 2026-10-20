import Link from 'next/link';
import { MapPin, Plus } from '@/components/icon';
import { SafeForm } from '@/components/safe-form';
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeading } from '@/components/ui';
import { answerVenueBooking } from '@/app/actions/venues';
import { requireMaster } from '@/lib/dal';
import { loadMyVenues, loadOwnerVenueBookings } from '@/lib/market/venue-load';
import { minToTime, venueBookingStatusLabel, venueKindLabel } from '@/lib/market/venues';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';

/** 내 장소(3판) — 등록한 연습장 · 구장과 그 예약(요청 먼저). 장소는 조직이 아니라 마스터 계정에 붙는다 */
export default async function VenuesAdminPage() {
  const user = await requireMaster();
  const todayKey = toDateKey(appNow());
  const [venues, bookings] = await Promise.all([loadMyVenues(user.id), loadOwnerVenueBookings(user.id, todayKey)]);
  const fmt = (k: string) => `${Number(k.slice(5, 7))}/${Number(k.slice(8))}`;
  return (
    <div className="stack-page">
      <PageHeading title="장소 · 예약" description="연습장 · 구장을 등록하면 덕아웃에서 빈 시간을 보고 예약해요." action={<ButtonLink href="/master/venues/new">장소 등록</ButtonLink>} inlineAction />
      {venues.length === 0 ? (
        <EmptyState icon={<MapPin />} title="등록한 장소가 없어요" description="실내 연습장 · 타격 케이지 · 구장을 등록하고 요일별 영업시간을 적으면 바로 예약을 받아요." action={<ButtonLink href="/master/venues/new" size="sm"><Plus className="mr-1 h-4 w-4" /> 장소 등록</ButtonLink>} />
      ) : (
        <Card className="divide-y divide-line p-0">
          {venues.map((v) => (
            <Link key={v.id} href={`/master/venues/${v.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink/4">
              <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {v.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소
                  <img src={v.image} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {v.name} <Badge>{venueKindLabel(v.kind)}</Badge> {!v.publicProfile && <Badge className="text-warn">비공개</Badge>}
                </p>
                <p className="text-xs text-muted">
                  {v.region} · {v.slotMin}분 · {v.approval ? '승인 예약' : '즉시 예약'}
                </p>
              </div>
            </Link>
          ))}
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">예약 — 오늘부터</h2>
        {bookings.length === 0 ? (
          <p className="text-xs text-muted">앞으로 잡힌 예약이 없어요.</p>
        ) : (
          <Card className="divide-y divide-line p-0">
            {bookings.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <Badge className={b.status === 'REQUESTED' ? 'text-warn' : b.status === 'CONFIRMED' ? 'text-sky-strong' : undefined}>{venueBookingStatusLabel(b.status)}</Badge>
                <span className="font-semibold text-ink">
                  {fmt(b.dateKey)} {minToTime(b.startMin)}~{minToTime(b.endMin)}
                </span>
                <span className="text-muted">{b.venue.name}</span>
                <span className="text-muted">· {b.user.nickname}</span>
                {b.note && <span className="basis-full text-xs text-muted">“{b.note}”</span>}
                {b.status === 'REQUESTED' && (
                  <span className="ml-auto flex gap-1">
                    <SafeForm action={answerVenueBooking} doneToast="승인했어요.">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="ok" value="1" />
                      <Button type="submit" size="sm">
                        승인
                      </Button>
                    </SafeForm>
                    <SafeForm action={answerVenueBooking} doneToast="거절했어요.">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="ok" value="0" />
                      <Button type="submit" size="sm" variant="ghost">
                        거절
                      </Button>
                    </SafeForm>
                  </span>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
