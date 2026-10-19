'use client';

import { unstable_rethrow } from 'next/navigation';
import {
  attachRecordingPart,
  createRecordingPartUpload,
  finishVelocityRecording,
  startVelocityRecording,
} from '@/app/actions/velocity-recording';
import {
  CLIP_MAX_SEC,
  RECORD_LAG_SEC,
  RECORD_MAX_PENDING,
  RECORD_SEGMENT_SEC,
  nextRecordCut,
} from '@/lib/velocity-engine/sweep';
import type { RecorderApi, RecorderState } from '@/lib/velocity-recorder';

/**
 * 세션 통째 녹화(관리자, 엔진 2.7 1단계) — 앱 카메라로 재는 동안 앱이 쥐고 있는 최근 몇 초를 4초마다 잘라 서버 녹화(VelocityRecording,
 * 엔진 개발용 녹화와 같은 표 · 같은 편집기)로 올린다. 사이트 쪽만이라 앱 빌드 없이 된다(김민이 고른 2번 방식). 조각 하나 약 7MB(14Mbps) —
 * LTE 면 1분 100MB 쯤이라 와이파이용. 올리기가 밀리면(6개 넘게) 그 조각은 폰에 두고(LocalVideo) 끝낸 뒤 올린다 — 폰에 둘 수 없으면 버린다.
 *
 * 왜: 10-16 세션 저장 뒤 공 알림이 거의 안 왔는데 영상이 없어 왜 못 알아챘는지 볼 수 없었다. 이 녹화가 다음 현장의 '놓친 공' 자료이자
 * 공 감지 학습 모델(2.7 5단계)의 자료가 된다.
 *
 * 자르기 · 시계는 DualCapture 가 준다(cutRange · cameraNow · anchorClock). 조각의 offsetSec 은 첫 조각 시작부터(초).
 *
 * 2026-10-19 — 금윤호 녹화 다섯이 189초 중 7초만 남은 뒤 셋을 고쳤다(어느 하나만 어긋나도 녹화가 조용히 멎는다):
 *  · 조각을 6초로 청했는데 앱 모듈은 4초까지만 잘라 줘 매번 뒤처지다 앱이 쥔 8초 밖으로 밀렸고, 실패해도 자리를 안 옮겨 영영 멎었다
 *    → 구간은 sweep.ts nextRecordCut(모듈 상한 · 밀리면 건너뛰기), 실패해도 lastEnd 를 옮긴다.
 *  · 시계(cameraNow)를 못 잡은 채 시작하면 lastEnd 가 null 이라 '녹화 중 · 0/0' 만 뜨고 영영 안 찍혔다(앱의 시계 역산이 두 앱 다 실패하고 첫 알림이
 *    시계를 잡는다) → 시계가 잡히는 순간 그 4초 전부터 찍기 시작한다.
 *  · 올리기(XHR · 서버 동작)에 시간 제한이 없어 하나가 멈추면 다음 조각이 모두 밀리고 stop 이 끝나지 않았다 → 조각마다 제한.
 */

export type DualSessionSource = {
  cameraNow: () => number | null;
  anchorClock: () => Promise<unknown>;
  cutRange: (from: number, to: number) => Promise<{ blob: Blob; start: number; end: number }>;
  /** 올리기가 밀린 조각을 폰에 두기(영상 번호를 돌려준다) · 다시 읽기 · 지우기 — 없으면 밀린 조각은 버린다 */
  spill?: (blob: Blob) => Promise<string>;
  unspill?: (id: string) => Promise<Blob>;
  dropSpill?: (ids: string[]) => Promise<void>;
};

const OFFLINE = '신호가 약해 조각을 올리지 못했어요.';
const WAITING_CLOCK = '카메라 시계를 기다려요 — 첫 알림이 오면 그때부터 찍어요.';
/** 자르기 · 서버 동작 · 올리기 한 번의 상한(ms) — 넘으면 그 조각은 실패로 치고 다음으로 */
const CUT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 20_000;
const PUT_TIMEOUT_MS = 90_000;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function putBlob(url: string, blob: Blob, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', blob.type);
    xhr.timeout = PUT_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('조각을 올리지 못했어요.'));
    xhr.onerror = () => reject(new Error(OFFLINE));
    xhr.ontimeout = () => reject(new Error('조각 올리기가 너무 오래 걸려 멈췄어요.'));
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

