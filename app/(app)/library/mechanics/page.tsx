import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
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
    thumbUrl: g.thumbPath ? (thumbUrls[g.thumbPath] ?? null) : null,
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
          <span className="text-display text-2xl leading-none text-gold tabular-nums">
            {completedCount}
            <span className="text-line-strong"> / {items.length}</span>
          </span>
        </div>
      )}

      <MechanicsClient guides={items} isAdmin={user.role === 'ADMIN'} />
    </div>
  );
}
