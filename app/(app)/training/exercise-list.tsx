'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { setExerciseDone } from '@/app/actions/exercise-log';
import { removeFromTodayPlan } from '@/app/actions/plan-edit';
import { SLOT_LABELS, SLOT_ORDER, type SlotKey } from '@/lib/report/theme';
import { AMOUNT_LIMITS, type AmountField } from '@/lib/exercise-meta';
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
  /**
   * 이 운동이 시간형(버티기)인가.
   *
   * 횟수를 적을지 초를 적을지가 달라진다. 30초 플랭크에 "몇 회 했나요"를
   * 물으면 답할 수가 없다.
   */
  isHold: boolean;
  /** 실제로 한 만큼. 아직 안 적었으면 빈 문자열 */
  doneSets: string;
  doneReps: string;
  doneHoldSeconds: string;
  doneWeightKg: string;
  /**
   * 무게 칸을 보여줄 운동인가.
   *
   * 맨몸 스트레칭에 "몇 kg 들었나요"를 물으면 답할 것이 없다. 무게를 쓰는
   * 장비를 하나라도 쓰는 운동에만 낸다.
   */
  usesWeight: boolean;
};

/** 화면의 칸 이름을 상한 이름에 이어 준다. */
const AMOUNT_FIELD = {
  doneSets: 'sets',
  doneReps: 'reps',
  doneHoldSeconds: 'holdSeconds',
  doneWeightKg: 'weightKg',
} as const satisfies Record<string, AmountField>;

/**
 * 오늘 할 운동 목록. 누르면 바로 완료로 표시된다.
 *
 * 저장이 끝나기 전에 화면을 먼저 바꿔 손맛을 살리고,
 * 실패하면 원래대로 되돌리며 이유를 알린다.
 *
 * 완료로 표시하면 "실제로 몇 세트 몇 회 했는지" 적는 칸이 열린다. 계획값을
 * 미리 채워 두지 않는다 — 눌러서 넘어가기는 편하지만, 실제로 한 것과 다른
 * 숫자가 그대로 저장된다. 그 숫자로 운동 부하를 계산하므로 편한 것보다 맞는
 * 것이 먼저다. 안 적어도 되고, 그러면 '한 것은 맞지만 얼마나 했는지는 모름'이
 * 된다.
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

  /**
   * 실제로 한 만큼을 적는 칸의 값.
   *
   * 저장은 칸에서 손을 뗄 때(blur) 한다. 한 글자마다 저장하면 '1'을 치는
   * 순간 1세트로 저장됐다가 '10'으로 고쳐지는데, 그 사이에 화면을 닫으면
   * 틀린 값이 남는다.
   */
  const setAmount = (
    id: string,
    field: 'doneSets' | 'doneReps' | 'doneHoldSeconds' | 'doneWeightKg',
    value: string
  ) => {
    // 숫자만 받는다. 붙여넣기로 들어온 글자도 여기서 걸린다.
    const digits = value.replace(/[^0-9]/g, '').slice(0, 3);
    /*
     * 넘치는 값은 여기서 최댓값으로 깎는다.
     *
     * 예전에는 그냥 받아 두고 서버가 범위 밖이면 '안 적음'으로 버렸다. 그래서
     * 250회를 치면 화면엔 250 이 남고 DB 에는 아무것도 안 들어갔다 — 저장된
     * 줄 알지만 부하 계산에서는 '얼마나 했는지 모름'이 된다. 깎아서 보여주면
     * 무엇이 저장됐는지 눈으로 확인된다.
     */
    const max = AMOUNT_LIMITS[AMOUNT_FIELD[field]];
    const capped =
      digits === '' ? '' : String(Math.min(Number(digits), max));
    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: capped } : e)));
  };

  const saveAmount = (id: string) => {
    const target = items.find((e) => e.id === id);
    if (!target || !target.done) return;
    setError(undefined);
    startTransition(async () => {
      const res = await setExerciseDone(id, true, {
        sets: target.doneSets,
        reps: target.isHold ? '' : target.doneReps,
        holdSeconds: target.isHold ? target.doneHoldSeconds : '',
        weightKg: target.usesWeight ? target.doneWeightKg : '',
      });
      if ('error' in res) setError(res.error);
    });
  };

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

    /*
     * 완료를 풀면 적어 둔 세트·횟수도 지운다. 서버에서도 줄째로 지우므로,
     * 화면에만 남겨두면 다시 체크했을 때 저장되지 않은 숫자가 보인다.
     */
    setItems((prev) =>
      prev.map((e) =>
        e.id === id
          ? next
            ? { ...e, done: true }
            : {
                ...e,
                done: false,
                doneSets: '',
                doneReps: '',
                doneHoldSeconds: '',
                doneWeightKg: '',
              }
          : e
      )
    );
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
            <ExerciseList
              items={group}
              onToggle={toggle}
              onRemove={remove}
              onAmountChange={setAmount}
              onAmountBlur={saveAmount}
            />
          </section>
        );
      })}

      {children}
    </div>
  );
}

