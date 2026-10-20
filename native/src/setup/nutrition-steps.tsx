import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { effectiveRate, paceDelta, ageRule } from '@/lib/nutrition/age';
import { AVOIDS, DIET_STYLES, MEAL_PATTERNS } from '@/lib/nutrition/diet-prefs';
import { ACTIVITIES, FAT_G_MAX, FAT_G_MIN, GOAL_KINDS, MACRO_PRESETS, PROTEIN_G_MAX, PROTEIN_G_MIN, kcalText, type GoalKind } from '@/lib/nutrition/meta';
import { defaultActivity, goalKindHint, goalKindsFor, kcalOfMacros, macroSplit } from '@/lib/nutrition/onboarding';
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
import { fromLength, fromWeight, round1, toLength, toWeight, type LengthUnit, type WeightUnit } from '@/lib/units';
import { floorNote } from '@/lib/nutrition/targets';
import { TYPE, type Palette } from '~/lib/ui';
import { ChoiceChips } from '~/setup/frame';
import { WeightForecast } from '~/shell/weight-forecast';

/**
 * 영양 질문 화면들(앱) — 웹 components/onboarding/nutrition-steps.tsx · plan-stats.tsx · macro-editor.tsx · building-steps.tsx 를 옮겼다.
 * 답의 모양 · 차례 · 검사 · 미리보기는 웹과 같은 순수 함수(lib/nutrition/onboarding-answers.ts). 화면은 상태를 들지 않는다.
 */
export type StepCtx = {
  a: NutritionAnswers;
  set: (patch: Partial<NutritionAnswers>) => void;
  body: OnboardingBody;
  p: Preview;
  today: string;
  name: string;
  invalid: (field: string) => boolean;
  unit: WeightUnit;
  c: Palette;
};

export const kgText = (kg: number, unit: WeightUnit) => `${round1(toWeight(kg, unit))}${unit}`;
export const paceText = (kgPerWeek: number, unit: WeightUnit) =>
  `주 ${unit === 'kg' ? Number(kgPerWeek.toFixed(2)) : round1(toWeight(kgPerWeek, unit))}${unit}`;
const labelOf = <T extends { key: string; label: string }>(list: readonly T[], key: string | null) => list.find((x) => x.key === key)?.label ?? null;

export function nutritionStepTitle(key: NutritionStepKey, ctx: StepCtx): { title: string; desc?: string } {
  const { a, p, name, unit } = ctx;
  const who = name ? `${name} 님, ` : '';
  switch (key) {
    case 'goal':
      return { title: `${who}몸을 어떻게 만들고 싶으세요?`, desc: '하루 칼로리를 더하거나 빼는 폭과 단백질을 정해요. 나중에 영양 탭에서 바꿀 수 있어요.' };
    case 'target':
      return {
        title: p.goal === 'gain' ? '어디까지 키울까요?' : '어디까지 뺄까요?',
        desc: p.range.ok ? `지금 몸으로 보면 ${kgText(p.range.min, unit)}~${kgText(p.range.max, unit)} 사이에서 정할 수 있어요. 아직이면 건너뛰어도 돼요.` : undefined,
      };
    case 'pace':
      return {
        title: a.targetWeightKg !== null ? `${kgText(a.targetWeightKg, unit)}까지 얼마나 빨리 갈까요?` : '얼마나 빨리 갈까요?',
        desc: '속도가 하루 칼로리를 정해요. 빠를수록 지방이 함께 붙거나 힘이 빠져요. 날짜를 고르면 거기에 맞는 속도를 골라 드려요.',
      };
    case 'activity':
      return { title: '운동과 훈련을 뺀 하루는 어때요?', desc: '앱에 적는 운동 · 투구는 그날 따로 더해요. 여기서는 평소 운동 · 일상처럼 앱에 안 적히는 움직임만 봐요.' };
    case 'macroPreset':
      return { title: '탄단지는 어떻게 나눌까요?', desc: '단백질은 체중으로 정해져 있고, 여기서 지방 몫을 고르면 탄수화물은 나머지예요.' };
    case 'diet':
      return { title: '어떤 음식을 주로, 하루 몇 번에 드세요?', desc: '식단 짜기가 끼니 틀을 고르는 기준이에요.' };
    case 'avoid':
      return { title: '못 먹거나 안 먹는 것이 있어요?', desc: '식단에서 빼고 다른 것으로 바꿔 넣어요. 없으면 그냥 다음으로.' };
    case 'building':
      return { title: `${who}계획을 만들고 있어요`, desc: '답한 것을 하나로 모아요.' };
    case 'plan':
      return { title: `${who}추천 계획이에요`, desc: '운동 없는 날 기준이에요. 운동 · 투구를 적으면 그만큼 더해요. 그대로 두어도, 하루 목표를 직접 정해도 돼요.' };
    case 'macroEdit':
      return { title: '탄단지 g 을 손볼까요?', desc: '그대로 두어도 돼요. 탄수화물을 고치면 하루 칼로리가, 단백질 · 지방을 고치면 탄수화물이 따라 바뀌어요.' };
  }
}

