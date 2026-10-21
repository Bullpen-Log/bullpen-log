import Link from 'next/link';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { Wordmark } from '@/components/logo';
import { TicketPoller } from '@/components/login/ticket-poller';
import { getCurrentUser } from '@/lib/dal';
import { createLoginTicket } from '@/app/actions/login-ticket';
import { formatTicketCode, linkPathOf } from '@/lib/login-ticket';
import { absoluteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

/**
 * 코드 · QR 로그인(PC, 2026-10-21 개편 7단계 7-3, docs/designs/sinker-dugout.md 8절 E) — 비밀번호를 치지 않고 폰의 싱커 앱으로 PC 에 로그인한다.
 * 이 화면이 코드를 만들고, 폰이 QR 을 찍거나 코드를 쳐서 /link/<code> 를 열어 승인하면 TicketPoller 가 세션을 받는다.
 */
export default async function QrLoginPage() {
  if (await getCurrentUser()) redirect('/sinker');
  const ticket = await createLoginTicket();
  const url = absoluteUrl(linkPathOf(ticket.code));
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 220, color: { dark: '#17201c', light: '#ffffff' } });
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-page px-6 py-10 text-center">
      <Wordmark className="text-3xl text-ink" />
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
        <h1 className="text-xl font-bold text-ink">폰으로 로그인</h1>
        <p className="text-sm text-muted">싱커 앱이 로그인된 폰으로 QR 을 찍거나, 앱의 더보기 › ‘PC 에서 관리하기’에 코드를 쳐요.</p>
        <div className="mx-auto w-[220px] overflow-hidden rounded-xl border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="font-mono text-3xl font-bold tracking-[0.2em] text-ink">{formatTicketCode(ticket.code)}</p>
        <TicketPoller code={ticket.code} expiresAt={ticket.expiresAt} />
      </div>
      <Link href="/login" className="text-sm font-semibold text-sky">
        이메일 · 비밀번호로 로그인
      </Link>
    </main>
  );
}
