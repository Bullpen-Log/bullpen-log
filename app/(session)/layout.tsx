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
   * 높이를 화면 높이에 못박는다(h-, min-h- 가 아니다).
   *
   * 운동·워밍업 화면은 [위 머리글 · 가운데 굴러가는 칸(flex-1 overflow-y-auto) ·
   * 아래 누르는 막대]를 이 틀 안에 쌓는다. 가운데 칸이 스스로 굴러가려면 틀의
   * 높이가 정해져 있어야 한다. 예전처럼 min-h 만 주면 틀이 내용만큼 늘어나고
   * 가운데 칸은 굴러가지 않아서, 자세·영상을 펼치거나 세트가 쌓이면 [세트 기록]이
   * 있는 아래 막대가 화면 밖으로 밀려났다 — 세트마다 스크롤해야 했고, 다음 운동으로
   * 넘어갈 때 맨 위로 올리는 것(topRef.scrollTo)도 듣지 않았다.
   *
   * 100vh 가 아니라 100dvh 다. 휴대폰 브라우저의 주소창이 접혔다 펴질 때
   * 100vh 는 안 바뀌어서 아래 단추가 주소창 뒤로 숨는다.
   */
  return <div className="flex h-[100dvh] flex-col bg-page">{children}</div>;
}
