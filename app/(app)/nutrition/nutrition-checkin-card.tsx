'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  APPETITE_LEVELS,
  MEAL_AMOUNTS,
  SKIPPABLE_MEALS,
  mealSummary,
} from '@/lib/checkin';
import { saveNutritionCheckin } from '@/app/actions/day-cards';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { Chip, DayCard } from '@/components/day-card';
import { buzz } from '@/lib/haptics';

export type NutritionAnswer = {
  appetite: number | null;
  mealAmount: string | null;
  skippedMeals: string[];
};

/**
 * 영양 탭 — '오늘 식욕 · 끼니는요?' 카드(체크인 3판, 2026-10-13).
 *
 * 2판까지 체크인에 있던 식욕 · 끼니 양 · 걸른 끼니의 새 집(DailyNutrition, app/actions/day-cards.ts saveNutritionCheckin).
 * 영양 조언(홈 카드 · 이 탭 맨 위) · 던지는 날 가이드 · 식단 짜기가 읽는다. 오늘에만 보인다 — 지난 날은 적을 수 없다.
 */
export function NutritionCheckinCard({
  day,
  answer,
}: {
  day: string;
  answer: NutritionAnswer | null;
}) {
  const summary = answer
    ? [
        answer.appetite != null
          ? `식욕 ${APPETITE_LEVELS[answer.appetite - 1] ?? answer.appetite}`
          : null,
        mealSummary(answer.mealAmount, answer.skippedMeals),
      ]
        .filter(Boolean)
        .join(' · ') || '적은 것 없음'
    : null;
  return (
    <DayCard
      storageKey="nutrition"
      day={day}
      title="오늘 식욕 · 끼니는요?"
      hint="음식을 하나하나 안 적어도 오늘 조언과 식단이 여기에 맞춰요."
      answer={summary}
      folded
    >
      {(close) => <MealForm day={day} initial={answer} onDone={close} />}
    </DayCard>
  );
}

function MealForm({
  day,
  initial,
  onDone,
}: {
  day: string;
  initial: NutritionAnswer | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [appetite, setAppetite] = useState<number | null>(initial?.appetite ?? null);
  const [amount, setAmount] = useState<string | null>(initial?.mealAmount ?? null);
  const [skipped, setSkipped] = useState<string[]>(initial?.skippedMeals ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggleSkip = (k: string) =>
    setSkipped((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const save = () =>
    start(async () => {
      setError(null);
      const r = await orOffline(
        saveNutritionCheckin({
          date: day,
          appetite,
          mealAmount: amount,
          skippedMeals: skipped,
        }),
        { ok: false as const, error: OFFLINE_MESSAGE }
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      buzz(20);
      router.refresh();
      onDone();
    });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted">식욕</p>
        <div className="chip-grid flex flex-wrap gap-2">
          {APPETITE_LEVELS.map((label, i) => (
            <Chip
              key={label}
              pressed={appetite === i + 1}
              onClick={() => setAppetite(appetite === i + 1 ? null : i + 1)}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted">끼니 양</p>
        <div className="chip-grid flex flex-wrap gap-2" data-cols="3">
          {MEAL_AMOUNTS.map((a) => (
            <Chip
              key={a}
              pressed={amount === a}
              onClick={() => setAmount(amount === a ? null : a)}
            >
              {a}
            </Chip>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted">거른 끼니</p>
        <div className="chip-grid flex flex-wrap gap-2" data-cols="3">
          {SKIPPABLE_MEALS.map((m) => (
            <Chip
              key={m.key}
              pressed={skipped.includes(m.key)}
              onClick={() => toggleSkip(m.key)}
            >
              {m.label}
            </Chip>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-sky px-5 text-sm font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-60 pad:w-auto pad:px-6 desk:min-h-10 desk:w-auto desk:rounded-xl"
      >
        {pending ? '저장 중…' : '저장'}
      </button>
    </div>
  );
}
