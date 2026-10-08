'use client';

import type { ReactNode } from 'react';
import { BuildingSteps } from '@/components/onboarding/building-steps';
import {
  Chips,
  MultiChips,
  OptionCards,
  type ChoiceOption,
} from '@/components/onboarding/choices';
import { MacroEditor } from '@/components/onboarding/macro-editor';
import { NumberUnitField } from '@/components/onboarding/number-unit-field';
import { MacroBar, PlanStats } from '@/components/onboarding/plan-stats';
import { TextButton } from '@/components/onboarding/step-card';
import { Segmented } from '@/components/segmented';
import { kgText, paceText } from '@/components/onboarding/format';
import { ageRule, effectiveRate, paceDelta } from '@/lib/nutrition/age';
import {
  AVOIDS,
  DIET_STYLES,
  MEAL_PATTERNS,
  SEASON_PHASES,
} from '@/lib/nutrition/diet-prefs';
import {
  ACTIVITIES,
  GOAL_KINDS,
  MACRO_PRESETS,
  kcalText,
  type GoalKind,
} from '@/lib/nutrition/meta';
import { defaultActivity, goalKindsFor } from '@/lib/nutrition/onboarding';
import {
  PERIOD_WEEKS,
  activityOf,
  paceForDate,
  periodDate,
  type NutritionAnswers,
  type NutritionStepKey,
  type OnboardingBody,
  type Preview,
} from '@/lib/nutrition/onboarding-answers';
import { dateText, neededRate } from '@/lib/nutrition/period';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG } from '@/lib/profile';
import type { WeightUnit } from '@/lib/units';

/**
 * 영양 질문 화면들(목표 카드 → 못 먹는 것 → 계획 만드는 중 → 추천 계획 → 탄단지 g) — 가입 마법사와
 * 기존 사용자 온보딩(/nutrition/setup)이 같은 화면을 쓴다. 답의 모양과 차례 · 검사는 lib/nutrition/onboarding-answers.ts.
 *
 * 화면은 상태를 들지 않는다 — 답(a)과 바꾸는 손(set)을 받아 그린다. p 는 지금 답으로 셈한 미리보기.
 */
export type StepCtx = {
  a: NutritionAnswers;
  set: (patch: Partial<NutritionAnswers>) => void;
  body: OnboardingBody;
  p: Preview;
  /** 'YYYY-MM-DD' */
  today: string;
  /** 부를 이름 — 제목에 넣는다 */
  name: string;
  invalid: (field: string) => boolean;
  /** 몸무게 단위(kg · lb) — 글 속 숫자에 */
  unit: WeightUnit;
  /** 이 화면이 지금 보이나(움직임 · 자동 넘김의 시작점) */
  active: boolean;
};

/* ─────────────────────────── 제목 ─────────────────────────── */

