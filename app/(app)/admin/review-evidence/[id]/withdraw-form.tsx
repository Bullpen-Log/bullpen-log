'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Loader2, RotateCw } from '@/components/icon';
import { withdrawOutcomeOf, withdrawStepOf, type WithdrawStep } from '@/lib/review-evidence/view';
import { FIELD, apiFailText, type ApiFailBody } from '../parts';

/**
 * 잘못 등록한 내 쓰임 거두기(EX-REF04). 지우지 않고 '거둔 쓰임'으로 표시만 한다.
 * 같은 까닭으로 다시 보내면 같은 요청 번호 · 같은 적은 때를 써서 한 번만 저장된다. 까닭을 고치면 새 요청이다.
 * 완료 글은 서버가 이 거두기가 지금 효과를 낸다고 답했을 때만 보인다(받음표 applied · 옛 서버면 visible · withdrawStepOf).
 * 저장은 됐지만 효과가 없으면(다른 거두기가 먼저 · 더 나중에 적힌 등록) 그 까닭을 따로 알린다.
 */

type State = { kind: 'idle' } | { kind: 'saving' } | { kind: 'shown'; step: WithdrawStep; message: string };

function newKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return 'rk-ui-wd-' + c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return 'rk-ui-wd-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

const BY_STATUS: Record<number, string> = {
  400: '거둘 쓰임을 찾지 못했거나 까닭이 맞지 않아요.',
  401: '로그인이 풀렸어요. 다시 로그인한 뒤 보내 주세요.',
  409: '같은 요청 번호로 다른 내용이 이미 저장돼 있어요. 까닭을 고쳐 다시 보내 주세요.',
  413: '까닭이 너무 길어요.',
};

export function WithdrawForm({ useId }: { useId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const req = useRef<{ key: string; notedAt: string; reason: string } | null>(null);

  async function send() {
    const r = req.current;
    if (!r || state.kind === 'saving') return;
    setState({ kind: 'saving' });
    let res: Response;
    try {
      res = await fetch('/api/admin/review-evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-review-evidence': '1' },
        body: JSON.stringify({ requestKey: r.key, withdraw: { useId, reasonKo: r.reason, notedAt: r.notedAt } }),
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      const step = withdrawStepOf({ kind: 'unsure' });
      setState({ kind: 'shown', step, message: step.message ?? '' });
      return;
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    /* 무엇을 보이고 무엇을 할지는 withdrawStepOf 가 정한다(셀프테스트가 같은 함수를 본다). 여기서 상태를 따로 고르지 않는다 */
    const step = withdrawStepOf(withdrawOutcomeOf(res.status, data));
    if (step.resetRequest) req.current = null;
    const message =
      step.message ?? apiFailText(res.status, data as ApiFailBody, { forbidden: '대표관리자만 거둘 수 있어요.', byStatus: BY_STATUS, fallback: '거두지 못했어요.' });
    setState({ kind: 'shown', step, message });
    if (step.refresh) router.refresh();
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = reason.trim();
    if (!text) return;
    if (!req.current || req.current.reason !== text) req.current = { key: newKey(), notedAt: new Date().toISOString(), reason: text };
    void send();
  }

  const saving = state.kind === 'saving';
  const shown = state.kind === 'shown' ? state.step : null;
  const finished = !!shown?.finished;
  const resend = !!shown?.resend;
  return (
    <details className="mt-3 border-t border-line pt-3">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-xs font-semibold text-muted hover:text-danger desk:min-h-0">잘못 등록했으면 거두기</summary>
      <form onSubmit={onSubmit} className="mt-2 space-y-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          거두는 까닭(필수)
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (state.kind !== 'saving') setState({ kind: 'idle' });
            }}
            required
            maxLength={300}
            rows={2}
            className={`${FIELD} py-2`}
          />
        </label>
        {state.kind === 'shown' && (
          <p role={shown?.tone === 'ok' ? 'status' : 'alert'} className={`text-xs ${shown?.tone === 'ok' ? 'text-sky' : shown?.tone === 'error' ? 'text-danger' : 'text-ink'}`}>
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={saving || !reason.trim() || finished}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-danger-line px-3 text-sm font-semibold text-danger disabled:opacity-50 desk:min-h-9"
        >
          {saving ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : resend ? <RotateCw aria-hidden className="h-4 w-4" /> : null}
          {saving ? '보내는 중' : resend ? '다시 보내기' : '이 쓰임 거두기'}
        </button>
      </form>
    </details>
  );
}
