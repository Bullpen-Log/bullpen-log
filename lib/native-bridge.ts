/**
 * 아이폰 앱(mobile/ 의 Capacitor 껍데기)의 '불펜로그 앱 기능' 부품 — 화면 켜 두기 · 휴식 끝 알림.
 *
 * 앱 쪽은 mobile/ios/App/App/BullpenNativePlugin.swift(jsName 'BullpenNative'). 사이트는 Capacitor 패키지 없이
 * window.Capacitor.nativePromise 로 부른다(lib/haptics.ts · lib/native-app.ts 와 같은 방식). 부품이 없는 옛 앱 ·
 * 사파리 · PC 에서는 모두 false 를 돌려주고 아무 일도 안 한다 — 부르는 쪽이 웹 방식으로 하면 된다.
 *
 * 왜 앱이 따로 하나(2026-10-03 아이폰 점검):
 * - 화면 켜 두기: 웹의 navigator.wakeLock 은 iOS 18.4 전의 앱 웹뷰에서 잡힌 척만 하고 화면이 꺼졌다(WebKit 254545).
 *   앱은 UIApplication.isIdleTimerDisabled 로 확실히 잡는다.
 * - 휴식 끝 알림: 화면을 잠그거나 다른 앱으로 가면 웹의 시계 · 소리가 멈춰, 주머니 속 폰이 쉬는 시간이 끝나도 조용했다.
 *   앱은 끝날 시각에 로컬 알림을 미리 걸어 두고, 돌아오면 지운다.
 */
type NativeCap = {
  isPluginAvailable?: (name: string) => boolean;
  nativePromise?: (plugin: string, method: string, options?: object) => Promise<unknown>;
};

const PLUGIN = 'BullpenNative';

function bridge(): NativeCap['nativePromise'] | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as Window & { Capacitor?: NativeCap }).Capacitor;
  if (!cap?.nativePromise || !cap.isPluginAvailable?.(PLUGIN)) return null;
  return cap.nativePromise.bind(cap);
}

/** 이 앱에 부품이 있나 — 없으면 웹 방식으로 */
export function hasNativeBridge(): boolean {
  return bridge() !== null;
}

/** 화면 켜 두기 — 켜면 true(앱이 맡음), 부품이 없으면 false */
export function nativeKeepAwake(on: boolean): boolean {
  const call = bridge();
  if (!call) return false;
  call(PLUGIN, 'keepAwake', { on }).catch(() => {});
  return true;
}

/**
 * 끝날 시각(atMs, Date.now 기준)에 로컬 알림을 건다. 같은 id 로 다시 걸면 앞의 것을 바꾼다.
 * 처음 부를 때 아이폰이 알림 허락을 묻는다 — 누른 순간(세트 완료 등)에 부르는 것이 좋다.
 * 앱이 앞에 떠 있는 동안에는 알림이 뜨지 않는다(화면의 시계 · 소리가 맡는다).
 */
export function nativeScheduleAlarm(
  id: string,
  atMs: number,
  title: string,
  body: string
): boolean {
  const call = bridge();
  if (!call) return false;
  call(PLUGIN, 'scheduleAlarm', { id, at: atMs, title, body }).catch(() => {});
  return true;
}

/** 건 알림 지우기 — 다음 세트를 시작했거나 화면을 나갈 때 */
export function nativeCancelAlarm(id: string): boolean {
  const call = bridge();
  if (!call) return false;
  call(PLUGIN, 'cancelAlarm', { id }).catch(() => {});
  return true;
}
