'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateProfile, type ProfileState } from '@/app/actions/profile';
import { Button, Field, FormError, Input } from '@/components/ui';
import { kept, keptAll } from '@/lib/form-values';
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from '@/lib/profile';
import { TARGET_VELOCITY_MAX, TARGET_VELOCITY_MIN } from '@/lib/velocity';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import {
  BASELINE_FREQ_NAMES,
  BASELINE_INTENSITY_NAMES,
  BASELINE_VOLUME_NAMES,
} from '@/lib/baseline';
import {
  DEFAULT_WORKOUT_MINUTES,
  WORKOUT_MINUTES_CHOICES,
} from '@/lib/report/theme';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { TRAINING_GOALS, TRAINING_LEVELS } from '@/lib/report/personalize';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '저장 중…' : '저장'}
    </Button>
  );
}

export function ProfileForm({
  nickname,
  birthDate,
  heightCm,
  targetVelocity,
  dailyWorkoutMinutes,
  ownedEquipment,
  trainingLevel,
  trainingGoal,
  baseline,
  /** 오늘 날짜(YYYY-MM-DD). 미래 날짜를 못 고르게 막는 데 쓴다. */
  today,
}: {
  nickname: string;
  birthDate: string;
  heightCm: number | null;
  targetVelocity: number | null;
  dailyWorkoutMinutes: number | null;
  /** 가지고 있는 장비. 비어 있으면 아직 안 골랐다는 뜻이다. */
  ownedEquipment: string[];
  trainingLevel: string | null;
  trainingGoal: string | null;
  baseline: {
    baselineFreq: string | null;
    baselineVolume: string | null;
    baselineIntensity: string | null;
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
    before ? kept(before, name) ?? '' : fallback == null ? '' : String(fallback);

  /*
   * 아직 한 번도 안 고른 사람은 전부 켜 둔 채로 보여준다.
   *
   * 빈 목록을 그대로 보여주면, 프로필을 저장하는 순간 "아무 장비도 없음"이
   * 되어 맨몸 운동만 나온다. 프로필을 고치러 들어온 것뿐인데 훈련 내용이
   * 조용히 반토막 나는 셈이라, 없는 것을 직접 끄게 한다.
   */
  const equipmentDefaults =
    ownedEquipment.length > 0 ? ownedEquipment : [...SELECTABLE_EQUIPMENT];
  const equipmentSelected = before
    ? keptAll(before, 'ownedEquipment') ?? []
    : equipmentDefaults;

  return (
    <form action={formAction} className="space-y-5">
      <FormError>{state?.error}</FormError>

      {state?.success && (
        <p className="rounded-lg border border-sky-soft/60 bg-sky/10 px-4 py-3 text-sm text-sky">
          {state.success}
        </p>
      )}

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

      <Field
        label="생년월일"
        hint="나이에 따라 안전한 투구수 한도가 달라져 투구량 조언에 사용됩니다."
      >
        <Input
          name="birthDate"
          type="date"
          defaultValue={pick('birthDate', birthDate)}
          max={today}
          required
        />
      </Field>

      <Field
        label="키 (cm)"
        hint="선택 입력입니다. 영상에서 잰 보폭 등을 몸 크기 기준으로 비교할 때 쓰입니다."
      >
        <Input
          name="heightCm"
          type="number"
          inputMode="numeric"
          defaultValue={pick('heightCm', heightCm)}
          min={MIN_HEIGHT_CM}
          max={MAX_HEIGHT_CM}
          step={1}
          placeholder="180"
        />
      </Field>

      <Field
        label="목표 최고 구속 (km/h)"
        hint="선택 입력입니다. 지금 구속과의 격차를 홈 화면에서 보여드립니다. 비워두면 목표를 지웁니다."
      >
        <Input
          name="targetVelocity"
          type="number"
          inputMode="numeric"
          defaultValue={pick('targetVelocity', targetVelocity)}
          min={TARGET_VELOCITY_MIN}
          max={TARGET_VELOCITY_MAX}
          step={1}
          placeholder="140"
        />
      </Field>

      {/* 하루 운동 시간 — AI 트레이닝이 이 시간에 맞춰 종목 수를 정한다. */}
      <RadioGroup
        name="dailyWorkoutMinutes"
        label="하루 운동 시간"
        hint="AI 트레이닝이 이 시간에 맞춰 운동 개수를 정합니다. 몸 상태가 안 좋은 날은 자동으로 줄어듭니다."
        options={WORKOUT_MINUTES_CHOICES.map((m) => ({ name: `${m}분` }))}
        selected={pick(
          'dailyWorkoutMinutes',
          `${dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES}분`
        )}
      />

      {/*
        경력과 목표 — AI 트레이닝을 사람에 맞추는 두 가지다.
        경력은 어떤 난이도까지 줄지를, 목표는 시간을 어디에 더 쓸지를 정한다.
      */}
      <div className="space-y-4 border-t border-line pt-5">
        <p className="text-sm font-semibold text-ink">
          트레이닝을 어떻게 맞출까요?
          <span className="mt-1 block text-xs font-normal text-muted">
            AI 트레이닝이 이 답으로 운동 난이도와 시간 배분을 정합니다.
          </span>
        </p>
        <RadioGroup
          name="trainingLevel"
          label="웨이트 트레이닝 경력"
          hint="경력에 비해 이른 운동을 빼는 기준입니다. 안 고르면 아무것도 빼지 않습니다."
          options={TRAINING_LEVELS.map((l) => ({ name: l.name, desc: l.desc }))}
          selected={pick('trainingLevel', trainingLevel)}
        />
        <RadioGroup
          name="trainingGoal"
          label="훈련 목표"
          hint="같은 시간을 어디에 더 쓸지 정합니다. 몸 상태가 안 좋은 날에는 목표와 상관없이 회복이 먼저입니다."
          options={TRAINING_GOALS.map((g) => ({ name: g.name, desc: g.desc }))}
          selected={pick('trainingGoal', trainingGoal)}
        />
      </div>

      {/*
        가진 장비 — AI 트레이닝에서 할 수 없는 운동을 뺄 때 쓴다.
        안전 규칙이 아니라 "못 하는 것"을 빼는 것이라 프로필에 둔다.
      */}
      <div className="border-t border-line pt-5">
        <CheckboxGroup
          name="ownedEquipment"
          label="가지고 있는 장비"
          hint="없는 것을 꺼 두면 AI 트레이닝이 그 운동을 빼고 짭니다. 맨몸 운동은 항상 나옵니다."
          options={SELECTABLE_EQUIPMENT}
          selected={equipmentSelected}
        />
      </div>

      {/* 평소 투구량 문진 — 부하 지수의 추정 기준선. 3개 모두 답해야 저장된다. */}
      <div className="space-y-4 border-t border-line pt-5">
        <p className="text-sm font-semibold text-ink">
          평소 얼마나 던지시나요?
          <span className="mt-1 block text-xs font-normal text-muted">
            이 답으로 부하 지수를 기록 첫날부터 계산합니다. 상황이 바뀌면 언제든
            고칠 수 있습니다.
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

      <SubmitButton />
    </form>
  );
}
