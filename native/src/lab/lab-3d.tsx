import { forwardRef, useImperativeHandle, useRef, useState, type ComponentType, type Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGrabProps } from '~/shell/scroll-lock';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { APP_UA, SITE_URL } from '~/lib/site';

/**
 * 3D 동작 분석 결과의 3D 칸 — 사이트 app/embed/lab/[id] 를 작은 웹뷰로 띄운다(2026-10-18 김민: 둘레는 앱, 3D 는 웹 WebGL — 같은 부품을 두 벌
 * 가지지 않게). 로그인은 앱 껍데기와 같은 'session' 쿠키(sharedCookiesEnabled).
 *
 * 웹뷰와의 말(사이트 app/embed/lab/[id]/lab-embed.tsx 와 같은 모양):
 *   - 웹 → 앱(postMessage JSON): ready · size(칸 높이 px — 웹뷰 높이를 맞춘다) · transport(3D 시계 + 그때 두 영상의 재생기 시각)
 *   - 앱 → 웹: window.__labSeek(장면) — 숫자 · 메커니즘 점검의 '그 순간 보기'
 */
export type LabTransport = {
  frame: number;
  playing: boolean;
  speed: number;
  reason: 'tick' | 'seek' | 'toggle' | 'speed';
  /** 3D 시계(옆 영상 트랙 시각) — 2026-10-20 부터. 영상은 아래 두 값을 쓴다 */
  time?: number;
  /** 그때 옆 · 뒤 영상의 재생기 시각(초, 편집 목록 앞머리까지 더함 — 재생 중엔 0.1초마다) */
  side: number;
  back: number;
  /** 마커 샘플 ③ · ④ 의 재생기 시각(사이트가 시각 차를 알 때만, 2026-10-22) */
  cam3?: number;
  cam4?: number;
};
export type Lab3DHandle = { seek: (frame: number) => void };

type FromWeb =
  | { t: 'lab'; kind: 'ready' }
  | { t: 'lab'; kind: 'size'; h: number }
  | ({ t: 'lab'; kind: 'transport' } & LabTransport);

type WebViewHandle = { injectJavaScript(script: string): void; reload(): void };
/* react-native-webview 14 의 타입은 ref 를 안 받지만 실제 부품은 forwardRef 다(index.tsx · velocity/engine.tsx 와 같다) */
const RefWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

export const Lab3D = forwardRef<
  Lab3DHandle,
  {
    id: string;
    /** 칸 폭(px) — 처음 높이 어림(3D 4:5 + 시점 · 재생 줄) */
    width: number;
    /** 웹이 그리기 전 바탕 */
    bg: string;
    onTransport: (t: LabTransport) => void;
    /** 처음 재생이 멈출 장면(리포트의 주 문제) */
    stop?: number | null;
    /** 어두운 무대(리포트 결론 판 안) */
    dark?: boolean;
  }
>(function Lab3D({ id, width, bg, onTransport, stop = null, dark = false }, ref) {
  const web = useRef<WebViewHandle>(null);
  const grab = useGrabProps();
  const [height, setHeight] = useState(() => Math.round(width * 1.25) + 132);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const base = `${SITE_URL}/embed/lab/${id}`;
  const q = [stop != null ? `stop=${Math.max(0, Math.round(stop))}` : null, dark ? 'dark=1' : null].filter(Boolean).join('&');
  const url = q ? `${base}?${q}` : base;

  useImperativeHandle(
    ref,
    () => ({
      seek: (k) => web.current?.injectJavaScript(`window.__labSeek&&window.__labSeek(${Math.max(0, Math.round(k))});true;`),
    }),
    []
  );

  const onMessage = (e: WebViewMessageEvent) => {
    let m: FromWeb;
    try {
      m = JSON.parse(e.nativeEvent.data) as FromWeb;
    } catch {
      return;
    }
    if (m?.t !== 'lab') return;
    if (m.kind === 'ready') setReady(true);
    else if (m.kind === 'size') {
      if (m.h > 80) setHeight(m.h);
    } else if (m.kind === 'transport') onTransport(m);
  };

  return (
    /* 손가락이 3D 에 닿은 동안 둘레 스크롤을 멈춘다(shell/scroll-lock) */
    <View {...grab} style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: bg }}>
      <RefWebView
        ref={web}
        source={{ uri: url }}
        applicationNameForUserAgent={APP_UA}
        sharedCookiesEnabled
        scrollEnabled={false}
        bounces={false}
        allowsLinkPreview={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        style={{ flex: 1, backgroundColor: bg }}
        /* 이 칸은 3D 하나만 — 다른 주소로 옮겨 가지 않는다(로그인 화면 등은 앱 화면이 먼저 막는다) */
        onShouldStartLoadWithRequest={(r) => r.url === url || r.url.startsWith(`${base}?`) || r.url === base || r.url === 'about:blank'}
        onMessage={onMessage}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        onContentProcessDidTerminate={() => web.current?.reload()}
      />
      {(!ready || failed) && (
        <View style={[StyleSheet.absoluteFill, styles.cover]}>
          {failed ? (
            <>
              <Text style={styles.coverText}>3D 를 불러오지 못했어요.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFailed(false);
                  setReady(false);
                  web.current?.reload();
                }}
                style={styles.retry}
              >
                <Text style={styles.retryText}>다시</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color="#c7cfdd" />
              <Text style={styles.coverText}>인형을 만드는 중이에요</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  cover: { backgroundColor: '#151722', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  coverText: { color: '#c7cfdd', fontSize: 15, textAlign: 'center' },
  retry: { minHeight: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
