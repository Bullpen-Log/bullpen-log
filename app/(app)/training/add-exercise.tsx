'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { Modal } from '@/components/modal';
import { MetaFilter, matchesFilter, type FilterState } from '@/components/meta-filter';
import { ExerciseBadges } from '@/components/meta-badges';
import { addToTodayPlan } from '@/app/actions/plan-edit';
import {
  BODY_PARTS,
  EXERCISE_EQUIPMENT,
  INTENSITY_LEVELS,
  formatPrescription,
  type Prescription,
} from '@/lib/exercise-meta';

/**
 * 목록에 운동을 더하는 창.
 *
 * 우리가 가진 영상이 400개가 넘는데, 만들어 주는 일정에는 열 개 남짓만 들어간다.
 * 나머지를 못 쓰게 두면 "여기 없는 운동을 하고 싶다"는 사람은 앱을 벗어나게 된다.
 *
 * 운동 영상 화면과 같은 조건 고르기(부위·강도·장비)를 그대로 쓴다. 두 곳에서
 * 다르게 찾게 되면, 영상에서 본 운동을 여기서 못 찾는 일이 생긴다.
 *
 * 안전 필터를 통과하지 못한 운동도 보여주고 더할 수 있다. 대신 무엇이 걸리는지
 * 표시한다 — 막는 것이 아니라 알려주는 것이 이 앱의 방식이다.
 * (통증이 있는 날에는 목록 자체가 안 나오므로 이 창도 열리지 않는다.)
 */

export type PickableExercise = {
  id: string;
  title: string;
  category: string;
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
} & Prescription;

const FILTER_GROUPS = [
  { key: 'bodyParts', label: '목표 부위', options: BODY_PARTS },
  { key: 'intensity', label: '강도', options: INTENSITY_LEVELS.map((l) => l.name) },
  { key: 'equipment', label: '장비', options: EXERCISE_EQUIPMENT },
];

/** 한 번에 보여주는 최대 개수. 400개를 통째로 그리면 창이 버벅인다. */
const PAGE = 40;

export function AddExercise({
  library,
  inPlanIds,
  safeIds,
  ownedEquipment,
}: {
  /** 고를 수 있는 운동 전체 */
  library: PickableExercise[];
  /** 이미 오늘 목록에 있는 운동 — 다시 더할 수 없다 */
  inPlanIds: string[];
  /** 오늘 몸 상태에서 권할 수 있는 운동 */
  safeIds: string[];
  /** 가지고 있는 장비 — 없는 장비 운동은 표시해 준다 */
  ownedEquipment: string[];
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterState>({});
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  /** 방금 더한 운동. 화면이 새로 그려지기 전까지 눌린 티를 낸다. */
  const [added, setAdded] = useState<string[]>([]);
  const [limit, setLimit] = useState(PAGE);

  const inPlan = useMemo(
    () => new Set([...inPlanIds, ...added]),
    [inPlanIds, added]
  );
  const safe = useMemo(() => new Set(safeIds), [safeIds]);
  const owned = useMemo(() => new Set(ownedEquipment), [ownedEquipment]);

  const matched = useMemo(() => {
    const text = query.trim();
    return library.filter(
      (ex) =>
        matchesFilter(filter, {
          bodyParts: ex.bodyParts,
          intensity: [ex.intensity],
          equipment: ex.equipment,
        }) &&
        (text === '' || ex.title.includes(text) || ex.category.includes(text))
    );
  }, [library, filter, query]);

  const add = (id: string) => {
    setError(undefined);
    setAdded((prev) => [...prev, id]);
    startTransition(async () => {
      const res = await addToTodayPlan(id);
      if ('error' in res) {
        setAdded((prev) => prev.filter((x) => x !== id));
        setError(res.error);
      }
    });
  };

  const change = (next: FilterState) => {
    setFilter(next);
    setLimit(PAGE);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-sky-soft bg-sky-tint px-4 py-3.5 text-sm font-medium text-sky-strong transition-colors hover:bg-sky-tint/70"
      >
        <Plus className="h-4 w-4" />
        운동 추가
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="운동 추가"
        description="부위·강도·장비로 찾아서 오늘 목록에 넣습니다. 넣은 운동은 목록에서 다시 뺄 수 있습니다."
        size="wide"
      >
        <div className="space-y-4">
          {error && (
            <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          <label className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="운동 이름으로 찾기"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </label>

          <MetaFilter
            groups={FILTER_GROUPS}
            value={filter}
            onChange={change}
            total={library.length}
            matched={matched.length}
          />

          {matched.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              조건에 맞는 운동이 없습니다. 조건을 줄여보세요.
            </p>
          ) : (
            <ul className="space-y-2">
              {matched.slice(0, limit).map((ex) => {
                const already = inPlan.has(ex.id);
                const notSafe = !safe.has(ex.id);
                const missing = ex.equipment.filter(
                  (e) => e !== '맨몸' && !owned.has(e)
                );
                const prescription = formatPrescription(ex);

                return (
                  <li
                    key={ex.id}
                    className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-ink">
                          {ex.title}
                        </span>
                        <span className="text-[11px] text-muted">{ex.category}</span>
                      </div>
                      {prescription && (
                        <p className="text-xs font-semibold text-muted">
                          {prescription}
                        </p>
                      )}
                      <ExerciseBadges
                        bodyParts={ex.bodyParts}
                        intensity={ex.intensity}
                        difficulty={ex.difficulty}
                        equipment={ex.equipment}
                      />
                      {/*
                        걸리는 것이 있으면 말해준다. 막지는 않는다 —
                        하고 말고는 본인이 정한다.
                      */}
                      {(notSafe || missing.length > 0) && (
                        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warn">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          {[
                            notSafe ? '오늘 몸 상태에는 권하지 않는 운동입니다' : null,
                            missing.length > 0
                              ? `${missing.join('·')}이(가) 필요합니다`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => add(ex.id)}
                      disabled={already || pending}
                      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        already
                          ? 'border-line bg-surface-2 text-muted'
                          : 'border-sky bg-sky text-white hover:bg-sky-strong'
                      }`}
                    >
                      {already ? '넣음' : '넣기'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {matched.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="w-full rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-sky hover:text-sky"
            >
              {matched.length - limit}개 더 보기
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
