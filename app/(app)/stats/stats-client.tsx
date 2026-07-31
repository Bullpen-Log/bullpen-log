'use client';

import { useMemo, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { Card, EmptyState, PageHeading } from '@/components/ui';
import {
  TWO_DAY_INTENSITY_LIMIT,
  buildDateRange,
  findFatigueWindows,
  formatShortDate,
  groupByDay,
  summarize,
} from '@/lib/pitch-stats';
import type { Log } from '@/app/(app)/pitch-log/pitch-log-client';

// 범용 <Chart>는 전용 컴포넌트와 달리 컨트롤러를 자동 등록하지 않는다.
// 막대+선을 섞어 쓰므로 두 컨트롤러를 직접 등록해야 한다.
ChartJS.register(
  BarController,
  LineController,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const PERIODS = [
  { key: 7, label: '최근 7일' },
  { key: 30, label: '최근 30일' },
] as const;

export function StatsClient({ logs }: { logs: Log[] }) {
  const [days, setDays] = useState<7 | 30>(7);

  const byDay = useMemo(() => groupByDay(logs), [logs]);
  const dateKeys = useMemo(() => buildDateRange(days), [days]);
  const summary = useMemo(() => summarize(byDay, dateKeys), [byDay, dateKeys]);

  // 피로도 경고는 기간과 무관하게 최근 30일에서 찾는다.
  const fatigueWindows = useMemo(
    () => findFatigueWindows(byDay, buildDateRange(30)),
    [byDay]
  );

  const chartData = useMemo(
    () => ({
      labels: dateKeys.map(formatShortDate),
      datasets: [
        {
          type: 'bar' as const,
          label: '투구수',
          data: dateKeys.map((k) => byDay.get(k)?.pitchCount ?? 0),
          backgroundColor: 'rgba(201, 169, 106, 0.28)',
          borderColor: 'rgba(201, 169, 106, 0.5)',
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line' as const,
          label: '투구 강도',
          data: dateKeys.map((k) => byDay.get(k)?.intensity ?? 0),
          borderColor: '#c9a96a',
          backgroundColor: '#c9a96a',
          tension: 0.35,
          pointRadius: days === 7 ? 4 : 2,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    }),
    [byDay, dateKeys, days]
  );

  const velocityData = useMemo(
    () => ({
      labels: dateKeys.map(formatShortDate),
      datasets: [
        {
          type: 'line' as const,
          label: '최고 구속',
          data: dateKeys.map((k) => byDay.get(k)?.maxVelocity ?? null),
          borderColor: '#c9a96a',
          backgroundColor: 'rgba(201, 169, 106, 0.12)',
          tension: 0.35,
          fill: true,
          pointRadius: days === 7 ? 4 : 2,
          spanGaps: true,
        },
        {
          type: 'line' as const,
          label: '평균 구속',
          data: dateKeys.map((k) => byDay.get(k)?.avgVelocity ?? null),
          borderColor: '#6b7280',
          backgroundColor: 'transparent',
          borderDash: [5, 4],
          tension: 0.35,
          pointRadius: days === 7 ? 3 : 1,
          spanGaps: true,
        },
      ],
    }),
    [byDay, dateKeys, days]
  );

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        labels: { color: '#8e8e99', usePointStyle: true, boxWidth: 8, padding: 16 },
      },
    },
  };

  const volumeOptions = {
    ...baseOptions,
    scales: {
      x: { ticks: { color: '#8e8e99' }, grid: { color: 'rgba(42,42,51,0.6)' } },
      y: {
        position: 'left' as const,
        beginAtZero: true,
        title: { display: true, text: '투구수', color: '#8e8e99' },
        ticks: { color: '#8e8e99' },
        grid: { color: 'rgba(42,42,51,0.6)' },
      },
      y1: {
        position: 'right' as const,
        beginAtZero: true,
        suggestedMax: 10,
        title: { display: true, text: '강도', color: '#c9a96a' },
        ticks: { color: '#c9a96a', stepSize: 2 },
        grid: { drawOnChartArea: false },
      },
    },
  };

  const velocityOptions = {
    ...baseOptions,
    scales: {
      x: { ticks: { color: '#8e8e99' }, grid: { color: 'rgba(42,42,51,0.6)' } },
      y: {
        ticks: { color: '#8e8e99' },
        grid: { color: 'rgba(42,42,51,0.6)' },
        title: { display: true, text: 'km/h', color: '#8e8e99' },
      },
    },
  };

  const tiles = [
    { label: '총 투구수', value: summary.totalPitches, unit: '구' },
    { label: '던진 날', value: summary.activeDays, unit: '일' },
    {
      label: '평균 강도',
      value: summary.avgIntensity ? summary.avgIntensity.toFixed(1) : 0,
      unit: '/ 10',
    },
    {
      label: '최고 구속',
      value: summary.maxVelocity ?? '—',
      unit: summary.maxVelocity ? 'km/h' : '',
    },
  ];

  if (logs.length === 0) {
    return (
      <div className="space-y-10">
        <PageHeading
          eyebrow="Stats"
          title="통계 및 피로도"
          description="투구 기록이 쌓이면 기간별 투구량·강도 추이와 피로도 경고를 볼 수 있습니다."
        />
        <EmptyState
          title="아직 분석할 기록이 없습니다"
          description="투구 기록에서 며칠치를 남기면 이곳에 그래프가 만들어집니다."
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Stats"
        title="통계 및 피로도"
        description="투구량과 강도의 흐름을 확인하고, 이틀 연속 부하가 과했던 구간을 점검하세요."
      />

      {/* 피로도 경고 */}
      {fatigueWindows.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-amber-800/60 bg-amber-950/25 p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <TriangleAlert className="h-5 w-5 shrink-0 text-amber-400" />
            <h2 className="font-bold text-amber-200">
              이틀 합산 강도가 {TWO_DAY_INTENSITY_LIMIT}을 넘은 구간이{' '}
              {fatigueWindows.length}번 있습니다
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-amber-200/80">
            연속한 이틀의 강도 합이 {TWO_DAY_INTENSITY_LIMIT}을 넘으면 어깨와 팔꿈치에
            피로가 누적됩니다. 아래 구간 이후에는 충분한 회복을 두세요.
          </p>
          <ul className="flex flex-wrap gap-2 pt-1">
            {fatigueWindows.slice(0, 8).map((w) => (
              <li
                key={`${w.firstDay}-${w.secondDay}`}
                className="rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-200"
              >
                {formatShortDate(w.firstDay)} → {formatShortDate(w.secondDay)}
                <span className="ml-2 font-bold">합 {w.total}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-gold" />
          <p className="text-sm text-cream">
            최근 30일 동안 이틀 합산 강도가 {TWO_DAY_INTENSITY_LIMIT}을 넘은 구간이
            없습니다. 부하 관리가 잘 되고 있습니다.
          </p>
        </div>
      )}

      {/* 기간 전환 */}
      <div className="flex gap-1 rounded-xl border border-line bg-surface p-1 sm:w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setDays(p.key)}
            className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors sm:flex-none ${
              days === p.key ? 'bg-gold text-ink' : 'text-muted hover:text-cream'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface px-5 py-5">
            <p className="text-xs uppercase tracking-wider text-muted">{t.label}</p>
            <p className="text-display mt-2 text-3xl text-cream">
              {t.value}
              {t.unit && <span className="ml-1 text-sm text-muted">{t.unit}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* 투구량 & 강도 */}
      <Card className="space-y-4">
        <div>
          <h2 className="font-bold text-cream">투구량 &amp; 강도</h2>
          <p className="mt-1 text-sm text-muted">
            막대는 그날 던진 개수, 선은 체감 강도입니다.
          </p>
        </div>
        <div className="h-[300px]">
          <Chart type="bar" data={chartData} options={volumeOptions} />
        </div>
      </Card>

      {/* 구속 추이 */}
      <Card className="space-y-4">
        <div>
          <h2 className="font-bold text-cream">구속 추이</h2>
          <p className="mt-1 text-sm text-muted">
            평균 구속은 입력한 날만 표시됩니다.
          </p>
        </div>
        <div className="h-[300px]">
          <Chart type="line" data={velocityData} options={velocityOptions} />
        </div>
      </Card>
    </div>
  );
}
