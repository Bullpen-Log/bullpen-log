'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { setExerciseDone } from '@/app/actions/exercise-log';
import { removeFromTodayPlan } from '@/app/actions/plan-edit';
import { SLOT_LABELS, SLOT_ORDER, type SlotKey } from '@/lib/report/theme';
import { ExerciseBadges } from '@/components/meta-badges';

export type TodayExercise = {
  id: string;
  title: string;
  category: string;
  description: string;
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
  /** '3세트 × 10회 · 세트 사이 45초 휴식' — 아직 안 채운 운동은 null */
  prescription: string | null;
  thumbUrl: string | null;
  /** 아직 촬영 전이라 유튜브 참고 영상으로 대신하고 있는가 */
  isReference: boolean;
  done: boolean;
  /** 세션 안에서 이 운동이 놓이는 구간 (워밍업·본운동·코어·암케어) */
  slot: SlotKey;
  /** 사용자가 직접 더한 운동인가 */
  manual: boolean;
  /** 지금 몸 상태 기준으로는 권하지 않는 운동인가 */
  unsafe: boolean;
};

/**
 * 오늘 할 운동 목록. 누르면 바로 완료로 표시된다.
 *
 * 저장이 끝나기 전에 화면을 먼저 바꿔 손맛을 살리고,
 * 실패하면 원래대로 되돌리며 이유를 알린다.
 */
export function ExerciseChecklist({
  exercises,
  children,
}: {
  exercises: TodayExercise[];
  /** 목록 아래에 붙는 '운동 추가' 단추 */
  children?: React.ReactNode;
}) {
  const [items, setItems] = useState(exercises);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  /*
   * 화면이 새로 그려지기 전에는 부모가 준 목록이 그대로라, 여기서 지운 것을
   * 기억해 두고 화면에서만 먼저 뺀다. 누르고 나서 한참 그대로 있으면
   * 안 눌린 줄 알고 또 누르게 된다.
   */
  const remove = (id: string) => {
    const before = items;
    setItems((prev) => prev.filter((e) => e.id !== id));
    setError(undefined);
    startTransition(async () => {
      const res = await removeFromTodayPlan(id);
      if ('error' in res) {
        setItems(before);
        setError(res.error);
      }
    });
  };

  /*
   * 부모가 새 목록을 주면(운동을 더했거나 일정을 다시 만들었을 때) 그것을 따른다.
   * 안 그러면 방금 더한 운동이 목록에 안 나타난다.
   */
  const [seen, setSeen] = useState(exercises);
  if (seen !== exercises) {
    setSeen(exercises);
    setItems(exercises);
  }

  const doneCount = items.filter((e) => e.done).length;
  const allDone = items.length > 0 && doneCount === items.length;

  const toggle = (id: string) => {
    const target = items.find((e) => e.id === id);
    if (!target) return;
    const next = !target.done;

    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, done: next } : e)));
    setError(undefined);

    startTransition(async () => {
      const res = await setExerciseDone(id, next);
      if ('error' in res) {
        setItems((prev) => prev.map((e) => (e.id === id ? { ...e, done: !next } : e)));
        setError(res.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* 진행 상황 */}
      <div className="rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-ink">
            오늘 {doneCount}/{items.length} 완료
          </p>
          {allDone && (
            <span className="text-sm font-semibold text-sky">전부 마쳤습니다 👏</span>
          )}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-sky transition-[width] duration-300"
            style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/*
        구간별로 나눠 보여준다: 워밍업 → 본운동 → 코어 → 암케어.
        순서 없이 한 줄로 늘어놓으면 스트레칭과 무게 드는 운동이 섞여
        뭘 먼저 할지 알 수 없다. 해당 운동이 없는 구간은 제목도 내지 않는다.
      */}
      {SLOT_ORDER.map((slot) => {
        const group = items.filter((ex) => ex.slot === slot);
        if (group.length === 0) return null;
        const { label, hint } = SLOT_LABELS[slot];

        return (
          <section key={slot} className="space-y-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2 px-1">
              <h2 className="text-sm font-bold text-ink">{label}</h2>
              <span className="text-xs text-muted">{hint}</span>
            </div>
            <ExerciseList items={group} onToggle={toggle} onRemove={remove} />
          </section>
        );
      })}

      {children}
    </div>
  );
}

function ExerciseList({
  items,
  onToggle,
  onRemove,
}: {
  items: TodayExercise[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((ex) => (
          /*
            빼기 단추를 완료 단추 안에 넣을 수는 없다(단추 안의 단추). 나란히
            두고, 완료 쪽이 남은 자리를 다 쓰게 한다.
          */
          <li key={ex.id} className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => onToggle(ex.id)}
              aria-pressed={ex.done}
              className={`flex min-w-0 flex-1 items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${
                ex.done
                  ? 'border-sky bg-sky-tint'
                  : 'border-line bg-surface hover:border-sky-soft'
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  ex.done ? 'border-sky bg-sky text-white' : 'border-line-strong'
                }`}
              >
                {ex.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>

              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span
                    className={`text-sm font-semibold ${
                      ex.done ? 'text-sky-strong' : 'text-ink'
                    }`}
                  >
                    {ex.title}
                  </span>
                  <span className="text-[11px] text-muted">{ex.category}</span>
                  {ex.isReference && (
                    <span className="rounded bg-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                      참고 영상
                    </span>
                  )}
                  {ex.manual && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                      직접 넣음
                    </span>
                  )}
                </span>
                {ex.prescription && (
                  <span
                    className={`block text-xs font-semibold ${
                      ex.done ? 'text-sky-strong' : 'text-muted'
                    }`}
                  >
                    {ex.prescription}
                  </span>
                )}
                <ExerciseBadges
                  bodyParts={ex.bodyParts}
                  intensity={ex.intensity}
                  difficulty={ex.difficulty}
                  equipment={ex.equipment}
                />
                {/*
                  직접 넣었는데 오늘 몸 상태에는 무리인 운동. 빼지 않고
                  알리기만 한다 — 넣은 것은 본인이다.
                */}
                {ex.unsafe && (
                  <span className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warn">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    오늘 몸 상태에는 권하지 않는 운동입니다
                  </span>
                )}
              </span>

              {ex.thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ex.thumbUrl}
                  alt=""
                  className="hidden h-14 w-20 shrink-0 rounded-lg object-cover sm:block"
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => onRemove(ex.id)}
              aria-label={`${ex.title} 목록에서 빼기`}
              title="목록에서 빼기"
              className="shrink-0 rounded-2xl border border-line px-2.5 text-muted transition-colors hover:border-danger-line hover:bg-danger-bg hover:text-danger"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
      ))}
    </ul>
  );
}
