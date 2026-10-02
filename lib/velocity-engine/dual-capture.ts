'use client';

import {
  callDualCamera,
  readDualClip,
  type DualClip,
  type DualStartInfo,
} from '@/lib/dual-camera';
import { analyzeVideo, type VideoAnalyzeResult } from './analyze-video';
import type { Approach } from './validate';
import type {
  CameraFocus,
  CameraInfo,
  LiveStatus,
  PitchClip,
  ResultMeta,
} from './live-capture';

/**
 * 아이폰 앱의 일반 · 광각 동시 촬영으로 재기(설정 '광각 영상도 같이 저장' + 앱에 'DualCamera' 부품, 2026-10-03 계획의 4단계).
 *
 * 웹 카메라(LiveCapture)와 같은 모양으로 부른다 — 측정 화면은 둘 중 하나를 쥔다. 다른 점:
 *   - 카메라 · 미리보기는 앱이 쥔다. 미리보기는 웹뷰 뒤에 그려지고, 사이트는 뷰파인더 자리를 투명하게 비운다
 *     (<html data-dualcam>, globals.css). 그래서 뷰파인더 자리가 바뀌면 앱에 알린다(setPreview).
 *   - 던짐은 앱이 알아채('throw' 알림) 그 앞뒤를 두 카메라 다 잘라 준다. 일반 카메라 클립을 영상 파일 엔진으로 잰다 —
 *     결과는 던진 뒤 1~3초(조각이 닫히길 기다림 + 읽기 + 계산). 실시간 값보다 늦지만 보정을 마친 길이다.
 *   - 렌즈 보정용 사진(snapshot)은 없다(장면이 웹에 안 온다).
 */

export type DualCaptureHandlers = {
  onStatus: (status: LiveStatus) => void;
  onResult: (result: VideoAnalyzeResult, meta: ResultMeta) => void;
  onClip: (id: number, clip: PitchClip) => void;
  /** 광각 클립 — 잰 공(ok)에만 온다. 못 잰 공의 광각 파일은 읽지 않고 지운다 */
  onWideClip: (id: number, clip: PitchClip) => void;
  onError: (message: string) => void;
  onNotice?: (message: string) => void;
  onFps?: (fps: number, low: boolean) => void;
};

type Bridge = {
  nativeCallback?: (
    plugin: string,
    method: string,
    options: unknown,
    callback: (result: unknown, error?: unknown) => void
  ) => string;
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
};

/** 앱 부품의 알림 받기 — @capacitor/core 의 addListener 와 같은 길(사이트엔 그 패키지가 없다) */
function listen(eventName: string, cb: (data: Record<string, unknown>) => void): () => void {
  const cap = (window as Window & { Capacitor?: Bridge }).Capacitor;
  if (!cap?.nativeCallback) return () => undefined;
  const callbackId = cap.nativeCallback('DualCamera', 'addListener', { eventName }, (data) => {
    if (data && typeof data === 'object') cb(data as Record<string, unknown>);
  });
  return () => {
    void cap.nativePromise?.('DualCamera', 'removeListener', { callbackId, eventName }).catch(
      () => undefined
    );
  };
}

/** 한 번에 쥐는 던짐 수 — 계산이 밀리면 그 뒤 던짐은 알리고 넘긴다 */
const MAX_PENDING = 2;

export class DualCapture {
  private status: LiveStatus = 'off';
  private armed = false;
  private manual = false;
  private running = false;
  private gen = 0;
  private nextId = 0;
  private pending = 0;
  private queue: Promise<void> = Promise.resolve();
  private unlisten: (() => void)[] = [];
  private previewTimer: ReturnType<typeof setInterval> | null = null;
  private lastRect = '';
  private info: DualStartInfo | null = null;
  private focalPerLongSide: number | null = null;
  private releaseDistanceM: number | null = null;
  /** 앱이 카메라를 놓을 때까지 — 웹 카메라로 바꿔 켤 때 기다린다(같은 카메라를 둘이 못 쓴다) */
  stopped: Promise<void> = Promise.resolve();

  constructor(
    private finder: HTMLElement,
    private handlers: DualCaptureHandlers,
    private fovDeg: number,
    private approach: Approach,
    private net: boolean
  ) {}

  private setStatus(s: LiveStatus) {
    this.status = s;
    this.handlers.onStatus(s);
  }

