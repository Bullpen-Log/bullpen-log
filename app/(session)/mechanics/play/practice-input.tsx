'use client';

export type PracticeForm = {
  throws: string;
  effort: string;
  response: 'clear' | 'pain' | null;
  alreadyLogged: boolean;
};
export const emptyPractice = (): PracticeForm => ({
  throws: '',
  effort: '',
  response: null,
  alreadyLogged: false,
});

export function PracticeInput({
  value,
  onChange,
}: {
  value: PracticeForm;
  onChange: (v: PracticeForm) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-2xl border border-line p-4">
      <legend className="text-sm font-semibold">오늘 이 드릴의 실제 투구</legend>
      <p className="text-xs text-muted">
        오늘 이 드릴로 던진 합계를 적어요. 투구 기록에 한 번만 저장돼요.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          실제 횟수
          <input
            type="number"
            min="0"
            max="1000"
            value={value.throws}
            onChange={(e) => onChange({ ...value, throws: e.target.value })}
            className="min-h-11 w-full rounded-lg border border-line bg-surface p-2"
          />
        </label>
        <label className="text-xs">
          체감 강도 %
          <input
            type="number"
            min="0"
            max="100"
            value={value.effort}
            onChange={(e) => onChange({ ...value, effort: e.target.value })}
            className="min-h-11 w-full rounded-lg border border-line bg-surface p-2"
          />
        </label>
      </div>
      <div className="flex gap-2">
        {(
          [
            { value: 'clear', label: '통증 없었어요' },
            { value: 'pain', label: '통증이 있었어요' },
          ] as const
        ).map((x) => (
          <button
            key={x.value}
            type="button"
            aria-pressed={value.response === x.value}
            onClick={() => onChange({ ...value, response: x.value })}
            className={`min-h-11 flex-1 rounded-lg border p-2 text-sm ${value.response === x.value ? 'border-sky bg-sky-tint' : 'border-line'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.alreadyLogged}
          onChange={(e) => onChange({ ...value, alreadyLogged: e.target.checked })}
        />
        다른 투구 기록에 이미 포함했어요
      </label>
    </fieldset>
  );
}