/** 실제로 한 만큼을 적는 작은 칸 하나 */
function AmountInput({
  value,
  unit,
  label,
  onChange,
  onBlur,
}: {
  value: string;
  unit: string;
  label: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="inline-flex items-center gap-1 text-xs text-muted">
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-label={label}
        placeholder="—"
        className="w-11 rounded-lg border border-line bg-surface px-2 py-1 text-center text-sm font-semibold text-ink outline-none transition-colors placeholder:font-normal placeholder:text-muted/50 focus:border-sky"
      />
      {unit}
    </label>
  );
}

function ExerciseList({
  items,
  onToggle,
  onRemove,
  onAmountChange,
  onAmountBlur,
}: {
  items: TodayExercise[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAmountChange: (
    id: string,
    field: 'doneSets' | 'doneReps' | 'doneHoldSeconds' | 'doneWeightKg',
    value: string
  ) => void;
  onAmountBlur: (id: string) => void;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((ex) => (
          /*
            빼기 단추를 완료 단추 안에 넣을 수는 없다(단추 안의 단추). 나란히
            두고, 완료 쪽이 남은 자리를 다 쓰게 한다.
          */
          <li key={ex.id} className="flex items-stretch gap-2">
            <div
              className={`flex min-w-0 flex-1 flex-col rounded-2xl border transition-colors ${
                ex.done ? 'border-sky bg-sky-tint' : 'border-line bg-surface'
              }`}
            >
            <button
              type="button"
              onClick={() => onToggle(ex.id)}
              aria-pressed={ex.done}
              className={`flex w-full items-start gap-3 rounded-2xl px-4 py-4 text-left transition-colors ${
                ex.done ? '' : 'hover:bg-surface-2'
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

            {/*
              실제로 한 만큼.

              완료 단추 안에 넣을 수는 없다(단추 안의 입력칸은 누를 수가 없다).
              같은 테두리 안에 아래 줄로 붙여 한 덩어리로 보이게 한다.
            */}
            {ex.done && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-sky-soft/50 px-4 py-2.5">
                <span className="text-xs font-medium text-sky-strong">실제로 한 것</span>
                <AmountInput
                  value={ex.doneSets}
                  unit="세트"
                  label={`${ex.title} 실제로 한 세트 수`}
                  onChange={(v) => onAmountChange(ex.id, 'doneSets', v)}
                  onBlur={() => onAmountBlur(ex.id)}
                />
                <span aria-hidden className="text-xs text-muted">
                  ×
                </span>
                {ex.isHold ? (
                  <AmountInput
                    value={ex.doneHoldSeconds}
                    unit="초"
                    label={`${ex.title} 세트당 실제로 버틴 시간(초)`}
                    onChange={(v) => onAmountChange(ex.id, 'doneHoldSeconds', v)}
                    onBlur={() => onAmountBlur(ex.id)}
                  />
                ) : (
                  <AmountInput
                    value={ex.doneReps}
                    unit="회"
                    label={`${ex.title} 세트당 실제로 한 횟수`}
                    onChange={(v) => onAmountChange(ex.id, 'doneReps', v)}
                    onBlur={() => onAmountBlur(ex.id)}
                  />
                )}
                {/*
                  무게는 선택이다. 적으면 "평소보다 무겁게 들었나"를 부하에
                  반영한다 — 1RM을 추정하지 않고 본인의 최근 평균과 견준다.
                  맨몸 운동에는 아예 칸을 내지 않는다.
                */}
                {ex.usesWeight && (
                  <>
                    <span aria-hidden className="text-xs text-muted">
                      ·
                    </span>
                    <AmountInput
                      value={ex.doneWeightKg}
                      unit="kg"
                      label={`${ex.title} 실제로 든 무게(kg)`}
                      onChange={(v) => onAmountChange(ex.id, 'doneWeightKg', v)}
                      onBlur={() => onAmountBlur(ex.id)}
                    />
                  </>
                )}
                <span className="text-[11px] text-muted">안 적어도 됩니다</span>
              </div>
            )}
            </div>

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
