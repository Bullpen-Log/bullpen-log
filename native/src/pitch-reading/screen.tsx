import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Ref,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  PixelRatio,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Device from 'expo-device';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';
import {
  devicePitchDisplay,
  embedPitchScene,
  isPitchDisplay,
  isPitchHistory,
  PITCH_READING_DISPLAY_KEY,
  type PitchDisplay,
} from '@/lib/pitch-reading';
import { APP_UA } from '~/lib/site';
import { cacheEpoch, cacheGet, cacheSet, loadJson, saveJson } from '~/lib/store';
import { BullpenNative } from '../../modules/bullpen-native';
import scene from './scene.generated.json';

type WebHandle = { injectJavaScript(script: string): void; reload(): void };
const SceneWebView = WebView as unknown as ComponentType<
  WebViewProps & { ref?: Ref<WebHandle> }
>;
type Boot = {
  embedded: true;
  history: Record<string, unknown>[];
  displayCalibration?: PitchDisplay;
};

export function PitchReadingScreen() {
  const inset = useSafeAreaInsets();
  const web = useRef<WebHandle>(null);
  const epoch = useRef(cacheEpoch());
  const [boot, setBoot] = useState<Boot | null>(null);
  const latestHistory = useRef<Record<string, unknown>[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      cacheGet('pitch-reading'),
      loadJson(PITCH_READING_DISPLAY_KEY),
    ]).then(([history, savedDisplay]) => {
      if (!alive || epoch.current !== cacheEpoch()) return;
      const display =
        isPitchDisplay(savedDisplay) && savedDisplay.source === 'card'
          ? savedDisplay
          : devicePitchDisplay(Device.modelName, PixelRatio.get());
      latestHistory.current = isPitchHistory(history) ? history : [];
      setBoot({
        embedded: true,
        history: isPitchHistory(history) ? history : [],
        ...(display ? { displayCalibration: display } : {}),
      });
    });
    void BullpenNative.keepAwake(true).catch(() => undefined);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active')
        web.current?.injectJavaScript(
          "window.dispatchEvent(new Event('sinker-pause'));true;"
        );
    });
    return () => {
      alive = false;
      sub.remove();
      void BullpenNative.keepAwake(false).catch(() => undefined);
    };
  }, []);
  const source = useMemo(
    () =>
      boot
        ? {
            html: embedPitchScene(scene.html, boot),
            baseUrl: 'https://pitch-reading.sinker.local',
          }
        : null,
    [boot]
  );
  useEffect(() => {
    if (!boot || ready) return;
    const timer = setTimeout(() => setFailed(true), 15000);
    return () => clearTimeout(timer);
  }, [boot, ready, reloadKey]);
  const onMessage = (event: WebViewMessageEvent) => {
    if (epoch.current !== cacheEpoch() || event.nativeEvent.data.length > 1_500_000)
      return;
    try {
      const m = JSON.parse(event.nativeEvent.data);
      if (m.t !== 'pitch-reading') return;
      if (m.kind === 'ready') {
        setReady(true);
        setFailed(false);
      }
      if (m.kind === 'error') setFailed(true);
      if (m.kind === 'history' && isPitchHistory(m.sessions)) {
        latestHistory.current = m.sessions;
        void cacheSet('pitch-reading', m.sessions);
      }
      if (m.kind === 'display' && isPitchDisplay(m.value))
        void saveJson(PITCH_READING_DISPLAY_KEY, m.value);
      if (m.kind === 'export' && isPitchHistory(m.sessions))
        void Share.share({
          title: '싱커 공 읽기 연습',
          message: JSON.stringify({ sessions: m.sessions }, null, 2),
        }).catch(() => undefined);
    } catch {
      /* Ignore malformed messages; retain the last valid saved result. */
    }
  };
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#101b1d',
        paddingTop: inset.top,
        paddingBottom: inset.bottom,
      }}
    >
      <StatusBar hidden />
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="타격으로 돌아가기"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={styles.back}>‹ 타격</Text>
        </Pressable>
        <Text style={styles.title}>공 읽기</Text>
      </View>
      {source && (
        <SceneWebView
          key={reloadKey}
          ref={web}
          source={source}
          applicationNameForUserAgent={APP_UA}
          javaScriptEnabled
          domStorageEnabled
          bounces={false}
          allowsLinkPreview={false}
          scrollEnabled
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={(r) =>
            r.url === 'about:blank' ||
            r.url === 'https://pitch-reading.sinker.local' ||
            r.url.startsWith('https://pitch-reading.sinker.local/')
          }
          onMessage={onMessage}
          onError={() => setFailed(true)}
          onContentProcessDidTerminate={() => setFailed(true)}
          style={{ flex: 1, backgroundColor: '#101b1d' }}
        />
      )}
      {(!ready || failed) && (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.cover,
            { top: inset.top + 42, bottom: inset.bottom },
          ]}
        >
          {failed ? (
            <>
              <Text style={styles.message}>공 읽기를 불러오지 못했어요.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFailed(false);
                  setReady(false);
                  setBoot((previous) =>
                    previous
                      ? { ...previous, history: latestHistory.current }
                      : previous
                  );
                  setReloadKey((key) => key + 1);
                }}
              >
                <Text style={styles.back}>다시 불러오기</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.back()}>
                <Text style={styles.back}>타격으로 돌아가기</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color="#e9b482" />
              <Text style={styles.message}>타석을 준비하고 있어요.</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  bar: {
    height: 42,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#344647',
  },
  back: { color: '#e9b482', fontSize: 15, fontWeight: '600', paddingVertical: 10 },
  title: { color: '#e5e8df', fontSize: 15, fontWeight: '600' },
  cover: {
    backgroundColor: '#101b1d',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  message: { color: '#c7cfdd', fontSize: 15 },
});
