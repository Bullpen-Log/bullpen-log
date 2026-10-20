'use client';

import { useState } from 'react';
import { confirmBooking, declineBooking, finishBooking } from '@/app/actions/lessons';
import { SafeForm } from '@/components/safe-form';
import { Button, Input } from '@/components/ui';
import { formatSlot } from '@/lib/market/lessons';

/** 코치의 답 — 요청이면 '1번으로 확정 · 2번으로 확정 · 거절'(답 한 줄 같이), 확정이면 '레슨 끝남' */
export function BookingActions({
  id,
  status,
  slot1,
  slot2,
}: {
  id: string;
  status: string;
  slot1: string;
  slot2: string | null;
}) {
  const [reply, setReply] = useState('');
  if (status === 'CONFIRMED') {
    return (
      <SafeForm
        action={finishBooking}
        doneToast="끝남으로 적었어요. 선수가 후기를 쓸 수 있어요."
      >
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="secondary" size="sm">
          레슨 끝남
        </Button>
      </SafeForm>
    );
  }
  if (status !== 'REQUESTED') return null;
  return (
    <div className="space-y-2">
      <Input
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        maxLength={300}
        placeholder="선수에게 한 줄(선택) — 장소 · 준비물"
        className="text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <SafeForm
          action={confirmBooking}
          doneToast="확정했어요. 시간표와 회원에 들어갔어요."
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="which" value="1" />
          <input type="hidden" name="reply" value={reply} />
          <Button type="submit" size="sm">
            {formatSlot(new Date(slot1))} 확정
          </Button>
        </SafeForm>
        {slot2 && (
          <SafeForm
            action={confirmBooking}
            doneToast="확정했어요. 시간표와 회원에 들어갔어요."
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="which" value="2" />
            <input type="hidden" name="reply" value={reply} />
            <Button type="submit" size="sm">
              {formatSlot(new Date(slot2))} 확정
            </Button>
          </SafeForm>
        )}
        <SafeForm action={declineBooking} doneToast="거절했어요.">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="reply" value={reply} />
          <Button type="submit" variant="ghost" size="sm">
            거절
          </Button>
        </SafeForm>
      </div>
    </div>
  );
}
