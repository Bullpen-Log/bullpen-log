'use client';

import { buildBackground } from './detect.ts';
import {
  ANALYZE_WIDTH,
  analyzeFrames,
  cornerShift,
  type AnalyzeResult,
  type Approach,
  type CapturedFrame,
} from './analyze-frames.ts';

/**
 * 폰 카메라로 바로 구속을 잰다 — Smart Scout · PitchLab 처럼.
 *
 * 화면 한가운데 표적에 릴리스 포인트를 맞추고 던지면, 가운데에서 움직임이 시작되는 순간을
 * 알아채 그 앞뒤 프레임을 모아 계산한다(analyze-frames.ts). 영상 파일을 고르는 길과 계산은
 * 같고, 프레임을 카메라에서 바로 받는 것만 다르다.
 *
 * ── 어떻게 도는가 ──
 *
 * 1. 카메라를 켜고 화면(video)에 띄운다. 프레임이 올 때마다(requestVideoFrameCallback)
 *    720px 로 줄여 밝기만 남겨 둔다. 최근 프레임 몇 초치를 고리 버퍼에 쥔다.
 * 2. '측정 시작'을 누르면 기다린다 — 가운데가 잠잠해질 때까지(투수가 자세를 잡는 동안).
 *    잠잠한 프레임 몇 장으로 배경 그림을 만든다.
 * 3. 가운데에서 배경보다 밝아진 픽셀이 갑자기 늘면 '던졌다'로 본다. 그 뒤 0.6초를 더 담고
 *    (공은 0.3초 안에 작아져 사라진다) 앞 0.12초와 함께 계산으로 넘긴다.
 * 4. 결과를 알리고 다시 2 로 — 다음 공을 기다린다. 한 세션에서 여러 구를 잰다.
 *
 * ── 브라우저에서는 왜 시험용인가 ──
 *
 * 브라우저 카메라(getUserMedia)는 대개 30~60fps 까지만 준다. 계산은 60fps 밑이면 숫자를
 * 내지 않고 거부한다(validate.ts 의 MIN_FPS) — 공이 손을 떠나 사라지기까지 서너 장면뿐이라
 * 믿을 수 없어서다. 앱 껍데기에서 폰의 고속 촬영(120~240fps)을 붙이면 같은 코드로 제대로
 * 잰다. 그때까지 웹은 관리자가 흐름을 확인하는 자리다.
 *
 * 메모리: 720×1280 프레임 하나가 Uint8 로 0.9MB. 고리 버퍼 80장 + 던진 뒤 90장이면 150MB
 * 남짓 — 요즘 폰이면 된다. Float32 로 쥐면 네 배라 Uint8 로 둔다.
 */

export type LiveStatus =
  /** 카메라 꺼짐 */
  | 'off'
  /** 카메라 켜는 중(권한 묻는 중) */
  | 'starting'
  /** 카메라 켜짐, 측정은 안 함 */
  | 'ready'
  /** 측정 중 — 가운데가 잠잠해지길 기다린다 */
  | 'settling'
  /** 측정 중 — 던지면 된다 */
  | 'armed'
  /** 던짐을 알아채 담는 중 */
  | 'capturing'
  /** 계산 중 */
  | 'analyzing';

export type CameraInfo = {
  width: number;
  height: number;
  label: string;
};

export type LiveCaptureHandlers = {
  onStatus: (status: LiveStatus) => void;
  onResult: (result: AnalyzeResult) => void;
  onError: (message: string) => void;
  /** 실제로 들어오는 초당 프레임 수 — 화면에 보여 준다 */
  onFps?: (fps: number) => void;
};

