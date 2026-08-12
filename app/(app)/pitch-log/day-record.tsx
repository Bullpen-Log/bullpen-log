'use client';

import { Trash2, VideoOff } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { PitchVideoPlayer } from '@/components/pitch-video-player';
import { PoseAnalysis } from '@/components/pose-analysis';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import type { Log } from './pitch-log-client';

/**
 * 기록 한 건을 통째로 보여준다 — 수치, 영상, 폼 분석, 느낀점.
 *
 * 예전에는 수치·느낀점이 '투구기록'에, 영상·폼 분석이 '영상분석'에
 * 나뉘어 있었다. 그날 무슨 일이 있었는지 알려면 두 화면을 오가야 했는데,
 * 원래 한 기록이므로 여기서 한 번에 본다.
 */
export function DayRecord({
  log,
  date,
  heightCm,
  playbackUrls,
  urlsPending,
  savedFor,
  previousFor,
  onDelete,
}: {
  log: Log;
  date: string;
  heightCm: number | null;
  playbackUrls: Record<string, string>;
  /** 재생 주소를 아직 받아오는 중인가 */
  urlsPending: boolean;
  savedFor: (videoPath: string) => SavedAnalysisView | null;
  previousFor: (date: string, videoPath: string) => SavedAnalysisView | null;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="space-y-5">
      {/* 그날의 수치 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-display text-2xl leading-none text-sky">
            {log.maxVelocity}
            <span className="ml-1 text-sm text-muted">km/h 최고</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge className="border-sky-soft/60 font-semibold text-sky-strong">
              {log.sessionType}
            </Badge>
            <Badge>{log.pitchCount}구</Badge>
            <Badge>강도 {log.intensity}/10</Badge>
            {log.avgVelocity != null && (
              <Badge>평균 {log.avgVelocity} km/h</Badge>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(log.id)}
          aria-label="기록 삭제"
          className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-bg hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* 영상과 폼 분석 */}
      {log.videoPaths.length > 0 ? (
        <div className="grid gap-5">
          {log.videoPaths.map((path, i) => (
            <div key={path} className="space-y-2">
              {playbackUrls[path] ? (
                <>
                  <PitchVideoPlayer
                    src={playbackUrls[path]}
                    label={`${date} 투구 영상 ${i + 1}`}
                  />
                  {/* 관절 추출 + 스켈레톤 + 구간 검출 + 지표 측정 + 저장/비교 */}
                  <PoseAnalysis
                    src={playbackUrls[path]}
                    label={`${date} 투구 영상 ${i + 1}`}
                    heightCm={heightCm}
                    pitchLogId={log.id}
                    videoPath={path}
                    saved={savedFor(path)}
                    previous={previousFor(date, path)}
                  />
                </>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-xl border border-line bg-surface-2 text-xs text-muted">
                  {urlsPending ? '불러오는 중…' : '영상을 불러올 수 없습니다'}
                </div>
              )}
              {log.videoPaths.length > 1 && (
                <p className="text-xs text-muted">영상 {i + 1}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-5 text-sm text-muted">
          <VideoOff className="h-4 w-4" />이 기록에는 영상이 없습니다
        </p>
      )}

      {/* 그날의 느낀점 */}
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-sky">
          그날의 느낀점
        </p>
        {log.memo ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
            {log.memo}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">남긴 메모가 없습니다.</p>
        )}
      </div>
    </Card>
  );
}
