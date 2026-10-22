import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RoundBack } from '@/components/round-icon';
import { Badge, ButtonLink, Card } from '@/components/ui';
import { CoachAvatar, Stars } from '@/components/dugout/coach-card';
import { LessonBookForm } from '@/components/dugout/lesson-book-form';
import { getCurrentUser } from '@/lib/dal';
import { loadCoach, loadCoachDays } from '@/lib/market/lesson-load';
import { bookingStatusLabel, formatSlot, isAudience, isSpecialty } from '@/lib/market/lessons';
import { formatPrice } from '@/lib/market/specs';

export const metadata: Metadata = { title: '레슨 요청' };

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim();

/**
 * 간편 예약(3판, 닥터나우 '진료 날짜 → 환자 정보 → 결제 정보' 재해석) — 날짜 띠 14일 · 그날 칸(코치의 레슨 시간) · 원하는 때 둘까지 · 무엇을 · 누가 · 한마디 ·
 * 결제 수단(저장만). 보내면 코치가 하나를 확정한다. 로그인이 필요하다(끝나면 여기로 돌아온다).
 */
export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<SP>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const query = new URLSearchParams(
    Object.entries({ specialty: one(sp.specialty), audience: one(sp.audience) }).filter(([, v]) => v) as [string, string][]
  ).toString();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/lessons/${orgId}/book${query ? `?${query}` : ''}`)}`);
  const c = await loadCoach(orgId, user.id);
  if (!c) notFound();
  const { todayKey, days, byDay } = await loadCoachDays(c);
  const rawS = one(sp.specialty);
  const rawA = one(sp.audience);
  const specialty = isSpecialty(rawS) ? rawS : (c.specialties[0] ?? null);
  const audience = isAudience(rawA) ? rawA : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/lessons/${c.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-sky">
        <RoundBack className="h-4 w-4" /> {c.coach} 코치
      </Link>
      <div>
        <h1 className="text-2xl font-black text-ink">레슨 요청</h1>
        <p className="mt-1 text-sm text-muted">원하는 때를 고르면 코치가 하나를 확정해요. 레슨비는 레슨이 끝난 뒤 결제돼요.</p>
      </div>
      <Card className="flex items-center gap-3">
        <CoachAvatar name={c.coach} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">
            {c.coach} 코치 <span className="font-normal text-muted">· {c.name}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <Stars rating={c.rating} reviews={c.reviews} />
            <span>{c.priceFrom != null ? `${formatPrice(c.priceFrom)}~ · ${c.slotMin}분` : `${c.slotMin}분 · 가격 문의`}</span>
          </p>
        </div>
      </Card>

      {c.mine ? (
        <p className="text-sm text-muted">내 레슨장에는 예약할 수 없어요.</p>
      ) : c.myBooking ? (
        /* 요청을 보내면 화면이 다시 그려져 이 카드가 보인다 — 보낸 직후의 확인이기도 하다 */
        <Card className="space-y-3 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sky/12 text-2xl text-sky-strong">✓</span>
          <div>
            <p className="text-lg font-bold text-ink">
              {c.myBooking.status === 'CONFIRMED' ? '레슨이 확정됐어요' : '요청을 보냈어요'}
            </p>
            <p className="mt-1 text-sm text-ink">
              <Badge className="text-sky-strong">{bookingStatusLabel(c.myBooking.status)}</Badge>{' '}
              {c.myBooking.chosen
                ? formatSlot(c.myBooking.chosen)
                : `${formatSlot(c.myBooking.slot1)}${c.myBooking.slot2 ? ` 또는 ${formatSlot(c.myBooking.slot2)}` : ''}`}
            </p>
            <p className="mt-1 text-xs text-muted">
              {c.myBooking.status === 'CONFIRMED'
                ? '레슨이 끝나면 후기를 남길 수 있어요.'
                : `${c.coach} 코치가 확정하면 알림으로 알려 드려요. 보통 하루 안에 답이 와요.`}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink href="/me#bookings" size="lg">
              내 예약 보기
            </ButtonLink>
            <Link href="/lessons" className="inline-flex min-h-12 items-center px-4 text-sm font-semibold text-muted">
              레슨 홈으로
            </Link>
          </div>
        </Card>
      ) : (
        <LessonBookForm
          coach={{ id: c.id, coach: c.coach, specialties: c.specialties, slotMin: c.slotMin, priceFrom: c.priceFrom, trialPrice: c.trialPrice, hasSlots: !!c.slots }}
          todayKey={todayKey}
          days={days}
          byDay={byDay}
          initialSpecialty={specialty}
          initialAudience={audience}
        />
      )}
    </div>
  );
}
