import Link from 'next/link';
import type { ReactNode } from 'react';
import { RegionSelect } from '@/components/dugout/region-select';
import { CATEGORIES, CONDITIONS, REGIONS, filterHref, type ListingFilter } from '@/lib/market/specs';

/**
 * 장터 PC 왼쪽 거르기 판(2026-10-25 덕아웃 PC 개편, docs/designs/dugout-desktop-information-design.md) — 번개장터 · 당근처럼 왼쪽에 늘 보이는
 * 품목 목록 · 상태 · 거래 방법 · 지역(select). 조건은 모두 주소에(휴대폰 칩 · 품목 줄과 같은 주소) — 같은 화면에서 값만 바뀌니 굴린 자리를 지킨다.
 * 레슨 코치 목록의 왼쪽 판(lesson-filter-rail.tsx)과 같은 폭(216px) · 같은 묶음 모양.
 */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-line py-4 first:pt-0 last:border-b-0">
      <h3 className="text-[13px] font-bold text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Row({ href, on, children }: { href: string; on: boolean; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        data-nav="none"
        aria-current={on ? 'true' : undefined}
        className={`-mx-2 flex min-h-8 items-center rounded-md px-2 text-sm transition-colors ${
          on ? 'bg-ink/6 font-bold text-ink' : 'text-ink/80 hover:bg-ink/4 hover:text-ink'
        }`}
      >
        {children}
      </Link>
    </li>
  );
}

export function MarketFilterRail({ f }: { f: ListingFilter }) {
  const base = { ...f, page: 1 };
  const any = !!f.category || !!f.condition || !!f.region || !!f.all;
  const regionOptions = [
    { value: '', label: '지역 전체', href: filterHref({ ...base, region: undefined }) },
    ...REGIONS.map((r) => ({ value: r, label: r, href: filterHref({ ...base, region: r }) })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between pb-3">
        <p className="text-base font-black text-ink">필터</p>
        {any ? (
          <Link href={filterHref({ q: f.q, sort: f.sort })} scroll={false} data-nav="none" className="text-xs font-semibold text-sky">
            초기화
          </Link>
        ) : (
          <span className="text-xs text-muted/70">조건 없음</span>
        )}
      </div>

      <Group title="품목">
        <ul className="space-y-0.5">
          <Row href={filterHref({ ...base, category: undefined })} on={!f.category}>
            전체
          </Row>
          {CATEGORIES.map((c) => (
            <Row key={c.key} href={filterHref({ ...base, category: c.key })} on={f.category === c.key}>
              {c.label}
            </Row>
          ))}
        </ul>
      </Group>

      <Group title="상태">
        <ul className="space-y-0.5">
          {CONDITIONS.map((c) => (
            <Row
              key={c.key}
              href={filterHref({ ...base, condition: f.condition === c.key ? undefined : c.key })}
              on={f.condition === c.key}
            >
              {c.label}
            </Row>
          ))}
        </ul>
      </Group>

      <Group title="지역">
        <RegionSelect options={regionOptions} value={f.region ?? ''} className="w-full" />
      </Group>

      <Group title="보기">
        <ul className="space-y-0.5">
          <Row href={filterHref({ ...base, all: !f.all })} on={!!f.all}>
            거래 완료도 보기
          </Row>
        </ul>
      </Group>
    </div>
  );
}
