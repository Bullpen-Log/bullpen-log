import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ComponentType, type Ref } from 'react';
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

/** 한 번 재기 · 훑기에 든 시간(ms) — ms 계산기 안(장면 풀기 + 계산), readMs 클립 읽기 + 조각 보내기, totalMs 부른 뒤 답까지(계산기 뜨기 기다림 포함) */
export type EngineTiming = { ms: number; readMs: number; totalMs: number };

export type EngineHandle = {
  /** 클립을 재 결과를 돌려준다. onBall — 공 길을 찾은 순간(조용히 재던 클립을 화면에 띄울 때) */
  measure(clip: Clip, opts: MeasureOpts, onBall?: () => void): Promise<{ result: EngineResult } & EngineTiming>;
  /** 클립을 훑어 공 시각만 찾는다(재지 않음) — 영상을 못 열면 null */
  locate(clip: Clip, opts: LocateOpts): Promise<{ found: ThrowLocation | null } & EngineTiming>;
  /** 계산기가 아직 붙든 일이 있나 — 앱이 시한에 포기한 일도 끝(답 · 건너뜀)이 올 때까지 센다. 훑기는 이때 쉰다 */
  busy(): boolean;
  /** 공(재기)이 왔다 — 훑기는 줄에서 빼고, 돌고 있으면 끊는다(공이 훑기 뒤에서 기다리지 않게) */
  yieldToMeasure(): void;
};

/**
 * 계산기 쪽 실패 — code 가 시도 기록(VelocityAttempt.rejectCode)에 그대로 남는다. 2026-10-20 세션에서 30초 시한 초과가 DB 에 한 줄도
 * 안 남아 몇 공을 잃었는지 몰랐다(capture.ts 가 실패도 시도로 적는다).
 */
