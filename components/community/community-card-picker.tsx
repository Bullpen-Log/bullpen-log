'use client';

import { useState } from 'react';
import { X } from '@/components/icon';
import type { CardOption } from '@/lib/community-cards';

/**
 * 글쓰기의 '싱커 기록 붙이기' — 내 최근 기록(구속 측정 · 투구 기록 · 3D 분석) 하나를 고른다. 폼에는 ref 만 싣고(name="card"),
 * 카드는 서버가 내 기록에서 다시 만든다(lib/community-cards.ts buildCard). 숫자 숨기기는 name="cardHide".
 */
export function CommunityCardPicker({
  options,
  initialRef,
  onPick,
}: {
  options: CardOption[];
  initialRef?: string;
  /** 고르거나 뺄 때 — 폼이 말머리를 '내 기록'으로 맞춘다 */
  onPick?: (ref: string | null) => void;
}) {
  const [picked, setPicked] = useState(options.find((o) => o.ref === initialRef)?.ref ?? null);
  const [open, setOpen] = useState(false);
  const [hide, setHide] = useState(false);
  const chosen = options.find((o) => o.ref === picked);
  const numbers = chosen && !chosen.ref.startsWith('lab:');

  function choose(ref: string | null) {
    setPicked(ref);
    setOpen(false);
    onPick?.(ref);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="block text-xs font-medium text-muted">
        싱커 기록 <span className="text-muted/70">구속 · 투구 · 3D 분석을 카드로 붙여요</span>
      </legend>
      {chosen ? (
        <div className="space-y-2 rounded-2xl border border-sky-soft/60 bg-sky-tint/40 px-4 py-3">
          <input type="hidden" name="card" value={chosen.ref} />
          {numbers && hide && <input type="hidden" name="cardHide" value="1" />}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{chosen.title}</p>
              <p className="text-xs text-muted">{hide && numbers ? '숫자는 가려요' : chosen.detail}</p>
            </div>
            <button
              type="button"
              aria-label="기록 빼기"
              onClick={() => choose(null)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {numbers && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
              숫자 숨기기(구속 · 투구 수)
            </label>
          )}
        </div>
      ) : options.length === 0 ? (
        <p className="text-xs text-muted">싱커에서 구속 · 투구를 기록하면 여기에 붙일 수 있어요.</p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex min-h-10 items-center rounded-full bg-ink/6 px-4 text-sm font-semibold text-ink hover:text-sky desk:bg-surface-2"
        >
          싱커 기록 붙이기
        </button>
      )}
      {open && !chosen && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {options.map((o) => (
            <li key={o.ref}>
              <button
                type="button"
                onClick={() => choose(o.ref)}
                className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-surface-2"
              >
                <span className="text-sm font-semibold text-ink">{o.title}</span>
                <span className="text-xs text-muted">{o.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
