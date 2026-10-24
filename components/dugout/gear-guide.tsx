'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from '@/components/modal';
import {
  AGE_GROUPS,
  POSITIONS,
  isAgeKey,
  isPositionKey,
  recommend,
  shopSearchUrl,
  type AgeKey,
  type PositionKey,
} from '@/lib/market/gear';
import { filterHref } from '@/lib/market/specs';

/**
 * 장터의 '장비 추천' 팝업(2026-10-23 금윤호: "장비 기능은 따로 빠져 있을 필요가 없다. 장터 안에 녹여서 잘 모르는 사람만 추천을, 가볍게").
 * 장터 주소에 ?guide=1 이 붙으면 열린다 — 장터의 바로가기 · 품목 화면의 한 줄 · 홈의 카드 · 옛 /gear 주소가 모두 이 주소로 온다.
 * 나이대 · 포지션 · 던지는 손을 고르면 곧바로 밑에 다섯 가지(규격 · 까닭)가 뜨고, 줄마다 '장터에서 보기'(그 품목 목록) · '새 상품'(바깥 검색).
 * 고른 것은 이 기기에만 기억한다(다시 열면 그대로) — 막힌 창이면 그냥 빈 채로.
 */
const STORE_KEY = 'bullpen-gear-guide';
type Picks = { age: AgeKey | null; position: PositionKey | null; hand: 'R' | 'L' };

function readStored(): Picks | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Picks>;
    return {
      age: isAgeKey(v.age) ? v.age : null,
      position: isPositionKey(v.position) ? v.position : null,
      hand: v.hand === 'L' ? 'L' : 'R',
    };
  } catch {
    return null;
  }
}

/** 장터 주소에서 팝업만 여는 주소 — 지금 거르기는 그대로 둔다 */
export const GUIDE_PARAM = 'guide';

export function GearGuide() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const open = sp.get(GUIDE_PARAM) === '1';
  const [picks, setPicks] = useState<Picks>({ age: null, position: null, hand: 'R' });

  /* 열 때 — 주소로 온 값(옛 /gear 주소) → 이 기기에 기억한 값 차례로 */
  useEffect(() => {
    if (!open) return;
    const age = sp.get('age');
    const position = sp.get('position');
    const fromUrl: Picks | null =
      isAgeKey(age) || isPositionKey(position)
        ? {
            age: isAgeKey(age) ? age : null,
            position: isPositionKey(position) ? position : null,
            hand: sp.get('hand') === 'L' ? 'L' : 'R',
          }
        : null;
    const next = fromUrl ?? readStored();
    /* 이 기기의 저장값은 그린 뒤에야 안다(서버 그림과 어긋나지 않게) — 다음 틈에 채운다 */
    if (next) queueMicrotask(() => setPicks(next));
  }, [open, sp]);

  const set = (patch: Partial<Picks>) =>
    setPicks((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* 저장이 막힌 창 — 이번에만 */
      }
      return next;
    });

  const close = () => {
    const rest = new URLSearchParams(sp.toString());
    for (const k of [GUIDE_PARAM, 'age', 'position', 'hand']) rest.delete(k);
    const q = rest.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const result = picks.age && picks.position ? recommend(picks.age, picks.position, picks.hand) : null;
  const chip = (on: boolean) =>
    `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
      on ? 'bg-ink text-page' : 'border border-line text-ink hover:border-ink/40'
    }`;

  return (
    <Modal
      open={open}
      onClose={close}
      title="장비 추천"
      description="처음이라 무엇을 사야 할지 모르겠다면, 셋만 골라 주세요."
    >
      <div className="space-y-5">
        <Group label="나이대">
          {AGE_GROUPS.map((a) => (
            <button
              key={a.key}
              type="button"
              aria-pressed={picks.age === a.key}
              onClick={() => set({ age: a.key })}
              className={chip(picks.age === a.key)}
            >
              {a.label}
            </button>
          ))}
        </Group>
        <Group label="포지션">
          {POSITIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={picks.position === p.key}
              onClick={() => set({ position: p.key })}
              className={chip(picks.position === p.key)}
            >
              {p.label}
            </button>
          ))}
        </Group>
        <Group label="던지는 손">
          {(['R', 'L'] as const).map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={picks.hand === h}
              onClick={() => set({ hand: h })}
              className={chip(picks.hand === h)}
            >
              {h === 'R' ? '우투' : '좌투'}
            </button>
          ))}
        </Group>

        {result ? (
          <section aria-live="polite" className="space-y-2 motion-safe:animate-[launcher-in_220ms_ease-out]">
            <h3 className="text-sm font-bold text-ink">이렇게 사면 돼요</h3>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {result.map((g) => (
                <li key={g.item} className="space-y-1 px-4 py-3">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold text-ink">{g.item}</span>
                  </p>
                  <p className="text-sm text-ink">{g.spec}</p>
                  <p className="text-xs text-muted">{g.why}</p>
                  <p className="flex flex-wrap gap-4 pt-1 text-xs font-semibold">
                    <Link href={filterHref({ category: g.category })} className="text-sky">
                      장터에서 보기 ›
                    </Link>
                    <a
                      href={shopSearchUrl(g.query)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-ink"
                    >
                      새 상품 검색 ↗
                    </a>
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">규격은 흔히 쓰는 기준이에요. 리그 · 구장 규정이 있으면 그것을 따라 주세요.</p>
          </section>
        ) : (
          <p className="rounded-xl bg-ink/4 px-4 py-3 text-sm text-muted">
            나이대와 포지션을 고르면 바로 밑에 추천이 떠요.
          </p>
        )}
      </div>
    </Modal>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}
