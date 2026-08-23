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
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Info,
  Minus,
  NotebookPen,
  TriangleAlert,
} from 'lucide-react';
import { Card, EmptyState, PageHeading } from '@/components/ui';
import { useChartTheme } from '@/lib/chart-theme';
import {
  TWO_DAY_INTENSITY_LIMIT,
  buildDateRange,
  buildDateRangeOffset,
  buildReportFindings,
  findFatigueWindows,
  formatShortDate,
  groupByDay,
  longestThrowStreak,
  summarize,
  type ReportFinding,
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

const TONE_STYLES: Record<
  ReportFinding['tone'],
  { box: string; icon: string; Icon: typeof CheckCircle2 }
> = {
  good: { box: 'border-line bg-surface', icon: 'text-sky', Icon: CheckCircle2 },
  info: { box: 'border-line bg-surface', icon: 'text-muted', Icon: Info },
  warn: {
    box: 'border-warn-line bg-warn-bg',
    icon: 'text-warn',
    Icon: TriangleAlert,
  },
};

/** 지표 한 줄 — 값과 직전 기간 대비 변화를 함께 보여준다. */
function MetricRow({
  label,
  value,
  unit,
  delta,
  deltaUnit = '',
  invert = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  /** 직전 동일 기간과의 차이. null이면 비교할 수 없음 */
  delta?: number | null;
  deltaUnit?: string;
  /** 늘어나는 것이 주의 신호인 지표인지 (예: 부하) */
  invert?: boolean;
}) {
  const rounded = delta == null ? null : Math.round(delta * 10) / 10;
  const flat = rounded == null || Math.abs(rounded) < 0.05;
  const rising = !flat && (rounded as number) > 0;
  const positive = invert ? !rising : rising;

  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-display text-2xl tabular-nums text-ink">
          {value}
          {unit && <span className="ml-1 text-xs text-muted">{unit}</span>}
        </span>
        {rounded != null && (
          <span
            className={`flex items-center gap-0.5 text-[11px] tabular-nums ${
              flat ? 'text-muted' : positive ? 'text-sky' : 'text-warn'
            }`}
          >
            {flat ? (
              <Minus className="h-3 w-3" />
            ) : rising ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {flat ? '변화 없음' : `${Math.abs(rounded)}${deltaUnit}`}
          </span>
        )}
      </span>
    </div>
  );
}

export function ReportClient({
  logs,
  nickname,
}: {
  logs: Log[];
  nickname: string;
}) {
  const [days, setDays] = useState<7 | 30>(7);

  const chart = useChartTheme();
  const byDay = useMemo(() => groupByDay(logs), [logs]);

  const currentKeys = useMemo(() => buildDateRange(days), [days]);
  const previousKeys = useMemo(() => buildDateRangeOffset(days, days), [days]);

  const current = useMemo(() => summarize(byDay, currentKeys), [byDay, currentKeys]);
  const previous = useMemo(
    () => summarize(byDay, previousKeys),
    [byDay, previousKeys]
  );

  const fatigueWindows = useMemo(
    () => findFatigueWindows(byDay, currentKeys),
    [byDay, currentKeys]
  );
  const streak = useMemo(
    () => longestThrowStreak(byDay, currentKeys),
    [byDay, currentKeys]
  );

  const findings = useMemo(
    () =>
      buildReportFindings({
        days,
        current,
        previous,
        fatigueCount: fatigueWindows.length,
        streak,
      }),
    [days, current, previous, fatigueWindows.length, streak]
  );

  /* ------------------------------- 메모 ------------------------------- */

  const memoLogs = useMemo(
    () => logs.filter((l) => l.memo?.trim()).reverse(),
    [logs]
  );
  const memoDates = useMemo(
    () => [...new Set(memoLogs.map((l) => l.date.slice(0, 10)))],
    [memoLogs]
  );

  const [pickedMemoDate, setPickedMemoDate] = useState<string | null>(null);
  const activeMemoDate = pickedMemoDate ?? memoDates[0] ?? null;
  const activeMemos = useMemo(
    () => memoLogs.filter((l) => l.date.slice(0, 10) === activeMemoDate),
    [memoLogs, activeMemoDate]
  );

  /* ------------------------------ 그래프 ------------------------------ */

  const volumeData = useMemo(
    () => ({
      labels: currentKeys.map(formatShortDate),
      datasets: [
        {
          type: 'bar' as const,
          label: '투구수',
          data: currentKeys.map((k) => byDay.get(k)?.pitchCount ?? 0),
          backgroundColor: `${chart.accent}3d`,
          borderColor: `${chart.accent}80`,
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line' as const,
          label: '투구 강도',
          data: currentKeys.map((k) => byDay.get(k)?.intensity ?? 0),
          borderColor: chart.accentStrong,
          backgroundColor: chart.accentStrong,
          tension: 0.35,
          pointRadius: days === 7 ? 4 : 2,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    }),
    [byDay, currentKeys, days, chart]
  );

  const velocityData = useMemo(
    () => ({
      labels: currentKeys.map(formatShortDate),
      datasets: [
        {
          type: 'line' as const,
          label: '최고 구속',
          data: currentKeys.map((k) => byDay.get(k)?.maxVelocity ?? null),
          borderColor: chart.accent,
          backgroundColor: `${chart.accent}1f`,
          tension: 0.35,
          fill: true,
          pointRadius: days === 7 ? 4 : 2,
          spanGaps: true,
        },
        {
          type: 'line' as const,
          label: '평균 구속',
          data: currentKeys.map((k) => byDay.get(k)?.avgVelocity ?? null),
          borderColor: chart.tick,
          backgroundColor: 'transparent',
          borderDash: [5, 4],
          tension: 0.35,
          pointRadius: days === 7 ? 3 : 1,
          spanGaps: true,
        },
      ],
    }),
    [byDay, currentKeys, days, chart]
  );

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        labels: { color: chart.tick, usePointStyle: true, boxWidth: 8, padding: 16 },
      },
    },
  };

  const volumeOptions = {
    ...baseOptions,
    scales: {
      x: { ticks: { color: chart.tick }, grid: { color: chart.grid } },
      y: {
        position: 'left' as const,
        beginAtZero: true,
        title: { display: true, text: '투구수', color: chart.tick },
        ticks: { color: chart.tick },
        grid: { color: chart.grid },
      },
      y1: {
        position: 'right' as const,
        beginAtZero: true,
        suggestedMax: 10,
        title: { display: true, text: '강도', color: chart.accentStrong },
        ticks: { color: chart.accentStrong, stepSize: 2 },
        grid: { drawOnChartArea: false },
      },
    },
  };

  const velocityOptions = {
    ...baseOptions,
    scales: {
      x: { ticks: { color: chart.tick }, grid: { color: chart.grid } },
      y: {
        ticks: { color: chart.tick },
        grid: { color: chart.grid },
        title: { display: true, text: 'km/h', color: chart.tick },
      },
    },
  };

  const periodLabel = `최근 ${days}일`;
  const rangeLabel = `${formatShortDate(currentKeys[0])} – ${formatShortDate(
    currentKeys.at(-1) as string
  )}`;

  if (logs.length === 0) {
    return (
      <div className="space-y-10">
        <PageHeading
          eyebrow="Report"
          title="리포트"
          description="투구 기록이 쌓이면 기간별 투구량·강도·구속을 정리한 리포트를 만들어 드립니다."
        />
        <EmptyState
          title="아직 정리할 기록이 없습니다"
          description="투구 기록에서 며칠치를 남기면 이곳에 리포트가 만들어집니다."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Report"
        title="리포트"
        description={`${nickname}님의 ${periodLabel} 투구 기록을 정리했습니다.`}
      />

      {/* 기간 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setDays(p.key)}
              className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
                days === p.key ? 'bg-sky text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-xs tabular-nums text-muted">{rangeLabel}</span>
      </div>

      {/* 요약 지표 — 직전 동일 기간과 비교 */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <h2 className="text-sm font-bold text-ink">투구량</h2>
          <p className="mb-2 mt-1 text-xs text-muted">직전 {days}일과 비교</p>
          <MetricRow
            label="총 투구수"
            value={current.totalPitches}
            unit="구"
            delta={current.totalPitches - previous.totalPitches}
            deltaUnit="구"
            invert
          />
          <MetricRow
            label="던진 날"
            value={current.activeDays}
            unit="일"
            delta={current.activeDays - previous.activeDays}
            deltaUnit="일"
          />
          <MetricRow
            label="던진 날 평균"
            value={current.pitchesPerActiveDay.toFixed(0)}
            unit="구"
            delta={current.pitchesPerActiveDay - previous.pitchesPerActiveDay}
            deltaUnit="구"
            invert
          />
          <MetricRow label="하루 최다" value={current.maxDailyPitches} unit="구" />
        </Card>

        <Card>
          <h2 className="text-sm font-bold text-ink">투구 강도</h2>
          <p className="mb-2 mt-1 text-xs text-muted">1~10 자가 평가 기준</p>
          <MetricRow
            label="평균 강도"
            value={current.avgIntensity.toFixed(1)}
            unit="/ 10"
            delta={current.avgIntensity - previous.avgIntensity}
            invert
          />
          <MetricRow label="최고 강도" value={current.peakIntensity} unit="/ 10" />
          <MetricRow
            label={`이틀 합산 ${TWO_DAY_INTENSITY_LIMIT} 초과`}
            value={fatigueWindows.length}
            unit="회"
          />
          <MetricRow label="최장 연투" value={streak} unit="일" />
        </Card>

        <Card>
          <h2 className="text-sm font-bold text-ink">구속</h2>
          <p className="mb-2 mt-1 text-xs text-muted">직전 {days}일과 비교</p>
          <MetricRow
            label="최고 구속"
            value={current.maxVelocity ?? '—'}
            unit={current.maxVelocity ? 'km/h' : ''}
            delta={
              current.maxVelocity != null && previous.maxVelocity != null
                ? current.maxVelocity - previous.maxVelocity
                : null
            }
            deltaUnit="km/h"
          />
          <MetricRow
            label="평균 구속"
            value={current.avgVelocity ? current.avgVelocity.toFixed(1) : '—'}
            unit={current.avgVelocity ? 'km/h' : ''}
            delta={
              current.avgVelocity != null && previous.avgVelocity != null
                ? current.avgVelocity - previous.avgVelocity
                : null
            }
            deltaUnit="km/h"
          />
        </Card>
      </div>

      {/* 코멘트 */}
      {findings.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">코멘트</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {findings.map((f) => {
              const style = TONE_STYLES[f.tone];
              const Icon = style.Icon;
              return (
                <div
                  key={f.title}
                  className={`flex gap-3 rounded-xl border p-4 ${style.box}`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{f.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {f.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {fatigueWindows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-4">
              <span className="text-xs text-muted">해당 구간</span>
              {fatigueWindows.slice(0, 10).map((w) => (
                <span
                  key={`${w.firstDay}-${w.secondDay}`}
                  className="rounded-lg border border-warn-line bg-warn-bg px-2.5 py-1 text-[11px] tabular-nums text-warn"
                >
                  {formatShortDate(w.firstDay)}→{formatShortDate(w.secondDay)} 합{' '}
                  {w.total}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 그래프 */}
      <section className="space-y-5">
        <h2 className="text-lg font-bold text-ink">추이</h2>

        <Card className="space-y-4">
          <div>
            <h3 className="font-bold text-ink">투구량 &amp; 강도</h3>
            <p className="mt-1 text-sm text-muted">
              막대는 그날 던진 개수, 선은 체감 강도입니다.
            </p>
          </div>
          <div className="h-[280px]">
            <Chart type="bar" data={volumeData} options={volumeOptions} />
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <h3 className="font-bold text-ink">구속</h3>
            <p className="mt-1 text-sm text-muted">
              평균 구속은 입력한 날만 표시됩니다.
            </p>
          </div>
          <div className="h-[280px]">
            <Chart type="line" data={velocityData} options={velocityOptions} />
          </div>
        </Card>
      </section>

      {/* 메모 모아보기 */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-ink">기록 메모</h2>
          <span className="text-xs text-muted">메모 남긴 날 {memoDates.length}일</span>
        </div>

        {memoDates.length === 0 ? (
          <EmptyState
            title="남긴 메모가 없습니다"
            description="투구 기록의 '특이사항 · 느낀점'에 적은 내용이 이곳에 모입니다."
          />
        ) : (
          <Card className="space-y-4">
            {/* 날짜 선택 — 최근 날짜가 앞에 온다 */}
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
              {memoDates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPickedMemoDate(d)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-xs tabular-nums transition-colors ${
                    d === activeMemoDate
                      ? 'border-sky bg-sky/10 text-sky'
                      : 'border-line text-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {formatShortDate(d)}
                </button>
              ))}
            </div>

            {/* 선택한 날짜의 메모 */}
            <div className="space-y-3 border-t border-line pt-4">
              {activeMemos.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-line bg-surface-2 p-4"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted">
                    <span className="text-ink">{log.date.slice(0, 10)}</span>
                    <span>{log.pitchCount}구</span>
                    <span>강도 {log.intensity}/10</span>
                    {log.maxVelocity != null && (
                      <span>최고 {log.maxVelocity}km/h</span>
                    )}
                    {log.avgVelocity != null && (
                      <span>평균 {log.avgVelocity}km/h</span>
                    )}
                  </div>
                  <p className="mt-3 flex gap-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                    <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
                    {log.memo}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
