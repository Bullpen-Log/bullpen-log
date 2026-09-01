'use client';

import { useMemo, useState } from 'react';
import { Pencil, Star, Trash2, X } from 'lucide-react';
import { deleteGuide, setGuideThumbnail } from '@/app/actions/content';
import { toggleDrillFavorite } from '@/app/actions/favorite';
import { FavoriteButton } from '@/components/favorite-button';
import { MECHANICS_CATEGORIES } from '@/lib/categories';
import { DRILL_EQUIPMENT, FOCUS_POINTS } from '@/lib/exercise-meta';
import { CategorySection } from '@/components/category-section';
import { LibraryVideo } from '@/components/library-video';
import { LibraryTile } from '@/components/exercise-tile';
import { DrillBadges } from '@/components/meta-badges';
import { ThumbnailFixer } from '@/components/thumbnail-fixer';
import { MetaFilter, matchesFilter, type FilterState } from '@/components/meta-filter';
import { Button, Card, EmptyState } from '@/components/ui';
import { ConfirmDeleteForm } from '@/components/confirm-delete';
import { GuideForm, type GuideDraft } from './guide-form';

export type GuideItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  focusPoints: string[];
  equipment: string[];
  /** 우리 저장소에 올린 영상 경로. 참고 영상이면 없다. */
  videoPath: string | null;
  /** OWN(직접 촬영) / REFERENCE(아직 촬영 전, 유튜브 참고 영상) */
  source: 'OWN' | 'REFERENCE';
  /** 참고 영상의 유튜브 영상 ID */
  referenceVideoId: string | null;
  thumbUrl: string | null;
  /** 영상의 가로세로 비율. 없으면 가로(16:9)로 본다. */
  aspectRatio: number | null;
  sortOrder: number;
  /** 이 사람이 별을 달아 뒀는가 */
  favorite: boolean;
};

const FILTER_GROUPS = [
  { key: 'focusPoints', label: '교정 포인트', options: FOCUS_POINTS },
  { key: 'equipment', label: '장비', options: DRILL_EQUIPMENT },
];

/** 펼쳤을 때 보이는 전체 내용 */
function GuideDetail({
  item,
  isAdmin,
  onClose,
}: {
  item: GuideItem;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    const draft: GuideDraft = {
      id: item.id,
      title: item.title,
      category: item.category,
      description: item.description,
      focusPoints: item.focusPoints,
      equipment: item.equipment,
      sortOrder: item.sortOrder,
    };
    return (
      <Card className="border-sky-soft/50 bg-sky/[0.03] p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-sky">드릴 수정</p>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="수정 닫기"
            className="rounded-lg p-1.5 text-muted transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <GuideForm
          category={item.category}
          initial={draft}
          onDone={() => setEditing(false)}
        />
      </Card>
    );
  }

  return (
    <Card
      className={`grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,420px)_1fr] ${
        item.favorite ? 'border-warn-line' : 'border-sky-soft/40'
      }`}
    >
      <LibraryVideo
        path={item.videoPath}
        referenceVideoId={item.referenceVideoId}
        title={item.title}
        thumbUrl={item.thumbUrl}
        aspectRatio={item.aspectRatio}
        isAdmin={isAdmin}
      />

      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-ink">{item.title}</h3>
              {item.source === 'REFERENCE' && (
                <span className="rounded-md bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">
                  촬영 전 · 참고 영상
                </span>
              )}
            </div>
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
                <ConfirmDeleteForm
                  action={deleteGuide}
                  hidden={{ id: item.id }}
                  ariaLabel={`${item.title} 삭제`}
                  title="이 드릴을 지울까요?"
                  detail={
                    <div className="space-y-2">
                      <p>
                        <strong className="text-ink">{item.title}</strong>
                      </p>
                      <p className="text-muted">
                        모든 회원의 라이브러리에서 사라집니다. 되돌릴 수 없습니다.
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

        <div className="mt-3">
          <DrillBadges focusPoints={item.focusPoints} equipment={item.equipment} />
        </div>

        <p className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">
          {item.description}
        </p>

        {isAdmin && !item.thumbUrl && item.videoPath && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs text-muted">
              이 영상은 미리보기 이미지가 없습니다.
            </p>
            <ThumbnailFixer
              itemId={item.id}
              videoPath={item.videoPath}
              onSave={(fd) => setGuideThumbnail(undefined, fd)}
            />
          </div>
        )}

        {/*
          예전에는 여기가 '학습 완료로 표시'였다. 다 익혀야 하는 목록처럼
          읽혀서 별로 바꿨다 — 오늘 할 것을 고를 때 이 드릴을 다시 찾기 쉽게
          해주는 것이 실제로 필요한 일이었다.
        */}
        <FavoriteButton
          className="mt-6"
          variant="full"
          favorite={item.favorite}
          label={item.title}
          onToggle={() => toggleDrillFavorite(item.id)}
        />
      </div>
    </Card>
  );
}

