import { toDateKey } from '@/lib/pitch-stats';
import { loadCalibration } from '@/app/actions/velocity';
import { velocityAccess } from '../access';
import { VelocityScreen } from '../velocity-screen';
import { AppOnly } from '../app-only';

/**
 * 불펜 벨로시티 — 측정. 설정 단계(지난 설정 → 고르기 → 주의사항 → 수평 → 존)를 지나 카메라로
 * 잰다(velocity-screen.tsx). 홈(/velocity)의 '측정 시작'이 여기로 온다.
 *
 * 운동 화면과 같은 (session) 그룹 — 위 막대 · 하단 탭 없이 화면 전체를 쓴다. 폰 느낌으로 만든
 * 화면이라 PC 에서는 폰 크기 틀 안에 띄운다.
 */
export default async function VelocityMeasurePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ user, isAdmin, native, allowed }, { resume }] = await Promise.all([velocityAccess(), searchParams]);
  if (!allowed) return <AppOnly />;

  /* 그 사람의 스피드건 짝으로 맞춘 보정식 — 화면은 이걸로 잰 값을 바로 보정해 보여 준다 */
  const { fit } = await loadCalibration();

  return (
    <VelocityScreen
      isAdmin={isAdmin}
      native={native}
      today={toDateKey(new Date())}
      calibration={fit}
      throwingHand={user.throwingHand}
      resume={resume === '1'}
    />
  );
}
