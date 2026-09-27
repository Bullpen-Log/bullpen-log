'use client';

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { useChartTheme } from '@/lib/chart-theme';

// 일반 <Chart>는 컨트롤러를 자동 등록하지 않으므로 직접 등록한다.
ChartJS.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip);

export type BiasPoint = { date: string; biasKmh: number | null; pairs: number };

/**
 * 최근 30일 날짜별 편향(릴리스 추정 − 스피드건, km/h) 막대.
 *
 * 0 이 가운데 — 위로 솟으면 카메라가 높게, 아래로 내려가면 낮게 재고 있다는 뜻이다.
 * 짝(스피드건 값)이 없는 날은 막대가 없다. 색은 app/(app)/coach/trend-chart.tsx 처럼
 * CSS 토큰에서 읽어 다크 모드에 맞춘다.
 */
export function BiasChart({ points }: { points: BiasPoint[] }) {
  const chart = useChartTheme();
  const data = points.map((p) => p.biasKmh);
  const hasAny = data.some((v) => v != null);
  /* 0 을 가운데 두고 위아래를 같게 — 치우침이 한눈에 보이게 */
  const extent = Math.max(2, ...data.map((v) => Math.abs(v ?? 0)));
  const limit = Math.ceil(extent + 0.5);

  if (!hasAny) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
        최근 30일에 스피드건 짝이 없어요. 공마다 스피드건 값을 넣으면 여기에 날짜별
        편향이 그려져요.
      </p>
    );
  }

  return (
    <div className="h-[220px] sm:h-[260px]">
      <Chart
        type="bar"
        data={{
          labels: points.map((p) => {
            const [, m, d] = p.date.split('-').map(Number);
            return `${m}/${d}`;
          }),
          datasets: [
            {
              type: 'bar' as const,
              label: '편향',
              data,
              backgroundColor: `${chart.accent}59`,
              hoverBackgroundColor: chart.accent,
              borderRadius: 3,
              barPercentage: 0.7,
              categoryPercentage: 0.85,
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
                label: (ctx) => {
                  const p = points[ctx.dataIndex];
                  if (p.biasKmh == null) return '짝 없음';
                  const sign = p.biasKmh > 0 ? '+' : '';
                  return `편향 ${sign}${p.biasKmh} km/h · 짝 ${p.pairs}`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              border: { color: chart.border },
              ticks: { color: chart.tick, font: { size: 10 }, maxTicksLimit: 10 },
            },
            y: {
              min: -limit,
              max: limit,
              grid: { color: chart.grid },
              border: { display: false },
              ticks: {
                color: chart.tick,
                font: { size: 10 },
                callback: (v) => `${Number(v) > 0 ? '+' : ''}${v}`,
              },
            },
          },
        }}
      />
    </div>
  );
}
