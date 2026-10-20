import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Heart, Plus, Tag } from '@/components/icon';
import { Card, EmptyState } from '@/components/ui';
import { ListingCard } from '@/components/dugout/listing-card';
import { getCurrentUser } from '@/lib/dal';
import { loadFavorites, loadMyListings } from '@/lib/market/load';
import { loadMyBookings } from '@/lib/market/lesson-load';
import { loadMyVenueBookings } from '@/lib/market/venue-load';
import { bookingStatusLabel, canReview, formatSlot } from '@/lib/market/lessons';
import { minToTime, venueBookingStatusLabel } from '@/lib/market/venues';
import { cancelBooking } from '@/app/actions/lessons';
import { cancelVenueBooking } from '@/app/actions/venues';
import { ConfirmButton } from '@/components/master/confirm-button';
import { ReviewForm } from '@/components/dugout/review-form';
import { Badge } from '@/components/ui';

/** 내 것 — 내가 올린 물건 · 찜. 불펜로그 안(/today)으로 가는 길도 여기 */
export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dugout/me');
  const [mine, favorites, bookings, venueBookings] = await Promise.all([
    loadMyListings(user.id),
    loadFavorites(user.id),
    loadMyBookings(user.id),
    loadMyVenueBookings(user.id),
  ]);
  const now = new Date();
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">{user.nickname}</h1>
          <p className="text-sm text-muted">
            덕아웃에서 올린 물건과 찜 ·{' '}
            <Link href="/dugout/me/payments" className="font-semibold text-sky">
              결제
            </Link>
          </p>
        </div>
        <Link
          href="/today"
          className="inline-flex min-h-10 items-center rounded-xl bg-sky px-4 text-sm font-semibold text-white"
        >
          내 불펜로그
        </Link>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-1.5 text-lg font-bold text-ink">
            <Tag className="h-4 w-4" /> 내 물건 {mine.length}
          </h2>
          <Link
            href="/dugout/market/new"
            className="inline-flex items-center gap-1 text-sm font-semibold text-sky"
          >
            <Plus className="h-4 w-4" /> 올리기
          </Link>
        </div>
        {mine.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              아직 올린 물건이 없어요. 안 쓰는 글러브 하나부터.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {mine.map((item) => (
              <ListingCard key={item.id} item={item} now={now} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">레슨 예약 {bookings.length}</h2>
        {bookings.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              <Link href="/dugout/lessons" className="font-semibold text-sky">
                레슨
              </Link>
              에서 코치를 골라 요청해 보세요.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-line p-0">
            {bookings.map((b) => (
              <div key={b.id} className="space-y-2 px-4 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={
                      b.status === 'CONFIRMED'
                        ? 'text-sky-strong'
                        : b.status === 'REQUESTED'
                          ? 'text-warn'
                          : undefined
                    }
                  >
                    {bookingStatusLabel(b.status)}
                  </Badge>
                  <Link
                    href={`/dugout/lessons/${b.org.id}`}
                    className="font-semibold text-ink hover:text-sky"
                  >
                    {b.org.name}
                  </Link>
                  <span className="text-xs text-muted">{b.org.coach} 코치</span>
                  <span className="ml-auto text-xs text-muted">
                    {b.chosen
                      ? formatSlot(b.chosen)
                      : `${formatSlot(b.slot1)}${b.slot2 ? ` 또는 ${formatSlot(b.slot2)}` : ''}`}
                  </span>
                </p>
                {b.reply && <p className="text-xs text-muted">코치: {b.reply}</p>}
                {['REQUESTED', 'CONFIRMED'].includes(b.status) && (
                  <ConfirmButton
                    action={cancelBooking}
                    fields={{ id: b.id }}
                    message="이 예약을 취소할까요?"
                    doneToast="취소했어요."
                  >
                    취소
                  </ConfirmButton>
                )}
                {b.status === 'CONFIRMED' && (
                  <Link
                    href={`/dugout/pay/lesson/${b.id}`}
                    className="inline-flex min-h-9 items-center rounded-lg border border-sky px-3 text-xs font-semibold text-sky-strong"
                  >
                    레슨비 결제
                  </Link>
                )}
                {canReview({ status: b.status, hasReview: b.hasReview }) && (
                  <ReviewForm bookingId={b.id} />
                )}
                {b.hasReview && <p className="text-xs text-muted">후기를 남겼어요.</p>}
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">장소 예약 {venueBookings.length}</h2>
        {venueBookings.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              <Link href="/dugout/venues" className="font-semibold text-sky">
                연습장 · 구장
              </Link>
              에서 빈 칸을 골라 잡아 보세요.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-line p-0">
            {venueBookings.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
              >
                <Badge
                  className={
                    b.status === 'CONFIRMED'
                      ? 'text-sky-strong'
                      : b.status === 'REQUESTED'
                        ? 'text-warn'
                        : undefined
                  }
                >
                  {venueBookingStatusLabel(b.status)}
                </Badge>
                <Link
                  href={`/dugout/venues/${b.venue.id}`}
                  className="font-semibold text-ink hover:text-sky"
                >
                  {b.venue.name}
                </Link>
                <span className="text-xs text-muted">
                  {Number(b.dateKey.slice(5, 7))}/{Number(b.dateKey.slice(8))}{' '}
                  {minToTime(b.startMin)}~{minToTime(b.endMin)}
                </span>
                {b.reply && (
                  <span className="basis-full text-xs text-muted">
                    사장님: {b.reply}
                  </span>
                )}
                {b.status === 'CONFIRMED' && (
                  <Link
                    href={`/dugout/pay/venue/${b.id}`}
                    className="inline-flex min-h-9 items-center rounded-lg border border-sky px-3 text-xs font-semibold text-sky-strong"
                  >
                    선결제
                  </Link>
                )}
                {['REQUESTED', 'CONFIRMED'].includes(b.status) && (
                  <span className="ml-auto">
                    <ConfirmButton
                      action={cancelVenueBooking}
                      fields={{ id: b.id }}
                      message="이 예약을 취소할까요?"
                      doneToast="취소했어요."
                    >
                      취소
                    </ConfirmButton>
                  </span>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="inline-flex items-center gap-1.5 text-lg font-bold text-ink">
          <Heart className="h-4 w-4" /> 찜 {favorites.length}
        </h2>
        {favorites.length === 0 ? (
          <EmptyState
            icon={<Heart />}
            title="찜한 물건이 없어요"
            description="장터에서 하트를 누르면 여기 모여요."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {favorites.map((item) => (
              <ListingCard key={item.id} item={item} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
