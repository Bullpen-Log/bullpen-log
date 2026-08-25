import Link from 'next/link';
import type { VelocityStats } from '@/lib/velocity';

/**
 * 개인 최고 구속과 목표까지 남은 거리.
 *
 * 추이 그래프는 여기에 두지 않는다. 아래 '최근 28일 추이'에서 '최고 구속'을
 * 고르면 같은 것을 볼 수 있어, 한 화면에 같은 그래프가 두 번 나오게 된다.
 * 여기는 "지금 어디까지 왔나"를 한눈에 보는 자리로 둔다.
 */
export function VelocityCard({
  stats,
  target,
}: {
  stats: VelocityStats;
  target: number | null;
}) {
  const gap = target != null && stats.best != null ? target - stats.best : null;

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            구속
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-display text-4xl leading-none tabular-nums text-ink sm:text-5xl">
              {stats.best ?? '—'}
            </span>
            <span className="text-sm text-muted">km/h 개인 최고</span>
          </p>
          {stats.bestDate && (
            <p className="mt-1 text-xs text-muted">{stats.bestDate} 기록</p>
          )}
        </div>

        {/* 방금 신기록이면 가장 먼저 눈에 들어와야 한다. */}
        {stats.latestIsBest && stats.best != null && (
          <span className="rounded-full bg-sky px-3 py-1.5 text-xs font-bold text-white">
            🎉 개인 최고 경신!
          </span>
        )}
      </div>

      {/* 목표까지 얼마나 남았는지 */}
      {target != null && stats.best != null ? (
        <div className="space-y-2 rounded-xl border border-line bg-surface-2 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-ink">목표 {target}km/h</span>
            <span className="text-sm font-semibold text-sky">
              {gap != null && gap > 0 ? `${gap}km/h 남음` : '목표 달성 🎯'}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-sky transition-[width] duration-500"
              style={{ width: `${Math.min(100, (stats.best / target) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <Link
          href="/profile"
          className="block rounded-xl border border-dashed border-sky-soft bg-sky-tint px-4 py-3 text-sm font-medium text-sky-strong transition-colors hover:bg-sky-tint/70"
        >
          🎯 목표 구속을 정하면 남은 거리를 보여드립니다 →
        </Link>
      )}

      {/* 흐름은 한 줄로만 — 그래프는 아래 추이에서 본다. */}
      {stats.trend != null && (
        <p className="text-xs text-muted">
          최근 5회 평균이 그 전 5회보다{' '}
          <span
            className={
              stats.trend > 0
                ? 'font-semibold text-sky'
                : stats.trend < 0
                  ? 'font-semibold text-warn'
                  : ''
            }
          >
            {stats.trend > 0 ? '+' : ''}
            {stats.trend}km/h
          </span>
        </p>
      )}
    </section>
  );
}
