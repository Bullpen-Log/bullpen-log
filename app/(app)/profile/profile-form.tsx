'use client';

import Link from 'next/link';

import { useActionState, useState, useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';
import { updateProfile, type ProfileState } from '@/app/actions/profile';
import { Button, Field, FormError, Input } from '@/components/ui';
import { kept } from '@/lib/form-values';
import {
  fromLength,
  fromSpeed,
  fromWeight,
  readLengthUnit,
  readSpeedUnit,
  readWeightUnit,
  round1,
  serverLengthUnit,
  serverSpeedUnit,
  serverWeightUnit,
  speedLabel,
  subscribeUnits,
  toLength,
  toSpeed,
  toWeight,
} from '@/lib/units';
import {
  MAX_HEIGHT_CM,
  MAX_WEIGHT_KG,
  MAX_WINGSPAN_CM,
  MIN_HEIGHT_CM,
  MIN_WEIGHT_KG,
  MIN_WINGSPAN_CM,
} from '@/lib/profile';
import { TARGET_VELOCITY_MAX, TARGET_VELOCITY_MIN } from '@/lib/velocity';
import { RadioGroup } from '@/components/choice-inputs';
import {
  BASELINE_FREQ_NAMES,
  BASELINE_INTENSITY_NAMES,
  BASELINE_VOLUME_NAMES,
  BASELINE_WORKOUT_FREQ_NAMES,
  COMPETITION_LEVELS,
  THROWING_HANDS,
} from '@/lib/baseline';
import {
  DEFAULT_WORKOUT_MINUTES,
  nearestMinutesChoice,
  WORKOUT_MINUTES_CHOICES,
} from '@/lib/report/theme';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '저장 중…' : '저장'}
    </Button>
  );
}

/**
 * 몸 치수 한 칸 — 고른 단위로 보여주고, 저장은 늘 기본 단위로 한다.
 *
 * 눈에 보이는 칸은 고른 단위(inch·lb)이고, 서버로는 숨겨 둔 칸이 언제나
 * cm·kg 을 보낸다. DB 에 단위가 섞이면 나중에 어느 줄이 인치인지 알 수 없게
 * 되고, 영상에서 잰 길이와 견줄 때도 매번 물어봐야 한다.
 *
 * 단위를 바꾸면 적어 둔 값도 같이 환산해 보여준다. 숫자를 그대로 두고 단위만
 * 바꾸면 180cm 가 180inch(4.6m)가 되어 버린다.
 *
 * 키·몸무게·윙스팬이 하는 일이 같아 한 부품으로 둔다. 다른 것은 어느 단위를
 * 따르는지와 범위뿐이다.
 */
function BodyField({
  name,
  label,
  hint,
  base,
  kind,
  min,
  max,
  placeholder,
}: {
  /** 서버로 보낼 칸 이름 — 값은 언제나 cm 또는 kg */
  name: string;
  label: string;
  hint?: string;
  /** 저장된 값 (cm 또는 kg) */
  base: string;
  /** 어느 단위를 따르는가 */
  kind: 'length' | 'weight';
  /** 저장 단위 기준 범위 */
  min: number;
  max: number;
  /** 기본 단위일 때 보여줄 예시 */
  placeholder: string;
}) {
  const lengthUnit = useSyncExternalStore(
    subscribeUnits,
    readLengthUnit,
    serverLengthUnit
  );
  const weightUnit = useSyncExternalStore(
    subscribeUnits,
    readWeightUnit,
    serverWeightUnit
  );
  const [stored, setStored] = useState(base);

  const isLength = kind === 'length';
  const unit = isLength ? lengthUnit : weightUnit;
  const swapped = isLength ? lengthUnit === 'in' : weightUnit === 'lb';
  const to = (n: number) => (isLength ? toLength(n, lengthUnit) : toWeight(n, weightUnit));
  const from = (n: number) =>
    isLength ? fromLength(n, lengthUnit) : fromWeight(n, weightUnit);

  const shown = stored === '' ? '' : String(round1(to(Number(stored))));

  return (
    <Field label={`${label} (${unit === 'in' ? 'inch' : unit})`} hint={hint}>
      <Input
        type="number"
        inputMode="decimal"
        value={shown}
        onChange={(e) => {
          const v = e.target.value;
          setStored(v === '' ? '' : String(round1(from(Number(v)))));
        }}
        min={round1(to(min))}
        max={round1(to(max))}
        step={0.5}
        placeholder={swapped ? String(Math.round(to(Number(placeholder)))) : placeholder}
      />
      {/* 서버로 가는 값은 언제나 cm · kg */}
      <input type="hidden" name={name} value={stored} />
    </Field>
  );
}

