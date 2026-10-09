import { requireAdmin } from '@/lib/dal';
import { ShootOverview } from './overview';

/**
 * 트레이닝 영상 촬영 — 관리자 메인.
 *
 * 2026-10-09 사용자: "메인에서 게이지 형태로 어느 정도 진행했는지 · 웹에서는 더 정보를 많이". 휴대폰(앱)은 게이지 · 이어 찍기 ·
 * 주차 카드까지, PC 는 그 밑에 자리 · 부위 · 카테고리별 진행, 날별 촬영 속도, 최근 체크, 올릴 차례를 더 편다.
 * 계획은 lib/shoot/plan-data.json(고정), 체크는 DB ShootCheck.
 */
export default async function ShootAdminPage() {
  await requireAdmin();
  return <ShootOverview />;
}
