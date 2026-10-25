import type { Metadata } from 'next';
import { SellFlowPreview } from '@/components/dugout/sell-flow-preview';
import { DugoutPageHeader } from '@/components/dugout/ui';

export const metadata: Metadata = { title: '판매 등록 미리보기', robots: { index: false } };

/** 새 네 단계 판매 등록의 모양 미리보기(2026-10-25 Phase 1) — 저장 없음. 실제 올리기는 /market/new */
export default function SellPreviewPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DugoutPageHeader
        title="판매 등록 미리보기"
        subtitle="사진 → 장비 · 상태 → 가격 · 배송 → 미리보기, 네 단계. 아직 저장은 안 돼요."
        crumbs={[{ label: '장터', href: '/market' }, { label: '판매 등록 미리보기' }]}
      />
      <SellFlowPreview />
    </div>
  );
}
