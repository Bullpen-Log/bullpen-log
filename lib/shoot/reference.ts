import { YT_ID } from '@/lib/exercise-video-state';
import { canonicalInstagramLink, splitInstagramReference, type InstagramSegment } from '@/lib/mechanics/reference-draft';
import type { ShootExerciseInfo } from '@/lib/shoot/load';

export type ShootReference =
  | { kind: 'youtube'; id: string; aspectRatio: number | null }
  | { kind: 'instagram'; url: string; embedUrl: string; segment?: InstagramSegment };

export function instagramShootReference(value: string | null, segment?: InstagramSegment): Extract<ShootReference, { kind: 'instagram' }> | null {
  const url = value && canonicalInstagramLink(value);
  return url ? { kind: 'instagram', url, embedUrl: `${url}embed/`, segment } : null;
}

export function shootReferenceOf(info: Pick<ShootExerciseInfo, 'youtube' | 'description'> | undefined): ShootReference | null {
  if (info?.youtube && YT_ID.test(info.youtube.id)) return { kind: 'youtube', ...info.youtube };
  const { url, segment } = splitInstagramReference(info?.description ?? '');
  return instagramShootReference(url, segment);
}
