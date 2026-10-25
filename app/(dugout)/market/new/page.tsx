import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ListingForm } from '@/components/dugout/listing-form';
import { getCurrentUser } from '@/lib/dal';
import { prefillSpecs } from '@/lib/market/specs';
import { DugoutPageHeader } from '@/components/dugout/ui';

/** 물건 올리기 — 로그인이 필요하다. 안 했으면 로그인으로(돌아올 곳을 들고) */
export default async function NewListingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/market/new');
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DugoutPageHeader
        title="물건 올리기"
        subtitle="사진 한 장, 가격, 한 줄이면 돼요. 규격은 나중에 고쳐도 돼요."
        actions={
          <Link href="/market/sell-preview" className="text-sm font-semibold text-sky">
            새 등록 흐름 미리보기 ›
          </Link>
        }
      />
      <ListingForm
        initial={{
          category: 'glove',
          title: '',
          price: null,
          condition: 'used',
          region: '',
          body: '',
          specs: prefillSpecs('glove', user),
          images: [],
        }}
      />
    </div>
  );
}
