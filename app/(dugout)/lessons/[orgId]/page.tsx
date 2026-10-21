import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Star } from '@/components/icon';
import { Badge, Card } from '@/components/ui';
import { BookingForm } from '@/components/dugout/booking-form';
import { ConfirmButton } from '@/components/master/confirm-button';
import { cancelBooking } from '@/app/actions/lessons';
import { getCurrentUser } from '@/lib/dal';
import { loadCoach } from '@/lib/market/lesson-load';
import { BOOKING_MAX_DAYS_AHEAD, bookingStatusLabel, formatSlot, specialtyLabel } from '@/lib/market/lessons';
import { formatPrice } from '@/lib/market/specs';
import { relativeTime } from '@/components/community/community-format';

/** 코치 하나 — 소개 · 전문 · 가격 · 후기 · 요청(로그인). 이미 요청 · 확정이 있으면 그 상태 */
export default async function CoachPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await getCurrentUser();
  const c = await loadCoach(orgId, user?.id ?? null);
  if (!c) notFound();
  const now = new Date();
  const local = (ms: number) => {
    const d = new Date(ms + 9 * 3_600_000);
    return d.toISOString().slice(0, 16);
  };
  const minLocal = local(now.getTime() + 3 * 3_600_000);
  const maxLocal = local(now.getTime() + BOOKING_MAX_DAYS_AHEAD * 86_400_000);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/lessons" className="inline-flex items-center gap-1 text-sm font-semibold text-sky">
        <ChevronLeft className="h-4 w-4" /> 레슨
      </Link>
      <div className="flex items-start gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-sky/12 text-2xl font-bold text-sky-strong">{c.coach.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-ink">{c.name}</h1>
          <p className="text-sm text-muted">
            {c.coach} 코치 · {[c.region, c.career].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-2 flex flex-wrap gap-1">
            {c.specialties.map((s) => (
              <Badge key={s}>{specialtyLabel(s)}</Badge>
            ))}
          </p>
        </div>
      </div>
      <Card className="grid grid-cols-3 divide-x divide-line p-0 text-center">
        <div className="px-2 py-3">
          <p className="text-[11px] text-muted">가격</p>
          <p className="text-sm font-bold text-ink">{c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : '문의'}</p>
          {c.priceNote && <p className="text-[11px] text-muted">{c.priceNote}</p>}
        </div>
        <div className="px-2 py-3">
          <p className="text-[11px] text-muted">후기</p>
          <p className="inline-flex items-center gap-1 text-sm font-bold text-ink">
            <Star className="h-3.5 w-3.5" /> {c.rating ?? '-'} <span className="font-normal text-muted">({c.reviews})</span>
          </p>
        </div>
        <div className="px-2 py-3">
          <p className="text-[11px] text-muted">회원</p>
          <p className="text-sm font-bold text-ink">{c.members}명</p>
        </div>
      </Card>
      {c.intro && <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{c.intro}</p>}
      {c.hours && <p className="text-sm text-muted">레슨 시간: {c.hours}</p>}

      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-ink">레슨 요청</h2>
        {!user ? (
          <Link href={`/login?next=/lessons/${c.id}`} className="inline-flex min-h-12 items-center rounded-xl bg-sky px-5 text-base font-semibold text-white">
            로그인하고 요청하기
          </Link>
        ) : c.myBooking ? (
          <div className="space-y-2 text-sm">
            <p>
              <Badge className="text-sky-strong">{bookingStatusLabel(c.myBooking.status)}</Badge>{' '}
              {c.myBooking.chosen ? formatSlot(c.myBooking.chosen) : `${formatSlot(c.myBooking.slot1)}${c.myBooking.slot2 ? ` 또는 ${formatSlot(c.myBooking.slot2)}` : ''}`}
            </p>
            <ConfirmButton action={cancelBooking} fields={{ id: c.myBooking.id }} message="이 요청을 취소할까요?" doneToast="취소했어요.">
              취소
            </ConfirmButton>
          </div>
        ) : (
          <BookingForm orgId={c.id} minLocal={minLocal} maxLocal={maxLocal} />
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">후기 — 실제로 레슨 받은 사람만 써요</h2>
        {c.reviewList.length === 0 ? (
          <p className="text-xs text-muted">아직 후기가 없어요.</p>
        ) : (
          <Card className="divide-y divide-line p-0">
            {c.reviewList.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span className="inline-flex text-warn">{'★'.repeat(r.rating)}</span>
                  <span>{r.nickname}</span>
                  <span>{relativeTime(r.createdAt, now)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{r.body}</p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
