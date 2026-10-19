'use client';

import { unstable_rethrow } from 'next/navigation';
import {
  attachRecordingPart,
  createRecordingPartUpload,
  finishVelocityRecording,
  startVelocityRecording,
} from '@/app/actions/velocity-recording';
import { RECORD_MAX_PENDING, RECORD_SEGMENT_SEC, nextRecordCut } from '@/lib/velocity-engine/sweep';
import type { RecorderApi, RecorderState } from '@/lib/velocity-recorder';

/**
 * 세션 통째 녹화(관리자, 엔진 2.7 1단계) — 앱 카메라로 재는 동안 앱이 쥐고 있는 최근 몇 초를 4초마다 잘라 서버 녹화(VelocityRecording,
 * 엔진 개발용 녹화와 같은 표 · 같은 편집기)로 올린다. 사이트 쪽만이라 앱 빌드 없이 된다(김민이 고른 2번 방식). 조각 하나 약 7MB(14Mbps) —
 * LTE 면 1분 100MB 쯤이라 와이파이용. 올리기가 밀리면(3개 넘게) 그 조각은 건너뛴다(메모리) — 그 구간은 기록에 빈다.
 *
 * 2026-10-19: 조각을 6초로 청했는데 앱 모듈은 한 번에 4초까지만 잘라 줘(DualCameraModule.swift) 매번 뒤처지다 앱이 쥔 8초 밖으로 밀려 멎었다
 * (금윤호 녹화 다섯 — 189초 중 7초). 이제 구간은 sweep.ts nextRecordCut 이 정한다 — 모듈 상한만큼 · 밀리면 건너뛰고 · 실패해도 자리를 옮긴다.
 *
 * 왜: 10-16 세션 저장 뒤 공 알림이 거의 안 왔는데 영상이 없어 왜 못 알아챘는지 볼 수 없었다. 이 녹화가 다음 현장의 '놓친 공' 자료이자
 * 공 감지 학습 모델(2.7 5단계)의 자료가 된다.
 *
 * 자르기 · 시계는 DualCapture 가 준다(cutRange · cameraNow · anchorClock). 조각의 offsetSec 은 첫 조각 시작부터(초).
 */

export type DualSessionSource = {
  cameraNow: () => number | null;
  anchorClock: () => Promise<unknown>;
  cutRange: (from: number, to: number) => Promise<{ blob: Blob; start: number; end: number }>;
};

const OFFLINE = '신호가 약해 조각을 올리지 못했어요.';

function putBlob(url: string, blob: Blob, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', blob.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('조각을 올리지 못했어요.'));
    xhr.onerror = () => reject(new Error(OFFLINE));
    xhr.send(blob);
  });
}

const SERVER_API: RecorderApi = {
  start: startVelocityRecording,
  createUpload: createRecordingPartUpload,
  attach: attachRecordingPart,
  finish: finishVelocityRecording,
  put: putBlob,
};

