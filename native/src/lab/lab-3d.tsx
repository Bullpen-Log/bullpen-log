import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentType, type Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGrabProps } from '~/shell/scroll-lock';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { APP_UA, SITE_URL } from '~/lib/site';
import { File, Paths } from 'expo-file-system';
import { decodeExportChunk } from '@/lib/pitch-3d/v2/export-bridge';

/**
 * 3D 동작 분석 결과의 3D 칸 — 사이트 app/embed/lab/[id] 를 작은 웹뷰로 띄운다(2026-10-18 김민: 둘레는 앱, 3D 는 웹 WebGL — 같은 부품을 두 벌
 * 가지지 않게). 로그인은 앱 껍데기와 같은 'session' 쿠키(sharedCookiesEnabled).
 *
 * 웹뷰와의 말(사이트 app/embed/lab/[id]/lab-embed.tsx 와 같은 모양):
 *   - 웹 → 앱(postMessage JSON): ready · size(칸 높이 px — 웹뷰 높이를 맞춘다) · transport(3D 시계 + 그때 두 영상의 재생기 시각)
 *   - 앱 → 웹: window.__labSeek(장면) — 숫자 · 메카닉 점검의 '그 순간 보기' · window.__labView(시점) — 원본 옆 · 뒤를 바꿀 때 3D 도 그쪽에서(2026-10-29)
 * 못 불러오면(오류 · 25초 안에 ready 가 안 옴) 덮개에 다시 불러오기 — 분석을 다시 걸지 않고 웹뷰만 다시 연다(onFailed 로 화면이 '원본으로 확인'을 띄운다).
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
export type Lab3DHandle = { seek: (frame: number) => void; view: (v: 'side' | 'back' | 'catcher' | 'top') => void; snapshot: () => Promise<string | null>; exportVideo: (onProgress?: (progress: number) => void) => Promise<File> };

type FromWeb =
  | { t: 'lab'; kind: 'ready' }
  | { t: 'lab'; kind: 'size'; h: number }
  | ({ t: 'lab'; kind: 'transport' } & LabTransport)
  | { t: 'lab'; kind: 'export-progress'; id: string; progress: number }
  | { t: 'lab'; kind: 'export-chunk'; id: string; index: number; data: string }
  | { t: 'lab'; kind: 'export-done'; id: string; chunks: number; bytes: number }
  | { t: 'lab'; kind: 'export-error'; id: string; message: string };
type Snapshot = { t: 'lab'; kind: 'snapshot'; id: string; data: string | null };

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
    /** 불러오기 실패 · 다시 불러옴(분석 실패와 다르다 — 화면이 원본 확인을 띄운다) */
    onFailed?: (failed: boolean) => void;
  }
