'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore, useTransition } from 'react';
import { Bookmark, BookmarkCheck } from '@/components/icon';
import { SectionHead } from '@/components/dugout/ui';
import { setSaved } from '@/app/actions/community';
import { orOffline } from '@/lib/action-offline';
import { haptic } from '@/lib/haptics';
import type { FeedCard } from '@/lib/sinker-dugout-feed';

type Sort = 'hot' | 'new';
/** 고른 정렬 — 이 기기의 이 창(탭)에서만 기억한다(글에서 돌아와도 그대로, 앱을 다시 켜면 인기글부터) */
const SORT_KEY = 'bullpen-sinker-dugout-sort';
const TABS: { key: Sort; label: string; note: string }[] = [
  { key: 'hot', label: '인기글', note: '최근 7일' },
  { key: 'new', label: '최신글', note: '등록순' },
];
const SORT_EVENT = 'bullpen-sinker-dugout-sort';
/* 저장소를 못 쓰는 창(막힌 사이트 데이터)에서도 고른 것이 그 화면 동안은 선다 */
let memSort: Sort = 'hot';
const readSort = (): Sort => {
  try {
    const v = sessionStorage.getItem(SORT_KEY);
    return v === 'new' || v === 'hot' ? v : memSort;
  } catch {
    return memSort;
  }
};
function writeSort(s: Sort) {
  memSort = s;
  try {
    sessionStorage.setItem(SORT_KEY, s);
  } catch {}
  window.dispatchEvent(new Event(SORT_EVENT));
}
const subscribeSort = (cb: () => void) => {
  window.addEventListener(SORT_EVENT, cb);
  return () => window.removeEventListener(SORT_EVENT, cb);
};

/**
 * 커뮤니티 — 인기글(기본) / 최신글, 글 카드 둘, 전체 보기(2026-10-27 승인 시안).
 * 두 목록은 서버가 이미 따로 읽어 왔다(lib/sinker-dugout-load.ts loadSinkerCommunity) — 바꿔도 다시 받지 않아 앞 탭의 글이 다른 탭 결과처럼 섞이지 않고,
 * 한쪽만 못 읽었으면 그쪽만 '못 불러왔어요'. 인기는 '최근 7일에 쓴 글을 좋아요 순'이라 설명도 '최근 7일'(받은 반응 수가 아니다).
 * 카드는 통째 단추가 아니다 — 제목 · 행동 링크와 저장 단추를 따로 둔다(단추 안에 단추를 넣지 않는다).
 */