type Deferred = { id: string; index: number; offsetSec: number; durationSec: number };

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
  /** 올리기가 밀려 폰에 두는 중인 조각 — 차례로 둔다 · 폰에 둔 조각(끝낸 뒤 올린다) */
  private spills: Promise<void> = Promise.resolve();
  private deferred: Deferred[] = [];
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
    /*
     * 시계 짝은 기다리지 않는다(길면 1.5초) — 앱의 역산이 5초를 기다린 뒤 실패하는 판이 있어 그만큼 첫 공을 놓쳤다. 못 잡았으면
     * tick 이 시계가 잡히는 순간(첫 알림) 시작한다.
     */
    await Promise.race([this.source.anchorClock(), new Promise((r) => setTimeout(r, 1500))]);
    if (this.phase() !== 'starting') return;
    /* 첫 조각은 지금부터 — 켜기 전 영상은 안 담는다(이어 재기면 앞 세션 조각이 이미 있다) */
    this.lastEnd = this.source.cameraNow();
    this.set({ phase: 'recording', error: this.lastEnd == null ? WAITING_CLOCK : null });
    this.timer = setInterval(() => void this.tick(), RECORD_SEGMENT_SEC * 1000);
  }

  private async tick(final = false) {
    if (this.cutting) return;
    const now = this.source.cameraNow();
    if (now == null) return;
    if (this.lastEnd == null) {
      /* 시계가 이제 잡혔다(첫 알림) — 앱이 쥔 영상 안에서 한 조각 전부터 찍기 시작한다 */
      this.lastEnd = now - RECORD_LAG_SEC - CLIP_MAX_SEC;
      if (this.state.error === WAITING_CLOCK) this.set({ error: null });
    }
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
      const spill = this.pending >= RECORD_MAX_PENDING ? this.source.spill : undefined;
      const backlogged = this.pending >= RECORD_MAX_PENDING;
      if (backlogged && !spill) {
        /* 올리기가 밀렸는데 폰에 둘 수도 없다 — 이 구간은 버린다(메모리). 다음 조각은 여기서 이어진다 */
        this.lastEnd = to;
        this.set({ failed: this.state.failed + 1, error: '올리기가 밀려 조각 하나를 건너뛰었어요.' });
        return;
      }
      const cut = await withTimeout(
        this.source.cutRange(from, to),
        CUT_TIMEOUT_MS,
        '영상을 자르는 데 너무 오래 걸렸어요.'
      );
      if (this.t0 == null) this.t0 = cut.start;
      /* 돌아온 끝이 청한 끝보다 앞이면(아직 안 닫힘) 거기서 이어 간다 — 뒤로는 안 간다 */
      this.lastEnd = Math.max(from, cut.end);
      const index = this.nextIndex++;
      const offsetSec = Math.max(0, cut.start - this.t0);
      const durationSec = cut.end - cut.start;
      this.set({ parts: this.state.parts + 1 });
      if (spill) {
        /* 올리기가 밀렸다 — 폰에 두고 끝낸 뒤 올린다(와이파이가 느린 현장, 2026-10-19) */
        this.spills = this.spills.then(async () => {
          try {
            const id = await withTimeout(spill(cut.blob), CALL_TIMEOUT_MS, '폰에 두는 데 너무 오래 걸렸어요.');
            this.deferred.push({ id, index, offsetSec, durationSec });
            this.set({ spilled: (this.state.spilled ?? 0) + 1 });
          } catch (err) {
            unstable_rethrow(err);
            this.set({
              failed: this.state.failed + 1,
              error: err instanceof Error ? err.message : '조각을 폰에 두지 못했어요.',
            });
          }
        });
        return;
      }
      this.pending++;
      this.uploads = this.uploads
        .then(() => this.upload(index, cut.blob, offsetSec, durationSec))
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
        const target = await withTimeout(
          this.api.createUpload(id, blob.type || 'video/mp4', blob.size),
          CALL_TIMEOUT_MS,
          OFFLINE
        );
        if (!target.ok) {
          lastError = target.error;
          break;
        }
        await this.api.put(target.signedUrl, blob, (percent) => this.set({ progress: percent }));
        const attached = await withTimeout(
          this.api.attach(id, {
            index,
            path: target.path,
            bytes: blob.size,
            mime: blob.type || 'video/mp4',
            offsetSec,
            durationSec,
          }),
          CALL_TIMEOUT_MS,
          OFFLINE
        );
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
      await this.flushDeferred();
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

  /** 폰에 둔 조각을 차례로 올린 뒤 폰에서 지운다 — 올리지 못한 것은 폰에서만 지운다(남으면 앱 용량만 는다) */
  private async flushDeferred() {
    await this.spills;
    const { unspill, dropSpill } = this.source;
    if (this.deferred.length === 0 || !unspill) return;
    const list = this.deferred;
    this.deferred = [];
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      this.set({ queued: list.length - i });
      try {
        const blob = await withTimeout(unspill(d.id), CALL_TIMEOUT_MS, '폰에 둔 조각을 읽지 못했어요.');
        await this.upload(d.index, blob, d.offsetSec, d.durationSec);
      } catch (err) {
        unstable_rethrow(err);
        this.set({ failed: this.state.failed + 1, error: err instanceof Error ? err.message : OFFLINE });
      }
    }
    this.set({ queued: 0 });
    await dropSpill?.(list.map((d) => d.id)).catch(() => undefined);
  }

  /** 화면을 떠남 — 더 자르지 않는다(이미 올린 조각은 남는다). 폰에 둔 조각은 뒤에서 마저 올리고 지운다 */
  abort() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.set({ phase: 'done' });
    void this.uploads.then(() => this.flushDeferred()).catch(() => undefined);
  }
}
