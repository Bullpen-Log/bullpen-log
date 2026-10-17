'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createInquiry, type SupportState } from '@/app/actions/support';
import { guardFormAction } from '@/lib/action-offline';
import { kept } from '@/lib/form-values';
import { INQUIRY_BODY_MAX, INQUIRY_CATEGORIES, INQUIRY_TITLE_MAX } from '@/lib/support';
import { RadioGroup } from '@/components/choice-inputs';
import { Button, ButtonLink, Field, FormError, Input, Textarea } from '@/components/ui';

const CATEGORY_OPTIONS = INQUIRY_CATEGORIES.map((c) => ({
  name: c.label,
  value: c.key,
}));

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '보내는 중…' : '문의 보내기'}
    </Button>
  );
}

/** 1:1 문의 쓰기 — 종류(칩) · 제목 · 내용. 보내면 그 문의의 대화 화면으로 간다. */
export function SupportInquiryForm() {
  const [state, formAction] = useActionState<SupportState, FormData>(
    /* 신호가 끊겨도 오류 화면으로 넘어가지 않고 한 줄로 알린다(lib/action-offline.ts) */
    guardFormAction(createInquiry),
    undefined
  );

  // 오류로 되돌아왔을 때 쓰던 글을 그대로 되살린다.
  const before = state?.values;

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-2xl border border-line bg-surface p-(--block-pad)"
    >
      <FormError>{state?.error}</FormError>

      <RadioGroup
        name="category"
        label="어떤 문의인가요?"
        options={CATEGORY_OPTIONS}
        selected={kept(before, 'category')}
        required
        compact
      />

      <Field label="제목">
        <Input
          name="title"
          defaultValue={kept(before, 'title')}
          maxLength={INQUIRY_TITLE_MAX}
          placeholder="한 줄로 요약해 주세요"
          required
        />
      </Field>

      <Field
        label="내용"
        hint={`무슨 화면에서 무엇을 했을 때 어땠는지 적어 주시면 더 빨리 도울 수 있어요. ${INQUIRY_BODY_MAX}자까지.`}
      >
        <Textarea
          name="body"
          rows={10}
          defaultValue={kept(before, 'body')}
          maxLength={INQUIRY_BODY_MAX}
          placeholder="예) 투구 기록을 저장하면 화면이 멈춰요. 아이폰 앱이고, 어제부터 그래요."
          required
        />
      </Field>

      <div className="flex gap-3">
        <SubmitButton />
        <ButtonLink href="/support" variant="secondary">
          취소
        </ButtonLink>
      </div>
    </form>
  );
}
