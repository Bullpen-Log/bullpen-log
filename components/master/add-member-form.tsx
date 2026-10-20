'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { addPlaceholderMember, type OrgActionState } from '@/app/actions/org';
import { Button, Field, FormError, Input } from '@/components/ui';
import { toast } from '@/components/toast';
import { guardFormAction } from '@/lib/action-offline';

/**
 * 코치가 대신 만드는 자리 — 아직 가입 안 한 회원(선수)의 이름 · 태그. 그 사람이 나중에 초대 코드로 들어오면 이 자리를 이어받는다(3단계).
 * 더해지면 칸을 비우고 한 줄 알린다.
 */
export function AddMemberForm({
  orgId,
  memberWord,
}: {
  orgId: string;
  memberWord: string;
}) {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(addPlaceholderMember),
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);
  const seen = useRef<OrgActionState>(undefined);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state?.success) {
      toast(`${memberWord}을 ${state.success}`);
      formRef.current?.reset();
      formRef.current?.querySelector<HTMLInputElement>('input[name=nickname]')?.focus();
    }
  }, [state, memberWord]);
  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="orgId" value={orgId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label={`${memberWord} 이름`}>
          <Input
            name="nickname"
            type="text"
            maxLength={20}
            required
            placeholder="홍길동"
            autoComplete="off"
          />
        </Field>
        <Field label="태그" hint="쉼표로 — 포지션 · 학년 · 묶음">
          <Input name="tags" type="text" placeholder="투수, 6학년" autoComplete="off" />
        </Field>
        <Submit />
      </div>
      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending} className="sm:mb-6">
      {pending ? '더하는 중…' : '자리 만들기'}
    </Button>
  );
}
