import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { setStatusBarStyle } from 'expo-status-bar';
import { BullpenNative } from '../../modules/bullpen-native';
import { LocalVideo } from '../../modules/local-video';
import { ShootCamera } from '../../modules/shoot-camera';

/**
 * 작은 다리(2026-10-17 엔지니어링 검토 D4) — 아직 네이티브로 안 옮긴 웹뷰 화면이 옛 Capacitor 앱처럼 진동 · 화면 켜 두기 · 쉬는 시간 알림 ·
 * 상태 막대 색을 쓰게, 웹뷰에 window.Capacitor 흉내를 심는다. 사이트는 그대로(lib/haptics.ts · lib/native-bridge.ts · lib/native-app.ts 가
 * window.Capacitor.nativePromise 로 부른다). 카메라(DualCamera)는 넣지 않는다(D3 — 그 화면은 네이티브로).
 * 폰 영상(LocalVideo)은 넣는다(2026-10-20 1번 대조 검토) — 앱 안 웹 홈 그날 칸 · 구속 클립 · 투구 갤러리 · 비교가 폰에 둔 회원 영상을 틀어야 해서
 * (안 이으면 '찍은 폰의 앱에서 볼 수 있어요'라는 틀린 글이 떴다). 라이브러리 영상 기능(library*)은 빼 둔다 — 새 앱엔 앱 안 영상 묶음이 없어
 * 웹이 그 길을 타면 영상을 통째로 받아 base64 로 넘긴다. 빠지면 웹이 서버 주소로 바로 튼다(lib/local-video.ts libraryVideoFromPhone).
 * 예외 하나: 촬영 모드 카메라(ShootCamera — 관리자 촬영 모드, 웹 lib/shoot-camera.ts)는 옛 앱 부품을 모듈로 옮겨 여기로 잇는다(2026-10-18) —
 * 관리자만 쓰는 큰 화면이라 네이티브로 옮기기 전까지 새 앱에서도 찍게. 화면을 다 옮기면 이 파일을 지운다.
 *
 * 웹 → 앱: { t: 'cap', id, plugin, method, options } · 앱 → 웹: window.__bpCapReply(id, ok, value)
 * 웹 → 앱: { t: 'theme', dark, color } — 테마가 바뀔 때(상태 막대 글자색 · 웹뷰 바탕)
 */
const PLUGINS = ['Haptics', 'BullpenNative', 'SystemBars', 'SplashScreen', 'ShootCamera', 'LocalVideo'];

/** 한 주소에서만 잇는 부품 — 지금은 없다(2026-10-20 까지 LocalVideo 가 /velocity 에서만이었다) */
const SCOPED: Record<string, string> = {};
/** 웹 lib/local-video.ts 가 부르는 폰 영상 기능 — library* 는 뺐다(위 머리말) */
const LOCAL_VIDEO_METHODS = new Set(['status', 'begin', 'append', 'finish', 'saveFile', 'load', 'read', 'discard', 'exists', 'remove']);
const strings = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

/** 웹뷰가 문서를 읽기 전에 심는 글 — injectedJavaScriptBeforeContentLoaded */
export const CAP_SHIM = `(function () {
  if (window.Capacitor) return;
  var have = ${JSON.stringify(Object.fromEntries(PLUGINS.map((p) => [p, true])))};
  /* 한 화면에서만 있는 부품 — 폰 영상(LocalVideo)은 웹 구속 화면이 옛 앱 세션을 마무리할 때만(SCOPED 설명) */
  var scoped = ${JSON.stringify(SCOPED)};
  var can = function (name) { return !!have[name] || (!!scoped[name] && location.pathname.indexOf(scoped[name]) === 0); };
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
    isPluginAvailable: can,
    nativePromise: function (plugin, method, options) {
      if (!can(plugin)) return Promise.reject(new Error('unavailable'));
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
  /*
   * 주소가 바뀌면 알린다(사이트의 클라이언트 이동은 onNavigationStateChange 가 놓칠 수 있다 — 로그아웃은 redirect 로 /login 에 간다).
   * 뒤로 쓸기(popstate) 시각도 남긴다 — 사이트의 OpenNative 가 뒤로 와서 다시 그려진 것인지 안다(그때는 앱 화면을 또 열지 않는다).
   */
  var loc = function () { post({ t: 'loc', path: location.pathname }); };
  ['pushState', 'replaceState'].forEach(function (k) {
    var f = history[k];
    history[k] = function () { var r = f.apply(this, arguments); loc(); return r; };
  });
  window.addEventListener('popstate', function () { window.__bpPopAt = Date.now(); loc(); });
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
  if (plugin === 'LocalVideo' && LOCAL_VIDEO_METHODS.has(method)) {
    if (method === 'status') return LocalVideo.status();
    if (method === 'begin') return LocalVideo.begin({ ext: typeof o.ext === 'string' ? o.ext : undefined });
    if (method === 'append') return LocalVideo.append({ token: String(o.token), data: String(o.data) });
    if (method === 'finish') return LocalVideo.finish({ token: String(o.token) });
    if (method === 'saveFile') return LocalVideo.saveFile({ path: String(o.path) });
    if (method === 'load') return LocalVideo.load({ id: String(o.id) });
    if (method === 'read')
      return LocalVideo.read({ path: String(o.path), offset: Number(o.offset) || 0, length: Number(o.length) || undefined });
    if (method === 'discard') return LocalVideo.discard({ paths: strings(o.paths) });
    if (method === 'exists') return LocalVideo.exists({ ids: strings(o.ids) });
    return LocalVideo.remove({ ids: strings(o.ids) });
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
