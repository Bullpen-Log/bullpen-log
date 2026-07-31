'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { createGuide, type ActionState } from '@/app/actions/content';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? '등록 중…' : '드릴 등록'}
    </Button>
  );
}

export function GuideForm({ category }: { category: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createGuide,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

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

      <Field label={`드릴 이름 — ${category}`}>
        <Input name="title" placeholder="타월 드릴" required />
      </Field>

      <Field label="유튜브 영상 링크" hint="유튜브 주소를 그대로 붙여넣으면 됩니다.">
        <Input name="videoUrl" placeholder="https://youtu.be/영상ID" required />
      </Field>

      <Field label="노출 순서" hint="숫자가 작을수록 위에 표시됩니다. 비워두면 0.">
        <Input name="sortOrder" type="number" placeholder="1" />
      </Field>

      <Field label="설명">
        <Textarea
          name="description"
          rows={4}
          placeholder="앞발이 착지하는 순간까지 상체를 닫아두고, 골반이 먼저 열리도록 합니다."
          required
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
