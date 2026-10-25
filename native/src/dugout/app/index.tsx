import { type Href, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useRef, useState, type ComponentType, type Ref } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation, type WebViewProps } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { CAP_SHIM, handleCapMessage } from '~/lib/cap-bridge';
import { markAppReady } from '~/shell/intro';
import { SITE_HOST, SITE_URL } from '~/lib/site';
import { usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { TAB_BAR_HEIGHT, TabBar, type ShellTab } from '~/shell/tab-bar';
import { useWebNav } from '~/shell/web-nav';
import { DUGOUT_GREEN, DUGOUT_TAB_ACCENT } from '~/dugout/mark';
import { DUGOUT_TABS, DUGOUT_UA, dugoutTabOf, isLoginPath } from '~/dugout/site';

type WebViewHandle = { injectJavaScript(script: string): void };
/* react-native-webview 14 의 타입은 ref 를 안 받지만 실제 부품은 forwardRef 다(싱커 src/app/index.tsx 와 같다) */
const RefWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

/**
 * 덕아웃 앱 껍데기 — 덕아웃 사이트 웹뷰 하나 + 앱 아래 탭 막대. 앱 화면은 하나씩 옮긴다(지금은 로그인만).
 *
 * 지금 주소는 문서를 읽기 전에 심은 글(WATCH)이 사이트 안 이동(pushState · replaceState · 뒤로)마다 알려 온다 — 사이트를 안 고쳐도 탭 불 ·
 * 로그인 가로채기가 돈다. 사이트 덕아웃 틀이 덕아웃 앱을 알아보면(DugoutAppBridge) 탭 누름이 페이지를 새로 안 불러오는 이동(__bpTab)이 된다.
 */
const WATCH = `(function(){var p=function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({t:'dloc',path:location.pathname,search:location.search}))};['pushState','replaceState'].forEach(function(k){var f=history[k];history[k]=function(){var r=f.apply(this,arguments);p();return r}});window.addEventListener('popstate',p);p();})();true;`;

/** 웹에서 로그인 창을 띄울 다음 주소(?next=) — 사이트 안 주소만 */
function nextOf(search: string): string | undefined {
  const n = new URLSearchParams(search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : undefined;
}

/* 한 번 누름에 주소 가로채기 · 사이트 알림이 같이 올 수 있다 — 0.7초 안에 두 번은 한 번으로 */
let loginAt = 0;
function openLogin(next?: string) {
  if (Date.now() - loginAt < 700) return;
  loginAt = Date.now();
  router.push((next ? `/login?next=${encodeURIComponent(next)}` : '/login') as Href);
}

export default function DugoutShell() {
  const c = usePalette();
  const web = useRef<WebViewHandle>(null);
  /** 바꾸면 웹뷰를 새로 그린다(다시 불러오기 · 프로세스 죽음) */
  const [load, setLoad] = useState(0);
  const [failed, setFailed] = useState(false);
  const [path, setPath] = useState('/');
  const [pageColor, setPageColor] = useState<string | null>(null);

  /* 앱 화면(로그인)이 끝나고 웹을 옮길 때는 새로 불러온다 — 로그인 뒤 덕아웃 틀(위 막대 · 내 것)을 새 로그인으로 그리게 */
  useWebNav(useCallback((href: string) => web.current?.injectJavaScript(`location.assign(${JSON.stringify(href)});true;`), []));

  const pressTab = (t: ShellTab) => {
    setPath(t.href);
    web.current?.injectJavaScript(`var h=${JSON.stringify(t.href)};window.__bpTab?window.__bpTab(h):location.assign(h);true;`);
  };

  /** 우리 사이트 밖 주소(유튜브 · 결제 · 메일 등)는 폰의 앱 · 사파리로, 웹 로그인은 앱 로그인으로 */
  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    if (!req.isTopFrame) return true;
    let u: URL;
    try {
      u = new URL(req.url);
    } catch {
      return false;
    }
    if (u.host === SITE_HOST) {
      if (isLoginPath(u.pathname) && u.searchParams.get('web') !== '1') {
        openLogin(nextOf(u.search));
        return false;
      }
      return true;
    }
    if (/^(about|blob|data):/.test(req.url)) return true;
    void Linking.openURL(req.url);
    return false;
  }, []);

  const onMessage = useCallback((ev: WebViewMessageEvent) => {
    let msg: { t?: string; path?: unknown; search?: unknown };
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if ((msg.t === 'dloc' || msg.t === 'path') && typeof msg.path === 'string') {
      const search = typeof msg.search === 'string' ? msg.search : '';
      /* 사이트 안 이동으로 로그인에 왔다(로그인이 필요한 화면의 redirect · 로그아웃) — 웹은 앞 화면으로 돌리고 앱 로그인을 띄운다 */
      if (msg.t === 'dloc' && isLoginPath(msg.path) && !/[?&]web=1\b/.test(search)) {
        openLogin(nextOf(search));
        web.current?.injectJavaScript(`history.length>1?history.back():location.replace('/');true;`);
        return;
      }
      setPath(msg.path);
      return;
    }
    /* 진동 · 화면 켜 두기 · 테마(상태 막대 · 웹뷰 바탕) — 싱커와 같은 작은 다리(~/lib/cap-bridge) */
    handleCapMessage(
      msg,
      (script) => web.current?.injectJavaScript(script),
      (t) => t.color && setPageColor(t.color)
    );
  }, []);

  const onNav = useCallback((nav: WebViewNavigation) => {
    if (!nav.loading) setFailed(false);
  }, []);

  /* 사이트가 그려지면 시작 화면 · 시작 연출(_layout 의 Intro)을 걷는다 */
  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync();
    markAppReady();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <RefWebView
        key={load}
        ref={web}
        injectedJavaScriptBeforeContentLoaded={CAP_SHIM + WATCH}
        source={{ uri: `${SITE_URL}/` }}
        applicationNameForUserAgent={DUGOUT_UA}
        sharedCookiesEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        allowsLinkPreview={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        decelerationRate="normal"
        style={{ flex: 1, backgroundColor: pageColor ?? c.page }}
        onShouldStartLoadWithRequest={onShouldStart}
        onNavigationStateChange={onNav}
        onMessage={onMessage}
        onLoadEnd={hideSplash}
        onError={() => {
          hideSplash();
          setFailed(true);
        }}
        onContentProcessDidTerminate={() => setLoad((n) => n + 1)}
      />
      {/* 망이 끊겼을 때 — 흰 화면 대신(앱 심사관이 비행기 모드로 본다). 탭 막대는 그대로 */}
      {failed ? (
        <View style={[StyleSheet.absoluteFill, st.offline, { backgroundColor: c.page, paddingBottom: 24 + TAB_BAR_HEIGHT }]}>
          <Text style={{ color: c.ink, fontSize: 20, fontWeight: '700' }}>인터넷에 연결할 수 없어요</Text>
          <Text style={{ color: c.muted, fontSize: 15 }}>연결되면 다시 불러와 주세요.</Text>
          <Press
            accessibilityRole="button"
            style={st.button}
            onPress={() => {
              setFailed(false);
              setLoad((n) => n + 1);
            }}
          >
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>다시 불러오기</Text>
          </Press>
        </View>
      ) : null}
      {isLoginPath(path) ? null : <TabBar tabs={DUGOUT_TABS} active={dugoutTabOf(path)} onPress={pressTab} accent={DUGOUT_TAB_ACCENT} />}
    </View>
  );
}

const st = StyleSheet.create({
  offline: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  button: { marginTop: 8, height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: DUGOUT_GREEN, justifyContent: 'center' },
});
