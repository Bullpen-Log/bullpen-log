'use client';

import { useState } from 'react';
import { RoundLock } from '@/components/round-icon';
import { Card } from '@/components/ui';
import { formatPrice } from '@/lib/market/specs';

export type PayLine = { label: string; amount: number };

const METHODS = [
  { key: 'card', label: '카드' },
  { key: 'transfer', label: '계좌이체' },
  { key: 'easy', label: '간편결제' },
] as const;

/**
 * 결제 화면의 껍데기(4판, 2026-10-21 사용자: "겉만 만들어 둬 — 결제만 안 되고 페이지는 다 보이게").
 * 주문 내용 · 수단 고르기 · 동의 · 결제 단추까지 그대로 있고, 단추만 '준비 중'으로 잠겨 있다. 결제 연동(토스페이먼츠 · 본인 인증 계약)이 되면
 * 이 단추가 결제창을 연다 — 화면은 바꾸지 않아도 된다.
 */
export function PayShell({
  title,
  subtitle,
  lines,
  note,
}: {
  title: string;
  subtitle?: string;
  lines: PayLine[];
  note?: string;
}) {
  const [method, setMethod] = useState<string>('card');
  const [agree, setAgree] = useState(false);
  const total = lines.reduce((a, l) => a + l.amount, 0);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-black text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      <Card className="space-y-2">
        <h2 className="text-xs font-medium text-muted">결제 내용</h2>
        <dl className="divide-y divide-line text-sm">
          {lines.map((l) => (
            <div key={l.label} className="flex justify-between py-2">
              <dt className="text-muted">{l.label}</dt>
              <dd className={`font-semibold ${l.amount < 0 ? 'text-ok' : 'text-ink'}`}>
                {l.amount < 0 ? `−${formatPrice(-l.amount)}` : formatPrice(l.amount)}
              </dd>
            </div>
          ))}
          <div className="flex justify-between py-2 text-base">
            <dt className="font-bold text-ink">합계</dt>
            <dd className="font-black text-ink">{formatPrice(total)}</dd>
          </div>
        </dl>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-xs font-medium text-muted">결제 수단</h2>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={method === m.key}
              onClick={() => setMethod(m.key)}
              className={`min-h-12 rounded-xl border text-sm font-semibold transition-colors ${method === m.key ? 'border-sky bg-sky/10 text-sky-strong' : 'border-line bg-surface text-ink'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-sky"
          />
          <span>
            결제 금액과 취소 · 환불 규정을 확인했어요. 안전결제는 거래가 끝난 뒤
            판매자에게 보내요.
          </span>
        </label>
      </Card>
      {note && <p className="text-xs text-muted">{note}</p>}
      <button
        type="button"
        disabled
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink/15 text-base font-bold text-muted"
      >
        <RoundLock className="h-4 w-4" /> {formatPrice(total)} 결제하기 · 준비 중
      </button>
      <p className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-xs leading-relaxed text-warn">
        결제는 아직 열리지 않았어요. 결제 회사 계약과 본인 인증이 끝나면 이 단추가 바로
        결제창을 열어요. 그때까지는 채팅으로 직접 거래해 주세요.
      </p>
    </div>
  );
}
