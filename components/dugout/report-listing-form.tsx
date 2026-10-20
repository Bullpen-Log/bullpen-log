'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { reportListing, type ReportState } from '@/app/actions/market';
import { Flag } from '@/components/icon';
import { Button, FormError, Textarea } from '@/components/ui';
import { guardFormAction } from '@/lib/action-offline';
import { REPORT_DETAIL_MAX, REPORT_REASONS } from '@/lib/community';

/** 물건 신고 — 접힌 채 있다가 누르면 이유 · 내용. 보내면 '접수됐어요'로 닫힌다(글 신고와 같은 표 · 같은 관리자 화면) */
export function ReportListingForm({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ReportState, FormData>(
    guardFormAction(reportListing),
    undefined
  );
  if (state?.done)
    return <p className="text-xs text-muted">신고가 접수됐어요. 24시간 안에 봐요.</p>;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-1 text-xs text-muted hover:text-danger"
      >
        <Flag className="h-3.5 w-3.5" /> 신고
      </button>
    );
  }
  return (
    <form
      action={action}
      className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-3"
    >
      <input type="hidden" name="id" value={listingId} />
      <FormError>{state?.error}</FormError>
      <div className="flex flex-wrap gap-2">
        {REPORT_REASONS.map((r) => (
          <label
            key={r.key}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 text-xs text-ink has-checked:border-danger has-checked:text-danger"
          >
            <input
              type="radio"
              name="reason"
              value={r.key}
              required
              className="accent-danger"
            />
            {r.label}
          </label>
        ))}
      </div>
      <Textarea
        name="detail"
        rows={2}
        maxLength={REPORT_DETAIL_MAX}
        placeholder="무엇이 문제인지(선택)"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          취소
        </Button>
        <Submit />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      {pending ? '보내는 중…' : '신고하기'}
    </Button>
  );
}
