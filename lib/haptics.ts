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
