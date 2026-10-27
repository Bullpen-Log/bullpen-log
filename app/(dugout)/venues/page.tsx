import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { surfaceOf } from '@/lib/app-env';
import { PlaceMap } from '@/components/dugout/place-map';
import { CategoryRow, ChipLink, ChipRow, DugoutPageHeader } from '@/components/dugout/ui';
import { getCurrentUser } from '@/lib/dal';
import { isOwner } from '@/lib/permissions';
import { loadMapPlacesPage } from '@/lib/market/map-load';
import { CANDIDATE_FLAGS, candidateMapPlaces, loadCandidateMapPage } from '@/lib/market/candidate-load';
import { VENUE_KINDS, isVenueKind } from '@/lib/market/venues';
import { placePage } from '@/lib/market/place-pagination';

export const metadata: Metadata = { title: '연습장 · 레슨장 지도' };

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim().slice(0, 40);

/**
 * 연습장 · 레슨장 지도(2026-10-24 금윤호: "네이버 지도 · 카카오맵처럼 찾고, 네이버 예약처럼 대관을 예약") — 카카오맵 위에 공개된
 * 연습장 · 구장과 레슨장을 점으로, 왼쪽(휴대폰은 밑) 목록. 점이나 줄을 누르면 카드 → 자세히 · 예약(장소 화면의 칸 고르기 · 레슨 예약 화면).
 * 거르기 · 검색은 주소에(?kind=&q=). 로그인 없이 본다.
 *
 * 대표관리자는 [공개 지도 | 수집 후보] 로 같은 자리에서 수집 후보 지도로 바꾼다(?view=candidates, 2026-10-26 김민 "관리자까지 들어가기 불편해").
 * 그때 종류 줄은 후보 거르기(?kind= 가 거르기 열쇠). 후보 읽기는 loadCandidates 가 requireAdmin 을 다시 본다.
 */
export default async function VenuesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = one(sp.q) || undefined;
  const page = placePage(one(sp.page));
  const admin = isOwner((await getCurrentUser())?.role);
  /* 싱커 앱 안(2026-10-27 승인 시안 — 덕아웃의 '연습장' 분류)은 연습장 · 구장만. 레슨장은 덕아웃 웹 · 덕아웃 앱의 공용 지도에 그대로 */
  const sinkerApp = surfaceOf((await headers()).get('user-agent')) === 'sinker-app';
  const candidates = admin && one(sp.view) === 'candidates';
  const raw = one(sp.kind);
  const kind = candidates
    ? CANDIDATE_FLAGS.some((f) => f.key === raw) ? raw : undefined
    : (raw === 'lesson' && !sinkerApp) || isVenueKind(raw) ? raw : undefined;
  const result = candidates
    ? await loadCandidateMapPage({ q, flag: kind }, page).then((r) => ({ places: candidateMapPlaces(r.items), hasMore: r.hasMore }))
    : await loadMapPlacesPage({ kind, q, only: sinkerApp ? 'venue' : undefined }, page);
  const { places, hasMore } = result;
  const view = candidates ? 'candidates' : undefined;
  const href = (k?: string, v: string | null | undefined = view) => {
    const s = new URLSearchParams(Object.entries({ view: v, kind: k, q }).filter(([, x]) => x) as [string, string][]);
    return `/venues${s.size ? `?${s}` : ''}`;
  };
  const pageHref = (p: number) => {
    const s = new URLSearchParams(Object.entries({ view, kind, q, page: String(p) }).filter(([, x]) => x) as [string, string][]);
    return `/venues?${s}`;
  };
  const list = candidates ? CANDIDATE_FLAGS : sinkerApp ? VENUE_KINDS : [{ key: 'lesson', label: '레슨장' }, ...VENUE_KINDS];
  const kinds = [{ key: undefined, label: '전체' }, ...list].map((k) => ({
    key: k.key ?? 'all',
    label: k.label,
    href: href(k.key),
    on: kind === k.key,
  }));

  return (
    <div className="space-y-4">
      <DugoutPageHeader
        title={candidates ? '수집 후보' : sinkerApp ? '연습장' : '연습장 · 레슨장'}
        actions={
          <form method="get" action="/venues" className="flex w-full gap-2 sm:w-auto">
            {view && <input type="hidden" name="view" value={view} />}
            {kind && <input type="hidden" name="kind" value={kind} />}
            <input
              name="q"
              type="search"
              defaultValue={q ?? ''}
              placeholder={candidates ? '이름 · 주소 · 구' : '이름 · 동네 · 주소'}
              className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-sm text-ink focus:border-sky focus:outline-none sm:w-64"
            />
            <button type="submit" className="min-h-10 rounded-xl bg-ink px-4 text-sm font-bold text-page">
              찾기
            </button>
          </form>
        }
      />
      {admin && (
        <ChipRow label="지도 고르기">
          <ChipLink href={href(undefined, null)} on={!candidates} size="md">
            공개 지도
          </ChipLink>
          <ChipLink href={href(undefined, 'candidates')} on={candidates} size="md">
            수집 후보(관리자)
          </ChipLink>
        </ChipRow>
      )}
      <CategoryRow label={candidates ? '후보 거르기' : '장소 종류'} items={kinds} keepScroll />
      {candidates && (
        <p className="text-xs text-muted">
          현재 {page}쪽 {places.length}곳 · 사용자에게는 안 보여요. 지도는 이쪽의 장소를 표시해요. 점은 건물 참조 위치이고 근거 이름표는 확정이 아니에요.
        </p>
      )}
      <PlaceMap places={places} />
      {(page > 1 || hasMore) && <nav aria-label="장소 페이지" className="flex items-center justify-center gap-4 text-sm">
        {page > 1 && <Link href={pageHref(page - 1)} className="rounded-xl border border-line px-4 py-2">이전</Link>}
        <span>{page}쪽</span>
        {hasMore && <Link href={pageHref(page + 1)} className="rounded-xl border border-line px-4 py-2">다음</Link>}
      </nav>}
    </div>
  );
}
