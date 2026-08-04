'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateProfile, type ProfileState } from '@/app/actions/profile';
import { Button, Field, FormError, Input } from '@/components/ui';
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from '@/lib/profile';
import { RadioGroup } from '@/components/choice-inputs';
import {
  BASELINE_FREQ_NAMES,
  BASELINE_INTENSITY_NAMES,
  BASELINE_VOLUME_NAMES,
} from '@/lib/baseline';

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
  baseline,
  /** 오늘 날짜(YYYY-MM-DD). 미래 날짜를 못 고르게 막는 데 쓴다. */
  today,
}: {
  nickname: string;
  birthDate: string;
  heightCm: number | null;
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
          defaultValue={nickname}
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
          defaultValue={birthDate}
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
          defaultValue={heightCm ?? ''}
          min={MIN_HEIGHT_CM}
          max={MAX_HEIGHT_CM}
          step={1}
          placeholder="180"
        />
      </Field>

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
          selected={baseline.baselineFreq}
        />
        <RadioGroup
          name="baselineVolume"
          label="한 번에 던지는 양"
          options={BASELINE_VOLUME_NAMES.map((name) => ({ name }))}
          selected={baseline.baselineVolume}
        />
        <RadioGroup
          name="baselineIntensity"
          label="평소 강도"
          options={BASELINE_INTENSITY_NAMES.map((name) => ({ name }))}
          selected={baseline.baselineIntensity}
        />
      </div>

      <SubmitButton />
    </form>
  );
}
