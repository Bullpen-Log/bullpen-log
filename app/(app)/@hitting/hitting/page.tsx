import HittingPage from '@/app/(app)/hitting/hitting-page';
import { betaPanelHidden } from '@/lib/dal';

/* 출시 전 베타 — 판을 그리지 않는다(lib/dal.ts betaPanelHidden) */
export default async function HittingTabPage() {
  if (await betaPanelHidden()) return null;
  return <HittingPage />;
}