export class EngineError extends Error {
  constructor(
    public code: 'TIMEOUT' | 'ENGINE_DOWN' | 'ENGINE_GONE' | 'ENGINE_FAIL',
    message: string
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

type WebViewHandle = { postMessage(message: string): void };
/* react-native-webview 14 의 타입은 ref 를 안 받지만 실제 부품은 forwardRef 다 */
const RefWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

const CHUNK = 1024 * 1024;
/** 계산이 이보다 오래 걸리면 포기한다(폰에서 보통 3~4초) — 계산기가 그 일을 시작한 때('start')부터 잰다 */
const TIMEOUT_MS = 30_000;
/** 훑기는 더 짧게 — 2.5초 넘으면 다음 하나를 건너뛰는 규칙(capture.ts)이라 오래 붙들 까닭이 없다 */
const LOCATE_TIMEOUT_MS = 15_000;
/**
 * 줄에서 기다리는 시한 — 보낸 때부터. 'start' 가 오면 위 시한으로 바꾼다. 옛 사이트(start 를 안 보냄)면 이것 하나로 잰다.
 * 예전엔 보낸 때부터 30초를 쟀고 포기해도 계산기는 그 일을 끝까지 해, 줄이 끝없이 길어졌다(2026-10-20 금윤호 실내 — 한 번 늦어지자
 * 그 뒤 모든 공이 시한에 걸려 '인식'이 한 번도 안 떴다). 이제 포기하면 계산기에 버리라고 알리고(abort), 기다린 시간은 따로 잰다.
 */
const QUEUE_TIMEOUT_MS = 90_000;
/** 시작한 일이 시한을 넘기고도 이만큼 끝(답)을 안 보내면 계산기가 멈춘 것 — 웹뷰를 새로 띄운다(디코더 · 일꾼이 멈추면 줄이 영영 안 풀린다) */
const HANG_GRACE_MS = 20_000;
/** 계산기 페이지를 못 불러오면(신호 없음) 다시 불러오기 전 쉬는 시간 — 처음 3초, 거듭 실패하면 두 배씩 30초까지 */
const RELOAD_BACKOFF_MS = [3_000, 6_000, 12_000, 30_000];
/** 계산기 웹뷰가 뜨기를 기다리는 시한 — 넘기면 그 공은 못 잰 것으로 */
const READY_TIMEOUT_MS = 20_000;

type Waiter = {
  /** 'result' 를 기다리는 재기, 'located' 를 기다리는 훑기 */
  kind: 'measure' | 'locate';
  resolve: (v: { result?: EngineResult; found?: ThrowLocation | null; ms: number }) => void;
  reject: (e: Error) => void;
  /** 시한이 지났다 — 포기하고 계산기에 버리라고 알린다 */
  expire: () => void;
  onBall?: () => void;
  timer: ReturnType<typeof setTimeout>;
  /** 시작('start')을 받았나 — 받으면 timer 를 계산 시한으로 다시 건다 */
  started?: boolean;
};

export const VelocityEngine = forwardRef<EngineHandle>(function VelocityEngine(_props, ref) {
  const web = useRef<WebViewHandle>(null);
  /** 바꾸면 계산기 웹뷰를 새로 연다(웹 프로세스가 죽었을 때) */
  const [gen, setGen] = useState(0);
  const ready = useRef<Promise<void> | null>(null);
  const markReady = useRef<() => void>(() => undefined);
  const waiters = useRef(new Map<number, Waiter>());
  const nextId = useRef(0);
  /** 계산기에 넘겼고 끝(result · located · fail · skipped)이 아직 안 온 일 — 앱이 포기한 일도 포함 */
  const inEngine = useRef(new Set<number>());
  const post = useCallback((m: unknown) => web.current?.postMessage(JSON.stringify(m)), []);
  /** 거듭된 불러오기 실패 수(ready 를 받으면 0) · 다시 불러오기 예약 */
  const loadFails = useRef(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 계산기 웹뷰를 새로 띄운다 — 기다리던 일은 모두 실패로, 붙든 일 셈은 비운다. ready 도 새로 — 예전엔 onError 뒤 ready 를 안 되돌려
   * 새 웹뷰가 뜨기 전에 보낸 일이 사라지고 그 번호가 '붙든 일'로 영영 남아 훑기가 세션 끝까지 멈췄다(2026-10-20 검토).
   */
  const restart = useCallback((code: 'ENGINE_DOWN' | 'ENGINE_GONE', message: string, delayMs: number) => {
    ready.current = new Promise((r) => (markReady.current = r));
    for (const [id, w] of waiters.current) {
      clearTimeout(w.timer);
      w.reject(new EngineError(code, message));
      waiters.current.delete(id);
    }
    inEngine.current.clear();
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      setGen((n) => n + 1);
    }, delayMs);
  }, []);
  useEffect(
    () => () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    },
    []
  );

  if (!ready.current) ready.current = new Promise((r) => (markReady.current = r));

  const onMessage = useCallback((ev: WebViewMessageEvent) => {
    let msg: { t: string; id?: number; result?: EngineResult; found?: ThrowLocation | null; ms?: number; message?: string };
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.t === 'ready') {
      loadFails.current = 0;
      return markReady.current();
    }
    if (msg.id != null && (msg.t === 'result' || msg.t === 'located' || msg.t === 'fail' || msg.t === 'skipped')) inEngine.current.delete(msg.id);
    const w = msg.id != null ? waiters.current.get(msg.id) : undefined;
    if (!w) return;
    if (msg.t === 'ball') return w.onBall?.();
    if (msg.t === 'start') {
      /* 차례가 왔다 — 시한을 지금부터 다시 잰다 */
      clearTimeout(w.timer);
      w.started = true;
      w.timer = setTimeout(() => w.expire(), w.kind === 'measure' ? TIMEOUT_MS : LOCATE_TIMEOUT_MS);
      return;
    }
    clearTimeout(w.timer);
    waiters.current.delete(msg.id!);
    if (msg.t === 'result' && msg.result) w.resolve({ result: msg.result, ms: msg.ms ?? 0 });
    else if (msg.t === 'located' && w.kind === 'locate') w.resolve({ found: msg.found ?? null, ms: msg.ms ?? 0 });
    else w.reject(new EngineError('ENGINE_FAIL', msg.message ?? '영상을 읽지 못했어요'));
  }, []);