/** 답을 사람 말로 — '계획 만드는 중'의 줄과 마지막 요약(웹 answerLines 와 같다) */
export function answerLines(ctx: StepCtx): { label: string; value: string }[] {
  const { a, p, body, unit } = ctx;
  const out: { label: string; value: string }[] = [];
  if (body.weightKg !== null || body.heightCm !== null) {
    out.push({
      label: '몸',
      value: [body.weightKg !== null ? kgText(body.weightKg, unit) : null, body.heightCm !== null ? `${body.heightCm}cm` : null, p.age !== null ? `만 ${p.age}세` : null]
        .filter(Boolean)
        .join(' · '),
    });
  }
  const goal = labelOf(GOAL_KINDS, a.goalKind);
  if (goal) out.push({ label: '목표', value: a.targetWeightKg !== null ? `${goal} · ${kgText(a.targetWeightKg, unit)}까지` : goal });
  if (p.targets.paceKg) {
    const parts = [paceText(p.targets.paceKg, unit)];
    if (p.etaWeeks !== null) parts.push(`약 ${p.etaWeeks}주`);
    if (a.goalEndDate) parts.push(`${dateText(a.goalEndDate)}까지`);
    out.push({ label: '속도', value: parts.join(' · ') });
  }
  out.push({ label: '평소 움직임', value: labelOf(ACTIVITIES, activityOf(a, body.level)) ?? '보통' });
  const preset = labelOf(MACRO_PRESETS, a.macroPreset);
  if (preset) out.push({ label: '탄단지', value: preset });
  const diet = [labelOf(DIET_STYLES, a.dietStyle), labelOf(MEAL_PATTERNS, a.mealPattern)].filter(Boolean);
  if (diet.length > 0) out.push({ label: '식사', value: diet.join(' · ') });
  out.push({ label: '못 먹는 것', value: a.avoid.length > 0 ? a.avoid.map((k) => labelOf(AVOIDS, k) ?? k).join(' · ') : '없음' });
  return out;
}

export function NutritionStepPanel({ step, ctx, onBuilt }: { step: NutritionStepKey; ctx: StepCtx; onBuilt: () => void }) {
  switch (step) {
    case 'goal':
      return <GoalStep ctx={ctx} />;
    case 'target':
      return <TargetStep ctx={ctx} />;
    case 'pace':
      return <PaceStep ctx={ctx} />;
    case 'activity':
      return <ActivityStep ctx={ctx} />;
    case 'macroPreset':
      return <MacroPresetStep ctx={ctx} />;
    case 'diet':
      return <DietStep ctx={ctx} />;
    case 'avoid':
      return <AvoidStep ctx={ctx} />;
    case 'building':
      return <Building lines={answerLines(ctx).map((l) => `${l.label} · ${l.value}`)} onDone={onBuilt} c={ctx.c} />;
    case 'plan':
      return <PlanStep ctx={ctx} />;
    case 'macroEdit':
      return <MacroEditStep ctx={ctx} />;
  }
}

