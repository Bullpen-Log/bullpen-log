import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/dal';
import { loadLabSample } from '@/lib/pitch-lab';
import { isLabId } from '@/lib/pitch-lab-meta';
import { isPitch3dV2Configured } from '@/lib/pitch-3d/v2/gpu-client';
import { MECH_FOCUS_POINTS } from '@/lib/pitch-3d/v2/mech-judge';
import { visibleGuides } from '@/lib/library-cache';
import { drillPicksFor, groupDrills } from '@/lib/mechanics/drills';
import { LabDetail } from './lab-detail';

/**
 * 투구 분석(베타) 샘플 하나 — 3D(v2, 서버 GPU) 결과 화면. 관리자만. 목록(/videos/lab)의 카드에서 들어온다.
 * 서버 분석 설정(PITCH3D_GPU_*)이 없으면 결과 보기만 되고 분석 걸기 단추는 숨는다(검토 2절 NotConfigured).
 * 메커니즘 점검 카드가 고칠 요소의 드릴을 보이게 요소별 드릴(쉬운 단계부터 셋 · 전체 수)을 함께 넘긴다.
 */
export default async function LabSamplePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!isLabId(id)) notFound();
  const [sample, guides] = await Promise.all([loadLabSample(id, user.id), visibleGuides()]);
  if (!sample) notFound();
  const drills = groupDrills(guides);
  const drillPicks = Object.fromEntries(MECH_FOCUS_POINTS.map((f) => [f, drillPicksFor(drills, f)]));
  return <LabDetail sample={sample} v2Enabled={isPitch3dV2Configured()} drillPicks={drillPicks} />;
}
