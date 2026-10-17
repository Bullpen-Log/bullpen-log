import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { setStatusBarStyle } from 'expo-status-bar';
import { BullpenNative } from '../../modules/bullpen-native';
import { ShootCamera } from '../../modules/shoot-camera';

/**
 * 작은 다리(2026-10-17 엔지니어링 검토 D4) — 아직 네이티브로 안 옮긴 웹뷰 화면이 옛 Capacitor 앱처럼 진동 · 화면 켜 두기 · 쉬는 시간 알림 ·
 * 상태 막대 색을 쓰게, 웹뷰에 window.Capacitor 흉내를 심는다. 사이트는 그대로(lib/haptics.ts · lib/native-bridge.ts · lib/native-app.ts 가
 * window.Capacitor.nativePromise 로 부른다). 카메라 · 폰 영상(DualCamera · LocalVideo)은 넣지 않는다(D3 — 그 화면은 네이티브로).
 * 예외 하나: 촬영 모드 카메라(ShootCamera — 관리자 촬영 모드, 웹 lib/shoot-camera.ts)는 옛 앱 부품을 모듈로 옮겨 여기로 잇는다(2026-10-18) —
 * 관리자만 쓰는 큰 화면이라 네이티브로 옮기기 전까지 새 앱에서도 찍게. 화면을 다 옮기면 이 파일을 지운다.
 *
 * 웹 → 앱: { t: 'cap', id, plugin, method, options } · 앱 → 웹: window.__bpCapReply(id, ok, value)
 * 웹 → 앱: { t: 'theme', dark, color } — 테마가 바뀔 때(상태 막대 글자색 · 웹뷰 바탕)
 */
const PLUGINS = ['Haptics', 'BullpenNative', 'SystemBars', 'SplashScreen', 'ShootCamera'];

/** 웹뷰가 문서를 읽기 전에 심는 글 — injectedJavaScriptBeforeContentLoaded */
export const CAP_SHIM = `(function () {
  if (window.Capacitor) return;
  var have = ${JSON.stringify(Object.fromEntries(PLUGINS.map((p) => [p, true])))};
  var seq = 0, wait = {};
  var post = function (m) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  window.__bpCapReply = function (id, ok, value, code) {
    var w = wait[id];
    if (!w) return;
    delete wait[id];
    if (ok) return w[0](value);
    var err = new Error(value || 'failed');
    if (code) err.code = code;
    w[1](err);
  };
  window.Capacitor = {
    isPluginAvailable: function (name) { return !!have[name]; },
    nativePromise: function (plugin, method, options) {
      if (!have[plugin]) return Promise.reject(new Error('unavailable'));
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        wait[id] = [resolve, reject];
        post({ t: 'cap', id: id, plugin: plugin, method: method, options: options || {} });
      });
    }
  };
  var theme = function () {
    var root = document.documentElement;
    var bg = document.body ? getComputedStyle(document.body).backgroundColor : '';
    post({ t: 'theme', dark: (root.getAttribute('data-theme') || 'light') !== 'light', color: bg });
  };
  document.addEventListener('DOMContentLoaded', function () {
    theme();
    new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  });
  true;
})();`;

type CapMessage = { t: 'cap'; id: number; plugin: string; method: string; options: Record<string, unknown> };

const IMPACT: Record<string, Haptics.ImpactFeedbackStyle> = {
  LIGHT: Haptics.ImpactFeedbackStyle.Light,
  MEDIUM: Haptics.ImpactFeedbackStyle.Medium,
  HEAVY: Haptics.ImpactFeedbackStyle.Heavy,
};
const NOTIFY: Record<string, Haptics.NotificationFeedbackType> = {
  SUCCESS: Haptics.NotificationFeedbackType.Success,
  WARNING: Haptics.NotificationFeedbackType.Warning,
  ERROR: Haptics.NotificationFeedbackType.Error,
};

async function run({ plugin, method, options: o }: CapMessage): Promise<unknown> {
  if (plugin === 'Haptics') {
    if (method === 'impact') return Haptics.impactAsync(IMPACT[String(o.style)] ?? Haptics.ImpactFeedbackStyle.Light);
    if (method === 'notification')
      return Haptics.notificationAsync(NOTIFY[String(o.type)] ?? Haptics.NotificationFeedbackType.Success);
    if (method === 'selectionChanged') return Haptics.selectionAsync();
    /* 아이폰은 떨림 길이를 못 정한다 — 센 톡 한 번(옛 앱 Capacitor Haptics.vibrate 와 같은 몫) */
    if (method === 'vibrate') return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    return null; // selectionStart · selectionEnd — 준비 단계, 할 일 없음
  }
  if (plugin === 'BullpenNative') {
    if (method === 'keepAwake') return BullpenNative.keepAwake(o.on === true);
    if (method === 'scheduleAlarm')
      return BullpenNative.scheduleAlarm(String(o.id), Number(o.at), String(o.title ?? ''), String(o.body ?? ''));
    if (method === 'cancelAlarm') return BullpenNative.cancelAlarm(String(o.id));
    /* 부품 약속 판(lib/native-api.ts) — 0 이면 사이트가 카메라 같은 판 기능을 이 앱에 안 부른다(그 화면은 네이티브) */
    if (method === 'info') return { api: 0, build: '', version: '' };
  }
  if (plugin === 'SystemBars' && method === 'setStyle') {
    /* 사이트는 밝은 테마에 'LIGHT'(밝은 바탕) — 글자는 어둡게 */
    setStatusBarStyle(o.style === 'LIGHT' ? 'dark' : 'light');
    return null;
  }
  if (plugin === 'SplashScreen' && method === 'hide') return SplashScreen.hideAsync();
  if (plugin === 'ShootCamera') {
    if (method === 'status') return ShootCamera.status();
    if (method === 'record') return ShootCamera.record({ maxSeconds: Number(o.maxSeconds) || 180 });
    if (method === 'read')
      return ShootCamera.read({ path: String(o.path), offset: Number(o.offset) || 0, length: Number(o.length) || undefined });
    if (method === 'discard') return ShootCamera.discard({ paths: Array.isArray(o.paths) ? o.paths.map(String) : [] });
  }
  throw new Error(`${plugin}.${method} 은 이 앱에 없어요`);
}

/** 웹뷰 알림 하나를 받아 처리하고 답을 돌려준다 — 다리 알림이 아니면 false */
export function handleCapMessage(
  data: unknown,
  reply: (script: string) => void,
  onTheme: (t: { dark: boolean; color: string }) => void
): boolean {
  const m = data as Partial<Omit<CapMessage, 't'>> & { t?: string; dark?: boolean; color?: string };
  if (m?.t === 'theme') {
    onTheme({ dark: m.dark === true, color: typeof m.color === 'string' ? m.color : '' });
    setStatusBarStyle(m.dark ? 'light' : 'dark');
    return true;
  }
  if (m?.t !== 'cap' || typeof m.id !== 'number') return false;
  const id = m.id;
  run(m as CapMessage).then(
    (value) => reply(`window.__bpCapReply(${id}, true, ${JSON.stringify(value ?? null)});true;`),
    (e: unknown) => {
      /* 모듈의 오류 종류(denied · busy …)를 웹이 읽는다(lib/shoot-camera.ts 가 e.code 로 가른다) */
      const code = (e as { code?: unknown })?.code;
      reply(
        `window.__bpCapReply(${id}, false, ${JSON.stringify(e instanceof Error ? e.message : String(e))}, ${JSON.stringify(typeof code === 'string' ? code : null)});true;`
      );
    }
  );
  return true;
}
