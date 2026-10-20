'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { updateOrgPlan, type OrgActionState } from '@/app/actions/org';
import { Button, FormError, Input } from '@/components/ui';
import { toast } from '@/components/toast';
import { guardFormAction } from '@/lib/action-offline';

/** 요금제 · 자리 · 메모(관리자, 6단계) — 결제 연동 전이라 손으로 적는다 */
export function PlanForm({
  org,
}: {
  org: {
    id: string;
    plan: string | null;
    seats: number | null;
    planNote: string | null;
  };
}) {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(updateOrgPlan),
    undefined
  );
  const seen = useRef<OrgActionState>(undefined);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state?.success) toast(state.success);
  }, [state]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="orgId" value={org.id} />
      <select
        name="plan"
        defaultValue={org.plan ?? ''}
        aria-label="요금제"
        className="rounded-xl border border-transparent bg-ink/5 px-3 py-2 text-xs text-ink desk:border-line desk:bg-surface-2"
      >
        <option value="">미정</option>
        <option value="free">무료(체험)</option>
        <option value="studio">레슨장</option>
        <option value="team">팀</option>
      </select>
      <Input
        name="seats"
        type="number"
        min={0}
        max={10000}
        defaultValue={org.seats ?? ''}
        placeholder="자리"
        aria-label="자리 수"
        className="w-20 px-3 py-2 text-xs"
      />
      <Input
        name="planNote"
        type="text"
        defaultValue={org.planNote ?? ''}
        placeholder="메모(결제일 · 담당)"
        aria-label="요금제 메모"
        maxLength={120}
        className="w-44 px-3 py-2 text-xs"
      />
      <Submit />
      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? '…' : '저장'}
    </Button>
  );
}
