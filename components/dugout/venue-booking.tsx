'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { bookVenue, type VenueState } from '@/app/actions/venues';
import { Button, FormError, Textarea } from '@/components/ui';
import { guardFormAction } from '@/lib/action-offline';
import { minToTime, type Slot } from '@/lib/market/venues';

/** 그날의 칸 — 빈 칸을 누르고 '예약'. 잡힌 칸 · 지난 칸은 못 누른다 */
export function VenueBooking({
  venueId,
  dateKey,
  slots,
  loggedIn,
  approval,
}: {
  venueId: string;
  dateKey: string;
  slots: Slot[];
  loggedIn: boolean;
  approval: boolean;
}) {
  const [state, action] = useActionState<VenueState, FormData>(
    guardFormAction(bookVenue),
    undefined
  );
  const [picked, setPicked] = useState<number | null>(null);
  if (state?.success)
    return (
      <p className="rounded-xl bg-sky/10 px-4 py-3 text-sm font-semibold text-sky-strong">
        {state.success}
      </p>
    );
  if (slots.length === 0) return <p className="text-sm text-muted">이날은 쉬어요.</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="date" value={dateKey} />
      {picked != null && <input type="hidden" name="startMin" value={picked} />}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {slots.map((s) => {
          const off = s.taken || s.past;
          const on = picked === s.startMin;
          return (
            <button
              key={s.startMin}
              type="button"
              disabled={off}
              onClick={() => setPicked(on ? null : s.startMin)}
              className={`min-h-11 rounded-xl border text-sm font-semibold transition-colors ${
                off
                  ? 'cursor-not-allowed border-line bg-surface-2 text-muted/50 line-through'
                  : on
                    ? 'border-sky bg-sky text-white'
                    : 'border-line bg-surface text-ink hover:border-sky-soft'
              }`}
            >
              {minToTime(s.startMin)}
            </button>
          );
        })}
      </div>
      {picked != null && (
        <>
          <Textarea
            name="note"
            rows={2}
            maxLength={300}
            placeholder="인원 · 용도(선택)"
          />
          <FormError>{state?.error}</FormError>
          {loggedIn ? (
            <Submit label={approval ? '예약 요청' : '바로 예약'} />
          ) : (
            <a
              href={`/login?next=/dugout/venues/${venueId}?date=${dateKey}`}
              className="inline-flex min-h-11 items-center rounded-xl bg-sky px-5 text-sm font-semibold text-white"
            >
              로그인하고 예약하기
            </a>
          )}
        </>
      )}
      {picked == null && state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? '잡는 중…' : label}
    </Button>
  );
}
