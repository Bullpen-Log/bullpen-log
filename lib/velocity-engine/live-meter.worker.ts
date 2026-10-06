/**
 * 실시간 측정 워커 ① — 카메라 장면을 받아 판단(live-meter.ts LiveMeter)을 돌린다. 화면 스레드와 따로 돌아 계산 · 그리기가
 * 장면을 빠뜨리지 않는다. live-capture.ts 가 만든다.
 *
 * 장면을 받는 길 둘:
 *  - 'stream' — 카메라 장면(VideoFrame)을 직접(MediaStreamTrackProcessor). 크롬은 화면 스레드에서 만든 읽기 흐름(readable)을,
 *    사파리 18 은 트랙을 넘겨 여기서 만든다. 밝기 판(Y)만 복사해 분석 크기로 줄인다(live-pixels.ts) — 캔버스에 그려 GPU 에서
 *    되읽지 않아 한 장에 몇 ms.
 *  - 'frames' — 위가 안 되면 화면 스레드가 캔버스로 만든 밝기(분석 크기)를 보낸다(예전 길).
 *
 * 던짐을 알아채 담으면(capture) 그 일감을 계산 워커(live-analyze.worker.ts)로 곧장 보내고, 곧바로 다음 공을 기다린다(finish) —
 * 되돌려 보기(노드)와 같은 순서라 쉬는 시간(1.5초)이 담기가 끝난 때부터 센다. 계산이 끝나기를 기다리지 않는다.
 */
import { analyzeScale } from './analyze-frames.ts';
import {
  DISTANCE_METER_CONFIG,
  isCroppedAspect,
  liveFocalPx,
  LiveMeter,
  packJob,
  type LiveCamera,
  type MeterEvent,
} from './live-meter.ts';
import {
  downscaleLuma,
  makeScaleTables,
  rgbaToLuma,
  rotateLuma,
  type ScaleTables,
} from './live-pixels.ts';
import {
  MAX_JOBS_IN_FLIGHT,
  type AnalyzeWorkerDone,
  type AnalyzeWorkerIn,
  type LiveSettings,
  type MeterWorkerIn,
  type MeterWorkerOut,
} from './live-worker-types.ts';

/* 워커 전역 — 저장소 tsconfig 는 dom 만 싣는다(webworker 를 같이 실으면 이름이 겹친다) */
const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
};
const post = (m: MeterWorkerOut) => scope.postMessage(m);

let settings: LiveSettings | null = null;
let analysisPort: MessagePort | null = null;
let meter: LiveMeter | null = null;
/** 판단을 다시 만들 때 기다리던 중이었나(크기가 바뀌면 다시 arm) */
let wantArmed = false;
/** 원본(돌린 뒤) · 분석 크기 */
let dims: { sw: number; sh: number; w: number; h: number; rot: number } | null = null;
let tables: ScaleTables | null = null;
let hdr = false;
let reading = false;
/**
 * 카메라 장면 직접 받기를 그만뒀나(화면 스레드 길로 바꿈) — 그 뒤로 늦게 오는 장면은 버린다. 안 그러면 두 길의 장면이 번갈아
 * 들어와 판단이 장면마다 처음부터 다시 시작한다(push 의 source). 사파리는 트랙을 이 워커로 넘겨 받으므로 화면 스레드가 끌 수
 * 없다 — 여기서 끈다(streamTrack).
 */
let streamOff = false;
let streamTrack: MediaStreamTrack | null = null;
let streamReader: ReadableStreamDefaultReader<VideoFrame> | null = null;
/** 장면을 더 돌릴 각(도) — 장면이 돌림 정보 없이 와서 화면과 방향이 다를 때 화면 스레드가 정한다('rotate') */
let rotFix = 0;
/** 다음 장면을 'probe' 로 보낼까 */
let wantProbe = false;
/** 계산 워커에 보내고 아직 안 끝난 공 */
let inFlight = 0;
let srcBuf: Uint8Array | null = null;
/** 장면 하나를 처리하는 데 든 시간(ms) — STATS_EVERY 장마다 화면 스레드로(실제 폰에서 어디가 느린지 보려고) */
const STATS_EVERY = 120;
let frames = 0;
let win = { n: 0, sum: 0, max: 0 };
let infoSent = false;
/** 지금 장면이 어디서 오나 — 바뀌면 시각의 기준이 달라 판단을 비우고 다시 시작한다 */
let source: 'stream' | 'frames' | null = null;

