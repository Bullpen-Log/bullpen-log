import Link from 'next/link';
import { MapPin } from '@/components/icon';
import { Badge, EmptyState } from '@/components/ui';
import { getCurrentUser } from '@/lib/dal';
import { loadVenues } from '@/lib/market/venue-load';
import { VENUE_KINDS, WEEKDAYS, isVenueKind, venueKindLabel } from '@/lib/market/venues';
import { REGIONS, formatPrice, isRegion } from '@/lib/market/specs';

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim().slice(0, 40);

/** 장소 — 실내 연습장 · 구장 목록(3판). 지역 · 종류 · 검색은 주소에. 로그인 없이 본다 */
export default async function VenuesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const kind = isVenueKind(one(sp.kind)) ? one(sp.kind) : undefined;
  const region = isRegion(one(sp.region)) ? one(sp.region) : undefined;
  const q = one(sp.q) || undefined;
  const user = await getCurrentUser();
  const venues = await loadVenues({ region, kind, q }, user?.id ?? null);
  const href = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);
    return `/venues${s.size ? `?${s}` : ''}`;
  };
  const chip = (h: string, on: boolean, label: string) => (
    <Link key={h + label} href={h} aria-current={on ? 'page' : undefined} className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold whitespace-nowrap ${on ? 'bg-sky text-white' : 'border border-line bg-surface text-ink hover:border-sky-soft'}`}>
      {label}
    </Link>
  );
  const openDays = (hours: Record<string, { open: string; close: string } | null>) =>
    WEEKDAYS.map((w, i) => (hours[i] ? w : null))
      .filter(Boolean)
      .join('');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">연습장 · 구장</h1>
        <p className="mt-1 text-sm text-muted">빈 시간을 보고 전화 없이 바로 잡아요. 장소를 갖고 있다면 팀 · 레슨장 계정의 관리 화면에서 등록해요.</p>
      </div>
      <form method="get" action="/venues" className="flex gap-2">
        {kind && <input type="hidden" name="kind" value={kind} />}
        {region && <input type="hidden" name="region" value={region} />}
        <input name="q" type="search" defaultValue={q ?? ''} placeholder="이름 · 동네" className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-4 text-sm text-ink focus:border-sky focus:outline-none" />
        <button type="submit" className="min-h-11 rounded-xl bg-sky px-4 text-sm font-semibold text-white">찾기</button>
      </form>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {chip(href({ region, q }), !kind, '전체')}
        {VENUE_KINDS.map((k) => chip(href({ region, q, kind: k.key }), kind === k.key, k.label))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {chip(href({ kind, q }), !region, '지역 전체')}
        {REGIONS.filter((r) => r !== '전국(택배)').map((r) => chip(href({ kind, q, region: r }), region === r, r))}
      </div>

      {venues.length === 0 ? (
        <EmptyState icon={<MapPin />} title="아직 등록된 장소가 없어요" description="연습장 · 구장을 운영한다면 팀 · 레슨장 계정으로 가입해 관리 화면의 '장소'에서 등록해 주세요." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => (
            <Link key={v.id} href={`/venues/${v.id}`} className="block overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-sky-soft">
              <div className="aspect-[16/9] bg-surface-2">
                {v.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소
                  <img src={v.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="space-y-1 p-3">
                <p className="flex items-center gap-2">
                  <Badge>{venueKindLabel(v.kind)}</Badge>
                  <span className="truncate text-sm font-semibold text-ink">{v.name}</span>
                </p>
                <p className="text-xs text-muted">
                  {v.region}
                  {v.address ? ` · ${v.address}` : ''}
                </p>
                <p className="text-xs text-muted">
                  {openDays(v.hours)} · {v.slotMin}분 {v.pricePerSlot != null ? formatPrice(v.pricePerSlot) : '가격 문의'} · {v.approval ? '승인 예약' : '즉시 예약'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
