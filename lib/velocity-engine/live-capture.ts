'use client';

import { analyzeScale, type Approach } from './analyze-frames.ts';
import {
  analyzeJob,
  DEFAULT_METER_CONFIG,
  DISTANCE_METER_CONFIG,
  isCroppedAspect,
  LIVE_GOOD_FPS,
  liveFocalPx,
  LiveMeter,
  type CaptureJob,
  type LiveAnalyzeResult,
  type LiveCamera,
  type LivePipeline,
  type MeterEvent,
  type MeterStatus,
} from './live-meter.ts';
import { canvasLuma, rotateLuma } from './live-pixels.ts';
import { DEFAULT_CAM_MODE, type CamMode } from '../velocity-camera-mode.ts';
import type {
  AnalyzeWorkerOut,
  LiveSettings,
  MeterWorkerIn,
  MeterWorkerOut,
} from './live-worker-types.ts';

/**
 * 폰 카메라로 바로 구속을 잰다 — Smart Scout · PitchLab 처럼.
 *
 * 화면 한가운데 표적에 릴리스 포인트를 맞추고 던지면, 날아가는 공을 알아채 그 앞뒤 프레임을 모아 계산한다
 * (analyze-frames.ts). 영상 파일을 고르는 길과 계산은 같고, 프레임을 카메라에서 바로 받는 것만 다르다.
 *
 * 여기는 카메라 · 영상 클립 · 워커 잇기(DOM)만 맡는다. 언제 배경을 만들고 · 무엇을 던짐으로 보고 · 어디까지 담고 ·
 * 무엇을 배경으로 넘기는지는 live-meter.ts(DOM 없는 순수 계산 — 실제 영상으로 노드에서 되돌려 본다)가 정한다.
 *
 * ── 어떻게 도는가(모델 1.7.0) ──
 *
 * 1. 카메라를 켜고 화면(video)에 띄운다. 후면 · 60fps · 원래 비율(resizeMode 'none' — 잘라 주면 화각이 틀린다).
 * 2. 워커 둘을 띄운다. 측정 워커(live-meter.worker.ts)가 카메라 장면을 직접 받아(MediaStreamTrackProcessor — 크롬 · 사파리 18)
 *    밝기만 분석 크기로 줄여 판단(LiveMeter)을 돌리고, 담은 공은 계산 워커(live-analyze.worker.ts)가 계산한다. 화면 스레드는
 *    멈추지 않는다. 장면을 직접 못 받는 브라우저는 화면 스레드가 캔버스로 밝기를 만들어 측정 워커로 보내고('frames'), 워커를
 *    못 띄우면 예전처럼 모두 화면 스레드에서 한다('main').
 * 3. '측정 시작'을 누르면 판단이 배경을 준비하고(0.3초 남짓) 던지기를 기다린다. 가운데 근처에 나타나 멀어지며 작아지는 공을
 *    알아채면 공 앞 0.12초부터 0.9초를 담아 계산으로 넘기고 곧바로 다음 공을 기다린다(쉬는 시간 1.5초).
 * 4. 결과를 알린다(onResult). 결과에는 촬영 조건 알림(live.notes)이 붙는다.
 *
 * ── 촬영 조건(사용자 규칙, 2026-09-30) ──
 *
 * 어떤 조건에서도 카메라는 켜지고 잰 값은 보인다. 초당 30장 급 · 잘려 온 화면 · 짐작한 화각 · 줌 · HDR · 번진 공이면 값에
 * 알림을 붙이고 믿음 '낮음', ± 를 넓힌다(live-meter.ts '좋은 조건 밖'). 공을 못 찾은 것만 거부 까닭을 보인다. 영상 파일은
 * 30fps 이하를 그대로 막는다.
 *
 * 메모리: 720×1280 밝기 한 장이 0.9MB. 고리 80장 + 담는 장면(60fps 61장)이면 130MB 남짓(측정 워커 안).
 */

/**
 * 영상 클립 — 녹화기 둘이 번갈아 돈다. 조각 길이 3초, 1.5초마다 새 조각을 시작하므로 어느 순간
 * T 든 [T−0.4, T+1.1] 을 통째로 담은 조각이 하나는 있다(조각마다 파일 머리가 있어 그대로 재생된다
 * — 한 녹화기의 조각을 이어 붙이면 머리가 없어 못 튼다). 던진 뒤 그 조각이 끝나면 클립으로 내보낸다.
 */
const CLIP_SEG_SEC = 3;
const CLIP_STEP_SEC = 1.5;
const CLIP_PRE_SEC = 0.4;
const CLIP_POST_SEC = 1.1;
const CLIP_BITS_PER_SEC = 5_000_000;
const CLIP_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/** 워커가 인사할 때까지 기다리는 시간 — 개발 서버는 처음 띄울 때 워커를 묶느라 몇 초 걸린다 */
const WORKER_HELLO_MS = 10_000;
/**
 * 장면을 직접 받는 동안 판단이 이만큼 fps 를 알리지 않으면(처음부터 안 옴 · 도중에 멈춤 · 시각이 안 늘어 다 버려짐) 화면 스레드
 * 길('frames')로 바꾼다. fps 는 시각이 느는 장면 10장마다 온다(LiveMeter trackFps) — 첫 장면 하나로는 '받는 중'으로 보지 않는다.
 */
const STREAM_WATCHDOG_MS = 3_000;
const STREAM_CHECK_MS = 1_000;
/**
 * 배경 잡기('settling')가 이만큼 길어지면 안내한다 — 깜박이는 조명(±15% 로 1초에 7번 남짓)이면 장면마다 밝기가 뛰어 배경을
 * 영영 못 잡는다(2026-09-30 정확도 검증). 그 뒤로는 SETTLING_HINT_REPEAT_MS 마다 다시.
 */
const SETTLING_HINT_MS = 5_000;
const SETTLING_HINT_REPEAT_MS = 15_000;
/** 방향 맞추기 — 두 후보(90° · 270°)의 밝기 차가 이 비율보다 뚜렷이 갈려야 고른다. 아니면 화면 스레드 길로 */
const PROBE_CLEAR_RATIO = 0.8;

export type LiveStatus =
  /** 카메라 꺼짐 */
  | 'off'
  /** 카메라 켜는 중(권한 묻는 중) */
  | 'starting'
  /** 카메라 켜짐, 측정은 안 함 */
  | 'ready'
  /** 측정 중 — 배경을 준비한다(카메라를 가만히) */
  | 'settling'
  /** 측정 중 — 던지면 된다 */
  | 'armed'
  /** 던짐을 알아채 담는 중 */
  | 'capturing'
  /** 계산 중(그동안 던져도 잡는다) */
  | 'analyzing';

/** 초점 — 네트가 있으면 고정(manual), 없으면 자동(auto). 브라우저가 못 바꾸면 unsupported */
export type CameraFocus = 'manual' | 'auto' | 'unsupported';

export type { LivePipeline };

