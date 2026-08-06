'use client';

import Link from 'next/link';
import { Line } from 'react-chartjs-2';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { VelocityStats } from '@/lib/velocity';
import { useChartTheme } from '@/lib/chart-theme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

/** 그래프에 보여줄 최근 기록 수 */
const WINDOW = 20;

export function VelocityCard({
  stats,
  target,
}: {
  stats: VelocityStats;
  target: number | null;
}) {
  const chart = useChartTheme();
  const points = stats.points.slice(-WINDOW);
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

      {/* 추이 */}
      {points.length >= 2 ? (
        <div className="space-y-2">
          <div className="h-[180px]">
            <Line
              data={{
                labels: points.map((p) => p.dateKey.slice(5)),
                datasets: [
                  {
                    label: '최고 구속',
                    data: points.map((p) => p.max),
                    borderColor: chart.accent,
                    backgroundColor: `${chart.accent}1f`,
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    // 신기록을 세운 날만 점을 크게 찍는다.
                    pointRadius: points.map((p) => (p.isNewBest ? 5 : 0)),
                    pointBackgroundColor: chart.accentStrong,
                    pointBorderColor: chart.surface,
                    pointBorderWidth: 2,
                    pointHoverRadius: 5,
                  },
                  {
                    label: '그날까지 최고',
                    data: points.map((p) => p.best),
                    borderColor: `${chart.accentStrong}59`,
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    stepped: true,
                    fill: false,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                  tooltip: {
                    backgroundColor: chart.tooltipBg,
                    titleColor: chart.tooltipTitle,
                    bodyColor: chart.tooltipBody,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                      label: (ctx) => `${ctx.dataset.label} ${ctx.parsed.y}km/h`,
                    },
                  },
                },
                scales: {
                  x: {
                    grid: { display: false },
                    border: { color: chart.border },
                    ticks: { color: chart.tick, font: { size: 10 }, maxTicksLimit: 7 },
                  },
                  y: {
                    grid: { color: chart.grid },
                    border: { display: false },
                    ticks: { color: chart.tick, font: { size: 10 } },
                    title: { display: true, text: 'km/h', color: chart.tick },
                  },
                },
              }}
            />
          </div>

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
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {stats.points.length === 0
            ? '투구를 기록하면 구속 추이가 그려집니다.'
            : '기록이 2회 이상 쌓이면 추이가 그려집니다.'}
        </p>
      )}
    </section>
  );
}