>(function Lab3D({ id, width, bg, onTransport, stop = null, dark = false, onFailed }, ref) {
  const web = useRef<WebViewHandle>(null);
  const grab = useGrabProps();
  const [height, setHeight] = useState(() => Math.round(width * 1.25) + 132);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const snapshot = useRef<{ id: string; resolve: (data: string | null) => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const transfer = useRef<{
    id: string; file: File; handle: ReturnType<File['open']>; index: number; bytes: number;
    timer: ReturnType<typeof setTimeout>; resolve: (file: File) => void; reject: (error: Error) => void;
    onProgress?: (progress: number) => void;
  } | null>(null);
  const failTransfer = (message: string) => {
    const t = transfer.current;
    if (!t) return;
    transfer.current = null;
    clearTimeout(t.timer);
    try { t.handle.close(); } catch { /* already closed */ }
    try { if (t.file.exists) t.file.delete(); } catch { /* cache cleanup */ }
    t.reject(new Error(message));
  };
  useEffect(() => () => {
    failTransfer('화면이 닫혀 영상 만들기가 취소됐어요.');
    if (snapshot.current) { clearTimeout(snapshot.current.timer); snapshot.current.resolve(null); snapshot.current = null; }
  }, []);
  const base = `${SITE_URL}/embed/lab/${id}`;
  /* 실패를 화면에 알린다(같은 값이면 안 부른다) · 25초 안에 ready 가 안 오면 실패로 */
  const failedCb = useRef(onFailed);
  useEffect(() => {
    failedCb.current = onFailed;
  });
  useEffect(() => {
    failedCb.current?.(failed);
  }, [failed]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (ready || failed) return;
    const t = setTimeout(() => setFailed(true), 25_000);
    return () => clearTimeout(t);
  }, [ready, failed, attempt]);
  const q = [stop != null ? `stop=${Math.max(0, Math.round(stop))}` : null, dark ? 'dark=1' : null].filter(Boolean).join('&');
  const url = q ? `${base}?${q}` : base;

  useImperativeHandle(
    ref,
    () => ({
      seek: (k) => web.current?.injectJavaScript(`window.__labSeek&&window.__labSeek(${Math.max(0, Math.round(k))});true;`),
      view: (v) => web.current?.injectJavaScript(`window.__labView&&window.__labView(${JSON.stringify(v)});true;`),
      snapshot: () => {
        if (!ready || failed || !web.current || snapshot.current) return Promise.resolve(null);
        return new Promise<string | null>((resolve) => {
          const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const timer = setTimeout(() => { snapshot.current = null; resolve(null); }, 3000);
          snapshot.current = { id, resolve, timer };
          web.current?.injectJavaScript(`window.__labSnapshot&&window.__labSnapshot(${JSON.stringify(id)});true;`);
        });
      },
      exportVideo: (onProgress) => {
        if (!ready || failed || !web.current) return Promise.reject(new Error('3D 화면을 불러온 뒤 다시 시도해 주세요.'));
        if (transfer.current) return Promise.reject(new Error('이미 영상을 만들고 있어요.'));
        return new Promise<File>((resolve, reject) => {
          let file: File | undefined;
          try {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            file = new File(Paths.cache, `sinker-3d-${id}.mp4`);
            file.create();
            const handle = file.open();
            const timer = setTimeout(() => failTransfer('영상 만들기 시간이 초과됐어요. 다시 시도해 주세요.'), 180_000);
            transfer.current = { id, file, handle, index: 0, bytes: 0, timer, resolve, reject, onProgress };
            web.current?.injectJavaScript(`if(window.__labExport){window.__labExport(${JSON.stringify(id)})}else{window.ReactNativeWebView.postMessage(JSON.stringify({t:'lab',kind:'export-error',id:${JSON.stringify(id)},message:'3D 화면을 다시 불러와 주세요.'}))}true;`);
          } catch {
            if (transfer.current) { failTransfer('영상 저장 공간을 준비하지 못했어요.'); return; }
            try { if (file?.exists) file.delete(); } catch { /* cache cleanup */ }
            reject(new Error('영상 저장 공간을 준비하지 못했어요.'));
          }
        });
      },
    }),
    [ready, failed]
  );

  const onMessage = (e: WebViewMessageEvent) => {
    let m: FromWeb | Snapshot;
    try {
      m = JSON.parse(e.nativeEvent.data) as FromWeb | Snapshot;
    } catch {
      return;
    }
    if (m?.t !== 'lab' || typeof m.kind !== 'string') return;
    if (m.kind === 'snapshot') {
      const pending = snapshot.current;
      if (!pending || pending.id !== m.id) return;
      clearTimeout(pending.timer);
      snapshot.current = null;
      pending.resolve(typeof m.data === 'string' && m.data.length <= 2_000_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(m.data) ? m.data : null);
      return;
    }
    if (m.kind.startsWith('export-')) {
      const t = transfer.current;
      if (!t || !('id' in m) || m.id !== t.id) return;
      if (m.kind === 'export-progress') {
        if (Number.isFinite(m.progress)) t.onProgress?.(Math.max(0, Math.min(1, m.progress)));
      } else if (m.kind === 'export-chunk') {
        const ack = (ok: boolean) => web.current?.injectJavaScript(`window.__labExportAck&&window.__labExportAck(${JSON.stringify(t.id)},${m.index},${ok});true;`);
        try {
          if (m.index !== t.index || typeof m.data !== 'string') throw new Error('영상 순서가 맞지 않아요.');
          const bytes = decodeExportChunk(m.data);
          if (t.bytes + bytes.byteLength > 32 * 1024 * 1024) throw new Error('영상이 너무 커요.');
          void t.handle.writeBytes(bytes).then(() => {
            if (transfer.current !== t) return;
            t.bytes += bytes.byteLength;
            t.index++;
            ack(true);
          }, () => { if (transfer.current === t) { ack(false); failTransfer('영상을 기기에 저장하지 못했어요.'); } });
        } catch { ack(false); failTransfer('영상 조각을 확인하지 못했어요.'); }
      } else if (m.kind === 'export-done') {
        if (m.chunks !== t.index || m.bytes !== t.bytes || t.bytes === 0) return failTransfer('완성된 영상을 확인하지 못했어요.');
        transfer.current = null;
        clearTimeout(t.timer);
        try { t.handle.close(); t.resolve(t.file); } catch { t.reject(new Error('영상 파일을 마무리하지 못했어요.')); }
      } else if (m.kind === 'export-error') failTransfer(typeof m.message === 'string' ? m.message.slice(0, 160) : '영상을 만들지 못했어요.');
      return;
    }
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
        onError={() => { failTransfer('3D 화면이 중단돼 영상 만들기를 취소했어요.'); setFailed(true); }}
        onHttpError={() => { failTransfer('3D 화면이 중단돼 영상 만들기를 취소했어요.'); setFailed(true); }}
        onContentProcessDidTerminate={() => { failTransfer('3D 화면이 중단돼 영상 만들기를 취소했어요.'); web.current?.reload(); }}
      />
      {(!ready || failed) && (
        <View style={[StyleSheet.absoluteFill, styles.cover]}>
          {failed ? (
            <>
              <Text style={styles.coverText}>3D를 불러오지 못했어요.</Text>
              <Text style={[styles.coverText, { fontSize: 13, color: '#9aa3b8' }]}>분석 결과는 그대로예요. 3D 화면만 다시 불러와요.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFailed(false);
                  setReady(false);
                  setAttempt((n) => n + 1);
                  web.current?.reload();
                }}
                style={styles.retry}
              >
                <Text style={styles.retryText}>3D 다시 불러오기</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color="#c7cfdd" />
              <Text style={styles.coverText}>3D 동작을 불러오고 있어요.</Text>
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
  retry: { minHeight: 44, paddingHorizontal: 18, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