export function nutritionStepTitle(
  key: NutritionStepKey,
  ctx: StepCtx
): { title: string; desc?: string } {
  const { a, p, name } = ctx;
  const who = name ? `${name} 님, ` : '';
  switch (key) {
    case 'goal':
      return {
        title: `${who}몸을 어떻게 만들고 싶으세요?`,
        desc: '하루 칼로리를 더하거나 빼는 폭과 단백질을 정해요. 나중에 영양 탭에서 바꿀 수 있어요.',
      };
    case 'target':
      return {
        title: p.goal === 'gain' ? '어디까지 키울까요?' : '어디까지 뺄까요?',
        desc: p.range.ok
          ? `지금 몸으로 보면 ${kgText(p.range.min, ctx.unit)}~${kgText(p.range.max, ctx.unit)} 사이에서 정할 수 있어요. 아직이면 건너뛰어도 돼요.`
          : undefined,
      };
    case 'pace':
      return {
        title:
          a.targetWeightKg !== null
            ? `${kgText(a.targetWeightKg, ctx.unit)}까지 얼마나 빨리 갈까요?`
            : '얼마나 빨리 갈까요?',
        desc: '속도가 하루 칼로리를 정해요. 빠를수록 지방이 함께 붙거나 힘이 빠져요. 날짜를 고르면 거기에 맞는 속도를 골라 드려요.',
      };
    case 'activity':
      return {
        title: '운동과 훈련을 뺀 하루는 어때요?',
        desc: '앱에 적는 운동 · 투구는 그날 따로 더해요. 여기서는 팀 훈련처럼 앱에 안 적히는 움직임만 봐요.',
      };
    case 'season':
      return {
        title: '지금 시즌은 어느 때예요?',
        desc: '식단 짜기가 탄수화물과 회복의 비중을 바꿔요. 바뀌면 영양 탭에서 고쳐요.',
      };
    case 'macroPreset':
      return {
        title: '탄단지는 어떻게 나눌까요?',
        desc: '단백질은 체중으로 정해져 있고, 여기서 지방 몫을 고르면 탄수화물은 나머지예요.',
      };
    case 'diet':
      return {
        title: '어떤 음식을 주로, 하루 몇 번에 드세요?',
        desc: '식단 짜기가 끼니 틀을 고르는 기준이에요.',
      };
    case 'avoid':
      return {
        title: '못 먹거나 안 먹는 것이 있어요?',
        desc: '식단에서 빼고 다른 것으로 바꿔 넣어요. 없으면 그냥 다음으로.',
      };
    case 'building':
      return { title: `${who}계획을 만들고 있어요`, desc: '답한 것을 하나로 모아요.' };
    case 'plan':
      return {
        title: `${who}추천 계획이에요`,
        desc: '운동 없는 날 기준이에요. 운동 · 투구를 적으면 그만큼 더해요. 그대로 두어도, 하루 목표를 직접 정해도 돼요.',
      };
    case 'macroEdit':
      return {
        title: '탄단지 g 을 손볼까요?',
        desc: '그대로 두어도 돼요. 탄수화물을 고치면 하루 칼로리가, 단백질 · 지방을 고치면 탄수화물이 따라 바뀌어요.',
      };
  }
}

/* ─────────────────────────── 답 요약 ─────────────────────────── */

const label = <T extends { key: string; label: string }>(
  list: readonly T[],
  key: string | null
) => list.find((x) => x.key === key)?.label ?? null;