/** 가운데 표적 상자 — 화면 가로 · 세로의 이 비율만큼 한가운데 */
export const CENTER_BOX_RATIO = 0.4;
/** 던지기 전 이만큼 연속으로 잠잠해야 배경을 만든다 */
const QUIET_FRAMES = 12;
/** 앞 프레임과 견줘 가운데 평균 밝기 차가 이 밑이면 잠잠하다 */
const QUIET_MEAN_DIFF = 2.0;
/** 배경보다 이만큼 밝아진 픽셀을 '움직였다'로 센다(detect.ts 의 DIFF_THRESHOLD 와 같다) */
const MOVE_THRESHOLD = 28;
/** 가운데에서 움직인 픽셀이 이만큼 넘으면 던진 것으로 본다 */
const TRIGGER_MIN_PX = 30;
/** 상자의 이 비율 넘게 움직였으면 공이 아니라 몸 · 카메라가 움직인 것 — 무시한다 */
const TRIGGER_MAX_RATIO = 0.35;
/** 던지기 앞뒤로 담는 시간(초) */
const PRE_SEC = 0.12;
const POST_SEC = 0.6;
/** 계산에 넘기는 최대 프레임 수 — 240fps 라도 앞 0.37초면 공은 이미 사라졌다 */
const MAX_ANALYZE_FRAMES = 90;
/** 고리 버퍼 크기(프레임) */
const RING_SIZE = 80;
/** 결과를 낸 뒤 이 시간(초)은 다시 던진 것으로 보지 않는다 — 네트에서 튄 공 등 */
const COOLDOWN_SEC = 1.5;

type RingFrame = { t: number; luma: Uint8Array };

export class LiveCapture {
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private sourceWidth = 0;
  private sourceHeight = 0;
  private ring: RingFrame[] = [];
  private status: LiveStatus = 'off';
  private cancelFrame: (() => void) | null = null;
  private lastTimes: number[] = [];

