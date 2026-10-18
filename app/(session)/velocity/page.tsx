import { headers } from 'next/headers';
import { appNow } from '@/lib/clock';
import { isExpoUserAgent } from '@/lib/app-env';
import { redirect } from 'next/navigation';
import { toDateKey } from '@/lib/pitch-stats';
import { SETUP_PATH } from '@/lib/feature-locks';
import { loadCalibration } from '@/app/actions/velocity';
import { loadVelocityHistory } from '@/lib/velocity-load';
import { velocityAccess } from './access';
import { AppOnly } from './app-only';
import { VelocityScreen } from './velocity-screen';
import { OpenNative } from './open-native';

/**
 * 구속 측정 — 첫 화면이 곧 카메라다(2026-10-15 김민: "기본 홈화면을 카메라처럼, 측정 시작을 누르면 그 위로 안내창 · 밑의 촬영 단추는
 * 가리지 않게"). 왼쪽 아래 기록 단추(지난 세션 · 저장하지 않은 공), 가운데 셔터 '측정 시작' → 카메라 위 안내창(지난 설정 · 종류 ·
 * 카메라 위치 · 주의사항) → 수평 · 존 → 측정(velocity-screen.tsx). 홈 탭에서 오른쪽으로 쓸면 여기로 온다.
 *
 * 앱(스마트폰 껍데기) 안이거나 관리자일 때만 연다(access.ts). 운동 화면과 같은 (session) 그룹 — 위 막대 · 하단 탭 없이 화면 전체를 쓰고,
 * PC 에서는 폰 크기 틀 안에 띄운다. ?resume=1 — 폰에 맡겨 둔 저장하지 않은 공을 세션 요약부터.
 */
export default async function VelocityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  /*
   * 새 아이폰 앱(Expo)은 구속 측정을 앱 화면으로 연다 — 웹 화면은 앱 카메라 다리가 없어 웹 카메라(30fps)로 켜졌다. ?web=1 은 예외:
   * 옛 앱이 웹 저장소에 남긴 저장 안 한 세션을 이 화면이 마무리한다(앱 껍데기가 켤 때 묻는다 — native/src/app/index.tsx OLD_VELOCITY).
   */
  if (params.web !== '1' && isExpoUserAgent((await headers()).get('user-agent'))) return <OpenNative path="/velocity" />;
  const { resume } = params;
  const { user, allowed, pitchLocked, isAdmin, native } = await velocityAccess();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 */
  if (pitchLocked) redirect(SETUP_PATH.pitch);
  if (!allowed) return <AppOnly />;

  /* 그 사람의 스피드건 짝으로 맞춘 보정식 — 화면은 이걸로 잰 값을 바로 보정해 보여 준다 */
  const [history, { fit }] = await Promise.all([
    loadVelocityHistory(user.id),
    loadCalibration(),
  ]);

  return (
    <VelocityScreen
      isAdmin={isAdmin}
      native={native}
      today={toDateKey(appNow())}
      calibration={fit}
      history={history}
      resume={resume === '1'}
    />
  );
}
