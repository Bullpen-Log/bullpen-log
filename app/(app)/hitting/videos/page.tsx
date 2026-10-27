import { requireUser } from '@/lib/dal';
import { allExercises } from '@/lib/library-cache';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { LATER_CATEGORY } from '@/lib/categories';
import { BackLink } from '@/components/back-link';
import { PageHeading } from '@/components/ui';
import { HittingVideoDeck } from './video-deck';

/** 타격에서 운동 영상을 카드로 둘러본다. 전체 운동 목록은 기존 라이브러리에 그대로 둔다. */
export default async function HittingVideosPage() {
  await requireUser();
  const exercises = (await allExercises())
    .filter((x) => !x.hiddenAt && x.category !== LATER_CATEGORY && (x.videoPath || x.referenceVideoId))
    .slice(-24)
    .reverse();
  const thumbs = await createPlaybackUrls(exercises.map((x) => x.thumbPath).filter((p): p is string => !!p));
  const videos = exercises.map((x) => ({
    id: x.id,
    title: x.title,
    category: x.category,
    videoPath: x.videoPath,
    referenceVideoId: x.referenceVideoId,
    aspectRatio: x.aspectRatio,
    thumbUrl: x.referenceVideoId ? referenceThumbUrl(x.referenceVideoId) : x.thumbPath ? (thumbs[x.thumbPath] ?? null) : null,
  }));
  return (
    <div className="stack-page">
      <BackLink href="/hitting">타격</BackLink>
      <PageHeading title="운동 영상" />
      <HittingVideoDeck videos={videos} />
    </div>
  );
}
