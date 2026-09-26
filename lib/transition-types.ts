/**
 * 화면 전환(React <ViewTransition>)에 붙이는 표시.
 *
 * 서버 컴포넌트(app/(app)/layout.tsx)도 읽으므로 react 의 클라이언트 함수와 떼어 여기에
 * 글자만 둔다. 붙이는 쪽은 lib/quiet-refresh.ts.
 */

/**
 * 자료만 새로 받는 전환 — 본문이 페이드하지 않는다.
 *
 * 본문(app-main)의 페이드는 탭을 옮길 때를 위한 것이다. 같은 화면에서 자료만 새로
 * 받을 때(router.refresh)도 같은 전환이 걸려, 알림(종)을 누를 때마다 본문 전체가
 * 흐려졌다 돌아왔다 — 깜빡였다.
 */
export const QUIET_REFRESH = 'quiet-refresh';

/**
 * 투구 기록 팝업을 여는 이동 — 본문이 페이드하지 않는다.
 *
 * 앱 안에서 /pitch-log/<날짜> 로 가면 보던 화면은 그대로 두고 그 위에 팝업이 뜬다
 * (app/(app)/@modal). 그런데 이 이동에도 탭을 옮길 때의 전환이 걸려, 창이 뜨는 동안
 * 본문(app-main)과 상단바의 그림이 창과 어두운 막 위로 올라와 흐려졌다 돌아왔다 — 전환
 * 층은 맨 위 칸(top layer)의 창보다도 위에 그려진다. '오늘 기록 남기기'를 누르면 화면이
 * 한 번 이상해졌다가 창이 뜬 것이 이것이다.
 *
 * 팝업을 여는 링크에 붙인다: <Link transitionTypes={OPEN_POPUP_TYPES}>. 붙이면 본문이
 * 움직일 일이 없으므로 리액트가 화면 전환을 아예 걸지 않는다.
 */
export const OPEN_POPUP = 'open-popup';
export const OPEN_POPUP_TYPES = [OPEN_POPUP];
