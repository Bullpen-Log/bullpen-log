import 'server-only';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { isNativeUserAgent } from '@/lib/app-env';
import { featureLocks } from '@/lib/feature-locks';

/**
 * 불펜 벨로시티를 열 수 있나 — 홈(/velocity)과 측정(/velocity/measure)이 같은 규칙을 쓴다.
 *
 * 앱(스마트폰 네이티브 껍데기) 안에서만 연다. 폰의 고속 촬영이 있어야 공이 날아가는 모습이
 * 담기는데, 웹 브라우저의 카메라는 30~60fps 까지만 주어서다. 관리자는 웹에서도 연다(사용자
 * 요청) — 스피드건과 견주며 보정하는 일을 PC 에서도 해야 해서.
 *
 * 구속 측정은 투구 기록 탭에 속한다 — 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다.
 * 잠겼으면 pitchLocked 가 true 고, 두 페이지가 첫 설정 화면으로 보낸다.
 */
export async function velocityAccess() {
  const user = await requireUser();
  const native = isNativeUserAgent((await headers()).get('user-agent'));
  const isAdmin = user.role === 'ADMIN';
  return {
    user,
    native,
    isAdmin,
    allowed: isAdmin || native,
    pitchLocked: featureLocks(user).pitch,
  };
}