export function SinkerCommunity({ hot, latest, loggedIn }: { hot: FeedCard[] | null; latest: FeedCard[] | null; loggedIn: boolean }) {
  /* 서버 그림은 인기글, 붙은 뒤 이 창에서 고른 것이 있으면 그것 */
  const sort = useSyncExternalStore(subscribeSort, readSort, () => 'hot' as Sort);
  /* 저장은 글마다 · 사람마다 — 인기 · 최신 두 목록에 같은 글이 있어도 한 값 */
  const [saved, setSavedMap] = useState<Record<string, boolean>>({});
  const choose = writeSort;
  const list = sort === 'hot' ? hot : latest;
  const all = sort === 'hot' ? '/community?sort=hot&period=7d' : '/community';
  const write = loggedIn ? '/community/new' : `/login?next=${encodeURIComponent('/community/new')}`;

  return (
    <section className="space-y-3" aria-labelledby="sinker-community-title">
      <SectionHead
        title={<span id="sinker-community-title">커뮤니티</span>}
        action={
          <Link href={all} className="-my-2.5 shrink-0 py-2.5 text-[15px] text-sky">
            전체 보기
          </Link>
        }
      />
      <div className="flex items-end justify-between border-b border-line">
        <div role="tablist" aria-label="커뮤니티 정렬" className="flex gap-4">
          {TABS.map((t) => {
            const on = sort === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`sinker-tab-${t.key}`}
                aria-selected={on}
                aria-controls="sinker-community-panel"
                onClick={() => choose(t.key)}
                className={`relative -mb-px min-h-11 px-0.5 text-[15px] transition-colors duration-200 ${on ? 'font-bold text-sky' : 'font-semibold text-muted'}`}
              >
                {t.label}
                <span
                  aria-hidden
                  className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-sky transition-opacity duration-200 ${on ? 'opacity-100' : 'opacity-0'}`}
                />
              </button>
            );
          })}
        </div>
        <span className="pb-3 text-[13px] text-muted">{TABS.find((t) => t.key === sort)?.note}</span>
      </div>
      <div id="sinker-community-panel" role="tabpanel" aria-labelledby={`sinker-tab-${sort}`} className="space-y-3">
        {list === null ? (
          <Empty text="글을 불러오지 못했어요. 아래로 당겨 다시 받아 주세요." action={<TextLink href={all}>목록 열기</TextLink>} />
        ) : list.length === 0 ? (
          sort === 'hot' ? (
            <Empty
              text="최근 7일 인기글이 없어요."
              action={
                <button type="button" onClick={() => choose('new')} className="min-h-11 shrink-0 text-[15px] font-semibold text-sky">
                  최신글 보기
                </button>
              }
            />
          ) : (
            <Empty text="아직 올라온 글이 없어요. 첫 글을 남겨 봐요." action={<TextLink href={write}>글쓰기</TextLink>} />
          )
        ) : (
          list.map((c) => (
            <PostCard
              key={c.id}
              c={c}
              saved={saved[c.id] ?? c.saved}
              onSaved={(v) => setSavedMap((m) => ({ ...m, [c.id]: v }))}
              loggedIn={loggedIn}
            />
          ))
        )}
      </div>
    </section>
  );
}

function PostCard({ c, saved, onSaved, loggedIn }: { c: FeedCard; saved: boolean; onSaved: (v: boolean) => void; loggedIn: boolean }) {
  return (
    <article className="space-y-2.5 rounded-[20px] bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-sky-tint px-2 py-0.5 text-[12px] font-semibold text-sky-strong">{c.label}</span>
        {c.meta && <span className="shrink-0 text-[13px] text-muted">{c.meta}</span>}
      </div>
      <h3 className="text-[17px] leading-snug font-bold text-ink">
        <Link href={`/community/${c.id}`} className="line-clamp-2 active:opacity-70">
          {c.title}
        </Link>
      </h3>
      {c.answer ? (
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <p className="text-[12px] text-muted">
            <span aria-hidden className="mr-1 text-sky">↳</span>
            {c.answer.accepted ? `채택한 답변 · ${c.answer.nickname}` : `${c.answer.nickname}의 답변`}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[14px] text-ink">{c.answer.body}</p>
        </div>
      ) : (
        c.body && <p className="line-clamp-2 text-[14px] leading-relaxed text-muted">{c.body}</p>
      )}
      <div className="flex items-center gap-2 pt-0.5">
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted">
          {c.author.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
          {c.author} · {c.ago}
        </span>
        <SaveButton id={c.id} title={c.title} saved={saved} onSaved={onSaved} loggedIn={loggedIn} />
        <Link href={c.cta.href} className="flex min-h-11 shrink-0 items-center gap-1 text-[14px] font-semibold text-sky">
          {c.cta.label}
          <span aria-hidden>↗</span>
        </Link>
      </div>
    </article>
  );
}

/**
 * 저장 — 이 글 · 이 사람의 실제 저장(CommunitySave). 서버가 받은 뒤에 바뀐다(누르는 동안 흐려짐, 끊기면 그대로).
 * 로그인 안 했으면 로그인 뒤 이 화면으로.
 */
function SaveButton({ id, title, saved, onSaved, loggedIn }: { id: string; title: string; saved: boolean; onSaved: (v: boolean) => void; loggedIn: boolean }) {
  const [pending, start] = useTransition();
  const cls = 'grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors active:bg-ink/6';
  if (!loggedIn)
    return (
      <Link href={`/login?next=${encodeURIComponent('/?dugout=1')}`} aria-label={`로그인하고 ${title} 저장`} className={`${cls} text-muted`}>
        <Bookmark aria-hidden className="h-5 w-5" />
      </Link>
    );
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `${title} 저장 풀기` : `${title} 저장`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set('postId', id);
          fd.set('saved', saved ? '0' : '1');
          const ok = await orOffline(setSaved(fd).then(() => true), false);
          if (ok) {
            haptic('light');
            onSaved(!saved);
          }
        })
      }
      className={`${cls} ${saved ? 'text-sky' : 'text-muted'} disabled:opacity-50`}
    >
      {saved ? <BookmarkCheck aria-hidden className="h-5 w-5" /> : <Bookmark aria-hidden className="h-5 w-5" />}
    </button>
  );
}

function Empty({ text, action }: { text: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[20px] bg-surface px-4 py-4">
      <p className="min-w-0 text-[15px] text-muted">{text}</p>
      {action}
    </div>
  );
}

function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-11 shrink-0 items-center text-[15px] font-semibold text-sky">
      {children}
    </Link>
  );
}