function camera(): LiveCamera | null {
  if (!settings || !dims) return null;
  const long = Math.max(dims.sw, dims.sh);
  return {
    width: dims.w,
    height: dims.h,
    sourceWidth: dims.sw,
    sourceHeight: dims.sh,
    fovDeg: settings.fovDeg,
    focalPx: settings.focalPerLongSide ? settings.focalPerLongSide * long : undefined,
    approach: settings.approach,
    releaseDistanceM: settings.releaseDistanceM,
    cropped: isCroppedAspect(dims.sw, dims.sh),
    zoom: settings.zoom,
    hdr,
    distanceM: settings.distanceM ?? null,
    tiltRad: settings.tiltRad ?? null,
  };
}

/** 판단이 공 크기를 거리로 바꿀 초점거리(분석 픽셀) */
function meterFocal(): number {
  const cam = camera();
  if (!cam) return 0;
  return liveFocalPx(cam) * (cam.width / cam.sourceWidth);
}

/** 장면 크기가 정해지거나 바뀌면 판단을 새로 만든다 */
function setDims(sw: number, sh: number, rot: number) {
  if (dims && dims.sw === sw && dims.sh === sh && dims.rot === rot) return;
  const s = analyzeScale(sw, sh);
  dims = { sw, sh, w: Math.round(sw * s), h: Math.round(sh * s), rot };
  tables = null;
  meter = new LiveMeter(dims.w, dims.h, settings?.approach ?? 'receding', {
    focalPx: meterFocal(),
    ...(settings?.distanceM ? DISTANCE_METER_CONFIG : {}),
  });
  if (wantArmed) apply(meter.arm());
  post({
    type: 'dims',
    sourceWidth: sw,
    sourceHeight: sh,
    width: dims.w,
    height: dims.h,
  });
}

function apply(events: MeterEvent[]) {
  for (const e of events) {
    if (e.kind === 'status') post({ type: 'status', status: e.status });
    else if (e.kind === 'fps') post({ type: 'fps', fps: e.fps });
    else {
      const cam = camera();
      const job = e.job;
      if (inFlight >= MAX_JOBS_IN_FLIGHT) {
        /* 계산이 밀렸다 — 쌓아 두면 공 하나에 50~86MB 라 느린 폰의 메모리가 모자란다. 이 공은 버린다 */
        post({ type: 'dropped', id: job.id, triggerT: job.triggerT });
      } else if (cam && analysisPort) {
        /*
         * 담은 장면은 판단의 고리 · 배경 기록과 같은 버퍼라 그대로 넘기면(transfer) 그쪽이 비어 다음 공을 망친다. 그래서 버퍼
         * 하나에 한 번 복사해 모으고(packJob) 그 버퍼를 넘긴다 — 예전(structured clone)은 보낼 때 · 받을 때 두 번 복사해
         * 이 워커가 0.2초 남짓 멈췄다. 모을 수 없으면(장면 크기가 다름) 예전처럼 복사해 보낸다.
         */
        const postedAt = performance.now();
        const packed = packJob(job);
        if (packed) {
          const msg: AnalyzeWorkerIn = {
            type: 'packed',
            job: packed,
            camera: cam,
            postedAt,
          };
          analysisPort.postMessage(msg, [packed.buffer]);
        } else {
          const msg: AnalyzeWorkerIn = { type: 'job', job, camera: cam, postedAt };
          analysisPort.postMessage(msg);
        }
        inFlight++;
        post({
          type: 'captured',
          id: job.id,
          triggerT: job.triggerT,
          frames: job.frames.length,
        });
      }
      /* 계산을 기다리지 않고 다음 공을 기다린다(수동이면 멈춘다) */
      if (meter) apply(meter.finish(settings?.manual ?? false));
    }
  }
}

