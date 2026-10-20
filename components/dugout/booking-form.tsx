'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestBooking, type LessonState } from '@/app/actions/lessons';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { guardFormAction } from '@/lib/action-offline';
import { BOOKING_NOTE_MAX } from '@/lib/market/lessons';

/** 레슨 요청 — 희망 시간 둘 · 한마디. 보내면 코치가 하나를 확정한다 */
export function BookingForm({
  orgId,
  minLocal,
  maxLocal,
}: {
  orgId: string;
  minLocal: string;
  maxLocal: string;
}) {
  const [state, action] = useActionState<LessonState, FormData>(
    guardFormAction(requestBooking),
    undefined
  );
  if (state?.success)
    return (
      <p className="rounded-xl bg-sky/10 px-4 py-3 text-sm font-semibold text-sky-strong">
        {state.success}
      </p>
    );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orgId" value={orgId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="희망 시간 1">
          <Input
            name="slot1"
            type="datetime-local"
            min={minLocal}
            max={maxLocal}
            step={1800}
            required
          />
        </Field>
        <Field label="희망 시간 2" hint="선택 — 코치가 둘 중 하나를 골라요">
          <Input
            name="slot2"
            type="datetime-local"
            min={minLocal}
            max={maxLocal}
            step={1800}
          />
        </Field>
      </div>
      <Field label="한마디" hint="선택 — 목표 · 포지션 · 지금 고민">
        <Textarea
          name="note"
          rows={3}
          maxLength={BOOKING_NOTE_MAX}
          placeholder="중2 투수, 구속보다 제구가 고민이에요"
        />
      </Field>
      <FormError>{state?.error}</FormError>
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? '보내는 중…' : '레슨 요청하기'}
    </Button>
  );
}