  /* 측정 상태 */
  private quietRun = 0;
  private background: Float32Array | null = null;
  private quietSamples: Uint8Array[] = [];
  private triggerT: number | null = null;
  private captured: RingFrame[] = [];
  private cooldownUntil = 0;
  private center = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly handlers: LiveCaptureHandlers,
    private fovDeg: number,
    /** 공이 멀어지나(투수 뒤) 다가오나(포수 뒤) — 다가오면 앞을 더 길게 담는다 */
    private approach: Approach = 'receding'
  ) {}

  setFov(fovDeg: number) {
    this.fovDeg = fovDeg;
  }

  setApproach(approach: Approach) {
    this.approach = approach;
  }

  getStatus() {
    return this.status;
  }

  private setStatus(next: LiveStatus) {
    if (this.status === next) return;
    this.status = next;
    this.handlers.onStatus(next);
  }

  /** 카메라를 켠다. 권한 창이 뜰 수 있으므로 단추를 누른 뒤에 부른다. */
  async start(): Promise<CameraInfo> {
    if (this.stream) this.stop();
    this.setStatus('starting');

    if (!navigator.mediaDevices?.getUserMedia) {
      this.setStatus('off');
      throw new Error(
        '이 브라우저는 카메라를 쓸 수 없습니다. 앱이나 최신 브라우저에서 열어 주세요.'
      );
    }

    let stream: MediaStream;
    try {
      /*
       * 후면 카메라, 1080p, 될 수 있는 한 높은 프레임. ideal 이라 안 되면 브라우저가
       * 가장 가까운 것으로 준다 — 폰 브라우저는 대개 30fps, 좋아야 60fps.
       */
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 240 },
        },
      });
    } catch (e) {
      this.setStatus('off');
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotAllowedError') {
        throw new Error(
          '카메라 사용을 허용해 주세요. 브라우저 주소창 옆 자물쇠에서 바꿀 수 있습니다.'
        );
      }
      if (name === 'NotFoundError') throw new Error('쓸 수 있는 카메라가 없습니다.');
      throw new Error('카메라를 켜지 못했습니다.');
    }

    this.stream = stream;
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play().catch(() => undefined);

    /* 크기가 잡힐 때까지 잠깐 기다린다 — play 직후에는 0 일 때가 있다 */
    for (let i = 0; i < 40 && !this.video.videoWidth; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.sourceWidth = this.video.videoWidth;
    this.sourceHeight = this.video.videoHeight;
    if (!this.sourceWidth) {
      this.stop();
      throw new Error('카메라 화면 크기를 읽지 못했습니다.');
    }

    const scale = Math.min(1, ANALYZE_WIDTH / this.sourceWidth);
    this.width = Math.round(this.sourceWidth * scale);
    this.height = Math.round(this.sourceHeight * scale);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!this.ctx) {
      this.stop();
      throw new Error('화면을 준비하지 못했습니다.');
    }

    const bw = Math.floor(this.width * CENTER_BOX_RATIO);
    const bh = Math.floor(this.height * CENTER_BOX_RATIO);
    this.center = {
      x0: Math.floor((this.width - bw) / 2),
      y0: Math.floor((this.height - bh) / 2),
      x1: Math.floor((this.width + bw) / 2),
      y1: Math.floor((this.height + bh) / 2),
    };

    this.ring = [];
    this.lastTimes = [];
    this.startFrameLoop();
    this.setStatus('ready');

    const track = stream.getVideoTracks()[0];
    return {
      width: this.sourceWidth,
      height: this.sourceHeight,
      label: track?.label ?? '',
    };
  }

  /** 던지기를 기다리기 시작한다 */
  arm() {
    if (!this.stream || this.status === 'off' || this.status === 'starting') return;
    this.resetArm();
    this.setStatus('settling');
  }

  /** 기다리기를 멈춘다(카메라는 켜 둔다) */
  disarm() {
    if (!this.stream) return;
    this.resetArm();
    this.setStatus('ready');
  }

  /** 카메라를 끈다 */
  stop() {
    this.cancelFrame?.();
    this.cancelFrame = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video.srcObject) this.video.srcObject = null;
    this.ring = [];
    this.resetArm();
    this.setStatus('off');
  }

  private resetArm() {
    this.quietRun = 0;
    this.background = null;
    this.quietSamples = [];
    this.triggerT = null;
    this.captured = [];
  }

  /*
   * 프레임이 올 때마다 부른다. requestVideoFrameCallback 은 카메라 프레임마다 정확히
   * 한 번, 그 프레임의 시각(mediaTime)과 함께 온다. 없는 브라우저(오래된 파이어폭스)는
   * 화면 그리기 주기(requestAnimationFrame)로 대신한다.
   */
  private startFrameLoop() {
    const v = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        cb: (now: number, meta: { mediaTime: number }) => void
      ) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };

    if (typeof v.requestVideoFrameCallback === 'function') {
      let id = 0;
      const tick = (_now: number, meta: { mediaTime: number }) => {
        this.onFrame(meta.mediaTime);
        id = v.requestVideoFrameCallback!(tick);
      };
      id = v.requestVideoFrameCallback(tick);
      this.cancelFrame = () => v.cancelVideoFrameCallback?.(id);
      return;
    }

    let raf = 0;
    const tick = () => {
      this.onFrame(performance.now() / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    this.cancelFrame = () => cancelAnimationFrame(raf);
  }

  private onFrame(t: number) {
    const ctx = this.ctx;
    if (!ctx || !this.stream) return;
    const last = this.ring[this.ring.length - 1];
    if (last && t <= last.t) return; // 같은 프레임이 다시 왔다

    ctx.drawImage(this.video, 0, 0, this.width, this.height);
    const px = ctx.getImageData(0, 0, this.width, this.height).data;
    const luma = new Uint8Array(this.width * this.height);
    for (let i = 0, j = 0; i < luma.length; i++, j += 4) {
      luma[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
    }
    const frame: RingFrame = { t, luma };
    this.ring.push(frame);
    if (this.ring.length > RING_SIZE) this.ring.shift();

    this.trackFps(t);

    switch (this.status) {
      case 'settling':
        this.settle(frame, last);
        break;
      case 'armed':
        this.watch(frame);
        break;
      case 'capturing':
        this.capture(frame);
        break;
      default:
        break;
    }
  }

  private trackFps(t: number) {
    this.lastTimes.push(t);
    if (this.lastTimes.length > 30) this.lastTimes.shift();
    if (this.lastTimes.length >= 10 && this.lastTimes.length % 10 === 0) {
      const span = t - this.lastTimes[0];
      if (span > 0) this.handlers.onFps?.((this.lastTimes.length - 1) / span);
    }
  }

  /** 가운데 상자 안에서 앞 프레임과의 평균 밝기 차 */
  private centerMeanDiff(a: Uint8Array, b: Uint8Array): number {
    const { x0, y0, x1, y1 } = this.center;
    let sum = 0;
    let n = 0;
    for (let y = y0; y < y1; y += 2) {
      const row = y * this.width;
      for (let x = x0; x < x1; x += 2) {
        sum += Math.abs(a[row + x] - b[row + x]);
        n++;
      }
    }
    return n ? sum / n : 0;
  }

  /** 가운데 상자 안에서 배경보다 밝아진 픽셀 수 */
  private centerMovedPx(luma: Uint8Array, background: Float32Array): number {
    const { x0, y0, x1, y1 } = this.center;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const row = y * this.width;
      for (let x = x0; x < x1; x++) {
        if (luma[row + x] - background[row + x] > MOVE_THRESHOLD) n++;
      }
    }
    return n;
  }

  /* 잠잠해지길 기다린다. 충분히 잠잠하면 배경을 만들고 '던지세요' */
  private settle(frame: RingFrame, prev: RingFrame | undefined) {
    if (!prev) return;
    if (this.centerMeanDiff(frame.luma, prev.luma) < QUIET_MEAN_DIFF) {
      this.quietRun++;
      this.quietSamples.push(frame.luma);
      if (this.quietSamples.length > 5) this.quietSamples.shift();
    } else {
      this.quietRun = 0;
      this.quietSamples = [];
    }
    if (this.quietRun >= QUIET_FRAMES && this.quietSamples.length >= 3) {
      this.background = buildBackground(this.quietSamples);
      this.setStatus('armed');
    }
  }

  /* 던졌는지 본다 */
  private watch(frame: RingFrame) {
    const background = this.background;
    if (!background) return;
    if (frame.t < this.cooldownUntil) return;

    const moved = this.centerMovedPx(frame.luma, background);
    const boxPx = (this.center.x1 - this.center.x0) * (this.center.y1 - this.center.y0);
    if (moved < TRIGGER_MIN_PX) return;
    if (moved > boxPx * TRIGGER_MAX_RATIO) {
      /* 화면이 통째로 바뀌었다 — 카메라가 움직였거나 사람이 지나갔다. 다시 잠잠해질 때까지 */
      this.resetArm();
      this.setStatus('settling');
      return;
    }

    this.triggerT = frame.t;
    /* 던지기 직전 프레임도 담는다 — 릴리스 순간이 표적에 닿기 한두 장 앞일 수 있다 */
    /*
     * 다가오는 공은 가운데가 밝아지기 한참 전부터 멀리서 작게 보인다 — 앞을 두 배 담아
     * 그 구간도 계산에 넣는다.
     */
    const pre = this.approach === 'approaching' ? PRE_SEC * 2 : PRE_SEC;
    this.captured = this.ring.filter((f) => f.t >= frame.t - pre);
    this.setStatus('capturing');
  }

  /* 던진 뒤 프레임을 모은다. 시간이나 장수가 차면 계산한다 */
  private capture(frame: RingFrame) {
    if (this.triggerT == null) return;
    this.captured.push(frame);
    const enough =
      frame.t - this.triggerT >= POST_SEC || this.captured.length >= MAX_ANALYZE_FRAMES;
    if (!enough) return;

    const frames = this.captured;
    const backgroundSamples = this.quietSamples;
    const background = this.background;
    this.captured = [];
    this.triggerT = null;
    this.setStatus('analyzing');

    /* 다음 그리기 뒤에 계산한다 — 그래야 '계산 중' 표시가 먼저 뜬다 */
    setTimeout(() => {
      try {
        let shakePx = 0;
        for (let i = 1; i < frames.length; i++) {
          shakePx = Math.max(
            shakePx,
            cornerShift(frames[i - 1].luma, frames[i].luma, this.width, this.height)
          );
        }
        const captured: CapturedFrame[] = frames.map((f) => ({ t: f.t, luma: f.luma }));
        const result = analyzeFrames({
          frames: captured,
          backgroundSamples,
          width: this.width,
          height: this.height,
          sourceWidth: this.sourceWidth,
          sourceHeight: this.sourceHeight,
          fovDeg: this.fovDeg,
          shakePx,
          approach: this.approach,
        });
        this.handlers.onResult(result);
      } catch (e) {
        this.handlers.onError(e instanceof Error ? e.message : '계산하지 못했습니다.');
      } finally {
        if (this.stream && this.status === 'analyzing') {
          /* 배경은 그대로 두고 곧장 다음 공을 기다린다 — 카메라는 안 움직였다 */
          this.background = background;
          this.cooldownUntil = (this.ring[this.ring.length - 1]?.t ?? 0) + COOLDOWN_SEC;
          this.setStatus(background ? 'armed' : 'settling');
        }
      }
    }, 0);
  }
}
