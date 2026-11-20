'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Loader2, RotateCw } from '@/components/icon';
import { withdrawOutcomeOf } from '@/lib/review-evidence/view';
import { FIELD, apiFailText, type ApiFailBody } from '../parts';

/**
 * 잘못 등록한 내 쓰임 거두기(EX-REF04). 지우지 않고 '거둔 쓰임'으로 표시만 한다.
 * 같은 까닭으로 다시 보내면 같은 요청 번호 · 같은 적은 때를 써서 한 번만 저장된다. 까닭을 고치면 새 요청이다.
 * '거뒀어요'는 서버가 이 거두기가 지금 효과를 낸다고 답했을 때만 보인다(받음표 applied · 옛 서버면 visible).
 * 저장은 됐지만 효과가 없으면(다른 거두기가 먼저 · 더 나중에 적힌 등록) 그 까닭을 따로 알린다.
 */

type State =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done' }
  | { kind: 'already' }
  | { kind: 'newer' }
  | { kind: 'unconfirmed' }
  | { kind: 'list-failed'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'unsure' };

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
      setState({ kind: 'unsure' });
      return;
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const outcome = withdrawOutcomeOf(res.status, data);
    switch (outcome.kind) {
      case 'done':
      case 'already':
        setState({ kind: outcome.kind });
        router.refresh();
        return;
      case 'newer':
        /* 이 요청은 저장됐지만 효과가 없다. 다음에 보내면 새 요청 번호 · 지금 시각으로 다시 거둔다 */
        req.current = null;
        setState({ kind: 'newer' });
        router.refresh();
        return;
      case 'unconfirmed':
      case 'unsure':
        setState({ kind: outcome.kind });
        return;
      case 'list-failed':
        setState({ kind: 'list-failed', message: outcome.message });
        return;
      default:
        setState({ kind: 'error', message: apiFailText(res.status, data as ApiFailBody, { forbidden: '대표관리자만 거둘 수 있어요.', byStatus: BY_STATUS, fallback: '거두지 못했어요.' }) });
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = reason.trim();
    if (!text) return;
    if (!req.current || req.current.reason !== text) req.current = { key: newKey(), notedAt: new Date().toISOString(), reason: text };
    void send();
  }

  const saving = state.kind === 'saving';
  const finished = state.kind === 'done' || state.kind === 'already';
  const resend = state.kind === 'unsure' || state.kind === 'unconfirmed' || state.kind === 'list-failed';
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
        {state.kind === 'error' && (
          <p role="alert" className="text-xs text-danger">
            {state.message}
          </p>
        )}
        {state.kind === 'list-failed' && (
          <p role="alert" className="text-xs text-ink">
            {state.message} 거두기는 저장하지 않았어요.
          </p>
        )}
        {state.kind === 'unsure' && (
          <p role="alert" className="text-xs text-ink">
            거뒀는지 확인하지 못했어요. 같은 까닭으로 다시 보내면 겹치지 않아요.
          </p>
        )}
        {state.kind === 'unconfirmed' && (
          <p role="alert" className="text-xs text-ink">
            저장은 됐지만 아직 거둔 상태로 보이지 않아요. 같은 까닭으로 다시 보내 확인해 주세요.
          </p>
        )}
        {state.kind === 'newer' && (
          <p role="alert" className="text-xs text-ink">
            이 쓰임에 거두기보다 더 나중에 적힌 등록이 있어 거두지 않았어요. 새로 고친 화면에서 확인한 뒤 다시 거둘 수 있어요.
          </p>
        )}
        {state.kind === 'already' && (
          <p role="status" className="text-xs text-ink">
            이미 거둔 상태예요. 다른 거두기가 효과를 내고 있어요.
          </p>
        )}
        {state.kind === 'done' && (
          <p role="status" className="text-xs text-sky">
            거뒀어요.
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