/** 답을 사람 말로 — '계획 만드는 중'의 줄과 마지막 요약 카드가 쓴다 */
export function answerLines(ctx: StepCtx): { label: string; value: string }[] {
  const { a, p, body, today } = ctx;
  const unit = ctx.unit;
  const out: { label: string; value: string }[] = [];
  if (body.weightKg !== null || body.heightCm !== null) {
    out.push({
      label: '몸',
      value: [
        body.weightKg !== null ? kgText(body.weightKg, unit) : null,
        body.heightCm !== null ? `${body.heightCm}cm` : null,
        p.age !== null ? `만 ${p.age}세` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }
  const goal = label(GOAL_KINDS, a.goalKind);
  if (goal) {
    out.push({
      label: '목표',
      value:
        a.targetWeightKg !== null
          ? `${goal} · ${kgText(a.targetWeightKg, unit)}까지`
          : goal,
    });
  }
  if (p.targets.paceKg) {
    const parts = [paceText(p.targets.paceKg, unit)];
    if (p.etaWeeks !== null) parts.push(`약 ${p.etaWeeks}주`);
    if (a.goalEndDate) parts.push(`${dateText(a.goalEndDate)}까지`);
    out.push({ label: '속도', value: parts.join(' · ') });
  }
  out.push({
    label: '평소 움직임',
    value: label(ACTIVITIES, activityOf(a, body.level)) ?? '보통',
  });
  const season = label(SEASON_PHASES, a.seasonPhase);
  if (season) out.push({ label: '시즌', value: season });
  const preset = label(MACRO_PRESETS, a.macroPreset);
  if (preset) out.push({ label: '탄단지', value: preset });
  const diet = [
    label(DIET_STYLES, a.dietStyle),
    label(MEAL_PATTERNS, a.mealPattern),
  ].filter(Boolean);
  if (diet.length > 0) out.push({ label: '식사', value: diet.join(' · ') });
  out.push({
    label: '못 먹는 것',
    value:
      a.avoid.length > 0
        ? a.avoid.map((k) => label(AVOIDS, k) ?? k).join(' · ')
        : '없음',
  });
  void today;
  return out;
}

/* ─────────────────────────── 화면 ─────────────────────────── */

export function NutritionStepPanel({
  step,
  ctx,
  onBuilt,
}: {
  step: NutritionStepKey;
  ctx: StepCtx;
  /** '계획 만드는 중'이 끝났다 — 다음 화면으로 */
  onBuilt: () => void;
}) {
  switch (step) {
    case 'goal':
      return <GoalKindStep ctx={ctx} />;
    case 'target':
      return <TargetWeightStep ctx={ctx} />;
    case 'pace':
      return <PaceStep ctx={ctx} />;
    case 'activity':
      return <ActivityStep ctx={ctx} />;
    case 'season':
      return <SeasonStep ctx={ctx} />;
    case 'macroPreset':
      return <MacroPresetStep ctx={ctx} />;
    case 'diet':
      return <DietStep ctx={ctx} />;
    case 'avoid':
      return <AvoidStep ctx={ctx} />;
    case 'building':
      return (
        <BuildingSteps
          lines={answerLines(ctx).map((l) => `${l.label} · ${l.value}`)}
          active={ctx.active}
          onDone={onBuilt}
        />
      );
    case 'plan':
      return (
        <PlanStats
          p={ctx.p}
          a={ctx.a}
          body={ctx.body}
          today={ctx.today}
          active={ctx.active}
          onChange={ctx.set}
          invalid={ctx.invalid('kcalTarget')}
        />
      );
    case 'macroEdit':
      return (
        <MacroEditor p={ctx.p} a={ctx.a} onChange={ctx.set} invalid={ctx.invalid} />
      );
  }
}

/* ── 목표 카드 — 나이마다 보이는 카드와 설명이 다르다 ── */

function goalHint(kind: GoalKind, band: 'child' | 'teen' | 'adult'): string {
  const rule = ageRule(band === 'child' ? 10 : band === 'teen' ? 15 : 20);
  const top = rule.proteinChoices[rule.proteinChoices.length - 1];
  switch (kind) {
    case 'gain':
      return band === 'child'
        ? '잘 자라게 조금 더 · 하루 +200kcal'
        : band === 'teen'
          ? '몸을 키워요 · 하루 +300kcal'
          : '몸을 키워요 · 하루 +300kcal부터';
    case 'muscle':
      return band === 'adult'
        ? '증량에 단백질 2.0g/kg · 지방보다 근육이 붙게'
        : `증량에 단백질 ${top}g/kg(성장기 최대) · 지방보다 근육이 붙게`;
    case 'maintain':
      return band === 'adult'
        ? '지금 몸으로 시즌을 버텨요'
        : '자라는 만큼 먹으며 시즌을 버텨요';
    case 'lose':
      return '천천히 빼요 · 하루 −300kcal부터';
    case 'lean':
      return '감량에 단백질 2.2g/kg · 힘은 지키고 군살만';
  }
}

function GoalKindStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, invalid } = ctx;
  const band = p.targets.ageBand;
  const options: ChoiceOption<GoalKind>[] = goalKindsFor(p.age).map((key) => ({
    value: key,
    label: GOAL_KINDS.find((g) => g.key === key)?.label ?? key,
    hint: goalHint(key, band),
  }));
  const foot =
    p.age === null
      ? '생년월일을 모르면 성인 기준으로 보여요.'
      : band === 'teen'
        ? '성장기(만 13~17세) 기준이에요. 감량 카드는 없어요 — 자라는 몸에서 빼면 키 · 뼈 · 회복이 먼저 손해를 봐요.'
        : band === 'child'
          ? '어린이(만 12세 이하) 기준이에요. 증량과 유지만 있어요.'
          : undefined;
  return (
    <OptionCards
      name="goalKind"
      label="목표"
      options={options}
      value={a.goalKind}
      onChange={(goalKind) =>
        set({
          goalKind,
          /* 목표가 바뀌면 그 목표의 체중 · 속도 · 날짜는 뜻을 잃는다 */
          ...(goalKind !== a.goalKind
            ? {
                targetWeightKg: null,
                targetSkipped: false,
                weeklyRateKg: null,
                goalEndDate: null,
              }
            : {}),
        })
      }
      columns={options.length > 3 ? 2 : 1}
      invalid={invalid('goalKind')}
      foot={foot}
    />
  );
}

/* ── 목표 체중 ── */

function TargetWeightStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, body, invalid } = ctx;
  const unit = ctx.unit;
  const kg = (n: number) => kgText(n, unit);
  const pace = (n: number) => paceText(n, unit);
  if (!p.range.ok) return null;
  const mid = Math.round(((p.range.min + p.range.max) / 2) * 10) / 10;
  const defaultPace = effectiveRate(a.weeklyRateKg, p.age, p.goal);
  const valid =
    a.targetWeightKg !== null &&
    a.targetWeightKg >= p.range.min &&
    a.targetWeightKg <= p.range.max;
  return (
    <div className="space-y-5">
      <NumberUnitField
        name="targetWeightKg"
        kind="weight"
        withHidden={false}
        label="목표 체중"
        value={a.targetWeightKg}
        onChange={(targetWeightKg) =>
          set({
            targetWeightKg,
            targetSkipped: targetWeightKg === null ? a.targetSkipped : false,
          })
        }
        min={Math.max(MIN_WEIGHT_KG, p.range.min)}
        max={Math.min(MAX_WEIGHT_KG, p.range.max)}
        placeholder={mid}
        invalid={invalid('targetWeightKg')}
        hint={
          valid && body.weightKg !== null && p.remainingKg !== null ? (
            <>
              지금 {kg(body.weightKg)} → {kg(a.targetWeightKg!)} · {kg(p.remainingKg)}{' '}
              {p.goal === 'gain' ? '더' : '덜'}
              {defaultPace && p.etaWeeks !== null
                ? ` · ${pace(defaultPace)}씩이면 약 ${p.etaWeeks}주`
                : ''}
            </>
          ) : (
            `${kg(p.range.min)}~${kg(p.range.max)} 사이로 적어 주세요.`
          )
        }
      />
      <div className="flex items-center gap-3">
        <TextButton
          onClick={() => set({ targetWeightKg: null, targetSkipped: !a.targetSkipped })}
        >
          {a.targetSkipped ? '건너뛰기로 했어요 · 되돌리기' : '나중에 정할게요'}
        </TextButton>
        {a.targetSkipped && (
          <span className="motion-safe:animate-fade-in text-xs text-muted">
            속도만으로 계획해요. 영양 탭에서 언제든 정할 수 있어요.
          </span>
        )}
      </div>
    </div>
  );
}