function push(t: number, luma: Uint8Array, from: 'stream' | 'frames') {
  if (!meter) return;
  /* 직접 받기를 그만둔 뒤에 늦게 온 장면 — 화면 스레드 길과 번갈아 들어가지 않게 버린다 */
  if (from === 'stream' && streamOff) return;
  if (source !== from) {
    /* 장면 시각(VideoFrame.timestamp ↔ mediaTime)의 기준이 달라 옛 장면 뒤로 이으면 새 장면이 모두 버려진다 */
    if (source !== null) {
      apply(meter.clear());
      if (wantArmed) apply(meter.arm());
    }
    source = from;
  }
  apply(meter.push({ t, luma }));
}

/** 장면 하나의 처리 시간을 센다 */
function account(ms: number) {
  frames++;
  win.n++;
  win.sum += ms;
  if (ms > win.max) win.max = ms;
  if (win.n >= STATS_EVERY) {
    post({
      type: 'stats',
      frames,
      procAvgMs: Math.round((win.sum / win.n) * 100) / 100,
      procMaxMs: Math.round(win.max * 100) / 100,
      mode: source ?? 'frames',
    });
    win = { n: 0, sum: 0, max: 0 };
  }
}

/* ── 'stream' — 카메라 장면(VideoFrame)을 직접 ── */

const YUV = new Set(['I420', 'I420A', 'I422', 'I444', 'NV12', 'NV12A']);
const RGB = new Set(['RGBA', 'RGBX', 'BGRA', 'BGRX']);

async function onVideoFrame(vf: VideoFrame): Promise<boolean> {
  const fmt = vf.format ?? '';
  const vr = vf.visibleRect;
  if (!vr || !(YUV.has(fmt) || RGB.has(fmt))) {
    post({ type: 'stream-failed', reason: `장면 형식 ${fmt || '알 수 없음'}` });
    return false;
  }
  const frameRot =
    ((((vf as unknown as { rotation?: number }).rotation ?? 0) % 360) + 360) % 360;
  const rot = (frameRot + rotFix) % 360;
  const W = vr.width;
  const H = vr.height;
  const turned = rot === 90 || rot === 270;
  setDims(turned ? H : W, turned ? W : H, rot);
  const d = dims!;
  const cs = vf.colorSpace;
  /* 타입 정의가 아는 값(bt709 · srgb …)에 pq · hlg 가 없는 판이 있어 문자열로 견준다 */
  const transfer = String(cs?.transfer ?? '');
  hdr = transfer === 'pq' || transfer === 'hlg';
  if (!infoSent) {
    infoSent = true;
    post({
      type: 'frameinfo',
      format: fmt,
      coded: [vf.codedWidth, vf.codedHeight],
      visible: [vr.x, vr.y, vr.width, vr.height],
      rotation: frameRot,
      colorSpace: cs
        ? {
            primaries: cs.primaries ?? null,
            transfer: cs.transfer ?? null,
            matrix: cs.matrix ?? null,
            fullRange: cs.fullRange ?? null,
          }
        : null,
    });
  }
  const size = vf.allocationSize();
  if (!srcBuf || srcBuf.length < size) srcBuf = new Uint8Array(size);
  const layout = await vf.copyTo(srcBuf);
  const tw = turned ? d.h : d.w;
  const th = turned ? d.w : d.h;
  if (
    !tables ||
    tables.W !== W ||
    tables.H !== H ||
    tables.w !== tw ||
    tables.h !== th
  ) {
    tables = makeScaleTables(W, H, tw, th);
  }
  let small: Uint8Array;
  if (YUV.has(fmt)) {
    /* 제한 범위(16~235)로 본다 — 모르면(null) 크롬 가짜 카메라 · 영상과 같게 제한 범위(브라우저 시험대에서 맞음) */
    small = downscaleLuma(
      srcBuf,
      layout[0].offset,
      layout[0].stride,
      tables,
      cs?.fullRange !== true
    );
  } else {
    const full = rgbaToLuma(
      srcBuf,
      layout[0].offset,
      layout[0].stride,
      W,
      H,
      fmt.startsWith('BGR')
    );
    small = downscaleLuma(full, 0, W, tables, false);
  }
  const luma = rot ? rotateLuma(small, tw, th, rot).luma : small;
  if (wantProbe) {
    wantProbe = false;
    post({ type: 'probe', luma: luma.slice(), width: d.w, height: d.h, rotation: rot });
  }
  push(vf.timestamp / 1e6, luma, 'stream');
  return true;
}

