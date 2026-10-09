import { redirect } from 'next/navigation';
import { toDateKey } from '@/lib/pitch-stats';
import { SETUP_PATH } from '@/lib/feature-locks';
import { loadCalibration } from '@/app/actions/velocity';
import { loadVelocityHistory } from '@/lib/velocity-load';
import { velocityAccess } from './access';
import { AppOnly } from './app-only';
import { VelocityHome } from './velocity-home';

/**
 * 구속 측정 메인 — 불펜 벨로시티의 첫 화면(사용자 요청, 2026-09-28).
 *
 * 투구 기록의 고르개 옆 '구속 측정'과 메뉴의 '구속 측정'이 여기로 온다. 지난 세션들의 구속 변화를
 * 간단히 보고, 오른쪽 위에서 설정하고, 아래 '측정 시작'으로 설정 단계 → 측정(/velocity/measure)으로
 * 간다. 왼쪽 위는 투구 기록으로 돌아가기.
 *
 * 앱(스마트폰 껍데기) 안이거나 관리자일 때만 연다(access.ts). 운동 화면과 같은 (session) 그룹 —
 * 위 막대 · 하단 탭 없이 화면 전체를 쓰고, PC 에서는 폰 크기 틀 안에 띄운다.
 */
export default async function VelocityPage() {
  const { user, allowed, pitchLocked } = await velocityAccess();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 */
  if (pitchLocked) redirect(SETUP_PATH.pitch);
  if (!allowed) return <AppOnly />;

  const [history, { fit }] = await Promise.all([
    loadVelocityHistory(user.id),
    loadCalibration(),
  ]);

  return (
    <VelocityHome history={history} calibration={fit} today={toDateKey(new Date())} />
  );
}
