'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { replyInquiry, type SupportState } from '@/app/actions/support';
import { guardFormAction } from '@/lib/action-offline';
import { kept } from '@/lib/form-values';
import { REPLY_BODY_MAX } from '@/lib/support';
import { Send } from '@/components/icon';
import { Button, FormError, Textarea } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Send aria-hidden className="h-4 w-4" />
      {pending ? '보내는 중…' : '보내기'}
    </Button>
  );
}

/**
 * 문의 대화 맨 밑의 답글 칸 — 쓴 사람은 덧붙이고, 운영자는 답한다. 보내고 나면 React 가 폼을 비우고(성공 상태는 undefined)
 * 화면이 다시 그려져 새 답글이 위에 붙는다.
 */
export function SupportReplyForm({
  inquiryId,
  staff,
}: {
  inquiryId: string;
  /** 운영자가 쓰는 칸 — 안내 글이 다르다 */
  staff: boolean;
}) {
  const [state, formAction] = useActionState<SupportState, FormData>(
    /* 신호가 끊겨도 오류 화면으로 넘어가지 않고 한 줄로 알린다(lib/action-offline.ts) */
    guardFormAction(replyInquiry),
    undefined
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-2xl border border-line bg-surface p-(--block-pad)"
    >
      <input type="hidden" name="id" value={inquiryId} />
      <FormError>{state?.error}</FormError>
      <Textarea
        name="body"
        rows={4}
        defaultValue={kept(state?.values, 'body')}
        maxLength={REPLY_BODY_MAX}
        placeholder={staff ? '답변을 적어 주세요' : '덧붙일 내용이 있으면 적어 주세요'}
        aria-label={staff ? '답변' : '덧붙이는 글'}
        required
      />
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
