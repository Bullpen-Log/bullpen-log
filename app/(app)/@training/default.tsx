import { Suspense } from 'react';
import { requireUser } from '@/lib/dal';
import { featureLocks } from '@/lib/feature-locks';
import { TabLocked } from '@/components/tab-locked';
import TrainingPage from '@/app/(app)/training/training-page';
import Loading from '@/app/(app)/@training/training/loading';

/** 트레이닝 판 — 탭의 첫 화면은 트레이닝 홈(?view=home, lib/training-part.ts). 잠겨 있으면 잠긴 판. 처음 연 탭이 먼저 뜨게 Suspense 로 감싼다(@home/default.tsx) */
export default async function TrainingSlotDefault() {
  const user = await requireUser();
  if (featureLocks(user).training) return <TabLocked feature="training" />;
  return (
    <Suspense fallback={<Loading />}>
      <TrainingPage searchParams={Promise.resolve({ view: 'home' })} />
    </Suspense>
  );
}
