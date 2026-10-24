import type { Metadata } from 'next';
import Link from 'next/link';
import { GameCard, dayName } from '@/components/dugout/game-parts';
import { LEAGUES, addDays, isLeague, kstDateKey, loadGames, type League } from '@/lib/baseball-feed';

export const metadata: Metadata = { title: '경기 일정 · 결과' };

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 야구 경기 일정 · 결과(2026-10-24 금윤호: "자세히를 누르면 모든 야구 경기의 일정과 결과를 볼 수 있는 탭을 따로") — 홈 오른쪽 경기 칸의 '자세히'가 여기로.
 * [KBO | MLB | NPB] 탭 → 고른 날 앞뒤 사흘(한 주) 날짜 띠(그날 경기 수) · 한 주 앞뒤 화살표 · 오늘 → 그날 경기 카드(예정은 선발, 끝난 경기는 승 · 패 투수).
 * 고른 리그 · 날짜는 주소에(?league=&date=). 자료는 lib/baseball-feed.ts loadGames(네이버 스포츠 일정, 5분 기억).
 */
export default async function BaseballPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rawLeague = one(sp.league);
  const league: League = isLeague(rawLeague) ? rawLeague : 'kbo';
  const today = kstDateKey(0);
  const rawDate = one(sp.date);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const from = addDays(date, -3);
  const to = addDays(date, 3);
  const games = await loadGames(league, from, to);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const ofDay = games.filter((g) => g.date === date);
  const href = (l: League, d: string) => `/baseball?league=${l}${d === today ? '' : `&date=${d}`}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <div>
        <p className="text-[13px] text-muted">덕아웃 야구</p>
        <h1 className="mt-0.5 text-2xl font-black text-ink">경기 일정 · 결과</h1>
      </div>

      <nav aria-label="리그" className="flex gap-2">
        {LEAGUES.map((l) => (
          <Link
            key={l.key}
            href={href(l.key, date)}
            aria-current={l.key === league ? 'page' : undefined}
            className={`inline-flex min-h-10 items-center rounded-full px-5 text-sm font-semibold transition-colors ${
              l.key === league ? 'bg-ink text-page' : 'border border-line bg-surface text-ink hover:border-ink/40'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {/* 날짜 띠 — 한 주, 그날 경기 수 */}
      <div className="flex items-center gap-2">
        <Link
          href={href(league, addDays(date, -7))}
          aria-label="지난주"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-lg text-ink hover:border-ink/40"
        >
          ‹
        </Link>
        <ol className="no-scrollbar grid min-w-0 flex-1 grid-cols-7 gap-1.5">
          {days.map((d) => {
            const n = games.filter((g) => g.date === d).length;
            const dt = new Date(`${d}T00:00:00Z`);
            const on = d === date;
            return (
              <li key={d}>
                <Link
                  href={href(league, d)}
                  aria-current={on ? 'date' : undefined}
                  className={`flex flex-col items-center rounded-xl py-2 transition-colors ${
                    on ? 'bg-ink text-page' : 'bg-surface text-ink hover:bg-ink/5'
                  }`}
                >
                  <span className={`text-[11px] ${on ? 'text-page/70' : 'text-muted'}`}>
                    {d === today ? '오늘' : WEEKDAY[dt.getUTCDay()]}
                  </span>
                  <span className="text-base font-bold tabular-nums">{dt.getUTCDate()}</span>
                  <span className={`text-[10px] ${on ? 'text-page/70' : n ? 'text-sky-strong' : 'text-muted/60'}`}>
                    {n ? `${n}경기` : '–'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <Link
          href={href(league, addDays(date, 7))}
          aria-label="다음 주"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-lg text-ink hover:border-ink/40"
        >
          ›
        </Link>
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-ink">{dayName(date, today)}</h2>
        {date !== today && (
          <Link href={href(league, today)} className="text-sm font-semibold text-sky">
            오늘로 ›
          </Link>
        )}
      </div>

      {ofDay.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-14 text-center text-sm text-muted">
          이날은 {LEAGUES.find((l) => l.key === league)?.label} 경기가 없어요
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {ofDay.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </ul>
      )}

    </div>
  );
}
