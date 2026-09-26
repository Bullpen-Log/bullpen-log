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
