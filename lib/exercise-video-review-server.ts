import 'server-only';
import { prisma } from '@/lib/prisma';
import { OLD_OWN_VIDEOS } from '@/lib/shoot/plan';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { reviewVideoTarget, selectReviewVideo, type ReviewSelection } from '@/lib/exercise-video-review';
import type { ExerciseItem } from '@/app/(app)/library/training/training-client';
import type { GuideItem } from '@/app/(app)/library/mechanics/mechanics-client';

/** Review-only reads after requireUser. Never invalidates or changes ordinary library caches. */
export async function freshExerciseReview(items: ExerciseItem[], requested: unknown, isAdmin: boolean): Promise<ReviewSelection<ExerciseItem> & { description?: string }> {
  const target = reviewVideoTarget(requested);
  if (!target) return { status: requested == null ? 'none' : 'invalid', item: null };
  // Keep the existing loaded-list authorization boundary, then recheck current visibility in DB.
  const rows = await prisma.exerciseVideo.findMany({
    where: {
      id: { in: items.map((item) => item.id) },
      ...(isAdmin ? {} : { hiddenAt: null }),
      OR: [{ id: target }, { videoPath: { startsWith: `library/${target}.` } }],
    },
  });
  const selected = selectReviewVideo(rows, target);
  const row = selected.item;
  if (!row) return { status: selected.status, item: null };
  const previous = items.find((item) => item.id === row.id);
  if (!previous) return { status: 'missing', item: null };
  const thumbs = row.referenceVideoId || !row.thumbPath ? {} : await createPlaybackUrls([row.thumbPath]);
  return {
    status: 'selected',
    description: row.description,
    item: {
      ...previous, // Keep this user's favorites, notes and existing usage count.
      title: row.title, category: row.category, bodyParts: row.bodyParts, intensity: row.intensity,
      difficulty: row.difficulty, equipment: row.equipment, targetMuscles: row.targetMuscles ?? [],
      videoPath: row.videoPath, referenceVideoId: row.referenceVideoId, aspectRatio: row.aspectRatio,
      source: row.source === 'OWN' && row.videoPath && OLD_OWN_VIDEOS.has(row.videoPath) ? 'RETAKE' : row.source,
      hiddenAt: row.hiddenAt?.toISOString() ?? null,
      sets: row.sets, reps: row.reps, holdSeconds: row.holdSeconds, restSeconds: row.restSeconds, perSide: row.perSide,
      thumbUrl: row.referenceVideoId ? referenceThumbUrl(row.referenceVideoId) : row.thumbPath ? thumbs[row.thumbPath] ?? null : null,
    },
  };
}

export async function freshGuideReview(items: GuideItem[], requested: unknown): Promise<ReviewSelection<GuideItem>> {
  const target = reviewVideoTarget(requested);
  if (!target) return { status: requested == null ? 'none' : 'invalid', item: null };
  const rows = await prisma.mechanicsGuide.findMany({
    where: {
      id: { in: items.map((item) => item.id) },
      hiddenAt: null, // Existing drill library excludes hidden rows even for admins.
      OR: [{ id: target }, { videoPath: { startsWith: `library/${target}.` } }],
    },
  });
  const selected = selectReviewVideo(rows, target);
  const row = selected.item;
  if (!row) return { status: selected.status, item: null };
  const previous = items.find((item) => item.id === row.id);
  if (!previous) return { status: 'missing', item: null };
  const thumbs = row.referenceVideoId || !row.thumbPath ? {} : await createPlaybackUrls([row.thumbPath]);
  return {
    status: 'selected',
    item: {
      ...previous,
      title: row.title, category: row.category, description: row.description, focusPoints: row.focusPoints,
      equipment: row.equipment, stage: row.stage, videoPath: row.videoPath, source: row.source,
      referenceVideoId: row.referenceVideoId, aspectRatio: row.aspectRatio, sortOrder: row.sortOrder,
      thumbUrl: row.referenceVideoId ? referenceThumbUrl(row.referenceVideoId) : row.thumbPath ? thumbs[row.thumbPath] ?? null : null,
    },
  };
}
