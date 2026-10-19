import { redirect } from 'next/navigation';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { SETUP_PATH } from '@/lib/feature-locks';
import { loadCalibration } from '@/app/actions/velocity';
import { loadVelocityHistory } from '@/lib/velocity-load';
import { velocityAccess } from '../velocity/access';
import { AppOnly } from '../velocity/app-only';
import { VelocityScreen } from '../velocity/velocity-screen';

/**
 * ABS(볼 · 스트라이크 자동 판정) — 구속 측정과 같은 카메라 화면을 **판정 모드**로 연다(2026-10-18 사용자: "구속 측정 안에서도 되지만 별개의 기능으로
 * 따로도 쓸 수 있어야"). 다른 점: 제목 'ABS 판정' · 셔터 '판정 시작' · ABS 가 켜진 채(종류 단계의 스위치를 안 눌러도) · 카메라는 투수 뒤.
 * 공마다 구속도 같이 잰다(같은 엔진). 검문 2 전까지 관리자만(lib/nav.ts).
 */
export default async function AbsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  /*
   * 새 아이폰 앱(Expo)에도 이 웹 화면을 그대로 그린다 — 앱에 ABS 네이티브 화면이 없어, 구속 측정처럼 앱 화면으로 넘기면(OpenNative) 앱이 모르는
   * 주소라 아무것도 안 열리고 웹은 뒤로 돌아갔다(2026-10-19 사용자: "메뉴는 있는데 기능이 열리지 않아"). 카메라는 웹뷰 카메라(getUserMedia)라
   * 앱 카메라(2배 · 손떨림 보정)보다 덜 정확하다 — 화면이 기준 밖 알림으로 알린다. 앱 화면으로 옮기는 건 맥에서 새 앱을 구울 때.
   */
  const { user, allowed, pitchLocked, isAdmin, native } = await velocityAccess();
  if (pitchLocked) redirect(SETUP_PATH.pitch);
  if (!allowed || !isAdmin) return <AppOnly />;
  const [history, { fit }] = await Promise.all([loadVelocityHistory(user.id), loadCalibration()]);
  return (
    <VelocityScreen
      isAdmin={isAdmin}
      native={native}
      today={toDateKey(appNow())}
      calibration={fit}
      history={history}
      resume={params.resume === '1'}
      absMode
    />
  );
}
