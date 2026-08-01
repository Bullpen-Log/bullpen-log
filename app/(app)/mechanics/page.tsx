import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { getYouTubeEmbedUrl, getYouTubeThumbnail } from '@/lib/youtube';
import { PageHeading } from '@/components/ui';
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

  const items: GuideItem[] = guides.map((g) => ({
    id: g.id,
    title: g.title,
    category: g.category,
    description: g.description,
    focusPoints: g.focusPoints,
    equipment: g.equipment,
    embedUrl: getYouTubeEmbedUrl(g.videoUrl),
    thumbnailUrl: getYouTubeThumbnail(g.videoUrl),
    done: completedIds.has(g.id),
  }));

  const completedCount = items.filter((g) => g.done).length;

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Mechanics"
        title="투구 메커니즘 가이드"
        description="투구 동작을 3가지 드릴 파트로 나눠 학습합니다. 보고 싶은 파트를 눌러 드릴을 확인하세요."
        action={
          items.length > 0 ? (
            <div className="sm:text-right">
              <p className="text-display text-3xl leading-none text-gold">
                {completedCount}
                <span className="text-line-strong"> / {items.length}</span>
              </p>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted">
                학습 완료
              </p>
            </div>
          ) : undefined
        }
      />

      <MechanicsClient guides={items} isAdmin={user.role === 'ADMIN'} />
    </div>
  );
}
