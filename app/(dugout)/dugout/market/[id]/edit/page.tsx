import { notFound, redirect } from 'next/navigation';
import { ListingForm } from '@/components/dugout/listing-form';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';
import type { Specs } from '@/lib/market/specs';

/** 내 물건 고치기 — 주인만 */
export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/dugout/market/${id}/edit`);
  const row = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, userId: true, category: true, title: true, price: true, condition: true, region: true, body: true, specs: true, images: true },
  });
  if (!row || row.userId !== user.id) notFound();
  const urls = row.images.length ? await createPlaybackUrls(row.images).catch(() => ({}) as Record<string, string>) : {};
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-black text-ink">물건 고치기</h1>
      <ListingForm
        initial={{
          id: row.id,
          category: row.category,
          title: row.title,
          price: row.price,
          condition: row.condition,
          region: row.region,
          body: row.body,
          specs: (row.specs && typeof row.specs === 'object' ? (row.specs as Specs) : {}) as Specs,
          images: row.images.map((p) => ({ path: p, url: urls[p] ?? '' })),
        }}
      />
    </div>
  );
}
