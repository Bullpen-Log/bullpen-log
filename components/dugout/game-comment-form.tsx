'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { addGameComment, type GameCommentState } from '@/app/actions/game-comments';
import { Send } from '@/components/icon';
import { guardFormAction } from '@/lib/action-offline';
import { kept } from '@/lib/form-values';
import { FormError, Textarea } from '@/components/ui';

const MAX = 500;

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

/** 경기 댓글 쓰기(2026-10-24) — 커뮤니티 댓글 폼과 같은 모양(입력칸 옆 보내기 동그라미) */
export function GameCommentForm({ gameId }: { gameId: string }) {
  const [state, formAction] = useActionState<GameCommentState, FormData>(guardFormAction(addGameComment), undefined);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="gameId" value={gameId} />
      <FormError>{state?.error}</FormError>
      <div className="flex items-end gap-2">
        <Textarea
          name="body"
          rows={2}
          maxLength={MAX}
          defaultValue={kept(state?.values, 'body')}
          placeholder="이 경기 어땠어요?"
          aria-label="댓글"
          required
          className="min-h-11"
        />
        <SubmitButton />
      </div>
    </form>
  );
}
