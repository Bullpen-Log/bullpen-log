'use client';

import { useState, useTransition } from 'react';
import { Check, Pencil } from 'lucide-react';
import { saveTrainingNote } from '@/app/actions/exercise-log';
import { IntensityGuide } from '@/components/intensity-guide';

/**
 * 오늘 운동이 어땠는지 — 하루에 하나.
 *
 * 세트·횟수는 운동마다 적지만, "얼마나 힘들었나"는 하루에 하나면 된다.
 * 운동 열 개에 강도를 열 번 적게 하면 아무도 안 적는다.
 *
 * 눈금은 투구 강도와 같은 1~10을 쓴다. 두 가지를 다른 눈금으로 재면 나중에
 * 둘을 합쳐 '오늘 몸에 걸린 부담'을 낼 수가 없다 — 그게 이 값을 받는 이유다.
 */
export function TrainingNote({
  intensity,
  memo,
  done,
}: {
  /** 저장해 둔 강도. 아직 안 적었으면 null */
  intensity: number | null;
  memo: string | null;
  /** 오늘 운동을 하나라도 마쳤는가 — 안 했으면 적을 것이 없다 */
  done: boolean;
}) {
  const saved = intensity != null;
  const [editing, setEditing] = useState(!saved);
  const [value, setValue] = useState(intensity ?? 5);
  const [text, setText] = useState(memo ?? '');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(undefined);
    startTransition(async () => {
      const res = await saveTrainingNote(value, text);
      if ('error' in res) setError(res.error);
      else setEditing(false);
    });
  };

  if (!saved && !done) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-5 py-4 text-sm leading-relaxed text-muted">
        운동을 하나라도 마치면 여기에 오늘 운동이 어땠는지 남길 수 있습니다.
      </p>
    );
  }

  if (saved && !editing) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky">
            <Check className="h-4 w-4" strokeWidth={3} />
            오늘 운동 강도 {intensity}/10
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1 text-xs text-ink transition-colors hover:border-sky hover:text-sky"
          >
            <Pencil className="h-3 w-3" />
            고치기
          </button>
        </div>
        {memo && (
          <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm leading-relaxed text-ink/90">
            {memo}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface px-5 py-4">
      <div>
        <p className="text-sm font-bold text-ink">오늘 운동은 어땠나요?</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          하루에 한 번만 적으면 됩니다. 투구와 함께 몸에 걸린 부담을 보는 데 씁니다.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <label htmlFor="training-intensity" className="text-sm font-medium text-ink">
          운동 강도 — {value} / 10
        </label>
        <input
          id="training-intensity"
          type="range"
          min={1}
          max={10}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          style={
            { '--range-pct': `${((value - 1) / 9) * 100}%` } as React.CSSProperties
          }
          className="range"
        />
        <div className="flex justify-between text-[11px] text-muted">
          <span>1 아주 가벼움</span>
          <span>10 전력</span>
        </div>
        {/*
          강도는 감으로 찍으면 그 뒤 계산이 전부 흔들린다.
          고르는 자리 바로 밑에 기준을 둔다 — 투구 기록과 같은 자리다.
        */}
        <div className="pt-1">
          <IntensityGuide />
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-ink">느낀점</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="안 적어도 됩니다. 무거웠던 곳, 잘 된 것 같은 동작 같은 걸 남겨두면 나중에 도움이 됩니다."
          className="w-full resize-y rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-sky"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong disabled:opacity-60"
        >
          {pending ? '저장 중…' : saved ? '고쳐서 저장' : '오늘 운동 기록 저장'}
        </button>
        {saved && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-muted transition-colors hover:text-ink"
          >
            취소
          </button>
        )}
      </div>
    </div>
  );
}
