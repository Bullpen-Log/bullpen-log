'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { reportTarget, type ReportState } from '@/app/actions/community';
import { Check } from '@/components/icon';
import { RoundFlag } from '@/components/round-icon';
import { guardFormAction } from '@/lib/action-offline';
import { kept } from '@/lib/form-values';
import { REPORT_DETAIL_MAX, REPORT_REASONS } from '@/lib/community';
import { Button, FormError, Textarea } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="danger" disabled={pending}>
      {pending ? '보내는 중…' : '신고하기'}
    </Button>
  );
}

/**
 * 신고 — 작은 깃발 단추를 누르면 바로 밑에 이유 고르기가 펼쳐진다(글 · 댓글 공통). 보내면 '접수했어요' 한 줄로 바뀐다.
 * 글(postId) · 댓글(commentId) · 대화의 말(messageId) 하나만 받는다. 내 글에는 화면이 이 단추를 그리지 않는다(서버도 한 번 더 막는다).
 * 신고한 사람은 글쓴이에게 드러나지 않는다.
 */
export function CommunityReportForm({
  postId,
  commentId,
  messageId,
  compact = false,
}: {
  postId?: string;
  commentId?: string;
  messageId?: string;
  /** 댓글 줄의 아이콘만 있는 작은 단추 */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ReportState, FormData>(
    guardFormAction(reportTarget),
    undefined
  );
  const before = state?.values;

  if (state?.done) {
    return (
      <p className="inline-flex min-h-10 items-center gap-1.5 text-xs text-muted motion-safe:animate-fade-in">
        <Check aria-hidden className="h-3.5 w-3.5 text-ok" />
        신고를 접수했어요. 살펴볼게요.
      </p>
    );
  }

  return (
    <div className={compact ? 'inline-block' : 'w-full'}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={compact ? '신고' : undefined}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full text-sm text-muted transition-colors hover:text-danger ${
          compact ? 'px-2' : 'px-3'
        } ${open ? 'text-danger' : ''}`}
      >
        <RoundFlag aria-hidden className="h-4 w-4" />
        {!compact && '신고'}
      </button>

      {open && (
        <form
          action={formAction}
          className="mt-2 space-y-4 rounded-2xl border border-line bg-surface-2 p-4 motion-safe:animate-fade-in"
        >
          {postId && <input type="hidden" name="postId" value={postId} />}
          {commentId && <input type="hidden" name="commentId" value={commentId} />}
          {messageId && <input type="hidden" name="messageId" value={messageId} />}
          <FormError>{state?.error}</FormError>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted">왜 신고하나요?</legend>
            <div className="flex flex-wrap gap-2">
              {REPORT_REASONS.map((r) => (
                <label key={r.key} className="cursor-pointer">
                  <input
                    type="radio"
                    name="reason"
                    value={r.key}
                    defaultChecked={kept(before, 'reason') === r.key}
                    required
                    className="peer sr-only"
                  />
                  <span className="inline-flex min-h-9 items-center rounded-full bg-ink/6 px-3 text-sm text-ink transition-colors peer-checked:bg-danger peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-danger desk:bg-surface">
                    {r.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Textarea
            name="detail"
            rows={2}
            maxLength={REPORT_DETAIL_MAX}
            defaultValue={kept(before, 'detail')}
            placeholder="더 알려 줄 것이 있으면 적어 주세요(선택)."
            className="text-sm"
          />
          <p className="text-xs text-muted">
            신고한 사람은 글쓴이에게 알려지지 않아요.{' '}
            <Link href="/community/guide" className="font-semibold text-sky">
              운영 원칙
            </Link>
          </p>

          <div className="flex items-center gap-2">
            <SubmitButton />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              닫기
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
