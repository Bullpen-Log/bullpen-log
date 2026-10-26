import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeading } from '@/components/ui';
import { PlaceMap } from '@/components/dugout/place-map';
import { CANDIDATE_FLAGS, candidateMapPlaces, loadCandidates } from '@/lib/market/candidate-load';

export const metadata: Metadata = { title: '레슨 · 연습장 수집 후보' };

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim().slice(0, 40);

/**
 * 덕아웃 레슨 · 연습장 수집 후보(2026-10-26 김민, 대표관리자만) — 공공자료 · 지도 대조로 모은 미확인 후보를 지도 · 목록으로 관리.
 * 업체 동의 · 정보 확인 · 관리자 승인 전에는 일반 사용자에게 보이지 않는다(공개 지도 /venues 와 다른 표). 거르기 · 검색은 주소에(?q=&region=&flag=).
 */
export default async function AdminPlacesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = one(sp.q) || undefined;
  const region = one(sp.region) || undefined;
  const rawFlag = one(sp.flag);
  const flag = CANDIDATE_FLAGS.some((f) => f.key === rawFlag) ? rawFlag : undefined;
  const { items, regions, total, contacted, agreed } = await loadCandidates({ q, region, flag });

  const href = (o: { region?: string; flag?: string }) => {
    const s = new URLSearchParams(Object.entries({ q, region, flag, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/manage/places${s.size ? `?${s}` : ''}`;
  };
  const places = candidateMapPlaces(items);
  const chip = (on: boolean) =>
    `inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-sm ${on ? 'border-ink bg-ink font-semibold text-page' : 'border-line text-ink hover:border-ink/30'}`;

  return (
    <div className="stack-page">
      <PageHeading
        kicker="관리자"
        title="레슨 · 연습장 수집 후보"
        description={`전체 ${total} · 연락 ${contacted} · 동의 ${agreed} — 공공자료 · 지도 대조로 모은 미확인 후보예요. 동의 · 확인 · 승인 전에는 사용자에게 안 보여요.`}
      />
      <form method="get" action="/manage/places" className="flex flex-wrap gap-2">
        {region && <input type="hidden" name="region" value={region} />}
        {flag && <input type="hidden" name="flag" value={flag} />}
        <input
          name="q"
          type="search"
          defaultValue={q ?? ''}
          placeholder="이름 · 주소 · 구"
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-sm text-ink focus:border-sky focus:outline-none sm:max-w-xs"
        />
        <select
          name="region"
          defaultValue={region ?? ''}
          aria-label="지역"
          className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        >
          <option value="">모든 지역</option>
          {regions.map((r) => (
            <option key={r.region} value={r.region}>
              {r.region} {r.count}
            </option>
          ))}
        </select>
        <button type="submit" className="min-h-10 rounded-xl bg-ink px-4 text-sm font-bold text-page">
          찾기
        </button>
      </form>
      <nav aria-label="거르기" className="-mx-1 flex gap-2 overflow-x-auto px-1">
        <Link href={href({ flag: undefined })} className={chip(!flag)} data-nav="none" scroll={false}>
          전체
        </Link>
        {CANDIDATE_FLAGS.map((f) => (
          <Link key={f.key} href={href({ flag: f.key })} className={chip(flag === f.key)} data-nav="none" scroll={false}>
            {f.label}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-muted">
        {items.length}곳{items.length === 500 ? '(500곳까지만 보여요 — 지역이나 검색으로 좁혀 주세요)' : ''} · 점 색은 분류 단서(보라 레슨 · 초록 배팅 · 연습공간)이고 서비스 확정이 아니에요.
      </p>
      <PlaceMap places={places} />
    </div>
  );
}
