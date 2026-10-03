'use client';

import { unstable_rethrow } from 'next/navigation';
import {
  attachRecordingPart,
  createRecordingPartUpload,
  finishVelocityRecording,
  startVelocityRecording,
} from '@/app/actions/velocity-recording';

/**
 * 엔진 개발용 녹화 — 측정 없이 카메라 영상을 계속 찍어 구속 측정 관리자로 올린다(관리자, 2026-10-03 사용자: "밖에서 하나도 안
 * 쟀다 — 왜 안 됐는지 알게 측정이 안 돼도 영상을 찍게").
 *
 * 저장소는 파일 하나에 50MB 까지다. 그래서 MediaRecorder 를 조각마다 새로 켜 30초(비트레이트가 높으면 더 짧게) 조각으로 끊고,
 * 다음 조각을 3초 먼저 켜서 겹친다 — 공 하나(2초 남짓)가 조각 사이에 걸려도 어느 한 조각에는 다 들어간다. 조각은 끝나는 대로
 * 올린다(메모리에 쌓이지 않게). 올리기는 한 번에 하나씩, 실패하면 두 번 더.
 * 녹화기는 측정 화면의 클립 녹화(live-capture.ts)처럼 start() 로 켜 멈출 때 한 번에 받는다 — 아이폰에서 조각마다(timeslice)
 * 받는 길은 확인하지 못했다. 그래서 크기는 조각이 끝난 뒤에 알고, 실제 초당 크기를 보고 다음 조각 길이를 줄인다.
 */

const SEGMENT_SEC = 30;
const OVERLAP_SEC = 3;
/** 조각 하나의 목표 크기 — 50MB 한도에 여유(비트레이트가 약속보다 높게 나와도) */
const TARGET_BYTES = 36 * 1024 * 1024;
/** 조각 길이의 아래 끝 — 겹침보다 넉넉히 */
const MIN_SEGMENT_SEC = 10;
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];
const OFFLINE = '신호가 약해 조각을 올리지 못했어요.';

export type RecorderState = {
  /** 찍는 중 · 올리는 중(멈춘 뒤 남은 조각) · 끝 */
  phase: 'idle' | 'starting' | 'recording' | 'stopping' | 'done' | 'error';
  /** 찍은 시간(초) */
  elapsedSec: number;
  /** 끝난 조각 수 · 올린 조각 수 · 실패한 조각 수 */
  parts: number;
  uploaded: number;
  failed: number;
  /** 올리는 중인 조각의 % */
  progress: number | null;
  error: string | null;
};

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* 다음 후보 */
    }
  }
  return '';
}

/** 화질 · fps 에 맞춘 비트레이트 — 1080p60 ≈ 10Mbps(공 가장자리가 뭉개지지 않게), 4 ~ 25Mbps */
export function recordingBitrate(width: number, height: number, fps: number): number {
  const px = Math.max(1, width) * Math.max(1, height) * Math.max(1, fps);
  return Math.round(Math.min(25e6, Math.max(4e6, px * 0.08)));
}

/** 서명 주소로 조각을 PUT 한다(투구 영상 · 클립 올리기와 같은 길) */
function putBlob(url: string, blob: Blob, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', blob.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error('조각을 올리지 못했어요.'));
    xhr.onerror = () => reject(new Error(OFFLINE));
    xhr.send(blob);
  });
}

/** 녹화기가 부르는 서버 · 저장소 — 시험에서는 가짜를 넘긴다 */
export type RecorderApi = {
  start: typeof startVelocityRecording;
  createUpload: typeof createRecordingPartUpload;
  attach: typeof attachRecordingPart;
  finish: typeof finishVelocityRecording;
  put: typeof putBlob;
};

const SERVER_API: RecorderApi = {
  start: startVelocityRecording,
  createUpload: createRecordingPartUpload,
  attach: attachRecordingPart,
  finish: finishVelocityRecording,
  put: putBlob,
};

type Segment = {
  index: number;
  rec: MediaRecorder;
  chunks: Blob[];
  /** 녹화 시작에서(초) */
  offsetSec: number;
  startedAt: number;
  /** 끄라고 했다 */
  ended: boolean;
  /** 조각을 내보냈다(두 번 내보내지 않게) */
  done: boolean;
};

