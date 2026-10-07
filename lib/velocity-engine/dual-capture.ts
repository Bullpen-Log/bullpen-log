'use client';

import {
  callDualCamera,
  readDualClip,
  type DualClip,
  type DualStartInfo,
} from '@/lib/dual-camera';
import { DEFAULT_CAM_MODE } from '@/lib/velocity-camera-mode';
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
 * 아이폰 앱의 카메라로 재기(앱의 'DualCamera' 부품). 처음엔 설정 '광각 영상도 같이 저장'용 일반 · 광각 동시 촬영이었고
 * (2026-10-03), 2026-10-08 부터 새 앱이면 늘 이 길이다(사용자: "웹카메라가 아닌 앱 자체의 카메라로") — 일반 카메라 하나로,
 * 광각은 찍지 않는다(설정을 없앴다). 앱 카메라는 손떨림 보정(표준)을 건다. 웹 카메라(getUserMedia)는 그것을 켤 수 없다.
 *
 * 웹 카메라(LiveCapture)와 같은 모양으로 부른다 — 측정 화면은 둘 중 하나를 쥔다. 다른 점:
 *   - 카메라 · 미리보기는 앱이 쥔다. 미리보기는 웹뷰 뒤에 그려지고, 사이트는 뷰파인더 자리를 투명하게 비운다
 *     (<html data-dualcam>, globals.css). 그래서 뷰파인더 자리가 바뀌면 앱에 알린다(setPreview).
 *   - 던짐은 앱이 알아채('throw' 알림) 그 앞뒤를 두 카메라 다 잘라 준다. 일반 카메라 클립을 영상 파일 엔진으로 잰다 —
 *     결과는 던진 뒤 1~3초(조각이 닫히길 기다림 + 읽기 + 계산). 실시간 값보다 늦지만 보정을 마친 길이다.
 *   - 렌즈 보정용 장면(snapshot)은 앱에 청해 받아 둔다 — 부를 때마다 다음 장면을 청하고 받아 둔 것을 돌려준다(옛 앱은 없음).
 */