export type CameraInfo = {
  width: number;
  height: number;
  label: string;
  focus: CameraFocus;
  /** 줌 배율(브라우저가 알려줄 때). 1 이 아니면 초점거리에 곱하고 값에 알림을 붙인다 */
  zoom: number | null;
  /** 카메라가 약속한 초당 장면 수(getSettings) — 실제로 들어오는 수는 onFps */
  frameRate: number | null;
  /** 화면 비율이 카메라 고유 비율(16:9 · 4:3)이 아니다 — 잘려 왔다(값에 알림, 화각은 짐작) */
  cropped: boolean;
};

/**
 * 결과에 붙는 번호 — 나중에 오는 영상 클립(onClip)과 짝을 맞춘다. hitT 는 클립의 eventSec 에 해당하는 궤적 시각(CaptureJob.hitT,
 * 동시 촬영은 클립 시각 그대로) — 클립 시각 = eventSec + (궤적 시각 − hitT). 모르면 null.
 */
export type ResultMeta = { id: number; triggerT: number; hitT: number | null };

/** 공 하나의 영상 클립 — 던진 순간을 담은 3초 조각. eventSec = 클립 안에서 던진 시각 */
export type PitchClip = {
  blob: Blob;
  mime: string;
  durationSec: number;
  eventSec: number;
};

/** 진단 — 장면 받는 길 · 장면 형식(관리자 화면 · 시험대) */
export type LiveInfo = {
  pipeline: LivePipeline;
  /** 워커가 본 첫 장면 — 형식 · 크기 · 돌림 · 색 */
  frame: Extract<MeterWorkerOut, { type: 'frameinfo' }> | null;
  /** 장면을 직접 못 받은 까닭 */
  streamFailed: string | null;
  /** 측정 워커가 장면 하나에 쓴 시간(최근 120장) — 16.7ms 를 넘으면 60fps 를 못 따라간다 */
  stats: {
    frames: number;
    procAvgMs: number | null;
    procMaxMs: number;
    mode: 'stream' | 'frames';
  } | null;
  /** 장면이 돌림 정보 없이 와서(화면과 방향이 다름) 워커가 더 돌린 각 — 0 이면 그대로 */
  rotationFix: number;
  /** 계산이 밀려 버린 공 수(MAX_JOBS_IN_FLIGHT) */
  dropped: number;
};

/**
 * 초점을 건다 — 규칙: 네트 있음 = 수동초점, 네트 없음 = 자동초점(사용자가 정함).
 *
 * 네트 뒤에서 자동초점을 두면 카메라가 눈앞의 그물코에 초점을 맞춰 공이 흐려진다. 그래서 네트가
 * 있으면 초점을 고정한다 — 투수 뒤(공이 멀어짐)는 릴리스~네트 3m 근처, 포수 뒤(다가옴)는 마운드
 * 쪽 멀리. 브라우저(크롬 안드로이드 일부)만 focusMode 를 바꿀 수 있고, 아이폰 사파리는 못 바꾼다 —
 * 그때는 그대로 두고 'unsupported' 로 알린다(앱 껍데기가 네이티브 카메라로 같은 규칙을 건다).
 */
async function applyFocus(
  track: MediaStreamTrack | undefined,
  net: boolean,
  approach: Approach
): Promise<CameraFocus> {
  if (!track?.getCapabilities) return 'unsupported';
  const caps = track.getCapabilities() as MediaTrackCapabilities & {
    focusMode?: string[];
    focusDistance?: { min: number; max: number; step: number };
  };
  const modes = caps.focusMode ?? [];
  try {
    if (net) {
      if (!modes.includes('manual')) return 'unsupported';
      const range = caps.focusDistance;
      const wanted = approach === 'receding' ? 3 : (range?.max ?? 10);
      const focusDistance = range
        ? Math.min(range.max, Math.max(range.min, wanted))
        : wanted;
      await track.applyConstraints({
        advanced: [{ focusMode: 'manual', focusDistance }],
      } as unknown as MediaTrackConstraints);
      return 'manual';
    }
    if (modes.includes('continuous')) {
      await track.applyConstraints({
        advanced: [{ focusMode: 'continuous' }],
      } as unknown as MediaTrackConstraints);
      return 'auto';
    }
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

export type LiveCaptureHandlers = {
  onStatus: (status: LiveStatus) => void;
  /** 잰 결과(거부 포함). 촬영 조건 알림은 result.live.notes */
  onResult: (result: LiveAnalyzeResult, meta: ResultMeta) => void;
  /** 결과 뒤 1~3초 안에 그 공의 영상 클립(클립 저장을 켰을 때만). id 는 onResult 의 것 */
  onClip?: (id: number, clip: PitchClip) => void;
  onError: (message: string) => void;
  /** 멈추지 않는 짧은 알림(계산이 밀려 공을 건너뜀 등) — 없으면 알리지 않는다 */
  onNotice?: (message: string) => void;
  /** 실제로 들어오는 초당 프레임 수 — 화면에 보여 준다. low = 좋은 조건(50fps) 밑 */
  onFps?: (fps: number, low: boolean) => void;
  /** 장면 받는 길이 정해지거나 바뀌었다(진단) */
  onInfo?: (info: LiveInfo) => void;
};

/**
 * 가운데 표적 상자 — 화면 가로 · 세로의 이 비율만큼 한가운데(화면이 표적을 그릴 때 쓴다). 던짐을 알아채는 규칙 ·
 * 문턱값은 live-meter.ts 에 있다(DOM 없이 실제 영상으로 시험하려고 뗐다).
 */
export const CENTER_BOX_RATIO = DEFAULT_METER_CONFIG.centerBoxRatio;

type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, meta: { mediaTime: number }) => void
  ) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

type MSTPClass = new (o: { track: MediaStreamTrack }) => {
  readable: ReadableStream<VideoFrame>;
};