/**
 * 목표 구속 — 고른 단위로 보여주고 저장은 늘 km/h 로 한다.
 *
 * 몸 치수와 따로 둔 이유는 단위가 다르기 때문이다(길이도 무게도 아니다).
 *
 * 소수 한 자리를 남긴다. 단위를 바꾸면 딱 떨어지던 값이 소수가 되는데, 정수로
 * 반올림하면 되돌렸을 때 적은 적 없는 숫자가 된다 — 145km/h 가 90mph 를 거쳐
 * 144.8km/h 로 돌아온다.
 */
function TargetVelocityField({ base }: { base: string }) {
  const unit = useSyncExternalStore(subscribeUnits, readSpeedUnit, serverSpeedUnit);
  const [kmh, setKmh] = useState(base);

  const shown = kmh === '' ? '' : String(round1(toSpeed(Number(kmh), unit)));

  return (
    <Field
      label={`목표 구속 (${speedLabel(unit)})`}
      hint="선택 입력. 비워두면 목표를 지웁니다."
    >
      <Input
        type="number"
        inputMode="decimal"
        value={shown}
        onChange={(e) => {
          const v = e.target.value;
          /*
           * 담아 두는 값은 정수 km/h 다. 이 칸은 Int 로 저장되고 서버도 정수만
           * 받는다(lib/velocity.ts) — 소수를 그대로 보내면 저장이 막힌다.
           *
           * 보여줄 때만 소수를 남긴다. mph 로 보면 90.1 처럼 떨어지지 않는 것이
           * 정상이고, 그것을 반올림해 버리면 목표가 슬금슬금 달라진다.
           */
          setKmh(v === '' ? '' : String(Math.round(fromSpeed(Number(v), unit))));
        }}
        min={round1(toSpeed(TARGET_VELOCITY_MIN, unit))}
        max={round1(toSpeed(TARGET_VELOCITY_MAX, unit))}
        step={0.1}
        placeholder={unit === 'mph' ? '87' : '140'}
      />
      {/* 서버로 가는 값은 언제나 km/h */}
      <input type="hidden" name="targetVelocity" value={kmh} />
    </Field>
  );
}

