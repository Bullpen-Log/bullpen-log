import { notFound, redirect } from 'next/navigation';
import { PayShell } from '@/components/dugout/pay-shell';
import { getCurrentUser } from '@/lib/dal';
import { loadListing } from '@/lib/market/load';
import { ESCROW_FEE_RATE, escrowFee } from '@/lib/market/pay';

/** 안전결제(4판 껍데기) — 물건값 + 안전결제 수수료. 결제 연동 전이라 단추만 잠겨 있다 */
export default async function PayListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/pay/listing/${id}`);
  const item = await loadListing(id, { id: user.id, role: user.role });
  if (!item || item.mine || item.status !== 'ACTIVE') notFound();
  return (
    <PayShell
      title="안전결제"
      subtitle={`${item.title} · ${item.seller.nickname}`}
      lines={[
        { label: '물건값', amount: item.price },
        {
          label: `안전결제 수수료(${Math.round(ESCROW_FEE_RATE * 100)}%)`,
          amount: escrowFee(item.price),
        },
      ]}
      note="돈은 덕아웃이 맡아 두었다가 물건을 받고 ‘받았어요’를 누르면 판매자에게 보내요. 3일 안에 누르지 않으면 자동으로 보내요."
    />
  );
}
