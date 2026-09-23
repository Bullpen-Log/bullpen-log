'use client';

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { RunExercise, RunSet } from './session-client';

/**
 * 오늘 할 운동 목록.
 *
 * 진행 막대를 누르면 아래에서 올라온다. 예전에는 [이전]·[다음]으로 한 칸씩만
 * 갈 수 있어서, 여섯 번째 운동에 가려면 다섯 번을 눌러야 했다. 무엇이 남았는지
 * 도 알 수 없었다.
 *
 * 헬스장에서는 기구가 차 있어 순서를 바꾸는 일이 잦고, 오늘은 그만두고 싶은
 * 운동도 생긴다. 그때마다 화면을 나가 일정을 고치고 다시 들어오게 할 수는
 * 없다.
 */
export function ExerciseSheet({
  exercises,
  sets,
  at,
  onJump,
  onApply,
  onClose,
  busy,
  error,
}: {
  exercises: RunExercise[];
  sets: RunSet[];
  at: number;
  onJump: (index: number) => void;
  /** 바뀐 순서를 id 목록으로 넘긴다. 빠진 것은 오늘 안 하는 것이다. */
  onApply: (ids: string[]) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  const countOf = (id: string) => sets.filter((s) => s.exerciseId === id).length;

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= exercises.length) return;
    const ids = exercises.map((e) => e.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onApply(ids);
  };

  const drop = (i: number) => {
    onApply(exercises.filter((_, k) => k !== i).map((e) => e.id));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* 바깥을 눌러도 닫힌다 */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-shade/60"
      />

      <div className="relative max-h-[80%] overflow-y-auto rounded-t-3xl border-t border-line bg-surface pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <p className="text-sm font-bold text-ink">오늘 운동 {exercises.length}개</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="목록 닫기"
            className="rounded-lg p-1.5 text-muted transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="mx-4 mt-3 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
            {error}
          </p>
        )}

        <ol className="space-y-1.5 p-3">
          {exercises.map((ex, i) => {
            const done = countOf(ex.id);
            const here = i === at;
            return (
              <li
                key={ex.id}
                className={`flex items-center gap-2 rounded-xl border px-2 py-2 ${
                  here ? 'border-sky bg-sky/5' : 'border-line'
                }`}
              >
                {/* 누르면 그 운동으로 바로 간다 */}
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span
                    className={`w-5 shrink-0 text-center text-xs tabular-nums ${
                      here ? 'font-bold text-sky' : 'text-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${
                        here ? 'font-bold text-sky' : 'text-ink'
                      }`}
                    >
                      {ex.title}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {done > 0 ? `${done}세트 남김` : (ex.prescription ?? '아직')}
                    </span>
                  </span>
                </button>

                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={busy || i === 0}
                    aria-label={`${ex.title} 위로`}
                    className="rounded-md p-1.5 text-muted transition-colors active:text-sky disabled:opacity-25"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={busy || i === exercises.length - 1}
                    aria-label={`${ex.title} 아래로`}
                    className="rounded-md p-1.5 text-muted transition-colors active:text-sky disabled:opacity-25"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  {/*
                    세트를 남긴 운동은 못 뺀다. 빼면 목록에는 없는데 기록은
                    남아, 종료할 때 그것까지 접힌다.
                  */}
                  <button
                    type="button"
                    onClick={() => drop(i)}
                    disabled={busy || done > 0 || exercises.length === 1}
                    aria-label={`${ex.title} 오늘 빼기`}
                    title={done > 0 ? '기록을 남긴 운동은 뺄 수 없습니다' : undefined}
                    className="rounded-md p-1.5 text-muted transition-colors active:text-warn disabled:opacity-25"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>

        <p className="px-4 pb-3 text-center text-[11px] leading-relaxed text-muted/80">
          뺀 운동은 오늘만 빠집니다. 트레이닝 화면의 일정은 그대로 남습니다.
        </p>
      </div>
    </div>
  );
}
