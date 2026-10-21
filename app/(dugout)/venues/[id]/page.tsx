import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RoundBack, RoundVenue } from '@/components/round-icon';
import { Badge, Card } from '@/components/ui';
import { VenueBooking } from '@/components/dugout/venue-booking';
import { getCurrentUser } from '@/lib/dal';
import { loadDaySlots, loadVenue } from '@/lib/market/venue-load';
import { WEEKDAYS, upcomingDays, venueKindLabel, weekdayOf } from '@/lib/market/venues';
import { formatPrice } from '@/lib/market/specs';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { isDateKey } from '@/lib/org/rules';

type SP = { [key: string]: string | string[] | undefined };

/** 장소 하나 — 소개 · 영업시간 · 앞으로 14일 날짜 띠 · 그날 칸 · 예약 */
export default async function VenuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const v = await loadVenue(id, user?.id ?? null);
  if (!v) notFound();
  const now = appNow();
  const todayKey = toDateKey(now);
  const days = upcomingDays(todayKey);
  const rawDay = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const dateKey = isDateKey(rawDay) && days.includes(rawDay) ? rawDay : todayKey;
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const slots = await loadDaySlots(v, dateKey, todayKey, nowMin);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/venues" className="inline-flex items-center gap-1 text-sm font-semibold text-sky">
        <RoundBack className="h-4 w-4" /> 연습장 · 구장
      </Link>
      {v.images.length > 0 && (
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {v.images.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소
            <img key={url} src={url} alt={`${v.name} ${i + 1}`} className="aspect-[4/3] w-[80%] shrink-0 snap-center rounded-2xl bg-surface-2 object-cover sm:w-[60%]" />
          ))}
        </div>
      )}
      <div className="space-y-2">
        <p className="flex items-center gap-2">
          <Badge>{venueKindLabel(v.kind)}</Badge>
          <Badge>{v.approval ? '승인 예약' : '즉시 예약'}</Badge>
          {v.mine && <Badge className="text-sky-strong">내 장소</Badge>}
        </p>
        <h1 className="text-2xl font-black text-ink">{v.name}</h1>
        <p className="inline-flex items-center gap-1 text-sm text-muted">
          <RoundVenue className="h-4 w-4" /> {v.region}
          {v.address ? ` · ${v.address}` : ''}
        </p>
        <p className="text-sm text-ink">
          <b>{v.slotMin}분</b>에 <b>{v.pricePerSlot != null ? formatPrice(v.pricePerSlot) : '가격 문의'}</b>
          {v.priceNote ? ` · ${v.priceNote}` : ''}
        </p>
      </div>
      {v.intro && <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{v.intro}</p>}

      <Card className="p-0">
        <dl className="grid grid-cols-7 divide-x divide-line text-center text-xs">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className="py-2">
              <dt className="text-muted">{w}</dt>
              <dd className="font-semibold text-ink">{v.hours[i] ? `${v.hours[i]!.open}~${v.hours[i]!.close}` : '쉼'}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">날짜</h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {days.map((d) => {
            const on = d === dateKey;
            const wd = weekdayOf(d);
            return (
              <Link key={d} href={`/venues/${v.id}?date=${d}`} aria-current={on ? 'date' : undefined} className={`flex min-w-14 shrink-0 flex-col items-center rounded-xl border px-2 py-2 text-xs ${on ? 'border-sky bg-sky text-white' : v.hours[wd] ? 'border-line bg-surface text-ink' : 'border-line bg-surface-2 text-muted/60'}`}>
                <span>{WEEKDAYS[wd]}</span>
                <span className="text-base font-bold">{Number(d.slice(8))}</span>
              </Link>
            );
          })}
        </div>
        <h2 className="text-sm font-bold text-ink">{Number(dateKey.slice(5, 7))}월 {Number(dateKey.slice(8))}일 빈 칸</h2>
        {v.mine ? <p className="text-sm text-muted">내 장소예요. 예약 관리는 관리 화면의 ‘장소’에서.</p> : <VenueBooking venueId={v.id} dateKey={dateKey} slots={slots} loggedIn={!!user} approval={v.approval} />}
      </section>
      <p className="text-xs text-muted">운영: {v.owner}</p>
    </div>
  );
}
