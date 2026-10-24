import Link from 'next/link';
import type { Game } from '@/lib/baseball-feed';

/**
 * 경기 한 줄 · 한 장(2026-10-24) — 홈 오른쪽 작은 칸(games-panel)과 전체 일정 화면(/baseball)이 같이 쓴다.
 * 이긴 팀은 굵게 · 진 팀은 옅게. 예정 경기는 선발투수, 끝난 경기는 승 · 패 투수. 엠블럼 그림은 안 쓴다(팀 이름 첫 글자 원).
 */
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export function dayName(date: string, today: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const t = new Date(`${today}T00:00:00Z`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[d.getUTCDay()]})`;
  if (diff === 0) return `오늘 ${md}`;
  if (diff === -1) return `어제 ${md}`;
  if (diff === 1) return `내일 ${md}`;
  return md;
}

export function statusText(g: Game): string {
  if (g.status === 'before') return g.time;
  if (g.status === 'cancel') return g.info || '취소';
  if (g.status === 'live') return g.info || '진행 중';
  return '종료';
}

function TeamLine({
  team,
  win,
  lose,
  big = false,
  starter,
}: {
  team: Game['home'];
  win: boolean;
  lose: boolean;
  big?: boolean;
  /** 예정 경기의 선발 — 팀 이름 바로 옆에 */
  starter?: string;
}) {
  return (
    <span className={`flex min-w-0 items-center gap-2 ${lose ? 'text-muted' : 'text-ink'}`}>
      <span
        className={`grid shrink-0 place-items-center rounded-full bg-ink/6 font-bold ${big ? 'h-7 w-7 text-xs' : 'h-5 w-5 text-[10px]'}`}
      >
        {team.name.slice(0, 1)}
      </span>
      <span className={`min-w-0 flex-1 truncate ${big ? 'text-[15px]' : 'text-[13px]'} ${win ? 'font-bold' : 'font-medium'}`}>
        {team.name}
        {starter && <span className="ml-1.5 text-[11px] font-normal text-muted">선발 {starter}</span>}
      </span>
      {team.score != null && (
        <span className={`tabular-nums ${big ? 'text-lg' : 'text-[14px]'} ${win ? 'font-black' : 'font-semibold'}`}>
          {team.score}
        </span>
      )}
    </span>
  );
}

/** 작은 한 줄(홈 오른쪽 칸) */
export function GameRow({ g }: { g: Game }) {
  const pre = g.status === 'before' && !!(g.away.starter || g.home.starter);
  return (
    <li>
      <Link href={`/baseball/${g.id}`} className="-mx-2 block space-y-1 rounded-lg px-2 py-2.5 transition-colors hover:bg-ink/4">
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className={g.status === 'live' ? 'font-bold text-danger' : g.status === 'cancel' ? 'font-semibold text-warn' : ''}>
          {statusText(g)}
        </span>
        {g.stadium && <span className="truncate">· {g.stadium}</span>}
      </p>
      <TeamLine team={g.away} win={g.winner === 'away'} lose={g.winner === 'home'} starter={pre ? (g.away.starter ?? '미정') : undefined} />
      <TeamLine team={g.home} win={g.winner === 'home'} lose={g.winner === 'away'} starter={pre ? (g.home.starter ?? '미정') : undefined} />
      </Link>
    </li>
  );
}

/** 큰 한 장(전체 일정 화면) */
export function GameCard({ g }: { g: Game }) {
  return (
    <li>
      <Link
        href={`/baseball/${g.id}`}
        className="block h-full rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-ink/30"
      >
      <p className="mb-3 flex items-center gap-2 text-xs text-muted">
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${
            g.status === 'live'
              ? 'bg-danger text-white'
              : g.status === 'result'
                ? 'bg-ink/6 text-ink'
                : g.status === 'cancel'
                  ? 'bg-warn/15 text-warn'
                  : 'bg-sky/12 text-sky-strong'
          }`}
        >
          {g.status === 'before' ? '예정' : g.status === 'live' ? '진행 중' : g.status === 'cancel' ? g.info || '취소' : '종료'}
        </span>
        <span>{g.time}</span>
        {g.stadium && <span>· {g.stadium}</span>}
        {g.status === 'live' && g.info && <span className="font-semibold text-danger">· {g.info}</span>}
      </p>
      <div className="space-y-2">
        <TeamLine team={g.away} win={g.winner === 'away'} lose={g.winner === 'home'} big />
        <TeamLine team={g.home} win={g.winner === 'home'} lose={g.winner === 'away'} big />
      </div>
      {g.status === 'before' && (g.away.starter || g.home.starter) && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          선발 <span className="font-semibold text-ink">{g.away.starter ?? '미정'}</span> vs{' '}
          <span className="font-semibold text-ink">{g.home.starter ?? '미정'}</span>
        </p>
      )}
      {g.status === 'result' && (g.winPitcher || g.losePitcher) && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          {g.winPitcher && (
            <>
              승 <span className="font-semibold text-ink">{g.winPitcher}</span>
            </>
          )}
          {g.winPitcher && g.losePitcher && ' · '}
          {g.losePitcher && (
            <>
              패 <span className="font-semibold text-ink">{g.losePitcher}</span>
            </>
          )}
        </p>
      )}
      </Link>
    </li>
  );
}