export class DualSessionRecorder {
  private recordingId: string | null = null;
  /** 첫 조각 시작 · 마지막으로 자른 끝(카메라 시계) */
  private t0: number | null = null;
  private lastEnd: number | null = null;
  private nextIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cutting = false;
  private pending = 0;
  private uploads: Promise<void> = Promise.resolve();
  private startedAt = 0;
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
    private source: DualSessionSource,
    private onChange: (s: RecorderState) => void,
    /** 서버와 저장소 — 시험할 때만 갈아 끼운다 */
    private api: RecorderApi = SERVER_API
  ) {}

  private phase(): RecorderState['phase'] {
    return this.state.phase;
  }

  private set(patch: Partial<RecorderState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  async start(input: { date: string; meta: Record<string, unknown> }) {
    if (this.state.phase !== 'idle') return;
    this.set({ phase: 'starting' });
    let res: Awaited<ReturnType<RecorderApi['start']>>;
    try {
      res = await this.api.start({ date: input.date, meta: input.meta });
    } catch (err) {
      unstable_rethrow(err);
      this.set({ phase: 'error', error: OFFLINE });
      return;
    }
    if (!res.ok) {
      this.set({ phase: 'error', error: res.error });
      return;
    }
    /* 켜는 사이에 stop() · abort() 가 왔으면 그만(타입 좁힘을 피해 phase 를 다시 읽는다) */
    if (this.phase() !== 'starting') return;
    this.recordingId = res.id;
    this.startedAt = performance.now();
    await this.source.anchorClock();
    if (this.phase() !== 'starting') return;
    /* 첫 조각은 지금부터 — 켜기 전 영상은 안 담는다(이어 재기면 앞 세션 조각이 이미 있다) */
    this.lastEnd = this.source.cameraNow();
    this.set({ phase: 'recording' });
    this.timer = setInterval(() => void this.tick(), RECORD_SEGMENT_SEC * 1000);
  }

  private async tick(final = false) {
    if (this.cutting) return;
    const now = this.source.cameraNow();
    if (now == null || this.lastEnd == null) return;
    const next = nextRecordCut(this.lastEnd, now, final);
    if (!next) return;
    const { from, to, skippedSec } = next;
    this.cutting = true;
    this.set({ elapsedSec: (performance.now() - this.startedAt) / 1000 });
    try {
      if (skippedSec > 0) {
        /* 앱이 쥔 영상 밖으로 뒤처졌다 — 없는 구간은 버리고 버퍼 안부터 */
        this.set({
          failed: this.state.failed + 1,
          error: `카메라가 밀려 ${Math.round(skippedSec)}초를 건너뛰었어요.`,
        });
      }
      if (this.pending >= RECORD_MAX_PENDING) {
        /* 올리기가 밀렸다 — 이 구간은 버린다(메모리). 다음 조각은 여기서 이어진다 */
        this.lastEnd = to;
        this.set({ failed: this.state.failed + 1, error: '올리기가 밀려 조각 하나를 건너뛰었어요.' });
        return;
      }
      const cut = await this.source.cutRange(from, to);
      if (this.t0 == null) this.t0 = cut.start;
      /* 돌아온 끝이 청한 끝보다 앞이면(아직 안 닫힘) 거기서 이어 간다 — 뒤로는 안 간다 */
      this.lastEnd = Math.max(from, cut.end);
      const index = this.nextIndex++;
      const offsetSec = Math.max(0, cut.start - this.t0);
      this.set({ parts: this.state.parts + 1 });
      this.pending++;
      this.uploads = this.uploads
        .then(() => this.upload(index, cut.blob, offsetSec, cut.end - cut.start))
        .finally(() => this.pending--);
    } catch (err) {
      unstable_rethrow(err);
      /* 이 구간은 버리고 다음으로 — 그대로 두면 다음에도 같은(이미 없는) 자리를 청해 영영 멎는다 */
      this.lastEnd = to;
      this.set({
        failed: this.state.failed + 1,
        error: err instanceof Error ? err.message : '영상을 자르지 못했어요.',
      });
    } finally {
      this.cutting = false;
    }
  }

  private async upload(index: number, blob: Blob, offsetSec: number, durationSec: number) {
    const id = this.recordingId;
    if (!id) return;
    let lastError = OFFLINE;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const target = await this.api.createUpload(id, blob.type || 'video/mp4', blob.size);
        if (!target.ok) {
          lastError = target.error;
          break;
        }
        await this.api.put(target.signedUrl, blob, (percent) => this.set({ progress: percent }));
        const attached = await this.api.attach(id, {
          index,
          path: target.path,
          bytes: blob.size,
          mime: blob.type || 'video/mp4',
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

  /** 멈춤 — 남은 구간을 한 번 더 자르고 다 올린 뒤 녹화를 끝낸다 */
  async stop(): Promise<{ ok: boolean; parts: number; error: string | null }> {
    if (this.state.phase !== 'recording' && this.state.phase !== 'starting')
      return { ok: false, parts: 0, error: null };
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const wasRecording = this.state.phase === 'recording';
    this.set({ phase: 'stopping' });
    if (wasRecording) {
      await this.tick(true).catch(() => undefined);
      await this.uploads;
    }
    let parts = this.state.uploaded;
    if (this.recordingId) {
      try {
        const res = await this.api.finish(this.recordingId, {
          durationSec: (performance.now() - this.startedAt) / 1000,
        });
        if (res.ok) parts = res.parts;
      } catch (err) {
        unstable_rethrow(err);
      }
    }
    this.set({ phase: 'done' });
    return { ok: this.state.failed === 0 && parts > 0, parts, error: this.state.error };
  }

  /** 화면을 떠남 — 더 자르지 않는다(이미 올린 조각은 남는다) */
  abort() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.set({ phase: 'done' });
  }
}
