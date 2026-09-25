'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { NotebookPen, Pencil } from 'lucide-react';
import { saveExerciseNote } from '@/app/actions/exercise-note';
import { EXERCISE_NOTE_MAX, cleanExerciseNote } from '@/lib/exercise-meta';

/** 쓰는 중인 메모. 어느 운동의 것인지를 함께 들고 있는다(아래 설명). */
type Draft = { exerciseId: string; text: string; error?: string };

/**
 * 운동 이름 아래의 '내 메모' — 운동 하나에 하나.
 *
 * "그립 한 칸 넓게"처럼 그 운동을 할 때마다 떠올려야 하는 것을 적는다. 다음에
 * 그 운동을 할 때 이 자리에 미리 떠 있고, 라이브러리의 그 운동 상세에도
 * 보인다. 날마다 쌓이는 느낀점(운동을 마칠 때)과는 다르다 — 고치면 덮어쓴다.
 *
 * ■ 쓰던 글은 운동을 옮겨도 남는다
 *
 * 이 조각은 운동을 옮겨도 새로 만들어지지 않고 exerciseId 만 바뀐다. 그래서
 * 쓰던 글에 어느 운동의 것인지를 붙여 둔다 — 다른 운동으로 가면 안 보이고,
 * 돌아오면 쓰던 그대로 다시 열린다. 저장하다 난 오류도 그 글에 붙는다.
 * 쓰던 것을 두고 다른 운동의 메모를 열면 그때 버린다(한 번에 하나만 쓴다).
 *
 * ■ 저장 단추는 입력칸 위에
 *
 * 폰 자판이 올라오면 화면 아래쪽이 가린다. 단추를 입력칸 밑에 두면 다 쓰고
 * 나서 자판을 내려야 누를 수 있다.
 */
export function ExerciseNote({
  exerciseId,
  note,
  onSaved,
}: {
  exerciseId: string;
  /** 지금 저장된 메모. 없으면 null */
  note: string | null;
  onSaved: (exerciseId: string, note: string | null) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, startSaving] = useTransition();

  const writing = draft?.exerciseId === exerciseId ? draft : null;

  const save = () => {
    if (!writing) return;
    /* 안 바꿨으면 서버에 갈 것 없이 닫는다 */
    if (cleanExerciseNote(writing.text) === (note ?? '')) {
      setDraft(null);
      return;
    }
    const target = writing.exerciseId;
    const sent = writing.text;
    /* 저장하는 사이 다른 운동의 메모를 열었으면 그쪽은 건드리지 않는다 */
    const settle = (next: (d: Draft) => Draft | null) =>
      setDraft((d) => (d?.exerciseId === target ? next(d) : d));

    settle((d) => ({ ...d, error: undefined }));
    startSaving(async () => {
      try {
        const res = await saveExerciseNote({ exerciseId: target, body: sent });
        if ('error' in res) {
          settle((d) => ({ ...d, error: res.error }));
          return;
        }
        onSaved(target, res.note);
        /* 저장하는 동안 더 쓴 글이 있으면 닫지 않는다 — 한 번 더 누르면 된다 */
        settle((d) => (d.text === sent ? null : d));
      } catch (err) {
        unstable_rethrow(err);
        /* 쓴 글은 그대로 둔다 — 신호가 잡히면 한 번 더 누르면 된다 */
        settle((d) => ({
          ...d,
          error:
            '신호가 없어 메모를 저장하지 못했습니다. 신호가 잡히면 다시 눌러 주세요.',
        }));
      }
    });
  };

  if (writing) {
    return (
      <div className="mt-3 rounded-xl border border-sky bg-sky/5 p-3">
        <div className="flex items-center gap-1">
          <span className="flex flex-1 items-center gap-1.5 text-xs font-semibold text-sky">
            <NotebookPen aria-hidden className="h-3.5 w-3.5" />내 메모
          </span>
          <button
            type="button"
            onClick={() => setDraft(null)}
            disabled={saving}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors active:text-ink disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-sky px-3.5 py-1.5 text-xs font-bold text-white transition-transform disabled:opacity-60 motion-safe:active:scale-95"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
        {/* 저장 단추 바로 밑 — 상자 맨 아래에 두면 아래 입력판과 자판에 가려 안 보인다 */}
        {writing.error && (
          <p
            role="alert"
            className="mt-2 rounded-lg bg-warn-bg px-3 py-2 text-xs break-keep text-warn"
          >
            {writing.error}
          </p>
        )}
        <textarea
          /* 누르자마자 쓸 수 있게 — 메모를 열었다는 것은 쓰겠다는 뜻이다 */
          autoFocus
          value={writing.text}
          onChange={(e) => setDraft({ exerciseId, text: e.target.value })}
          maxLength={EXERCISE_NOTE_MAX}
          rows={3}
          aria-label="이 운동에 대한 내 메모"
          placeholder="예: 그립 한 칸 넓게, 벤치 등받이 3칸"
          className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-sky"
        />
        <p className="mt-1 flex gap-2 text-[11px] leading-relaxed text-muted">
          <span className="flex-1 break-keep">
            다음에 이 운동을 할 때와 라이브러리에서 보입니다. 비우고 저장하면
            지워집니다.
          </span>
          <span className="shrink-0 tabular-nums">
            {writing.text.length}/{EXERCISE_NOTE_MAX}
          </span>
        </p>
      </div>
    );
  }

  const open = () => setDraft({ exerciseId, text: note ?? '' });

  if (!note) {
    return (
      <button
        type="button"
        onClick={open}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg py-1 text-xs text-muted transition-colors hover:text-sky active:text-sky"
      >
        <NotebookPen aria-hidden className="h-3.5 w-3.5" />이 운동에 내 메모 남기기
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="mt-3 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors active:bg-surface-2"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
        <NotebookPen aria-hidden className="h-3.5 w-3.5" />내 메모
        <span className="ml-auto inline-flex items-center gap-1 font-normal">
          <Pencil aria-hidden className="h-3 w-3" />
          고치기
        </span>
      </span>
      <span className="mt-1 block whitespace-pre-wrap break-keep text-sm leading-relaxed text-ink">
        {note}
      </span>
    </button>
  );
}
