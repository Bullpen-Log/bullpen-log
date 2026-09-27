import { requireAdmin } from '@/lib/dal';
import { loadVelocityAdminOverview } from '@/lib/velocity-admin-load';
import { VelocityAdminOverviewView } from './overview-view';

/**
 * 구속 측정 관리자 — 카메라로 잰 값과 스피드건 값을 견줘 정확도를 올리는 자료를 모아 보는 곳.
 *
 * 폰 틀이 아니라 이 저장소의 보통 웹 화면이다(app/(app) 레이아웃이 위 막대 · 도크 · 판을 붙인다).
 * 날짜 하나를 파고드는 화면은 /admin/velocity/<날짜>. 그리는 것은 overview-view.tsx.
 */
export default async function VelocityAdminPage() {
  await requireAdmin();
  const data = await loadVelocityAdminOverview();
  return <VelocityAdminOverviewView data={data} />;
}
