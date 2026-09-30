/**
 * 아이폰 앱(mobile/ 의 Capacitor 껍데기) 안에서 여는 화면만을 위한 첫 스크립트.
 *
 * app/layout.tsx 의 <head> 에서 테마 스크립트(THEME_INIT_SCRIPT) 바로 뒤에 돈다 — 첫 페인트 전.
 * 앱이 아니면(User-Agent 에 BullpenLogApp 이 없으면) 아무것도 안 한다. 사파리는 그대로다.
 *
 * 하는 일 셋:
 *
 * 1. <html data-app="native"> 를 붙인다. globals.css 의 '아이폰 앱 안' 규칙(튕기는 스크롤 끄기 ·
 *    위아래 막대가 없는 화면의 시계 · 홈 막대 여백)이 이 표시로만 켜진다.
 * 2. 상태바(시계 · 배터리) 글자색을 앱 테마에 맞춘다 — 라이트면 검은 글자, 다크 · 네이비면 흰 글자.
 *    앱 테마는 폰의 다크 모드와 따로 고르므로(lib/theme.ts) 폰 설정에 맡기면 흰 막대에 흰 글자가
 *    되어 안 보였다. <html data-theme> 이 바뀔 때마다 다시 맞춘다.
 * 3. 앱을 켠 뒤 처음이면(sessionStorage) <html data-intro> 를 붙인다 — 시작 연출(components/app-intro.tsx)이
 *    로딩 화면(큰 B, mobile/scripts/make-ios-assets.mjs)을 이어 받아 걷는다. 아니면(같은 앱 안에서 다시 읽음)
 *    첫 화면이 그려질 때 로딩 화면을 걷는다. 안 걷으면 앱 설정의 최대 시간(4초)까지 덮고 있다.
 *
 * 앱 기능은 Capacitor 가 모든 페이지에 심는 window.Capacitor.nativePromise 로 부른다 — 사이트에
 * Capacitor 패키지를 더하지 않아도 된다. SystemBars 는 Capacitor 안에 들어 있고, SplashScreen 은
 * mobile/package.json 의 @capacitor/splash-screen 이다.
 */
export const APP_INIT_SCRIPT = `(function () {
  try {
    if ((navigator.userAgent || '').indexOf('BullpenLogApp') < 0) return;
    var root = document.documentElement;
    root.setAttribute('data-app', 'native');
    var call = function (plugin, method, options) {
      var cap = window.Capacitor;
      if (cap && cap.nativePromise) cap.nativePromise(plugin, method, options).catch(function () {});
    };
    var bars = function () {
      var theme = root.getAttribute('data-theme') || 'light';
      call('SystemBars', 'setStyle', { style: theme === 'light' ? 'LIGHT' : 'DARK' });
    };
    bars();
    new MutationObserver(bars).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    var seen = true;
    try { seen = sessionStorage.getItem('bullpen-intro') === '1'; } catch (e) {}
    if (!seen) {
      root.setAttribute('data-intro', '');
      return;
    }
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          call('SplashScreen', 'hide', { fadeOutDuration: 250 });
        });
      });
    });
  } catch (e) {}
})();`;
