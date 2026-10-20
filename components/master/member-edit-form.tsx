'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { updateMember, type OrgActionState } from '@/app/actions/org';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { toast } from '@/components/toast';
import { guardFormAction } from '@/lib/action-offline';

/** 구성원의 조직 안 이름 · 태그 · 코치 메모 — 스태프도 고친다(app/actions/org.ts updateMember) */
export function MemberEditForm({
  member,
}: {
  member: { id: string; nickname: string; tags: string[]; memo: string | null };
}) {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(updateMember),
    undefined
  );
  const seen = useRef<OrgActionState>(undefined);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state?.success) toast(state.success);
  }, [state]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={member.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="이름(조직 안 표시)">
          <Input
            name="nickname"
            type="text"
            defaultValue={member.nickname}
            maxLength={20}
            required
          />
        </Field>
        <Field label="태그" hint="쉼표로 — 포지션 · 학년 · 묶음">
          <Input
            name="tags"
            type="text"
            defaultValue={member.tags.join(', ')}
            autoComplete="off"
          />
        </Field>
      </div>
      <Field label="코치 메모" hint="선수에게는 안 보여요">
        <Textarea
          name="memo"
          rows={3}
          defaultValue={member.memo ?? ''}
          maxLength={500}
        />
      </Field>
      {state?.error && <FormError>{state.error}</FormError>}
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? '저장하는 중…' : '저장'}
    </Button>
  );
}