  /**
   * 첫 메시지(재기 'opts' 또는 훑기 'locate')를 보내고 클립을 조각으로 넘긴 뒤 답을 기다린다 — 두 길이 같은 통로를 쓴다.
   * 조각은 카메라 모듈이 1MB 씩 읽어 준 base64 그대로.
   */
  const ask = useCallback(
    async (first: { t: 'opts'; opts: MeasureOpts } | { t: 'locate'; opts: LocateOpts }, clip: Clip, onBall?: () => void) => {
      const t0 = Date.now();
      /* 계산기(웹뷰)가 못 뜨면(오프라인 · 사이트 오류) 영영 기다리던 것 — 시한을 두고 실패로 돌린다 */
      const up = await Promise.race([(ready.current ?? Promise.resolve()).then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), READY_TIMEOUT_MS))]);
      if (!up) throw new EngineError('ENGINE_DOWN', '계산기를 불러오지 못했어요. 신호를 확인해 주세요.');
      const id = ++nextId.current;
      const kind = first.t === 'opts' ? 'measure' : 'locate';
      const done = new Promise<{ result?: EngineResult; found?: ThrowLocation | null; ms: number }>((resolve, reject) => {
        const expire = () => {
          const w = waiters.current.get(id);
          if (w) clearTimeout(w.timer);
          waiters.current.delete(id);
          /* 계산기가 아직 붙들고 있으면 버리게 — 줄에 서 있던 일은 건너뛰고 'skipped' 로 끝을 알린다 */
          post({ t: 'abort', id });
          const queued = w != null && !w.started;
          if (queued) {
            /* 시작 전이면 계산기는 이 일을 하지 않는다(옛 사이트 · 잃은 메시지면 답도 없다) — 붙든 일에서 바로 뺀다 */
            inEngine.current.delete(id);
          } else {
            /* 돌던 일 — 끝 답이 이만큼 안 오면 계산기가 멈춘 것이라 웹뷰를 새로 띄운다 */
            setTimeout(() => {
              if (inEngine.current.has(id)) restart('ENGINE_GONE', '계산기가 멈춰 다시 띄웠어요', 0);
            }, HANG_GRACE_MS);
          }
          reject(
            new EngineError(
              'TIMEOUT',
              kind === 'measure'
                ? queued
                  ? '계산이 밀려 이번 공은 재지 못했어요'
                  : '계산이 너무 오래 걸려 이번 공은 재지 못했어요'
                : '훑기가 너무 오래 걸렸어요'
            )
          );
        };
        waiters.current.set(id, { kind, resolve, reject, expire, onBall, timer: setTimeout(expire, QUEUE_TIMEOUT_MS) });
      });
      inEngine.current.add(id);
      post({ ...first, id, ack: true });
      const parts = Math.max(1, Math.ceil(clip.bytes / CHUNK));
      const r0 = Date.now();
      try {
        for (let part = 0; part < parts; part++) {
          /* 그사이 포기한 일(시한 · 공이 와서 훑기를 비킴 · 웹뷰를 다시 띄움) — 남은 조각은 안 보낸다(계산기도 버린다) */
          if (!waiters.current.has(id)) break;
          const { data } = await DualCamera.read({ path: clip.path, offset: part * CHUNK, length: CHUNK });
          post({ t: 'clip', id, part, parts, data });
        }
      } catch (e) {
        /* 클립 파일을 못 읽음(iOS 가 tmp 를 비움 등) — 기다리는 자리 · 웹 쪽 반쯤 온 조각을 치운다 */
        const w = waiters.current.get(id);
        if (w) clearTimeout(w.timer);
        waiters.current.delete(id);
        /* 덜 넘긴 클립은 계산기가 버리기만 하고 답이 없다 — 여기서 끝으로 센다 */
        inEngine.current.delete(id);
        post({ t: 'abort', id });
        throw e;
      }
      const readMs = Date.now() - r0;
      const r = await done;
      return { ...r, readMs, totalMs: Date.now() - t0 };
    },
    [post, restart]
  );

  useImperativeHandle(ref, () => ({
    async measure(clip, opts, onBall) {
      const r = await ask({ t: 'opts', opts }, clip, onBall);
      if (!r.result) throw new EngineError('ENGINE_FAIL', '영상을 읽지 못했어요');
      return { result: r.result, ms: r.ms, readMs: r.readMs, totalMs: r.totalMs };
    },
    async locate(clip, opts) {
      const r = await ask({ t: 'locate', opts }, clip);
      return { found: r.found ?? null, ms: r.ms, readMs: r.readMs, totalMs: r.totalMs };
    },
    busy: () => inEngine.current.size > 0,
    yieldToMeasure() {
      /* 돌고 있는 훑기도 — expire 가 abort 를 보내고 계산기가 끊는다(2.7.3, 모델 · 거친 훑기 둘 다). 예전엔 시작 안 한 것만 빼 공이 돌던 훑기 뒤에서 3~15초 기다렸다 */
      for (const w of [...waiters.current.values()]) if (w.kind === 'locate') w.expire();
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
      /*
       * 디코더(WebCodecs)를 못 열면 엔진은 <video> 되감기 길로 간다 — 이 둘이 없으면 RN 웹뷰가 화면 안 재생을 막아 첫 장면이 안 오고, 30초를
       * 기다리다 재기 시한(30초)에 걸렸다(2026-10-20 검토)
       */
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      onError={() => {
        /* 사이트에 못 닿음 — 기다리던 공은 실패로, 쉬었다가 다시 불러온다(예전엔 쉼 없이 다시 불러와 신호 없는 곳에서 끝없이 돌았다) */
        const wait = RELOAD_BACKOFF_MS[Math.min(loadFails.current, RELOAD_BACKOFF_MS.length - 1)];
        loadFails.current += 1;
        restart('ENGINE_DOWN', '계산기를 불러오지 못했어요. 신호를 확인해 주세요.', wait);
      }}
      onContentProcessDidTerminate={() => restart('ENGINE_GONE', '계산기가 멈춰 이번 공은 재지 못했어요', 0)}
    />
  );
});

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0.01, left: 0, top: 0 },
});
