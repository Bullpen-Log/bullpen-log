'use client';

import { useRouter } from 'next/navigation';

/**
 * 지역 고르기(2026-10-25 덕아웃 PC 개편) — 열여덟 지역을 칩 열여덟 개로 펴던 것을 작은 select 하나로. 고르면 그 주소로 바로(굴린 자리 그대로).
 * 값마다 주소를 서버가 만들어 넘긴다(`options[].href`) — 이 부품은 고른 것을 그 주소로 옮길 뿐 거르기 규칙을 모른다.
 */
export function RegionSelect({
  options,
  value,
  label = '지역',
  className = '',
}: {
  options: { value: string; label: string; href: string }[];
  value: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => {
        const o = options.find((x) => x.value === e.target.value);
        if (o) router.push(o.href, { scroll: false });
      }}
      className={`h-9 appearance-none rounded-lg border border-line bg-surface pr-8 pl-3 text-[13px] font-semibold text-ink bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-[length:12px_12px] bg-[position:right_0.65rem_center] bg-no-repeat focus:ring-2 focus:ring-sky focus:outline-none ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
