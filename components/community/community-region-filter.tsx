'use client';

import { useRouter } from 'next/navigation';
import { COMMUNITY_REGIONS } from '@/lib/community';
import { DISTRICTS } from '@/lib/kr-districts';

const SELECT = 'min-h-9 rounded-full border border-line bg-surface px-3 text-sm font-semibold text-ink';

/**
 * 우리 동네 거르기(번개 · 팀 홍보 · 선수 모집) — 시 · 도를 고르면 그 시 · 군 · 구도 고를 수 있다(위치 권한 없이).
 * hrefOf 대신 주소 틀을 받는다(서버에서 함수를 못 넘겨서). 시 · 도를 바꾸면 시 · 군 · 구는 비운다.
 */
export function CommunityRegionFilter({ base, region, district }: { base: string; region?: string; district?: string }) {
  const router = useRouter();
  const go = (r?: string, d?: string) => {
    const url = new URL(base, 'http://x');
    url.searchParams.delete('region');
    url.searchParams.delete('district');
    url.searchParams.delete('page');
    if (r) url.searchParams.set('region', r);
    if (r && d) url.searchParams.set('district', d);
    router.push(`${url.pathname}${url.search}`, { scroll: false });
  };
  const list = region ? (DISTRICTS[region] ?? []) : [];
  return (
    <span className="flex items-center gap-1.5">
      <select aria-label="지역" value={region ?? ''} onChange={(e) => go(e.target.value || undefined)} className={SELECT}>
        <option value="">전국</option>
        {COMMUNITY_REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {list.length > 1 && (
        <select aria-label="시 · 군 · 구" value={district ?? ''} onChange={(e) => go(region, e.target.value || undefined)} className={SELECT}>
          <option value="">{region} 전체</option>
          {list.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
