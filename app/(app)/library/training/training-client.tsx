'use client';

import { useMemo, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { deleteExercise, setExerciseThumbnail } from '@/app/actions/content';
import { TRAINING_CATEGORIES } from '@/lib/categories';
import { BODY_PARTS, EXERCISE_EQUIPMENT, INTENSITY_NAMES } from '@/lib/exercise-meta';
import { CategorySection } from '@/components/category-section';
import { LibraryVideo } from '@/components/library-video';
import { LibraryTile } from '@/components/exercise-tile';
import { ExerciseBadges } from '@/components/meta-badges';
import { ThumbnailFixer } from '@/components/thumbnail-fixer';
import {
  MetaFilter,
  matchesFilter,
  type FilterState,
} from '@/components/meta-filter';
import { Button, Card, EmptyState } from '@/components/ui';
import { ExerciseForm, type ExerciseDraft } from './exercise-form';

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
  thumbUrl: string | null;
};

const FILTER_GROUPS = [
  { key: 'bodyParts', label: '목표 부위', options: BODY_PARTS },
  { key: 'intensity', label: '강도', options: INTENSITY_NAMES },
  { key: 'equipment', label: '장비', options: EXERCISE_EQUIPMENT },
];

/** 펼쳤을 때 보이는 전체 내용 */
function ExerciseDetail({
  item,
  isAdmin,
  onClose,
}: {
  item: ExerciseItem;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    const draft: ExerciseDraft = {
      id: item.id,
      title: item.title,
      category: item.category,
      description: item.description,
      bodyParts: item.bodyParts,
      intensity: item.intensity,
      difficulty: item.difficulty,
      equipment: item.equipment,
    };
    return (
      <Card className="border-sky-soft/50 bg-sky/[0.03] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-sky">운동 수정</p>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="수정 닫기"
            className="rounded-lg p-1.5 text-muted transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ExerciseForm
          category={item.category}
          initial={draft}
          onDone={() => setEditing(false)}
        />
      </Card>
    );
  }

  return (
    <Card className="grid gap-5 border-sky-soft/40 p-4 sm:p-5 md:grid-cols-[minmax(0,420px)_1fr]">
      <LibraryVideo
        path={item.videoPath}
        title={item.title}
        thumbUrl={item.thumbUrl}
        isAdmin={isAdmin}
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-ink">{item.title}</h3>
          <div className="flex shrink-0 items-center gap-1">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label={`${item.title} 수정`}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-sky"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <form action={deleteExercise}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    aria-label={`${item.title} 삭제`}
                    className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="rounded-lg p-2 text-muted transition-colors hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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

        {/* 업로드할 때 캡처가 실패한 영상은 여기서 이미지만 다시 만들 수 있다. */}
        {isAdmin && !item.thumbUrl && (
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs text-muted">
              이 영상은 미리보기 이미지가 없습니다.
            </p>
            <ThumbnailFixer
              itemId={item.id}
              videoPath={item.videoPath}
              onSave={(fd) => setExerciseThumbnail(undefined, fd)}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * 목록은 작은 카드로 촘촘히 깔고, 고른 하나만 그 자리에서 넓게 펼친다.
 * 영상이 수십 개여도 스크롤이 길어지지 않는다.
 */
function ExerciseGrid({
  items,
  isAdmin,
}: {
  items: ExerciseItem[];
  isAdmin: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) =>
        openId === item.id ? (
          <div key={item.id} className="col-span-full">
            <ExerciseDetail
              item={item}
              isAdmin={isAdmin}
              onClose={() => setOpenId(null)}
            />
          </div>
        ) : (
          <LibraryTile
            key={item.id}
            title={item.title}
            thumbUrl={item.thumbUrl}
            onSelect={() => setOpenId(item.id)}
          />
        )
      )}
    </div>
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
        // 하나도 안 걸렸을 때 화면이 비어 버리면 고장으로 보이므로 이유를 적어준다.
        matched.length > 0 ? (
          <ExerciseGrid items={matched} isAdmin={isAdmin} />
        ) : (
          <EmptyState
            title="조건에 맞는 운동이 없습니다"
            description="고른 조건을 하나씩 줄이면 더 많은 운동이 나옵니다."
            action={
              <Button variant="secondary" className="mt-2" onClick={() => setFilter({})}>
                조건 모두 지우기
              </Button>
            }
          />
        )
      ) : (
        <div className="space-y-4">
          {TRAINING_CATEGORIES.map((category) => {
            const items = byCategory[category.name] ?? [];

            return (
              <CategorySection
                key={category.name}
                name={category.name}
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
                  <ExerciseGrid items={items} isAdmin={isAdmin} />
                )}
              </CategorySection>
            );
          })}
        </div>
      )}
    </div>
  );
}