/* ── 고르기 카드(설명 붙음) ── */
export function OptionCards<T extends string>({
  options,
  value,
  onChange,
  invalid,
  foot,
  c,
}: {
  options: { value: T; label: string; hint?: string; badge?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  invalid?: boolean;
  foot?: string;
  c: Palette;
}) {
  return (
    <View style={{ gap: 10 }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(o.value);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderRadius: 16,
              borderWidth: on ? 2 : 1,
              borderColor: on ? c.sky : invalid ? c.danger : c.line,
              backgroundColor: c.card,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>{o.label}</Text>
              {o.hint ? <Text style={{ color: c.muted, fontSize: 15, lineHeight: 20 }}>{o.hint}</Text> : null}
              {o.badge ? <Text style={{ color: c.sky, fontSize: 13, fontWeight: '600' }}>{o.badge}</Text> : null}
            </View>
            {on ? <SymbolView name="checkmark.circle.fill" size={22} tintColor={c.sky} /> : null}
          </Pressable>
        );
      })}
      {foot ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{foot}</Text> : null}
    </View>
  );
}

function GoalStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, invalid, c } = ctx;
  const band = p.targets.ageBand;
  const foot =
    p.age === null
      ? '생년월일을 모르면 성인 기준으로 보여요.'
      : band === 'teen'
        ? '성장기(만 13~17세) 기준이에요. 감량 카드는 없어요. 자라는 몸에서 빼면 키 · 뼈 · 회복이 먼저 손해를 봐요.'
        : band === 'child'
          ? '어린이(만 12세 이하) 기준이에요. 증량과 유지만 있어요.'
          : undefined;
  return (
    <OptionCards<GoalKind>
      options={goalKindsFor(p.age).map((key) => ({ value: key, label: GOAL_KINDS.find((g) => g.key === key)?.label ?? key, hint: goalKindHint(key, p.age) }))}
      value={a.goalKind}
      onChange={(goalKind) =>
        set({
          goalKind,
          /* 목표가 바뀌면 그 목표의 체중 · 속도 · 날짜는 뜻을 잃는다 */
          ...(goalKind !== a.goalKind ? { targetWeightKg: null, targetSkipped: false, weeklyRateKg: null, goalEndDate: null } : {}),
        })
      }
      invalid={invalid('goalKind')}
      foot={foot}
      c={c}
    />
  );
}

/** 숫자 칸 — 보이는 단위로 적고 저장은 kg(웹 NumberUnitField 와 같은 규칙) */
export function NumberField({
  value,
  onChange,
  unit,
  kind,
  placeholder,
  invalid,
  hint,
  c,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  /** 보이는 단위 — 값(value · onChange)은 늘 kg · cm */
  unit: WeightUnit | LengthUnit;
  kind: 'weight' | 'length';
  placeholder: number;
  invalid?: boolean;
  hint?: string;
  c: Palette;
}) {
  const shown = (v: number | null) =>
    v === null ? '' : String(kind === 'weight' ? round1(toWeight(v, unit as WeightUnit)) : round1(toLength(v, unit as LengthUnit)));
  const [text, setText] = useState(() => shown(value));
  /*
   * 값이 밖에서 바뀌면(목표 체중 '나중에 정할게요' → '되돌리기') 칸 글도 따라간다 — 적는 중에는 안 건드린다. 웹은 useSyncedText 가 같은 일을 한다
   * (2026-10-18 점검: 칸에는 숫자가 보이는데 값은 비어 '적어 주세요'가 떴다).
   */
  const focused = useRef(false);
  const synced = shown(value);
  useEffect(() => {
    if (!focused.current) setText(synced);
  }, [synced]);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: invalid ? c.danger : c.line, paddingHorizontal: 16 }}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            const n = Number(t.trim().replace(',', '.'));
            if (t.trim() === '' || !Number.isFinite(n)) return onChange(null);
            onChange(kind === 'weight' ? Math.round(fromWeight(n, unit as WeightUnit) * 10) / 10 : Math.round(fromLength(n, unit as LengthUnit)));
          }}
          onFocus={() => (focused.current = true)}
          onBlur={() => (focused.current = false)}
          keyboardType="decimal-pad"
          placeholder={String(placeholder)}
          placeholderTextColor={c.muted}
          style={{ flex: 1, color: c.ink, fontSize: 28, fontWeight: '600', paddingVertical: 12, fontVariant: ['tabular-nums'] }}
        />
        <Text style={{ color: c.muted, fontSize: 17 }}>{unit}</Text>
      </View>
      {hint ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text> : null}
    </View>
  );
}

function TargetStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, body, invalid, unit, c } = ctx;
  if (!p.range.ok) return null;
  const mid = Math.round(((p.range.min + p.range.max) / 2) * 10) / 10;
  const pace = effectiveRate(a.weeklyRateKg, p.age, p.goal);
  const valid = a.targetWeightKg !== null && a.targetWeightKg >= p.range.min && a.targetWeightKg <= p.range.max;
  return (
    <View style={{ gap: 16 }}>
      <NumberField
        value={a.targetWeightKg}
        onChange={(targetWeightKg) => set({ targetWeightKg, targetSkipped: targetWeightKg === null ? a.targetSkipped : false })}
        unit={unit}
        kind="weight"
        placeholder={round1(toWeight(Math.min(MAX_WEIGHT_KG, Math.max(MIN_WEIGHT_KG, mid)), unit))}
        invalid={invalid('targetWeightKg')}
        hint={
          valid && body.weightKg !== null && p.remainingKg !== null
            ? `지금 ${kgText(body.weightKg, unit)} → ${kgText(a.targetWeightKg!, unit)} · ${kgText(p.remainingKg, unit)} ${p.goal === 'gain' ? '더' : '덜'}${pace && p.etaWeeks !== null ? ` · ${paceText(pace, unit)}씩이면 약 ${p.etaWeeks}주` : ''}`
            : `${kgText(p.range.min, unit)}~${kgText(p.range.max, unit)} 사이로 적어 주세요.`
        }
        c={c}
      />
      <Pressable accessibilityRole="button" onPress={() => set({ targetWeightKg: null, targetSkipped: !a.targetSkipped })} hitSlop={8} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>{a.targetSkipped ? '건너뛰기로 했어요 · 되돌리기' : '나중에 정할게요'}</Text>
      </Pressable>
      {a.targetSkipped ? <Text style={{ color: c.muted, fontSize: 13 }}>속도만으로 계획해요. 영양 탭에서 정할 수 있어요.</Text> : null}
    </View>
  );
}

function PaceStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, today, unit, c } = ctx;
  const current = effectiveRate(a.weeklyRateKg, p.age, p.goal) ?? p.paces[0] ?? null;
  const sign = p.goal === 'lose' ? '−' : '+';
  const periods = [
    { value: 'none', label: '기간 없이' },
    ...PERIOD_WEEKS.map((w) => {
      const d = periodDate(today, w);
      return { value: d, label: `${w}주 · ${dateText(d)}` };
    }),
  ];
  if (a.goalEndDate && !periods.some((x) => x.value === a.goalEndDate)) periods.push({ value: a.goalEndDate, label: dateText(a.goalEndDate) });
  const needed = a.goalEndDate ? neededRate(p.remainingKg, today, a.goalEndDate) : null;
  const fastest = p.paces[p.paces.length - 1] ?? null;
  const tooFast = needed !== null && fastest !== null && needed > fastest + 0.005;
  return (
    <View style={{ gap: 20 }}>
      {p.paces.length > 1 ? (
        <OptionCards
          options={p.paces.map((kgw) => ({ value: String(kgw), label: `일주일에 ${paceText(kgw, unit).replace('주 ', '')}`, hint: `하루 ${sign}${kcalText(Math.abs(paceDelta(p.age, p.goal, kgw)))}kcal` }))}
          value={current === null ? null : String(current)}
          onChange={(v) => set({ weeklyRateKg: Number(v) })}
          c={c}
        />
      ) : current !== null ? (
        <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22, backgroundColor: c.card, borderRadius: 14, padding: 14, overflow: 'hidden' }}>
          {p.targets.ageBand === 'teen' ? '성장기라 ' : ''}
          {paceText(current, unit)} 한 가지예요. 하루 {sign}
          {kcalText(Math.abs(paceDelta(p.age, p.goal, current)))}kcal 로, 자라는 몸에 맞춘 속도예요.
        </Text>
      ) : null}
      {p.etaWeeks !== null && a.targetWeightKg !== null ? (
        <Text style={{ color: c.ink, fontSize: 17, lineHeight: 23 }}>
          계획대로면 약 <Text style={{ color: c.sky, fontWeight: '700' }}>{p.etaWeeks}주</Text>, {dateText(periodDate(today, p.etaWeeks))}쯤 {kgText(a.targetWeightKg, unit)}이에요.
        </Text>
      ) : null}
      <ChoiceChips
        legend="언제까지"
        options={periods}
        value={a.goalEndDate ?? 'none'}
        onChange={(v) => {
          if (v === 'none') return set({ goalEndDate: null });
          const pace = paceForDate(p, today, v);
          set({ goalEndDate: v, ...(pace !== null ? { weeklyRateKg: pace } : {}) });
        }}
        hint={
          a.goalEndDate && needed !== null
            ? tooFast
              ? `${dateText(a.goalEndDate)}까지는 ${paceText(needed, unit)}이 필요해요. 몸에 무리라 가장 빠른 속도(${paceText(fastest!, unit)})로 두었어요.${p.etaWeeks !== null ? ` 그러면 약 ${p.etaWeeks}주예요.` : ''}`
              : `${dateText(a.goalEndDate)}까지 ${paceText(current ?? 0, unit)}이면 닿아요. 식단 짜기도 이 날짜를 봐요.`
            : '날짜를 고르면 거기에 맞는 속도를 골라 드려요. 없으면 속도만으로 가요.'
        }
        c={c}
      />
    </View>
  );
}

function ActivityStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, body, invalid, c } = ctx;
  const guess = defaultActivity(body.level);
  return (
    <OptionCards
      options={ACTIVITIES.map((x) => ({
        value: x.key,
        label: x.label,
        hint: `${x.hint} · 기초대사량 × ${x.factor}`,
        badge: a.activity === null && x.key === guess ? '소속으로 미리 골랐어요' : undefined,
      }))}
      value={activityOf(a, body.level)}
      onChange={(activity) => set({ activity })}
      invalid={invalid('activity')}
      c={c}
    />
  );
}

function MacroPresetStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, invalid, c } = ctx;
  const t = p.targets;
  return (
    <View style={{ gap: 16 }}>
      <OptionCards
        options={MACRO_PRESETS.map((m) => ({ value: m.key, label: m.label, hint: m.hint }))}
        value={a.macroPreset}
        onChange={(macroPreset) => set({ macroPreset })}
        invalid={invalid('macroPreset')}
        c={c}
      />
      <View style={{ backgroundColor: c.card, boxShadow: c.float, borderRadius: 16, padding: 14, gap: 8 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>이렇게 나눠요 · 하루 {kcalText(t.base)}kcal(운동 없는 날)</Text>
        <MacroBar carbs={t.carbs} protein={t.protein} fat={t.fat} c={c} />
      </View>
    </View>
  );
}

function DietStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, invalid, c } = ctx;
  const style = DIET_STYLES.find((d) => d.key === a.dietStyle);
  return (
    <View style={{ gap: 20 }}>
      <ChoiceChips
        legend="주로 먹는 음식"
        options={DIET_STYLES.map((d) => ({ value: d.key, label: d.label }))}
        value={a.dietStyle}
        onChange={(v) => set({ dietStyle: v as NutritionAnswers['dietStyle'] })}
        invalid={invalid('dietStyle')}
        hint={style ? style.hint : '식단 짜기가 어떤 끼니 틀을 먼저 고를지 정해요.'}
        c={c}
      />
      <ChoiceChips
        legend="하루 몇 번에"
        options={MEAL_PATTERNS.map((m) => ({ value: m.key, label: m.label }))}
        value={a.mealPattern}
        onChange={(v) => set({ mealPattern: v as NutritionAnswers['mealPattern'] })}
        invalid={invalid('mealPattern')}
        hint="훈련 · 경기 날엔 던지기 전후 간식을 더 넣어요."
        c={c}
      />
    </View>
  );
}

function AvoidStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, c } = ctx;
  const adult = p.targets.ageBand === 'adult' && p.age !== null;
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {AVOIDS.map((x) => {
            const on = a.avoid.includes(x.key);
            return (
              <Pressable
                key={x.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  void Haptics.selectionAsync();
                  set({ avoid: on ? a.avoid.filter((k) => k !== x.key) : [...a.avoid, x.key] });
                }}
                style={{ minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: on ? c.sky : c.line, backgroundColor: on ? c.sky : c.card, paddingHorizontal: 16, justifyContent: 'center' }}
              >
                <Text style={{ color: on ? '#fff' : c.ink, fontSize: 17, fontWeight: '600' }}>{x.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
          {a.avoid.length === 0 ? '없으면 그냥 다음으로. 비건이면 고기 · 해산물 · 유제품 · 달걀을 다 고르면 돼요.' : `${a.avoid.length}가지를 식단에서 빼요.`}
        </Text>
      </View>
      {adult ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 14, padding: 14 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>단백질 쉐이크 · 바도 식단에 넣어도 돼요</Text>
            <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>바쁜 날 단백질을 채우는 데 써요. 끄면 음식으로만 짜요.</Text>
          </View>
          <Switch value={a.supplements} onValueChange={(supplements) => set({ supplements })} />
        </View>
      ) : (
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>성장기는 보충식품 없이 음식으로 채워요. 식단에 쉐이크 · 바는 넣지 않아요.</Text>
      )}
    </View>
  );
}

/** '계획 만드는 중' — 답 줄이 하나씩 떠오르고 잠시 뒤 다음 화면으로(웹 BuildingSteps 와 같은 간격) */
const LINE_MS = 280;
function Building({ lines, onDone, c }: { lines: string[]; onDone: () => void; c: Palette }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown < lines.length) {
      const t = setTimeout(() => setShown((n) => n + 1), LINE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(onDone, 700);
    return () => clearTimeout(t);
  }, [shown, lines.length, onDone]);
  return (
    <View style={{ gap: 12 }}>
      {lines.slice(0, shown).map((l) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.sky, alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView name="checkmark" size={12} weight="bold" tintColor="#fff" />
          </View>
          <Text style={{ color: c.ink, fontSize: 17, flex: 1 }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

/** 탄 · 단 · 지 한 줄 막대 + g(웹 MacroBar 와 같은 비율 함수) */
export function MacroBar({ carbs, protein, fat, c }: { carbs: number; protein: number; fat: number; c: Palette }) {
  const s = macroSplit(carbs, protein, fat);
  const cells = [
    { key: 'c', label: '탄수화물', g: carbs, pct: s.c, color: c.sky },
    { key: 'p', label: '단백질', g: protein, pct: s.p, color: c.ink + 'b3' },
    { key: 'f', label: '지방', g: fat, pct: s.f, color: c.warn },
  ];
  return (
    <View style={{ gap: 8 }}>
      <View accessibilityLabel={`탄수화물 ${s.c}% · 단백질 ${s.p}% · 지방 ${s.f}%`} style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: c.chip }}>
        {cells.map((x) => (
          <View key={x.key} style={{ width: `${x.pct}%`, backgroundColor: x.color }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {cells.map((x) => (
          <View key={x.key} style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: x.color, marginTop: 5 }} />
            <View>
              <Text style={{ color: c.muted, fontSize: 13 }}>{x.label}</Text>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                {Math.round(x.g)}g <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>{x.pct}%</Text>
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Stat({ label, value, sub, strong, c }: { label: string; value: number; sub: string; strong?: boolean; c: Palette }) {
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: 16, borderWidth: 1, borderColor: strong ? c.sky + '66' : c.line, backgroundColor: strong ? c.sky + '1a' : c.card, padding: 10, gap: 4 }}>
      <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>
        {label}
      </Text>
      <Text style={{ color: strong ? c.sky : c.ink, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {kcalText(value)}
        <Text style={[TYPE.unit, { color: c.muted }]}> kcal</Text>
      </Text>
      <Text numberOfLines={1} style={{ color: c.muted, fontSize: 11 }}>
        {sub}
      </Text>
    </View>
  );
}

/** 추천 계획 — 세 숫자 · 하루 목표 직접 정하기 · 탄단지 · 예상 체중 선 · 계산에 쓴 몸(웹 PlanStats 와 같은 숫자) */
function PlanStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, body, today, unit, invalid, c } = ctx;
  const t = p.targets;
  const rule = ageRule(p.age);
  const activity = ACTIVITIES.find((x) => x.key === p.draft.activity) ?? ACTIVITIES[1];
  const sign = t.delta > 0 ? '+' : t.delta < 0 ? '−' : '';
  const [open, setOpen] = useState(a.kcalTarget !== null);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat label="기초대사량" value={t.bmr} sub="가만히 있어도" c={c} />
        <Stat label="활동대사량" value={t.tdee} sub={`× ${activity.factor} ${activity.label}`} c={c} />
        <Stat label="하루 목표" value={t.base} sub={t.manual ? '직접 정함' : t.delta === 0 ? '유지' : `${sign}${kcalText(Math.abs(t.delta))} 목표`} strong c={c} />
      </View>
      {floorNote(t) ? <Text style={{ color: c.muted, fontSize: 13 }}>{floorNote(t)}</Text> : null}
      {open ? (
        <View style={{ backgroundColor: c.card, boxShadow: c.float, borderRadius: 16, padding: 14, gap: 8 }}>
          <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>하루 목표(운동 전)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: invalid('kcalTarget') ? c.danger : c.line, paddingHorizontal: 12 }}>
              <TextInput
                defaultValue={a.kcalTarget === null ? '' : String(a.kcalTarget)}
                onChangeText={(v) => {
                  const n = Number(v.trim());
                  set({ kcalTarget: v.trim() === '' || !Number.isFinite(n) ? null : Math.round(n) });
                }}
                keyboardType="number-pad"
                placeholder={String(p.auto.base)}
                placeholderTextColor={c.muted}
                style={{ flex: 1, color: c.ink, fontSize: 20, fontWeight: '600', paddingVertical: 10 }}
              />
              <Text style={{ color: c.muted }}>kcal</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="계산값으로 되돌리기"
              onPress={() => {
                set({ kcalTarget: null });
                setOpen(false);
              }}
              hitSlop={6}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
            >
              <Text style={{ color: c.muted, fontSize: 15, fontWeight: '400' }}>계산으로</Text>
            </Pressable>
          </View>
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
            계산으로는 {kcalText(p.auto.base)}kcal{a.kcalTarget !== null ? ' · 직접 정하면 체중 흐름을 보고 권하는 조정은 쉬어요.' : '. 1,000~6,000 사이로.'}
          </Text>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} hitSlop={6} style={{ alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SymbolView name="pencil" size={14} tintColor={c.sky} />
          <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>하루 목표를 직접 정하기</Text>
        </Pressable>
      )}
      <View style={{ gap: 8 }}>
        <MacroBar carbs={t.carbs} protein={t.protein} fat={t.fat} c={c} />
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
          단백질은 체중 1kg 당 {t.proteinPerKg}g · 지방은 {Math.round(t.fatShare * 100)}% · 탄수화물은 나머지. 운동 · 투구를 적은 날은 쓴 만큼 더해요.
        </Text>
      </View>
      {p.etaWeeks !== null && a.targetWeightKg !== null ? (
        <View style={{ backgroundColor: c.card, boxShadow: c.float, borderRadius: 14, padding: 12, gap: 4 }}>
          {p.forecast.length > 1 ? <WeightForecast points={p.forecast} c={c} /> : null}
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
            계획대로면 약 <Text style={{ color: c.ink, fontWeight: '600' }}>{p.etaWeeks}주</Text>, {dateText(periodDate(today, p.etaWeeks))}쯤 {kgText(a.targetWeightKg, unit)}
            {p.targets.paceKg ? ` · ${paceText(p.targets.paceKg, unit)}씩` : ''}
          </Text>
        </View>
      ) : null}
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 17 }}>
        계산에 쓴 몸: {body.weightKg !== null ? kgText(body.weightKg, unit) : `${kgText(t.weightKg, unit)}(짐작)`}
        {body.heightCm !== null ? ` · ${body.heightCm}cm` : ' · 178cm(짐작)'}
        {p.age !== null ? ` · 만 ${p.age}세` : ' · 20세(짐작)'}
        {body.sex ? (body.sex === 'M' ? ' · 남' : ' · 여') : ' · 성별 모름'} · {rule.bmrName}
      </Text>
    </View>
  );
}

/** 탄단지 g 고치기 — 주인은 kcal(웹 MacroEditor 와 같다): 탄수화물 → kcalTarget, 단백질 → proteinTargetG, 지방 → fatTargetG */
function MacroEditStep({ ctx }: { ctx: StepCtx }) {
  const { a, set, p, invalid, c } = ctx;
  const t = p.targets;
  return (
    <View style={{ gap: 16 }}>
      <View style={{ backgroundColor: c.card, boxShadow: c.float, borderRadius: 16, padding: 14, gap: 8 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>
          하루 <Text style={{ color: c.ink, fontWeight: '700' }}>{kcalText(t.base)}kcal</Text>
          {t.manual ? ' · 직접 정함' : ''}
        </Text>
        {floorNote(t) ? <Text style={{ color: c.muted, fontSize: 13 }}>{floorNote(t)}</Text> : null}
        <MacroBar carbs={t.carbs} protein={t.protein} fat={t.fat} c={c} />
      </View>
      <GramRow
        label="탄수화물"
        value={t.carbs}
        auto={p.auto.carbs}
        manual={a.kcalTarget !== null}
        hint="고치면 하루 칼로리가 따라 바뀌어요"
        invalid={invalid('kcalTarget')}
        onEdit={(g) => set({ kcalTarget: g === null ? null : kcalOfMacros(g, t.protein, t.fat) })}
        c={c}
      />
      <GramRow
        label="단백질"
        value={t.protein}
        auto={p.auto.protein}
        manual={a.proteinTargetG !== null}
        hint={`체중 1kg 당 ${t.proteinPerKg}g 으로 계산 · ${PROTEIN_G_MIN}~${PROTEIN_G_MAX}g`}
        invalid={invalid('proteinTargetG')}
        onEdit={(g) => set({ proteinTargetG: g })}
        c={c}
      />
      <GramRow
        label="지방"
        value={t.fat}
        auto={p.auto.fat}
        manual={a.fatTargetG !== null}
        hint={`하루 칼로리의 ${Math.round(t.fatShare * 100)}%, 바닥은 체중 0.8g/kg · ${FAT_G_MIN}~${FAT_G_MAX}g`}
        invalid={invalid('fatTargetG')}
        onEdit={(g) => set({ fatTargetG: g })}
        c={c}
      />
    </View>
  );
}

function GramRow({
  label,
  value,
  auto,
  manual,
  hint,
  invalid,
  onEdit,
  c,
}: {
  label: string;
  value: number;
  auto: number;
  manual: boolean;
  hint: string;
  invalid: boolean;
  onEdit: (g: number | null) => void;
  c: Palette;
}) {
  const [text, setText] = useState(String(Math.round(value)));
  const [focused, setFocused] = useState(false);
  /* 다른 칸을 고쳐 이 값이 바뀌면(탄수화물은 나머지) 손대지 않는 동안 따라 맞춘다 */
  const shown = focused ? text : String(Math.round(value));
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>{label}</Text>
        {manual ? <Text style={{ color: c.sky, fontSize: 13, fontWeight: '600' }}>직접 · 계산 {Math.round(auto)}g</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: invalid ? c.danger : c.line, paddingHorizontal: 12 }}>
          <TextInput
            value={shown}
            onFocus={() => {
              setText(String(Math.round(value)));
              setFocused(true);
            }}
            onBlur={() => setFocused(false)}
            onChangeText={(v) => {
              setText(v);
              const s = v.trim();
              if (s === '') return onEdit(null);
              const n = Number(s);
              if (Number.isFinite(n)) onEdit(Math.round(n));
            }}
            keyboardType="number-pad"
            style={{ flex: 1, color: c.ink, fontSize: 20, fontWeight: '600', paddingVertical: 10, fontVariant: ['tabular-nums'] }}
          />
          <Text style={{ color: c.muted }}>g</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}을 계산값으로 되돌리기`}
          disabled={!manual}
          onPress={() => onEdit(null)}
          hitSlop={6}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: manual ? 1 : 0.25 }}
        >
          <SymbolView name="arrow.counterclockwise" size={17} tintColor={c.muted} />
        </Pressable>
      </View>
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 17 }}>{hint}</Text>
    </View>
  );
}
