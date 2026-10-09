'use client';

import { CloudUpload, Loader2 } from 'lucide-react';
import type { useClipFlow } from '@/components/shoot/use-clip-flow';

/** '올리지 못한 영상 N개 · 다시 올리기' — 신호가 끊겨 폰에 맡겨 둔 영상(lib/clip/outbox.ts). 없으면 아무것도 안 그린다 */
export function PendingClips({
  clips,
  isUploaded,
}: {
  clips: ReturnType<typeof useClipFlow>;
  /** 그 운동에 이미 우리 영상이 있나 — 있으면 바꿀지 묻는다 */
  isUploaded: (exerciseId: string) => boolean;
}) {
  if (clips.pending.length === 0) return null;
  return (
    <section
      aria-label="올리지 못한 영상"
      className="motion-safe:animate-fade-in space-y-2 rounded-2xl border border-warn/40 bg-warn/8 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <CloudUpload aria-hidden className="h-5 w-5 shrink-0 text-warn" />
        <p className="min-w-0 flex-1 text-sm text-ink">
          <b className="font-bold">올리지 못한 영상 {clips.pending.length}개</b>
          <span className="block truncate text-xs text-muted">
            {clips.retry
              ? `${clips.retry.index + 1} / ${clips.retry.total} 올리는 중 · ${Math.round(clips.retry.p * 100)}%`
              : clips.pending.map((c) => c.label.split(' ')[0]).join(' · ')}
          </span>
        </p>
        <button
          type="button"
          onClick={() => void clips.retryPending(isUploaded)}
          disabled={!!clips.retry}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-sky px-3.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {clips.retry && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
          다시 올리기
        </button>
      </div>
      {clips.retryError && (
        <p role="alert" className="text-xs break-keep text-danger">
          {clips.retryError}
        </p>
      )}
    </section>
  );
}
