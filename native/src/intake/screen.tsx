import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useURL } from 'expo-linking';
import { requireOptionalNativeModule, uuid } from 'expo-modules-core';
import { WebView, type WebViewProps } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FS from 'expo-file-system/legacy';
import { SITE_URL } from '~/lib/site';
import { hideSplashUnlessIntro } from '~/shell/intro';
import { MARKER, OriginalBridge, intakeDocument, intakeToken } from './bridge';

type Handle = { injectJavaScript(script: string): void };
const RefWebView = WebView as unknown as ComponentType<
  WebViewProps & { ref?: Ref<Handle> }
>;
type OriginalModule = {
  authorize(): Promise<boolean>;
  pick(): Promise<{ uri: string; name: string } | null>;
  cancel(): Promise<void>;
};
const original =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<OriginalModule>('IntakeOriginal')
    : null;

/** Public invitation, isolated from app account cookies and app navigation. */
export default function IntakeScreen() {
  const url = useURL();
  const token = intakeToken(url);
  useEffect(() => {
    void hideSplashUnlessIntro();
  }, []);
  if (!token) return <Notice text="유효한 접수 링크에서 ‘앱에서 계속’을 누릅니다." />;
  return <IntakeDocument key={token} token={token} />;
}
function Notice({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: '#080808',
        justifyContent: 'center',
        padding: 24,
        gap: 20,
      }}
    >
      <Text style={{ color: 'white', fontSize: 17, lineHeight: 27 }}>{text}</Text>
      {retry && (
        <Pressable
          accessibilityRole="button"
          onPress={retry}
          style={{
            backgroundColor: '#078bcf',
            minHeight: 52,
            borderRadius: 14,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: 17 }}>다시 연결</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}
function IntakeDocument({ token }: { token: string }) {
  const source = `${SITE_URL}/submit#${token}`;
  const web = useRef<Handle>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const bridge = useRef<OriginalBridge | null>(null);
  useEffect(() => {
    if (failed) return;
    const session = new OriginalBridge(source, {
      authorize: async () => (original ? original.authorize() : false),
      pick: async () => {
        if (!original)
          throw new Error('앱 업데이트가 필요합니다. 파일 방식을 사용합니다.');
        return original.pick();
      },
      size: async (uri) => {
        const info = await FS.getInfoAsync(uri);
        return info.exists ? info.size : 0;
      },
      read: (uri, position, length) =>
        FS.readAsStringAsync(uri, {
          encoding: FS.EncodingType.Base64,
          position,
          length,
        }),
      remove: (uri) => FS.deleteAsync(uri, { idempotent: true }),
      id: () => uuid.v4(),
      cancel: async () => {
        await original?.cancel();
      },
    });
    bridge.current = session;
    return () => {
      if (bridge.current === session) bridge.current = null;
      void session.close();
    };
  }, [source, attempt, failed]);
  const retry = () => {
    setFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  };
  if (failed)
    return (
      <Notice
        text="접수 화면에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도합니다."
        retry={retry}
      />
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#080808' }}>
      <RefWebView
        key={attempt}
        ref={web}
        source={{ uri: source }}
        // No generic app bridge or service session mirror on this screen.
        applicationNameForUserAgent={original ? MARKER : 'SinkerIntake/1'}
        incognito
        cacheEnabled={false}
        originWhitelist={[new URL(SITE_URL).origin]}
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        bounces={false}
        allowsBackForwardNavigationGestures={false}
        onShouldStartLoadWithRequest={(r) => intakeDocument(r.url, source)}
        onMessage={async (event) => {
          const session = bridge.current;
          if (!session) return;
          const reply = await session.dispatch(
            event.nativeEvent.url,
            event.nativeEvent.data
          );
          if (!reply || bridge.current !== session) return;
          const payload = JSON.stringify(reply)
            .replace(/</g, '\\u003c')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
          web.current?.injectJavaScript(
            `window.dispatchEvent(new CustomEvent('intake-original-reply',{detail:${payload}}));true;`
          );
        }}
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 400) setFailed(true);
        }}
        onContentProcessDidTerminate={() => setFailed(true)}
        style={{ flex: 1, backgroundColor: '#080808' }}
      />
      {loading && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#080808',
          }}
        >
          <ActivityIndicator color="#078bcf" accessibilityLabel="접수 화면을 여는 중" />
        </View>
      )}
    </SafeAreaView>
  );
}
