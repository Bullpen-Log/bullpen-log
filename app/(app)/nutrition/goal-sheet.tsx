'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import { useWeightUnit } from '@/components/use-units';
import { fromWeight, round1, toWeight } from '@/lib/units';
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
import {
  foldGoalKind,
  goalKindHint,
  goalKindOf,
  goalKindsFor,
  presetProtein,
} from '@/lib/nutrition/onboarding';
import { PERIOD_WEEKS, dateText, dayGap } from '@/lib/nutrition/period';
import { kgText, paceText } from '@/components/onboarding/format';
import { OptionCards } from '@/components/onboarding/choices';
import { MacroBar } from '@/components/onboarding/plan-stats';
import {
  computeTargets,
  type Assumed,
  type Body,
  type ProfileSettings,
} from '@/lib/nutrition/targets';
import {
  ageRule,
  effectiveGoal,
  effectiveProtein,
  effectiveRate,
  paceChoices,
  paceDelta,
} from '@/lib/nutrition/age';
import {
  checkTargetWeight,
  etaWeeks,
  planOnSave,
  targetAllowed,
  targetRange,
} from '@/lib/nutrition/weight-goal';
import { mealProteinGoal } from '@/lib/nutrition/meal-protein';
import {
  AVOIDS,
  DIET_STYLES,
  MEAL_PATTERNS,
  type AvoidKey,
  type DietPrefs,
  type DietStyle,
  type MealPattern,
} from '@/lib/nutrition/diet-prefs';
import { shiftDateKey } from '@/lib/pitch-stats';
import { saveDietPrefs, saveNutritionProfile } from '@/app/actions/nutrition';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import type { Origin } from './shared';

/**
 * 영양 목표 정하기.
 *
 * 고르는 즉시 아래 숫자가 바뀐다 — '증량'을 누르면 하루 칼로리가 300 오르는 것을
 * 눈으로 본다. 무엇이 무엇을 움직이는지 알아야 믿고 따른다.
 *
 * 하루 칼로리를 직접 정할 수도 있다(팀 영양사가 정해 준 숫자가 있는 선수).
 * 그래도 운동한 날에는 쓴 만큼 더해진다.
 *
 * 증량 · 감량을 고르면 그 밑에 '일주일 속도'와 '목표 체중'이 펴진다(lib/nutrition/weight-goal.ts).
 * 속도는 하루 칼로리를 움직이고, 둘 다 체중 카드가 체중 흐름과 견주는 계획이 된다. 목표 체중을 적으면
 * '언제까지'도 고를 수 있다 — 고른 날짜에 맞는 속도를 골라 주고, 무리면 몇 주 걸리는지 말한다.
 *
 * 두 칸으로 나뉜다 — [목표]는 숫자(칼로리 · 단백질 · 체중 계획), [식단 취향]은 식단 짜기가 읽는 것(시즌 단계 ·
 * 스타일 · 끼니 구성 · 못 먹는 것 · 보충식품, lib/nutrition/diet-prefs.ts). 저장 단추 하나가 둘 다 저장한다.
 */

/*
 * 고르는 칸의 크기 — 높이 44px(손가락 끝 하나), 글자도 한 단계 크게.
 *
 * 예전에는 설정 창과 같은 촘촘한 칸(글자 12px, 높이 28px 안팎)이었다. 여기는 한
 * 번 정하면 한참 안 여는 곳이라 촘촘할 까닭이 없고, 운동 끝에 땀 난 손으로 누르면
 * 옆 칸이 눌렸다.
 */
const BIG = 'min-h-11 px-2';

