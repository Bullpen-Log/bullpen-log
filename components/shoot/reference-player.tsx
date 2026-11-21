'use client';

import { YouTubeExercisePlayer } from '@/components/exercise-video/youtube-player';
import { MechanicsReferenceVideo } from '@/components/mechanics-reference-video';
import { instagramReferenceLabel } from '@/lib/mechanics/reference-draft';
import { referenceWatchUrl, videoFrameClass } from '@/lib/reference-video';
import type { ShootReference } from '@/lib/shoot/reference';

/** Mounted only after the viewer chooses an exercise to watch. */
export function ShootReferencePlayer({ exerciseId, reference, title }: { exerciseId: string; reference: ShootReference; title: string }) {
  if (reference.kind === 'youtube') {
    return (
      <div className="space-y-2">
        <YouTubeExercisePlayer videoId={reference.id} title={title} frame={videoFrameClass(reference.aspectRatio)} />
        <a className="inline-flex min-h-10 items-center text-xs font-medium text-sky-strong" href={referenceWatchUrl(reference.id)} target="_blank" rel="noopener noreferrer">
          YouTube에서 열기 ↗
        </a>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-sm space-y-2">
      {reference.segment?.recorded ? (
        <MechanicsReferenceVideo id={exerciseId} title={title} panel={reference.segment.panel} />
      ) : (
        <iframe
          title={`${title} Instagram 참고 영상`}
          src={reference.embedUrl}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          className="h-[min(35rem,70dvh)] min-h-80 w-full rounded-xl border border-line bg-surface-2"
        />
      )}
      <a className="inline-flex min-h-10 items-center text-xs font-medium text-sky-strong" href={reference.url} target="_blank" rel="noopener noreferrer">
        {reference.segment?.recorded ? instagramReferenceLabel(reference.segment) : '재생이 안 되면 Instagram에서 열기 ↗'}
      </a>
    </div>
  );
}