/* ── 속도 · 언제까지 ── */

function PaceStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, today } = ctx;
  const unit = ctx.unit;
  const kg = (n: number) => kgText(n, unit);
  const pace = (n: number) => paceText(n, unit);
  const current = effectiveRate(a.weeklyRateKg, p.age, p.goal) ?? p.paces[0] ?? null;
  const sign = p.goal === 'lose' ? '−' : '+';
  const paceOptions = p.paces.map((kgw) => ({
    value: String(kgw),
    label: pace(kgw),
    hint: `하루 ${sign}${kcalText(Math.abs(paceDelta(p.age, p.goal, kgw)))}kcal`,
  }));

  /* '언제까지' 칩 — N주 뒤 날짜. 고른 날짜가 목록 밖이면(기존 사용자) 그 날짜 칩을 하나 더 */
  const periodChips: ChoiceOption<string>[] = [
    { value: 'none', label: '기간 없이' },
    ...PERIOD_WEEKS.map((w) => {
      const d = periodDate(today, w);
      return { value: d, label: `${w}주 · ${dateText(d)}` };
    }),
  ];
  if (a.goalEndDate && !periodChips.some((c) => c.value === a.goalEndDate)) {
    periodChips.push({ value: a.goalEndDate, label: dateText(a.goalEndDate) });
  }
  const needed = a.goalEndDate ? neededRate(p.remainingKg, today, a.goalEndDate) : null;
  const fastest = p.paces[p.paces.length - 1] ?? null;
  const tooFast = needed !== null && fastest !== null && needed > fastest + 0.005;

  return (
    <div className="space-y-6">
      {paceOptions.length > 1 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted">일주일에</p>
          <Segmented
            label="일주일 속도"
            value={String(current ?? '')}
            onChange={(v) => set({ weeklyRateKg: Number(v) })}
            options={paceOptions}
            size="md"
            itemClassName="py-2.5 flex-col gap-0 !items-center"
          />
          <p className="mt-2 text-xs leading-relaxed break-keep text-muted">
            {paceOptions.map((o) => `${o.label} = ${o.hint}`).join(' · ')}
          </p>
        </div>
      ) : (
        current !== null && (
          <p className="rounded-2xl border border-line bg-surface-2/60 px-4 py-3 text-sm leading-relaxed break-keep text-ink">
            {p.targets.ageBand === 'teen' ? '성장기라 ' : ''}
            {pace(current)} 한 가지예요 — 하루 {sign}
            {kcalText(Math.abs(paceDelta(p.age, p.goal, current)))}kcal. 자라는 몸에
            맞춘 속도예요.
          </p>
        )
      )}

      {p.etaWeeks !== null && a.targetWeightKg !== null && (
        <p className="text-[15px] leading-relaxed break-keep text-ink">
          계획대로면 약{' '}
          <strong className="text-heading text-xl text-sky-strong">
            {p.etaWeeks}주
          </strong>
          , {dateText(periodDate(today, p.etaWeeks))}쯤 {kg(a.targetWeightKg)}이에요.
        </p>
      )}

      <Chips
        name="goalEndDate"
        legend="언제까지"
        options={periodChips}
        value={a.goalEndDate ?? 'none'}
        onChange={(v) => {
          if (v === 'none') return set({ goalEndDate: null });
          const pace = paceForDate(p, today, v);
          set({ goalEndDate: v, ...(pace !== null ? { weeklyRateKg: pace } : {}) });
        }}
        hint={
          a.goalEndDate && needed !== null
            ? tooFast
              ? `${dateText(a.goalEndDate)}까지는 ${paceText(needed, unit)}이 필요해요 — 몸에 무리라 가장 빠른 속도(${pace(fastest!)})로 두었어요.${p.etaWeeks !== null ? ` 그러면 약 ${p.etaWeeks}주예요.` : ''}`
              : `${dateText(a.goalEndDate)}까지 ${pace(current ?? 0)}이면 닿아요. 식단 짜기도 이 날짜를 봐요.`
            : '날짜를 고르면 거기에 맞는 속도를 골라 드려요. 없으면 속도만으로 가요.'
        }
      />
    </div>
  );
}

