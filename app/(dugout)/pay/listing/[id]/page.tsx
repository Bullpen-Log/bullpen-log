import { notFound, redirect } from 'next/navigation';
import { PayShell } from '@/components/dugout/pay-shell';
import { getCurrentUser } from '@/lib/dal';
import { buyerQuote, sellerNet } from '@/lib/market/detail';
import { loadListing } from '@/lib/market/load';
import { formatPrice } from '@/lib/market/specs';

/**
 * 안전결제(4판 껍데기 → 2026-10-25 Phase 1 글 바로잡음) — 물건값 + 안전결제 수수료(가정 요율, 소수 그대로 '3.5%').
 * 결제 연동 전이라 단추만 잠겨 있다. 대금을 누가 맡고 언제 보내는지는 결제 회사 계약으로 정해지므로 여기서 약속하지 않는다.
 * 배송비는 표에 칸이 없어 합계에 없다고 말한다. 나눔(0원)은 결제 주문이 아니라 이 화면을 안 연다.
 */
export default async function PayListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/pay/listing/${id}`);
  const item = await loadListing(id, { id: user.id, role: user.role });
  if (!item || item.mine || item.status !== 'ACTIVE') notFound();
  const q = buyerQuote(item.price);
  if (q.giveaway) redirect(`/market/${id}`);
  const net = sellerNet(item.price);
  return (
    <PayShell
      title="안전결제 미리보기"
      subtitle={`${item.title} · ${item.seller.nickname}`}
      lines={[
        { label: '물건값', amount: q.price },
        { label: q.feeLabel, amount: q.fee },
      ]}
      extra={
        <dl className="space-y-1 border-t border-line pt-2 text-xs text-muted">
          <div className="flex justify-between gap-4">
            <dt>배송비</dt>
            <dd className="text-right">아직 합계에 없어요. 판매자가 정한 배송비가 결제 전에 더해져요.</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>판매자가 받는 금액</dt>
            <dd className="text-right">
              {formatPrice(net.net)} <span className="block">{net.note}</span>
            </dd>
          </div>
        </dl>
      }
      note="수수료율은 아직 가정이에요. 대금 보관 · 환불 · 판매자 지급 시점은 결제 회사 계약과 정책 검토 뒤에 정해지고, 그 전에는 덕아웃이 대금을 맡지 않아요."
      fallback="그때까지는 판매자에게 문의만 할 수 있어요. 결제한 것으로 보지 마세요."
    />
  );
}
