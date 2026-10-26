'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Game, League } from '@/lib/baseball-feed';
import { GameRow, dayName } from '@/components/dugout/game-parts';

/**
 * 홈 오른쪽의 작은 경기 칸(2026-10-24 금윤호: "경기 결과를 우측에 작게 따로 · 하루 전 경기 또는 오늘 · 내일 예정 경기까지만 · 예정 경기는 선발투수 ·
 * NPB 도 · 없으면 '예정 경기가 없습니다' · 자세히를 누르면 모든 야구 경기의 일정과 결과 탭으로").
 * 자료는 서버(lib/baseball-feed.ts loadHomeGames — 어제 · 오늘 · 내일)가 읽어 넘기고 여기는 리그 탭 · 날짜만 쥔다. 처음 탭은 경기가 있는 첫 리그.
 * 2026-10-26 v2: 세 날짜를 늘 펼쳐 칸이 길게 늘어나던 것을 한 날짜씩(‹ 날짜 ›) · 최대 세 경기로 — 더 있으면 '외 N경기 · 전체 일정'.
 */
const LABEL: Record<League, string> = { kbo: 'KBO', mlb: 'MLB', npb: 'NPB' };
const ORDER: League[] = ['kbo', 'mlb', 'npb'];
const SHOWN = 3;

export function GamesPanel({ games, today }: { games: Record<League, Game[]>; today: string }) {
  const [league, setLeague] = useState<League>(() => ORDER.find((l) => games[l].length > 0) ?? 'kbo');
  const list = games[league];
  const days = [...new Set(list.map((g) => g.date))].sort();
  /* 고른 날 — 처음은 오늘(오늘 경기가 없으면 가장 가까운 날). 리그를 바꾸면 그 리그의 날 안으로 */
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && days.includes(picked) ? picked : days.includes(today) ? today : (days.find((d) => d > today) ?? days[days.length - 1]);
  const at = day ? days.indexOf(day) : -1;
  const ofDay = list.filter((g) => g.date === day);
  const more = ofDay.length - SHOWN;
  const arrow =
    'grid h-8 w-8 place-items-center rounded-lg text-ink transition-colors hover:bg-ink/6 disabled:pointer-events-none disabled:opacity-30';

  return (
    <section aria-label="오늘의 경기" className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <h2 className="text-[15px] font-bold text-ink">오늘의 경기</h2>
        <Link href={`/baseball?league=${league}`} className="text-xs font-semibold text-muted hover:text-ink">
          전체 일정 ›
        </Link>
      </div>
      <div role="tablist" aria-label="리그" className="flex gap-1 px-4 pt-2.5">
        {ORDER.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={l === league}
            onClick={() => setLeague(l)}
            className={`inline-flex min-h-7 items-center rounded-md px-2.5 text-xs font-semibold transition-colors ${
              l === league ? 'bg-ink text-page' : 'text-muted hover:bg-ink/5 hover:text-ink'
            }`}
          >
            {LABEL[l]}
          </button>
        ))}
      </div>
      {list.length === 0 || !day ? (
        <p className="px-4 py-6 text-center text-sm text-muted">예정 경기가 없습니다</p>
      ) : (
        <div className="px-4 pb-2">
          {/* 날짜 고르기 — 어제 · 오늘 · 내일 가운데 경기가 있는 날만 */}
          <div className="mt-2 flex items-center justify-between border-b border-line pb-1.5">
            <button type="button" aria-label="앞 날" disabled={at <= 0} onClick={() => setPicked(days[at - 1])} className={arrow}>
              ‹
            </button>
            <p className="text-xs font-bold text-sky-strong" aria-live="polite">
              {dayName(day, today)}
            </p>
            <button type="button" aria-label="다음 날" disabled={at >= days.length - 1} onClick={() => setPicked(days[at + 1])} className={arrow}>
              ›
            </button>
          </div>
          <ul className="divide-y divide-line">
            {ofDay.slice(0, SHOWN).map((g) => (
              <GameRow key={g.id} g={g} />
            ))}
          </ul>
          {more > 0 && (
            <Link href={`/baseball?league=${league}&date=${day}`} className="block border-t border-line py-2.5 text-center text-xs font-semibold text-muted hover:text-ink">
              외 {more}경기 · 전체 일정 ›
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
