'use client';

import {
  callDualCamera,
  readDualClip,
  type DualClip,
  type DualStartInfo,
} from '@/lib/dual-camera';
import { DEFAULT_CAM_MODE } from '@/lib/velocity-camera-mode';
import { analyzeVideo, warmDecoder, type VideoAnalyzeResult } from './analyze-video';
import { LIVE_GOOD_FPS } from './live-meter';
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
 * 앱이 알리는 던짐은 두 가지다(DualCameraPlugin MotionTrigger, 2026-10-08 사용자: "공을 던지지도 않았는데 투구를 인식했다고 한다
 * — 실제로 날아가는 투구를 인식했을 때만"):
 *   - 'ball' — 날아가는 공이 확실하다(가운데에서 시작해 장면마다 이어지며 빠르게 작아지는 덩어리). '투구를 인식했어요'를 바로 띄운다.
 *     클립은 공이 처음 보인 때 앞 0.6 · 뒤 1.6초(그물까지 0.6초쯤).
 *   - 'motion' — 볼 자리가 크게 움직였다(와인드업 · 사람 · 초점). 공인지 모르니 화면에 띄우지 않고 클립(앞 0.5 · 뒤 2.6초 —
 *     다리를 들고 공을 놓기까지 1초 남짓)을 재 보고, 공이 있으면 결과만 보이고 없으면 조용히 넘긴다. 공이 작게 찍혀 'ball' 이 못
 *     잡는 투구를 이것이 잡는다. 재는 중에 'ball' 이 오면 그 클립을 그대로 쓰고 화면에만 띄운다.
 * 클립 안의 던진 때는 영상 엔진이 공으로 찾는다(find-throw).
 */
const BALL_CLIP: [before: number, after: number] = [0.6, 1.6];
/** 공 알림 카드를 띄웠는데 계산에서 공 길을 못 찾았을 때의 알림 */
const LOST_BALL_NOTE = '공을 끝까지 찾지 못해 이번 공은 재지 못했어요. 다시 던져 주세요.';
/** 공 알림 클립에서 재는 구간 — 공이 처음 보인 때 앞 · 뒤(초). 실험대(릴리스 앞 0.15 ~ 뒤 1.4초)와 같게, 알림이 릴리스보다 조금 늦어 앞을 넉넉히 */
const BALL_RANGE: [before: number, after: number] = [0.25, 1.45];
const MOTION_CLIP: [before: number, after: number] = [0.5, 2.6];

/** 재는 클립 하나 — 창(start ~ end, 앱 카메라 시계 초) · 화면에 띄우나 · 계산 중인가 */
type Job = {
  id: number;
  at: number;
  start: number;
  end: number;
  visible: boolean;
  /** 공 알림으로 만든 작업 — at 이 공이 처음 보인 때다(움직임 작업이 공 알림으로 '보이게' 바뀐 것은 아님) */
  ball: boolean;
  /** 움직임 작업의 클립 창 안에 공 알림이 왔으면 그 시각(카메라 시계) — 그 공 시각으로 잰다 */
  ballAt?: number;
  analyzing: boolean;
};

/** 앱 카메라 상태(DualCameraPlugin diag) — 카메라 상태 판이 보인다 */
export type CameraDiag = {
  /** 고른 형식을 애플이 적은 그대로(HRSI · fov · binned · upscales @ …) */
  format: string;
  /** 센서를 묶어 읽나 — 그러면 2배 줌이 화면을 늘린다 */
  binned: boolean;
  /** 이 배율부터 화면을 늘린다 */
  upscaleAt: number;
  /** 화면을 늘리지 않는 줌(48MP 센서의 2배 등) */
  nativeZooms: number[];
  zoom: number;
  stabilization: string;
  stabilizationSupported: boolean;
  focusMode: 'locked' | 'auto' | 'continuous';
  manualFocus: boolean;
  /** 렌즈 자리 0(가까이) ~ 1(멀리) */
  lens: number;
  adjusting: boolean;
  farOnly: boolean;
  iso: number;
  /** 노출 시간(초) */
  shutter: number;
  fovDeg: number;
  fovSource: string;
};

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
  private jobs: Job[] = [];
  /** 끝난 클립의 창 — 같은 공으로 알림이 또 와도 다시 재지 않게(5초 동안) */
  private recent: { start: number; end: number; until: number }[] = [];
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
        /* 초점 — 스트라이크 존 가운데에 자동초점, 측정을 시작하면 맞춘 뒤 잠근다(앱이 armed 로 안다) */
        focus: this.focusAt,
        focusFar: this.focusFar(),
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
        /* 옛 앱은 kind 가 없다 — 움직임으로 본다 */
        if (Number.isFinite(at)) this.onThrow(at, d.kind === 'ball' ? 'ball' : 'motion');
      }),
      listen('error', (d) => this.handlers.onError(String(d.message ?? '카메라 오류'))),
      /* 실제로 받은 장면 수(1초마다) — 처리가 밀려 장면을 버리면 약속한 60 보다 낮다. 옛 앱은 이 알림이 없다 */
      listen('fps', (d) => {
        const f = Number(d.fps);
        if (Number.isFinite(f) && f > 0) this.handlers.onFps?.(f, f < LIVE_GOOD_FPS);
      })
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
      focus: 'auto',
      zoom: this.distanceM && this.approach === 'receding' ? 2 : 1,
      frameRate: info.mainFps,
      cropped: false,
      offStandard: dualOffStandard(info),
    };
  }

  /** 화면에 띄우는 클립이 있으면 담는 중 · 계산 중, 없으면 기다림 */
  private syncStatus() {
    const shown = this.jobs.filter((j) => j.visible);
    this.setStatus(
      shown.length === 0
        ? this.armed
          ? 'armed'
          : 'ready'
        : shown.some((j) => j.analyzing)
          ? 'analyzing'
          : 'capturing'
    );
  }

  private onThrow(atSec: number, kind: 'ball' | 'motion') {
    if (!this.running || !this.armed) return;
    const ball = kind === 'ball';
    /* 재고 있는 클립 창 안이면 그 클립이 이 공을 담는다 — 공이 확실하면 화면에만 띄운다 */
    const covering = this.jobs.find((j) => atSec >= j.start && atSec <= j.end);
    if (covering) {
      /*
       * 움직임 클립(와인드업에서 알림) 안에 공 알림이 왔다 — 그 공 시각으로 잰다(거친 훑기는 와인드업 몸 움직임을 공으로 골라 진짜 공 구간을
       * 놓치곤 했다: 2026-10-09 실내 41.3초 움직임 길 59.2 · 공 길 64.5km/h, 99.5초 움직임 길 못 잼 · 공 길 65.6)
       */
      if (ball && !covering.ball && covering.ballAt == null) covering.ballAt = atSec;
      if (ball && !covering.visible) {
        covering.visible = true;
        this.syncStatus();
      }
      return;
    }
    const now = performance.now();
    this.recent = this.recent.filter((r) => r.until > now);
    if (this.recent.some((r) => atSec >= r.start && atSec <= r.end)) return;
    if (this.jobs.length >= MAX_PENDING) {
      if (ball) this.handlers.onNotice?.('계산이 밀려 공 하나를 건너뛰었어요');
      return;
    }
    const [before, after] = ball ? BALL_CLIP : MOTION_CLIP;
    const job: Job = {
      id: ++this.nextId,
      at: atSec,
      start: atSec - before,
      end: atSec + after,
      visible: ball,
      ball,
      analyzing: false,
    };
    this.jobs.push(job);
    const gen = this.gen;
    this.syncStatus();
    this.queue = this.queue
      .then(() => this.measure(job, gen))
      .catch((e) => {
        if (gen === this.gen && job.visible)
          this.handlers.onNotice?.(e instanceof Error ? e.message : '영상을 읽지 못했어요');
      })
      .finally(() => {
        this.jobs = this.jobs.filter((j) => j !== job);
        this.recent.push({ start: job.start, end: job.end, until: performance.now() + 5000 });
        if (gen === this.gen) this.syncStatus();
      });
  }

  private async measure(job: Job, gen: number) {
    const id = job.id;
    /* 걸린 시간 — 클립 기다림 · 옮기기 · 계산(앱 콘솔에서 본다, 결과를 빨리 내는 일의 기준) */
    const t0 = performance.now();
    const clips = await callDualCamera<{ main: DualClip; wide: DualClip | null }>('clip', {
      atSec: job.at,
      beforeSec: job.at - job.start,
      afterSec: job.end - job.at,
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
    const t1 = performance.now();
    const blob = await readDualClip(main);
    const t2 = performance.now();
    job.analyzing = true;
    if (gen === this.gen) this.syncStatus();
    /* fMP4 라 파일 머리에 fps · 렌즈 정보가 없다 — 앱이 알려 준 값으로 넘긴다 */
    /*
     * 공 알림이면 앱이 공이 처음 보인 때(eventSec)를 안다 — 영상 전체를 거칠게 훑어 공을 찾는 일(폰에서 1.85초, 계산의 절반)을
     * 건너뛰고 그때부터 구간을 바로 준다(실험대와 같은 구간: 릴리스 앞 0.2초 ~ 뒤 1.4초). 움직임 클립은 공이 어디 있는지 몰라 훑는다.
     */
    /* 공이 처음 보인 때(클립 시각) — 공 알림 작업은 알림 시각, 움직임 작업에 묶인 공 알림은 그 차이만큼 뒤 */
    const ballEv = job.ball ? main.eventSec : job.ballAt != null ? main.eventSec + (job.ballAt - job.at) : null;
    const ballRange =
      ballEv != null && ballEv < main.durationSec
        ? {
            startSec: Math.max(0, ballEv - BALL_RANGE[0]),
            endSec: Math.min(main.durationSec, ballEv + BALL_RANGE[1]),
            seedT: ballEv,
          }
        : {};
    const result = await analyzeVideo({
      file: new File([blob], 'dual-main.mp4', { type: 'video/mp4' }),
      ...ballRange,
      fps: main.fps,
      fovDeg: main.fovDeg > 0 ? main.fovDeg : this.fovDeg,
      approach: this.approach,
      focalPerLongSide: this.focalPerLongSide,
      releaseDistanceM: this.releaseDistanceM,
      distanceM: this.distanceM,
      distanceAuto: this.distanceAuto,
      /*
       * 앱이 잰 화각(videoFieldOfView, 줌만큼 좁힘 · 손떨림 보정이 자른 만큼 좁힘) — 렌즈 값 · 이 기종에서 잰 자른 몫(measured) ·
       * 보정이 꺼졌으면 믿을 만하다. 자른 몫을 짐작했으면(estimate, 안 잰 기종) 엔진이 ± 를 넓히고 알린다.
       */
      fovKnown: main.fovDeg > 0 && main.fovSource !== 'estimate',
      tiltRad: this.tiltRad,
      /* 움직임으로 잡아 조용히 재던 클립에서 공을 찾았다 — 그때부터 '구속 계산 중'을 띄운다(결과가 알림 없이 불쑥 뜨지 않게) */
      onBall: () => {
        if (job.visible || gen !== this.gen) return;
        job.visible = true;
        this.syncStatus();
      },
    });
    const tm = result.video?.timing;
    console.info(
      `[velo] clip ${Math.round(t1 - t0)}ms · read ${Math.round(t2 - t1)}ms (${blob.size}B) · analyze ${Math.round(performance.now() - t2)}ms` +
        (tm
          ? ` (훑기 ${Math.round(tm.coarseMs)} · 공 찾기 ${Math.round(tm.findMs)} · 장면 ${Math.round(tm.framesMs)} · 엔진 ${Math.round(tm.analyzeMs)} · 디코더 열기 ${Math.round(tm.openMs)} · 풀기 ${tm.decoded}장 · 되감기 ${tm.seeks}번 기다림 ${Math.round(tm.seekWaitMs)} · 그리기 ${Math.round(tm.drawMs)})`
          : '') +
        ` · ${result.measure.ok ? 'ok' : result.measure.code}`
    );
    if (gen !== this.gen) {
      await dropWide();
      return;
    }
    /*
     * 공을 못 쟀다 — 움직임으로만 잡은 클립이거나, 공 알림이었어도 영상에서 공 길을 거의 못 찾았으면 헛알림(와인드업 · 사람 ·
     * 폰을 만짐)으로 보고 조용히 넘긴다(띄웠던 카드는 거둬진다). 공 길은 찾았는데 못 잰 것만 '못 쟀어요'로 알린다.
     */
    if (!result.measure.ok && (!job.visible || result.track.length < 4)) {
      /* 카드를 띄웠는데(공 알림) 공 길을 못 찾았다 — 말없이 거두지 않고 알린다(2026-10-09 김민: "인식하다가 아무것도 안 뜬다") */
      if (job.visible && gen === this.gen) this.handlers.onNotice?.(LOST_BALL_NOTE);
      await dropWide();
      return;
    }
    /* 조용히 재던 클립이 거친 훑기 없이 공을 찾았다 — 결과 전에 잠깐 '인식했어요'를 보인다(카드 없이 결과가 불쑥 뜨지 않게) */
    if (!job.visible && gen === this.gen) {
      job.visible = true;
      this.syncStatus();
      await new Promise((r) => setTimeout(r, 400));
      if (gen !== this.gen) {
        await dropWide();
        return;
      }
    }
    /* 클립을 그대로 쟀으니 궤적 시각 = 클립 시각 */
    const meta: ResultMeta = { id, triggerT: performance.now(), hitT: main.eventSec };
    this.handlers.onResult(result, meta);
    if (!result.measure.ok) {
      await dropWide();
      return;
    }
    /* 수동이면 한 공만 — 다음 공은 '다음 공' 단추(arm). 헛알림으로 멈추지 않게 잰 뒤에 끈다 */
    if (this.manual && gen === this.gen) {
      this.armed = false;
      void callDualCamera('setTrigger', { armed: false }).catch(() => undefined);
      this.syncStatus();
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
    /* 첫 공 계산이 디코더 모듈 받기 · JIT 데우기를 기다리지 않게 */
    void warmDecoder().catch(() => undefined);
    void callDualCamera('setTrigger', { armed: true }).catch(() => undefined);
    this.syncStatus();
  }

  disarm() {
    this.armed = false;
    if (!this.running) return;
    void callDualCamera('setTrigger', { armed: false }).catch(() => undefined);
    this.syncStatus();
  }

  stop() {
    this.gen++;
    this.jobs = [];
    this.recent = [];
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
  /*
   * 초점 — 앱이 스트라이크 존 가운데에 자동초점을 걸고, 측정을 시작하면(arm) 그 자리에서 한 번 맞춘 뒤 잠근다(던질 때 투수 몸에
   * 끌려가지 않게). 투수 뒤이거나 네트가 있으면 먼 곳만 본다. 예전에는 네트 있음이면 렌즈를 가장 먼 끝에 고정해 화면이 뿌옇게
   * 나왔다(2026-10-08 사용자). 이 설정으로 아이폰 15 Pro Max 에서 자동초점이 잘 잡히는 것을 맥에 연결해 확인했다(렌즈 0.73 에서
   * 맞추고 잠금). 그래도 흐리면 카메라 상태 판(tune)의 수동 초점으로 맞춘다.
   */
  private focusAt = { x: 0.5, y: 0.5 };
  private focusFar() {
    return this.approach === 'receding' || this.net;
  }
  /** 초점 자리 — 스트라이크 존 가운데(세로 화면 0~1). 켜져 있으면 곧바로 그리로 다시 맞춘다 */
  setFocusPoint(p: { x: number; y: number }) {
    if (Math.abs(p.x - this.focusAt.x) < 0.01 && Math.abs(p.y - this.focusAt.y) < 0.01) return;
    this.focusAt = p;
    if (this.running)
      void callDualCamera('focus', { focus: p, far: this.focusFar() }).catch(() => undefined);
  }
  /**
   * 렌즈 보정은 1~2m 앞 공을 잰다 — '먼 곳만' 초점을 풀고 그 자리(세로 화면 0~1)에 맞춘다. null 이면 존 가운데 · 원래 거리로 되돌린다
   */
  focusNear(p: { x: number; y: number } | null) {
    if (!this.running) return;
    void callDualCamera(
      'focus',
      p ? { focus: p, far: false } : { focus: this.focusAt, far: this.focusFar() }
    ).catch(() => undefined);
  }
  /** 카메라 상태(형식 · 줌 · 손떨림 보정 · 초점 · 노출) — 옛 앱은 null */
  async diag(): Promise<CameraDiag | null> {
    if (!this.running) return null;
    return callDualCamera<CameraDiag>('diag').catch(() => null);
  }
  /** 지금 켠 카메라를 바로 바꿔 본다 — 손떨림 보정 · 줌 · 수동 초점(lens 0~1) · 자동초점으로 되돌리기. 바뀐 상태를 돌려준다 */
  async tune(t: {
    stabilization?: boolean;
    zoom?: number;
    lens?: number;
    autoFocus?: boolean;
  }): Promise<CameraDiag | null> {
    if (!this.running) return null;
    return callDualCamera<CameraDiag>('tune', t).catch(() => null);
  }
  /** 재초점 단추 — 존 가운데에 다시 맞춘다(측정 중이면 맞춘 뒤 잠근다). 옛 앱은 focus 가 없어 그대로 */
  async refocus(): Promise<CameraFocus> {
    if (this.running) {
      await callDualCamera('focus', { focus: this.focusAt, far: this.focusFar() }).catch(
        () => undefined
      );
      /* 렌즈가 움직여 맞추는 데 1초 안팎 */
      await new Promise((r) => setTimeout(r, 800));
    }
    return 'auto';
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

/** 앱 카메라가 기준 조건에서 벗어난 까닭 — 앱이 알려 준 것(옛 앱은 모름 = 빈 목록) */
function dualOffStandard(info: DualStartInfo): string[] {
  const s = info.standard;
  if (!s) return [];
  const out: string[] = [];
  if (!s.resolution) out.push(`${Math.min(info.mainWidth, info.mainHeight)}p`);
  if (!s.fps) out.push(`${info.mainFps}fps`);
  if (!s.zoom) out.push('2배가 디지털 줌');
  if (!s.stabilization) out.push('손떨림 보정 없음');
  return out;
}