/**
 * 목록은 작은 카드로 촘촘히 깔고, 고른 하나만 그 자리에서 넓게 펼친다.
 * 드릴이 수십 개여도 스크롤이 길어지지 않는다.
 */
function GuideGrid({ items, isAdmin }: { items: GuideItem[]; isAdmin: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) =>
        openId === item.id ? (
          <div key={item.id} className="col-span-full">
            <GuideDetail
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

export function MechanicsClient({
  guides,
  isAdmin,
}: {
  guides: GuideItem[];
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState<FilterState>({});
  /** 별을 달아 둔 것만 볼지. 조건 필터와 따로 둔다 — 성격이 다른 거르기다. */
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const favoriteCount = guides.filter((g) => g.favorite).length;
  const filtering = Object.values(filter).some((v) => v.length > 0) || onlyFavorites;

  const matched = useMemo(
    () =>
      guides.filter(
        (g) =>
          (!onlyFavorites || g.favorite) &&
          matchesFilter(filter, {
            focusPoints: g.focusPoints,
            equipment: g.equipment,
          })
      ),
    [guides, filter, onlyFavorites]
  );

  const byCategory = useMemo(
    () =>
      guides.reduce<Record<string, GuideItem[]>>((acc, g) => {
        (acc[g.category] ??= []).push(g);
        return acc;
      }, {}),
    [guides]
  );

  return (
    <div className="space-y-6">
      {/*
        즐겨찾기만 보기.
        오늘 할 것을 고칠 때 116개를 다시 훑지 않아도 되게 하려고 둔다.
        한 번도 별을 안 단 사람에게는 무엇을 하는 단추인지 함께 적어 준다.
      */}
      {guides.length > 0 && (
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
              ? '드릴을 열고 별을 달아두면 여기서 모아 볼 수 있습니다'
              : '오늘 할 드릴을 고를 때 이 목록에서 바로 담을 수 있습니다'}
          </span>
        </div>
      )}

      {guides.length > 0 && (
        <MetaFilter
          groups={FILTER_GROUPS}
          value={filter}
          onChange={setFilter}
          total={guides.length}
          matched={matched.length}
        />
      )}

      {filtering ? (
        // 하나도 안 걸렸을 때 화면이 비어 버리면 고장으로 보이므로 이유를 적어준다.
        matched.length > 0 ? (
          <GuideGrid items={matched} isAdmin={isAdmin} />
        ) : (
          <EmptyState
            title="조건에 맞는 드릴이 없습니다"
            description="고른 조건을 하나씩 줄이면 더 많은 드릴이 나옵니다."
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
          {MECHANICS_CATEGORIES.map((category) => {
            const items = byCategory[category.name] ?? [];

            return (
              <CategorySection
                key={category.name}
                name={category.name}
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
                  <GuideGrid items={items} isAdmin={isAdmin} />
                )}
              </CategorySection>
            );
          })}
        </div>
      )}
    </div>
  );
}
