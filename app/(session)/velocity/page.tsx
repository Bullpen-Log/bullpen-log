import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { isNativeUserAgent } from '@/lib/app-env';
import { toDateKey } from '@/lib/pitch-stats';
import { loadCalibration } from '@/app/actions/velocity';
import { VelocityScreen } from './velocity-screen';
import { AppOnly } from './app-only';

/**
 * 구속 측정 — 폰 카메라로 공을 찍어 구속을 재고 투구 기록에 남긴다.
 *
 * 앱(스마트폰 네이티브 껍데기) 안에서만 연다. 폰의 고속 촬영(120~240fps)이 있어야 공이
 * 날아가는 모습이 담기는데, 웹 브라우저의 카메라는 30~60fps 까지만 주어서다. 그래서
 * 일반 계정이 웹에서 열면 '앱에서 쓸 수 있어요'만 보인다.
 *
 * 관리자는 웹에서도 연다(사용자 요청) — 스피드건과 견주며 보정하는 일을 하려면 PC 에서도
 * 흐름을 봐야 한다. 웹에서는 시험 모드라고 화면에 적는다.
 *
 * 운동 화면과 같은 (session) 그룹에 둔다 — 위 막대 · 하단 탭 없이 화면 전체를 쓴다.
 * 폰 느낌으로 만든 화면이라 PC 에서는 폰 크기 틀 안에 띄운다(velocity-screen.tsx).
 */
export default async function VelocityPage() {
  const user = await requireUser();
  const native = isNativeUserAgent((await headers()).get('user-agent'));
  const isAdmin = user.role === 'ADMIN';

  if (!isAdmin && !native) return <AppOnly />;

  /* 그 사람의 스피드건 짝으로 맞춘 보정식 — 화면은 이걸로 잰 값을 바로 보정해 보여 준다 */
  const { fit } = await loadCalibration();

  return (
    <VelocityScreen
      isAdmin={isAdmin}
      native={native}
      today={toDateKey(new Date())}
      calibration={fit}
    />
  );
}
