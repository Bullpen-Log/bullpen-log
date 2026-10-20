import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from '@/components/icon';
import { PageHeading } from '@/components/ui';
import { ConfirmButton } from '@/components/master/confirm-button';
import { VenueForm } from '@/components/master/venue-form';
import { deleteVenue } from '@/app/actions/venues';
import { requireMaster } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';
import { parseHours } from '@/lib/market/venues';

export default async function EditVenuePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMaster();
  const { id } = await params;
  const v = await prisma.venue.findUnique({ where: { id } });
  if (!v || v.hiddenAt || (v.ownerId !== user.id && user.role !== 'ADMIN')) notFound();
  const urls = v.images.length ? await createPlaybackUrls(v.images).catch(() => ({}) as Record<string, string>) : {};
  return (
    <div className="stack-page">
      <Link href="/master/venues" className="inline-flex items-center gap-1 text-sm font-semibold text-sky">
        <ArrowLeft className="h-4 w-4" /> 장소 · 예약
      </Link>
      <PageHeading title={v.name} description="덕아웃에서 보이는 그대로 고쳐요." />
      <Link href={`/dugout/venues/${v.id}`} className="text-sm font-semibold text-sky">
        덕아웃에서 보기
      </Link>
      <VenueForm
        initial={{
          id: v.id,
          name: v.name,
          kind: v.kind,
          region: v.region,
          address: v.address ?? '',
          intro: v.intro ?? '',
          slotMin: v.slotMin,
          pricePerSlot: v.pricePerSlot,
          priceNote: v.priceNote ?? '',
          hours: parseHours(v.hours),
          approval: v.approval,
          publicProfile: v.publicProfile,
          images: v.images.map((p) => ({ path: p, url: urls[p] ?? '' })),
        }}
      />
      <div>
        <ConfirmButton action={deleteVenue} fields={{ id: v.id }} message="이 장소를 내릴까요? 덕아웃에서 사라지고 새 예약을 못 받아요." variant="danger">
          장소 내리기
        </ConfirmButton>
      </div>
    </div>
  );
}