export class LiveCapture {
  private stream: MediaStream | null = null;
  /** 장면을 캔버스로 읽을 때(워커가 장면을 직접 못 받을 때 · 렌즈 보정의 한 장) */
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  /** 분석 크기 · 원본 크기(화면 스레드가 본 것 — 워커는 장면에서 따로 안다) */
  private width = 0;
  private height = 0;
  private sourceWidth = 0;
  private sourceHeight = 0;
  private cropped = false;
  private zoom: number | null = null;
  private status: LiveStatus = 'off';
  private cancelFrame: (() => void) | null = null;
  private pipeline: LivePipeline = 'main';
  private info: LiveInfo = {
    pipeline: 'main',
    frame: null,
    streamFailed: null,
    stats: null,
    rotationFix: 0,
    dropped: 0,
  };
  /* 워커 길 */
  private meterWorker: Worker | null = null;
  private analyzeWorker: Worker | null = null;
  private streamClone: MediaStreamTrack | null = null;
  /** 복제 트랙을 워커로 넘겼나(사파리) — 넘긴 트랙은 여기서 못 끈다(워커가 'stop-stream' 에 끈다) */
  private streamTransferred = false;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private gotFrames = false;
  /** 판단이 마지막으로 fps 를 알린 때(performance.now) — 멈춤 감시 */
  private lastFpsAt = 0;
  /** 방향 맞추기를 물었나(한 번만) */
  private probed = false;
  /* 화면 스레드 길('main') — 판단도 여기서 */
  private meter: LiveMeter | null = null;
  /** 판단의 상태 — 계산 중인 공 수와 합쳐 화면 상태를 낸다(publish) */
  private meterStatus: MeterStatus = 'idle';
  private pending = 0;
  /** 기다리는 중인가(워커를 다시 띄워도 이어 가게) */
  private armed = false;
  /** 던짐을 알아챈 벽시계 시각(초) — 영상 클립과 짝을 맞출 때 */
  private triggerWall = 0;
  /** 담은 일감 번호 → 결과 번호 */
  private metaOf = new Map<number, ResultMeta>();

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly handlers: LiveCaptureHandlers,
    private fovDeg: number,
    /** 공이 멀어지나(투수 뒤) 다가오나(포수 뒤) — 다가오면 앞을 더 길게 담는다 */
    private approach: Approach = 'receding',
    /** 앞에 네트가 있나 — 있으면 초점을 고정한다(applyFocus) */
    private net: boolean = true
  ) {}

  setNet(net: boolean) {
    this.net = net;
  }

  /** 켜진 카메라의 영상 흐름 — 엔진 개발용 녹화(lib/velocity-recorder.ts)가 같은 흐름을 찍는다. 꺼져 있으면 null */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /** 수동 모드 — 공 하나를 재면 다시 기다리지 않고 '준비됨'으로 돌아간다(단추를 눌러야 다음 공) */
  private manual = false;
  setManual(v: boolean) {
    this.manual = v;
    this.sendSettings({ manual: v });
  }

  /** 결과 번호 — onResult 와 onClip 을 잇는다 */
  private resultSeq = 0;

  /* ── 영상 클립 ── */
  private clipsOn = false;
  private recorders: {
    rec: MediaRecorder;
    startedAt: number | null;
    chunks: Blob[];
  }[] = [];
  private clipTimer: ReturnType<typeof setInterval> | null = null;
  private clipMime = '';
  private pendingClips: { id: number; wallT: number }[] = [];

  /** 공마다 영상 클립을 남길까(정확도 보정용 저장 · 세션 목록 재생) */
  setClips(on: boolean) {
    if (this.clipsOn === on) return;
    this.clipsOn = on;
    if (this.stream) {
      if (on) this.startClipLoop();
      else this.stopClipLoop();
    }
  }

  private pickClipMime(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    for (const m of CLIP_MIME_CANDIDATES) {
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch {
        /* 다음 후보 */
      }
    }
    return '';
  }

  private startClipLoop() {
    if (!this.stream || this.clipTimer) return;
    this.clipMime = this.pickClipMime();
    if (!this.clipMime) {
      this.handlers.onError(
        '이 브라우저는 영상 클립 저장을 지원하지 않아요. 측정은 그대로 돼요.'
      );
      this.clipsOn = false;
      return;
    }
    this.startSegment();
    this.clipTimer = setInterval(() => this.startSegment(), CLIP_STEP_SEC * 1000);
  }

  private stopClipLoop() {
    if (this.clipTimer) clearInterval(this.clipTimer);
    this.clipTimer = null;
    for (const r of this.recorders) {
      try {
        if (r.rec.state !== 'inactive') r.rec.stop();
      } catch {
        /* 이미 멈춤 */
      }
    }
    this.recorders = [];
    this.pendingClips = [];
  }

  private startSegment() {
    if (!this.stream) return;
    /* 조각 길이가 찬 녹화기는 멈춘다(멈추면 onstop 에서 클립을 내보낸다) */
    const now = performance.now() / 1000;
    for (const r of this.recorders) {
      if (
        r.startedAt != null &&
        now - r.startedAt >= CLIP_SEG_SEC - 0.05 &&
        r.rec.state === 'recording'
      ) {
        try {
          r.rec.stop();
        } catch {
          /* 무시 */
        }
      }
    }
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(this.stream, {
        mimeType: this.clipMime,
        videoBitsPerSecond: CLIP_BITS_PER_SEC,
      });
    } catch {
      return;
    }
    const entry = { rec, startedAt: null as number | null, chunks: [] as Blob[] };
    rec.onstart = () => {
      entry.startedAt = performance.now() / 1000;
    };
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) entry.chunks.push(e.data);
    };
    rec.onstop = () => {
      const stoppedAt = performance.now() / 1000;
      this.recorders = this.recorders.filter((r) => r !== entry);
      if (entry.startedAt == null || !entry.chunks.length) return;
      const startedAt = entry.startedAt;
      const durationSec = stoppedAt - startedAt;
      /* 이 조각이 통째로 담은 던짐만 내보낸다 */
      const done: number[] = [];
      for (const pc of this.pendingClips) {
        if (
          pc.wallT - CLIP_PRE_SEC >= startedAt &&
          pc.wallT + CLIP_POST_SEC <= stoppedAt
        ) {
          const blob = new Blob(entry.chunks, { type: this.clipMime.split(';')[0] });
          this.handlers.onClip?.(pc.id, {
            blob,
            mime: blob.type,
            durationSec,
            eventSec: pc.wallT - startedAt,
          });
          done.push(pc.id);
        }
      }
      /* 담을 조각이 지나가 버린 것(멈춤 · 끊김)은 버린다 */
      this.pendingClips = this.pendingClips.filter(
        (pc) => !done.includes(pc.id) && stoppedAt - pc.wallT < CLIP_SEG_SEC * 2
      );
    };
    try {
      rec.start();
      this.recorders.push(entry);
    } catch {
      /* 녹화기를 못 켜면 클립 없이 간다 */
    }
  }

  /**
   * 초점을 다시 잡는다 — 자동초점을 한 번 돌린 뒤 규칙(네트 있음 = 수동)대로 다시 건다.
   * 브라우저가 초점을 못 만지는 기기(아이폰 사파리)는 'unsupported'.
   */
  async refocus(): Promise<CameraFocus> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track?.getCapabilities) return 'unsupported';
    const caps = track.getCapabilities() as MediaTrackCapabilities & {
      focusMode?: string[];
    };
    if (!caps.focusMode?.length) return 'unsupported';
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      if (caps.focusMode.includes('single-shot')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'single-shot' } as MediaTrackConstraintSet],
        });
        await sleep(800);
      } else if (caps.focusMode.includes('continuous')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        });
        await sleep(1200);
      }
    } catch {
      /* 못 바꾸면 그대로 */
    }
    return applyFocus(track, this.net, this.approach);
  }

  /** 공으로 보정한 초점거리(긴 변 픽셀당). 없으면 화각 가정(lib/velocity-lens.ts) */
  private focalPerLongSide: number | null = null;
  setFocalPerLongSide(v: number | null) {
    this.focalPerLongSide = v;
    this.sendSettings({ focalPerLongSide: v });
  }

  /** 포수 뒤: 카메라에서 릴리스 지점까지(m) — 릴리스 구속을 되돌릴 때. 투수 뒤에서는 null */
  private releaseDistanceM: number | null = null;
  setReleaseDistance(v: number | null) {
    this.releaseDistanceM = v;
    this.sendSettings({ releaseDistanceM: v });
  }

  /**
   * 엔진 2.0 의 거리 자(m) · 카메라 숙임(라디안) — 거리를 넣으면 거리로 잰다(analyze-distance.ts). 켜기 전에 넣으면 카메라에 줌
   * 2배를 청한다(엔진 2.0 을 맞춘 영상이 2배 — 먼 공이 1배의 두 배 크기라 끝까지 잇는다).
   */
  private distanceM: number | null = null;
  /** 거리를 공 크기로 어림한다 — distanceM 은 첫 어림(analyze-distance autoDistance) */
  private distanceAuto = false;
  private tiltRad: number | null = null;
  setDistance(
    distanceM: number | null,
    tiltRad: number | null = this.tiltRad,
    distanceAuto: boolean = this.distanceAuto
  ) {
    const modeChanged = !!distanceM !== !!this.distanceM;
    this.distanceM = distanceM && distanceM > 0 ? distanceM : null;
    this.distanceAuto = distanceAuto;
    this.tiltRad = tiltRad;
    this.sendSettings({
      distanceM: this.distanceM,
      distanceAuto,
      tiltRad: this.tiltRad,
    });
    if (modeChanged) this.meter?.setDistanceMode(!!this.distanceM);
  }
  /** 숙임만 — 폰 기울기 센서가 바뀔 때마다(1° 단위) */
  setTilt(tiltRad: number | null) {
    if (tiltRad === this.tiltRad) return;
    this.tiltRad = tiltRad;
    this.sendSettings({ tiltRad });
  }

  /**
   * 지금 화면 한 장(분석 해상도 밝기) — 렌즈 보정이 공 크기를 잴 때. 부를 때마다 화면(video)을 캔버스에 그려 읽는다
   * (장면은 워커에 있어 화면 스레드는 쥐고 있지 않다). 새 버퍼라 같은 장면인지는 부르는 쪽이 지문으로 본다.
   */
  snapshot(): {
    luma: Uint8Array;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
  } | null {
    if (!this.stream || !this.ensureCanvas()) return null;
    const ctx = this.ctx!;
    ctx.drawImage(this.video, 0, 0, this.width, this.height);
    const luma = canvasLuma(
      ctx.getImageData(0, 0, this.width, this.height).data,
      this.width * this.height
    );
    return {
      luma,
      width: this.width,
      height: this.height,
      sourceWidth: this.sourceWidth,
      sourceHeight: this.sourceHeight,
    };
  }

  setFov(fovDeg: number) {
    this.fovDeg = fovDeg;
    this.sendSettings({ fovDeg });
  }

  setApproach(approach: Approach) {
    this.approach = approach;
    this.sendSettings({ approach });
  }

  getStatus() {
    return this.status;
  }

  /** 진단 — 장면을 어떻게 받고 있나 */
  getInfo(): LiveInfo {
    return this.info;
  }

  private settlingTimer: ReturnType<typeof setTimeout> | null = null;

  private setStatus(next: LiveStatus) {
    if (this.status === next) return;
    this.status = next;
    if (this.settlingTimer) clearTimeout(this.settlingTimer);
    this.settlingTimer =
      next === 'settling'
        ? setTimeout(() => this.settlingHint(), SETTLING_HINT_MS)
        : null;
    this.handlers.onStatus(next);
  }

  private settlingHint() {
    if (this.status !== 'settling') return;
    this.handlers.onNotice?.(
      '배경을 잡지 못하고 있어요. 폰을 고정하고, 깜박이는 조명이 있으면 피해 주세요.'
    );
    this.settlingTimer = setTimeout(() => this.settlingHint(), SETTLING_HINT_REPEAT_MS);
  }

  /** 판단 상태 + 계산 중인 공 → 화면 상태 */
  private publish() {
    if (!this.stream) return;
    const s = this.meterStatus;
    if (s === 'capturing') this.setStatus('capturing');
    else if (this.pending > 0 || s === 'analyzing') this.setStatus('analyzing');
    else this.setStatus(s === 'idle' ? 'ready' : s);
  }

  private settings(): LiveSettings {
    return {
      fovDeg: this.fovDeg,
      focalPerLongSide: this.focalPerLongSide,
      approach: this.approach,
      releaseDistanceM: this.releaseDistanceM,
      zoom: this.zoom,
      manual: this.manual,
      distanceM: this.distanceM,
      distanceAuto: this.distanceAuto,
      tiltRad: this.tiltRad,
    };
  }

  private sendSettings(patch: Partial<LiveSettings>) {
    const msg: MeterWorkerIn = { type: 'settings', settings: patch };
    this.meterWorker?.postMessage(msg);
    if (this.meter) {
      this.meter.approach = this.approach;
      this.meter.setFocalPx(this.meterFocalPx());
    }
  }

  /** 화면 스레드 길의 카메라 · 렌즈 설정(워커 길은 워커가 장면 크기로 같은 것을 만든다) */
  private camera(): LiveCamera {
    const long = Math.max(this.sourceWidth, this.sourceHeight);
    return {
      width: this.width,
      height: this.height,
      sourceWidth: this.sourceWidth,
      sourceHeight: this.sourceHeight,
      fovDeg: this.fovDeg,
      focalPx: this.focalPerLongSide ? this.focalPerLongSide * long : undefined,
      approach: this.approach,
      releaseDistanceM: this.releaseDistanceM,
      cropped: this.cropped,
      zoom: this.zoom,
      hdr: false,
      distanceM: this.distanceM,
      distanceAuto: this.distanceAuto,
      tiltRad: this.tiltRad,
    };
  }

  /** 판단(공 찾기)이 공 크기를 거리로 바꿀 초점거리 — 분석 픽셀 기준 */
  private meterFocalPx(): number {
    if (!this.sourceWidth) return 0;
    return liveFocalPx(this.camera()) * (this.width / this.sourceWidth);
  }

  private ensureCanvas(): boolean {
    if (
      this.ctx &&
      this.canvas &&
      this.canvas.width === this.width &&
      this.canvas.height === this.height
    )
      return true;
    if (!this.width || typeof document === 'undefined') return false;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    return this.ctx != null;
  }

  /** 화면(video) 크기를 읽는다 — play 직후에는 0 일 때가 있어 잠깐 기다린다 */
  private async readVideoSize(): Promise<boolean> {
    for (let i = 0; i < 40 && !this.video.videoWidth; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.sourceWidth = this.video.videoWidth;
    this.sourceHeight = this.video.videoHeight;
    if (!this.sourceWidth) return false;
    const scale = analyzeScale(this.sourceWidth, this.sourceHeight);
    this.width = Math.round(this.sourceWidth * scale);
    this.height = Math.round(this.sourceHeight * scale);
    this.cropped = isCroppedAspect(this.sourceWidth, this.sourceHeight);
    return true;
  }

  /**
   * 켜기 차례 — stop() 이 올린다. 켜는 사이(권한 창 · 워커 띄우기)에 껐으면 켜기를 그만두고 받은 카메라를 끈다. 예전에는
   * 끈 뒤에도 켜기가 이어져, 화면을 떠난 뒤에도 카메라가 켜진 채 남고(불이 켜짐) 화면은 그 카메라를 몰랐다 — 개발 서버의
   * StrictMode(효과를 두 번 돈다)에서 카메라는 보이는데 '측정 시작'이 안 먹던 것이 이것이다(2026-09-30).
   */
  private startGen = 0;

  /** 카메라를 켠다. 권한 창이 뜰 수 있으므로 단추를 누른 뒤에 부른다. 켜는 사이에 stop() 하면 AbortError(DOMException) */
  async start(): Promise<CameraInfo> {
    if (this.stream) this.stop();
    const gen = ++this.startGen;
    /* 켜는 사이에 껐나 — 그랬으면 받은 카메라를 끄고 그만둔다 */
    const checkAborted = (got?: MediaStream) => {
      if (gen === this.startGen) return;
      got?.getTracks().forEach((t) => t.stop());
      throw new DOMException('카메라 켜기를 그만뒀어요.', 'AbortError');
    };
    this.setStatus('starting');

    if (!navigator.mediaDevices?.getUserMedia) {
      this.setStatus('off');
      throw new Error(
        '이 브라우저는 카메라를 쓸 수 없습니다. 앱이나 최신 브라우저에서 열어 주세요.'
      );
    }

    /*
     * 후면 카메라, 1080p(DEFAULT_CAM_MODE), 60fps, 원래 비율. ideal 이라 안 되면 브라우저가 가장 가까운 것으로 준다 — 폰 브라우저는 대개
     * 30fps, 좋아야 60fps(getUserMedia 는 240fps 를 못 준다 — 1.6.0 은 240 을 청했다).
     * resizeMode 'none': 크롬은 청한 가로 · 세로에 맞추려 가운데를 잘라 줄 수 있다 — 세로 카메라에 1920×1080 을 청하자
     * 1080×1080 이 와서 화각이 어긋나 96km/h 공이 52.5km/h 로 나왔다(2026-09-30 브라우저 시험대). 'none' 이면 카메라 고유
     * 크기(1080×1920) 그대로 준다. 모르는 브라우저는 이 제약을 무시한다.
     */
    /* 늘 1080p · 60fps — 고르기는 없앴다(2026-10-08 사용자: "1080 · 60 으로 고정해 통일") */
    const mode = DEFAULT_CAM_MODE;
    const longSide = Math.round((mode.short * 16) / 9);
    const wanted = {
      facingMode: { ideal: 'environment' },
      width: { ideal: longSide },
      height: { ideal: mode.short },
      frameRate: { ideal: mode.fps },
      resizeMode: 'none',
    } as MediaTrackConstraints;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: wanted,
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotAllowedError') {
        this.setStatus('off');
        throw new Error(
          '카메라 사용을 허용해 주세요. 브라우저 주소창 옆 자물쇠에서 바꿀 수 있습니다.'
        );
      }
      if (name === 'NotFoundError') {
        this.setStatus('off');
        throw new Error('쓸 수 있는 카메라가 없습니다.');
      }
      /* 제약이 안 맞았으면(오래된 브라우저) 후면 카메라만 청해 다시 — 어떤 조건에서도 카메라는 켜져야 한다 */
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch {
        this.setStatus('off');
        throw new Error('카메라를 켜지 못했습니다.');
      }
    }

    checkAborted(stream);
    this.stream = stream;
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play().catch(() => undefined);
    checkAborted();

    if (!(await this.readVideoSize())) {
      checkAborted();
      this.stop();
      throw new Error('카메라 화면 크기를 읽지 못했습니다.');
    }
    checkAborted();

    const track = stream.getVideoTracks()[0];
    /*
     * 카메라가 끊기면(전화 · 다른 앱이 카메라를 가져감 · 아이폰의 카메라 중단) 알리고 끈다 — 예전에는 화면이 '던지세요'인 채
     * 멈춘 그림만 남았다. 우리가 부르는 stop() 은 'ended' 를 내지 않는다.
     */
    track?.addEventListener('ended', () => {
      if (this.stream !== stream) return;
      this.stop();
      this.handlers.onError('카메라가 꺼졌어요. 다시 켜 주세요.');
    });
    /*
     * 그래도 잘려 왔으면 가로 · 세로 없이 한 번 더 청한다(원래 크기를 달라고). 그래도 잘려 있으면 막지 않고 값에 알림을
     * 붙인다 — 화각은 잘리기 전 크기를 짐작해 고친다(live-meter.ts liveFocalPx).
     */
    if (this.cropped && track?.applyConstraints) {
      const before = `${this.video.videoWidth}x${this.video.videoHeight}`;
      /*
       * 가로 · 세로를 아예 빼면 브라우저 기본(640×480 남짓)으로 떨어질 수 있다 — 화면 방향대로 긴 변 1920 을 지켜 청한다
       * (정사각으로 잘려 왔으면 폰 화면 방향으로 짐작한다).
       */
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      const portrait =
        vh > vw ||
        (vh === vw &&
          typeof window !== 'undefined' &&
          window.matchMedia?.('(orientation: portrait)').matches === true);
      try {
        await track.applyConstraints({
          facingMode: { ideal: 'environment' },
          width: { ideal: portrait ? mode.short : longSide },
          height: { ideal: portrait ? longSide : mode.short },
          frameRate: { ideal: mode.fps },
          resizeMode: 'none',
        } as MediaTrackConstraints);
        for (
          let i = 0;
          i < 20 && `${this.video.videoWidth}x${this.video.videoHeight}` === before;
          i++
        ) {
          await new Promise((r) => setTimeout(r, 50));
        }
      } catch {
        /* 못 바꾸면 그대로 */
      }
      await this.readVideoSize();
    }

    checkAborted();
    await this.rescueFrameRate(track, mode, longSide);
    checkAborted();
    const focus = await applyFocus(track, this.net, this.approach);
    /*
     * 줌은 1 로 건다 — 디지털 줌 · 초광각(0.5x) · 망원은 초점거리를 배율만큼 바꿔 구속이 그 역수로 밀린다(1.2x 면
     * −22km/h). 범위의 최솟값이 아니라 '1' 을 범위 안에 끼워 건다(픽셀 · 삼성의 가상 카메라는 0.5 부터 시작해 min 을 걸면
     * 초광각이 된다). 걸고도 1 이 아니면 막지 않고 초점거리에 배율을 곱하고 알림을 붙인다(사용자 규칙, 2026-09-30).
     */
    let zoom: number | null = null;
    try {
      const caps = track?.getCapabilities?.() as
        (MediaTrackCapabilities & { zoom?: { min: number; max: number } }) | undefined;
      if (caps?.zoom) {
        /* 거리 측정(엔진 2.0)은 2배 — 먼 공이 커서 그물 · 미트까지 잇는다. 줌을 모르는 브라우저(아이폰 웹뷰)는 1배 그대로 */
        const want = this.distanceM && this.approach === 'receding' ? 2 : 1;
        const z1 = Math.min(caps.zoom.max, Math.max(caps.zoom.min, want));
        await track
          .applyConstraints({ advanced: [{ zoom: z1 } as MediaTrackConstraintSet] })
          .catch(() => undefined);
        const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
        zoom = typeof settings.zoom === 'number' ? settings.zoom : z1;
      }
    } catch {
      zoom = null;
    }
    this.zoom = zoom;
    checkAborted();

    await this.startPipeline(track, gen);
    checkAborted();
    this.publish();
    if (this.clipsOn) this.startClipLoop();
    const s = track?.getSettings?.() as
      (MediaTrackSettings & { frameRate?: number }) | undefined;
    return {
      width: this.sourceWidth,
      height: this.sourceHeight,
      label: track?.label ?? '',
      focus,
      zoom,
      frameRate:
        typeof s?.frameRate === 'number' ? Math.round(s.frameRate * 10) / 10 : null,
      cropped: this.cropped,
    };
  }

  /**
   * 고른 fps 를 못 받았으면 그 fps 를 '최소'로 걸어 한 번 더 청한다. ideal 만 걸면 브라우저가 화질을 맞추느라 fps 를 버릴 수
   * 있다 — 실제로 1080p 60 을 고르면 1080p 30 으로 켜졌다(2026-10-04 사용자). min 을 걸면 그 fps 를 내는 모양으로 바꾸거나,
   * 못 내면 거절한다(거절이면 트랙은 그대로 — 명세). 가로 · 세로 두 방향으로 해 본다(폰 브라우저마다 세로 화면의 가로 · 세로를
   * 다르게 읽는다).
   *
   * 1080p · 60fps 를 둘 다 못 내면 fps 가 먼저다 — 1080p 30 보다 720p 60 이 잰다(엔진은 어차피 짧은 변 720 으로 줄여 잰다).
   */
  private async rescueFrameRate(
    track: MediaStreamTrack | undefined,
    mode: CamMode,
    longSide: number
  ) {
    if (!track?.applyConstraints || !track.getSettings) return;
    const fpsNow = () => (track.getSettings() as MediaTrackSettings).frameRate ?? null;
    const sizeNow = () => `${this.video.videoWidth}x${this.video.videoHeight}`;
    const before = fpsNow();
    if (before == null || before >= mode.fps - 2) return;
    /* 화면 크기나 fps 가 바뀔 때까지(최대 1초) — 같은 화질의 60fps 모양으로 바뀌면 크기는 그대로라 fps 로 안다 */
    const settle = async (size: string, fps: number | null) => {
      for (let i = 0; i < 20; i++) {
        if (sizeNow() !== size || fpsNow() !== fps) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      await this.readVideoSize();
    };
    /*
     * 1080p 에서 60fps 를 못 내면 720p 로도 — 아이폰 앱의 웹 카메라(웹킷)는 1080p 를 청하면 30fps 로 켜고, 같은 크기로는 60fps 를
     * 못 냈다(2026-10-08). 720p 60 · 2배 줌은 그날 실시간으로 잘 잰 조건이다(70.5 · 101.6, 실제 68 · 101).
     */
    for (const [w, h] of [
      [longSide, mode.short],
      [mode.short, longSide],
      [1280, 720],
      [720, 1280],
    ]) {
      const size = sizeNow();
      const fps = fpsNow();
      try {
        await track.applyConstraints({
          facingMode: { ideal: 'environment' },
          width: { ideal: w },
          height: { ideal: h },
          frameRate: { min: mode.fps - 1, ideal: mode.fps },
          resizeMode: 'none',
        } as MediaTrackConstraints);
      } catch {
        continue;
      }
      await settle(size, fps);
      const got = fpsNow();
      const fpsOk = got != null && got >= mode.fps - 2;
      if (fpsOk) return;
    }
  }

  /* ── 장면 받는 길 ── */

  private setInfo(patch: Partial<LiveInfo>) {
    this.info = { ...this.info, ...patch };
    this.handlers.onInfo?.(this.info);
  }

  private async startPipeline(track: MediaStreamTrack | undefined, gen: number) {
    const booted = await this.bootWorkers();
    /* 띄우는 사이에 껐다(다시 켜기 포함) — 여기서 판단 · 장면 고리를 만들면 새 켜기의 것과 겹쳐 돈다 */
    if (gen !== this.startGen) return;
    if (booted) {
      if (track && this.startStream(track)) {
        this.pipeline = 'worker-stream';
      } else {
        this.pipeline = 'worker-frames';
        this.startFrameLoop();
      }
    } else {
      this.pipeline = 'main';
      this.meter = new LiveMeter(this.width, this.height, this.approach, {
        focalPx: this.meterFocalPx(),
        ...(this.distanceM ? DISTANCE_METER_CONFIG : {}),
      });
      this.startFrameLoop();
    }
    this.setInfo({ pipeline: this.pipeline });
    if (this.armed) this.arm();
  }

  /** 워커 둘을 띄운다. 못 띄우면(오래된 브라우저 · 묶기 실패) false — 화면 스레드에서 한다 */
  private async bootWorkers(): Promise<boolean> {
    if (typeof Worker === 'undefined' || typeof MessageChannel === 'undefined')
      return false;
    let meterW: Worker | null = null;
    let analyzeW: Worker | null = null;
    try {
      /* Next.js(Turbopack · webpack)는 이 모양(new URL + import.meta.url)을 보고 워커를 따로 묶는다 */
      meterW = new Worker(new URL('./live-meter.worker.ts', import.meta.url), {
        type: 'module',
      });
      analyzeW = new Worker(new URL('./live-analyze.worker.ts', import.meta.url), {
        type: 'module',
      });
      const hello = (w: Worker) =>
        new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), WORKER_HELLO_MS);
          const onMsg = (e: MessageEvent) => {
            if (e.data?.type !== 'hello') return;
            clearTimeout(timer);
            w.removeEventListener('message', onMsg);
            resolve(true);
          };
          w.addEventListener('message', onMsg);
          w.addEventListener('error', () => {
            clearTimeout(timer);
            resolve(false);
          });
        });
      const okA = hello(analyzeW);
      const okM = hello(meterW);
      const ch = new MessageChannel();
      analyzeW.postMessage({ type: 'port', port: ch.port2 }, [ch.port2]);
      const init: MeterWorkerIn = {
        type: 'init',
        settings: this.settings(),
        port: ch.port1,
      };
      meterW.postMessage(init, [ch.port1]);
      const booting = this.startGen;
      if (!(await okA) || !(await okM) || !this.stream || booting !== this.startGen)
        throw new Error('워커가 답하지 않음');
    } catch {
      meterW?.terminate();
      analyzeW?.terminate();
      return false;
    }
    this.meterWorker = meterW;
    this.analyzeWorker = analyzeW;
    meterW.onmessage = (e: MessageEvent<MeterWorkerOut>) => this.onMeterMessage(e.data);
    analyzeW.onmessage = (e: MessageEvent<AnalyzeWorkerOut>) =>
      this.onAnalyzeMessage(e.data);
    const crashed = () => {
      if (!this.stream) return;
      this.handlers.onError('측정 도구가 멈췄어요. 카메라를 다시 켜 주세요.');
    };
    meterW.onerror = crashed;
    analyzeW.onerror = crashed;
    /* 띄우는 사이에 바뀐 설정(렌즈 보정 · 수동 등)은 워커가 없어 못 갔다 — 지금 설정을 통째로 한 번 더 */
    meterW.postMessage({
      type: 'settings',
      settings: this.settings(),
    } satisfies MeterWorkerIn);
    return true;
  }

  /**
   * 워커가 카메라 장면을 직접 받게 한다 — 크롬은 화면 스레드에 MediaStreamTrackProcessor 가 있어 읽기 흐름을 넘기고, 사파리
   * 18 은 워커에만 있어 트랙을 넘긴다. 화면용 트랙은 그대로 두고 복제본을 쓴다(영상 클립 · 화면이 같은 트랙을 쓴다).
   */
  private startStream(track: MediaStreamTrack): boolean {
    const worker = this.meterWorker;
    if (!worker || typeof track.clone !== 'function') return false;
    const MSTP = (globalThis as unknown as { MediaStreamTrackProcessor?: MSTPClass })
      .MediaStreamTrackProcessor;
    const clone = track.clone();
    try {
      if (MSTP) {
        const readable = new MSTP({ track: clone }).readable;
        const msg: MeterWorkerIn = { type: 'stream', readable };
        worker.postMessage(msg, [readable as unknown as Transferable]);
      } else {
        const msg: MeterWorkerIn = { type: 'track', track: clone };
        worker.postMessage(msg, [clone as unknown as Transferable]);
      }
    } catch {
      clone.stop();
      return false;
    }
    this.streamClone = clone;
    this.streamTransferred = !MSTP;
    this.gotFrames = false;
    this.probed = false;
    this.lastFpsAt = performance.now();
    this.watchdog = setInterval(() => this.checkStream(), STREAM_CHECK_MS);
    return true;
  }

  /** 멈춤 감시 — 판단이 3초 넘게 fps 를 알리지 않으면 화면 스레드 길로. 화면이 뒤로 가 있으면(장면이 멈춤) 세지 않는다 */
  private checkStream() {
    if (this.pipeline !== 'worker-stream' || !this.stream) return;
    const now = performance.now();
    if (typeof document !== 'undefined' && document.hidden) {
      this.lastFpsAt = now;
      return;
    }
    if (now - this.lastFpsAt > STREAM_WATCHDOG_MS)
      this.fallbackToFrames(this.gotFrames ? '장면이 멈춤' : '장면이 오지 않음');
  }

  /**
   * 워커가 본 장면의 방향이 화면(video)과 다르면(가로 ↔ 세로) — 장면이 돌림 정보(VideoFrame.rotation) 없이 온 것이다. 그대로
   * 두면 구속은 맞아도 코스 짐작(zoneOfPoint)이 틀린다. 워커에 돌린 뒤의 장면 하나를 받아(probe) 화면 한 장과 견줘 90° ·
   * 270° 중 맞는 쪽을 고른다.
   */
  private checkOrientation(sw: number, sh: number) {
    if (this.pipeline !== 'worker-stream' || this.probed) return;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh || sw === sh || vw === vh) return;
    if (sw > sh === vw > vh) return;
    this.probed = true;
    this.meterWorker?.postMessage({ type: 'probe' } satisfies MeterWorkerIn);
  }

  private onProbe(m: Extract<MeterWorkerOut, { type: 'probe' }>) {
    if (this.pipeline !== 'worker-stream') return;
    const snap = this.snapshot();
    if (!snap || snap.width !== m.height || snap.height !== m.width) {
      this.fallbackToFrames('장면 방향을 맞추지 못함');
      return;
    }
    const diff = (deg: 90 | 270) => {
      const r = rotateLuma(m.luma, m.width, m.height, deg).luma;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < r.length; i += 7) {
        sum += Math.abs(r[i] - snap.luma[i]);
        n++;
      }
      return n ? sum / n : Infinity;
    };
    const d90 = diff(90);
    const d270 = diff(270);
    if (Math.min(d90, d270) > PROBE_CLEAR_RATIO * Math.max(d90, d270)) {
      this.fallbackToFrames('장면 방향을 맞추지 못함');
      return;
    }
    /* 워커는 장면의 돌림(rotation)에 이 각을 더한다 — probe 는 지금 더한 각까지 돌린 장면이라 그 위에 고른 각을 얹는다 */
    const deg = (this.info.rotationFix + (d90 <= d270 ? 90 : 270)) % 360;
    this.meterWorker?.postMessage({ type: 'rotate', deg } satisfies MeterWorkerIn);
    this.setInfo({ rotationFix: deg });
  }

  /** 장면을 직접 못 받으면 화면 스레드가 캔버스로 밝기를 만들어 보낸다 */
  private fallbackToFrames(reason: string) {
    if (this.pipeline !== 'worker-stream' || !this.stream) return;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    /* 워커가 읽기를 멈추고 늦게 오는 장면을 버리게 — 넘긴 트랙(사파리)은 워커가 끈다 */
    this.meterWorker?.postMessage({ type: 'stop-stream' } satisfies MeterWorkerIn);
    if (!this.streamTransferred) {
      try {
        this.streamClone?.stop();
      } catch {
        /* 이미 꺼짐 */
      }
    }
    this.streamClone = null;
    this.pipeline = 'worker-frames';
    this.setInfo({ pipeline: 'worker-frames', streamFailed: reason, rotationFix: 0 });
    this.startFrameLoop();
  }

  private onMeterMessage(m: MeterWorkerOut) {
    switch (m.type) {
      case 'status':
        if (m.status === 'capturing') this.triggerWall = performance.now() / 1000;
        this.meterStatus = m.status;
        this.publish();
        break;
      case 'fps':
        this.gotFrames = true;
        this.lastFpsAt = performance.now();
        this.handlers.onFps?.(m.fps, m.fps < LIVE_GOOD_FPS);
        break;
      case 'captured':
        this.pending++;
        this.metaFor(m.id, m.triggerT, m.hitT);
        this.publish();
        break;
      case 'dropped':
        this.setInfo({ dropped: this.info.dropped + 1 });
        this.handlers.onNotice?.(
          '계산이 밀려 방금 공은 건너뛰었어요. 조금 쉬었다 던져 주세요.'
        );
        break;
      case 'frameinfo':
        this.setInfo({ frame: m });
        break;
      case 'dims':
        this.checkOrientation(m.sourceWidth, m.sourceHeight);
        break;
      case 'probe':
        this.onProbe(m);
        break;
      case 'stream-failed':
        this.fallbackToFrames(m.reason);
        break;
      case 'stats':
        this.setInfo({
          stats: {
            frames: m.frames,
            procAvgMs: m.procAvgMs,
            procMaxMs: m.procMaxMs,
            mode: m.mode,
          },
        });
        break;
      default:
        break;
    }
  }

  /** 담은 일감에 결과 번호를 매긴다 — 클립은 알아챈 벽시계 시각으로 짝을 맞춘다 */
  private metaFor(jobId: number, triggerT: number, hitT: number): ResultMeta {
    const meta: ResultMeta = { id: ++this.resultSeq, triggerT, hitT };
    this.metaOf.set(jobId, meta);
    if (this.clipsOn) this.pendingClips.push({ id: meta.id, wallT: this.triggerWall });
    return meta;
  }

  private onAnalyzeMessage(m: AnalyzeWorkerOut) {
    if (m.type === 'hello') return;
    const meta = this.metaOf.get(m.id) ?? {
      id: ++this.resultSeq,
      triggerT: m.triggerT,
      hitT: null,
    };
    this.metaOf.delete(m.id);
    this.pending = Math.max(0, this.pending - 1);
    this.publish();
    if (m.type === 'result') this.handlers.onResult(this.withInfo(m.result), meta);
    /* 계산 워커의 오류 글(자바스크립트 말)은 보이지 않는다 */
    else this.handlers.onError('계산하지 못했습니다.');
  }

  /** 결과에 장면 받는 길 · 장면 형식을 붙인다(분석 JSON 에 남아 실제 폰에서 어떻게 도는지 되짚는다) */
  private withInfo(result: LiveAnalyzeResult): LiveAnalyzeResult {
    const f = this.info.frame;
    return {
      ...result,
      live: {
        ...result.live,
        pipeline: this.pipeline,
        frame: f
          ? {
              format: f.format,
              rotation: f.rotation,
              visible: [f.visible[2], f.visible[3]],
              rotationFix: this.info.rotationFix,
            }
          : null,
      },
    };
  }

  /** 던지기를 기다리기 시작한다. 장면 받는 길이 아직 없으면(켜는 중) 기억해 두었다가 길이 서면 건다 */
  arm() {
    this.armed = true;
    if (!this.stream) return;
    this.meterWorker?.postMessage({ type: 'arm' } satisfies MeterWorkerIn);
    if (this.meter) this.apply(this.meter.arm());
  }

  /** 기다리기를 멈춘다(카메라는 켜 둔다) */
  disarm() {
    this.armed = false;
    if (!this.stream) return;
    this.meterWorker?.postMessage({ type: 'disarm' } satisfies MeterWorkerIn);
    if (this.meter) this.apply(this.meter.disarm());
  }

  /** 카메라를 끈다 */
  stop() {
    this.startGen++;
    this.cancelFrame?.();
    this.cancelFrame = null;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.stopClipLoop();
    this.meterWorker?.postMessage({ type: 'stop' } satisfies MeterWorkerIn);
    this.meterWorker?.terminate();
    this.analyzeWorker?.terminate();
    this.meterWorker = null;
    this.analyzeWorker = null;
    if (!this.streamTransferred) this.streamClone?.stop();
    this.streamClone = null;
    this.streamTransferred = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    /* 화면(video)은 새 LiveCapture 와 같이 쓴다 — 옛 것의 stop() 이 새 카메라 화면을 비우지 않게, 제 것일 때만 비운다 */
    if (this.stream && this.video.srcObject === this.stream)
      this.video.srcObject = null;
    this.stream = null;
    this.meter?.clear();
    this.meter = null;
    this.meterStatus = 'idle';
    this.pending = 0;
    this.armed = false;
    this.metaOf.clear();
    this.setStatus('off');
  }

  /* ── 화면 스레드 길('main') — 워커를 못 띄웠을 때 ── */

  /* 판단의 사건을 화면 · 계산으로 옮긴다 */
  private apply(events: MeterEvent[]) {
    for (const e of events) {
      if (e.kind === 'status') {
        if (e.status === 'capturing') this.triggerWall = performance.now() / 1000;
        this.meterStatus = e.status;
        this.publish();
      } else if (e.kind === 'fps') this.handlers.onFps?.(e.fps, e.fps < LIVE_GOOD_FPS);
      else this.runJob(e.job);
    }
  }

  /*
   * 프레임이 올 때마다 부른다. requestVideoFrameCallback 은 카메라 프레임마다 정확히
   * 한 번, 그 프레임의 시각(mediaTime)과 함께 온다. 없는 브라우저(오래된 파이어폭스)는
   * 화면 그리기 주기(requestAnimationFrame)로 대신한다.
   */
  private startFrameLoop() {
    this.cancelFrame?.();
    /* 카메라를 다시 켜면 mediaTime 이 0 부터 다시 센다 — 옛 시각을 두면 새 장면을 모두 '같은 장면'으로 버린다 */
    this.lastFrameT = -Infinity;
    const v = this.video as VideoWithFrames;
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

  private lastFrameT = -Infinity;

  private onFrame(t: number) {
    if (!this.stream || t <= this.lastFrameT) return; // 같은 프레임이 다시 왔다
    /* 화면 크기가 바뀌었으면(회전 · 제약 변경) 다시 잰다 */
    if (
      this.video.videoWidth !== this.sourceWidth ||
      this.video.videoHeight !== this.sourceHeight
    ) {
      if (!this.video.videoWidth) return;
      this.sourceWidth = this.video.videoWidth;
      this.sourceHeight = this.video.videoHeight;
      const scale = analyzeScale(this.sourceWidth, this.sourceHeight);
      this.width = Math.round(this.sourceWidth * scale);
      this.height = Math.round(this.sourceHeight * scale);
      this.cropped = isCroppedAspect(this.sourceWidth, this.sourceHeight);
      if (this.meter) {
        this.meter = new LiveMeter(this.width, this.height, this.approach, {
          focalPx: this.meterFocalPx(),
          ...(this.distanceM ? DISTANCE_METER_CONFIG : {}),
        });
        if (this.armed) this.apply(this.meter.arm());
      }
    }
    if (!this.ensureCanvas()) return;
    this.lastFrameT = t;
    const ctx = this.ctx!;
    ctx.drawImage(this.video, 0, 0, this.width, this.height);
    const luma = canvasLuma(
      ctx.getImageData(0, 0, this.width, this.height).data,
      this.width * this.height
    );
    if (this.meterWorker) {
      const msg: MeterWorkerIn = {
        type: 'frame',
        t,
        buf: luma.buffer as ArrayBuffer,
        width: this.width,
        height: this.height,
        sourceWidth: this.sourceWidth,
        sourceHeight: this.sourceHeight,
      };
      this.meterWorker.postMessage(msg, [luma.buffer as ArrayBuffer]);
    } else if (this.meter) {
      this.apply(this.meter.push({ t, luma }));
    }
  }

  /* 담은 것을 계산한다(화면 스레드 길). 결과를 알리고 다음 공을 기다린다(판단의 finish) */
  private runJob(job: CaptureJob) {
    const meta = this.metaFor(job.id, job.triggerT, job.hitT);
    this.metaOf.delete(job.id);
    const meter = this.meter;
    const camera = this.camera();
    this.pending++;
    /* 다음 그리기 뒤에 계산한다 — 그래야 '계산 중' 표시가 먼저 뜬다 */
    setTimeout(() => {
      try {
        this.handlers.onResult(this.withInfo(analyzeJob(job, camera)), meta);
      } catch {
        this.handlers.onError('계산하지 못했습니다.');
      } finally {
        this.pending = Math.max(0, this.pending - 1);
        /* 카메라를 껐거나 다시 켰으면(판단이 바뀜) 옛 판단을 건드리지 않는다 */
        if (this.stream && meter && this.meter === meter)
          this.apply(meter.finish(this.manual));
        this.publish();
      }
    }, 0);
  }
}
