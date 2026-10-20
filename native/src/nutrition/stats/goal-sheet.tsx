import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ageRule, effectiveGoal, effectiveProtein, effectiveRate, paceChoices, paceDelta } from '@/lib/nutrition/age';
import {
  AVOIDS,
  DIET_STYLES,
  MEAL_PATTERNS,
  type AvoidKey,
  type DietPrefs,
  type DietStyle,
  type MealPattern,
} from '@/lib/nutrition/diet-prefs';
import { mealProteinGoal } from '@/lib/nutrition/meal-protein';
import {
  ACTIVITIES,
  FAT_G_MAX,
  FAT_G_MIN,
  GOAL_KINDS,
  MACRO_PRESETS,
  PROTEIN_G_MAX,
  PROTEIN_G_MIN,
  SEXES,
  kcalText,
  type ActivityKey,
  type GoalKind,
  type MacroPreset,
} from '@/lib/nutrition/meta';
import { foldGoalKind, goalKindHint, goalKindOf, goalKindsFor, presetProtein } from '@/lib/nutrition/onboarding';
import { PERIOD_WEEKS, dateText, dayGap } from '@/lib/nutrition/period';
import { computeTargets, type Assumed, type Body, type ProfileSettings } from '@/lib/nutrition/targets';
import { checkTargetWeight, etaWeeks, planOnSave, targetAllowed, targetRange } from '@/lib/nutrition/weight-goal';
import { shiftDateKey } from '@/lib/pitch-stats';
import { fromWeight, round1, toWeight, type WeightUnit } from '@/lib/units';
import { call } from '~/community/parts';
import type { Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 영양 목표(앱) — 웹 목표 창(app/(app)/nutrition/goal-sheet.tsx)을 옮겼다. 고르는 즉시 아래 '이렇게 먹어요' 숫자가 바뀐다(같은 computeTargets ·
 * planOnSave — 저장 전에 본 숫자 = 저장 뒤 숫자). 두 칸: [목표](목표 카드 · 속도 · 목표 체중 · 언제까지 · 평소 움직임 · 탄단지 · 단백질 ·
 * 직접 정하는 kcal · 단백질 · 지방)와 [식단 취향](스타일 · 끼니 구성 · 못 먹는 것 · 보충식품). 저장은 웹과 같은 서버 동작 둘
 * (nutrition.saveNutritionProfile → saveDietPrefs) — 범위 · 나이 한도는 서버가 다시 본다.
 */
type Result = { ok: true } | { ok: false; error: string };
type SheetTab = 'goal' | 'diet';

/** '+300' · '−400' — 빼기는 U+2212 */
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${kcalText(Math.abs(n))}`;
/* 웹 components/onboarding/format.ts 와 같은 글 — kg 은 둘째 자리(0.25 · 0.35 가 같은 '0.3'이 되지 않게), lb 는 첫째 자리 */
export const kgText = (kg: number, unit: WeightUnit) => `${round1(toWeight(kg, unit))}${unit}`;
export const paceText = (kgPerWeek: number, unit: WeightUnit) =>
  `주 ${unit === 'kg' ? Number(kgPerWeek.toFixed(2)) : round1(toWeight(kgPerWeek, unit))}${unit}`;

export function GoalSheet({
  profile,
  prefs,
  today,
  body,
  assumed,
  unit,
  onSaved,
  onClose,
  initialTab = 'goal',
  c,
}: {
  profile: ProfileSettings;
  prefs: DietPrefs;
  today: string;
  /** 오늘 기준 몸 — 서버(saveNutritionProfile)가 오늘 체중 · 나이로 검사한다 */
  body: Body;
  assumed: Assumed[];
  unit: WeightUnit;
  /** 목표를 저장했다(식단 취향 저장 전이라도) — 부르는 쪽이 다시 받는다 */
  onSaved: () => void;
  onClose: () => void;
  /** 처음 펼 칸 — 영양 탭 식단 카드의 '취향 바꾸기'는 [식단 취향]부터(웹 GoalSheet initialTab) */
  initialTab?: SheetTab;
  c: Palette;
}) {
  const inset = useSafeAreaInsets();
  const [tab, setTab] = useState<SheetTab>(initialTab);
  const [diet, setDiet] = useState<DietDraft>(() => ({
    style: prefs.dietStyle,
    pattern: prefs.mealPattern,
    avoid: prefs.avoid,
    supplements: prefs.supplements,
  }));
  /* 나이에 맞춘 기준(lib/nutrition/age.ts) — 저장된 값이 그 밖이면 범위 안의 값으로 연다 */
  const rule = ageRule(body.age);
  const savedGoal = effectiveGoal(profile.goal, body.age);
  const [goalKind, setGoalKindState] = useState<GoalKind>(() => goalKindOf(savedGoal, profile.goalKind, body.age));
  const goal = effectiveGoal(foldGoalKind(goalKind, body.age).goal, body.age);
  const [activity, setActivity] = useState<ActivityKey>(profile.activity);
  const [protein, setProtein] = useState(() => effectiveProtein(profile.proteinPerKg, body.age));
  const [macroPreset, setMacroPresetState] = useState<MacroPreset>(profile.macroPreset ?? 'balanced');
  const goalCards = goalKindsFor(body.age);
  const [lo, hi] = [rule.proteinChoices[0], rule.proteinChoices.at(-1)];
  const [manual, setManual] = useState(profile.kcalTarget !== null);
  const [kcal, setKcal] = useState(profile.kcalTarget ? String(profile.kcalTarget) : '');
  const [proteinManual, setProteinManual] = useState(profile.proteinTargetG !== null);
  const [proteinG, setProteinG] = useState(profile.proteinTargetG !== null ? String(profile.proteinTargetG) : '');
  const [fatManual, setFatManual] = useState(profile.fatTargetG !== null);
  const [fatG, setFatG] = useState(profile.fatTargetG !== null ? String(profile.fatTargetG) : '');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [foldOpen, setFoldOpen] = useState(false);

  /* ── 체중 목표: 속도 · 목표 체중 · 받아들여 둔 조정 ── */
  /* 목표 체중은 짐작한 몸무게(75kg)로는 못 정한다 — 범위가 남의 몸에서 나온다 */
  const refKg = assumed.includes('weight') ? null : body.weightKg;
  const savedTarget = targetAllowed(savedGoal, body.age) && profile.targetWeightKg !== null ? profile.targetWeightKg : null;
  const targetShown = (kg: number | null) => (kg === null ? '' : String(round1(toWeight(kg, unit))));
  const [rate, setRate] = useState<number | null>(profile.weeklyRateKg);
  const [targetText, setTargetText] = useState(() => targetShown(savedTarget));
  const [cleared, setCleared] = useState(false);
  const savedEnd = prefs.goalEndDate !== null && prefs.goalEndDate > today ? prefs.goalEndDate : null;
  const [period, setPeriod] = useState<string>(savedEnd ? 'saved' : 'none');

  /* 카드를 바꾸면 단백질은 카드가 정한 값으로, 접은 목표가 바뀌면 속도는 기본 · 목표 체중은 비운다(웹과 같다) */
  function setGoalKind(next: GoalKind) {
    if (next === goalKind) return;
    const fold = foldGoalKind(next, body.age);
    const nextGoal = effectiveGoal(fold.goal, body.age);
    setGoalKindState(next);
    setProtein(effectiveProtein(presetProtein(macroPreset, fold.proteinPerKg, body.age), body.age));
    if (nextGoal === goal) return;
    setRate(nextGoal === savedGoal ? profile.weeklyRateKg : null);
    setTargetText(nextGoal === savedGoal ? targetShown(savedTarget) : '');
  }
  function setMacroPreset(next: MacroPreset) {
    setMacroPresetState(next);
    if (next === 'protein') setProtein(effectiveProtein(presetProtein('protein', protein, body.age), body.age));
  }

  const num = (text: string, on: boolean) => {
    const n = Number(text);
    return on && text.trim() !== '' && Number.isFinite(n) ? n : null;
  };
  const kcalTarget = num(kcal, manual);
  const proteinTargetG = num(proteinG, proteinManual);
  const fatTargetG = num(fatG, fatManual);

  const choices = paceChoices(body.age, goal, refKg);
  const pickedRate = effectiveRate(rate, body.age, goal);
  /* 이미 저장해 둔 속도는 지금 고를 수 없는 것이어도 칸에 남긴다 */
  const keptRate = goal === savedGoal ? effectiveRate(profile.weeklyRateKg, body.age, goal) : null;
  const paces = keptRate !== null && !choices.includes(keptRate) ? [...choices, keptRate].sort((a, b) => a - b) : choices;
  const paceKcal = Math.abs(paceDelta(body.age, goal, pickedRate));
  const showPlan = goal !== 'maintain' && rule.band !== 'child';

  const range = targetRange(goal, body.age, refKg, body.heightCm);
  const targetNum = targetText.trim() === '' ? null : Number(targetText);
  const targetKg = targetNum === null || !Number.isFinite(targetNum) ? null : Math.round(fromWeight(targetNum, unit) * 10) / 10;
  const targetCheck =
    targetText.trim() !== '' && targetKg === null
      ? { ok: false as const, error: '목표 체중을 숫자로 적어 주세요.' }
      : checkTargetWeight(goal, body.age, refKg, body.heightCm, targetKg, goal === savedGoal ? savedTarget : null);
  const targetSave = showPlan && targetCheck.ok ? targetCheck.kg : null;

  const planned = planOnSave(
    {
      goal: profile.goal,
      activity: profile.activity,
      weeklyRateKg: profile.weeklyRateKg,
      kcalTarget: profile.kcalTarget,
      kcalAdjust: profile.kcalAdjust,
    },
    { goal, activity, weeklyRateKg: pickedRate, kcalTarget, clearAdjust: cleared },
    body.age
  );
  const draft = {
    goal,
    activity,
    proteinPerKg: protein,
    kcalTarget,
    proteinTargetG,
    targetWeightKg: targetSave,
    weeklyRateKg: pickedRate,
    kcalAdjust: planned.kcalAdjust,
    planSince: profile.planSince,
    goalKind,
    macroPreset,
    fatTargetG,
  } satisfies ProfileSettings;
  const preview = computeTargets(draft, body, 0);
  const auto = computeTargets({ ...draft, kcalTarget: null, proteinTargetG: null, fatTargetG: null }, body, 0);
  const savedAdjust = computeTargets(profile, body, 0).adjust;

  /* ── 목표 체중 · 언제까지의 글(웹과 같은 셈) ── */
  const rangeText = range.ok ? `${round1(toWeight(range.min, unit))}~${kgText(range.max, unit)}` : null;
  const left = targetSave !== null && refKg !== null ? Math.round((goal === 'gain' ? 1 : -1) * (targetSave - refKg) * 10) / 10 : null;
  const remaining = left !== null && left > 0 ? left : null;
  const weeks = remaining !== null && pickedRate !== null ? etaWeeks(remaining, pickedRate) : null;
  const targetHint = !range.ok
    ? range.why === 'band'
      ? rule.band === 'teen' && goal === 'lose'
        ? '성장기에는 감량 목표 체중을 정하지 않아요.'
        : undefined
      : range.why === 'height'
        ? '키를 내 정보에 적으면 감량 목표 체중을 정할 수 있어요.'
        : range.why === 'light'
          ? '키에 비해 가벼운 편이라 감량 목표 체중은 정하지 않아요.'
          : '체중을 먼저 적으면 목표 체중을 정할 수 있어요.'
    : !targetCheck.ok
      ? targetText.trim() !== '' && targetKg === null
        ? targetCheck.error
        : `목표 체중은 ${rangeText} 사이로 적어 주세요.`
      : left !== null && left <= 0
        ? `이미 닿은 목표예요. 새 목표는 ${rangeText} 사이로 적어 주세요.`
        : remaining !== null && refKg !== null
          ? `${kgText(remaining, unit)} 남았어요${weeks !== null ? ` · 계획대로면 약 ${weeks}주` : ''}`
          : `지금 ${refKg !== null ? kgText(refKg, unit) : ''} · ${rangeText} 사이로 정할 수 있어요. 비워 둬도 돼요.`;

  const endDate = period === 'none' ? null : period === 'saved' ? savedEnd : shiftDateKey(today, Number(period) * 7);
  const weeksToEnd = endDate !== null ? dayGap(today, endDate) / 7 : null;
  const needed = remaining !== null && weeksToEnd !== null && weeksToEnd > 0 ? remaining / weeksToEnd : null;
  /** 기간을 고르면 속도도 맞춘다 — 그 기간에 닿는 가장 느린 속도, 없으면 가장 빠른(안전 한도) 속도 */
  function pickPeriod(next: string) {
    setPeriod(next);
    if (next === 'none' || manual || remaining === null || paces.length === 0) return;
    const end = next === 'saved' ? savedEnd : shiftDateKey(today, Number(next) * 7);
    if (end === null) return;
    const need = remaining / (dayGap(today, end) / 7);
    setRate(paces.find((kg) => kg >= need - 0.005) ?? paces[paces.length - 1]);
  }
  const periodOptions = [
    { value: 'none', label: '정하지 않음' },
    ...PERIOD_WEEKS.map((w) => ({ value: String(w), label: `${w}주` })),
    ...(savedEnd ? [{ value: 'saved', label: `${dateText(savedEnd)}까지` }] : []),
  ];
  const fastest = paces.length > 0 ? paces[paces.length - 1] : pickedRate;
  const periodHint =
    endDate === null || needed === null || pickedRate === null
      ? '날짜를 정하면 거기에 맞는 속도를 골라 드려요.'
      : pickedRate >= needed - 0.005
        ? `${dateText(endDate)}까지 ${kgText(remaining ?? 0, unit)}, ${paceText(Math.round(needed * 100) / 100, unit)}이면 닿아요.${
            manual ? ' 칼로리를 직접 정해서 속도는 비교에만 써요.' : ''
          }`
        : `${dateText(endDate)}까지는 ${paceText(Math.round(needed * 100) / 100, unit)}이 필요해요. ${
            fastest !== null && pickedRate < fastest
              ? `지금 속도(${paceText(pickedRate, unit)})로는 약 ${etaWeeks(remaining ?? 0, pickedRate) ?? '?'}주, 가장 빠른 속도(${paceText(fastest, unit)})로도 약 ${etaWeeks(remaining ?? 0, fastest) ?? '?'}주 걸려요.`
              : `몸에 무리 없는 가장 빠른 속도(${paceText(pickedRate, unit)})로도 약 ${etaWeeks(remaining ?? 0, pickedRate) ?? '?'}주 걸려요.`
          }`;

  const paceLine = `${paceText(pickedRate ?? 0, unit)}${goal === 'lose' && rule.band === 'teen' ? ' 안팎' : ''} · 하루 ${signed(
    goal === 'lose' ? -paceKcal : paceKcal
  )}kcal`;
  const paceHint = manual
    ? '직접 정한 칼로리가 먼저예요. 속도는 체중 흐름을 비교할 때만 써요.'
    : rule.band === 'teen'
      ? `성장기는 한 가지 속도예요 · ${paceLine}`
      : paces.length < 2
        ? paceLine
        : pickedRate === paces[0]
          ? goal === 'gain'
            ? `천천히 · 하루 ${signed(paceKcal)}kcal`
            : `천천히 · 하루 ${signed(-paceKcal)}kcal · 시즌 중에 맞아요`
          : goal === 'gain'
            ? `조금 빠르게 · 하루 ${signed(paceKcal)}kcal · 웨이트를 꾸준히 할 때`
            : `보통 · 하루 ${signed(-paceKcal)}kcal`;

  const bodyLine = [
    `${Math.round(preview.weightKg * 10) / 10}kg${assumed.includes('weight') ? '(짐작)' : ''}`,
    body.heightCm ? `${body.heightCm}cm` : '키 178cm(짐작)',
    body.age ? `${body.age}세` : '20세(짐작)',
    body.sex ? SEXES.find((s) => s.key === body.sex)?.label : '성별 모름(남녀 가운데 값)',
  ].join(' · ');

  async function save() {
    if (pending) return;
    setError(null);
    if (manual && kcalTarget === null) return setError('하루 칼로리를 숫자로 적어 주세요.');
    if (proteinManual && (proteinTargetG === null || proteinTargetG < PROTEIN_G_MIN || proteinTargetG > PROTEIN_G_MAX))
      return setError(`하루 단백질은 ${PROTEIN_G_MIN}~${PROTEIN_G_MAX}g 사이로 적어 주세요.`);
    if (fatManual && (fatTargetG === null || fatTargetG < FAT_G_MIN || fatTargetG > FAT_G_MAX))
      return setError(`하루 지방은 ${FAT_G_MIN}~${FAT_G_MAX}g 사이로 적어 주세요.`);
    if (showPlan && !targetCheck.ok) return setError(targetHint ?? targetCheck.error);
    setPending(true);
    try {
      const res = await call<Result>('nutrition.saveNutritionProfile', {
        goal,
        activity,
        proteinPerKg: protein,
        kcalTarget,
        proteinTargetG,
        goalKind,
        macroPreset,
        fatTargetG,
        targetWeightKg: targetSave,
        /* 고른 그대로(null = 기본 속도) — 한도는 서버가 오늘 나이로 건다(웹과 같다) */
        weeklyRateKg: showPlan ? rate : null,
        clearAdjust: cleared,
      });
      if (!res.ok) return setError(res.error);
      /* 기간은 목표 체중이 있고 아직 남았을 때만 — 유지 · 목표 체중 없음이면 지운다 */
      const prefsRes = await call<Result>('nutrition.saveDietPrefs', {
        goalEndDate: showPlan && remaining !== null ? endDate : null,
        dietStyle: diet.style,
        mealPattern: diet.pattern,
        avoid: diet.avoid,
        supplements: diet.supplements,
      });
      /* 다시 받기는 둘 다 끝난 뒤 한 번 — 식단 취향 저장이 오늘 식단에서 못 먹는 것을 빼서(서버), 그 전에 받으면 뺀 음식이 남았다. 목표는 이미 저장됐다 */
      onSaved();
      if (!prefsRes.ok) {
        setTab('diet');
        return setError(prefsRes.error);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } finally {
      setPending(false);
    }
  }

  const hintOf = (list: readonly { key: string; hint: string }[], key: string) => list.find((x) => x.key === key)?.hint;
  const input = [st.input, { backgroundColor: c.card, color: c.ink }];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
        <View style={st.head}>
          <View style={{ flex: 1 }}>
            <Text style={[st.title, { color: c.ink }]}>영양 목표</Text>
            <Text style={[st.small, { color: c.muted }]}>고르면 바로 아래 숫자가 바뀌어요. 운동한 날은 쓴 만큼 더해져요.</Text>
          </View>
          <Press onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" hitSlop={8}>
            <SymbolView name="xmark.circle.fill" size={28} tintColor={c.muted} />
          </Press>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 20, paddingBottom: 24 }, READABLE]}>
          <Choices
            label="영양 목표 칸"
            options={[
              { value: 'goal', label: '목표' },
              { value: 'diet', label: '식단 취향' },
            ]}
            value={tab}
            onChange={(v) => setTab(v as SheetTab)}
            c={c}
          />

          {tab === 'goal' ? (
            <>
              <Section
                label="목표"
                hint={
                  rule.band === 'child'
                    ? rule.goalHint.lose
                    : rule.band === 'teen'
                      ? '성장기라 감량 카드는 없어요. 자라는 몸에서 빼면 키 · 회복이 먼저 손해를 봐요.'
                      : undefined
                }
                c={c}
              >
                <View style={st.cards}>
                  {goalCards.map((key) => {
                    const on = goalKind === key;
                    return (
                      <Press
                        key={key}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setGoalKind(key);
                        }}
                        style={[
                          st.card,
                          goalCards.length > 3 && st.half,
                          { backgroundColor: c.card, borderColor: on ? c.sky : 'transparent' },
                        ]}
                      >
                        <Text style={{ color: on ? c.sky : c.ink, fontSize: 16, fontWeight: '700' }}>
                          {GOAL_KINDS.find((g) => g.key === key)?.label ?? key}
                        </Text>
                        <Text style={[st.small, { color: c.muted }]}>{goalKindHint(key, body.age)}</Text>
                      </Press>
                    );
                  })}
                </View>
              </Section>

              {/* 증량 · 감량이면 속도 · 목표 체중 · 언제까지가 펴진다. 유지와 어린이는 없다 */}
              {showPlan ? (
                body.age === null ? (
                  <Text style={[st.small, { color: c.muted }]}>생년월일을 내 정보에 적으면 속도와 목표 체중을 정할 수 있어요.</Text>
                ) : (
                  <>
                    <Section label="일주일 속도" hint={paceHint} c={c}>
                      {paces.length >= 2 && pickedRate !== null ? (
                        <Choices
                          label="일주일 속도"
                          options={paces.map((kg) => ({ value: String(kg), label: paceText(kg, unit) }))}
                          value={String(pickedRate)}
                          onChange={(v) => setRate(Number(v))}
                          c={c}
                        />
                      ) : null}
                    </Section>
                    <Section label="목표 체중 (선택)" hint={targetHint} danger={range.ok && !targetCheck.ok} c={c}>
                      {range.ok ? (
                        <View style={st.inputRow}>
                          <TextInput
                            value={targetText}
                            /* '72,5' 처럼 쉼표 소수점도 점으로(웹과 같다) */
                            onChangeText={(v) => setTargetText(v.replace(/,/g, '.').replace(/[^\d.]/g, ''))}
                            keyboardType="decimal-pad"
                            placeholder={`예) ${round1(toWeight(range.max, unit))}`}
                            placeholderTextColor={c.muted}
                            style={[input, { width: 140, textAlign: 'right' }, !targetCheck.ok && { borderColor: c.danger, borderWidth: 1 }]}
                          />
                          <Text style={[st.small, { color: c.muted }]}>{unit}</Text>
                        </View>
                      ) : null}
                    </Section>
                    {remaining !== null ? (
                      <Section label="언제까지 (선택)" hint={periodHint} c={c}>
                        <Choices label="언제까지" options={periodOptions} value={period} onChange={pickPeriod} c={c} />
                      </Section>
                    ) : null}
                  </>
                )
              ) : null}

              <Section label="운동 말고 평소 움직임" hint={hintOf(ACTIVITIES, activity)} c={c}>
                <Choices
                  label="평소 움직임"
                  options={ACTIVITIES.map((a) => ({ value: a.key, label: a.label }))}
                  value={activity}
                  onChange={(v) => setActivity(v as ActivityKey)}
                  c={c}
                />
              </Section>

              <Section label="탄단지 나누기" hint={hintOf(MACRO_PRESETS, macroPreset)} c={c}>
                <Choices
                  label="탄단지 나누기"
                  options={MACRO_PRESETS.map((m) => ({ value: m.key, label: m.label }))}
                  value={macroPreset}
                  onChange={(v) => setMacroPreset(v as MacroPreset)}
                  c={c}
                />
              </Section>

              <Section
                label="단백질 (체중 1kg 당)"
                hint={
                  proteinManual
                    ? '아래에서 정한 하루 단백질이 먼저예요.'
                    : rule.band === 'adult'
                      ? '선수에게 권하는 범위는 1.6~2.2g 이에요. 감량 중이면 높게 잡으세요.'
                      : `${rule.label} 선수에게 권하는 범위는 ${lo}~${hi}g 이에요. 더 먹는다고 더 자라지 않고, 그만큼 탄수화물 자리가 줄어요.`
                }
                c={c}
              >
                <Choices
                  label="단백질"
                  options={rule.proteinChoices.map((p) => ({ value: String(p), label: `${p.toFixed(1)}g` }))}
                  value={String(protein)}
                  onChange={(v) => setProtein(Number(v))}
                  c={c}
                />
              </Section>

              <View style={{ gap: 8 }}>
                <SwitchRow label="하루 칼로리를 직접 정하기" value={manual} onChange={setManual} c={c} />
                {manual ? (
                  <View style={st.inputRow}>
                    <TextInput
                      value={kcal}
                      onChangeText={(v) => setKcal(v.replace(/[^\d]/g, ''))}
                      keyboardType="number-pad"
                      placeholder={String(auto.base)}
                      placeholderTextColor={c.muted}
                      style={[input, { width: 120, textAlign: 'right' }]}
                    />
                    <Text style={[st.small, { color: c.muted, flex: 1 }]}>kcal (운동 전) · 계산으로는 {kcalText(auto.base)}</Text>
                  </View>
                ) : null}
                <SwitchRow
                  label="하루 단백질을 직접 정하기"
                  value={proteinManual}
                  onChange={(on) => {
                    setProteinManual(on);
                    /* 처음 켜면 계산값을 넣어 두고 거기서 고치게 */
                    if (on && proteinG.trim() === '')
                      setProteinG(String(Math.min(PROTEIN_G_MAX, Math.max(PROTEIN_G_MIN, auto.proteinAuto))));
                  }}
                  c={c}
                />
                {proteinManual ? (
                  <View style={st.inputRow}>
                    <TextInput
                      value={proteinG}
                      onChangeText={(v) => setProteinG(v.replace(/[^\d]/g, ''))}
                      keyboardType="number-pad"
                      placeholder={String(auto.proteinAuto)}
                      placeholderTextColor={c.muted}
                      style={[input, { width: 120, textAlign: 'right' }]}
                    />
                    <Text style={[st.small, { color: c.muted, flex: 1 }]}>
                      g · 계산으로는 {auto.proteinAuto}g (체중 × {protein.toFixed(1)}g)
                    </Text>
                  </View>
                ) : null}
                <SwitchRow
                  label="하루 지방을 직접 정하기"
                  value={fatManual}
                  onChange={(on) => {
                    setFatManual(on);
                    if (on && fatG.trim() === '') setFatG(String(Math.min(FAT_G_MAX, Math.max(FAT_G_MIN, auto.fatAuto))));
                  }}
                  c={c}
                />
                {fatManual ? (
                  <View style={st.inputRow}>
                    <TextInput
                      value={fatG}
                      onChangeText={(v) => setFatG(v.replace(/[^\d]/g, ''))}
                      keyboardType="number-pad"
                      placeholder={String(auto.fatAuto)}
                      placeholderTextColor={c.muted}
                      style={[input, { width: 120, textAlign: 'right' }]}
                    />
                    <Text style={[st.small, { color: c.muted, flex: 1 }]}>
                      g · 계산으로는 {auto.fatAuto}g (하루 칼로리의 {Math.round(auto.fatShare * 100)}%)
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={[st.preview, { backgroundColor: c.card, boxShadow: c.float }]}>
                <Text style={[st.label, { color: c.muted }]}>이렇게 먹어요 (운동 없는 날)</Text>
                <View style={st.stats}>
                  <Stat label="하루 칼로리" value={`${kcalText(preview.base)}kcal`} strong c={c} />
                  <Stat label="단백질" value={`${preview.protein}g`} c={c} />
                  <Stat label="탄수화물" value={`${preview.carbs}g`} c={c} />
                  <Stat label="지방" value={`${preview.fat}g`} c={c} />
                </View>
                <Text style={[st.small, { color: c.muted }]}>
                  단백질은 세 끼에 {mealProteinGoal(preview.protein, preview.ageBand)}g 쯤씩 나눠 먹어요. 몰아 먹는 것보다 근육에 잘 쓰여요.
                </Text>
                {preview.adjust !== 0 ? (
                  <View style={st.inputRow}>
                    <Text style={[st.small, { color: c.muted }]}>체중 흐름 조정 {signed(preview.adjust)}kcal 포함</Text>
                    <Press accessibilityRole="button" onPress={() => setCleared(true)} hitSlop={8} style={{ minHeight: 40, justifyContent: 'center' }}>
                      <Text style={{ color: c.sky, fontSize: 13, fontWeight: '600' }}>조정 지우기</Text>
                    </Press>
                  </View>
                ) : savedAdjust !== 0 ? (
                  <Text style={[st.small, { color: c.muted }]}>저장하면 체중 흐름 조정 {signed(savedAdjust)}kcal은 0으로 돌아가요.</Text>
                ) : null}
                <Press
                  accessibilityRole="button"
                  accessibilityState={{ expanded: foldOpen }}
                  onPress={() => setFoldOpen((o) => !o)}
                  style={{ minHeight: 40, justifyContent: 'center' }}
                >
                  <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>{foldOpen ? '계산 내역 접기' : '계산 내역 보기'}</Text>
                </Press>
                {foldOpen ? (
                  <Text style={[st.small, { color: c.muted, lineHeight: 19 }]}>
                    {showPlan && body.age !== null && !manual ? '숫자는 처음엔 어림잡은 값이에요. 체중 흐름을 보고 맞춰 가요.\n' : ''}
                    기초대사량 {kcalText(preview.bmr)}kcal ({rule.bmrName}) · 활동대사량 {kcalText(preview.tdee)}kcal (×{' '}
                    {ACTIVITIES.find((a) => a.key === activity)?.factor ?? 1.5}){'\n'}
                    나이 기준: {rule.label}
                    {rule.band !== 'adult' ? ' · 자라는 몸에 맞춰 셈해요' : ''}
                    {'\n'}계산에 쓴 몸: {bodyLine}
                    {assumed.length > 0 ? '. 내 정보에서 채우면 더 정확해져요.' : ''}
                    {'\n'}성별 · 키 · 몸무게 · 생년월일은 더보기 › 내 정보에서 바꿔요.
                  </Text>
                ) : null}
              </View>
            </>
          ) : (
            <DietPanel draft={diet} onChange={setDiet} minor={rule.band !== 'adult'} c={c} />
          )}

          {error ? (
            <Text accessibilityRole="alert" style={[st.error, { color: c.danger, backgroundColor: c.danger + '14' }]}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <View style={[st.footer, { paddingBottom: Math.max(16, inset.bottom), borderTopColor: c.line }]}>
          <Press
            accessibilityRole="button"
            onPress={() => void save()}
            disabled={pending}
            style={[st.primary, { backgroundColor: c.sky }, pending && { opacity: 0.5 }]}
          >
            <Text style={st.primaryText}>{pending ? '저장 중' : '저장'}</Text>
          </Press>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type DietDraft = { style: DietStyle; pattern: MealPattern; avoid: AvoidKey[]; supplements: boolean };

/** [식단 취향] — 식단 짜기가 이대로 짠다. 성장기 · 어린이는 보충식품을 넣지 않는다(웹과 같다) */
function DietPanel({ draft, onChange, minor, c }: { draft: DietDraft; onChange: (next: DietDraft) => void; minor: boolean; c: Palette }) {
  const set = (patch: Partial<DietDraft>) => onChange({ ...draft, ...patch });
  return (
    <>
      <Text style={[st.small, { color: c.muted }]}>칼로리 · 단백질은 [목표] 칸에서 정해요.</Text>
      <Section label="식단 스타일" hint={DIET_STYLES.find((x) => x.key === draft.style)?.hint} c={c}>
        <Choices
          label="식단 스타일"
          options={DIET_STYLES.map((x) => ({ value: x.key, label: x.label }))}
          value={draft.style}
          onChange={(v) => set({ style: v as DietStyle })}
          c={c}
        />
      </Section>
      <Section label="끼니 구성" c={c}>
        <Choices
          label="끼니 구성"
          options={MEAL_PATTERNS.map((x) => ({ value: x.key, label: x.label }))}
          value={draft.pattern}
          onChange={(v) => set({ pattern: v as MealPattern })}
          c={c}
        />
      </Section>
      <Section
        label="못 먹거나 안 먹는 것 (여럿 고를 수 있어요)"
        hint={draft.avoid.length > 0 ? '고른 것이 든 음식은 빼고 다른 것으로 바꿔 짜요.' : '알레르기 · 종교 · 입맛으로 안 먹는 것을 고르세요.'}
        c={c}
      >
        <Choices
          label="못 먹는 것"
          multiple
          options={AVOIDS.map((x) => ({ value: x.key, label: x.label }))}
          value={draft.avoid}
          onChange={(v) =>
            set({
              avoid: draft.avoid.includes(v as AvoidKey) ? draft.avoid.filter((a) => a !== v) : [...draft.avoid, v as AvoidKey],
            })
          }
          c={c}
        />
      </Section>
      <View style={{ gap: 6 }}>
        <SwitchRow label="단백질 쉐이크 · 바도 넣기" value={draft.supplements && !minor} disabled={minor} onChange={(on) => set({ supplements: on })} c={c} />
        <Text style={[st.small, { color: c.muted }]}>
          {minor ? '성장기에는 보충식품 없이 음식으로 채워요.' : '끄면 고기 · 달걀 · 유제품 같은 음식만으로 짜요.'}
        </Text>
      </View>
    </>
  );
}

function Section({ label, hint, danger, children, c }: { label: string; hint?: string; danger?: boolean; children?: ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[st.label, { color: c.muted }]}>{label}</Text>
      {children}
      {hint ? <Text style={[st.small, { color: danger ? c.danger : c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

/** 고르는 칩 — 하나면 라디오, 여럿이면 체크 상자(화면 읽기에 그대로 읽힌다) */
function Choices({
  label,
  options,
  value,
  onChange,
  multiple = false,
  c,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string | readonly string[];
  onChange: (value: string) => void;
  multiple?: boolean;
  c: Palette;
}) {
  const on = (v: string) => (multiple ? (value as readonly string[]).includes(v) : value === v);
  return (
    <View accessibilityRole={multiple ? undefined : 'radiogroup'} accessibilityLabel={label} style={st.chips}>
      {options.map((o) => (
        <Press
          key={o.value}
          accessibilityRole={multiple ? 'checkbox' : 'radio'}
          accessibilityState={multiple ? { checked: on(o.value) } : { selected: on(o.value) }}
          onPress={() => {
            void Haptics.selectionAsync();
            onChange(o.value);
          }}
          style={[st.chip, { backgroundColor: on(o.value) ? c.sky : c.chip }]}
        >
          <Text style={{ color: on(o.value) ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{o.label}</Text>
        </Press>
      ))}
    </View>
  );
}

function SwitchRow({
  label,
  value,
  onChange,
  disabled,
  c,
}: {
  label: string;
  value: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  c: Palette;
}) {
  return (
    <View style={[st.switchRow, { backgroundColor: c.card }, disabled && { opacity: 0.6 }]}>
      <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />
    </View>
  );
}

function Stat({ label, value, strong, c }: { label: string; value: string; strong?: boolean; c: Palette }) {
  return (
    <View style={{ width: '47%', gap: 2 }}>
      <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: c.ink, fontSize: strong ? 17 : 15, fontWeight: strong ? '700' : '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { width: '100%', borderRadius: 14, borderWidth: 2, padding: 12, gap: 4, minHeight: 56 },
  half: { width: '48.5%' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 12, paddingHorizontal: 14 },
  preview: { borderRadius: 16, padding: 16, gap: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 12 },
  error: { fontSize: 15, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  primary: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
