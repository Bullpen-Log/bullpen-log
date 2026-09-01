'use client';

import { useMemo, useState } from 'react';
import { Eye, EyeOff, Pencil, Search, Star, Trash2, X } from 'lucide-react';
import {
  deleteExercise,
  setExerciseThumbnail,
  toggleExerciseHidden,
} from '@/app/actions/content';
import { toggleExerciseFavorite } from '@/app/actions/favorite';
import { matchesSearch } from '@/lib/korean';
import { FavoriteButton } from '@/components/favorite-button';
import { TRAINING_CATEGORIES } from '@/lib/categories';
import {
  BODY_PARTS,
  EXERCISE_EQUIPMENT,
  INTENSITY_NAMES,
  formatPrescription,
  type Prescription,
} from '@/lib/exercise-meta';
import { CategorySection } from '@/components/category-section';
import { LibraryVideo } from '@/components/library-video';
import { LibraryTile } from '@/components/exercise-tile';
import { ExerciseBadges } from '@/components/meta-badges';
import { ThumbnailFixer } from '@/components/thumbnail-fixer';
import { MetaFilter, matchesFilter, type FilterState } from '@/components/meta-filter';
import { Button, Card, EmptyState } from '@/components/ui';
import { ConfirmDeleteForm } from '@/components/confirm-delete';
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
  /** 우리 저장소에 올린 영상 경로. 참고 영상이면 없다. */
  videoPath: string | null;
  /** OWN(직접 촬영) / REFERENCE(아직 촬영 전, 유튜브 참고 영상) */
  source: 'OWN' | 'REFERENCE';
  /** 참고 영상의 유튜브 영상 ID */
  referenceVideoId: string | null;
  thumbUrl: string | null;
  /** 숨긴 시각. 없으면 보이는 운동. 숨긴 것은 관리자에게만 보인다. */
  hiddenAt: string | null;
  /** 이 운동을 한 기록 수. 관리자가 아니면 0 */
  usedCount: number;
  /** 영상의 가로세로 비율. 없으면 가로(16:9)로 본다. */
  aspectRatio: number | null;
  /** 이 사람이 별을 달아 뒀는가 */
  favorite: boolean;
} & Prescription;

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
      isReference: item.source === 'REFERENCE',
      sets: item.sets,
      reps: item.reps,
      holdSeconds: item.holdSeconds,
      restSeconds: item.restSeconds,
      perSide: item.perSide,
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
        referenceVideoId={item.referenceVideoId}
        title={item.title}
        thumbUrl={item.thumbUrl}
        aspectRatio={item.aspectRatio}
        isAdmin={isAdmin}
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-ink">{item.title}</h3>
            {item.source === 'REFERENCE' && (
              <span className="rounded-md bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">
                촬영 전 · 참고 영상
              </span>
            )}
            {item.hiddenAt && (
              <span className="rounded-md border border-line-strong bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                숨김 · 새 일정에 안 나옴
              </span>
            )}
          </div>
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

                {/*
                  숨기기 — 지우기 대신 먼저 손이 가야 하는 쪽이라 앞에 둔다.
                  숨기면 새 일정에는 안 나오고 지난 기록은 그대로 남는다.
                */}
                <form action={toggleExerciseHidden}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    aria-label={
                      item.hiddenAt
                        ? `${item.title} 다시 보이기`
                        : `${item.title} 숨기기`
                    }
                    title={
                      item.hiddenAt
                        ? '다시 보이기 — 새 일정에 다시 나옵니다'
                        : '숨기기 — 새 일정에 안 나오고, 지난 기록은 남습니다'
                    }
                    className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-sky"
                  >
                    {item.hiddenAt ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </button>
                </form>

                <ConfirmDeleteForm
                  action={deleteExercise}
                  hidden={{ id: item.id }}
                  ariaLabel={`${item.title} 삭제`}
                  title="이 운동을 지울까요?"
                  detail={
                    <div className="space-y-2">
                      <p>
                        <strong className="text-ink">{item.title}</strong>
                      </p>
                      {item.usedCount > 0 ? (
                        <p className="text-warn">
                          회원들이 이 운동을 한 기록 <strong>{item.usedCount}건</strong>
                          이 함께 지워집니다. 지나간 운동 부하 지수도 그만큼 다시
                          계산됩니다 — 본인은 아무것도 안 했는데 어제와 다른 숫자를 보게
                          됩니다.
                        </p>
                      ) : (
                        <p className="text-muted">
                          아직 아무도 이 운동을 하지 않았습니다.
                        </p>
                      )}
                      <p className="text-muted">
                        되돌릴 수 없습니다. 새 일정에만 안 나오게 하려면 옆의{' '}
                        <strong>숨기기</strong>를 쓰세요 — 지난 기록이 그대로 남습니다.
                      </p>
                    </div>
                  }
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmDeleteForm>
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

        {formatPrescription(item) && (
          <p className="text-sm font-semibold text-ink">{formatPrescription(item)}</p>
        )}

        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
          {item.description}
        </p>

        {/* 업로드할 때 캡처가 실패한 영상은 여기서 이미지만 다시 만들 수 있다. */}
        {isAdmin && !item.thumbUrl && item.videoPath && (
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

        {/*
          별을 다는 자리. 앱이 짜 준 일정을 고칠 때 445개에서 이 운동을 다시
          찾는 것이 일이라, 여기서 담아 두면 '운동 추가' 창 맨 위에 모인다.
        */}
        <FavoriteButton
          className="pt-1"
          variant="full"
          favorite={item.favorite}
          label={item.title}
          onToggle={() => toggleExerciseFavorite(item.id)}
        />
      </div>
    </Card>
  );
}

/**
 * 목록은 작은 카드로 촘촘히 깔고, 고른 하나만 그 자리에서 넓게 펼친다.
 * 영상이 수십 개여도 스크롤이 길어지지 않는다.
 */
function ExerciseGrid({ items, isAdmin }: { items: ExerciseItem[]; isAdmin: boolean }) {
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
            isReference={item.source === 'REFERENCE'}
            favorite={item.favorite}
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
  /*
   * 직접 촬영한 것만 / 참고 영상만 골라 보기.
   *
   * 촬영 전 운동을 참고 영상으로 미리 등록해 두었기 때문에, 둘이 섞이면
   * 무엇이 남았는지 알 수 없다. 조건 고르기(MetaFilter)는 부위·강도·장비를
   * 다루는 곳이라, 성격이 다른 이 항목은 따로 둔다.
   */
  const [sourceView, setSourceView] = useState<'ALL' | 'OWN' | 'REFERENCE'>('ALL');
  /** 별을 달아 둔 것만 볼지. 촬영 여부와 겹쳐 쓸 수 있게 따로 둔다. */
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  /*
   * 이름으로 찾기.
   *
   * 434개를 부위·강도·장비로만 좁히려니, 이름을 아는 운동 하나를 찾는 데도
   * 조건을 몇 번씩 골라야 했다. 일정에 운동을 더할 때 쓰는 창에는 이미 있는
   * 것이라, 여기도 같은 자리에 같은 모양으로 둔다.
   *
   * 띄어쓰기는 무시한다 — '덤벨프레스'로 쳐도 '덤벨 프레스'가 나온다.
   */
  const [query, setQuery] = useState('');

  const visible = useMemo(
    () =>
      exercises.filter(
        (ex) =>
          (sourceView === 'ALL' || ex.source === sourceView) &&
          (!onlyFavorites || ex.favorite) &&
          (matchesSearch(ex.title, query) || matchesSearch(ex.category, query))
      ),
    [exercises, sourceView, onlyFavorites, query]
  );

  const favoriteCount = useMemo(
    () => exercises.filter((ex) => ex.favorite).length,
    [exercises]
  );

  const ownCount = useMemo(
    () => exercises.filter((ex) => ex.source === 'OWN').length,
    [exercises]
  );
  const referenceCount = exercises.length - ownCount;

  const filtering =
    Object.values(filter).some((v) => v.length > 0) ||
    onlyFavorites ||
    query.trim() !== '';

  const matched = useMemo(
    () =>
      visible.filter((ex) =>
        matchesFilter(filter, {
          bodyParts: ex.bodyParts,
          // 강도는 하나뿐이지만 검사 방식을 맞추려 배열로 넘긴다.
          intensity: [ex.intensity],
          equipment: ex.equipment,
        })
      ),
    [visible, filter]
  );

  const byCategory = useMemo(
    () =>
      visible.reduce<Record<string, ExerciseItem[]>>((acc, ex) => {
        (acc[ex.category] ??= []).push(ex);
        return acc;
      }, {}),
    [visible]
  );

  return (
    <div className="space-y-6">
      {/* 이름으로 찾기 — 조건 고르기보다 위에 둔다. 이름을 알면 이쪽이 빠르다. */}
      <label className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
        <Search aria-hidden className="h-4 w-4 shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="운동 이름으로 찾기"
          aria-label="운동 이름으로 찾기"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="찾기 지우기"
            className="shrink-0 rounded p-1 text-muted transition-colors hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {/*
        즐겨찾기만 보기.
        일정을 고칠 때 445개를 다시 훑지 않아도 되게 하려고 둔다.
      */}
      {exercises.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3.5">
          <button
            type="button"
            onClick={() => setOnlyFavorites((v) => !v)}
            aria-pressed={onlyFavorites}
            disabled={favoriteCount === 0}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              onlyFavorites
                ? 'border-warn-line bg-warn-bg text-warn'
                : 'border-line-strong bg-surface-2 text-muted enabled:hover:border-warn-line enabled:hover:text-warn'
            }`}
          >
            <Star
              className="h-3.5 w-3.5"
              fill={onlyFavorites ? 'currentColor' : 'none'}
              strokeWidth={1.9}
            />
            즐겨찾기
            {favoriteCount > 0 && (
              <span className="text-display text-sm leading-none">{favoriteCount}</span>
            )}
          </button>
          <span className="text-xs text-muted">
            {favoriteCount === 0
              ? '운동을 열고 별을 달아두면 여기서 모아 볼 수 있습니다'
              : '오늘 일정에 운동을 더할 때 이 목록에서 바로 담을 수 있습니다'}
          </span>
        </div>
      )}

      {/* 촬영이 어디까지 됐는지 — 참고 영상이 하나라도 있을 때만 보여준다 */}
      {referenceCount > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface px-5 py-4">
          <span className="text-sm text-muted">
            직접 촬영 <strong className="text-ink">{ownCount}</strong>개 · 촬영 전{' '}
            <strong className="text-warn">{referenceCount}</strong>개
          </span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            {(
              [
                ['ALL', '전체'],
                ['OWN', '직접 촬영'],
                ['REFERENCE', '참고 영상'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSourceView(key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  sourceView === key
                    ? 'border-sky bg-sky-tint text-sky-strong'
                    : 'border-line text-muted hover:border-sky-soft'
                }`}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
      )}

      {/* 영상이 하나도 없으면 조건 고르기가 의미 없다. */}
      {visible.length > 0 && (
        <MetaFilter
          groups={FILTER_GROUPS}
          value={filter}
          onChange={setFilter}
          total={visible.length}
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
              <Button
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  setFilter({});
                  setOnlyFavorites(false);
                }}
              >
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
