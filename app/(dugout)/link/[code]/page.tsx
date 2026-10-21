import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { SafeForm } from '@/components/safe-form';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { approveLoginTicket } from '@/app/actions/login-ticket';
import { formatTicketCode, isTicketCode, normalizeTicketCode, ticketStateOf } from '@/lib/login-ticket';

/**
 * 코드 로그인의 폰 쪽(2026-10-21 개편 7단계 7-3) — 로그인된 폰(싱커 앱 웹뷰 · 브라우저)이 PC 의 코드를 승인한다. 로그인 전이면 로그인 뒤 돌아온다.
 */
export default async function LinkPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ done?: string }> }) {
  const { code: raw } = await params;
  const { done } = await searchParams;
  const code = normalizeTicketCode(raw);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/link/${code}`);
  const t = isTicketCode(code) ? await prisma.loginTicket.findUnique({ where: { code } }) : null;
  const state = t ? ticketStateOf(t, new Date()) : 'expired';
  const mine = t?.userId === user.id;

  return (
    <div className="mx-auto max-w-sm space-y-4 text-center">
      <h1 className="text-2xl font-black text-ink">PC 로그인 승인</h1>
      <Card className="space-y-4">
        <p className="font-mono text-2xl font-bold tracking-[0.2em] text-ink">{formatTicketCode(code)}</p>
        {done || (state === 'approved' && mine) ? (
          <p className="text-sm font-semibold text-ok">승인했어요. PC 화면이 곧 바뀌어요.</p>
        ) : state === 'waiting' ? (
          <>
            <p className="text-sm text-muted">
              PC 에 <b className="text-ink">{user.nickname}</b> 계정으로 로그인할까요? 내 눈앞의 PC 가 아니면 승인하지 마세요.
            </p>
            <SafeForm action={approveLoginTicket}>
              <input type="hidden" name="code" value={code} />
              <button type="submit" className="min-h-12 w-full rounded-xl bg-sky text-base font-bold text-white">
                이 PC 에 로그인
              </button>
            </SafeForm>
          </>
        ) : (
          <p className="text-sm text-muted">{state === 'used' ? '이미 쓴 코드예요.' : '시간이 지났거나 없는 코드예요. PC 에서 새 코드를 만들어 주세요.'}</p>
        )}
      </Card>
      <Link href="/" className="text-sm font-semibold text-sky">
        덕아웃 홈
      </Link>
    </div>
  );
}
