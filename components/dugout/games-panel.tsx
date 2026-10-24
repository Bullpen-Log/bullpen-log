'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Game, League } from '@/lib/baseball-feed';
import { GameRow, dayName } from '@/components/dugout/game-parts';

/**
 * 홈 오른쪽의 작은 경기 칸(2026-10-24 금윤호: "경기 결과를 우측에 작게 따로 · 하루 전 경기 또는 오늘 · 내일 예정 경기까지만 · 예정 경기는 선발투수 ·
 * NPB 도 · 없으면 '예정 경기가 없습니다' · 자세히를 누르면 모든 야구 경기의 일정과 결과 탭으로").
 * 자료는 서버(lib/baseball-feed.ts loadHomeGames — 어제 · 오늘 · 내일)가 읽어 넘기고 여기는 리그 탭만 쥔다. 처음 탭은 경기가 있는 첫 리그.
 */
const LABEL: Record<League, string> = { kbo: 'KBO', mlb: 'MLB', npb: 'NPB' };
const ORDER: League[] = ['kbo', 'mlb', 'npb'];

export function GamesPanel({ games, today }: { games: Record<League, Game[]>; today: string }) {
  const [league, setLeague] = useState<League>(() => ORDER.find((l) => games[l].length > 0) ?? 'kbo');
  const list = games[league];
  const days = [...new Set(list.map((g) => g.date))];

  return (
    <section aria-label="오늘의 경기" className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-[15px] font-bold text-ink">오늘의 경기</h2>
        <Link href={`/baseball?league=${league}`} className="text-xs font-semibold text-muted hover:text-ink">
          자세히 ›
        </Link>
      </div>
      <div role="tablist" aria-label="리그" className="flex gap-1.5 px-4 pt-3">
        {ORDER.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={l === league}
            onClick={() => setLeague(l)}
            className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors ${
              l === league ? 'bg-ink text-page' : 'border border-line text-ink hover:border-ink/40'
            }`}
          >
            {LABEL[l]}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">예정 경기가 없습니다</p>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto px-4 pb-2">
          {days.map((d) => (
            <div key={d} className="pt-3">
              <p className="text-[11px] font-bold text-sky-strong">{dayName(d, today)}</p>
              <ul className="divide-y divide-line">
                {list
                  .filter((g) => g.date === d)
                  .map((g) => (
                    <GameRow key={g.id} g={g} />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
