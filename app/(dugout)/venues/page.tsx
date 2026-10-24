import type { Metadata } from 'next';
import { PlaceMap } from '@/components/dugout/place-map';
import { CategoryRow, DugoutPageHeader } from '@/components/dugout/ui';
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
  const kinds = [{ key: undefined, label: '전체' }, { key: 'lesson', label: '레슨장' }, ...VENUE_KINDS].map((k) => ({
    key: k.key ?? 'all',
    label: k.label,
    href: href(k.key),
    on: kind === k.key,
  }));

  return (
    <div className="space-y-4">
      <DugoutPageHeader
        title="연습장 · 레슨장"
        actions={
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
        }
      />
      <CategoryRow label="장소 종류" items={kinds} keepScroll />
      <PlaceMap places={places} />
    </div>
  );
}
