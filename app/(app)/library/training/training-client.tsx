'use client';

import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteExercise } from '@/app/actions/content';
import { TRAINING_CATEGORIES } from '@/lib/categories';
import { BODY_PARTS, EXERCISE_EQUIPMENT, INTENSITY_NAMES } from '@/lib/exercise-meta';
import { CategorySection } from '@/components/category-section';
import { LibraryVideo } from '@/components/library-video';
import { ExerciseBadges } from '@/components/meta-badges';
import {
  MetaFilter,
  matchesFilter,
  type FilterState,
} from '@/components/meta-filter';
import { Card } from '@/components/ui';
import { ExerciseForm } from './exercise-form';

export type ExerciseItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
  videoPath: string;
};

const FILTER_GROUPS = [
  { key: 'bodyParts', label: '목표 부위', options: BODY_PARTS },
  { key: 'intensity', label: '강도', options: INTENSITY_NAMES },
  { key: 'equipment', label: '장비', options: EXERCISE_EQUIPMENT },
];

function ExerciseCard({
  item,
  isAdmin,
}: {
  item: ExerciseItem;
  isAdmin: boolean;
}) {
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <LibraryVideo path={item.videoPath} title={item.title} />

      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-cream">{item.title}</h3>
        {isAdmin && (
          <form action={deleteExercise}>
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              aria-label={`${item.title} 삭제`}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-red-950/40 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>

      <ExerciseBadges
        bodyParts={item.bodyParts}
        intensity={item.intensity}
        difficulty={item.difficulty}
        equipment={item.equipment}
      />

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
        {item.description}
      </p>
    </Card>
  );
}

export function TrainingClient({
  exercises,
  isAdmin,
}: {
  exercises: ExerciseItem[];
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState<FilterState>({});
  const filtering = Object.values(filter).some((v) => v.length > 0);

  const matched = useMemo(
    () =>
      exercises.filter((ex) =>
        matchesFilter(filter, {
          bodyParts: ex.bodyParts,
          // 강도는 하나뿐이지만 검사 방식을 맞추려 배열로 넘긴다.
          intensity: [ex.intensity],
          equipment: ex.equipment,
        })
      ),
    [exercises, filter]
  );

  const byCategory = useMemo(
    () =>
      exercises.reduce<Record<string, ExerciseItem[]>>((acc, ex) => {
        (acc[ex.category] ??= []).push(ex);
        return acc;
      }, {}),
    [exercises]
  );

  return (
    <div className="space-y-6">
      {/* 영상이 하나도 없으면 조건 고르기가 의미 없다. */}
      {exercises.length > 0 && (
        <MetaFilter
          groups={FILTER_GROUPS}
          value={filter}
          onChange={setFilter}
          total={exercises.length}
          matched={matched.length}
        />
      )}

      {filtering ? (
        // 조건을 고른 동안에는 카테고리를 접어두지 않고 결과만 펼쳐 보여준다.
        matched.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            {matched.map((ex) => (
              <ExerciseCard key={ex.id} item={ex} isAdmin={isAdmin} />
            ))}
          </div>
        )
      ) : (
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
                      <ExerciseCard key={ex.id} item={ex} isAdmin={isAdmin} />
                    ))}
                  </div>
                )}
              </CategorySection>
            );
          })}
        </div>
      )}
    </div>
  );
}
