'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { createExercise, type ActionState } from '@/app/actions/content';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import {
  BODY_PARTS,
  DIFFICULTY_LEVELS,
  EXERCISE_EQUIPMENT,
  INTENSITY_LEVELS,
} from '@/lib/exercise-meta';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? '등록 중…' : '운동 영상 등록'}
    </Button>
  );
}

export function ExerciseForm({ category }: { category: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createExercise,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  // 등록에 성공하면 폼을 비워 다음 항목을 바로 입력할 수 있게 한다.
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="category" value={category} />

      <FormError>{state?.error}</FormError>
      {state?.success && (
        <p className="rounded-lg border border-gold-dim/50 bg-gold/10 px-4 py-3 text-sm text-gold-bright">
          {state.success}
        </p>
      )}

      <Field label={`운동 이름 — ${category}`}>
        <Input name="title" placeholder="트랩바 데드리프트" required />
      </Field>

      <Field label="유튜브 영상 링크" hint="유튜브 주소를 그대로 붙여넣으면 됩니다.">
        <Input name="videoUrl" placeholder="https://youtu.be/영상ID" required />
      </Field>

      <Field label="설명">
        <Textarea
          name="description"
          rows={4}
          placeholder="허리를 중립으로 유지하고 고관절을 접으며 내려갑니다."
          required
        />
      </Field>

      {/* 나중에 몸 상태에 맞는 운동을 코드로 추려내려면 이 항목들이 필요하다. */}
      <div className="space-y-5 border-t border-gold-dim/30 pt-5">
        <CheckboxGroup
          name="bodyParts"
          label="목표 부위 · 필수"
          hint="여러 개 고를 수 있습니다."
          options={BODY_PARTS}
        />

        <RadioGroup
          name="intensity"
          label="운동 강도 · 필수"
          hint="부하가 높은 날 어떤 운동을 뺄지 정하는 기준이 됩니다."
          options={INTENSITY_LEVELS}
          required
        />

        <RadioGroup
          name="difficulty"
          label="난이도"
          options={DIFFICULTY_LEVELS}
        />

        <CheckboxGroup
          name="equipment"
          label="필요 장비"
          options={EXERCISE_EQUIPMENT}
        />
      </div>

      <SubmitButton />
    </form>
  );
}
