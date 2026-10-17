/**
 * 아이폰 앱(native/, Expo)과 서버가 맞추는 약속 번호.
 *
 * 앱은 요청마다 `x-bullpen-app: <APP_API_LEVEL>` 머리를 보낸다. 서버(/api/rpc)는 MIN_APP_API 보다 낮으면 426 을 돌려주고,
 * 앱은 '업데이트해 주세요' 화면을 띄운다(2026-10-17 엔지니어링 검토 D7). 지금 앱은 사이트를 불러와 늘 최신이지만, Expo 앱은
 * 사람마다 다른 판이 깔려 있어 서버 액션의 인자 · 돌려주는 모양을 바꾸면 업데이트 안 받은 앱이 깨진다.
 *
 * - 서버 액션의 인자나 돌려주는 모양을 앱이 못 알아듣게 바꾸면: APP_API_LEVEL 을 올리고, 옛 앱이 다 업데이트받기 전이라도
 *   막아야 하면 MIN_APP_API 도 올린다.
 * - 머리는 사이트 밖에서 쿠키만으로 /api/rpc 를 부르는 것(CSRF)도 막는다 — 브라우저는 남의 사이트에서 이런 머리를 못 붙인다.
 *
 * 순수 파일이다(웹 · 앱이 같이 쓴다). 앱 묶음에는 만들 때의 APP_API_LEVEL 이 박힌다.
 */
export const APP_API_HEADER = 'x-bullpen-app';

/** 이 코드가 말하는 약속 번호 — 앱은 이 값을 보낸다 */
export const APP_API_LEVEL = 1;

/** 서버가 받는 가장 낮은 번호 */
export const MIN_APP_API = 1;

/** 머리 값 → 번호(없거나 숫자가 아니면 0 — 앱이 아니거나 아주 옛 판) */
export function appApiLevelOf(header: string | null | undefined): number {
  const n = Number.parseInt(header ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
