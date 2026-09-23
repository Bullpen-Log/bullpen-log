import type { Viewport } from 'next';
import { requireUser } from '@/lib/dal';

/**
 * 운동하는 동안의 껍데기.
 *
 * app 그룹 바깥에 둔다. 사이드바·상단바·하단 탭바는 app/(app)/layout.tsx
 * 안에만 붙어 있어서, 그 바깥에 두면 아무것도 안 따라온다 — 끄는 코드가 한
 * 줄도 필요 없다. 약관 화면이 같은 이유로 이미 그렇게 되어 있다.
 *
 * 대신 로그인 방어를 직접 해야 한다. 이 앱에는 미들웨어가 없어서 방어선이
 * requireUser() 하나뿐이다 (lib/dal.ts). 여기서 안 부르면 로그인하지 않은
 * 사람이 운동 화면을 그냥 연다.
 */
export const viewport: Viewport = {
  /*
   * 화면 끝까지 쓴다. 이걸 켜야 아래쪽 안전영역(env(safe-area-inset-bottom))
   * 값이 살아난다 — 지금 앱 전체가 이 설정이 없어서 아이폰에서 그 값이 0이다.
   * 그래서 이 화면의 단추들은 최소값을 함께 준다.
   */
  viewportFit: 'cover',
  /* 숫자판이 올라올 때 화면을 줄인다. 단추가 가려지지 않게 */
  interactiveWidget: 'resizes-content',
};

export default async function SessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  /*
   * 100vh 가 아니라 100dvh 다. 휴대폰 브라우저의 주소창이 접혔다 펴질 때
   * 100vh 는 안 바뀌어서 아래 단추가 주소창 뒤로 숨는다.
   */
  return <div className="flex min-h-[100dvh] flex-col bg-page">{children}</div>;
}
