import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { requireUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadFocusProgress, loadLabSample } from '@/lib/pitch-lab';
import { isLabId } from '@/lib/pitch-lab-meta';
import { getEngineBuild, isPitch3dV2Configured } from '@/lib/pitch-3d/v2/gpu-client';
import { isYouth, reportDrillsOf } from '@/lib/pitch-3d/v2/report';
import { trainingGuides } from '@/lib/library-cache';
import { groupDrills } from '@/lib/mechanics/drills';
import { LabDetail } from './lab-detail';

/**
 * 3D 동작 분석(베타) 하나 — 3D(v2, 서버 GPU) 결과 화면. 자기 것만(관리자는 관리자끼리). 목록(/videos/lab)의 카드에서 들어온다.
 * 서버 분석 설정(PITCH3D_GPU_*)이 없으면 결과 보기만 되고 분석 걸기 단추는 숨는다(검토 2절 NotConfigured).
 * 분석 서버의 엔진 지문도 묻는다 — 결과가 옛 엔진이면 '다시 분석' 띠(getEngineBuild).
 * 리포트의 처방이 드릴을 고르게 드릴 목록을 함께 넘긴다(lib/pitch-3d/v2/report.ts — 리포트는 화면이 결과로 셈한다).
 */
export default async function LabSamplePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ web?: string }>;
}) {
  const user = await requireUser();
  /* 투구 첫 설정 전이면 다른 투구 화면처럼 설정으로 */
  if (featureLocks(user).pitch) redirect(SETUP_PATH.pitch);
  const { id } = await params;
  if (!isLabId(id)) notFound();
  /*
   * 새 아이폰 앱(Expo)이 3D 결과 화면을 아는 판(BullpenNative/8 부터)이면 앱 화면으로 연다(native/src/app/lab/[id].tsx — 둘레는 앱, 3D 칸은
   * app/embed/lab/[id] 웹뷰). 앱 화면의 '웹에서 분석하기'(분석 걸기 · 동의 · 촬영 안내는 웹에만)는 ?web=1 로 와서 여기를 건너뛴다.
   */
  if ((await searchParams).web !== '1' && expoLevel((await headers()).get('user-agent')) >= 8)
    return <OpenNative path={`/lab/${id}`} cover={false} />;
  const [sample, guides, engineBuild, focus] = await Promise.all([
    loadLabSample(id, user),
    trainingGuides(),
    getEngineBuild(),
    loadFocusProgress(user.id).catch(() => null),
  ]);
  if (!sample) notFound();
  const mine = sample.ownerId === user.id;
  return (
    <LabDetail
      sample={sample}
      v2Enabled={isPitch3dV2Configured()}
      engineBuild={engineBuild}
      drills={reportDrillsOf(groupDrills(guides))}
      youth={mine && isYouth(user.birthDate, new Date())}
      mine={mine}
      focus={mine && focus?.reportId === id ? { done: focus.done, total: focus.total } : null}
      /* 샘플에 키가 비어 있으면(예전 샘플) 내 샘플일 때만 가입 때 적은 키로 — 3D 인형 크기 · 점검 cm */
      ownerHeightCm={sample.ownerId === user.id ? (user.heightCm ?? null) : null}
    />
  );
}