/* ── 평소 움직임 ── */

function ActivityStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, body, invalid } = ctx;
  const guess = defaultActivity(body.level);
  return (
    <OptionCards
      name="activity"
      label="평소 움직임"
      options={ACTIVITIES.map((x) => ({
        value: x.key,
        label: x.label,
        hint: `${x.hint} · 기초대사량 × ${x.factor}`,
        badge:
          a.activity === null && x.key === guess ? '소속으로 미리 골랐어요' : undefined,
      }))}
      value={activityOf(a, body.level)}
      onChange={(activity) => set({ activity })}
      columns={1}
      invalid={invalid('activity')}
    />
  );
}

/* ── 시즌 ── */

function SeasonStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, invalid } = ctx;
  return (
    <OptionCards
      name="seasonPhase"
      label="시즌"
      options={SEASON_PHASES.map((s) => ({
        value: s.key,
        label: s.label,
        hint: s.hint,
      }))}
      value={a.seasonPhase}
      onChange={(seasonPhase) => set({ seasonPhase })}
      columns={2}
      invalid={invalid('seasonPhase')}
    />
  );
}

/* ── 탄단지 프리셋 ── */

function MacroPresetStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, invalid } = ctx;
  const t = p.targets;
  return (
    <div className="space-y-5">
      <OptionCards
        name="macroPreset"
        label="탄단지 나누기"
        options={MACRO_PRESETS.map((m) => ({
          value: m.key,
          label: m.label,
          hint: m.hint,
        }))}
        value={a.macroPreset}
        onChange={(macroPreset) => set({ macroPreset })}
        columns={1}
        invalid={invalid('macroPreset')}
      />
      <div className="rounded-2xl border border-line bg-surface-2/60 p-3">
        <p className="mb-2 text-xs font-medium text-muted">
          이렇게 나눠요 · 하루 {kcalText(t.base)}kcal(운동 없는 날)
        </p>
        <MacroBar carbs={t.carbs} protein={t.protein} fat={t.fat} compact />
      </div>
    </div>
  );
}

