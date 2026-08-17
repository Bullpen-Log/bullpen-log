'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { setExerciseDone } from '@/app/actions/exercise-log';
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
  thumbUrl: string | null;
  done: boolean;
  /** 세션 안에서 이 운동이 놓이는 구간 (워밍업·본운동·코어·암케어) */
  slot: SlotKey;
};

/**
 * 오늘 할 운동 목록. 누르면 바로 완료로 표시된다.
 *
 * 저장이 끝나기 전에 화면을 먼저 바꿔 손맛을 살리고,
 * 실패하면 원래대로 되돌리며 이유를 알린다.
 */
export function TodayList({ exercises }: { exercises: TodayExercise[] }) {
  const [items, setItems] = useState(exercises);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

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
            <ExerciseList items={group} onToggle={toggle} />
          </section>
        );
      })}
    </div>
  );
}

function ExerciseList({
  items,
  onToggle,
}: {
  items: TodayExercise[];
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((ex) => (
          <li key={ex.id}>
            <button
              type="button"
              onClick={() => onToggle(ex.id)}
              aria-pressed={ex.done}
              className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${
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
                </span>
                <ExerciseBadges
                  bodyParts={ex.bodyParts}
                  intensity={ex.intensity}
                  difficulty={ex.difficulty}
                  equipment={ex.equipment}
                />
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
          </li>
      ))}
    </ul>
  );
}
