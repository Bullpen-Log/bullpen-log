'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createPost, type CommunityState } from '@/app/actions/community';
import { guardFormAction } from '@/lib/action-offline';
import { kept } from '@/lib/form-values';
import { POST_BODY_MAX, POST_CATEGORIES, POST_TITLE_MAX } from '@/lib/community';
import { Button, ButtonLink, Field, FormError, Input, Textarea } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '올리는 중…' : '올리기'}
    </Button>
  );
}

/** 글쓰기 폼 — 구분은 칩처럼 보이는 라디오(눌린 것만 파랑), 제목 · 내용 */
export function CommunityPostForm() {
  const [state, formAction] = useActionState<CommunityState, FormData>(
    /* 신호가 끊겨도 오류 화면으로 넘어가지 않고 한 줄로 알린다(lib/action-offline.ts) */
    guardFormAction(createPost),
    undefined
  );
  /* 오류로 되돌아왔을 때 쓰던 글을 그대로 되살린다 */
  const before = state?.values;
  const pickedCategory = kept(before, 'category') ?? POST_CATEGORIES[0].key;

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-2xl border border-line bg-surface p-(--block-pad)"
    >
      <FormError>{state?.error}</FormError>

      <fieldset className="space-y-2">
        <legend className="block text-xs font-medium text-muted">구분</legend>
        <div className="flex flex-wrap gap-2">
          {POST_CATEGORIES.map((c) => (
            <label key={c.key} className="cursor-pointer">
              <input
                type="radio"
                name="category"
                value={c.key}
                defaultChecked={pickedCategory === c.key}
                className="peer sr-only"
              />
              <span className="inline-flex min-h-9 items-center rounded-full bg-ink/6 px-4 text-sm font-semibold text-ink transition-colors peer-checked:bg-sky peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky desk:bg-surface-2">
                {c.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="제목" hint={`${POST_TITLE_MAX}자까지 적을 수 있어요.`}>
        <Input
          name="title"
          defaultValue={kept(before, 'title')}
          maxLength={POST_TITLE_MAX}
          placeholder="오늘 불펜에서 느낀 것"
          required
        />
      </Field>

      <Field
        label="내용"
        hint={`${POST_BODY_MAX}자까지 적을 수 있어요. 선수 · 팀 이름은 적지 않아요.`}
      >
        <Textarea
          name="body"
          rows={10}
          defaultValue={kept(before, 'body')}
          maxLength={POST_BODY_MAX}
          placeholder="자유롭게 적어 보세요."
          required
        />
      </Field>

      <div className="flex gap-3">
        <SubmitButton />
        <ButtonLink href="/community" variant="secondary">
          취소
        </ButtonLink>
      </div>
    </form>
  );
}
