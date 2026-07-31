import { Trash2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { deleteExercise } from '@/app/actions/content';
import { TRAINING_CATEGORIES } from '@/lib/categories';
import { getYouTubeEmbedUrl, getYouTubeThumbnail } from '@/lib/youtube';
import { CategorySection } from '@/components/category-section';
import { VideoPlayer } from '@/components/video-card';
import { Card, PageHeading } from '@/components/ui';
import { ExerciseForm } from './exercise-form';

export default async function TrainingPage() {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';

  const exercises = await prisma.exerciseVideo.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const byCategory = exercises.reduce<Record<string, typeof exercises>>((acc, ex) => {
    (acc[ex.category] ??= []).push(ex);
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Training"
        title="트레이닝"
        description="투수에게 필요한 훈련을 5개 파트로 나눠 정리합니다. 보고 싶은 파트를 눌러 영상을 확인하세요."
      />

      <div className="space-y-4">
        {TRAINING_CATEGORIES.map((category) => {
          const items = byCategory[category.name] ?? [];

          return (
            <CategorySection
              key={category.name}
              name={category.name}
              desc={category.desc}
              count={items.length}
              isAdmin={isAdmin}
              form={<ExerciseForm category={category.name} />}
            >
              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
                  {isAdmin
                    ? '"영상 추가"를 눌러 이 파트의 첫 영상을 등록해보세요.'
                    : '아직 등록된 영상이 없습니다.'}
                </p>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {items.map((ex) => (
                    <Card key={ex.id} className="flex flex-col gap-4 p-4 sm:p-5">
                      <VideoPlayer
                        embedUrl={getYouTubeEmbedUrl(ex.videoUrl)}
                        thumbnailUrl={getYouTubeThumbnail(ex.videoUrl)}
                        title={ex.title}
                      />

                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-bold text-cream">{ex.title}</h3>
                        {isAdmin && (
                          <form action={deleteExercise}>
                            <input type="hidden" name="id" value={ex.id} />
                            <button
                              type="submit"
                              aria-label={`${ex.title} 삭제`}
                              className="rounded-lg p-2 text-muted transition-colors hover:bg-red-950/40 hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </form>
                        )}
                      </div>

                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
                        {ex.description}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </CategorySection>
          );
        })}
      </div>
    </div>
  );
}
