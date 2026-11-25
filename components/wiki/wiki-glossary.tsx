'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft } from '@/components/icon';
import { Modal } from '@/components/modal';
import { WIKI_TEXT, wikiHref, wikiStack, type WikiStackEntry } from '@/lib/wiki';
import { useWiki } from '@/lib/wiki/context';
import { ArticleBody, ArticleChips, KeyPoints, WIKI_READING_SIZE } from './article-body';
import { GlossaryOpenProvider } from './wiki-prose';

/**
 * 싱커위키 뜻 창 — 본문 낱말을 누르면 짧은 뜻 → '자세히 읽기'로 같은 창 안에서 전체 글. 창을 닫으면 누른 낱말로 초점이 돌아간다.
 *
 * 창은 화면 위에만 뜬다 — 주소 · 페이지를 바꾸지 않아서 아래의 운동 화면(입력하던 값 · 쉬는 시계 · 영상 · 굴린 자리)이 그대로 남는다.
 * 브라우저 '뒤로'는 창부터 닫는다: 열 때 같은 주소로 기록 한 칸을 넣고(검색처럼 여러 칸을 쌓지 않음), 그 칸이 빠지면 닫는다.
 * Esc 와 창 밖 누름(배경에서 누르고 뗀 것만)은 공통 Modal(<dialog>)이 맡는다.
 */

export function WikiGlossary({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<WikiStackEntry[]>([]);
  const origin = useRef<HTMLElement | null>(null);
  const pushedHistory = useRef(false);
  const open = stack.length > 0;
  const top = stack[stack.length - 1];

  const restoreFocus = useCallback(() => {
    const el = origin.current;
    origin.current = null;
    /* 닫히는 움직임 뒤 — 그 사이 다른 곳을 눌렀으면 빼앗지 않는다 */
    if (el && el.isConnected) requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }, []);

  const close = useCallback(() => {
    setStack((s) => wikiStack(s, { type: 'close' }));
    restoreFocus();
    if (pushedHistory.current) {
      pushedHistory.current = false;
      /* 넣어 둔 기록 칸을 뺀다 — popstate 는 아래에서 '이미 닫힘'으로 지나간다 */
      window.history.back();
    }
  }, [restoreFocus]);

  const openTerm = useCallback((id: string, from: HTMLElement) => {
    origin.current = from;
    setStack((s) => wikiStack(s, { type: 'open', id }));
    if (!pushedHistory.current) {
      pushedHistory.current = true;
      window.history.pushState(window.history.state, '', window.location.href);
    }
  }, []);

  useEffect(() => {
    const onPop = () => {
      if (!pushedHistory.current) return;
      pushedHistory.current = false;
      setStack((s) => wikiStack(s, { type: 'close' }));
      restoreFocus();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [restoreFocus]);

  const go = (id: string) => setStack((s) => wikiStack(s, { type: 'go', id }));
  const expand = () => setStack((s) => wikiStack(s, { type: 'expand' }));
  const back = () => setStack((s) => wikiStack(s, { type: 'back' }));

  const { wikiById } = useWiki();
  const article = top ? wikiById(top.id) : undefined;
  const prev = stack.length > 1 ? wikiById(stack[stack.length - 2].id) : undefined;

  /*
   * 창 안에서 보기가 바뀌면(자세히 · 이어진 글 · 이전) 맨 위부터 — 짧은 뜻에서 '자세히 읽기'를 누른 자리만큼 굴린 채
   * 전체 글이 열려 첫머리가 가려졌다(320px · 글자 200%). 누른 단추가 사라지므로 초점도 새 글 첫머리로 옮긴다.
   * 처음 열 때는 공통 Modal(<dialog>)이 초점을 둔다.
   */
  const content = useRef<HTMLDivElement>(null);
  const viewKey = top ? `${stack.length}:${top.id}:${top.view}` : '';
  const shownKey = useRef('');
  useEffect(() => {
    const before = shownKey.current;
    shownKey.current = viewKey;
    if (!viewKey || !before) return;
    const el = content.current;
    if (!el) return;
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.scrollHeight > p.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) {
        p.scrollTop = 0;
        break;
      }
      if (p.tagName === 'DIALOG') break;
    }
    el.focus({ preventScroll: true });
  }, [viewKey]);

  return (
    <GlossaryOpenProvider open={openTerm}>
      {children}
      <Modal open={open} onClose={close} title={article ? article.title : WIKI_TEXT.unknownTitle} size={top?.view === 'full' ? 'wide' : 'default'}>
        {/* 창 안의 낱말 단추는 같은 창에서 이어 연다(창 위에 창을 겹치지 않음) */}
        <GlossaryOpenProvider open={(id) => go(id)}>
          <div ref={content} tabIndex={-1} className={`space-y-5 outline-none ${WIKI_READING_SIZE}`} data-wiki-dialog="">
            {prev ? (
              <button type="button" onClick={back} aria-label={`이전 글 ${prev.title}(으)로 돌아가기`} className="-ml-1 inline-flex min-h-10 items-center gap-1 rounded-full px-1 text-sm text-link">
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {WIKI_TEXT.previous(prev.title)}
              </button>
            ) : null}
            {!article ? (
              <p className="text-base leading-relaxed text-ink">{WIKI_TEXT.unknownBody}</p>
            ) : top.view === 'brief' ? (
              <div className="space-y-4">
                {/* 짧은 뜻은 정말 짧게(R1): 묶음 · 꼬리표, 한 줄 뜻, 꼭 알아둘 점 */}
                <ArticleChips article={article} />
                <p data-wiki-reading="" className="text-lg leading-relaxed text-ink">{article.summary}</p>
                <KeyPoints article={article} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={expand} className="inline-flex min-h-11 items-center rounded-full bg-sky px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky">
                    {WIKI_TEXT.readMore}
                  </button>
                  <button type="button" onClick={close} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm text-ink">
                    {WIKI_TEXT.close}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <ArticleBody article={article} nav={{ kind: 'dialog', onOpen: go }} />
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <button type="button" onClick={close} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm text-ink">
                    {WIKI_TEXT.closeBack}
                  </button>
                  <Link href={wikiHref(article.slug)} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-link">
                    {WIKI_TEXT.openNewWindow}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </GlossaryOpenProvider>
      </Modal>
    </GlossaryOpenProvider>
  );
}
