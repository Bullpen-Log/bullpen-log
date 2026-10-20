import { PageHeading } from '@/components/ui';
import { VenueForm } from '@/components/master/venue-form';
import { requireMaster } from '@/lib/dal';

export default async function NewVenuePage() {
  await requireMaster();
  return (
    <div className="stack-page">
      <PageHeading title="장소 등록" description="영업시간과 한 칸 길이만 적으면 덕아웃에서 빈 칸을 골라 예약해요." />
      <VenueForm
        initial={{
          name: '',
          kind: 'indoor',
          region: '',
          address: '',
          intro: '',
          slotMin: 60,
          pricePerSlot: null,
          priceNote: '',
          hours: { 0: { open: '10:00', close: '22:00' }, 1: { open: '10:00', close: '22:00' }, 2: { open: '10:00', close: '22:00' }, 3: { open: '10:00', close: '22:00' }, 4: { open: '10:00', close: '22:00' }, 5: { open: '10:00', close: '22:00' }, 6: { open: '10:00', close: '22:00' } },
          approval: true,
          publicProfile: true,
          images: [],
        }}
      />
    </div>
  );
}
