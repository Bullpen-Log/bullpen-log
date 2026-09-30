'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Modal } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import { useWeightUnit } from '@/components/use-units';
import { fromWeight, round1, toWeight, type WeightUnit } from '@/lib/units';
import {
  ACTIVITIES,
  GOALS,
  SEXES,
  kcalText,
  type ActivityKey,
  type GoalKey,
} from '@/lib/nutrition/meta';
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
import { saveNutritionProfile } from '@/app/actions/nutrition';
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
 * 속도는 하루 칼로리를 움직이고, 둘 다 체중 카드가 체중 흐름과 견주는 계획이 된다.
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
const kgText = (kg: number, unit: WeightUnit) => `${round1(toWeight(kg, unit))}${unit}`;
const rateText = (kg: number, unit: WeightUnit) =>
  `주 ${unit === 'kg' ? kg : round1(toWeight(kg, unit))}${unit}`;

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
  const unit = useWeightUnit();
  /*
   * 나이에 맞춘 기준(lib/nutrition/age.ts) — 18세 밑은 단백질 범위가 낮고, 감량이
   * 작거나(성장기) 없다(어린이). 저장된 값이 그 밖이면 범위 안의 값으로 연다.
   */
  const rule = ageRule(body.age);
  const savedGoal = effectiveGoal(profile.goal, body.age);
  const [goal, setGoalState] = useState<GoalKey>(savedGoal);
  const [activity, setActivity] = useState<ActivityKey>(profile.activity);
  const [protein, setProtein] = useState(() =>
    effectiveProtein(profile.proteinPerKg, body.age)
  );
  const goals = GOALS.filter((g) => rule.goalDelta[g.key] !== null);
  const [lo, hi] = [rule.proteinChoices[0], rule.proteinChoices.at(-1)];
  const [manual, setManual] = useState(profile.kcalTarget !== null);
  const [kcal, setKcal] = useState(
    profile.kcalTarget ? String(profile.kcalTarget) : ''
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

  /* 목표를 바꾸면 속도는 그 목표의 기본으로, 목표 체중은 비운다(증량의 82kg 은 감량의 목표가 아니다) */
  function setGoal(next: GoalKey) {
    /* 이미 고른 칸을 다시 누른 것 — 고른 속도와 적던 목표 체중을 지우지 않는다 */
    if (next === goal) return;
    setGoalState(next);
    setRate(next === savedGoal ? profile.weeklyRateKg : null);
    setTargetText(next === savedGoal ? targetShown(savedTarget) : '');
  }

  const kcalNum = Number(kcal);
  const kcalTarget =
    manual && kcal.trim() !== '' && Number.isFinite(kcalNum) ? kcalNum : null;

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
    targetWeightKg: targetSave,
    weeklyRateKg: pickedRate,
    kcalAdjust: planned.kcalAdjust,
    planSince: profile.planSince,
  } satisfies ProfileSettings;
  const preview = computeTargets(draft, body, 0);
  const auto = computeTargets({ ...draft, kcalTarget: null }, body, 0);
  /* 지금 얹혀 있는 조정(나이 한도로 당긴 값) — 저장하면 사라지는지 알리려고 */
  const savedAdjust = computeTargets(profile, body, 0).adjust;

  function save() {
    setError(null);
    if (manual && kcalTarget === null) {
      setError('하루 칼로리를 숫자로 적어 주세요.');
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
    body.sex
      ? SEXES.find((s) => s.key === body.sex)?.label
      : '성별 모름(남녀 가운데 값)',
  ].join(' · ');

  /* ── 속도 줄의 글 ── */
  const paceLine = `${rateText(pickedRate ?? 0, unit)}${
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="영양 목표"
      description="고르면 바로 아래 숫자가 바뀌어요. 운동한 날은 쓴 만큼 더해져요."
      origin={origin}
    >
      <div className="space-y-6">
        <div>
          <Row
            label="목표"
            hint={
              rule.band === 'child'
                ? `${rule.goalHint[goal]} · ${rule.goalHint.lose}`
                : rule.goalHint[goal]
            }
          >
            <Segmented
              label="목표"
              size="md"
              itemClassName={BIG}
              value={goal}
              onChange={setGoal}
              options={goals.map((g) => ({ value: g.key, label: g.label }))}
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
                          label: rateText(kg, unit),
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
                            setTargetText(e.target.value.replace(/[^\d.]/g, ''))
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

        {/*
          성별은 여기서 고르지 않는다 — 계정에 있다(가입할 때 고르고 내 정보에서
          바꾼다). 아래 '계산에 쓴 몸' 줄에 무엇으로 셈했는지만 보여 준다.
        */}
        <Row
          label="단백질 (체중 1kg 당)"
          hint={
            rule.band === 'adult'
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
            기초대사량 {kcalText(preview.bmr)}kcal ({rule.bmrName})
            <br />
            나이 기준: {rule.label}
            {rule.band !== 'adult' && ' — 자라는 몸에 맞춰 셈해요'}
            <br />
            계산에 쓴 몸: {bodyLine}
            {assumed.length > 0 && ' — 내 정보에서 채우면 더 정확해져요.'}
            <br />
            성별·키·몸무게·생년월일은 내 정보(오른쪽 위 내 사진)에서 바꿔요.
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
