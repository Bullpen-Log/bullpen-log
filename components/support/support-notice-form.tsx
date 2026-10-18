'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createNotice, updateNotice, type SupportState } from '@/app/actions/support';
import { guardFormAction } from '@/lib/action-offline';
import { kept } from '@/lib/form-values';
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX } from '@/lib/support';
import { SwitchRow } from '@/components/switch';
import { Button, ButtonLink, Field, FormError, Input, Textarea } from '@/components/ui';

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '저장 중…' : editing ? '저장하기' : '공지 올리기'}
    </Button>
  );
}

/** 공지 쓰기 · 고치기 — notice 가 있으면 고치기. 고정 스위치를 켜면 공지 목록 맨 위에 선다. */
export function SupportNoticeForm({
  notice,
}: {
  notice?: { id: string; title: string; body: string; pinned: boolean };
}) {
  const [state, formAction] = useActionState<SupportState, FormData>(
    /* 신호가 끊겨도 오류 화면으로 넘어가지 않고 한 줄로 알린다(lib/action-offline.ts) */
    guardFormAction(notice ? updateNotice : createNotice),
    undefined
  );

  // 오류로 되돌아왔을 때 쓰던 글을 그대로 되살린다. 스위치는 꺼진 채 보냈으면 값이 아예 없어서, 되돌아온 값이 있을 때는 그쪽을 믿는다.
  const before = state?.values;
  const pinned = before ? kept(before, 'pinned') === 'on' : (notice?.pinned ?? false);

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-2xl border border-line bg-surface p-(--block-pad)"
    >
      {notice && <input type="hidden" name="id" value={notice.id} />}
      <FormError>{state?.error}</FormError>

      <Field label="제목">
        <Input
          name="title"
          defaultValue={kept(before, 'title') ?? notice?.title}
          maxLength={NOTICE_TITLE_MAX}
          placeholder="예) 10월 20일 새벽 점검 안내"
          required
        />
      </Field>

      <Field label="내용" hint={`${NOTICE_BODY_MAX}자까지. 줄바꿈은 그대로 보여요.`}>
        <Textarea
          name="body"
          rows={14}
          defaultValue={kept(before, 'body') ?? notice?.body}
          maxLength={NOTICE_BODY_MAX}
          required
        />
      </Field>

      <SwitchRow
        name="pinned"
        value="on"
        defaultChecked={pinned}
        hint="켜면 공지 목록과 고객센터 첫 화면 맨 위에 서요."
      >
        맨 위에 고정
      </SwitchRow>

      <div className="flex gap-3">
        <SubmitButton editing={Boolean(notice)} />
        <ButtonLink
          href={notice ? `/support/notices/${notice.id}` : '/admin/support'}
          variant="secondary"
        >
          취소
        </ButtonLink>
      </div>
    </form>
  );
}
