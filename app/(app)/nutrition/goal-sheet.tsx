'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Modal } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import {
  ACTIVITIES,
  GOALS,
  PROTEIN_CHOICES,
  SEXES,
  kcalText,
  litersText,
  type ActivityKey,
  type GoalKey,
  type Sex,
} from '@/lib/nutrition/meta';
import {
  computeTargets,
  type Assumed,
  type Body,
  type ProfileSettings,
} from '@/lib/nutrition/targets';
import { saveNutritionProfile } from '@/app/actions/nutrition';
import type { Origin } from './shared';

/**
 * 영양 목표 정하기.
 *
 * 고르는 즉시 아래 숫자가 바뀐다 — '증량'을 누르면 하루 칼로리가 300 오르는 것을
 * 눈으로 본다. 무엇이 무엇을 움직이는지 알아야 믿고 따른다.
 *
 * 하루 칼로리를 직접 정할 수도 있다(팀 영양사가 정해 준 숫자가 있는 선수).
 * 그래도 운동한 날에는 쓴 만큼 더해진다.
 */

const WATER_CHOICES = [
  { value: 'auto', label: '자동' },
  { value: '2000', label: '2L' },
  { value: '2500', label: '2.5L' },
  { value: '3000', label: '3L' },
  { value: '3500', label: '3.5L' },
  { value: '4000', label: '4L' },
] as const;

type WaterChoice = (typeof WATER_CHOICES)[number]['value'];

export function GoalSheet({
  open,
  origin,
  onClose,
  profile,
  body,
  assumed,
}: {
  open: boolean;
  origin: Origin;
  onClose: () => void;
  profile: ProfileSettings;
  body: Body;
  assumed: Assumed[];
}) {
  const [sex, setSex] = useState<Sex | null>(profile.sex);
  const [goal, setGoal] = useState<GoalKey>(profile.goal);
  const [activity, setActivity] = useState<ActivityKey>(profile.activity);
  const [protein, setProtein] = useState(profile.proteinPerKg);
  const [manual, setManual] = useState(profile.kcalTarget !== null);
  const [kcal, setKcal] = useState(
    profile.kcalTarget ? String(profile.kcalTarget) : ''
  );
  const [water, setWater] = useState<WaterChoice>(() => {
    const hit = WATER_CHOICES.find((w) => w.value === String(profile.waterGoalMl));
    return hit ? hit.value : 'auto';
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const kcalNum = Number(kcal);
  const kcalTarget =
    manual && kcal.trim() !== '' && Number.isFinite(kcalNum) ? kcalNum : null;
  const waterGoalMl = water === 'auto' ? null : Number(water);

  const draft: ProfileSettings = {
    sex,
    goal,
    activity,
    proteinPerKg: protein,
    kcalTarget,
    waterGoalMl,
  };
  const preview = computeTargets(draft, body, 0);
  const auto = computeTargets({ ...draft, kcalTarget: null }, body, 0);

  function save() {
    setError(null);
    if (manual && kcalTarget === null) {
      setError('하루 칼로리를 숫자로 적어 주세요.');
      return;
    }
    startTransition(async () => {
      const res = await saveNutritionProfile(draft);
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  const hint = (list: readonly { key: string; hint: string }[], key: string) =>
    list.find((x) => x.key === key)?.hint;

  const bodyLine = [
    `${Math.round(preview.weightKg * 10) / 10}kg${assumed.includes('weight') ? '(짐작)' : ''}`,
    body.heightCm ? `${body.heightCm}cm` : '키 178cm(짐작)',
    body.age ? `${body.age}세` : '20세(짐작)',
  ].join(' · ');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="영양 목표"
      description="고르면 바로 아래 숫자가 바뀌어요. 운동한 날은 쓴 만큼 더해져요."
      origin={origin}
    >
      <div className="space-y-6">
        <Row label="목표" hint={hint(GOALS, goal)}>
          <Segmented
            label="목표"
            value={goal}
            onChange={setGoal}
            options={GOALS.map((g) => ({ value: g.key, label: g.label }))}
          />
        </Row>

        <Row label="운동 말고 평소 움직임" hint={hint(ACTIVITIES, activity)}>
          <Segmented
            label="평소 움직임"
            value={activity}
            onChange={setActivity}
            options={ACTIVITIES.map((a) => ({ value: a.key, label: a.label }))}
          />
        </Row>

        <Row
          label="성별"
          hint={sex ? undefined : '고르지 않으면 남녀 식의 가운데 값으로 셈해요.'}
        >
          <Segmented
            label="성별"
            value={sex ?? ''}
            onChange={(v) => setSex(v as Sex)}
            options={SEXES.map((s) => ({ value: s.key, label: s.label }))}
          />
        </Row>

        <Row
          label="단백질 (체중 1kg 당)"
          hint="선수에게 권하는 범위는 1.6~2.2g 이에요. 감량 중이면 높게 잡으세요."
        >
          <Segmented
            label="단백질"
            value={String(protein)}
            onChange={(v) => setProtein(Number(v))}
            options={PROTEIN_CHOICES.map((p) => ({
              value: String(p),
              label: `${p.toFixed(1)}g`,
            }))}
          />
        </Row>

        <Row label="물">
          <Segmented
            label="물 목표"
            layout="flow"
            value={water}
            onChange={setWater}
            options={WATER_CHOICES}
          />
        </Row>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={manual}
              onChange={(e) => setManual(e.target.checked)}
              className="h-4 w-4 accent-sky"
            />
            하루 칼로리를 직접 정하기
          </label>
          <div
            className={`grid transition-[grid-template-rows] duration-200 ease-out ${
              manual ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="min-h-0 overflow-hidden" inert={!manual}>
              <label className="flex items-center gap-2 pt-1 text-sm text-muted">
                <input
                  inputMode="numeric"
                  value={kcal}
                  onChange={(e) => setKcal(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder={String(auto.base)}
                  className="w-28 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-right text-sm tabular-nums text-ink transition-colors focus:border-sky focus:outline-none"
                />
                kcal (운동 전) — 계산으로는 {kcalText(auto.base)}
              </label>
            </div>
          </div>
        </div>

        <section className="space-y-2 rounded-2xl bg-surface-2 p-4">
          <h3 className="text-xs font-semibold text-muted">
            이렇게 먹어요 (운동 없는 날)
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums sm:grid-cols-4">
            <Stat label="하루 칼로리" value={`${kcalText(preview.base)}kcal`} strong />
            <Stat label="단백질" value={`${preview.protein}g`} />
            <Stat label="탄수화물" value={`${preview.carbs}g`} />
            <Stat label="지방" value={`${preview.fat}g`} />
          </dl>
          <p className="text-xs leading-relaxed text-muted">
            기초대사량 {kcalText(preview.bmr)}kcal · 물 {litersText(preview.waterMl)}L
            <br />
            계산에 쓴 몸: {bodyLine}
            {assumed.some((a) => a !== 'sex') && ' — 내 정보에서 채우면 더 정확해져요.'}
          </p>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="w-full rounded-xl bg-sky py-3 text-sm font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-60"
        >
          {pending ? '저장 중…' : '저장'}
        </button>
      </div>
    </Modal>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd
        className={strong ? 'text-base font-bold text-ink' : 'font-semibold text-ink'}
      >
        {value}
      </dd>
    </div>
  );
}
