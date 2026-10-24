import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  AUDIENCES,
  PREFS,
  SPECIALTIES,
  TIME_BANDS,
  WHEN_OPTIONS,
  listHref,
} from '@/lib/market/lessons';
import { REGIONS } from '@/lib/market/specs';

/**
 * 코치 목록 PC 왼쪽 거르기 판(2026-10-24) — 숨고 · 에어비앤비처럼 늘 보이는 조건 판. 조건은 모두 주소에(휴대폰 칩 줄과 같은 주소),
 * 누르면 그 조건이 켜지고 다시 누르면 꺼진다. 같은 화면에서 값만 바뀌니 굴린 자리를 지킨다(scroll={false} · data-nav="none").
 * 묶음은 접을 수 있다(<details>). 선호는 여러 개를 고른다. 가격 범위는 목록 읽기가 아직 거르지 않아 '가격 낮은순' 정렬로 대신한다.
 */
export type ListQuery = {
  specialty?: string;
  audience?: string;
  when?: string;
  band?: string;
  region?: string;
  q?: string;
  prefs?: string;
  sort?: string;
};

function Group({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line py-3 last:border-b-0 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-ink">
        {title}
        <span aria-hidden className="text-xs text-muted transition-transform duration-200 group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="pt-2.5">{children}</div>
    </details>
  );
}

function Opt({ href, on, children }: { href: string; on: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      data-nav="none"
      aria-current={on ? 'true' : undefined}
      className={`inline-flex min-h-8 items-center justify-center rounded-lg px-2.5 text-xs font-semibold transition-colors ${
        on ? 'bg-ink text-page' : 'bg-ink/5 text-ink hover:bg-ink/10'
      }`}
    >
      {children}
    </Link>
  );
}

export function LessonFilterRail({ current, prefs }: { current: ListQuery; prefs: string[] }) {
  const set = (key: keyof ListQuery, value: string) =>
    listHref({ ...current, [key]: current[key] === value ? undefined : value });
  const togglePref = (key: string) => {
    const next = prefs.includes(key) ? prefs.filter((p) => p !== key) : [...prefs, key];
    return listHref({ ...current, prefs: next.length ? next.join(',') : undefined });
  };
  const any =
    !!current.specialty || !!current.audience || !!current.when || !!current.band || !!current.region || !!current.q || prefs.length > 0;

  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-1">
      <div className="flex items-center justify-between border-b border-line py-3">
        <p className="text-sm font-black text-ink">필터</p>
        {any ? (
          <Link href="/lessons/list" scroll={false} data-nav="none" className="text-xs font-semibold text-sky">
            필터 초기화
          </Link>
        ) : (
          <span className="text-xs text-muted/70">조건 없음</span>
        )}
      </div>

      <Group title="종목">
        <div className="grid grid-cols-2 gap-1.5">
          {SPECIALTIES.map((s) => (
            <Opt key={s.key} href={set('specialty', s.key)} on={current.specialty === s.key}>
              {s.label}
            </Opt>
          ))}
        </div>
      </Group>

      <Group title="누가 받나요">
        <div className="grid grid-cols-2 gap-1.5">
          {AUDIENCES.map((a) => (
            <Opt key={a.key} href={set('audience', a.key)} on={current.audience === a.key}>
              {a.label}
            </Opt>
          ))}
        </div>
      </Group>

      <Group title="언제">
        <div className="grid grid-cols-2 gap-1.5">
          {WHEN_OPTIONS.filter((w) => w.key !== 'any').map((w) => (
            <Opt key={w.key} href={set('when', w.key)} on={current.when === w.key}>
              {w.label}
            </Opt>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {TIME_BANDS.map((b) => (
            <Opt key={b.key} href={set('band', b.key)} on={current.band === b.key}>
              {b.label}
            </Opt>
          ))}
        </div>
      </Group>

      <Group title="지역" open={!!current.region}>
        <div className="grid grid-cols-3 gap-1.5">
          {REGIONS.filter((r) => r !== '전국(택배)').map((r) => (
            <Opt key={r} href={set('region', r)} on={current.region === r}>
              {r}
            </Opt>
          ))}
        </div>
      </Group>

      <Group title="선호">
        <ul className="space-y-1">
          {PREFS.map((p) => {
            const on = prefs.includes(p.key);
            return (
              <li key={p.key}>
                <Link
                  href={togglePref(p.key)}
                  scroll={false}
                  data-nav="none"
                  aria-current={on ? 'true' : undefined}
                  className="flex min-h-9 items-center gap-2.5 rounded-lg px-1.5 text-xs text-ink transition-colors hover:bg-ink/4"
                >
                  <span
                    aria-hidden
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] leading-none transition-colors ${
                      on ? 'border-sky bg-sky text-white' : 'border-line bg-surface text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.label}</span>
                    <span className="block text-[11px] text-muted">{p.hint}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Group>
    </div>
  );
}