  private rect() {
    const r = this.finder.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /** 뷰파인더 자리를 앱에 알린다 — 바뀌었을 때만(크기 · 화면 돌림 · 판이 오르내림) */
  private syncPreview = () => {
    if (!this.running) return;
    const r = this.rect();
    const key = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`;
    if (key === this.lastRect) return;
    this.lastRect = key;
    void callDualCamera('setPreview', { ...r, visible: r.w > 0 && r.h > 0 }).catch(
      () => undefined
    );
  };

  async start(): Promise<CameraInfo> {
    const gen = ++this.gen;
    this.setStatus('starting');
    document.documentElement.dataset.dualcam = '';
    let info: DualStartInfo;
    try {
      info = await callDualCamera<DualStartInfo>('start', {
        fps: 60,
        net: this.net,
        preview: this.rect(),
        armed: false,
      });
    } catch (e) {
      if (gen === this.gen) {
        delete document.documentElement.dataset.dualcam;
        this.setStatus('off');
      }
      throw e;
    }
    if (gen !== this.gen) throw new DOMException('꺼짐', 'AbortError');
    this.info = info;
    this.running = true;
    this.lastRect = '';
    this.unlisten.push(
      listen('throw', (d) => {
        const at = Number(d.atSec);
        if (Number.isFinite(at)) this.onThrow(at);
      }),
      listen('error', (d) => this.handlers.onError(String(d.message ?? '카메라 오류')))
    );
    this.previewTimer = setInterval(this.syncPreview, 250);
    window.addEventListener('resize', this.syncPreview);
    this.syncPreview();
    this.handlers.onFps?.(info.mainFps, info.mainFps < 50);
    this.setStatus('ready');
    if (this.armed) this.arm();
    return {
      width: info.mainWidth,
      height: info.mainHeight,
      label: 'DualCamera · 일반',
      focus: this.net ? 'manual' : 'auto',
      zoom: 1,
      frameRate: info.mainFps,
      cropped: false,
    };
  }

  private onThrow(atSec: number) {
    if (!this.running || !this.armed) return;
    if (this.pending >= MAX_PENDING) {
      this.handlers.onNotice?.('계산이 밀려 공 하나를 건너뛰었어요');
      return;
    }
    /* 수동이면 한 공만 — 다음 공은 '다음 공' 단추(arm) */
    if (this.manual) {
      this.armed = false;
      void callDualCamera('setTrigger', { armed: false }).catch(() => undefined);
    }
    const id = ++this.nextId;
    const gen = this.gen;
    this.pending++;
    this.setStatus('capturing');
    this.queue = this.queue
      .then(() => this.measure(id, atSec, gen))
      .catch((e) => {
        if (gen === this.gen)
          this.handlers.onNotice?.(e instanceof Error ? e.message : '영상을 읽지 못했어요');
      })
      .finally(() => {
        this.pending--;
        if (gen === this.gen && this.pending === 0)
          this.setStatus(this.armed ? 'armed' : 'ready');
      });
  }

  private async measure(id: number, atSec: number, gen: number) {
    const clips = await callDualCamera<{ main: DualClip; wide: DualClip | null }>('clip', {
      atSec,
    });
    const dropWide = () =>
      clips.wide
        ? callDualCamera('discard', { paths: [clips.wide.path] }).catch(() => undefined)
        : undefined;
    if (gen !== this.gen) {
      await callDualCamera('discard', { paths: [clips.main.path] }).catch(() => undefined);
      await dropWide();
      return;
    }
    const main = clips.main;
    const blob = await readDualClip(main);
    this.setStatus('analyzing');
    /* fMP4 라 파일 머리에 fps · 렌즈 정보가 없다 — 앱이 알려 준 값으로 넘긴다 */
    const result = await analyzeVideo({
      file: new File([blob], 'dual-main.mp4', { type: 'video/mp4' }),
      fps: main.fps,
      fovDeg: main.fovDeg > 0 ? main.fovDeg : this.fovDeg,
      approach: this.approach,
      focalPerLongSide: this.focalPerLongSide,
      releaseDistanceM: this.releaseDistanceM,
    });
    if (gen !== this.gen) {
      await dropWide();
      return;
    }
    const meta: ResultMeta = { id, triggerT: performance.now() };
    this.handlers.onResult(result, meta);
    if (!result.measure.ok) {
      await dropWide();
      return;
    }
    this.handlers.onClip(id, {
      blob,
      mime: 'video/mp4',
      durationSec: main.durationSec,
      eventSec: main.eventSec,
    });
    if (clips.wide) {
      const wide = clips.wide;
      const wideBlob = await readDualClip(wide);
      if (gen === this.gen)
        this.handlers.onWideClip(id, {
          blob: wideBlob,
          mime: 'video/mp4',
          durationSec: wide.durationSec,
          eventSec: wide.eventSec,
        });
    }
  }

  arm() {
    this.armed = true;
    if (!this.running) return;
    void callDualCamera('setTrigger', { armed: true }).catch(() => undefined);
    if (this.pending === 0) this.setStatus('armed');
  }

  disarm() {
    this.armed = false;
    if (!this.running) return;
    void callDualCamera('setTrigger', { armed: false }).catch(() => undefined);
    if (this.pending === 0) this.setStatus('ready');
  }

  stop() {
    this.gen++;
    const wasRunning = this.running;
    this.running = false;
    this.armed = false;
    this.unlisten.forEach((u) => u());
    this.unlisten = [];
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.previewTimer = null;
    window.removeEventListener('resize', this.syncPreview);
    delete document.documentElement.dataset.dualcam;
    if (wasRunning || this.status === 'starting')
      this.stopped = callDualCamera('stop').then(
        () => undefined,
        () => undefined
      );
    this.setStatus('off');
  }

  setManual(v: boolean) {
    this.manual = v;
  }
  setNet(net: boolean) {
    this.net = net;
  }
  /** 클립은 늘 만든다(앱이 잘라 준다) */
  setClips(on: boolean) {
    void on;
  }
  setFov(fovDeg: number) {
    this.fovDeg = fovDeg;
  }
  setApproach(approach: Approach) {
    this.approach = approach;
  }
  setFocalPerLongSide(v: number | null) {
    this.focalPerLongSide = v;
  }
  setReleaseDistance(v: number | null) {
    this.releaseDistanceM = v;
  }
  /** 초점은 앱이 건다(네트 있음 = 고정, 없음 = 자동) */
  async refocus(): Promise<CameraFocus> {
    return this.net ? 'manual' : 'auto';
  }
  /** 장면이 웹에 오지 않는다 — 렌즈 보정은 웹 카메라로 */
  snapshot(): null {
    return null;
  }
  getStatus() {
    return this.status;
  }
  getInfo() {
    return this.info;
  }
}
