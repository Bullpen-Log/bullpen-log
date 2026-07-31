'use client';

import { useCallback, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Trash2, TriangleAlert } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormError,
  Input,
  PageHeading,
  Textarea,
} from '@/components/ui';
import { PitchCalendar, toDateKey, type DaySummary } from './calendar';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

type Log = {
  id: string;
  date: string;
  velocity: number;
  pitchCount: number;
  intensity: number;
  memo: string | null;
};

const EMPTY_FORM = {
  velocity: '',
  pitchCount: '',
  intensity: '5',
  memo: '',
};

/** 연속한 이틀의 체감 강도 합이 이 값을 넘으면 경고한다. */
const TWO_DAY_INTENSITY_LIMIT = 10;

/** dateKey에서 offset일 만큼 이동한 날짜 키를 반환한다. */
function shiftDateKey(dateKey: string, offset: number) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + offset);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function PitchLogClient({ initialLogs }: { initialLogs: Log[] }) {
  const [logs, setLogs] = useState<Log[]>(initialLogs);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/pitch-log');
      if (!res.ok) throw new Error('기록을 불러오지 못했습니다.');
      setLogs(await res.json());
      setError(undefined);
    } catch {
      setError('기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }, []);

  /** 날짜별 요약 — 캘린더 셀에 표시할 값 */
  const summaries = useMemo(() => {
    return logs.reduce<Record<string, DaySummary>>((acc, log) => {
      const key = log.date.slice(0, 10);
      const prev = acc[key] ?? { count: 0, pitches: 0, maxIntensity: 0 };
      acc[key] = {
        count: prev.count + 1,
        pitches: prev.pitches + log.pitchCount,
        maxIntensity: Math.max(prev.maxIntensity, log.intensity),
      };
      return acc;
    }, {});
  }, [logs]);

  const selectedLogs = useMemo(
    () => logs.filter((log) => log.date.slice(0, 10) === selectedDate),
    [logs, selectedDate]
  );

  const recent = useMemo(() => logs.slice(-30), [logs]);

  /**
   * 지금 입력 중인 강도까지 반영했을 때, 선택한 날과 그 앞/뒷날의
   * 이틀치 강도 합이 한도를 넘는지 계산한다.
   */
  const intensityWarning = useMemo(() => {
    const sumOn = (key: string) =>
      logs
        .filter((l) => l.date.slice(0, 10) === key)
        .reduce((sum, l) => sum + l.intensity, 0);

    const entered = Number(form.intensity) || 0;
    const today = sumOn(selectedDate) + entered;
    const prev = sumOn(shiftDateKey(selectedDate, -1));
    const next = sumOn(shiftDateKey(selectedDate, 1));

    const withPrev = prev + today;
    const withNext = today + next;
    const worst = Math.max(withPrev, withNext);

    if (worst <= TWO_DAY_INTENSITY_LIMIT) return null;

    return withPrev >= withNext
      ? `전날과 합쳐 ${withPrev} — 이틀 합이 ${TWO_DAY_INTENSITY_LIMIT}을 넘습니다.`
      : `다음날과 합쳐 ${withNext} — 이틀 합이 ${TWO_DAY_INTENSITY_LIMIT}을 넘습니다.`;
  }, [logs, selectedDate, form.intensity]);

  const stats = useMemo(() => {
    if (logs.length === 0) return null;
    const velocities = logs.map((l) => l.velocity);
    return {
      sessions: logs.length,
      totalPitches: logs.reduce((sum, l) => sum + l.pitchCount, 0),
      maxVelocity: Math.max(...velocities),
      avgVelocity: velocities.reduce((a, b) => a + b, 0) / velocities.length,
    };
  }, [logs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(undefined);

    try {
      const res = await fetch('/api/pitch-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, date: selectedDate }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '저장에 실패했습니다.');
      }

      setForm(EMPTY_FORM);
      await fetchLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch('/api/pitch-log', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) fetchLogs();
  };

  const chartData = {
    labels: recent.map((l) => l.date.slice(5, 10).replace('-', '/')),
    datasets: [
      {
        label: '구속 (km/h)',
        data: recent.map((l) => l.velocity),
        borderColor: '#c9a96a',
        backgroundColor: 'rgba(201, 169, 106, 0.12)',
        tension: 0.35,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#c9a96a',
        yAxisID: 'y',
      },
      {
        label: '투구수',
        data: recent.map((l) => l.pitchCount),
        borderColor: '#6b7280',
        backgroundColor: 'transparent',
        borderDash: [5, 4],
        tension: 0.35,
        pointRadius: 2,
        yAxisID: 'y1',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        labels: { color: '#8e8e99', usePointStyle: true, boxWidth: 8, padding: 16 },
      },
    },
    scales: {
      x: { ticks: { color: '#8e8e99' }, grid: { color: 'rgba(42, 42, 51, 0.6)' } },
      y: {
        position: 'left' as const,
        ticks: { color: '#c9a96a' },
        grid: { color: 'rgba(42, 42, 51, 0.6)' },
      },
      y1: {
        position: 'right' as const,
        ticks: { color: '#8e8e99' },
        grid: { drawOnChartArea: false },
      },
    },
  };

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Pitch Log"
        title="투구 기록"
        description="캘린더에서 날짜를 선택해 그날의 투구를 기록하세요. 색이 진할수록 체감 강도가 높은 날입니다."
      />

      {stats && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          {[
            { label: '총 기록', value: stats.sessions, unit: '회' },
            { label: '누적 투구수', value: stats.totalPitches, unit: '구' },
            { label: '최고 구속', value: stats.maxVelocity, unit: 'km/h' },
            { label: '평균 구속', value: stats.avgVelocity.toFixed(1), unit: 'km/h' },
          ].map((s) => (
            <div key={s.label} className="bg-surface px-6 py-5">
              <p className="text-xs uppercase tracking-wider text-muted">{s.label}</p>
              <p className="mt-2 text-display text-3xl text-cream">
                {s.value}
                <span className="ml-1 text-sm text-muted">{s.unit}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      <FormError>{error}</FormError>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <PitchCalendar
            month={month}
            onMonthChange={setMonth}
            selected={selectedDate}
            onSelect={setSelectedDate}
            summaries={summaries}
          />
        </Card>

        <Card className="flex flex-col">
          <h3 className="text-sm font-semibold text-cream">최근 30건 추이</h3>
          <div className="mt-4 h-[280px] flex-1">
            {logs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                기록이 쌓이면 그래프가 표시됩니다.
              </div>
            ) : (
              <Line data={chartData} options={chartOptions} />
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-5">
          <div>
            <h3 className="font-bold text-cream">기록 추가</h3>
            <p className="mt-1 text-sm text-muted">{selectedDate}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="구속 (km/h)">
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  value={form.velocity}
                  onChange={(e) => setForm({ ...form, velocity: e.target.value })}
                  placeholder="138"
                  required
                />
              </Field>
              <Field label="투구수">
                <Input
                  type="number"
                  min="1"
                  value={form.pitchCount}
                  onChange={(e) => setForm({ ...form, pitchCount: e.target.value })}
                  placeholder="45"
                  required
                />
              </Field>
            </div>

            <Field
              label={`체감 강도 — ${form.intensity} / 10`}
              hint="연속한 이틀의 강도 합이 10을 넘지 않도록 주의하세요. 어깨·팔꿈치 피로가 누적됩니다."
            >
              <input
                type="range"
                min="1"
                max="10"
                value={form.intensity}
                onChange={(e) => setForm({ ...form, intensity: e.target.value })}
                className="w-full accent-[#c9a96a]"
              />
            </Field>

            {intensityWarning && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{intensityWarning}</span>
              </p>
            )}

            <Field label="컨디션 메모">
              <Textarea
                rows={3}
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                placeholder="팔꿈치 상태 양호, 릴리즈 포인트 일정함"
              />
            </Field>

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? '저장 중…' : '기록 저장'}
            </Button>
          </form>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-baseline justify-between">
            <h3 className="font-bold text-cream">{selectedDate} 기록</h3>
            <span className="text-xs text-muted">{selectedLogs.length}건</span>
          </div>

          {selectedLogs.length === 0 ? (
            <EmptyState
              title="이 날짜에는 기록이 없습니다"
              description="왼쪽 폼에서 오늘의 투구를 남겨보세요."
            />
          ) : (
            <ul className="space-y-3">
              {selectedLogs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-xl border border-line bg-surface-2 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-display text-2xl leading-none text-gold">
                        {log.velocity}
                        <span className="ml-1 text-sm text-muted">km/h</span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge>{log.pitchCount}구</Badge>
                        <Badge>강도 {log.intensity}/10</Badge>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(log.id)}
                      aria-label="기록 삭제"
                      className="rounded-lg p-2 text-muted transition-colors hover:bg-red-950/40 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {log.memo && (
                    <p className="mt-3 border-t border-line pt-3 text-sm leading-relaxed text-muted">
                      {log.memo}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
