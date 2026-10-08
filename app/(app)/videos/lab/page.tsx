import { requireAdmin } from '@/lib/dal';
import { listLabSamples } from '@/lib/pitch-lab';
import { LabClient } from './lab-client';

/**
 * 투구 분석(베타) — 옆 · 뒤 영상 짝을 올려 두는 실험실. 투구 기록의 '구속 측정' 옆 단추로 들어온다. 관리자만.
 *
 * 2026-10-08 사용자: "3루 · 2루에서 동시에 찍으면 3D 분석이 가능하지 않을까 — 베타 화면을 만들고 샘플을 올릴 공간을 따로".
 * 지금은 올리기 · 나란히 보기 · 지우기까지. 분석은 올린 샘플로 만든다(lib/pitch-lab.ts 의 폴더를 실험대가 내려받는다).
 * 투구 기록 아래(/videos/…)라 메뉴의 투구 기록에 불이 들어온다.
 */
export default async function PitchLabPage() {
  const user = await requireAdmin();
  const samples = await listLabSamples(user.id);
  return <LabClient samples={samples} defaultHeightCm={user.heightCm ?? null} />;
}
