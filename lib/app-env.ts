/**
 * 지금 화면이 '앱'(스마트폰 네이티브 껍데기) 안에서 열렸는지 가린다.
 *
 * 구속 측정처럼 폰 카메라의 고속 촬영(120~240fps)이 있어야 제대로 도는 기능은 웹에서는
 * 열지 않는다. 브라우저의 getUserMedia 는 대개 30~60fps 까지만 주어서, 웹에서 잰 숫자는
 * 앱에서 잰 숫자와 다르다. 틀린 숫자가 기록에 섞이는 것보다 안 보이는 편이 낫다.
 *
 * 앱 껍데기(Capacitor 등)는 브라우저 이름표(User-Agent)에 아래 표시를 덧붙인다 —
 * Capacitor 라면 capacitor.config 의 `appendUserAgent: 'BullpenLogApp/1.0'`.
 * 서버는 요청 머리에서, 화면은 navigator.userAgent 에서 같은 표시를 본다.
 *
 * 관리자는 웹에서도 연다(사용자 요청) — 스피드건과 견주며 보정하는 일을 PC 에서도 해야
 * 해서다. 그 판단은 이 파일이 아니라 부르는 쪽(app/(session)/velocity/page.tsx)이 한다.
 */

/** 앱 껍데기가 User-Agent 에 덧붙이는 표시 */
export const NATIVE_UA_MARK = 'BullpenLogApp';

/** 서버 — 요청 머리의 User-Agent 로 판단한다 */
export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && userAgent.includes(NATIVE_UA_MARK);
}

/**
 * 화면(브라우저) — 앱 껍데기 안인가.
 *
 * Capacitor 는 window.Capacitor 를 심어 주므로 그것도 본다. 표시가 하나도 없으면 웹이다.
 */
export function isNativeClient(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (
    window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  return isNativeUserAgent(navigator.userAgent);
}
