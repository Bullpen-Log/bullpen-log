'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { joinAsStaff, type OrgActionState } from '@/app/actions/org';
import { Button, Field, FormError, Input } from '@/components/ui';
import { toast } from '@/components/toast';
import { guardFormAction } from '@/lib/action-offline';

/** 스태프 초대 코드로 다른 레슨장 · 팀에 코치로 들어가기(5단계) — 들어가면 위 막대의 조직 고르개에 생긴다 */
export function JoinStaffForm() {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(joinAsStaff),
    undefined
  );
  const seen = useRef<OrgActionState>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state?.success) {
      toast(state.success);
      formRef.current?.reset();
    }
  }, [state]);
  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2">
      <Field label="코치 초대 코드" hint="그 조직의 마스터가 만든 여섯 글자">
        <Input
          name="code"
          type="text"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={8}
          placeholder="ABC234"
          className="w-40 font-mono uppercase tracking-[0.2em]"
          required
        />
      </Field>
      <Submit />
      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending} className="mb-6">
      {pending ? '확인 중…' : '들어가기'}
    </Button>
  );
}