export function ProfileForm({
  nickname,
  birthDate,
  heightCm,
  weightKg,
  wingspanCm,
  targetVelocity,
  dailyWorkoutMinutes,
  baseline,
  /** 오늘 날짜(YYYY-MM-DD). 미래 날짜를 못 고르게 막는 데 쓴다. */
  today,
}: {
  nickname: string;
  birthDate: string;
  heightCm: number | null;
  weightKg: number | null;
  wingspanCm: number | null;
  targetVelocity: number | null;
  dailyWorkoutMinutes: number | null;
  baseline: {
    baselineFreq: string | null;
    baselineVolume: string | null;
    baselineIntensity: string | null;
    baselineWorkoutFreq: string | null;
    throwingHand: string | null;
    competitionLevel: string | null;
  };
  today: string;
}) {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    updateProfile,
    undefined
  );

  /*
   * 오류로 되돌아왔을 때 고치던 내용을 그대로 다시 보여준다.
   * 저장 전 값으로 되돌아가면 방금 고친 것이 사라져버린다.
   */
  const before = state?.values;
  const pick = (name: string, fallback: string | number | null) =>
    before ? (kept(before, name) ?? '') : fallback == null ? '' : String(fallback);

  return (
    <form action={formAction} className="space-y-5">
      <FormError>{state?.error}</FormError>

      {state?.success && (
        <p className="rounded-lg border border-sky-soft/60 bg-sky/10 px-4 py-3 text-sm text-sky">
          {state.success}
        </p>
      )}

      {/*
        네 칸을 두 줄로 눕힌다.

        예전에는 한 줄에 하나씩 세로로 쌓여 있었다. 닉네임 칸이 화면 폭을 다
        쓰는데 정작 들어가는 것은 두세 글자고, 키와 목표 구속도 세 자리 숫자가
        전부였다. 창으로 옮기면서 그 빈 폭이 그대로 스크롤 길이가 됐다.
      */}
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        <Field label="닉네임">
          <Input
            name="nickname"
            type="text"
            defaultValue={pick('nickname', nickname)}
            autoComplete="nickname"
            minLength={2}
            required
          />
        </Field>

        <Field label="생년월일" hint="나이에 따라 안전한 투구수 한도가 달라집니다.">
          <Input
            name="birthDate"
            type="date"
            defaultValue={pick('birthDate', birthDate)}
            max={today}
            required
          />
        </Field>

        <BodyField
          name="heightCm"
          label="키"
          hint="영상에서 잰 보폭을 몸 크기로 견줄 때 씁니다."
          base={pick('heightCm', heightCm)}
          kind="length"
          min={MIN_HEIGHT_CM}
          max={MAX_HEIGHT_CM}
          placeholder="180"
        />

        <BodyField
          name="weightKg"
          label="몸무게"
          base={pick('weightKg', weightKg)}
          kind="weight"
          min={MIN_WEIGHT_KG}
          max={MAX_WEIGHT_KG}
          placeholder="75"
        />

        <BodyField
          name="wingspanCm"
          label="윙스팬"
          hint="양팔을 벌린 길이. 보통 키와 비슷하거나 조금 깁니다."
          base={pick('wingspanCm', wingspanCm)}
          kind="length"
          min={MIN_WINGSPAN_CM}
          max={MAX_WINGSPAN_CM}
          placeholder="185"
        />

        <TargetVelocityField base={pick('targetVelocity', targetVelocity)} />
      </div>

      {/* 하루 운동 시간 — 트레이닝 화면이 이 시간에 맞춰 종목 수를 정한다. */}
      <RadioGroup
        name="dailyWorkoutMinutes"
        label="하루 운동 시간"
        hint="트레이닝 화면이 이 시간에 맞춰 운동 개수를 정합니다. 몸 상태가 안 좋은 날은 자동으로 줄어듭니다."
        options={WORKOUT_MINUTES_CHOICES.map((m) => ({ name: `${m}분` }))}
        selected={pick(
          'dailyWorkoutMinutes',
          // 예전에 고를 수 있던 15·20·30분이 저장돼 있으면 짝이 없어 아무것도
          // 안 골라진 채로 뜬다. 가장 가까운 값을 짚어준다.
          `${nearestMinutesChoice(dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES)}분`
        )}
        compact
      />

      {/*
        경력·목표·장비는 트레이닝 화면에서 고른다.
        결과를 보면서 바로 고칠 수 있어야 해서 그쪽으로 옮겼다.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-5">
        <p className="text-sm text-muted">
          웨이트 경력 · 훈련 목표 · 가지고 있는 장비는{' '}
          <strong className="text-ink">트레이닝</strong> 화면에서 고릅니다.
        </p>
        <Link
          href="/today"
          className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
        >
          트레이닝으로 가기
        </Link>
      </div>

      {/* 평소 투구량 문진 — 부하 지수의 추정 기준선. 3개 모두 답해야 저장된다. */}
      <div className="space-y-4 border-t border-line pt-5">
        <p className="text-sm font-semibold text-ink">
          평소 얼마나 던지시나요?
          <span className="mt-1 block text-xs font-normal text-muted">
            이 답으로 부하 지수를 기록 첫날부터 계산합니다. 상황이 바뀌면 언제든 고칠 수
            있습니다.
          </span>
        </p>
        <RadioGroup
          name="baselineFreq"
          label="던지는 횟수"
          options={BASELINE_FREQ_NAMES.map((name) => ({ name }))}
          selected={pick('baselineFreq', baseline.baselineFreq)}
        />
        <RadioGroup
          name="baselineVolume"
          label="한 번에 던지는 양"
          options={BASELINE_VOLUME_NAMES.map((name) => ({ name }))}
          selected={pick('baselineVolume', baseline.baselineVolume)}
        />
        <RadioGroup
          name="baselineIntensity"
          label="평소 강도"
          options={BASELINE_INTENSITY_NAMES.map((name) => ({ name }))}
          selected={pick('baselineIntensity', baseline.baselineIntensity)}
        />
      </div>

      {/*
        웨이트 빈도 — 운동 부하 지수의 기준선. 투구와 같은 이유로 받는다.
        이게 없으면 운동 지수만 28일을 기다려야 해서 앞뒤가 안 맞는다.
      */}
      <div className="space-y-4 border-t border-line pt-5">
        <p className="text-sm font-semibold text-ink">
          평소 웨이트는 얼마나 하시나요?
          <span className="mt-1 block text-xs font-normal text-muted">
            이 답으로 운동 부하 지수를 기록 첫날부터 계산합니다.
          </span>
        </p>
        <RadioGroup
          name="baselineWorkoutFreq"
          label="웨이트 횟수"
          options={BASELINE_WORKOUT_FREQ_NAMES.map((name) => ({ name }))}
          selected={pick('baselineWorkoutFreq', baseline.baselineWorkoutFreq)}
        />
      </div>

      <div className="space-y-4 border-t border-line pt-5">
        <RadioGroup
          name="throwingHand"
          label="던지는 손"
          hint="투구폼 분석에서 어느 팔을 볼지 정합니다."
          options={THROWING_HANDS.map((name) => ({ name }))}
          selected={pick('throwingHand', baseline.throwingHand)}
        />
        {/*
          수준은 지금 아무 계산에도 안 쓴다 — 나이는 생년월일로 이미 알고
          안전 한도도 거기서 나온다. 그 사실을 숨기지 않고 적어 둔다.
        */}
        <RadioGroup
          name="competitionLevel"
          label="어디서 야구를 하시나요"
          hint="훈련 내용을 바꾸는 값이 아닙니다. 나중에 비슷한 또래와 견줘 보여드리려고 여쭙습니다. 안 고르셔도 됩니다."
          options={COMPETITION_LEVELS.map((name) => ({ name }))}
          selected={pick('competitionLevel', baseline.competitionLevel)}
        />
      </div>

      <SubmitButton />
    </form>
  );
}
