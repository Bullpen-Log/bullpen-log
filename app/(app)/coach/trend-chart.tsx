'use client';

import { useState } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { useChartTheme } from '@/lib/chart-theme';

// 일반 <Chart>는 컨트롤러를 자동 등록하지 않으므로 직접 등록한다.
ChartJS.register(
  BarController,
  LineController,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip
);

export type TrendPoint = {
  label: string;
  /** 그날 던진 개수 */
  pitches: number;
  /** 그날 체감 강도 (안 던진 날은 0) */
  intensity: number;
  /** 그날 최고 구속. 안 던진 날은 null 이라 선이 끊긴다. */
  maxVelocity: number | null;
  /** 그날까지의 7일 누적 부하 (투구수 × 강도의 합) */
  rollingLoad: number;
};

/**
 * 무엇을 볼지 고르는 그래프.
 *
 * 예전에는 투구수와 부하만 고정으로 그렸다. 구속이 오르는지, 강도를
 * 어떻게 쓰고 있는지는 따로 볼 방법이 없었다. 보고 싶은 것을 직접
 * 고르게 하면 같은 자리에서 네 가지를 다 볼 수 있다.
 */
const METRICS = [
  {
    key: 'pitches',
    label: '투구수',
    unit: '구',
    kind: 'bar',
    hint: '그날 던진 개수입니다.',
    sparse: false,
  },
  {
    key: 'load',
    label: '누적 부하',
    unit: '',
    kind: 'line',
    hint: '그날까지 최근 7일 부하의 합입니다. (부하 = 투구수 × 강도)',
    sparse: false,
  },
  {
    key: 'velocity',
    label: '최고 구속',
    unit: 'km/h',
    kind: 'line',
    hint: '던진 날만 값이 있습니다. 쉰 날은 건너뛰고 이어집니다.',
    /*
     * 던진 날에만 값이 있어 대부분의 칸이 비어 있다.
     * 다른 지표처럼 점을 숨기고 빈 칸에서 선을 끊으면, 하루만 던진 날은
     * 선도 점도 없이 사라져 그래프가 통째로 비어 보인다.
     */
    sparse: true,
  },
  {
    key: 'intensity',
    label: '투구 강도',
    unit: '/ 10',
    kind: 'bar',
    hint: '스스로 매긴 그날의 힘 쓴 정도입니다.',
    sparse: false,
  },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

function valuesFor(points: TrendPoint[], metric: MetricKey): (number | null)[] {
  switch (metric) {
    case 'pitches':
      return points.map((p) => p.pitches);
    case 'load':
      return points.map((p) => p.rollingLoad);
    case 'velocity':
      return points.map((p) => p.maxVelocity);
    case 'intensity':
      return points.map((p) => p.intensity);
  }
}

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>('pitches');
  const chart = useChartTheme();

  const active = METRICS.find((m) => m.key === metric)!;
  const data = valuesFor(points, metric);

  // 구속은 0부터 그리면 변화가 눌려 보이지 않는다. 실제 범위에 맞춘다.
  const beginAtZero = metric !== 'velocity';

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="그래프에서 볼 항목"
        className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1"
      >
        {METRICS.map((m) => {
          const selected = m.key === metric;
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setMetric(m.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors sm:flex-none sm:px-4 ${
                selected
                  ? 'bg-sky text-white'
                  : 'text-muted hover:bg-surface hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-muted">{active.hint}</p>

      <div className="h-[260px] sm:h-[300px]">
        <Chart
          // 막대 ↔ 선을 오갈 때 Chart.js가 옛 그림을 남기지 않도록 다시 만든다.
          key={metric}
          type={active.kind === 'bar' ? 'bar' : 'line'}
          data={{
            labels: points.map((p) => p.label),
            datasets: [
              active.kind === 'bar'
                ? {
                    type: 'bar' as const,
                    label: active.label,
                    data,
                    backgroundColor: `${chart.accent}59`,
                    hoverBackgroundColor: chart.accent,
                    borderRadius: 3,
                    barPercentage: 0.7,
                    categoryPercentage: 0.85,
                  }
                : {
                    type: 'line' as const,
                    label: active.label,
                    data,
                    borderColor: chart.accent,
                    backgroundColor: `${chart.accent}1f`,
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    // 값이 드문 지표는 점을 항상 찍어야 보인다.
                    pointRadius: active.sparse ? 3 : points.length > 14 ? 0 : 3,
                    pointBackgroundColor: chart.accentStrong,
                    pointHoverRadius: 5,
                    /*
                     * 구속은 쉰 날을 건너뛰고 이어야 세션 간 흐름이 보인다.
                     * 부하처럼 매일 값이 있는 지표는 끊어야 사실과 맞는다.
                     */
                    spanGaps: active.sparse,
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
                  label: (ctx) =>
                    ctx.parsed.y == null
                      ? '기록 없음'
                      : `${active.label} ${ctx.parsed.y}${active.unit}`,
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                border: { color: chart.border },
                ticks: {
                  color: chart.tick,
                  font: { size: 10 },
                  maxTicksLimit: 10,
                },
              },
              y: {
                beginAtZero,
                grid: { color: chart.grid },
                border: { display: false },
                ticks: { color: chart.tick, font: { size: 10 } },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
