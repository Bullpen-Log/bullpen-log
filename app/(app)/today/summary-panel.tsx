import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ACWR_ZONES, formatShortDate, type AcwrZone } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { TONE } from '@/components/tone';

/**
 * 홈 오른쪽 요약 칸.
 *
 * 넓은 화면에서 상자 넷만 두면 가로가 절반 남고 세로로 삼분의 일이 빈다.
 * 실제로 1440×900 에서 재보니 아래 300px 이 통째로 비어 있었다.
 *
 * 빈 곳을 아무거나로 메우지는 않는다. 여기 있는 셋은 홈에서 볼 값어치가 있는
 * 것들이다 — 지금 몸이 어떤 상태인지, 이번 주에 얼마나 했는지, 최근에 뭘 했는지.
 * 자세한 것은 분석과 투구 일지가 맡고, 여기서는 한 줄씩만 보여주고 넘긴다.
 *
 * 좁은 화면에서는 상자 넷 아래로 내려간다. 폰에서는 오늘 할 일이 먼저다.
 */

function ZoneLine({
  name,
  ratio,
  zone,
  waiting,
}: {
  name: string;
  ratio: number | null;
  zone: AcwrZone | null;
  /** 지수를 아직 못 낼 때 대신 적을 말 */
  waiting: string;
}) {
  const z = zone ? ACWR_ZONES[zone] : null;

  return (
    <div className="flex items-baseline gap-2">
      <span className="w-12 shrink-0 text-xs text-muted">{name}</span>
      {ratio != null && z ? (
        <>
          <span
            className={`text-display text-xl leading-none tabular-nums ${TONE[z.tone].text}`}
          >
            {ratio.toFixed(2)}
          </span>
          <span className={`text-xs font-medium ${TONE[z.tone].text}`}>{z.short}</span>
        </>
      ) : (
        <span className="text-xs text-muted/70">{waiting}</span>
      )}
    </div>
  );
}

export type RecentLog = {
  id: string;
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
};

export function SummaryPanel({
  pitching,
  training,
  week,
  recent,
}: {
  pitching: { ratio: number | null; zone: AcwrZone | null; waiting: string };
  training: { ratio: number | null; zone: AcwrZone | null; waiting: string };
  week: {
    pitches: number;
    throwDays: number;
    workoutDays: number;
    workoutMinutes: number;
  };
  /** 최근 투구 기록 몇 건. 없으면 빈 배열 */
  recent: RecentLog[];
}) {
  return (
    <aside className="space-y-4">
      {/* ── 지금 몸 상태 ─────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-heading text-sm text-ink">지금 부하</h2>
          <Link
            href="/coach"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-sky transition-colors hover:text-sky-strong"
          >
            분석
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted/70">
          평소보다 얼마나 많은지
        </p>

        <div className="mt-3 space-y-2.5">
          <ZoneLine name="투구" {...pitching} />
          <ZoneLine name="운동" {...training} />
        </div>
      </section>

      {/* ── 이번 주 ──────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface px-5 py-4">
        <h2 className="text-heading text-sm text-ink">이번 주</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="w-12 shrink-0 text-xs text-muted">투구</dt>
            <dd className="text-ink">
              {week.pitches > 0 ? (
                <>
                  <span className="text-display text-xl leading-none">
                    {week.pitches}
                  </span>
                  구
                  <span className="ml-1.5 text-xs text-muted">
                    {week.throwDays}일 던짐
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted/70">아직 없음</span>
              )}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="w-12 shrink-0 text-xs text-muted">운동</dt>
            <dd className="text-ink">
              {week.workoutDays > 0 ? (
                <>
                  <span className="text-display text-xl leading-none">
                    {week.workoutDays}
                  </span>
                  일
                  <span className="ml-1.5 text-xs text-muted">
                    {week.workoutMinutes}분
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted/70">아직 없음</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* ── 최근 기록 ────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-heading text-sm text-ink">최근 기록</h2>
          <Link
            href="/pitch-log"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-sky transition-colors hover:text-sky-strong"
          >
            투구 일지
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-muted/70">
            아직 남긴 기록이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recent.map((log) => (
              <li key={log.id} className="flex items-baseline gap-2 text-sm">
                <span className="w-10 shrink-0 text-xs tabular-nums text-muted">
                  {formatShortDate(log.date)}
                </span>
                {log.sessionType === REST_SESSION_TYPE ? (
                  <span className="text-xs text-muted">쉬는 날</span>
                ) : (
                  <span className="min-w-0 truncate text-ink">
                    {log.sessionType}{' '}
                    <span className="tabular-nums">{log.pitchCount}</span>구
                    <span className="ml-1 text-xs text-muted">
                      강도 {log.intensity}
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
