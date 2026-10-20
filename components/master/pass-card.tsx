'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import {
  addPass,
  adjustPass,
  deletePass,
  type OrgActionState,
} from '@/app/actions/org-notes';
import { ConfirmButton } from '@/components/master/confirm-button';
import { SafeForm } from '@/components/safe-form';
import { Button, Card, Field, FormError, Input } from '@/components/ui';
import { toast } from '@/components/toast';
import { guardFormAction } from '@/lib/action-offline';
import { PASS_ALERT_LEFT, PASS_TOTAL_MAX, passLeft, passUsable } from '@/lib/org/rules';

type PassView = {
  id: string;
  total: number;
  used: number;
  expiresAt: Date | null;
  memo: string | null;
};

/** 수강권(레슨장) — 총 N회 · 쓴 M회 · 기한. 노트를 쓰면 한 회 줄고, 여기서 손으로도 맞춘다 */
export function PassCard({
  memberId,
  passes,
  todayKey,
}: {
  memberId: string;
  passes: PassView[];
  todayKey: string;
}) {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(addPass),
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);
  const seen = useRef<OrgActionState>(undefined);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state?.success) {
      toast(state.success);
      formRef.current?.reset();
    }
  }, [state]);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(d);
  const totalLeft = passes
    .filter((p) => passUsable(p, todayKey))
    .reduce((a, p) => a + passLeft(p), 0);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">수강권</h2>
        <span
          className={`text-sm font-bold ${totalLeft <= PASS_ALERT_LEFT ? 'text-warn' : 'text-ink'}`}
        >
          남은 {totalLeft}회
        </span>
      </div>
      {passes.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {passes.map((p) => {
            const usable = passUsable(p, todayKey);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span
                  className={
                    usable ? 'font-semibold text-ink' : 'text-muted line-through'
                  }
                >
                  {p.used}/{p.total}회
                </span>
                <span className="text-xs text-muted">
                  {p.expiresAt ? `${fmt(p.expiresAt)}까지` : '기한 없음'}
                </span>
                {p.memo && <span className="text-xs text-muted">{p.memo}</span>}
                <span className="ml-auto flex items-center gap-1">
                  <SafeForm action={adjustPass}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="delta" value="-1" />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label="쓴 회수 하나 줄이기"
                    >
                      −1
                    </Button>
                  </SafeForm>
                  <SafeForm action={adjustPass}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="delta" value="1" />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label="쓴 회수 하나 늘리기"
                    >
                      +1
                    </Button>
                  </SafeForm>
                  <ConfirmButton
                    action={deletePass}
                    fields={{ id: p.id }}
                    message="이 수강권을 지울까요?"
                    doneToast="지웠어요."
                  >
                    지우기
                  </ConfirmButton>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <form
        ref={formRef}
        action={action}
        className="grid gap-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end"
      >
        <input type="hidden" name="memberId" value={memberId} />
        <Field label="횟수">
          <Input
            name="total"
            type="number"
            min={1}
            max={PASS_TOTAL_MAX}
            defaultValue={10}
            required
            className="w-24"
          />
        </Field>
        <Field label="기한" hint="선택">
          <Input name="expiresAt" type="date" min={todayKey} />
        </Field>
        <Field label="메모" hint="선택">
          <Input name="memo" type="text" maxLength={80} placeholder="10회권 · 현금" />
        </Field>
        <Submit />
      </form>
      {state?.error && <FormError>{state.error}</FormError>}
    </Card>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending} className="sm:mb-6">
      {pending ? '더하는 중…' : '수강권 더하기'}
    </Button>
  );
}
