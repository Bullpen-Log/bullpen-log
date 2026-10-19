import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type ComponentType, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { APP_UA, SITE_URL } from '~/lib/site';
import { DualCamera, type Clip } from '../../modules/dual-camera';

/**
 * 숨은 웹뷰 계산기(2026-10-17 엔지니어링 검토 D5) — 사이트의 /velocity-engine 을 보이지 않게 띄워 두고, 앱 카메라가 자른 클립을
 * 보내 지금 구속 엔진 그대로 잰다(app/velocity-engine/engine-client.tsx 와 약속을 같이 고친다).
 *
 * 클립은 카메라 모듈이 1MB 씩 base64 로 읽어 준 조각을 그대로 웹뷰로 넘긴다(다시 인코딩하지 않는다).
 */

/** engine-client.tsx MeasureOpts 와 같다 */
export type MeasureOpts = {
  fps: number;
  fovDeg: number;
  fovKnown: boolean;
  ballRange?: { startSec: number; endSec: number; seedT: number };
  approach: 'receding' | 'approaching';
  focalPerLongSide: number | null;
  releaseDistanceM: number | null;
  distanceM: number | null;
  distanceAuto: boolean;
  tiltRad: number | null;
};

/** 엔진 결과(lib/velocity-engine VideoAnalyzeResult)에서 앱이 읽는 칸 — 나머지는 저장 때 그대로 넘긴다 */
export type EngineResult = {
  measure:
    | { ok: true; kmh: number; confidence: 'high' | 'medium' | 'low'; detail: { frames: number } & Record<string, unknown> }
    | { ok: false; code: string; message?: string };
  track: unknown[];
  distance?: { sizeDistM?: number | null; why?: string | null } & Record<string, unknown>;
  [key: string]: unknown;
};

/** engine-client.tsx LocateOpts 와 같다 — 조용할 때 훑기(2.7)가 클립에서 공이 있는지만 찾을 때 */
export type LocateOpts = {
  fps: number;
  fovDeg: number;
  focalPerLongSide: number | null;
  approach: 'receding' | 'approaching';
};

/** 훑기 답 — ballT 는 클립 시작부터(초), via 는 모델(net) · 거친 훑기(coarse) */
export type LocateFound = { ballT: number; accepted: boolean; via: string; ms: number };

export type EngineHandle = {
  /** 클립을 재 결과를 돌려준다. onBall — 공 길을 찾은 순간(조용히 재던 클립을 화면에 띄울 때) */
  measure(clip: Clip, opts: MeasureOpts, onBall?: () => void): Promise<{ result: EngineResult; ms: number }>;
  /** 클립에서 날아간 공이 있는지만 찾는다(재지 않는다) — 없으면 null */
  locate(clip: Clip, opts: LocateOpts): Promise<LocateFound | null>;
};

type WebViewHandle = { postMessage(message: string): void };
/* react-native-webview 14 의 타입은 ref 를 안 받지만 실제 부품은 forwardRef 다 */
const RefWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

const CHUNK = 1024 * 1024;
/** 계산이 이보다 오래 걸리면 포기한다(폰에서 보통 3~4초) */
const TIMEOUT_MS = 30_000;

type Waiter = {
  resolve: (v: { result: EngineResult; ms: number }) => void;
  reject: (e: Error) => void;
  onBall?: () => void;
  timer: ReturnType<typeof setTimeout>;
};
type Locator = { resolve: (v: LocateFound | null) => void; timer: ReturnType<typeof setTimeout> };

