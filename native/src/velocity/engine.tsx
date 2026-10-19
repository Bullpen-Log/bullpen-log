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
 * 재기(measure)와 훑기(locate, 2.7 조용할 때 훑기)가 같은 통로를 쓴다 — 계산기가 한 번에 하나씩 차례로 돈다.
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

/** engine-client.tsx LocateOpts 와 같다 — 조용할 때 훑기(2.7)가 클립에서 공 시각만 찾을 때 */
export type LocateOpts = {
  fps: number;
  fovDeg: number;
  approach: 'receding' | 'approaching';
  focalPerLongSide: number | null;
};

/** 훑기 답(lib/velocity-engine/analyze-video.ts ThrowLocation 에서 앱이 읽는 칸) */
export type ThrowLocation = {
  /** 클립 시각(초)으로 본 공이 처음 보인 때 */
  ballT: number;
  /** 공이라고 믿나 — 아니면 ballT 는 참고값 */
  accepted: boolean;
  /** 무엇이 찾았나 — 학습 모델(net) 또는 밝기 차 거친 훑기(coarse — 모델을 못 받았을 때) */
  via: 'net' | 'coarse';
  ms: number;
  [key: string]: unknown;
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

export type EngineHandle = {
  /** 클립을 재 결과를 돌려준다. onBall — 공 길을 찾은 순간(조용히 재던 클립을 화면에 띄울 때) */
  measure(clip: Clip, opts: MeasureOpts, onBall?: () => void): Promise<{ result: EngineResult; ms: number }>;
  /** 클립을 훑어 공 시각만 찾는다(재지 않음) — 영상을 못 열면 null */
  locate(clip: Clip, opts: LocateOpts): Promise<{ found: ThrowLocation | null; ms: number }>;
};

type WebViewHandle = { postMessage(message: string): void };
/* react-native-webview 14 의 타입은 ref 를 안 받지만 실제 부품은 forwardRef 다 */
const RefWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

const CHUNK = 1024 * 1024;
/** 계산이 이보다 오래 걸리면 포기한다(폰에서 보통 3~4초) */
const TIMEOUT_MS = 30_000;
/** 훑기는 더 짧게 — 2.5초 넘으면 다음 하나를 건너뛰는 규칙(capture.ts)이라 오래 붙들 까닭이 없다 */
const LOCATE_TIMEOUT_MS = 15_000;
/** 계산기 웹뷰가 뜨기를 기다리는 시한 — 넘기면 그 공은 못 잰 것으로 */
const READY_TIMEOUT_MS = 20_000;

type Waiter = {
  /** 'result' 를 기다리는 재기, 'located' 를 기다리는 훑기 */
  kind: 'measure' | 'locate';
  resolve: (v: { result?: EngineResult; found?: ThrowLocation | null; ms: number }) => void;
  reject: (e: Error) => void;
  onBall?: () => void;
  timer: ReturnType<typeof setTimeout>;
};

export const VelocityEngine = forwardRef<EngineHandle>(function VelocityEngine(_props, ref) {
  const web = useRef<WebViewHandle>(null);
  /** 바꾸면 계산기 웹뷰를 새로 연다(웹 프로세스가 죽었을 때) */
  const [gen, setGen] = useState(0);
  const ready = useRef<Promise<void> | null>(null);
  const markReady = useRef<() => void>(() => undefined);
  const waiters = useRef(new Map<number, Waiter>());
  const nextId = useRef(0);

  if (!ready.current) ready.current = new Promise((r) => (markReady.current = r));

  const onMessage = useCallback((ev: WebViewMessageEvent) => {
    let msg: { t: string; id?: number; result?: EngineResult; found?: ThrowLocation | null; ms?: number; message?: string };
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.t === 'ready') return markReady.current();
    const w = msg.id != null ? waiters.current.get(msg.id) : undefined;
    if (!w) return;
    if (msg.t === 'ball') return w.onBall?.();
    clearTimeout(w.timer);
    waiters.current.delete(msg.id!);
    if (msg.t === 'result' && msg.result) w.resolve({ result: msg.result, ms: msg.ms ?? 0 });
    else if (msg.t === 'located' && w.kind === 'locate') w.resolve({ found: msg.found ?? null, ms: msg.ms ?? 0 });
    else w.reject(new Error(msg.message ?? '영상을 읽지 못했어요'));
  }, []);

  /**
   * 첫 메시지(재기 'opts' 또는 훑기 'locate')를 보내고 클립을 조각으로 넘긴 뒤 답을 기다린다 — 두 길이 같은 통로를 쓴다.
   * 조각은 카메라 모듈이 1MB 씩 읽어 준 base64 그대로.
   */
  const ask = useCallback(
    async (first: { t: 'opts'; opts: MeasureOpts } | { t: 'locate'; opts: LocateOpts }, clip: Clip, onBall?: () => void) => {
      /* 계산기(웹뷰)가 못 뜨면(오프라인 · 사이트 오류) 영영 기다리던 것 — 시한을 두고 실패로 돌린다 */
      const up = await Promise.race([(ready.current ?? Promise.resolve()).then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), READY_TIMEOUT_MS))]);
      if (!up) throw new Error('계산기를 불러오지 못했어요. 신호를 확인해 주세요.');
      const id = ++nextId.current;
      const kind = first.t === 'opts' ? 'measure' : 'locate';
      const done = new Promise<{ result?: EngineResult; found?: ThrowLocation | null; ms: number }>((resolve, reject) => {
        const timer = setTimeout(
          () => {
            waiters.current.delete(id);
            reject(new Error(kind === 'measure' ? '계산이 너무 오래 걸려 이번 공은 재지 못했어요' : '훑기가 너무 오래 걸렸어요'));
          },
          kind === 'measure' ? TIMEOUT_MS : LOCATE_TIMEOUT_MS
        );
        waiters.current.set(id, { kind, resolve, reject, onBall, timer });
      });
      const post = (m: unknown) => web.current?.postMessage(JSON.stringify(m));
      post({ ...first, id });
      const parts = Math.max(1, Math.ceil(clip.bytes / CHUNK));
      try {
        for (let part = 0; part < parts; part++) {
          const { data } = await DualCamera.read({ path: clip.path, offset: part * CHUNK, length: CHUNK });
          post({ t: 'clip', id, part, parts, data });
        }
      } catch (e) {
        /* 클립 파일을 못 읽음(iOS 가 tmp 를 비움 등) — 기다리는 자리 · 웹 쪽 반쯤 온 조각을 치운다 */
        const w = waiters.current.get(id);
        if (w) clearTimeout(w.timer);
        waiters.current.delete(id);
        post({ t: 'abort', id });
        throw e;
      }
      return done;
    },
    []
  );

  useImperativeHandle(ref, () => ({
    async measure(clip, opts, onBall) {
      const r = await ask({ t: 'opts', opts }, clip, onBall);
      if (!r.result) throw new Error('영상을 읽지 못했어요');
      return { result: r.result, ms: r.ms };
    },
    async locate(clip, opts) {
      const r = await ask({ t: 'locate', opts }, clip);
      return { found: r.found ?? null, ms: r.ms };
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
      onError={() => {
        /* 사이트에 못 닿음 — 기다리던 공은 실패로. 다음 공은 다시 뜬 웹뷰가 받는다 */
        for (const [id, w] of waiters.current) {
          clearTimeout(w.timer);
          w.reject(new Error('계산기를 불러오지 못했어요. 신호를 확인해 주세요.'));
          waiters.current.delete(id);
        }
        setGen((n) => n + 1);
      }}
      onContentProcessDidTerminate={() => {
        ready.current = new Promise((r) => (markReady.current = r));
        for (const [id, w] of waiters.current) {
          clearTimeout(w.timer);
          w.reject(new Error('계산기가 멈춰 이번 공은 재지 못했어요'));
          waiters.current.delete(id);
        }
        setGen((n) => n + 1);
      }}
    />
  );
});

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0.01, left: 0, top: 0 },
});
