import { Check, Trash2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { deleteGuide, toggleGuideProgress } from '@/app/actions/content';
import { MECHANICS_CATEGORIES } from '@/lib/categories';
import { getYouTubeEmbedUrl, getYouTubeThumbnail } from '@/lib/youtube';
import { CategorySection } from '@/components/category-section';
import { VideoPlayer } from '@/components/video-card';
import { Badge, Card, PageHeading } from '@/components/ui';
import { GuideForm } from './guide-form';

export default async function MechanicsPage() {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';

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
  const completedCount = guides.filter((g) => completedIds.has(g.id)).length;

  const byCategory = guides.reduce<Record<string, typeof guides>>((acc, g) => {
    (acc[g.category] ??= []).push(g);
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Mechanics"
        title="투구 메커니즘 가이드"
        description="투구 동작을 3가지 드릴 파트로 나눠 학습합니다. 보고 싶은 파트를 눌러 드릴을 확인하세요."
        action={
          guides.length > 0 ? (
            <div className="sm:text-right">
              <p className="text-display text-3xl leading-none text-gold">
                {completedCount}
                <span className="text-line-strong"> / {guides.length}</span>
              </p>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted">학습 완료</p>
            </div>
          ) : undefined
        }
      />

      <div className="space-y-4">
        {MECHANICS_CATEGORIES.map((category) => {
          const items = byCategory[category.name] ?? [];

          return (
            <CategorySection
              key={category.name}
              name={category.name}
              desc={category.desc}
              count={items.length}
              isAdmin={isAdmin}
              form={<GuideForm category={category.name} />}
            >
              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
                  {isAdmin
                    ? '"영상 추가"를 눌러 이 파트의 첫 드릴을 등록해보세요.'
                    : '아직 등록된 드릴이 없습니다.'}
                </p>
              ) : (
                <div className="space-y-6">
                  {items.map((guide) => {
                    const done = completedIds.has(guide.id);
                    return (
                      <Card
                        key={guide.id}
                        className={`grid gap-6 p-4 sm:p-6 md:grid-cols-[300px_1fr] ${
                          done ? 'border-gold-dim/50' : ''
                        }`}
                      >
                        <VideoPlayer
                          embedUrl={getYouTubeEmbedUrl(guide.videoUrl)}
                          thumbnailUrl={getYouTubeThumbnail(guide.videoUrl)}
                          title={guide.title}
                        />

                        <div className="flex flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-2">
                              {done && (
                                <Badge className="border-gold bg-gold/10 text-gold-bright">
                                  학습 완료
                                </Badge>
                              )}
                              <h3 className="text-lg font-bold text-cream">
                                {guide.title}
                              </h3>
                            </div>

                            {isAdmin && (
                              <form action={deleteGuide}>
                                <input type="hidden" name="id" value={guide.id} />
                                <button
                                  type="submit"
                                  aria-label={`${guide.title} 삭제`}
                                  className="rounded-lg p-2 text-muted transition-colors hover:bg-red-950/40 hover:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </form>
                            )}
                          </div>

                          <p className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                            {guide.description}
                          </p>

                          <form action={toggleGuideProgress} className="mt-6">
                            <input type="hidden" name="guideId" value={guide.id} />
                            <button
                              type="submit"
                              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors sm:w-auto ${
                                done
                                  ? 'border-gold bg-gold/10 text-gold-bright hover:bg-gold/20'
                                  : 'border-line-strong bg-surface-2 text-muted hover:border-gold hover:text-gold'
                              }`}
                            >
                              <Check className="h-4 w-4" />
                              {done ? '학습 완료 취소' : '학습 완료로 표시'}
                            </button>
                          </form>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CategorySection>
          );
        })}
      </div>
    </div>
  );
}
