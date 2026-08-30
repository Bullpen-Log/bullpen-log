import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { MechanicsClient, type GuideItem } from './mechanics-client';

export default async function MechanicsPage() {
  const user = await requireUser();

  const [guides, progress] = await Promise.all([
    prisma.mechanicsGuide.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.userGuideProgress.findMany({
      where: { userId: user.id, completed: true },
      select: { guideId: true },
    }),
  ]);

  const completedIds = new Set(progress.map((p) => p.guideId));

  const thumbUrls = await createPlaybackUrls(
    guides.map((g) => g.thumbPath).filter((p): p is string => !!p)
  );

  const items: GuideItem[] = guides.map((g) => ({
    id: g.id,
    title: g.title,
    category: g.category,
    description: g.description,
    focusPoints: g.focusPoints,
    equipment: g.equipment,
    videoPath: g.videoPath,
    source: g.source,
    referenceVideoId: g.referenceVideoId,
    aspectRatio: g.aspectRatio,
    /*
     * 참고 영상의 미리보기는 유튜브가 공개한 고정 주소를 그대로 쓴다.
     * 우리 저장소에 담아 두지 않으므로 발급받을 주소도 없다.
     */
    thumbUrl: g.referenceVideoId
      ? referenceThumbUrl(g.referenceVideoId)
      : g.thumbPath
        ? (thumbUrls[g.thumbPath] ?? null)
        : null,
    sortOrder: g.sortOrder,
    done: completedIds.has(g.id),
  }));

  const completedCount = items.filter((g) => g.done).length;

  // 제목과 탭은 라이브러리 레이아웃이 그린다.
  return (
    <div className="space-y-6">
      {items.length > 0 && (
        <div className="flex items-baseline justify-between rounded-2xl border border-line bg-surface px-5 py-4">
          <span className="text-sm text-muted">학습 완료</span>
          <span className="text-display text-2xl leading-none text-sky tabular-nums">
            {completedCount}
            <span className="text-line-strong"> / {items.length}</span>
          </span>
        </div>
      )}

      <MechanicsClient guides={items} isAdmin={user.role === 'ADMIN'} />
    </div>
  );
}
