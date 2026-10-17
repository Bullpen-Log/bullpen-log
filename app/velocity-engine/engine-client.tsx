'use client';

import { useEffect } from 'react';
import { analyzeVideo, warmDecoder } from '@/lib/velocity-engine/analyze-video';
import type { Approach } from '@/lib/velocity-engine/analyze-frames';

/**
 * 앱 ↔ 계산기 약속(native/src/velocity/engine.tsx 와 같이 고친다).
 *
 * 앱 → 계산기(webview.postMessage, JSON 글):
 *   { t: 'clip', id, part, parts, data(base64) } — 클립 파일을 조각으로. 조각이 다 오면 잰다.
 *   { t: 'opts', id, opts } — 그 클립을 잴 옵션(아래 MeasureOpts). 'clip' 첫 조각보다 먼저 보낸다.
 * 계산기 → 앱(window.ReactNativeWebView.postMessage):
 *   { t: 'ready' } · { t: 'ball', id }(공 길을 찾음 — '구속 계산 중'을 띄울 때) · { t: 'result', id, result, ms } · { t: 'fail', id, message }
 *
 * 옵션은 사이트가 앱 클립을 잴 때(lib/velocity-engine/dual-capture.ts measure)와 같다 — 공 알림이면 공 시각 둘레(ballRange)만,
 * 아니면 영상 전체를 훑는다. fMP4 라 파일 머리에 fps · 렌즈 정보가 없어 앱이 알려 준 값을 쓴다.
 */
export type MeasureOpts = {
  fps: number;
  fovDeg: number;
  fovKnown: boolean;
  ballRange?: { startSec: number; endSec: number; seedT: number };
  approach: Approach;
  focalPerLongSide: number | null;
  releaseDistanceM: number | null;
  distanceM: number | null;
  distanceAuto: boolean;
  tiltRad: number | null;
};

type Inbound =
  | { t: 'opts'; id: number; opts: MeasureOpts }
  | { t: 'clip'; id: number; part: number; parts: number; data: string };

/** 받은 조각은 칸 번호로 센다 — 배열 길이만 늘려 두면 빈 칸을 every 가 건너뛰어 덜 온 클립을 쟀다 */
type Pending = { opts?: MeasureOpts; total: number; parts: Map<number, string> };

function send(msg: unknown) {
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage(s: string): void } }).ReactNativeWebView;
  rn?.postMessage(JSON.stringify(msg));
}

function bytesOf(parts: string[]): Uint8Array<ArrayBuffer> {
  const chunks = parts.map((b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export function EngineClient() {
  useEffect(() => {
    const pending = new Map<number, Pending>();
    /* 한 번에 한 클립씩 — 폰에서 둘을 같이 재면 서로 느려진다(사이트도 차례로 잰다) */
    let queue = Promise.resolve();

    const measure = (id: number, opts: MeasureOpts, data: Uint8Array<ArrayBuffer>) => {
      queue = queue.then(async () => {
        const t0 = performance.now();
        try {
          const result = await analyzeVideo({
            file: new File([data], 'dual-main.mp4', { type: 'video/mp4' }),
            ...(opts.ballRange ?? {}),
            fps: opts.fps,
            fovDeg: opts.fovDeg,
            fovKnown: opts.fovKnown,
            approach: opts.approach,
            focalPerLongSide: opts.focalPerLongSide,
            releaseDistanceM: opts.releaseDistanceM,
            distanceM: opts.distanceM,
            distanceAuto: opts.distanceAuto,
            tiltRad: opts.tiltRad,
            onBall: () => send({ t: 'ball', id }),
          });
          send({ t: 'result', id, result, ms: Math.round(performance.now() - t0) });
        } catch (e) {
          send({ t: 'fail', id, message: e instanceof Error ? e.message : '영상을 읽지 못했어요' });
        }
      });
    };

    const onMessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      let msg: Inbound;
      try {
        msg = JSON.parse(ev.data) as Inbound;
      } catch {
        return;
      }
      const p = pending.get(msg.id) ?? { total: 0, parts: new Map<number, string>() };
      pending.set(msg.id, p);
      if (msg.t === 'opts') p.opts = msg.opts;
      else if (msg.t === 'clip') {
        p.total = msg.parts;
        p.parts.set(msg.part, msg.data);
      }
      if (p.opts && p.total > 0 && p.parts.size === p.total) {
        pending.delete(msg.id);
        measure(msg.id, p.opts, bytesOf(Array.from({ length: p.total }, (_, i) => p.parts.get(i) ?? '')));
      }
    };

    /* iOS 웹뷰는 window 로, 안드로이드는 document 로 보낸다 */
    window.addEventListener('message', onMessage);
    document.addEventListener('message', onMessage as EventListener);
    /* 첫 공 계산이 디코더 모듈 받기를 기다리지 않게 */
    void warmDecoder().catch(() => undefined);
    send({ t: 'ready' });
    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('message', onMessage as EventListener);
    };
  }, []);

  return null;
}