export const VelocityEngine = forwardRef<EngineHandle>(function VelocityEngine(_props, ref) {
  const web = useRef<WebViewHandle>(null);
  /** 바꾸면 계산기 웹뷰를 새로 연다(웹 프로세스가 죽었을 때) */
  const [gen, setGen] = useState(0);
  const ready = useRef<Promise<void> | null>(null);
  const markReady = useRef<() => void>(() => undefined);
  const waiters = useRef(new Map<number, Waiter>());
  const locators = useRef(new Map<number, Locator>());
  const nextId = useRef(0);

  if (!ready.current) ready.current = new Promise((r) => (markReady.current = r));

  const onMessage = useCallback((ev: WebViewMessageEvent) => {
    let msg: { t: string; id?: number; result?: EngineResult; ms?: number; message?: string; found?: LocateFound | null };
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.t === 'ready') return markReady.current();
    if (msg.t === 'located') {
      const l = msg.id != null ? locators.current.get(msg.id) : undefined;
      if (!l) return;
      clearTimeout(l.timer);
      locators.current.delete(msg.id!);
      l.resolve(msg.found && Number.isFinite(msg.found.ballT) ? msg.found : null);
      return;
    }
    const w = msg.id != null ? waiters.current.get(msg.id) : undefined;
    if (!w) return;
    if (msg.t === 'ball') return w.onBall?.();
    clearTimeout(w.timer);
    waiters.current.delete(msg.id!);
    if (msg.t === 'result' && msg.result) w.resolve({ result: msg.result, ms: msg.ms ?? 0 });
    else w.reject(new Error(msg.message ?? '영상을 읽지 못했어요'));
  }, []);

  /* 클립 파일을 1MB 조각으로 웹뷰에 — 재기(opts) · 훑기(locate) 둘 다 같은 길 */
  const sendClip = useCallback(async (id: number, clip: Clip) => {
    const post = (m: unknown) => web.current?.postMessage(JSON.stringify(m));
    const parts = Math.max(1, Math.ceil(clip.bytes / CHUNK));
    for (let part = 0; part < parts; part++) {
      const { data } = await DualCamera.read({ path: clip.path, offset: part * CHUNK, length: CHUNK });
      post({ t: 'clip', id, part, parts, data });
    }
  }, []);

  useImperativeHandle(ref, () => ({
    async measure(clip, opts, onBall) {
      await ready.current;
      const id = ++nextId.current;
      const done = new Promise<{ result: EngineResult; ms: number }>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.current.delete(id);
          reject(new Error('계산이 너무 오래 걸려 이번 공은 재지 못했어요'));
        }, TIMEOUT_MS);
        waiters.current.set(id, { resolve, reject, onBall, timer });
      });
      web.current?.postMessage(JSON.stringify({ t: 'opts', id, opts }));
      await sendClip(id, clip);
      return done;
    },
    async locate(clip, opts) {
      await ready.current;
      const id = ++nextId.current;
      /* 못 찾은 것과 못 돌아온 것을 가르지 않는다 — 훑기는 조용히 다음 창으로 */
      const done = new Promise<LocateFound | null>((resolve) => {
        const timer = setTimeout(() => {
          locators.current.delete(id);
          resolve(null);
        }, TIMEOUT_MS);
        locators.current.set(id, { resolve, timer });
      });
      web.current?.postMessage(JSON.stringify({ t: 'locate', id, opts }));
      await sendClip(id, clip);
      return done;
    },
  }));

  return (
    <RefWebView
      key={gen}
      ref={web}
      source={{ uri: `${SITE_URL}/velocity-engine` }}
      applicationNameForUserAgent={APP_UA}
      onMessage={onMessage}
      /* 화면에 안 보이게 — 다만 0 크기 · 완전 투명이면 WebKit 이 일을 늦출 수 있어 1pt · 거의 투명으로 둔다 */
      style={styles.hidden}
      pointerEvents="none"
      onContentProcessDidTerminate={() => {
        ready.current = new Promise((r) => (markReady.current = r));
        for (const [id, w] of waiters.current) {
          clearTimeout(w.timer);
          w.reject(new Error('계산기가 멈춰 이번 공은 재지 못했어요'));
          waiters.current.delete(id);
        }
        for (const [id, l] of locators.current) {
          clearTimeout(l.timer);
          l.resolve(null);
          locators.current.delete(id);
        }
        setGen((n) => n + 1);
      }}
    />
  );
});

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0.01, left: 0, top: 0 },
});