/** 카메라 장면 직접 받기를 그만둔다 — 읽기를 멈추고, 넘겨 받은 트랙(사파리)은 여기서 끈다 */
function stopStream() {
  streamOff = true;
  reading = false;
  try {
    streamTrack?.stop();
  } catch {
    /* 이미 꺼짐 */
  }
  streamTrack = null;
  streamReader?.cancel().catch(() => undefined);
}

async function readStream(readable: ReadableStream<VideoFrame>) {
  if (streamOff) {
    readable.cancel().catch(() => undefined);
    return;
  }
  const reader = readable.getReader();
  streamReader = reader;
  reading = true;
  try {
    while (reading && !streamOff) {
      const { value: vf, done } = await reader.read();
      if (done || !vf) break;
      if (streamOff) {
        vf.close();
        break;
      }
      let ok = true;
      try {
        const p0 = performance.now();
        ok = await onVideoFrame(vf);
        account(performance.now() - p0);
      } catch (e) {
        ok = false;
        post({
          type: 'stream-failed',
          reason: e instanceof Error ? e.message : String(e),
        });
      } finally {
        vf.close();
      }
      if (!ok) break;
    }
  } finally {
    reading = false;
    try {
      await reader.cancel();
    } catch {
      /* 이미 닫힘 */
    }
  }
}

scope.onmessage = (e: MessageEvent<MeterWorkerIn>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      settings = m.settings;
      analysisPort = m.port;
      analysisPort.onmessage = (ev: MessageEvent<AnalyzeWorkerDone>) => {
        if (ev.data?.type === 'done') inFlight = Math.max(0, inFlight - 1);
      };
      post({ type: 'hello' });
      break;
    case 'settings': {
      settings = { ...(settings as LiveSettings), ...m.settings };
      if (meter) {
        meter.approach = settings.approach;
        meter.setFocalPx(meterFocal());
        meter.setDistanceMode(!!settings.distanceM);
      }
      break;
    }
    case 'stream':
      void readStream(m.readable);
      break;
    case 'track': {
      /* 사파리 18 — MediaStreamTrackProcessor 는 워커에만 있다 */
      const MSTP = (
        self as unknown as {
          MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => {
            readable: ReadableStream<VideoFrame>;
          };
        }
      ).MediaStreamTrackProcessor;
      if (!MSTP) {
        m.track.stop();
        post({ type: 'stream-failed', reason: 'MediaStreamTrackProcessor 없음' });
        break;
      }
      streamTrack = m.track;
      if (streamOff) {
        stopStream();
        break;
      }
      try {
        void readStream(new MSTP({ track: m.track }).readable);
      } catch (err) {
        m.track.stop();
        post({
          type: 'stream-failed',
          reason: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }
    case 'frame':
      /* 'frames' — 화면 스레드가 캔버스로 만든 밝기(분석 크기, 돌린 뒤) */
      setDims(m.sourceWidth, m.sourceHeight, 0);
      if (dims && m.width === dims.w && m.height === dims.h) {
        const p0 = performance.now();
        push(m.t, new Uint8Array(m.buf), 'frames');
        account(performance.now() - p0);
      }
      break;
    case 'stop-stream':
      stopStream();
      break;
    case 'probe':
      wantProbe = true;
      break;
    case 'rotate':
      rotFix = (((Math.round(m.deg / 90) * 90) % 360) + 360) % 360;
      break;
    case 'arm':
      wantArmed = true;
      if (meter) apply(meter.arm());
      break;
    case 'disarm':
      wantArmed = false;
      if (meter) apply(meter.disarm());
      break;
    case 'stop':
      stopStream();
      wantArmed = false;
      if (meter) apply(meter.clear());
      break;
  }
};

export {};
