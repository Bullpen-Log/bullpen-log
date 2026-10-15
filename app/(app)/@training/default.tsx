import { requireUser } from '@/lib/dal';
import { featureLocks } from '@/lib/feature-locks';
import { TabLocked } from '@/components/tab-locked';
import TrainingPage from '@/app/(app)/training/training-page';

/** 트레이닝 판 — 탭의 첫 화면은 트레이닝 홈(?view=home, lib/training-part.ts). 잠겨 있으면 잠긴 판 */
export default async function TrainingSlotDefault() {
  const user = await requireUser();
  if (featureLocks(user).training) return <TabLocked feature="training" />;
  return <TrainingPage searchParams={Promise.resolve({ view: 'home' })} />;
}
