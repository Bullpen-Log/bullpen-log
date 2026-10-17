import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { APP_UA, SITE_HOST, SITE_URL, START_PATH } from '~/lib/site';

/**
 * 전환 1판의 앱 = 사이트를 화면 가득 띄운 웹뷰 하나(지금 Capacitor 껍데기와 같은 모습).
 *
 * 화면을 네이티브로 옮기면(구속 측정 · 촬영 · 투구 영상부터, 검토 D3) 그 주소로 가는 길을 여기서 가로채 네이티브 화면을 연다.
 * 로그인은 사이트 'session' 쿠키 그대로 — sharedCookiesEnabled 로 앱의 쿠키 저장소와 같이 써서 네이티브 화면의 /api/rpc 도
 * 같은 로그인으로 부른다.
 */
/** 사이트 주소 중 네이티브 화면이 맡는 것 */
const NATIVE_PATHS = new Set(['/velocity', '/velocity/measure']);

export default function SiteScreen() {
  /** 바꾸면 웹뷰를 새로 그린다 — 다시 불러오기(react-native-webview 14 의 WebView 는 ref 를 안 받는다) */
  const [load, setLoad] = useState(0);
  const [failed, setFailed] = useState(false);
  const dark = useColorScheme() === 'dark';

  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  /** 우리 사이트 밖 주소(유튜브 · 결제 · 메일 등)는 웹뷰에서 열지 않고 폰의 앱 · 사파리로 */
  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    if (!req.isTopFrame) return true;
    let host = '';
    try {
      host = new URL(req.url).host;
    } catch {
      return false;
    }
    /* 네이티브로 옮긴 화면 — 사이트 대신 앱 화면을 연다(구속 측정, 검토 D3) */
    if (host === SITE_HOST && NATIVE_PATHS.has(new URL(req.url).pathname)) {
      router.push('/velocity');
      return false;
    }
    if (host === SITE_HOST || req.url.startsWith('about:') || req.url.startsWith('blob:') || req.url.startsWith('data:')) return true;
    void Linking.openURL(req.url);
    return false;
  }, []);

  const onNav = useCallback((nav: WebViewNavigation) => {
    if (!nav.loading) setFailed(false);
  }, []);

  if (failed) {
    return (
      <View style={[styles.offline, dark && styles.offlineDark]}>
        <Text style={[styles.title, dark && styles.textDark]}>인터넷에 연결할 수 없어요</Text>
        <Text style={[styles.body, dark && styles.mutedDark]}>연결되면 다시 불러와 주세요.</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => {
            setFailed(false);
            setLoad((n) => n + 1);
          }}>
          <Text style={styles.buttonText}>다시 불러오기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <WebView
      key={load}
      source={{ uri: `${SITE_URL}${START_PATH}` }}
      applicationNameForUserAgent={APP_UA}
      sharedCookiesEnabled
      allowsBackForwardNavigationGestures
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      allowsLinkPreview={false}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      decelerationRate="normal"
      pullToRefreshEnabled={false}
      style={[styles.web, dark && styles.offlineDark]}
      onShouldStartLoadWithRequest={onShouldStart}
      onNavigationStateChange={onNav}
      onLoadEnd={hideSplash}
      onError={() => {
        hideSplash();
        setFailed(true);
      }}
      onContentProcessDidTerminate={() => setLoad((n) => n + 1)}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: '#f4f7fb' },
  offline: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: '#f4f7fb' },
  offlineDark: { backgroundColor: '#000000' },
  title: { fontSize: 20, fontWeight: '700', color: '#1d1d1f' },
  body: { fontSize: 15, color: '#6e6e73' },
  textDark: { color: '#f5f5f7' },
  mutedDark: { color: '#98989d' },
  button: { marginTop: 8, height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: '#0a84d6', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontWeight: '600', color: '#ffffff' },
});
