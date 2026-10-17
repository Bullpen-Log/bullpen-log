'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { addComment, type CommunityState } from '@/app/actions/community';
import { Send } from '@/components/icon';
import { guardFormAction } from '@/lib/action-offline';
import { kept } from '@/lib/form-values';
import { COMMENT_BODY_MAX } from '@/lib/community';
import { FormError, Textarea } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={pending ? '올리는 중' : '댓글 올리기'}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky text-white transition-[background-color,transform] hover:bg-sky-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Send aria-hidden className="h-4 w-4" />
    </button>
  );
}

/** 댓글 쓰기 — 글 맨 밑, 입력칸 옆에 보내기 동그라미(메신저처럼). 올라가면 칸이 비워진다. */
export function CommunityCommentForm({ postId }: { postId: string }) {
  const [state, formAction] = useActionState<CommunityState, FormData>(
    guardFormAction(addComment),
    undefined
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="postId" value={postId} />
      <FormError>{state?.error}</FormError>
      <div className="flex items-end gap-2">
        <Textarea
          name="body"
          rows={2}
          maxLength={COMMENT_BODY_MAX}
          defaultValue={kept(state?.values, 'body')}
          placeholder="댓글을 남겨 보세요."
          aria-label="댓글"
          required
          className="min-h-11"
        />
        <SubmitButton />
      </div>
    </form>
  );
}
