'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateProfile, type ProfileState } from '@/app/actions/profile';
import { Button, Field, FormError, Input } from '@/components/ui';
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from '@/lib/profile';

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
  /** 오늘 날짜(YYYY-MM-DD). 미래 날짜를 못 고르게 막는 데 쓴다. */
  today,
}: {
  nickname: string;
  birthDate: string;
  heightCm: number | null;
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
        <p className="rounded-lg border border-gold-dim/60 bg-gold/10 px-4 py-3 text-sm text-gold">
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

      <SubmitButton />
    </form>
  );
}
