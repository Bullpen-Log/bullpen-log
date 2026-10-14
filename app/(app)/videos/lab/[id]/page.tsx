import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { loadLabSample } from '@/lib/pitch-lab';
import { isLabId } from '@/lib/pitch-lab-meta';
import { getEngineBuild, isPitch3dV2Configured } from '@/lib/pitch-3d/v2/gpu-client';
import { MECH_FOCUS_POINTS } from '@/lib/pitch-3d/v2/mech-judge';
import { trainingGuides } from '@/lib/library-cache';
import { drillPicksFor, groupDrills } from '@/lib/mechanics/drills';
import { LabDetail } from './lab-detail';

/**
 * 3D 동작 분석(베타) 하나 — 3D(v2, 서버 GPU) 결과 화면. 자기 것만(관리자는 관리자끼리). 목록(/videos/lab)의 카드에서 들어온다.
 * 서버 분석 설정(PITCH3D_GPU_*)이 없으면 결과 보기만 되고 분석 걸기 단추는 숨는다(검토 2절 NotConfigured).
 * 분석 서버의 엔진 지문도 묻는다 — 결과가 옛 엔진이면 '다시 분석' 띠(getEngineBuild).
 * 메커니즘 점검 카드가 고칠 요소의 드릴을 보이게 요소별 드릴(쉬운 단계부터 셋 · 전체 수)을 함께 넘긴다.
 */
export default async function LabSamplePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!isLabId(id)) notFound();
  const [sample, guides, engineBuild] = await Promise.all([
    loadLabSample(id, user),
    trainingGuides(),
    getEngineBuild(),
  ]);
  if (!sample) notFound();
  const drills = groupDrills(guides);
  const drillPicks = Object.fromEntries(MECH_FOCUS_POINTS.map((f) => [f, drillPicksFor(drills, f)]));
  return (
    <LabDetail
      sample={sample}
      v2Enabled={isPitch3dV2Configured()}
      engineBuild={engineBuild}
      drillPicks={drillPicks}
    />
  );
}
