'use client';

import { useMemo, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import {
  deleteGuide,
  setGuideThumbnail,
  toggleGuideProgress,
} from '@/app/actions/content';
import { MECHANICS_CATEGORIES } from '@/lib/categories';
import { DRILL_EQUIPMENT, FOCUS_POINTS } from '@/lib/exercise-meta';
import { CategorySection } from '@/components/category-section';
import { LibraryVideo } from '@/components/library-video';
import { LibraryTile } from '@/components/exercise-tile';
import { DrillBadges } from '@/components/meta-badges';
import { ThumbnailFixer } from '@/components/thumbnail-fixer';
import {
  MetaFilter,
  matchesFilter,
  type FilterState,
} from '@/components/meta-filter';
import { Badge, Card } from '@/components/ui';
import { GuideForm, type GuideDraft } from './guide-form';

export type GuideItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  focusPoints: string[];
  equipment: string[];
  videoPath: string;
  thumbUrl: string | null;
  sortOrder: number;
  done: boolean;
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
        item.done ? 'border-sky-soft/50' : 'border-sky-soft/40'
      }`}
    >
      <LibraryVideo
        path={item.videoPath}
        title={item.title}
        thumbUrl={item.thumbUrl}
        isAdmin={isAdmin}
      />

      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            {item.done && (
              <Badge className="border-sky bg-sky/10 text-sky-strong">
                학습 완료
              </Badge>
            )}
            <h3 className="text-lg font-bold text-ink">{item.title}</h3>
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
                <form action={deleteGuide}>
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

        <div className="mt-3">
          <DrillBadges focusPoints={item.focusPoints} equipment={item.equipment} />
        </div>

        <p className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">
          {item.description}
        </p>

        {isAdmin && !item.thumbUrl && (
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

        <form action={toggleGuideProgress} className="mt-6">
          <input type="hidden" name="guideId" value={item.id} />
          <button
            type="submit"
            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors sm:w-auto ${
              item.done
                ? 'border-sky bg-sky/10 text-sky-strong hover:bg-sky/20'
                : 'border-line-strong bg-surface-2 text-muted hover:border-sky hover:text-sky'
            }`}
          >
            <Check className="h-4 w-4" />
            {item.done ? '학습 완료 취소' : '학습 완료로 표시'}
          </button>
        </form>
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
  const filtering = Object.values(filter).some((v) => v.length > 0);

  const matched = useMemo(
    () =>
      guides.filter((g) =>
        matchesFilter(filter, {
          focusPoints: g.focusPoints,
          equipment: g.equipment,
        })
      ),
    [guides, filter]
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
        matched.length > 0 && <GuideGrid items={matched} isAdmin={isAdmin} />
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
