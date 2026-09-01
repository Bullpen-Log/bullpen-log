'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { setExerciseDone } from '@/app/actions/exercise-log';
import { CategoryBadge } from '@/components/category-badge';
import { formatAmount } from '@/lib/exercise-meta';
import type { TrainingDayDetail } from '@/lib/report/training-history';

/**
 * 그날 한 운동 목록.
 *
 * 일주일 안의 날짜는 완료 표시를 켜고 끌 수 있다. 운동은 했는데 체크를 깜빡하는
 * 일이 흔한데, 그러면 그 기록이 영영 안 들어가 부하 지수가 낮게 나오고 '오래 안
 * 한 것부터' 고르는 규칙도 그 운동을 안 한 것으로 본다.
 *
 * 수치(세트·횟수·무게)는 오늘 것만 적는다. 사흘 전에 몇 kg 들었는지를 지금
 * 적으면 그 숫자를 믿을 수가 없다. 지난 날짜는 '했다/안 했다'만 남긴다.
 */
export function DayExercises({
  date,
  detail,
}: {
  date: string;
  detail: TrainingDayDetail;
}) {
  const [exercises, setExercises] = useState(detail.exercises);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  /* 켜고 끄면 화면을 먼저 바꾸고 저장한다. 실패하면 되돌리며 이유를 알린다. */
  const toggleDone = (exerciseId: string, next: boolean) => {
    if (!detail.editable) return;
    setExercises((prev) =>
      prev.map((e) => (e.id === exerciseId ? { ...e, done: next } : e))
    );
    setError(undefined);
    startTransition(async () => {
      const res = await setExerciseDone(exerciseId, next, undefined, date);
      if ('error' in res) {
        setExercises((prev) =>
          prev.map((e) => (e.id === exerciseId ? { ...e, done: !next } : e))
        );
        setError(res.error);
      }
    });
  };

  const doneCount = exercises.filter((e) => e.done).length;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {exercises.length > 0 && (
        <p className="px-1 text-sm text-muted">
          <span className="text-display text-lg text-ink">{doneCount}</span>
          <span className="text-line-strong">/{exercises.length}</span> 마침
        </p>
      )}

      <ul className="space-y-2">
        {exercises.map((ex) => {
          const amount = formatAmount(ex);
          const row = (
            <>
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  ex.done
                    ? 'border-sky bg-sky text-white'
                    : 'border-line-strong bg-surface'
                }`}
                aria-hidden
              >
                {ex.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span
                    className={`text-[15px] font-bold tracking-[-0.01em] break-keep ${
                      ex.done ? 'text-ink' : 'text-muted'
                    }`}
                  >
                    {ex.title}
                  </span>
                  <CategoryBadge name={ex.category} />
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">
                  {ex.done ? (
                    <>
                      {amount && (
                        <span className="font-semibold text-sky-strong">
                          {amount} ·{' '}
                        </span>
                      )}
                      {!amount && '마친 것으로 표시함 · '}
                      {ex.planned && `계획 ${ex.planned}`}
                    </>
                  ) : (
                    <>안 한 것으로 남음{ex.planned && ` · 계획 ${ex.planned}`}</>
                  )}
                </span>
              </span>
            </>
          );

          return (
            <li key={ex.id}>
              {detail.editable ? (
                <button
                  type="button"
                  onClick={() => toggleDone(ex.id, !ex.done)}
                  aria-pressed={ex.done}
                  className="flex w-full items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-4 text-left transition-colors hover:border-sky-soft"
                >
                  {row}
                </button>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-4">
                  {row}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/*
        무엇을 할 수 있는 날인지 밝힌다. 눌러도 안 되는데 이유를 안 알려주면
        고장난 줄 안다.
      */}
      {exercises.length > 0 && (
        <p className="px-1 text-[11px] leading-relaxed text-muted/70">
          {detail.editable
            ? '눌러서 켜고 끌 수 있습니다. 세트·횟수·무게는 오늘 것만 적을 수 있습니다 — 지난 날의 숫자는 정확히 기억하기 어렵습니다.'
            : '일주일이 지난 기록은 고칠 수 없습니다.'}
        </p>
      )}
    </div>
  );
}
