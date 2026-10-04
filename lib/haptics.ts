/**
 * 떨기 — 안드로이드 · 크롬은 navigator.vibrate, 아이폰 앱은 앱의 진동(@capacitor/haptics — mobile/). 아이폰 웹(사파리)은
 * 진동을 쓸 수 없어 아무 일도 없다.
 *
 * 아이폰은 웹에서 진동이 안 되고 무음 모드면 끝 소리도 안 나서, 체육관에서 버티기 · 쉬기가 끝나도 아무 신호가 없었다
 * (2026-09-30 점검). 앱은 사이트를 그대로 여는 껍데기라 Capacitor 패키지 없이 window.Capacitor.nativePromise 로
 * 부른다(lib/native-app.ts 와 같은 방식). 진동이 든 앱을 아직 안 깔았으면(isPluginAvailable 거짓) 웹과 같다.
 *
 * pattern 은 navigator.vibrate 와 같다 — 켜짐 · 꺼짐(ms)을 번갈아. 아이폰 앱은 길이를 못 정해서(시스템 진동 한 번 ≈
 * 0.4초) 켜짐마다 한 번씩 떨고, 붙어서 한 번으로 느껴지지 않게 0.5초씩 띄운다 — 버티기 끝 두 번 · 쉬기 끝 한 번이 손에
 * 그대로 갈린다. 아주 짧은 떨림(20ms 이하, 체크했을 때)은 가벼운 톡(impact LIGHT)으로.
 */
type NativeBridge = {
  isPluginAvailable?: (name: string) => boolean;
  nativePromise?: (
    plugin: string,
    method: string,
    options?: object
  ) => Promise<unknown>;
};

/** 아이폰 앱의 한 번 떨림이 끝나기 전에 다음을 부르면 이어져 한 번으로 느껴진다 */
const NATIVE_GAP_MS = 500;

export function buzz(pattern: number | readonly number[]) {
  if (typeof window === 'undefined') return;
  const cap = (window as Window & { Capacitor?: NativeBridge }).Capacitor;
  const native = cap?.nativePromise;
  if (native && cap.isPluginAvailable?.('Haptics')) {
    const steps = typeof pattern === 'number' ? [pattern] : pattern;
    let at = 0;
    let free = 0;
    steps.forEach((ms, i) => {
      if (i % 2 === 0 && ms > 0) {
        const start = Math.max(at, free);
        free = start + NATIVE_GAP_MS;
        window.setTimeout(() => {
          const call =
            ms <= 20
              ? native('Haptics', 'impact', { style: 'LIGHT' })
              : native('Haptics', 'vibrate', { duration: ms });
          call.catch(() => {});
        }, start);
      }
      at += ms;
    });
    return;
  }
  if ('vibrate' in navigator) navigator.vibrate(pattern as number | number[]);
}

/**
 * 손맛 떨림 — 아이폰이 단추 · 고르개 · 저장에 쓰는 짧은 떨림을 뜻으로 고른다(2026-10-04 '앱 느낌' 3단계).
 *
 *   selection  고르개 · 스위치 · 칩처럼 값이 바뀌었을 때 — 가장 가벼운 '톡'(UISelectionFeedbackGenerator)
 *   light      당겨서 새로고침이 걸리는 순간 · 체크처럼 가볍게 누른 것
 *   medium     지우기처럼 무게 있는 것을 확정할 때
 *   success · warning · error  저장 끝 · 조심 · 실패 — 아이폰 알림 떨림(두세 번 짧게)
 *
 * 예전에는 버티기 · 쉬기 끝(buzz) 말고는 손에 오는 것이 없어서, 고르고 저장해도 웹페이지를 누르는 느낌이었다.
 * 아이폰 앱은 @capacitor/haptics 로, 안드로이드 · 크롬은 짧은 navigator.vibrate 로, 아이폰 사파리는 아무 일도 없다.
 */
export type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error';

/** 안드로이드 · 크롬의 대신할 떨림(ms) — 아이폰 것보다 거칠어서 짧게만 */
const WEB_PATTERN: Record<HapticKind, number | number[]> = {
  selection: 8,
  light: 10,
  medium: 18,
  success: [12, 60, 12],
  warning: [18, 80, 18],
  error: [25, 60, 25, 60, 25],
};

/** 고르기 떨림은 준비(selectionStart)를 한 번 해 둬야 난다 — 한 번 하면 앱이 켜져 있는 동안 그대로 쓴다 */
let selectionReady = false;

export function haptic(kind: HapticKind) {
  if (typeof window === 'undefined') return;
  const cap = (window as Window & { Capacitor?: NativeBridge }).Capacitor;
  const native = cap?.nativePromise;
  if (native && cap.isPluginAvailable?.('Haptics')) {
    const call = (method: string, options?: object) =>
      native('Haptics', method, options).catch(() => {});
    if (kind === 'selection') {
      if (!selectionReady) {
        selectionReady = true;
        call('selectionStart');
      }
      call('selectionChanged');
    } else if (kind === 'light' || kind === 'medium') {
      call('impact', { style: kind === 'light' ? 'LIGHT' : 'MEDIUM' });
    } else {
      call('notification', { type: kind.toUpperCase() });
    }
    return;
  }
  /*
   * 손가락 화면에서만 — PC 크롬도 vibrate 가 있지만 떨 것이 없다. 아직 한 번도 누르지 않은 화면(저장 뒤 새로 열린 화면 등)은
   * 크롬이 막고 콘솔에 오류를 남기므로 건너뛴다.
   */
  const touched = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation?.hasBeenActive;
  if ('vibrate' in navigator && touched !== false && matchMedia('(pointer: coarse)').matches) {
    navigator.vibrate(WEB_PATTERN[kind]);
  }
}
