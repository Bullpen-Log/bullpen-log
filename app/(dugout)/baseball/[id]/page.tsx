import type { Metadata } from 'next';
import Link from 'next/link';
import { DugoutPageHeader, SectionHead } from '@/components/dugout/ui';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { kstDateKey } from '@/lib/baseball-feed';
import { loadGameDetail, type BatterLine, type GameDetail, type PitcherLine } from '@/lib/game-detail';
import { loadGameComments } from '@/lib/game-comments';
import { deleteGameComment } from '@/app/actions/game-comments';
import { GameCommentForm } from '@/components/dugout/game-comment-form';
import { dayName } from '@/components/dugout/game-parts';
import { relativeTime } from '@/components/community/community-format';

export const metadata: Metadata = { title: '경기 기록' };

const LEAGUE_LABEL = { kbo: 'KBO', mlb: 'MLB', npb: 'NPB' } as const;

/**
 * 경기 하나(2026-10-24 금윤호: "경기를 선택했을 때 들어가서 그 경기의 기록을 자세히, 댓글을 달 수 있게") — 홈 오른쪽 경기 칸 · 경기 일정 화면에서 경기를 누르면 여기.
 * 점수판(이닝별 · R H E B) → 주요 기록(결승타 · 홈런 …) → 타자 · 투수 기록(원정 · 홈) → 댓글. 예정 경기는 선발투수만.
 * 자료는 lib/game-detail.ts(네이버 스포츠 경기 기록, 1분 기억), 댓글은 GameComment 표.
 */
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, user] = await Promise.all([loadGameDetail(id), getCurrentUser()]);
  if (!detail) notFound();
  const comments = await loadGameComments(id).catch(() => []);
  const { game: g } = detail;
  const today = kstDateKey(0);
  const now = new Date();
  const scored = g.status === 'result' || g.status === 'live';

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      <Link
        href={`/baseball?league=${g.league}${g.date === today ? '' : `&date=${g.date}`}`}
        className="text-sm font-semibold text-muted hover:text-ink lg:hidden"
      >
        ‹ 경기 일정
      </Link>
      <DugoutPageHeader
        title={`${g.away.name} vs ${g.home.name}`}
        crumbs={[
          { label: '덕아웃', href: '/' },
          { label: '경기 일정', href: `/baseball?league=${g.league}${g.date === today ? '' : `&date=${g.date}`}` },
          { label: LEAGUE_LABEL[g.league] },
        ]}
        className="[&_nav]:hidden lg:[&_nav]:flex"
      />

      {/* 점수 머리 */}
      <section className="rounded-3xl border border-line bg-surface p-6">
        <p className="text-center text-xs text-muted">
          {LEAGUE_LABEL[g.league]} · {dayName(g.date, today)} {g.time}
          {g.stadium ? ` · ${g.stadium}` : ''}
        </p>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Team name={g.away.name} sub="원정" win={g.winner === 'away'} lose={g.winner === 'home'} />
          <div className="text-center">
            {scored ? (
              <p className="text-4xl font-black tabular-nums text-ink">
                {g.away.score} <span className="text-muted">:</span> {g.home.score}
              </p>
            ) : (
              <p className="text-2xl font-black text-muted">VS</p>
            )}
            <p
              className={`mt-1 text-xs font-semibold ${
                g.status === 'live' ? 'text-danger' : g.status === 'cancel' ? 'text-warn' : 'text-muted'
              }`}
            >
              {g.status === 'before'
                ? '경기 전'
                : g.status === 'live'
                  ? `진행 중 · ${g.info}`
                  : g.status === 'cancel'
                    ? g.info || '취소'
                    : '종료'}
            </p>
          </div>
          <Team name={g.home.name} sub="홈" win={g.winner === 'home'} lose={g.winner === 'away'} />
        </div>
        {g.status === 'before' && (g.away.starter || g.home.starter) && (
          <p className="mt-5 border-t border-line pt-4 text-center text-sm text-muted">
            선발 <span className="font-semibold text-ink">{g.away.starter ?? '미정'}</span> vs{' '}
            <span className="font-semibold text-ink">{g.home.starter ?? '미정'}</span>
          </p>
        )}
        {g.status === 'result' && (g.winPitcher || g.losePitcher) && (
          <p className="mt-5 border-t border-line pt-4 text-center text-sm text-muted">
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
      </section>

      {scored && <ScoreBoard d={detail} />}

      {detail.notes.length > 0 && (
        <section className="space-y-4">
          <SectionHead title="주요 기록" />
          <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {detail.notes.map((n) => (
              <div key={n.label} className="flex gap-4 px-5 py-3 text-sm">
                <dt className="w-16 shrink-0 font-semibold text-muted">{n.label}</dt>
                <dd className="min-w-0 break-keep text-ink">{n.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {(detail.batters.away.length > 0 || detail.batters.home.length > 0) && (
        <section className="space-y-4">
          <SectionHead title="타자 기록" />
          <Batters team={g.away.name} rows={detail.batters.away} />
          <Batters team={g.home.name} rows={detail.batters.home} />
        </section>
      )}

      {(detail.pitchers.away.length > 0 || detail.pitchers.home.length > 0) && (
        <section className="space-y-4">
          <SectionHead title="투수 기록" />
          <Pitchers team={g.away.name} rows={detail.pitchers.away} />
          <Pitchers team={g.home.name} rows={detail.pitchers.home} />
        </section>
      )}

      {scored && detail.batters.away.length + detail.batters.home.length + detail.pitchers.away.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
          자세한 기록이 아직 없어요
        </p>
      )}

      {/* 댓글 */}
      <section className="space-y-4" aria-label="댓글">
        <SectionHead title="댓글" count={comments.length} />
        {comments.length > 0 && (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {comments.map((c) => (
              <li key={c.id} className="px-5 py-3.5">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-semibold text-ink">{c.nickname}</span>
                  <span>{relativeTime(c.createdAt, now)}</span>
                  {user && (user.id === c.userId || user.role === 'ADMIN') && (
                    <form action={deleteGameComment} className="ml-auto">
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="text-xs text-muted hover:text-danger">
                        지우기
                      </button>
                    </form>
                  )}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap break-keep text-ink">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        {user ? (
          <GameCommentForm gameId={g.id} />
        ) : (
          <Link
            href={`/login?next=/baseball/${g.id}`}
            className="flex min-h-12 items-center justify-center rounded-2xl border border-line bg-surface text-sm font-semibold text-ink hover:border-ink/40"
          >
            로그인하고 댓글 남기기
          </Link>
        )}
      </section>
    </div>
  );
}

function Team({ name, sub, win, lose }: { name: string; sub: string; win: boolean; lose: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${lose ? 'opacity-60' : ''}`}>
      <span className="grid h-14 w-14 place-items-center rounded-full bg-ink/6 text-xl font-black text-ink">
        {name.slice(0, 1)}
      </span>
      <span className={`text-center text-base break-keep text-ink ${win ? 'font-black' : 'font-bold'}`}>{name}</span>
      <span className="text-[11px] text-muted">{sub}</span>
    </div>
  );
}

function ScoreBoard({ d }: { d: GameDetail }) {
  if (!d.innings && !d.totals) return null;
  const n = Math.max(9, d.innings?.away.length ?? 0, d.innings?.home.length ?? 0);
  const cols = d.innings ? Array.from({ length: n }, (_, i) => i) : [];
  const cell = (v: number | null | undefined) => (v == null ? '–' : v);
  const row = (side: 'away' | 'home', name: string) => (
    <tr className="border-t border-line">
      <th scope="row" className="sticky left-0 bg-surface px-3 py-2.5 text-left font-semibold whitespace-nowrap text-ink">
        {name}
      </th>
      {cols.map((i) => (
        <td key={i} className="px-2 py-2.5 text-center tabular-nums text-ink">
          {cell(d.innings?.[side][i])}
        </td>
      ))}
      {d.totals && (
        <>
          <td className="px-2 py-2.5 text-center font-black tabular-nums text-ink">{cell(d.totals[side].r)}</td>
          <td className="px-2 py-2.5 text-center tabular-nums text-ink">{cell(d.totals[side].h)}</td>
          <td className="px-2 py-2.5 text-center tabular-nums text-ink">{cell(d.totals[side].e)}</td>
          {d.totals[side].b != null && <td className="px-2 py-2.5 text-center tabular-nums text-ink">{d.totals[side].b}</td>}
        </>
      )}
    </tr>
  );
  return (
    <section className="space-y-4">
      <SectionHead title="점수판" />
      <div className="no-scrollbar overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-xs text-muted">
              <th className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">팀</th>
              {cols.map((i) => (
                <th key={i} className="px-2 py-2 text-center font-medium">
                  {i + 1}
                </th>
              ))}
              {d.totals && (
                <>
                  <th className="px-2 py-2 text-center font-bold text-ink">R</th>
                  <th className="px-2 py-2 text-center font-medium">H</th>
                  <th className="px-2 py-2 text-center font-medium">E</th>
                  {d.totals.away.b != null && <th className="px-2 py-2 text-center font-medium">B</th>}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {row('away', d.game.away.name)}
            {row('home', d.game.home.name)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Batters({ team, rows }: { team: string; rows: BatterLine[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="no-scrollbar overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="px-4 pt-3 text-left text-sm font-bold text-ink">{team}</caption>
        <thead>
          <tr className="text-xs text-muted">
            <th className="px-3 py-2 text-left font-medium">타순 · 선수</th>
            <th className="px-2 py-2 text-left font-medium">포지션</th>
            {['타수', '득점', '안타', '타점', '홈런', '볼넷', '삼진', '타율'].map((h) => (
              <th key={h} className="px-2 py-2 text-center font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => (
            <tr key={`${b.name}-${i}`} className="border-t border-line">
              <td className="px-3 py-2 whitespace-nowrap text-ink">
                <span className="mr-2 inline-block w-4 text-xs text-muted tabular-nums">{b.order}</span>
                <span className="font-semibold">{b.name}</span>
              </td>
              <td className="px-2 py-2 whitespace-nowrap text-muted">{b.pos}</td>
              {[b.ab, b.run, b.hit, b.rbi, b.hr, b.bb, b.so].map((v, j) => (
                <td key={j} className="px-2 py-2 text-center tabular-nums text-ink">
                  {v}
                </td>
              ))}
              <td className="px-2 py-2 text-center tabular-nums text-muted">{b.avg}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pitchers({ team, rows }: { team: string; rows: PitcherLine[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="no-scrollbar overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="px-4 pt-3 text-left text-sm font-bold text-ink">{team}</caption>
        <thead>
          <tr className="text-xs text-muted">
            <th className="px-3 py-2 text-left font-medium">선수</th>
            {['결과', '이닝', '피안타', '실점', '자책', '볼넷', '삼진', '피홈런', '평균자책'].map((h) => (
              <th key={h} className="px-2 py-2 text-center font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={`${p.name}-${i}`} className="border-t border-line">
              <td className="px-3 py-2 font-semibold whitespace-nowrap text-ink">{p.name}</td>
              <td
                className={`px-2 py-2 text-center font-semibold ${
                  p.result === '승' ? 'text-sky-strong' : p.result === '패' ? 'text-danger' : 'text-muted'
                }`}
              >
                {p.result || '–'}
              </td>
              <td className="px-2 py-2 text-center whitespace-nowrap tabular-nums text-ink">{p.inn}</td>
              {[p.hit, p.run, p.er, p.bb, p.so, p.hr].map((v, j) => (
                <td key={j} className="px-2 py-2 text-center tabular-nums text-ink">
                  {v}
                </td>
              ))}
              <td className="px-2 py-2 text-center tabular-nums text-muted">{p.era}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