/* ── 음식 스타일 · 끼니 ── */

function DietStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, invalid } = ctx;
  const style = DIET_STYLES.find((d) => d.key === a.dietStyle);
  return (
    <div className="space-y-6">
      <Chips
        name="dietStyle"
        legend="주로 먹는 음식"
        options={DIET_STYLES.map((d) => ({
          value: d.key,
          label: d.label,
          hint: d.hint,
        }))}
        value={a.dietStyle}
        onChange={(dietStyle) => set({ dietStyle })}
        invalid={invalid('dietStyle')}
        hint={style ? style.hint : '식단 짜기가 어떤 끼니 틀을 먼저 고를지 정해요.'}
      />
      <Chips
        name="mealPattern"
        legend="하루 몇 번에"
        options={MEAL_PATTERNS.map((m) => ({ value: m.key, label: m.label }))}
        value={a.mealPattern}
        onChange={(mealPattern) => set({ mealPattern })}
        invalid={invalid('mealPattern')}
        hint="훈련 · 경기 날엔 던지기 전후 간식을 더 넣어요."
      />
    </div>
  );
}

/* ── 못 먹는 것 · 보충식품 ── */

function AvoidStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p } = ctx;
  const adult = p.targets.ageBand === 'adult' && p.age !== null;
  return (
    <div className="space-y-6">
      <MultiChips
        name="avoid"
        label="못 먹거나 안 먹는 것"
        options={AVOIDS.map((x) => ({ value: x.key, label: x.label }))}
        values={a.avoid}
        onToggle={(key, on) =>
          set({ avoid: on ? [...a.avoid, key] : a.avoid.filter((k) => k !== key) })
        }
        hint={
          a.avoid.length === 0
            ? '없으면 그냥 다음으로. 비건이면 고기 · 해산물 · 유제품 · 달걀을 다 고르면 돼요.'
            : `${a.avoid.length}가지를 식단에서 빼요.`
        }
      />
      {adult ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl text-sm text-ink">
          <input
            type="checkbox"
            checked={a.supplements}
            data-sync={a.supplements ? 'on' : 'off'}
            onChange={(e) => set({ supplements: e.target.checked })}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-sky"
          />
          <span className="leading-relaxed break-keep">
            단백질 쉐이크 · 바도 식단에 넣어도 돼요
            <span className="block text-xs text-muted">
              바쁜 날 단백질을 채우는 데 써요. 끄면 음식으로만 짜요.
            </span>
          </span>
        </label>
      ) : (
        <p className="text-xs leading-relaxed break-keep text-muted">
          성장기는 보충식품 없이 음식으로 채워요 — 식단에 쉐이크 · 바는 넣지 않아요.
        </p>
      )}
    </div>
  );
}

/** 카드 밑 글 등 — 바깥에서 쓸 수 있게 */
export type { ReactNode };