export type DualCaptureHandlers = {
  onStatus: (status: LiveStatus) => void;
  onResult: (result: VideoAnalyzeResult, meta: ResultMeta) => void;
  onClip: (id: number, clip: PitchClip) => void;
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

/**
 * 클립 길이 — 앱은 볼 자리의 움직임으로 던짐을 알아채서, 공보다 투수의 와인드업(다리 듦)에 먼저 반응한다. 다리를 들고 공을
 * 놓기까지 1초 남짓 · 그물까지 0.6초쯤이라 뒤로 2.6초를 받는다(예전 1.4초는 공이 날기 전에 끊길 수 있었다). 클립 안의 던진 때는
 * 영상 엔진이 공으로 찾는다(find-throw). 결과는 그만큼 늦게(알아챈 뒤 3~4초) 뜬다.
 */
const CLIP_BEFORE_SEC = 0.5;
const CLIP_AFTER_SEC = 2.6;

/** 렌즈 보정용 장면 — LiveCapture.snapshot() 과 같은 모양 */
type Snapshot = {
  luma: Uint8Array;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
};

/** 앱이 '이 아이폰은 안 됨'으로 켜기를 끝냈다 — reason 은 lib/dual-camera.ts 의 DualStatus.reason(cost · fps …) */
export class DualUnsupportedError extends Error {
  constructor(readonly reason: string) {
    super('이 아이폰은 일반 · 광각 카메라를 함께 켤 수 없어요.');
    this.name = 'DualUnsupportedError';
  }
}

/** 지금 앱 카메라를 맡은 것 — 앱 부품은 하나라, 옛 것이 끄면서 새 것의 카메라를 끄지 않게 */
let owner: symbol | null = null;

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
  /** 이 인스턴스의 표식 — 앱 카메라를 맡았는지(owner) 견줄 때 */
  private readonly token = Symbol('dual-capture');
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
    owner = this.token;
    this.setStatus('starting');
    document.documentElement.dataset.dualcam = '';
    let info: DualStartInfo;
    try {
      info = await callDualCamera<DualStartInfo>('start', {
        /*
         * 60fps 를 청하고 화질은 앱이 고르게 둔다 — 앱은 1080p 쪽에서 60fps 를 내는 가장 큰 화면을 잡는다(일반 카메라 하나면
         * 1080p 60). short 를 넘기면 앱이 '사용자가 고른 화질'로 읽어 60fps 를 못 내도 그 화질을 지켜, 광각과 함께 켤 때
         * 1080p 30 이 됐다(2026-10-08 사용자: 아이폰 15 Pro Max 인데 30프레임). 화질 · 프레임 고르기는 없앴다(1080 · 60 통일).
         */
        fps: DEFAULT_CAM_MODE.fps,
        net: this.net,
        preview: this.rect(),
        armed: false,
        /* 광각은 같이 찍지 않는다(설정을 없앴다, 2026-10-08) — 일반 카메라 하나라야 1080p 60 이 나온다 */
        wide: false,
        /* 거리 측정(엔진 2.0, 투수 뒤)은 일반 카메라 2배 — 옛 앱은 이 칸을 모르고 1배로 켠다(화각은 앱이 알려 준 값을 쓴다) */
        ...(this.distanceM && this.approach === 'receding' ? { zoom: 2 } : {}),
      });
    } catch (e) {
      if (gen === this.gen) {
        delete document.documentElement.dataset.dualcam;
        this.setStatus('off');
      }
      /* 앱이 '이 아이폰은 안 됨'으로 끝냈다(두 카메라의 하드웨어 몫 · 60fps 못 냄) — 화면이 웹 카메라로 바꿔 켠다 */
      const code = (e as { code?: unknown } | null)?.code;
      if (typeof code === 'string' && code.startsWith('unsupported-'))
        throw new DualUnsupportedError(code.slice('unsupported-'.length));
      throw e;
    }
    if (gen !== this.gen) {
      /* 켜는 사이에 껐다 — 그 사이 새로 켠 쪽이 없으면 앱 카메라도 끈다(앱이 끄기보다 켜기를 늦게 마칠 수 있다) */
      if (owner === this.token) void callDualCamera('stop').catch(() => undefined);
      throw new DOMException('꺼짐', 'AbortError');
    }
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
    /* 렌즈 보정이 첫 장면부터 쓰게 하나 받아 둔다 */
    this.snapshot();
    return {
      width: info.mainWidth,
      height: info.mainHeight,
      /* 렌즈 보정이 이 이름으로 카메라를 가린다(lensMatches) — 바꾸면 저장해 둔 보정이 안 맞는다 */
      label: 'DualCamera · 일반',
      focus: this.net ? 'manual' : 'auto',
      zoom: this.distanceM && this.approach === 'receding' ? 2 : 1,
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
      beforeSec: CLIP_BEFORE_SEC,
      afterSec: CLIP_AFTER_SEC,
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
      distanceM: this.distanceM,
      distanceAuto: this.distanceAuto,
      /*
       * 앱이 잰 화각(videoFieldOfView, 줌만큼 좁힘 · 손떨림 보정이 자른 만큼 좁힘) — 렌즈 값이거나 보정이 꺼졌으면 믿을 만하다.
       * 보정이 자른 몫을 짐작했으면(estimate) 엔진이 ± 를 넓히고 알린다.
       */
      fovKnown: main.fovDeg > 0 && main.fovSource !== 'estimate',
      tiltRad: this.tiltRad,
    });
    if (gen !== this.gen) {
      await dropWide();
      return;
    }
    /* 클립을 그대로 쟀으니 궤적 시각 = 클립 시각 */
    const meta: ResultMeta = { id, triggerT: performance.now(), hitT: main.eventSec };
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
    /* 광각은 청하지 않는다(wide: false) — 혹시 왔으면 지운다 */
    await dropWide();
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
    this.snap = null;
    const wasRunning = this.running;
    this.running = false;
    this.armed = false;
    this.unlisten.forEach((u) => u());
    this.unlisten = [];
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.previewTimer = null;
    window.removeEventListener('resize', this.syncPreview);
    /* 그 사이 다른 DualCapture 가 앱 카메라를 맡았으면 그것을 끄지 않는다(앱 부품은 하나다) */
    if (owner === this.token) {
      owner = null;
      delete document.documentElement.dataset.dualcam;
      if (wasRunning || this.status === 'starting')
        this.stopped = callDualCamera('stop').then(
          () => undefined,
          () => undefined
        );
    }
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
  /** 엔진 2.0 의 거리 자(m) · 카메라 숙임(라디안) — live-capture.ts 와 같은 뜻 */
  private distanceM: number | null = null;
  private distanceAuto = false;
  private tiltRad: number | null = null;
  setDistance(
    distanceM: number | null,
    tiltRad: number | null = this.tiltRad,
    distanceAuto: boolean = this.distanceAuto
  ) {
    this.distanceM = distanceM && distanceM > 0 ? distanceM : null;
    this.distanceAuto = distanceAuto;
    this.tiltRad = tiltRad;
  }
  setTilt(tiltRad: number | null) {
    this.tiltRad = tiltRad;
  }
  /** 초점은 앱이 건다(네트 있음 = 고정, 없음 = 자동) */
  async refocus(): Promise<CameraFocus> {
    return this.net ? 'manual' : 'auto';
  }
  /**
   * 렌즈 보정용 장면 — 받아 둔 것을 돌려주고 다음 장면을 청한다(렌즈 보정은 짧은 틈으로 여러 번 부르고, 같은 장면은 건너뛴다).
   * 옛 앱(snapshot 없음)이면 늘 null.
   */
  private snap: Snapshot | null = null;
  private snapBusy = false;
  snapshot(): Snapshot | null {
    if (this.running && !this.snapBusy) {
      this.snapBusy = true;
      const gen = this.gen;
      void callDualCamera<Omit<Snapshot, 'luma'> & { luma: string }>('snapshot', { short: 720 })
        .then((s) => {
          if (gen !== this.gen) return;
          const raw = atob(s.luma);
          const luma = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) luma[i] = raw.charCodeAt(i);
          this.snap = { ...s, luma };
        })
        .catch(() => undefined)
        .finally(() => {
          this.snapBusy = false;
        });
    }
    return this.snap;
  }
  getStatus() {
    return this.status;
  }
  getInfo() {
    return this.info;
  }
}
