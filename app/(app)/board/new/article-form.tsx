'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createArticle, type BoardState } from '@/app/actions/board';
import { Button, ButtonLink, Field, FormError, Input, Textarea } from '@/components/ui';
import { kept } from '@/lib/form-values';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '등록 중…' : '등록하기'}
    </Button>
  );
}

export function ArticleForm() {
  const [state, formAction] = useActionState<BoardState, FormData>(
    createArticle,
    undefined
  );

  // 오류로 되돌아왔을 때 쓰던 글을 그대로 되살린다.
  const before = state?.values;

  return (
    <form action={formAction} className="space-y-6 rounded-2xl border border-line bg-surface p-8">
      <FormError>{state?.error}</FormError>

      <Field label="제목">
        <Input
          name="title"
          defaultValue={kept(before, 'title')}
          placeholder="투구 시 어깨 외회전 각도와 구속의 상관관계"
          required
        />
      </Field>

      <Field label="태그" hint="쉼표로 구분해 최대 5개까지 입력할 수 있습니다.">
        <Input
          name="tags"
          defaultValue={kept(before, 'tags')}
          placeholder="어깨, 바이오메카닉스, 회복"
        />
      </Field>

      <Field label="자료 링크 (선택)" hint="원문이나 참고 페이지 주소를 넣어주세요.">
        <Input
          name="attachmentUrl"
          type="url"
          defaultValue={kept(before, 'attachmentUrl')}
          placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
        />
      </Field>

      <Field label="내용">
        <Textarea
          name="content"
          rows={14}
          defaultValue={kept(before, 'content')}
          placeholder="자료의 핵심 내용과 느낀 점을 정리해보세요."
          required
        />
      </Field>

      <div className="flex gap-3">
        <SubmitButton />
        <ButtonLink href="/board" variant="secondary">
          취소
        </ButtonLink>
      </div>
    </form>
  );
}