/** '+300' · '−400' — 빼기는 U+2212 */
const signed = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${kcalText(Math.abs(n))}`;

export function GoalSheet({
  open,
  origin,
  onClose,
  profile,
  prefs,
  today,
  initialTab = 'goal',
  body,
  assumed,
}: {
  open: boolean;
  origin: Origin;
  onClose: () => void;
  profile: ProfileSettings;
  prefs: DietPrefs;
  /** 오늘('YYYY-MM-DD') — '언제까지'의 날짜를 셈한다 */
  today: string;
  /** 처음 열 칸 — 식단 짜기에서 '취향 바꾸기'로 열면 식단 취향 */
  initialTab?: SheetTab;
  body: Body;
  assumed: Assumed[];
}) {
  const unit = useWeightUnit();
  const [tab, setTab] = useState<SheetTab>(initialTab);
  /* ── 식단 취향(식단 짜기가 읽는다) ── */
  const [diet, setDiet] = useState<DietDraft>(() => ({
    style: prefs.dietStyle,
    pattern: prefs.mealPattern,
    avoid: prefs.avoid,
    supplements: prefs.supplements,
  }));
  /*
   * 나이에 맞춘 기준(lib/nutrition/age.ts) — 18세 밑은 단백질 범위가 낮고, 감량이
   * 작거나(성장기) 없다(어린이). 저장된 값이 그 밖이면 범위 안의 값으로 연다.
   */
  const rule = ageRule(body.age);
  const savedGoal = effectiveGoal(profile.goal, body.age);
  /* 목표 카드(다섯) — 계산이 읽는 목표 셋은 카드를 접은 값(lib/nutrition/onboarding.ts foldGoalKind). 인아웃식 온보딩(2026-10-08) */
  const [goalKind, setGoalKindState] = useState<GoalKind>(() =>
    goalKindOf(savedGoal, profile.goalKind, body.age)
  );
  const goal = effectiveGoal(foldGoalKind(goalKind, body.age).goal, body.age);
  const [activity, setActivity] = useState<ActivityKey>(profile.activity);
  const [protein, setProtein] = useState(() =>
    effectiveProtein(profile.proteinPerKg, body.age)
  );
  /* 탄단지 나누기 — 지방 몫. null(옛 줄)은 균형 */
  const [macroPreset, setMacroPresetState] = useState<MacroPreset>(
    profile.macroPreset ?? 'balanced'
  );
  const goalCards = goalKindsFor(body.age);
  const [lo, hi] = [rule.proteinChoices[0], rule.proteinChoices.at(-1)];
  const [manual, setManual] = useState(profile.kcalTarget !== null);
  const [kcal, setKcal] = useState(
    profile.kcalTarget ? String(profile.kcalTarget) : ''
  );
  /* 하루 단백질 직접 정하기 — 칼로리와 같은 모양(스위치 + 숫자 칸) */
  const [proteinManual, setProteinManual] = useState(profile.proteinTargetG !== null);
  const [proteinG, setProteinG] = useState(
    profile.proteinTargetG !== null ? String(profile.proteinTargetG) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /* ── 체중 목표: 속도 · 목표 체중 · 받아들여 둔 조정 ── */
  /* 목표 체중은 짐작한 몸무게(75kg)로는 못 정한다 — 범위가 남의 몸에서 나온다 */
  const refKg = assumed.includes('weight') ? null : body.weightKg;
  const savedTarget =
    targetAllowed(savedGoal, body.age) && profile.targetWeightKg !== null
      ? profile.targetWeightKg
      : null;
  const targetShown = (kg: number | null) =>
    kg === null ? '' : String(round1(toWeight(kg, unit)));
  /* 고른 속도. null 은 '그 나이 · 목표의 기본 속도' */
  const [rate, setRate] = useState<number | null>(profile.weeklyRateKg);
  const [targetText, setTargetText] = useState(() => targetShown(savedTarget));
  const [cleared, setCleared] = useState(false);
  /*
   * '언제까지' — 'none' · 주 수('4' …) · 'saved'(저장해 둔 날짜). 저장해 둔 날짜가 오늘이거나 지났으면 고른 것 없이 연다
   * (서버도 지난 날짜는 안 받는다).
   */
  const savedEnd =
    prefs.goalEndDate !== null && prefs.goalEndDate > today ? prefs.goalEndDate : null;
  const [period, setPeriod] = useState<string>(savedEnd ? 'saved' : 'none');

  /*
   * 카드를 바꾸면 단백질은 카드가 정한 값(근육 키우기 · 군살만 빼기는 높게, 나머지는 나이 기본)으로, 접은 목표가 바뀌면
   * 속도는 그 목표의 기본으로, 목표 체중은 비운다(증량의 82kg 은 감량의 목표가 아니다). 증량 ↔ 근육 키우기처럼 접은
   * 목표가 같으면 속도 · 체중은 둔다.
   */
  function setGoalKind(next: GoalKind) {
    if (next === goalKind) return;
    const fold = foldGoalKind(next, body.age);
    const nextGoal = effectiveGoal(fold.goal, body.age);
    setGoalKindState(next);
    setProtein(
      effectiveProtein(
        presetProtein(macroPreset, fold.proteinPerKg, body.age),
        body.age
      )
    );
    if (nextGoal === goal) return;
    setRate(nextGoal === savedGoal ? profile.weeklyRateKg : null);
    setTargetText(nextGoal === savedGoal ? targetShown(savedTarget) : '');
  }
  /* '단백질 넉넉히'를 고르면 단백질을 2.0g/kg 이상으로(성장기는 범위 끝) — 다른 프리셋은 지방 몫만 바꾼다 */
  function setMacroPreset(next: MacroPreset) {
    setMacroPresetState(next);
    if (next === 'protein') {
      setProtein(
        effectiveProtein(presetProtein('protein', protein, body.age), body.age)
      );
    }
  }

  const kcalNum = Number(kcal);
  const kcalTarget =
    manual && kcal.trim() !== '' && Number.isFinite(kcalNum) ? kcalNum : null;
  const proteinNum = Number(proteinG);
  const proteinTargetG =
    proteinManual && proteinG.trim() !== '' && Number.isFinite(proteinNum)
      ? proteinNum
      : null;
  /* 하루 지방 직접 정하기 — 단백질과 같은 모양. 탄수화물이 나머지라 따라 움직인다 */
  const [fatManual, setFatManual] = useState(profile.fatTargetG !== null);
  const [fatG, setFatG] = useState(
    profile.fatTargetG !== null ? String(profile.fatTargetG) : ''
  );
  const fatNum = Number(fatG);
  const fatTargetG =
    fatManual && fatG.trim() !== '' && Number.isFinite(fatNum) ? fatNum : null;

  const choices = paceChoices(body.age, goal, refKg);
  const pickedRate = effectiveRate(rate, body.age, goal);
  /* 이미 저장해 둔 속도는 지금 고를 수 없는 것이어도 칸에 남긴다(체중이 70kg 아래로 내려간 사람의 0.35) */
  const keptRate =
    goal === savedGoal ? effectiveRate(profile.weeklyRateKg, body.age, goal) : null;
  const paces =
    keptRate !== null && !choices.includes(keptRate)
      ? [...choices, keptRate].sort((a, b) => a - b)
      : choices;
  const paceKcal = Math.abs(paceDelta(body.age, goal, pickedRate));
  /* 속도와 목표 체중을 펴는가 — 증량 · 감량이고 어린이가 아닐 때 */
  const showPlan = goal !== 'maintain' && rule.band !== 'child';

  const range = targetRange(goal, body.age, refKg, body.heightCm);
  const targetNum = targetText.trim() === '' ? null : Number(targetText);
  const targetKg =
    targetNum === null || !Number.isFinite(targetNum)
      ? null
      : Math.round(fromWeight(targetNum, unit) * 10) / 10;
  const targetCheck =
    targetText.trim() !== '' && targetKg === null
      ? { ok: false as const, error: '목표 체중을 숫자로 적어 주세요.' }
      : checkTargetWeight(
          goal,
          body.age,
          refKg,
          body.heightCm,
          targetKg,
          goal === savedGoal ? savedTarget : null
        );
  const targetSave = showPlan && targetCheck.ok ? targetCheck.kg : null;

  /* 저장하면 조정이 어떻게 되나 — 서버와 같은 규칙으로 미리 본다(저장 전 숫자 = 저장 뒤 숫자) */
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
  const auto = computeTargets(
    { ...draft, kcalTarget: null, proteinTargetG: null, fatTargetG: null },
    body,
    0
  );
  /* 지금 얹혀 있는 조정(나이 한도로 당긴 값) — 저장하면 사라지는지 알리려고 */
  const savedAdjust = computeTargets(profile, body, 0).adjust;

  function save() {
    setError(null);
    if (manual && kcalTarget === null) {
      setError('하루 칼로리를 숫자로 적어 주세요.');
      return;
    }
    if (
      proteinManual &&
      (proteinTargetG === null ||
        proteinTargetG < PROTEIN_G_MIN ||
        proteinTargetG > PROTEIN_G_MAX)
    ) {
      setError(`하루 단백질은 ${PROTEIN_G_MIN}~${PROTEIN_G_MAX}g 사이로 적어 주세요.`);
      return;
    }
    if (
      fatManual &&
      (fatTargetG === null || fatTargetG < FAT_G_MIN || fatTargetG > FAT_G_MAX)
    ) {
      setError(`하루 지방은 ${FAT_G_MIN}~${FAT_G_MAX}g 사이로 적어 주세요.`);
      return;
    }
    if (showPlan && !targetCheck.ok) {
      setError(targetHint ?? targetCheck.error);
      return;
    }
    startTransition(async () => {
      /* 신호가 끊겨 부르기가 던지면 오류 화면 대신 한 줄로 알린다(lib/action-offline.ts) */
      const res = await orOffline(
        saveNutritionProfile({
          goal,
          activity,
          proteinPerKg: protein,
          kcalTarget,
          proteinTargetG,
          goalKind,
          macroPreset,
          fatTargetG,
          targetWeightKg: targetSave,
          /*
           * 고른 그대로 보낸다(null = 기본 속도). 지난 날을 보며 열면 이 창은 그날 나이로 셈하는데, 그 나이로
           * 당긴 값(pickedRate)을 보내면 오늘 나이의 서버가 못 받는다 — 한도는 서버가 오늘 나이로 건다.
           */
          weeklyRateKg: showPlan ? rate : null,
          clearAdjust: cleared,
        }),
        { ok: false as const, error: OFFLINE_MESSAGE }
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      /* 기간은 목표 체중이 있고 아직 남았을 때만 — 유지 · 목표 체중 없음이면 지운다 */
      const prefsRes = await orOffline(
        saveDietPrefs({
          goalEndDate: showPlan && remaining !== null ? endDate : null,
          dietStyle: diet.style,
          mealPattern: diet.pattern,
          avoid: diet.avoid,
          supplements: diet.supplements,
        }),
        { ok: false as const, error: OFFLINE_MESSAGE }
      );
      if (prefsRes.ok) onClose();
      else {
        setTab('diet');
        setError(prefsRes.error);
      }
    });
  }

  const hint = (list: readonly { key: string; hint: string }[], key: string) =>
    list.find((x) => x.key === key)?.hint;

  const bodyLine = [
    `${Math.round(preview.weightKg * 10) / 10}kg${assumed.includes('weight') ? '(짐작)' : ''}`,
    body.heightCm ? `${body.heightCm}cm` : '키 178cm(짐작)',
    body.age ? `${body.age}세` : '20세(짐작)',
    body.sex
      ? SEXES.find((s) => s.key === body.sex)?.label
      : '성별 모름(남녀 가운데 값)',
  ].join(' · ');

  /* ── 속도 줄의 글 ── */
  const paceLine = `${paceText(pickedRate ?? 0, unit)}${
    goal === 'lose' && rule.band === 'teen' ? ' 안팎' : ''
  } · 하루 ${signed(goal === 'lose' ? -paceKcal : paceKcal)}kcal`;
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

  /* ── 목표 체중 줄의 글 ── */
  const rangeText = range.ok
    ? `${round1(toWeight(range.min, unit))}~${kgText(range.max, unit)}`
    : null;
  /* 목표까지 남은 양(방향 있음) — 0 이하면 이미 닿은 목표다(닿은 뒤 '새 목표 정하기'로 연 창) */
  const left =
    targetSave !== null && refKg !== null
      ? Math.round((goal === 'gain' ? 1 : -1) * (targetSave - refKg) * 10) / 10
      : null;
  const remaining = left !== null && left > 0 ? left : null;
  const weeks =
    remaining !== null && pickedRate !== null ? etaWeeks(remaining, pickedRate) : null;
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

  /* ── '언제까지' — 고른 기간에 닿으려면 주 몇 kg 이 필요한가 ── */
  const endDate =
    period === 'none'
      ? null
      : period === 'saved'
        ? savedEnd
        : shiftDateKey(today, Number(period) * 7);
  const weeksToEnd = endDate !== null ? dayGap(today, endDate) / 7 : null;
  const needed =
    remaining !== null && weeksToEnd !== null && weeksToEnd > 0
      ? remaining / weeksToEnd
      : null;
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
  const periodHint =
    endDate === null || needed === null || pickedRate === null
      ? '날짜를 정하면 거기에 맞는 속도를 골라 드려요.'
      : pickedRate >= needed - 0.005
        ? `${dateText(endDate)}까지 ${kgText(remaining ?? 0, unit)}, ${paceText(Math.round(needed * 100) / 100, unit)}이면 닿아요.${
            manual ? ' 칼로리를 직접 정해서 속도는 비교에만 써요.' : ''
          }`
        : `${dateText(endDate)}까지는 ${paceText(Math.round(needed * 100) / 100, unit)}이 필요해요. ${
            pickedRate < (paces.length > 0 ? paces[paces.length - 1] : pickedRate)
              ? `지금 속도(${paceText(pickedRate, unit)})로는 약 ${etaWeeks(remaining ?? 0, pickedRate) ?? '?'}주, 가장 빠른 속도(${paceText(paces.length > 0 ? paces[paces.length - 1] : pickedRate, unit)})로도 약 ${etaWeeks(remaining ?? 0, paces.length > 0 ? paces[paces.length - 1] : pickedRate) ?? '?'}주 걸려요.`
              : `몸에 무리 없는 가장 빠른 속도(${paceText(pickedRate, unit)})로도 약 ${etaWeeks(remaining ?? 0, pickedRate) ?? '?'}주 걸려요.`
          }`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="영양 목표"
      description="고르면 바로 아래 숫자가 바뀌어요. 운동한 날은 쓴 만큼 더해져요."
      origin={origin}
    >
      <div className="space-y-6">
        {/* 두 칸 — 숫자(목표)와 식단 짜기가 읽는 것(식단 취향). 고른 것은 칸을 오가도 그대로다 */}
        <Segmented
          label="영양 목표 칸"
          role="tablist"
          size="md"
          itemClassName={BIG}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'goal', label: '목표' },
            { value: 'diet', label: '식단 취향' },
          ]}
        />

        {tab === 'goal' ? (
          <div
            key="goal"
            role="tabpanel"
            className="motion-safe:animate-fade-in space-y-6"
          >
            <div>
              <Row
                label="목표"
                hint={
                  rule.band === 'child'
                    ? rule.goalHint.lose
                    : rule.band === 'teen'
                      ? '성장기라 감량 카드는 없어요 — 자라는 몸에서 빼면 키 · 회복이 먼저 손해를 봐요.'
                      : undefined
                }
              >
                <OptionCards
                  name="goalKind"
                  label="목표"
                  options={goalCards.map((key) => ({
                    value: key,
                    label: GOAL_KINDS.find((g) => g.key === key)?.label ?? key,
                    hint: goalKindHint(key, body.age),
                  }))}
                  value={goalKind}
                  onChange={setGoalKind}
                  columns={goalCards.length > 3 ? 2 : 1}
                />
              </Row>

              {/*
            증량 · 감량을 고르면 속도와 목표 체중이 펴진다(직접 칼로리 칸과 같은 펴짐). 유지와 어린이는 접혀 있다 —
            유지는 지킬 속도가 0 이고, 어린이는 자라는 만큼 느는 것이 계획이다.
          */}
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                  showPlan ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="min-h-0 overflow-hidden" inert={!showPlan}>
                  {body.age === null ? (
                    <p className="pt-4 text-xs leading-relaxed text-muted">
                      생년월일을 내 정보에 적으면 속도와 목표 체중을 정할 수 있어요.
                    </p>
                  ) : (
                    <div className="space-y-5 pt-5">
                      <Row label="일주일 속도" hint={paceHint}>
                        {paces.length >= 2 && pickedRate !== null && (
                          <Segmented
                            label="일주일 속도"
                            size="md"
                            itemClassName={BIG}
                            value={String(pickedRate)}
                            onChange={(v) => setRate(Number(v))}
                            options={paces.map((kg) => ({
                              value: String(kg),
                              label: paceText(kg, unit),
                            }))}
                          />
                        )}
                      </Row>

                      <Row
                        label="목표 체중 (선택)"
                        hint={targetHint}
                        hintTone={range.ok && !targetCheck.ok ? 'danger' : 'muted'}
                      >
                        {range.ok && (
                          <label className="relative block w-40">
                            <span className="sr-only">목표 체중({unit})</span>
                            <input
                              inputMode="decimal"
                              value={targetText}
                              onChange={(e) =>
                                /* '72,5' 처럼 쉼표 소수점도 점으로(2026-10-03) */
                                setTargetText(
                                  e.target.value
                                    .replace(/,/g, '.')
                                    .replace(/[^\d.]/g, '')
                                )
                              }
                              placeholder={`예) ${round1(toWeight(range.max, unit))}`}
                              aria-invalid={!targetCheck.ok}
                              className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 pr-11 text-right text-base tabular-nums text-ink placeholder:text-muted/60 transition-colors focus:border-sky focus:outline-none aria-[invalid=true]:border-danger"
                            />
                            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">
                              {unit}
                            </span>
                          </label>
                        )}
                      </Row>

                      {/* 목표 체중이 있고 아직 남았을 때만 — 날짜만으로는 갈 곳이 없다 */}
                      {remaining !== null && (
                        <Row label="언제까지 (선택)" hint={periodHint}>
                          <ChoiceChips
                            label="언제까지"
                            options={periodOptions}
                            value={period}
                            onChange={pickPeriod}
                          />
                        </Row>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Row label="운동 말고 평소 움직임" hint={hint(ACTIVITIES, activity)}>
              <Segmented
                label="평소 움직임"
                size="md"
                itemClassName={BIG}
                value={activity}
                onChange={setActivity}
                options={ACTIVITIES.map((a) => ({ value: a.key, label: a.label }))}
              />
            </Row>

            {/* 탄단지 나누기 — 지방 몫. 단백질은 체중으로, 탄수화물은 나머지(인아웃식 온보딩, 2026-10-08) */}
            <Row label="탄단지 나누기" hint={hint(MACRO_PRESETS, macroPreset)}>
              <Segmented
                label="탄단지 나누기"
                size="md"
                itemClassName={BIG}
                value={macroPreset}
                onChange={setMacroPreset}
                options={MACRO_PRESETS.map((m) => ({ value: m.key, label: m.label }))}
              />
            </Row>

            {/*
          성별은 여기서 고르지 않는다 — 계정에 있다(가입할 때 고르고 내 정보에서
          바꾼다). 아래 '계산에 쓴 몸' 줄에 무엇으로 셈했는지만 보여 준다.
        */}
            <Row
              label="단백질 (체중 1kg 당)"
              hint={
                proteinManual
                  ? '아래에서 정한 하루 단백질이 먼저예요.'
                  : rule.band === 'adult'
                    ? '선수에게 권하는 범위는 1.6~2.2g 이에요. 감량 중이면 높게 잡으세요.'
                    : `${rule.label} 선수에게 권하는 범위는 ${lo}~${hi}g 이에요. 더 먹는다고 더 자라지 않고, 그만큼 탄수화물 자리가 줄어요.`
              }
            >
              <Segmented
                label="단백질"
                size="md"
                itemClassName={BIG}
                value={String(protein)}
                onChange={(v) => setProtein(Number(v))}
                options={rule.proteinChoices.map((p) => ({
                  value: String(p),
                  label: `${p.toFixed(1)}g`,
                }))}
              />
            </Row>

            <div className="space-y-2">
              {/*
            줄 전체가 스위치다. 예전에는 16px 체크 상자 하나라 손가락으로 맞히기
            어려웠다 — 글자를 눌러도 켜지지만 그걸 아는 사람이 드물다.
          */}
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink transition-colors hover:border-sky-soft">
                <span className="min-w-0 flex-1">하루 칼로리를 직접 정하기</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={manual}
                  onChange={(e) => setManual(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors duration-200 peer-checked:bg-sky peer-focus-visible:ring-2 peer-focus-visible:ring-sky peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-[cubic-bezier(0.22,1,0.36,1)] peer-checked:after:translate-x-5"
                />
              </label>
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                  manual ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="min-h-0 overflow-hidden" inert={!manual}>
                  <label className="flex flex-wrap items-center gap-2 pt-2 text-sm text-muted">
                    <input
                      inputMode="numeric"
                      value={kcal}
                      onChange={(e) => setKcal(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder={String(auto.base)}
                      className="h-12 w-32 rounded-xl border border-line bg-surface-2 px-3 text-right text-base tabular-nums text-ink transition-colors focus:border-sky focus:outline-none"
                    />
                    kcal (운동 전) · 계산으로는 {kcalText(auto.base)}
                  </label>
                </div>
              </div>

              {/* 하루 단백질 직접 정하기 — 칼로리 스위치와 같은 모양. 계산값은 옆에 그대로 보인다 */}
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink transition-colors hover:border-sky-soft">
                <span className="min-w-0 flex-1">하루 단백질을 직접 정하기</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={proteinManual}
                  onChange={(e) => {
                    setProteinManual(e.target.checked);
                    /* 처음 켜면 계산값을 넣어 두고 거기서 고치게 — 빈칸에서 시작하면 얼마가 적당한지 모른다 */
                    if (e.target.checked && proteinG.trim() === '') {
                      setProteinG(
                        String(
                          Math.min(
                            PROTEIN_G_MAX,
                            Math.max(PROTEIN_G_MIN, auto.proteinAuto)
                          )
                        )
                      );
                    }
                  }}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors duration-200 peer-checked:bg-sky peer-focus-visible:ring-2 peer-focus-visible:ring-sky peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-[cubic-bezier(0.22,1,0.36,1)] peer-checked:after:translate-x-5"
                />
              </label>
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                  proteinManual ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="min-h-0 overflow-hidden" inert={!proteinManual}>
                  <label className="flex flex-wrap items-center gap-2 pt-2 text-sm text-muted">
                    <input
                      inputMode="numeric"
                      value={proteinG}
                      onChange={(e) =>
                        setProteinG(e.target.value.replace(/[^\d]/g, ''))
                      }
                      placeholder={String(auto.proteinAuto)}
                      className="h-12 w-32 rounded-xl border border-line bg-surface-2 px-3 text-right text-base tabular-nums text-ink transition-colors focus:border-sky focus:outline-none"
                    />
                    g · 계산으로는 {auto.proteinAuto}g (체중 × {protein.toFixed(1)}g)
                  </label>
                </div>
              </div>

              {/* 하루 지방 직접 정하기 — 단백질과 같은 모양. 탄수화물이 나머지라 따라 움직인다 */}
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink transition-colors hover:border-sky-soft">
                <span className="min-w-0 flex-1">하루 지방을 직접 정하기</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={fatManual}
                  onChange={(e) => {
                    setFatManual(e.target.checked);
                    if (e.target.checked && fatG.trim() === '') {
                      setFatG(
                        String(Math.min(FAT_G_MAX, Math.max(FAT_G_MIN, auto.fatAuto)))
                      );
                    }
                  }}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors duration-200 peer-checked:bg-sky peer-focus-visible:ring-2 peer-focus-visible:ring-sky peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-[cubic-bezier(0.22,1,0.36,1)] peer-checked:after:translate-x-5"
                />
              </label>
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                  fatManual ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="min-h-0 overflow-hidden" inert={!fatManual}>
                  <label className="flex flex-wrap items-center gap-2 pt-2 text-sm text-muted">
                    <input
                      inputMode="numeric"
                      value={fatG}
                      onChange={(e) => setFatG(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder={String(auto.fatAuto)}
                      className="h-12 w-32 rounded-xl border border-line bg-surface-2 px-3 text-right text-base tabular-nums text-ink transition-colors focus:border-sky focus:outline-none"
                    />
                    g · 계산으로는 {auto.fatAuto}g (하루 칼로리의{' '}
                    {Math.round(auto.fatShare * 100)}%)
                  </label>
                </div>
              </div>
            </div>

            <section className="space-y-2 rounded-2xl bg-surface-2 p-4">
              <h3 className="text-xs font-semibold text-muted">
                이렇게 먹어요 (운동 없는 날)
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums sm:grid-cols-4">
                <Stat
                  label="하루 칼로리"
                  value={`${kcalText(preview.base)}kcal`}
                  strong
                />
                <Stat label="단백질" value={`${preview.protein}g`} />
                <Stat label="탄수화물" value={`${preview.carbs}g`} />
                <Stat label="지방" value={`${preview.fat}g`} />
              </dl>
              <MacroBar
                carbs={preview.carbs}
                protein={preview.protein}
                fat={preview.fat}
                compact
              />
              {/* 끼니별 단백질(lib/nutrition/meal-protein.ts) — 끼니 칸의 '단백질 18 / 35g' 이 어디서 왔는지 여기서 말한다 */}
              <p className="text-xs text-muted">
                단백질은 세 끼에 {mealProteinGoal(preview.protein, preview.ageBand)}g
                쯤씩 나눠 먹어요. 몰아 먹는 것보다 근육에 잘 쓰여요.
              </p>
              {/* 체중 카드에서 받아들인 조정 — 얹혀 있으면 말하고, 저장으로 사라지면 그것도 말한다 */}
              {preview.adjust !== 0 ? (
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  체중 흐름 조정 {signed(preview.adjust)}kcal 포함
                  <button
                    type="button"
                    onClick={() => setCleared(true)}
                    className="-my-2 min-h-10 rounded-md px-1 font-semibold text-sky-strong underline-offset-2 hover:underline"
                  >
                    조정 지우기
                  </button>
                </p>
              ) : (
                savedAdjust !== 0 && (
                  <p className="motion-safe:animate-fade-in text-xs text-muted">
                    저장하면 체중 흐름 조정 {signed(savedAdjust)}kcal은 0으로 돌아가요.
                  </p>
                )
              )}
              <p className="text-xs leading-relaxed text-muted">
                {showPlan && body.age !== null && !manual && (
                  <>
                    숫자는 처음엔 어림잡은 값이에요. 체중 흐름을 보고 맞춰 가요.
                    <br />
                  </>
                )}
                기초대사량 {kcalText(preview.bmr)}kcal ({rule.bmrName}) · 활동대사량{' '}
                {kcalText(preview.tdee)}kcal (×{' '}
                {ACTIVITIES.find((a) => a.key === activity)?.factor ?? 1.5})
                <br />
                나이 기준: {rule.label}
                {rule.band !== 'adult' && ' · 자라는 몸에 맞춰 셈해요'}
                <br />
                계산에 쓴 몸: {bodyLine}
                {assumed.length > 0 && '. 내 정보에서 채우면 더 정확해져요.'}
                <br />
                성별·키·몸무게·생년월일은 내 정보(오른쪽 위 내 사진)에서 바꿔요.
              </p>
            </section>
          </div>
        ) : (
          <DietPanel draft={diet} onChange={setDiet} minor={rule.band !== 'adult'} />
        )}

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
          className="min-h-12 w-full rounded-xl bg-sky py-3.5 text-base font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-60"
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
  hintTone = 'muted',
  children,
}: {
  label: string;
  hint?: string;
  hintTone?: 'muted' | 'danger';
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      {children}
      {hint && (
        <p
          className={`text-xs ${hintTone === 'danger' ? 'text-danger' : 'text-muted'}`}
        >
          {hint}
        </p>
      )}
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

type SheetTab = 'goal' | 'diet';

type DietDraft = {
  style: DietStyle;
  pattern: MealPattern;
  avoid: AvoidKey[];
  supplements: boolean;
};

/**
 * [식단 취향] 칸 — 식단 짜기가 이대로 짠다. 칼로리 · 단백질 숫자는 바꾸지 않는다(그건 [목표] 칸).
 * 성장기 · 어린이는 보충식품을 식단에 넣지 않는다(음식으로 채운다 — 던지는 날 가이드와 같은 말).
 */
function DietPanel({
  draft,
  onChange,
  minor,
}: {
  draft: DietDraft;
  onChange: (next: DietDraft) => void;
  minor: boolean;
}) {
  const set = (patch: Partial<DietDraft>) => onChange({ ...draft, ...patch });
  const style = DIET_STYLES.find((x) => x.key === draft.style);
  return (
    <div key="diet" role="tabpanel" className="motion-safe:animate-fade-in space-y-6">
      <p className="text-xs leading-relaxed text-muted">
        &lsquo;오늘 식단 짜기&rsquo;가 여기 정한 대로 끼니를 짜요. 칼로리 · 단백질은
        [목표] 칸에서 정해요.
      </p>

      <Row label="식단 스타일" hint={style?.hint}>
        <ChoiceChips
          label="식단 스타일"
          options={DIET_STYLES.map((x) => ({ value: x.key, label: x.label }))}
          value={draft.style}
          onChange={(v) => set({ style: v as DietStyle })}
        />
      </Row>

      <Row label="끼니 구성">
        <ChoiceChips
          label="끼니 구성"
          options={MEAL_PATTERNS.map((x) => ({ value: x.key, label: x.label }))}
          value={draft.pattern}
          onChange={(v) => set({ pattern: v as MealPattern })}
        />
      </Row>

      <Row
        label="못 먹거나 안 먹는 것 (여럿 고를 수 있어요)"
        hint={
          draft.avoid.length > 0
            ? '고른 것이 든 음식은 빼고 다른 것으로 바꿔 짜요.'
            : '알레르기 · 종교 · 입맛으로 안 먹는 것을 고르세요.'
        }
      >
        <ChoiceChips
          label="못 먹는 것"
          multiple
          options={AVOIDS.map((x) => ({ value: x.key, label: x.label }))}
          value={draft.avoid}
          onChange={(v) =>
            set({
              avoid: draft.avoid.includes(v as AvoidKey)
                ? draft.avoid.filter((a) => a !== v)
                : [...draft.avoid, v as AvoidKey],
            })
          }
        />
      </Row>

      <div className="space-y-2">
        <label
          className={`flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink transition-colors ${
            minor ? 'opacity-60' : 'cursor-pointer hover:border-sky-soft'
          }`}
        >
          <span className="min-w-0 flex-1">단백질 쉐이크 · 바도 넣기</span>
          <input
            type="checkbox"
            role="switch"
            checked={draft.supplements && !minor}
            disabled={minor}
            onChange={(e) => set({ supplements: e.target.checked })}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors duration-200 peer-checked:bg-sky peer-focus-visible:ring-2 peer-focus-visible:ring-sky peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-[cubic-bezier(0.22,1,0.36,1)] peer-checked:after:translate-x-5"
          />
        </label>
        <p className="text-xs text-muted">
          {minor
            ? '성장기에는 보충식품 없이 음식으로 채워요.'
            : '끄면 고기 · 달걀 · 유제품 같은 음식만으로 짜요.'}
        </p>
      </div>
    </div>
  );
}

/**
 * 고르는 칩 — 공용 칩(components/choice-inputs.tsx)과 같은 모양이되 값을 이 창이 쥔다(그쪽은 폼이 쥐는 칩이다).
 * 휴대폰은 알약, PC 는 네모 칩. 하나만 고르면 라디오, 여럿이면 체크 상자 — 화면 읽기에 그대로 읽힌다.
 */
function ChoiceChips({
  label,
  options,
  value,
  onChange,
  multiple = false,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string | readonly string[];
  onChange: (value: string) => void;
  multiple?: boolean;
}) {
  const on = (v: string) =>
    multiple ? (value as readonly string[]).includes(v) : value === v;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className="inline-flex">
          <input
            type={multiple ? 'checkbox' : 'radio'}
            name={multiple ? undefined : label}
            checked={on(o.value)}
            /* 라디오는 고른 칸을 다시 눌러도 onChange 가 안 온다 — 시즌 단계의 '한 번 더 누르면 풀림'을 위해 click 도 본다 */
            onChange={() => onChange(o.value)}
            onClick={() => !multiple && on(o.value) && onChange(o.value)}
            className="peer sr-only"
          />
          <span className="flex min-h-10 cursor-pointer select-none items-center gap-1.5 rounded-full border border-transparent bg-ink/6 px-3.5 text-sm text-ink/80 transition-colors peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:font-semibold peer-checked:text-sky peer-focus-visible:ring-1 peer-focus-visible:ring-sky desk:min-h-9 desk:rounded-lg desk:border-line desk:bg-surface-2 desk:px-3 desk:text-xs desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink desk:peer-checked:font-medium">
            {multiple && on(o.value) && (
              <Check
                aria-hidden
                className="motion-safe:animate-fade-in h-3.5 w-3.5"
                strokeWidth={2.6}
              />
            )}
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}
