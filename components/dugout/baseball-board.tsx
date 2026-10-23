'use client';

import { useState } from 'react';
import type { Game, LeagueBoard, NewsItem } from '@/lib/baseball-feed';

/**
 * 덕아웃 홈의 '야구 소식'(2026-10-23 금윤호: "야구 소식, 경기 결과, 야구 뉴스") — 왼쪽 경기 결과 · 일정(KBO | MLB 탭), 오른쪽 야구 뉴스.
 * 자료는 서버(lib/baseball-feed.ts)가 읽어 넘기고, 여기는 탭만 쥔다. 뉴스 시각 글('3시간 전')은 서버가 만들어 넘긴다(수화 때 어긋나지 않게).
 * 이긴 팀은 굵게, 진 팀은 옅게. 엠블럼 그림은 안 쓴다(팀 이름 첫 글자 원).
 */
export type NewsRow = NewsItem & { ago: string };

const LEAGUE_LABEL = { kbo: 'KBO', mlb: 'MLB' } as const;

function dayLabel(date: string, today: string): string {
  if (date === today) return '오늘';
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8));
  return `${m}/${d}`;
}

function Team({ name, score, win, lose }: { name: string; score: number | null; win: boolean; lose: boolean }) {
  return (
    <span className={`flex min-w-0 items-center gap-2 ${lose ? 'text-muted' : 'text-ink'}`}>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink/6 text-[11px] font-bold">
        {name.slice(0, 1)}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[14px] ${win ? 'font-bold' : 'font-medium'}`}>{name}</span>
      {score != null && (
        <span className={`text-[16px] tabular-nums ${win ? 'font-black' : 'font-semibold'}`}>{score}</span>
      )}
    </span>
  );
}

function GameCard({ g, today }: { g: Game; today: string }) {
  const live = g.status === 'live';
  return (
    <li className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
        <span>{dayLabel(g.date, today)}</span>
        <span>·</span>
        <span>{g.status === 'before' || g.status === 'cancel' ? g.time : (g.info || '종료')}</span>
        {live && <span className="rounded-full bg-danger px-1.5 py-px text-[10px] font-bold text-white">진행 중</span>}
        {g.status === 'cancel' && <span className="font-semibold text-warn">{g.info || '취소'}</span>}
      </p>
      <div className="space-y-1.5">
        <Team name={g.away.name} score={g.away.score} win={g.winner === 'away'} lose={g.winner === 'home'} />
        <Team name={g.home.name} score={g.home.score} win={g.winner === 'home'} lose={g.winner === 'away'} />
      </div>
    </li>
  );
}

export function BaseballBoard({
  boards,
  news,
  today,
}: {
  boards: LeagueBoard[];
  news: NewsRow[] | null;
  today: string;
}) {
  const [tab, setTab] = useState(0);
  const board = boards[tab];
  const hasGames = boards.some((b) => b.recent.length + b.upcoming.length > 0);
  if (!hasGames && (!news || news.length === 0)) return null;

  return (
    <section className="space-y-4" aria-label="야구 소식">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">오늘의 야구</p>
          <h2 className="mt-0.5 text-xl font-bold text-ink">경기 결과 · 야구 뉴스</h2>
        </div>
      </div>
      <div className={`grid gap-8 ${news && news.length > 0 ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
        {hasGames && (
          <div className="space-y-3">
            <div role="tablist" aria-label="리그" className="flex gap-2">
              {boards.map((b, n) => (
                <button
                  key={b.league}
                  type="button"
                  role="tab"
                  aria-selected={n === tab}
                  onClick={() => setTab(n)}
                  className={`inline-flex min-h-9 items-center rounded-full px-4 text-[13px] font-semibold transition-colors ${
                    n === tab ? 'bg-ink text-page' : 'border border-line text-ink hover:border-ink/40'
                  }`}
                >
                  {LEAGUE_LABEL[b.league]}
                </button>
              ))}
            </div>
            {board.recent.length + board.upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                {LEAGUE_LABEL[board.league]} 경기 일정이 없어요
              </p>
            ) : (
              <div className={`grid gap-3 sm:grid-cols-2 ${news && news.length > 0 ? '' : 'md:gap-6'}`}>
                {board.upcoming.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted">진행 · 예정</p>
                    <ul className="space-y-2">
                      {board.upcoming.slice(0, 3).map((g) => (
                        <GameCard key={g.id} g={g} today={today} />
                      ))}
                    </ul>
                  </div>
                )}
                {board.recent.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted">최근 결과</p>
                    <ul className="space-y-2">
                      {board.recent.slice(0, 3).map((g) => (
                        <GameCard key={g.id} g={g} today={today} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {news && news.length > 0 && (
          <div className={hasGames ? '' : 'md:col-span-2'}>
            <p className="mb-2 text-xs font-semibold text-muted">야구 뉴스</p>
            <ol className="divide-y divide-line border-y border-line">
              {news.slice(0, 6).map((n) => (
                <li key={n.url}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block py-3 transition-colors hover:bg-ink/3"
                  >
                    <span className="line-clamp-2 text-[14px] leading-snug font-semibold break-keep text-ink">
                      {n.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {n.source}
                      {n.source && ' · '}
                      {n.ago}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
