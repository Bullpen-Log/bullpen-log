import type { Metadata } from 'next';
import Link from 'next/link';
import { PlaceMap } from '@/components/dugout/place-map';
import { loadMapPlaces } from '@/lib/market/map-load';
import { VENUE_KINDS, isVenueKind } from '@/lib/market/venues';

export const metadata: Metadata = { title: '연습장 · 레슨장 지도' };

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim().slice(0, 40);

/**
 * 연습장 · 레슨장 지도(2026-10-24 금윤호: "네이버 지도 · 카카오맵처럼 찾고, 네이버 예약처럼 대관을 예약") — 카카오맵 위에 공개된
 * 연습장 · 구장과 레슨장을 점으로, 왼쪽(휴대폰은 밑) 목록. 점이나 줄을 누르면 카드 → 자세히 · 예약(장소 화면의 칸 고르기 · 레슨 예약 화면).
 * 거르기 · 검색은 주소에(?kind=&q=). 로그인 없이 본다.
 */
export default async function VenuesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const raw = one(sp.kind);
  const kind = raw === 'lesson' || isVenueKind(raw) ? raw : undefined;
  const q = one(sp.q) || undefined;
  const places = await loadMapPlaces({ kind, q });
  const href = (k?: string) => {
    const s = new URLSearchParams(Object.entries({ kind: k, q }).filter(([, v]) => v) as [string, string][]);
    return `/venues${s.size ? `?${s}` : ''}`;
  };
  const chip = (k: string | undefined, label: string) => (
    <Link
      key={label}
      href={href(k)}
      scroll={false}
      data-nav="none"
      aria-current={kind === k ? 'page' : undefined}
      className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold whitespace-nowrap ${kind === k ? 'bg-ink text-page' : 'border border-line bg-surface text-ink hover:border-ink/30'}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">연습장 · 레슨장</h1>
          <p className="mt-1 text-sm text-muted">지도에서 찾고, 빈 시간을 보고 바로 예약해요.</p>
        </div>
        <form method="get" action="/venues" className="flex w-full gap-2 sm:w-auto">
          {kind && <input type="hidden" name="kind" value={kind} />}
          <input
            name="q"
            type="search"
            defaultValue={q ?? ''}
            placeholder="이름 · 동네 · 주소"
            className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-sm text-ink focus:border-sky focus:outline-none sm:w-64"
          />
          <button type="submit" className="min-h-10 rounded-xl bg-ink px-4 text-sm font-bold text-page">
            찾기
          </button>
        </form>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {chip(undefined, '전체')}
        {chip('lesson', '레슨장')}
        {VENUE_KINDS.map((k) => chip(k.key, k.label))}
      </div>
      <PlaceMap places={places} />
      <p className="text-[11px] text-muted">
        장소를 운영한다면 팀 · 레슨장 계정의 관리 화면에서 등록해요. 주소를 적으면 지도에 떠요.
      </p>
    </div>
  );
}
