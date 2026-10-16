'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from '@/components/icon';
import { Expand } from '@/components/expand';

/**
 * 겉은 한 줄, 누르면 자세히 — 카드 안의 긴 설명을 접어 두는 줄(2026-10-16 UI 검토, 사용자 규칙 '글은 한두 줄 · 자세한 건 눌러서').
 * 글을 지우지 않고 '자세히' 뒤로 옮긴다. 경고 카드 안에서는 tone="warn" 으로 글자색을 카드에 맞춘다.
 */
export function FoldNote({
  children,
  label = '자세히',
  tone = 'sky',
}: {
  children: ReactNode;
  label?: string;
  tone?: 'sky' | 'warn' | 'muted';
}) {
  const [open, setOpen] = useState(false);
  const color =
    tone === 'warn' ? 'text-warn' : tone === 'muted' ? 'text-muted' : 'text-sky-strong';
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`-mx-1 inline-flex min-h-11 items-center gap-1 px-1 text-footnote font-semibold ${color}`}
      >
        {open ? '접기' : label}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <Expand open={open}>
        <div className="space-y-2 pb-1">{children}</div>
      </Expand>
    </div>
  );
}
