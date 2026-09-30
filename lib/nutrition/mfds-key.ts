import 'server-only';

/**
 * 식약처 인증키 — 환경변수 FOOD_API_KEY.
 *
 * 따로 둔 까닭: 영양 화면(lib/nutrition/load.ts)은 '키가 있나'만 알면 되는데, 그것을 mfds.ts 에서
 * 가져오면 넣어 둔 품목대표 자료(0.8MB)와 순위 모듈까지 그 화면의 서버 묶음에 딸려 온다.
 */
export function mfdsApiKey() {
  const raw = process.env.FOOD_API_KEY?.trim();
  if (!raw) return null;
  /*
   * 포털은 같은 키를 두 모양으로 준다 — 그대로(Decoding)와 주소용으로 바꾼 것(Encoding).
   * 주소에 넣을 때 한 번 더 바꾸므로, 바꾼 것을 넣었으면 되돌려 둔다. 두 번 바뀐
   * 키는 '등록되지 않은 키'로 거절된다.
   */
  try {
    return raw.includes('%') ? decodeURIComponent(raw) : raw;
  } catch {
    return raw;
  }
}

export function mfdsEnabled() {
  return mfdsApiKey() !== null;
}
