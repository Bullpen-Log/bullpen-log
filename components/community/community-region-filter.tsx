'use client';

import { useRouter } from 'next/navigation';
import { COMMUNITY_REGIONS } from '@/lib/community';

/** 우리 동네 거르기(번개 · 팀 홍보 · 선수 모집) — 고르면 그 시 · 도 글만. hrefOf 대신 주소 틀을 받는다(서버에서 함수를 못 넘겨서) */
export function CommunityRegionFilter({ base, region }: { base: string; region?: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="지역"
      value={region ?? ''}
      onChange={(e) => {
        const url = new URL(base, 'http://x');
        if (e.target.value) url.searchParams.set('region', e.target.value);
        else url.searchParams.delete('region');
        router.push(`${url.pathname}${url.search}`, { scroll: false });
      }}
      className="min-h-9 rounded-full border border-line bg-surface px-3 text-sm font-semibold text-ink"
    >
      <option value="">전국</option>
      {COMMUNITY_REGIONS.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
