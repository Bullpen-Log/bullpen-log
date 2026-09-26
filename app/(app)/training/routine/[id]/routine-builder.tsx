'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Minus,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ExerciseBadges } from '@/components/meta-badges';
import { MuscleChips } from '@/components/muscle-chips';
import { ConfirmDelete } from '@/components/confirm-delete';
import { ARMCARE_AREAS, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { ARMCARE_METHODS, type ArmcareMethodKey } from '@/lib/armcare/methods';
import {
  MY_ROUTINE_MAX,
  MY_ROUTINE_MAX_ITEMS,
  MY_ROUTINE_NAME_MAX,
  MY_ROUTINE_SETS_MAX,
  MY_ROUTINE_SETS_MIN,
  normalizeRoutineInput,
  type MyRoutineItem,
} from '@/lib/armcare/my-routines';
import { deleteMyArmcareRoutine, saveMyArmcareRoutine } from '@/app/actions/armcare';
import { ExerciseMedia, type ArmcareExerciseView } from '../../armcare-media';
import { useArmcareInfo } from '../../armcare-info';

/** 고르는 목록의 운동 하나 — 서버(page.tsx)가 만들어 넘긴다 */
export type BuilderExercise = {
  view: ArmcareExerciseView;
  /** 담을 때 처음 잡히는 세트 — 운동에 적힌 처방 */
  defaultSets: number;
  /** 주로 키우는 부위 — 고르는 목록을 부위로 거를 때 */
  area: ArmcareAreaKey | null;
  method: ArmcareMethodKey;
  /** 1~5세트를 할 때 걸리는 분 (lib/armcare/routine.ts 의 armcareMinutes) */
  minutes: number[];
  /** 세트를 뺀 처방 — '10회 (좌우 각각) · 세트 사이 45초 휴식' */
  dose: string | null;
};

type Filter = 'all' | ArmcareAreaKey;

/**
 * 내 루틴 만들기 — 이름, 담은 운동(세트·차례), 고르는 목록.
 *
 * 규칙(이름 길이, 운동 수, 세트)은 저장하는 쪽과 같은 것을 쓴다
 * (lib/armcare/my-routines.ts). 여기서 먼저 막아 두면 눌렀다가 튕기는 일이 없다.
 */
export function RoutineBuilder({
  id,
  initialName,
  initialItems,
  exercises,
  full,
  droppedHidden,
}: {
  /** 고치는 루틴. 새로 만들면 null */
  id: string | null;
  initialName: string;
  initialItems: MyRoutineItem[];
  exercises: BuilderExercise[];
  /** 루틴이 이미 최대 개수라 새로 못 만든다 */
  full: boolean;
  /** 담아 뒀는데 라이브러리에서 숨겨져 빠진 운동 수 */
  droppedHidden: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<MyRoutineItem[]>(initialItems);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();
  /* 근육 칩을 누르면 그 근육의 3D 그림·설명 창(armcare-info.tsx) */
  const info = useArmcareInfo();

  const byId = useMemo(
    () => new Map(exercises.map((e) => [e.view.id, e])),
    [exercises]
  );
  const picked = new Set(items.map((it) => it.exerciseId));
  const atMax = items.length >= MY_ROUTINE_MAX_ITEMS;
  const minutes = Math.round(
    items.reduce(
      (sum, it) => sum + (byId.get(it.exerciseId)?.minutes[it.sets - 1] ?? 0),
      0
    )
  );

  const shown = exercises.filter((e) => {
    if (filter !== 'all' && e.area !== filter) return false;
    /* 'trx', 'gg' 처럼 소문자로 찾아도 나오게 */
    const q = query.trim().toLowerCase();
    return (
      !q ||
      e.view.title.toLowerCase().includes(q) ||
      e.view.targetMuscles.some((m) => m.includes(q))
    );
  });

  const toggle = (e: BuilderExercise) => {
    setError(undefined);
    setItems((prev) =>
      prev.some((it) => it.exerciseId === e.view.id)
        ? prev.filter((it) => it.exerciseId !== e.view.id)
        : prev.length >= MY_ROUTINE_MAX_ITEMS
          ? prev
          : [...prev, { exerciseId: e.view.id, sets: e.defaultSets }]
    );
  };
  const move = (index: number, by: -1 | 1) =>
    setItems((prev) => {
      const to = index + by;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  const setSets = (index: number, sets: number) =>
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              sets: Math.min(MY_ROUTINE_SETS_MAX, Math.max(MY_ROUTINE_SETS_MIN, sets)),
            }
          : it
      )
    );

  const save = () => {
    const check = normalizeRoutineInput({ name, items });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(undefined);
    startSaving(async () => {
      const res = await saveMyArmcareRoutine({ id, name, items });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      router.push('/training?view=armcare');
    });
  };

  if (full) {
    return (
      <p className="rounded-2xl border border-warn-line bg-warn-bg px-5 py-4 text-sm leading-relaxed break-keep text-warn">
        루틴은 {MY_ROUTINE_MAX}개까지 둘 수 있습니다. 안 쓰는 루틴을 지운 뒤 새로 만들어
        주세요.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* 이름 */}
      <div className="space-y-1.5">
        <label htmlFor="routine-name" className="px-1 text-sm font-semibold text-ink">
          루틴 이름
        </label>
        <input
          id="routine-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MY_ROUTINE_NAME_MAX}
          placeholder="예: 투구 전 루틴, 집에서"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-sky"
        />
      </div>

      {/* 담은 운동 */}
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-heading text-lg text-ink">
            담은 운동 <span className="text-muted tabular-nums">{items.length}</span>
          </h2>
          {items.length > 0 && (
            <span className="text-sm text-muted">
              약{' '}
              <span className="font-semibold text-ink tabular-nums">
                {Math.max(1, minutes)}
              </span>
              분
            </span>
          )}
        </div>
        {droppedHidden > 0 && (
          <p className="px-1 text-xs text-muted">
            담아 둔 운동 중 {droppedHidden}개는 라이브러리에서 숨겨져 뺐습니다. 저장하면
            빠진 채로 남습니다.
          </p>
        )}
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm leading-relaxed break-keep text-muted">
            아래 목록에서 운동을 골라 담으세요. 담은 차례대로 합니다.
          </p>
        ) : (
          <ol className="space-y-2">
            {items.map((it, i) => {
              const e = byId.get(it.exerciseId);
              if (!e) return null;
              return (
                <li
                  key={it.exerciseId}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3"
                >
                  <span className="w-5 shrink-0 text-center text-xs font-bold text-muted tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-sm font-bold break-keep text-ink">
                      {e.view.title}
                    </span>
                    {e.dose && (
                      <span className="block text-xs text-muted">{e.dose}</span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-lg border border-line">
                      <button
                        type="button"
                        onClick={() => setSets(i, it.sets - 1)}
                        disabled={it.sets <= MY_ROUTINE_SETS_MIN}
                        aria-label={`${e.view.title} 세트 줄이기`}
                        className="flex h-7 w-7 items-center justify-center text-muted transition-colors hover:text-sky disabled:opacity-30"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-10 text-center text-xs font-semibold text-ink tabular-nums">
                        {it.sets}세트
                      </span>
                      <button
                        type="button"
                        onClick={() => setSets(i, it.sets + 1)}
                        disabled={it.sets >= MY_ROUTINE_SETS_MAX}
                        aria-label={`${e.view.title} 세트 늘리기`}
                        className="flex h-7 w-7 items-center justify-center text-muted transition-colors hover:text-sky disabled:opacity-30"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={`${e.view.title} 앞으로`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-sky disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      aria-label={`${e.view.title} 뒤로`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-sky disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(e)}
                    aria-label={`${e.view.title} 빼기`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* 고르는 목록 */}
      <section className="space-y-3">
        <div className="space-y-0.5 px-1">
          <h2 className="text-heading text-lg text-ink">운동 고르기</h2>
          <p className="text-xs text-muted">
            암케어 운동 {exercises.length}개 · 한 루틴에 {MY_ROUTINE_MAX_ITEMS}개까지
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 focus-within:border-sky">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-muted" />
          <input
            id="routine-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="운동·근육 이름으로 찾기"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/70"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="부위로 거르기">
          {(['all', ...ARMCARE_AREAS.map((a) => a.key)] as Filter[]).map((key) => {
            const on = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  on
                    ? 'border-sky bg-sky-tint text-sky-strong'
                    : 'border-line bg-surface text-muted hover:text-ink'
                }`}
              >
                {key === 'all'
                  ? '전체'
                  : ARMCARE_AREAS.find((a) => a.key === key)!.label}
              </button>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted">
            맞는 운동이 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {shown.map((e) => {
              const inside = picked.has(e.view.id);
              const method = ARMCARE_METHODS.find((m) => m.key === e.method)!;
              return (
                <li
                  key={e.view.id}
                  className={`overflow-hidden rounded-xl border bg-surface transition-colors ${
                    inside ? 'border-sky' : 'border-line'
                  }`}
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold break-keep text-ink">
                          {e.view.title}
                        </span>
                        {e.method !== 'basic' && (
                          <span className="text-[10px] font-semibold text-sky-strong">
                            {method.label}
                          </span>
                        )}
                      </span>
                      {e.view.prescription && (
                        <span className="block text-xs text-muted">
                          {e.view.prescription}
                        </span>
                      )}
                      <MuscleChips
                        muscles={e.view.targetMuscles}
                        max={2}
                        onPick={
                          info
                            ? (m, ev) => info({ kind: 'muscle', name: m }, ev)
                            : undefined
                        }
                      />
                      <ExerciseBadges
                        bodyParts={[]}
                        intensity={e.view.intensity}
                        difficulty={e.view.difficulty}
                        equipment={e.view.equipment}
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(e)}
                      disabled={!inside && atMax}
                      aria-pressed={inside}
                      aria-label={`${e.view.title} ${inside ? '빼기' : '담기'}`}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
                        inside
                          ? 'bg-sky text-white hover:bg-sky-strong'
                          : 'border border-line-strong text-ink hover:border-sky hover:text-sky'
                      }`}
                    >
                      {inside ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {inside ? '담김' : '담기'}
                    </button>
                  </div>
                  <ExerciseMedia exercise={e.view} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {id && (
        <div className="flex justify-center">
          <ConfirmDelete
            onConfirm={async () => {
              const res = await deleteMyArmcareRoutine(id);
              if ('error' in res) {
                setError(res.error);
                return;
              }
              router.push('/training?view=armcare');
            }}
            title="이 루틴을 지울까요?"
            detail={
              <>
                <b>{initialName}</b> 루틴이 사라집니다. 그동안 체크한 운동 기록은 그대로
                남습니다.
              </>
            }
            ariaLabel={`${initialName} 루틴 지우기`}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:text-danger"
          >
            <Trash2 aria-hidden className="h-4 w-4" />이 루틴 지우기
          </ConfirmDelete>
        </div>
      )}

      {/* 저장 — 목록을 훑는 동안에도 손이 닿게 아래에 붙인다(모바일 하단 탭 위) */}
      <div className="sticky bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] z-30 space-y-2 rounded-2xl border border-sky-soft/50 bg-surface/95 p-3 backdrop-blur-xl desk:bottom-4">
        {error && <p className="px-1 text-sm break-keep text-danger">{error}</p>}
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 px-1 text-xs break-keep text-muted">
            {items.length === 0
              ? '운동을 담아 주세요'
              : `${items.length}개 · 약 ${Math.max(1, minutes)}분`}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="shrink-0 rounded-xl bg-sky px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong disabled:opacity-60"
          >
            {saving ? '저장하는 중…' : id ? '고친 것 저장' : '루틴 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
