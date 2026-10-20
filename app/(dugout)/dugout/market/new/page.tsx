import { redirect } from 'next/navigation';
import { ListingForm } from '@/components/dugout/listing-form';
import { getCurrentUser } from '@/lib/dal';
import { prefillSpecs } from '@/lib/market/specs';

/** 물건 올리기 — 로그인이 필요하다. 안 했으면 로그인으로(돌아올 곳을 들고) */
export default async function NewListingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dugout/market/new');
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-black text-ink">물건 올리기</h1>
        <p className="mt-1 text-sm text-muted">사진 한 장, 가격, 한 줄이면 돼요. 규격은 나중에 고쳐도 돼요.</p>
      </div>
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
