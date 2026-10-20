'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createGuardianLink,
  revokeGuardianLink,
  type OrgActionState,
} from '@/app/actions/org-notes';
import { ConfirmButton } from '@/components/master/confirm-button';
import { Button, Card, FormError } from '@/components/ui';
import { toast } from '@/components/toast';
import { guardFormAction } from '@/lib/action-offline';
import { GUARDIAN_DAYS } from '@/lib/org/rules';

type ReportView = {
  id: string;
  token: string;
  expiresAt: Date;
  lastOpenedAt: Date | null;
};

/**
 * 보호자 리포트 링크(4단계) — 주소 + 네 자리 코드. 코드는 만든 직후 한 번만 보인다(서버는 해시만 둔다).
 * 주소와 코드는 다른 길로 보내라고 안내한다(카톡 주소 · 말로 코드).
 */
export function GuardianLinkCard({
  memberId,
  reports,
}: {
  memberId: string;
  reports: ReportView[];
}) {
  const [state, action] = useActionState<OrgActionState, FormData>(
    guardFormAction(createGuardianLink),
    undefined
  );
  /* 새로 만든 링크 — 답(state)에서 바로 셈한다. 코드는 이 답에만 있다(서버는 해시만) */
  const fresh = (() => {
    if (!state?.success) return null;
    const [token, code] = state.success.split(':');
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return { url: `${origin}/report/${token}`, code };
  })();
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(d);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what}를 복사했어요.`);
    } catch {
      toast('복사하지 못했어요.', 'error');
    }
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-ink">보호자 리포트 링크</h2>
        <p className="mt-1 text-xs text-muted">
          보호자가 코드를 넣고 보는 읽기 전용 페이지 — 투구 · 구속 · 노트 · 숙제.{' '}
          {GUARDIAN_DAYS}일 뒤 끝나요. 주소와 코드는 다른 길로 보내 주세요.
        </p>
      </div>

      {fresh && (
        <div className="space-y-2 rounded-xl border border-sky/30 bg-sky/5 p-3 text-sm motion-safe:animate-fade-in">
          <p className="text-xs font-semibold text-sky-strong">
            새 링크 — 코드는 지금만 보여요
          </p>
          <p className="break-all font-mono text-xs text-ink">{fresh.url}</p>
          <p className="font-mono text-xl font-bold tracking-[0.3em] text-ink">
            {fresh.code}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => copy(fresh.url, '주소')}
            >
              주소 복사
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => copy(fresh.code, '코드')}
            >
              코드 복사
            </Button>
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <ul className="divide-y divide-line text-xs">
          {reports.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <span className="font-mono text-muted">…{r.token.slice(-6)}</span>
              <span className="text-muted">{fmt(r.expiresAt)}까지</span>
              <span className="text-muted">
                {r.lastOpenedAt ? `${fmt(r.lastOpenedAt)} 열어 봄` : '아직 안 열어 봄'}
              </span>
              <span className="ml-auto">
                <ConfirmButton
                  action={revokeGuardianLink}
                  fields={{ id: r.id }}
                  message="이 링크를 끊을까요? 보호자가 더는 못 봐요."
                  doneToast="끊었어요."
                >
                  끊기
                </ConfirmButton>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form action={action}>
        <input type="hidden" name="memberId" value={memberId} />
        {state?.error && <FormError>{state.error}</FormError>}
        <Submit />
      </form>
    </Card>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? '만드는 중…' : '새 링크 만들기'}
    </Button>
  );
}
