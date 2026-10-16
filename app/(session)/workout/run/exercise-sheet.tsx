'use client';

import { ChevronDown, ChevronUp, X } from '@/components/icon';
import { Modal } from '@/components/modal';
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
  open,
  exercises,
  sets,
  at,
  onJump,
  onApply,
  onClose,
  busy,
  error,
}: {
  /** 열림 — 닫힐 때 시트가 내려가도록 부모가 잠시 붙들어 둔다(components/modal.tsx useLinger) */
  open: boolean;
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

  /*
   * 앱의 다른 창과 같은 시트(components/modal.tsx) — 끌어내려 닫기 · ESC · 뒤 화면 막기 · 닫힐 때 내려가는 움직임이 같이 온다.
   * 예전엔 손으로 만든 div 시트라 이것들이 없었다(2026-10-16 UI 검토).
   */
  return (
    <Modal open={open} onClose={onClose} title={`오늘 운동 ${exercises.length}개`}>
      {error && (
        <p className="mb-3 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
          {error}
        </p>
      )}

      <ol className="-mx-2 space-y-1.5">
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
                  <span className="block truncate text-caption text-muted">
                    {/* 뺄 수 없는 까닭을 글로 — title(마우스 올리기)은 폰에서 안 보인다 */}
                    {done > 0
                      ? `${done}세트 남김 · 기록이 있어 못 빼요`
                      : (ex.prescription ?? '아직')}
                  </span>
                </span>
              </button>

              {/*
                  손가락 크기(44px)로 — 28px 단추 셋이 2px 사이로 붙어 있어 ↓ 를 누르려다 ✕ 를 눌러 운동이 빠졌다.
                  ✕ 는 조금 떨어뜨린다.
                */}
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={busy || i === 0}
                  aria-label={`${ex.title} 위로`}
                  className="grid h-11 w-11 place-items-center rounded-lg text-muted transition-colors active:text-sky disabled:opacity-25"
                >
                  <ChevronUp className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={busy || i === exercises.length - 1}
                  aria-label={`${ex.title} 아래로`}
                  className="grid h-11 w-11 place-items-center rounded-lg text-muted transition-colors active:text-sky disabled:opacity-25"
                >
                  <ChevronDown className="h-5 w-5" />
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
                  title={done > 0 ? '기록을 남긴 운동은 뺄 수 없어요' : undefined}
                  className="ml-2 grid h-11 w-11 place-items-center rounded-lg text-muted transition-colors active:text-warn disabled:opacity-25"
                >
                  <X className="h-5 w-5" />
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 px-2 text-center text-caption leading-relaxed text-muted/80">
        뺀 운동은 오늘만 빠져요. 트레이닝 화면의 일정은 그대로 남아요.
      </p>
    </Modal>
  );
}