export class SegmentedRecorder {
  private recordingId: string | null = null;
  private mime = '';
  private bitrate = 0;
  private t0 = 0;
  /** 이번 조각 길이(초) — 비트레이트로 정하고, 실제 크기를 보고 줄인다 */
  private segSec = SEGMENT_SEC;
  private segs: Segment[] = [];
  private nextIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private uploads: Promise<void> = Promise.resolve();
  private pendingStops = 0;
  private allStopped: (() => void) | null = null;
  state: RecorderState = {
    phase: 'idle',
    elapsedSec: 0,
    parts: 0,
    uploaded: 0,
    failed: 0,
    progress: null,
    error: null,
  };

  constructor(
    private stream: MediaStream,
    private onChange: (s: RecorderState) => void,
    /** 서버와 저장소 — 시험할 때만 갈아 끼운다 */
    private api: RecorderApi = SERVER_API
  ) {}

  private set(patch: Partial<RecorderState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  /** 녹화를 시작한다 — meta 는 카메라 · 설정(관리자 화면에서 다시 잴 때 쓴다) */
  async start(input: { date: string; meta: Record<string, unknown>; bitrate: number }) {
    if (this.state.phase !== 'idle') return;
    this.mime = pickMime();
    if (!this.mime) {
      this.set({ phase: 'error', error: '이 브라우저는 영상 녹화를 지원하지 않아요.' });
      return;
    }
    this.bitrate = input.bitrate;
    this.segSec = this.lengthFor(this.bitrate / 8);
    this.set({ phase: 'starting', error: null });
    let res: Awaited<ReturnType<typeof startVelocityRecording>>;
    try {
      res = await this.api.start({
        date: input.date,
        meta: { ...input.meta, mime: this.mime, bitrate: this.bitrate },
      });
    } catch (err) {
      unstable_rethrow(err);
      this.set({ phase: 'error', error: '신호가 약해 녹화를 시작하지 못했어요.' });
      return;
    }
    if (!res.ok) {
      this.set({ phase: 'error', error: res.error });
      return;
    }
    this.recordingId = res.id;
    this.t0 = performance.now();
    this.startSegment();
    this.set({ phase: 'recording' });
    this.timer = setInterval(() => this.tick(), 250);
  }

  /** 초당 바이트로 조각 길이 — 목표 크기 안, 10~30초 */
  private lengthFor(bytesPerSec: number) {
    if (!(bytesPerSec > 0)) return SEGMENT_SEC;
    return Math.max(MIN_SEGMENT_SEC, Math.min(SEGMENT_SEC, TARGET_BYTES / bytesPerSec));
  }

  private startSegment() {
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(this.stream, {
        mimeType: this.mime,
        videoBitsPerSecond: this.bitrate,
      });
    } catch {
      this.set({ error: '녹화기를 켜지 못했어요.' });
      return;
    }
    const seg: Segment = {
      index: this.nextIndex++,
      rec,
      chunks: [],
      offsetSec: (performance.now() - this.t0) / 1000,
      startedAt: performance.now(),
      ended: false,
      done: false,
    };
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) seg.chunks.push(e.data);
    };
    rec.onstop = () => this.finishSegment(seg);
    rec.onerror = () => this.set({ error: '녹화 중 오류가 났어요.' });
    this.pendingStops++;
    rec.start();
    this.segs.push(seg);
  }

  /** 1/4초마다 — 경과 시간, 다음 조각 켜기(겹침), 지난 조각 끄기 */
  private tick() {
    const now = performance.now();
    const elapsed = (now - this.t0) / 1000;
    /* 화면은 초가 바뀔 때만 다시 그린다(측정 화면이 커서 1/4초마다 그리면 무겁다) */
    if (Math.floor(elapsed) !== Math.floor(this.state.elapsedSec))
      this.set({ elapsedSec: elapsed });
    else this.state = { ...this.state, elapsedSec: elapsed };
    if (this.stopping) return;
    const live = this.segs.filter((s) => !s.ended);
    const newest = live[live.length - 1];
    if (!newest) return;
    const age = (now - newest.startedAt) / 1000;
    /* 다음 조각을 겹쳐 켤 때 — 조각 길이에서 겹침만큼 전 */
    if (live.length === 1 && age >= this.segSec - OVERLAP_SEC) this.startSegment();
    /* 앞 조각을 끌 때 — 다음 조각이 겹침만큼 찍었으면 */
    if (live.length >= 2) {
      const overlap = (now - live[1].startedAt) / 1000;
      if (overlap >= OVERLAP_SEC) this.endSegment(live[0]);
    }
  }

  private endSegment(seg: Segment) {
    if (seg.ended) return;
    seg.ended = true;
    try {
      if (seg.rec.state !== 'inactive') seg.rec.stop();
      else this.finishSegment(seg);
    } catch {
      this.finishSegment(seg);
    }
  }

  private finishSegment(seg: Segment) {
    seg.ended = true;
    if (seg.done) return;
    seg.done = true;
    const durationSec = (performance.now() - seg.startedAt) / 1000;
    const blob = new Blob(seg.chunks, { type: this.mime.split(';')[0] || 'video/mp4' });
    /* 실제 초당 크기로 다음 조각 길이를 맞춘다(약속한 비트레이트보다 크게 나오는 기기) */
    if (durationSec > 2 && blob.size > 0)
      this.segSec = Math.min(this.segSec, this.lengthFor(blob.size / durationSec));
    seg.chunks = [];
    this.segs = this.segs.filter((s) => s !== seg);
    this.pendingStops--;
    if (blob.size > 0) {
      this.set({ parts: this.state.parts + 1 });
      this.uploads = this.uploads.then(() =>
        this.upload(seg.index, blob, seg.offsetSec, durationSec)
      );
    }
    if (this.pendingStops <= 0) this.allStopped?.();
  }

  private async upload(
    index: number,
    blob: Blob,
    offsetSec: number,
    durationSec: number
  ) {
    const id = this.recordingId;
    if (!id) return;
    let lastError = OFFLINE;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const target = await this.api.createUpload(id, blob.type, blob.size);
        if (!target.ok) {
          lastError = target.error;
          break;
        }
        await this.api.put(target.signedUrl, blob, (percent) =>
          this.set({ progress: percent })
        );
        const attached = await this.api.attach(id, {
          index,
          path: target.path,
          bytes: blob.size,
          mime: blob.type,
          offsetSec,
          durationSec,
        });
        if (!attached.ok) {
          lastError = attached.error;
          break;
        }
        this.set({ uploaded: this.state.uploaded + 1, progress: null });
        return;
      } catch (err) {
        unstable_rethrow(err);
        lastError = err instanceof Error ? err.message : OFFLINE;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    this.set({ failed: this.state.failed + 1, progress: null, error: lastError });
  }

  /** 멈춤 — 찍던 조각을 닫고, 남은 조각을 다 올린 뒤 녹화를 끝낸다. 결과: 올린 조각 수 */
  async stop(): Promise<{ ok: boolean; parts: number; error: string | null }> {
    if (this.state.phase !== 'recording') return { ok: false, parts: 0, error: null };
    this.stopping = true;
    const durationSec = (performance.now() - this.t0) / 1000;
    this.set({ phase: 'stopping', elapsedSec: durationSec });
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const stopped = new Promise<void>((resolve) => {
      this.allStopped = resolve;
      if (this.pendingStops <= 0) resolve();
    });
    for (const s of [...this.segs]) this.endSegment(s);
    await Promise.race([stopped, new Promise((r) => setTimeout(r, 4000))]);
    await this.uploads;
    let parts = this.state.uploaded;
    if (this.recordingId) {
      try {
        const res = await this.api.finish(this.recordingId, { durationSec });
        if (res.ok) parts = res.parts;
      } catch (err) {
        unstable_rethrow(err);
      }
    }
    const ok = this.state.failed === 0 && parts > 0;
    this.set({ phase: 'done' });
    return { ok, parts, error: this.state.error };
  }

  /** 화면을 떠남 등 — 올리지 않고 버린다(이미 올린 조각은 남는다) */
  abort() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const s of this.segs) {
      s.ended = true;
      s.done = true;
      try {
        if (s.rec.state !== 'inactive') s.rec.stop();
      } catch {
        /* 이미 멈춤 */
      }
    }
    this.segs = [];
  }
}
