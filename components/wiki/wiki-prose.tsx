'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { MatchOptions } from '@/lib/wiki';
import { useOptionalWiki } from '@/lib/wiki/context';

/**
 * 정해 둔 설명 글 한 덩어리에서 싱커위키 낱말을 단추로 바꿔 보인다 — 화면 전체를 훑거나 HTML 을 바꾸지 않는다.
 * 원문 글자는 그대로(조각을 이으면 같은 글), 낱말만 밑줄 단추가 된다. 단추를 누르면 가까운 WikiGlossary 가 뜻 창을 연다.
 * 단추 · 입력칸 · 링크 · 숫자 칸 안에는 쓰지 않는다(이 부품을 그런 곳에 넣지 않는 것이 규칙).
 */

export type GlossaryOpen = (id: string, from: HTMLElement) => void;

const GlossaryContext = createContext<GlossaryOpen | null>(null);

export function GlossaryOpenProvider({ open, children }: { open: GlossaryOpen; children: ReactNode }) {
  return <GlossaryContext.Provider value={open}>{children}</GlossaryContext.Provider>;
}

/** 뜻 창을 여는 함수 — 위키 창 밖이면 null(그때는 낱말을 글자로만 보인다) */
export function useGlossaryOpen() {
  return useContext(GlossaryContext);
}

export function WikiProse({ text, options, className }: { text: string; options?: MatchOptions; className?: string }) {
  const open = useGlossaryOpen();
  const wiki = useOptionalWiki();
  if (!open || !wiki) return <span className={className}>{text}</span>;
  const segments = wiki.matchWikiProse(text, options);
  return (
    <span className={className}>
      {segments.map((s, i) =>
        s.id ? (
          <button
            key={i}
            type="button"
            data-wiki-term={s.id}
            aria-haspopup="dialog"
            aria-label={`${s.text} 뜻 보기`}
            onClick={(e) => open(s.id, e.currentTarget)}
            className="inline cursor-pointer rounded-sm px-0 text-left font-[inherit] text-[length:inherit] leading-[inherit] text-inherit underline decoration-sky/70 decoration-dotted decoration-2 underline-offset-[3px] hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
          >
            {s.text}
          </button>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}
