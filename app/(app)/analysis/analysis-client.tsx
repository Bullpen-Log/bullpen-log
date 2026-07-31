'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, VideoOff } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeading } from '@/components/ui';
import { PitchVideoPlayer } from '@/components/pitch-video-player';
import { toDateKey } from '@/lib/pitch-stats';
import { PitchCalendar, type DaySummary } from '@/app/(app)/pitch-log/calendar';
import type { Log } from '@/app/(app)/pitch-log/pitch-log-client';
import { CompareView, type ClipOption } from './compare-view';

/** 서버에서 재생용 임시 주소까지 붙여 내려준 형태 */
export type AnalysisLog = Log & {
  videos: { path: string; url: string | null }[];
};

const MODES = [
  { key: 'single', label: '단일 보기' },
  { key: 'compare', label: '2분할 비교' },
] as const;

export function AnalysisClient({ logs }: { logs: AnalysisLog[] }) {
  const [mode, setMode] = useState<'single' | 'compare'>('single');

  const withVideo = useMemo(
    () => logs.filter((l) => l.videoPaths.length > 0),
    [logs]
  );

  /** 비교 화면에서 고를 수 있는 영상 목록 (오래된 순) */
  const clips = useMemo<ClipOption[]>(
    () =>
      withVideo.flatMap((log) =>
        log.videos
          .filter((v) => v.url)
          .map((v, i) => ({
            id: `${log.id}-${i}`,
            date: log.date.slice(0, 10),
            url: v.url as string,
            label: log.videos.length > 1 ? `영상 ${i + 1}` : '영상',
            summary: `${log.maxVelocity}km/h · ${log.pitchCount}구 · 강도 ${log.intensity}/10`,
          }))
      ),
    [withVideo]
  );

  // 영상이 있는 가장 최근 날짜를 기본으로 연다.
  const latestVideoDate = withVideo.at(-1)?.date.slice(0, 10);

  const [selectedDate, setSelectedDate] = useState(
    () => latestVideoDate ?? toDateKey(new Date())
  );
  const [month, setMonth] = useState(() => {
    const [y, m] = (latestVideoDate ?? toDateKey(new Date())).split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

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

  const videoDates = useMemo(
    () => [...new Set(withVideo.map((l) => l.date.slice(0, 10)))].sort(),
    [withVideo]
  );

  const currentIndex = videoDates.indexOf(selectedDate);

  const goToVideoDate = (offset: number) => {
    if (videoDates.length === 0) return;
    // 현재 날짜에 영상이 없으면 가장 가까운 쪽으로 이동한다.
    const base =
      currentIndex >= 0
        ? currentIndex
        : videoDates.findIndex((d) => d > selectedDate) - (offset > 0 ? 1 : 0);
    const next = Math.min(
      Math.max(base + offset, 0),
      videoDates.length - 1
    );
    const target = videoDates[next];
    if (!target) return;
    setSelectedDate(target);
    const [y, m] = target.split('-').map(Number);
    setMonth(new Date(y, m - 1, 1));
  };

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Analysis"
        title="영상분석"
        description="날짜를 선택하면 그날 던진 영상과 함께 그때의 기록·느낀점을 볼 수 있습니다. 과거 폼과 지금을 비교해보세요."
        action={
          videoDates.length > 0 && mode === 'single' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToVideoDate(-1)}
                aria-label="이전 영상 날짜"
                className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-gold hover:text-gold"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-muted">
                영상 {videoDates.length}일
              </span>
              <button
                type="button"
                onClick={() => goToVideoDate(1)}
                aria-label="다음 영상 날짜"
                className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-gold hover:text-gold"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : undefined
        }
      />

      {/* 보기 방식 전환 */}
      {withVideo.length > 0 && (
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1 sm:w-fit">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors sm:flex-none ${
                mode === m.key ? 'bg-gold text-ink' : 'text-muted hover:text-cream'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {withVideo.length === 0 ? (
        <EmptyState
          title="아직 등록된 영상이 없습니다"
          description="투구 기록을 남길 때 영상을 함께 올리면 이곳에서 다시 볼 수 있습니다."
        />
      ) : mode === 'compare' ? (
        <CompareView clips={clips} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
          <Card className="lg:sticky lg:top-24 lg:self-start">
            <PitchCalendar
              month={month}
              onMonthChange={setMonth}
              selected={selectedDate}
              onSelect={setSelectedDate}
              summaries={summaries}
              videoOnly
            />
          </Card>

          <div className="space-y-6">
            <div className="flex items-baseline justify-between border-b border-line pb-3">
              <h2 className="text-lg font-bold text-cream">{selectedDate}</h2>
              <span className="text-xs text-muted">{selectedLogs.length}건의 기록</span>
            </div>

            {selectedLogs.length === 0 ? (
              <EmptyState
                title="이 날짜에는 기록이 없습니다"
                description="달력에서 색이 있는 날짜를 선택해보세요."
              />
            ) : (
              selectedLogs.map((log) => (
                <Card key={log.id} className="space-y-5">
                  {/* 그날의 수치 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-display text-2xl leading-none text-gold">
                      {log.maxVelocity}
                      <span className="ml-1 text-sm text-muted">km/h 최고</span>
                    </span>
                    <span className="ml-auto flex flex-wrap gap-1.5">
                      <Badge>{log.pitchCount}구</Badge>
                      <Badge>강도 {log.intensity}/10</Badge>
                      {log.avgVelocity != null && (
                        <Badge>평균 {log.avgVelocity} km/h</Badge>
                      )}
                    </span>
                  </div>

                  {/* 영상 */}
                  {log.videos.length > 0 ? (
                    <div className="grid gap-5">
                      {log.videos.map((video, i) => (
                        <div key={video.path} className="space-y-2">
                          {video.url ? (
                            <PitchVideoPlayer
                              src={video.url}
                              label={`${selectedDate} 투구 영상 ${i + 1}`}
                            />
                          ) : (
                            <div className="flex aspect-video items-center justify-center rounded-xl border border-line bg-surface-2 text-xs text-muted">
                              영상을 불러올 수 없습니다
                            </div>
                          )}
                          <p className="text-xs text-muted">영상 {i + 1}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted">
                      <VideoOff className="h-4 w-4" />이 기록에는 영상이 없습니다
                    </p>
                  )}

                  {/* 그날의 느낀점 */}
                  <div className="rounded-xl border border-line bg-surface-2 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-gold">
                      그날의 느낀점
                    </p>
                    {log.memo ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-cream/90">
                        {log.memo}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted">남긴 메모가 없습니다.</p>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
