'use client';

import Link from 'next/link';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateProfile, type ProfileState } from '@/app/actions/profile';
import { Button, Field, FormError, Input } from '@/components/ui';
import { kept } from '@/lib/form-values';
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from '@/lib/profile';
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

export function ProfileForm({
  nickname,
  birthDate,
  heightCm,
  targetVelocity,
  dailyWorkoutMinutes,
  baseline,
  /** 오늘 날짜(YYYY-MM-DD). 미래 날짜를 못 고르게 막는 데 쓴다. */
  today,
}: {
  nickname: string;
  birthDate: string;
  heightCm: number | null;
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
    before ? kept(before, name) ?? '' : fallback == null ? '' : String(fallback);

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

      {/* 하루 운동 시간 — 트레이닝 화면이 이 시간에 맞춰 종목 수를 정한다. */}
      <RadioGroup
        name="dailyWorkoutMinutes"
        label="하루 운동 시간"
        hint="트레이닝 화면이 이 시간에 맞춰 운동 개수를 정합니다. 몸 상태가 안 좋은 날은 자동으로 줄어듭니다."
        options={WORKOUT_MINUTES_CHOICES.map((m) => ({ name: `${m}분` }))}
        selected={pick(
          'dailyWorkoutMinutes',
          `${dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES}분`
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
