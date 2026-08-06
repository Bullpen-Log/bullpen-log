'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { Card, EmptyState, FormError, PageHeading } from '@/components/ui';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { toDateKey } from '@/lib/pitch-stats';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import { PitchCalendar, type DaySummary } from './calendar';
import { EntryForm } from './entry-form';
import { DayRecord } from './day-record';
import { CompareView, type ClipOption } from './compare-view';

export type Log = {
  id: string;
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number;
  avgVelocity: number | null;
  memo: string | null;
  videoPaths: string[];
};

const MODES = [
  { key: 'day', label: '날짜별 보기' },
  { key: 'compare', label: '2분할 비교' },
] as const;

/**
 * 투구 일지 — 기록, 영상, 폼 분석, 느낀점을 날짜 하나로 묶어 본다.
 *
 * 달력에서 날짜를 고르면 그날 있었던 일이 전부 아래에 나온다.
 * 예전에는 이게 '투구기록'과 '영상분석' 두 화면으로 나뉘어 있었는데,
 * 둘 다 같은 PitchLog 를 보고 있어 원래 한 몸이었다.
 */
export function PitchLogClient({
  initialLogs,
  heightCm,
  savedAnalyses,
}: {
  initialLogs: Log[];
  heightCm: number | null;
  savedAnalyses: SavedAnalysisView[];
}) {
  const [logs, setLogs] = useState<Log[]>(initialLogs);
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<'day' | 'compare'>('day');

  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  /**
   * 폼을 펼쳐 둘지. null 이면 "알아서" — 기록이 없는 날은 열고, 있는 날은 접는다.
   * 날짜를 바꾸면 다시 null 로 돌려 그 날짜에 맞게 정한다.
   */
  const [formOpen, setFormOpen] = useState<boolean | null>(null);

  const selectDate = useCallback((date: string) => {
    setSelectedDate(date);
    setFormOpen(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/pitch-log');
      if (!res.ok) throw new Error();
      setLogs(await res.json());
      setError(undefined);
    } catch {
      setError('기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch('/api/pitch-log', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) refresh();
    },
    [refresh]
  );

  const summaries = useMemo(() => {
    return logs.reduce<Record<string, DaySummary>>((acc, log) => {
      const key = log.date.slice(0, 10);
      const prev = acc[key] ?? { pitches: 0, maxIntensity: 0, hasVideo: false };
      acc[key] = {
        pitches: prev.pitches + log.pitchCount,
        maxIntensity: Math.max(prev.maxIntensity, log.intensity),
        hasVideo: prev.hasVideo || log.videoPaths.length > 0,
      };
      return acc;
    }, {});
  }, [logs]);

  const selectedLogs = useMemo(
    () => logs.filter((l) => l.date.slice(0, 10) === selectedDate),
    [logs, selectedDate]
  );

  const showForm = formOpen ?? selectedLogs.length === 0;

  /* ---------------------------- 영상 ---------------------------- */

  const withVideo = useMemo(
    () => logs.filter((l) => l.videoPaths.length > 0),
    [logs]
  );

  // 선택한 날짜의 영상 주소만 받아온다. 기록이 많아지면 전부 발급하기엔 느리다.
  const selectedPaths = useMemo(
    () => selectedLogs.flatMap((l) => l.videoPaths),
    [selectedLogs]
  );
  const { urls: playbackUrls, loading: urlsLoading, ready: urlsReady } =
    usePlaybackUrls(selectedPaths);

  const savedByPath = useMemo(
    () => new Map(savedAnalyses.map((a) => [a.videoPath, a])),
    [savedAnalyses]
  );

  const savedFor = useCallback(
    (videoPath: string) => savedByPath.get(videoPath) ?? null,
    [savedByPath]
  );

  /** 이 영상보다 앞선 날짜의 가장 최근 저장 분석 — 변화 비교의 기준 */
  const previousFor = useCallback(
    (date: string, videoPath: string): SavedAnalysisView | null => {
      let best: SavedAnalysisView | null = null;
      for (const a of savedAnalyses) {
        if (a.videoPath === videoPath || a.date >= date) continue;
        if (
          !best ||
          a.date > best.date ||
          (a.date === best.date && a.updatedAt > best.updatedAt)
        ) {
          best = a;
        }
      }
      return best;
    },
    [savedAnalyses]
  );

  /** 비교 화면에서 고를 수 있는 영상 목록 (오래된 순) */
  const clips = useMemo<ClipOption[]>(
    () =>
      withVideo.flatMap((log) =>
        log.videoPaths.map((path, i) => ({
          id: `${log.id}-${i}`,
          date: log.date.slice(0, 10),
          path,
          label: log.videoPaths.length > 1 ? `영상 ${i + 1}` : '영상',
          summary: `${log.maxVelocity}km/h · ${log.pitchCount}구 · 강도 ${log.intensity}/10`,
        }))
      ),
    [withVideo]
  );

  /** 영상이 있는 날짜만 앞뒤로 건너뛴다 — 폼을 되돌아볼 때 쓴다. */
  const videoDates = useMemo(
    () => [...new Set(withVideo.map((l) => l.date.slice(0, 10)))].sort(),
    [withVideo]
  );

  const goToVideoDate = (offset: number) => {
    if (videoDates.length === 0) return;
    const currentIndex = videoDates.indexOf(selectedDate);
    // 지금 날짜에 영상이 없으면 가까운 쪽에서 출발한다.
    const base =
      currentIndex >= 0
        ? currentIndex
        : videoDates.findIndex((d) => d > selectedDate) - (offset > 0 ? 1 : 0);
    const next = Math.min(Math.max(base + offset, 0), videoDates.length - 1);
    const target = videoDates[next];
    if (!target) return;
    selectDate(target);
    const [y, m] = target.split('-').map(Number);
    setMonth(new Date(y, m - 1, 1));
  };

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Pitch Log"
        title="투구 일지"
        description="날짜를 고르면 그날의 기록·영상·느낀점이 한 번에 열립니다. 기간별 정리는 'AI 리포트'에서 볼 수 있습니다."
        action={
          videoDates.length > 0 && mode === 'day' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToVideoDate(-1)}
                aria-label="이전 영상 날짜"
                className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-sky hover:text-sky"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-muted">영상 {videoDates.length}일</span>
              <button
                type="button"
                onClick={() => goToVideoDate(1)}
                aria-label="다음 영상 날짜"
                className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-sky hover:text-sky"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : undefined
        }
      />

      <FormError>{error}</FormError>

      {/* 2분할 비교는 영상이 두 개 이상 있어야 뜻이 있다. */}
      {clips.length >= 2 && (
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1 sm:w-fit">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors sm:flex-none ${
                mode === m.key ? 'bg-sky text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {mode === 'compare' ? (
        <CompareView clips={clips} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
          <Card className="lg:sticky lg:top-24 lg:self-start">
            <PitchCalendar
              month={month}
              onMonthChange={setMonth}
              selected={selectedDate}
              onSelect={selectDate}
              summaries={summaries}
            />
          </Card>

          <div className="space-y-5">
            <div className="flex items-baseline justify-between border-b border-line pb-3">
              <h2 className="text-lg font-bold text-ink">{selectedDate}</h2>
              <span className="text-xs text-muted">
                {selectedLogs.length > 0 ? `${selectedLogs.length}건의 기록` : '기록 없음'}
              </span>
            </div>

            {/* 기록 추가 — 기록이 없는 날은 바로 열려 있다. */}
            {showForm ? (
              <Card className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-ink">기록 추가</h3>
                    <p className="mt-1 text-sm text-muted">{selectedDate}</p>
                  </div>
                  {selectedLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFormOpen(false)}
                      aria-label="입력 폼 닫기"
                      className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <EntryForm
                  key={selectedDate}
                  date={selectedDate}
                  onSaved={refresh}
                  onError={setError}
                />
              </Card>
            ) : (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-sky-soft bg-sky-tint px-4 py-3.5 text-sm font-medium text-sky-strong transition-colors hover:bg-sky-tint/70"
              >
                <Plus className="h-4 w-4" />이 날짜에 기록 추가
              </button>
            )}

            {selectedLogs.length === 0 && !showForm && (
              <EmptyState
                title="이 날짜에는 기록이 없습니다"
                description="달력에서 색이 있는 날짜를 골라보세요."
              />
            )}

            {selectedLogs.map((log) => (
              <DayRecord
                key={log.id}
                log={log}
                date={selectedDate}
                heightCm={heightCm}
                playbackUrls={playbackUrls}
                urlsPending={urlsLoading || !urlsReady}
                savedFor={savedFor}
                previousFor={previousFor}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
