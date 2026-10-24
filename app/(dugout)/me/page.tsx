import Link from 'next/link';
import { headers } from 'next/headers';
import { surfaceOf } from '@/lib/app-env';
import { redirect } from 'next/navigation';
import { RoundHeart, RoundPlus } from '@/components/round-icon';
import { Card } from '@/components/ui';
import { DugoutEmpty, DugoutPageHeader, SectionHead } from '@/components/dugout/ui';
import { ListingCard } from '@/components/dugout/listing-card';
import { getCurrentUser } from '@/lib/dal';
import { loadFavorites, loadMyListings } from '@/lib/market/load';
import { loadMyBookings } from '@/lib/market/lesson-load';
import { loadMyVenueBookings } from '@/lib/market/venue-load';
import { audienceLabel, bookingStatusLabel, canReview, formatSlot, payMethodLabel } from '@/lib/market/lessons';
import { minToTime, venueBookingStatusLabel } from '@/lib/market/venues';
import { cancelBooking } from '@/app/actions/lessons';
import { cancelVenueBooking } from '@/app/actions/venues';
import { ConfirmButton } from '@/components/master/confirm-button';
import { ReviewForm } from '@/components/dugout/review-form';
import { Badge } from '@/components/ui';
import { SafeForm } from '@/components/safe-form';
import { LessonFeedCard } from '@/components/dugout/lesson-feed-card';
import { loadLessonFeed } from '@/lib/org/lesson-feed';
import { setPublicSinker } from '@/app/actions/profile-public';
import { PUBLIC_SINKER_OPTIONS, profileHref } from '@/lib/public-profile';
import { usesSinker } from '@/lib/brand';

/** 내 것 — 내가 올린 물건 · 찜. 싱커 안(/today)으로 가는 길도 여기 */
export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/me');
  const [mine, favorites, bookings, venueBookings, lessonFeed] = await Promise.all([
    loadMyListings(user.id),
    loadFavorites(user.id),
    loadMyBookings(user.id),
    loadMyVenueBookings(user.id),
    loadLessonFeed(user.id, 10),
  ]);
  const sinker = usesSinker(user);
  /* 싱커 앱 안 — 레슨 · 연습장 예약만(장터 물건 · 찜 · 결제는 덕아웃 웹 · 덕아웃 앱, lib/sinker-dugout.ts) */
  const sinkerApp = surfaceOf((await headers()).get('user-agent')) === 'sinker-app';
  const shown = new Set(user.publicSinker ?? []);
  const now = new Date();
  return (
    <div className="space-y-10">
      <DugoutPageHeader
        title={user.nickname}
        subtitle={
          sinkerApp ? (
            '레슨 · 연습장 예약'
          ) : (
            <>
              덕아웃에서 올린 물건과 찜 ·{' '}
              <Link href="/me/payments" className="font-semibold text-sky">
                결제
              </Link>
            </>
          )
        }
        actions={
          sinkerApp ? undefined : sinker ? (
            <Link
              href="/today"
              className="inline-flex min-h-10 items-center rounded-xl bg-sky px-4 text-sm font-semibold text-white"
            >
              싱커
            </Link>
          ) : (
            <p className="max-w-xs text-right text-xs text-muted">
              레슨을 받고 코치가 기록을 남기면 ‘내 싱커’가 열려요.
            </p>
          )
        }
      />

      {/* 레슨 기록(3단계 3-4) — 코치가 쓴 노트가 그대로 */}
      <div id="lessons">
        {lessonFeed.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              아직 레슨 기록이 없어요. 레슨을 예약하고 받으면 코치의 노트가 여기 쌓여요.
            </p>
          </Card>
        ) : (
          <LessonFeedCard items={lessonFeed} />
        )}
      </div>

      {/* 공개 프로필(3단계 3-6) — 기본은 전부 숨김 */}
      <section className="space-y-4">
        <SectionHead title="공개 프로필" href={profileHref(user.nickname)} more="내 프로필 보기 ›" />
        <Card>
          <SafeForm
            action={setPublicSinker}
            doneToast="저장했어요."
            className="space-y-3"
          >
            <p className="text-xs text-muted">
              덕아웃의 다른 사람에게 보일 싱커 기록을 고르세요. 기본은 전부 숨김이에요.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {PUBLIC_SINKER_OPTIONS.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="keys"
                    value={o.key}
                    defaultChecked={shown.has(o.key)}
                    className="h-4 w-4 accent-sky"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="min-h-10 rounded-xl border border-line px-4 text-sm font-semibold text-ink"
            >
              저장
            </button>
          </SafeForm>
        </Card>
      </section>

      {!sinkerApp && (
      <section className="space-y-4">
        <SectionHead
          title="내 물건"
          count={mine.length}
          action={
            <Link href="/market/new" className="inline-flex items-center gap-1 text-sm font-semibold text-sky">
              <RoundPlus className="h-4 w-4" /> 올리기
            </Link>
          }
        />
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

      )}

      <section id="bookings" className="scroll-mt-28 space-y-4">
        <SectionHead title="레슨 예약" count={bookings.length} />
        {bookings.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              <Link href="/lessons" className="font-semibold text-sky">
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
                    href={`/lessons/${b.org.id}`}
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
                {(b.audience || b.payMethod) && (
                  <p className="text-xs text-muted">
                    {[audienceLabel(b.audience), payMethodLabel(b.payMethod) && `${payMethodLabel(b.payMethod)}(결제 준비 중)`].filter(Boolean).join(' · ')}
                  </p>
                )}
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
                    href={`/pay/lesson/${b.id}`}
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

      <section className="space-y-4">
        <SectionHead title="장소 예약" count={venueBookings.length} />
        {venueBookings.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              <Link href="/venues" className="font-semibold text-sky">
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
                  href={`/venues/${b.venue.id}`}
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
                    href={`/pay/venue/${b.id}`}
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

      {!sinkerApp && (
      <section id="favorites" className="scroll-mt-28 space-y-4">
        <SectionHead title="찜" count={favorites.length} />
        {favorites.length === 0 ? (
          <DugoutEmpty
            compact
            icon={<RoundHeart />}
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
      )}
    </div>
  );
}
