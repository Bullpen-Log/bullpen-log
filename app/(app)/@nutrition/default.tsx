import { Suspense } from 'react';
import { requireUser } from '@/lib/dal';
import { featureLocks } from '@/lib/feature-locks';
import { TabLocked } from '@/components/tab-locked';
import NutritionPage from '@/app/(app)/nutrition/nutrition-page';
import Loading from '@/app/(app)/@nutrition/nutrition/loading';

/** 영양 판 — 주소가 /nutrition 이 아니어도 판 넘기기 자리에 늘 떠 있다. 잠겨 있으면 잠긴 판. 처음 연 탭이 먼저 뜨게 Suspense 로 감싼다(@home/default.tsx) */
export default async function NutritionSlotDefault() {
  const user = await requireUser();
  if (featureLocks(user).nutrition) return <TabLocked feature="nutrition" />;
  return (
    <Suspense fallback={<Loading />}>
      <NutritionPage searchParams={Promise.resolve({})} />
    </Suspense>
  );
}
