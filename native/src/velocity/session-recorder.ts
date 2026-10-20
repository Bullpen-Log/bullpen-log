import { RECORD_MAX_PENDING, RECORD_SEGMENT_SEC, clipSpanOf, nextRecordCut } from '@/lib/velocity-engine/sweep';
import { rpc } from '~/lib/rpc';
import { DualCamera } from '../../modules/dual-camera';

/**
 * 세션 통째 녹화(관리자) — 웹 lib/velocity-dual-recorder.ts DualSessionRecorder 를 앱으로. 재는 동안 앱 카메라가 쥔 최근 8초에서
 * 4초마다 '지난번 끝 ~ 지금'을 잘라(sweep.ts nextRecordCut — 웹과 같은 규칙) 서버 녹화(VelocityRecording — 웹 녹화 편집기에서 본다)로
 * 올린다. 놓친 공을 나중에 찾아보고, 공 감지 학습 자료로 쓴다. 조각 약 7~10MB(14Mbps).
 *
 * 올리기가 밀리면(LTE · 느린 와이파이 — 10-20 녹화 #2 는 145초 중 40초만 올라갔다) 조각을 버리지 않고 **폰(앱 tmp)에 둔 채** 끝낸 뒤
 * 차례로 올린다(웹 10-19 와 같다). 클립 파일은 이미 폰에 있으니 그대로 두면 된다 — 1GB 를 넘으면 그때부터 버린다. 자르기 15초 · 서버
 * 동작 20초 · 올리기 90초 상한이라 하나가 멈춰도 stop 이 끝난다.
 *
 * 카메라 시계는 DualCamera.now(앱 카메라의 장면 시각과 같은 호스트 시계) — 옛 앱 판에는 없어 녹화를 켜지 않는다.
 */
export type RecState = {
  phase: 'idle' | 'starting' | 'recording' | 'stopping' | 'done' | 'error';
  parts: number;
  uploaded: number;
  /** 올리기 · 자르기 실패 */
  failed: number;
  /** 카메라가 밀려 건너뛴 횟수(앱이 쥔 8초 밖으로 뒤처짐) — 올리기 실패와 따로 */
  skipped: number;
  /** 올리기가 밀려 폰에 둔 조각(끝낸 뒤 올린다) */
  spooled: number;
  /** 끝낼 때 폰에 둔 조각을 올리는 중 — 남은 수 */
  queued: number;
  error: string | null;
};

const TICK_MS = RECORD_SEGMENT_SEC * 1000;
/** 자르기 · 서버 동작 · 올리기 한 번의 상한(ms) — 넘으면 그 조각은 실패로 치고 다음으로(웹과 같다) */
const CUT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 20_000;
/** 올리기 상한은 카메라 모듈이 정한다(120초, DualCameraModule.swift uploadTimeoutSec) — 여기선 그보다 조금 더 기다린다. 먼저 포기하면 같은 조각이 두 번 올라갔다 */
const PUT_TIMEOUT_MS = 130_000;
/**
 * 폰에 둘 수 있는 조각 합(바이트) — 넘으면 새 조각은 버린다. 현장은 와이파이가 없어 LTE · 5G 로 올린다(김민 2026-10-20) — 녹화는 초당 14Mb 라
 * LTE 올리기가 못 따라가면 쌓인다. 2GB = 쌓이기만 하면 약 19분 몫.
 */
const SPOOL_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const OFFLINE = '신호가 약해 조각을 올리지 못했어요.';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type Part = { index: number; path: string; bytes: number; offsetSec: number; durationSec: number };

export const canRecordSession = () => typeof DualCamera.now === 'function';

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

const dropFile = (path: string) => void DualCamera.discard({ paths: [path] }).catch(() => undefined);

export class SessionRecorder {
  private id: string | null = null;
  private t0: number | null = null;
  private lastEnd: number | null = null;
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cutting = false;
  /** 자르는 중인 tick — stop 이 기다린다(안 기다리면 마지막 조각이 끝낸 녹화 뒤에 붙었다) */
  private cutJob: Promise<void> | null = null;
  /** 자르기를 끝낸 약속(finishCuts) — 한 번만 */
  private cutsDone: Promise<void> | null = null;
  private pending = 0;
  private uploads: Promise<void> = Promise.resolve();
  /** 올리기가 밀려 폰에 둔 조각 — 끝낸 뒤 차례로 올린다 */
  private deferred: Part[] = [];
  private spooledBytes = 0;
  private startedAt = 0;
  state: RecState = { phase: 'idle', parts: 0, uploaded: 0, failed: 0, skipped: 0, spooled: 0, queued: 0, error: null };

  constructor(private onChange: (s: RecState) => void) {}

  private set(patch: Partial<RecState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  async start(date: string, meta: Record<string, unknown>) {
    if (this.state.phase !== 'idle' || !canRecordSession()) return;
    this.set({ phase: 'starting' });
    try {
      const res = await withTimeout(rpc<Res<{ id: string }>>('velocity-recording.startVelocityRecording', { date, meta }), CALL_TIMEOUT_MS, OFFLINE);
      if (!res.ok) return this.set({ phase: 'error', error: res.error });
      if ((this.state as RecState).phase !== 'starting') {
        /* 그사이 멈췄다(켜자마자 측정 종료) — 만든 녹화를 끝내 둔다. 예전엔 조각 없는 '찍는 중' 녹화가 관리자 목록에 남았다(2026-10-20 검토) */
        void withTimeout(rpc('velocity-recording.finishVelocityRecording', res.id, { durationSec: 0 }), CALL_TIMEOUT_MS, OFFLINE).catch(() => undefined);
        return;
      }
      this.id = res.id;
      this.startedAt = Date.now();
      /* 켜기 전 영상은 안 담는다 — 첫 조각은 지금부터 */
      this.lastEnd = DualCamera.now!();
      this.set({ phase: 'recording' });
      /* 자르는 중이면 이번 차례는 건너뛴다 — 예전엔 빈 tick 이 cutJob 을 덮어써 stop 이 자르는 중인 조각을 안 기다렸다(2026-10-20) */
      this.timer = setInterval(() => {
        if (!this.cutting) this.cutJob = this.tick();
      }, TICK_MS);
    } catch {
      this.set({ phase: 'error', error: '신호가 약해 녹화를 시작하지 못했어요.' });
    }
  }

  private async tick(final = false) {
    if (this.cutting || this.lastEnd == null) return;
    const next = nextRecordCut(this.lastEnd, DualCamera.now!(), final);
    if (!next) return;
    const { from, to, skippedSec } = next;
    this.cutting = true;
    try {
      if (skippedSec > 0) {
        /* 앱이 쥔 영상 밖으로 뒤처졌다 — 없는 구간은 버리고 버퍼 안부터(그대로 두면 다음에도 같은 자리를 청해 영영 멎는다, 2026-10-19) */
        this.set({ skipped: this.state.skipped + 1, error: `카메라가 밀려 ${Math.round(skippedSec)}초를 건너뛰었어요.` });
      }
      const backlogged = this.pending >= RECORD_MAX_PENDING;
      const { main } = await withTimeout(
        DualCamera.clip({ atSec: from, beforeSec: 0.1, afterSec: to - from }),
        CUT_TIMEOUT_MS,
        '영상을 자르는 데 너무 오래 걸렸어요.'
      );
      /* 조각이 실제로 시작한 자리 — 앞 0.1초 · 조각 경계만큼 from 보다 앞이다(웹 녹화기 cut.start 와 같다) */
      const start = clipSpanOf(from, main, to).start;
      if (this.t0 == null) this.t0 = start;
      this.lastEnd = to;
      const part: Part = { index: this.index++, path: main.path, bytes: main.bytes, offsetSec: Math.max(0, start - this.t0), durationSec: main.durationSec };
      this.set({ parts: this.state.parts + 1 });
      if (backlogged) {
        /* 올리기가 밀렸다 — 파일은 이미 폰에 있으니 그대로 두고 끝낸 뒤 올린다. 예전(MAX_PENDING 3 · 버림)엔 10-20 녹화 #2 가 145초 중 40초만 올라갔다 */
        if (this.spooledBytes + main.bytes > SPOOL_MAX_BYTES) {
          dropFile(main.path);
          this.set({ failed: this.state.failed + 1, error: '폰에 둘 자리가 없어 조각 하나를 버렸어요.' });
          return;
        }
        this.spooledBytes += main.bytes;
        this.deferred.push(part);
        this.set({ spooled: this.deferred.length });
        return;
      }
      this.pending++;
      this.uploads = this.uploads.then(() => this.upload(part)).finally(() => this.pending--);
    } catch (e) {
      /* 이 구간은 버리고 다음으로 — 그대로 두면 같은 구간을 계속 자르려다 실패한다 */
      this.lastEnd = to;
      this.set({ failed: this.state.failed + 1, error: e instanceof Error ? e.message : '영상을 자르지 못했어요.' });
    } finally {
      this.cutting = false;
    }
  }

  private async upload(p: Part) {
    const id = this.id;
    if (!id) return dropFile(p.path);
    let error = OFFLINE;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const target = await withTimeout(
          rpc<Res<{ path: string; signedUrl: string }>>('velocity-recording.createRecordingPartUpload', id, 'video/mp4', p.bytes),
          CALL_TIMEOUT_MS,
          OFFLINE
        );
        if (!target.ok) {
          error = target.error;
          break;
        }
        const put = await withTimeout(
          DualCamera.upload({ path: p.path, url: target.signedUrl, contentType: 'video/mp4' }),
          PUT_TIMEOUT_MS,
          '올리는 데 너무 오래 걸렸어요.'
        );
        if (put.status < 200 || put.status >= 300) throw new Error(`올리기 ${put.status}`);
        const attached = await withTimeout(
          rpc<Res>('velocity-recording.attachRecordingPart', id, {
            index: p.index, path: target.path, bytes: p.bytes, mime: 'video/mp4', offsetSec: p.offsetSec, durationSec: p.durationSec,
          }),
          CALL_TIMEOUT_MS,
          OFFLINE
        );
        if (!attached.ok) {
          error = attached.error;
          break;
        }
        this.set({ uploaded: this.state.uploaded + 1 });
        dropFile(p.path);
        return;
      } catch (e) {
        error = e instanceof Error ? e.message : error;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    dropFile(p.path);
    this.set({ failed: this.state.failed + 1, error });
  }

  /**
   * 자르기를 멈추고 남은 구간을 한 번 더 자른다 — 카메라를 끄기 전에 부른다. 화면을 떠나면 카메라 정리가 녹화기 정리보다 먼저 돌아
   * 마지막 구간을 꺼진 카메라에서 자르려다 잃었다(2026-10-20). 여러 번 불러도 한 번만 자른다.
   */
  finishCuts(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.cutsDone ??= (async () => {
      if (this.state.phase !== 'recording') return;
      await this.cutJob?.catch(() => undefined);
      await this.tick(true).catch(() => undefined);
    })();
    return this.cutsDone;
  }

  /** 멈춤 — 남은 구간을 한 번 더 자르고 다 올린 뒤(폰에 둔 조각까지) 녹화를 끝낸다 */
  async stop() {
    if (this.state.phase !== 'recording' && this.state.phase !== 'starting') return;
    const cuts = this.finishCuts();
    /* 길이는 지금까지 — 다 올린 뒤에 재면 올린 시간까지 들어갔다(10-20 녹화 #2: 실제 약 95초가 145.8초로, 관리자에 큰 구멍처럼 보임) */
    const durationSec = (Date.now() - this.startedAt) / 1000;
    this.set({ phase: 'stopping' });
    await cuts;
    await this.uploads;
    await this.flushDeferred();
    if (this.id)
      await withTimeout(
        rpc('velocity-recording.finishVelocityRecording', this.id, { durationSec }),
        CALL_TIMEOUT_MS,
        OFFLINE
      ).catch(() => undefined);
    this.set({ phase: 'done' });
  }

  /** 폰에 둔 조각을 차례로 올린다 — 올리든 못 올리든 파일은 지운다(upload 가) */
  private async flushDeferred() {
    const list = this.deferred;
    this.deferred = [];
    this.spooledBytes = 0;
    for (let i = 0; i < list.length; i++) {
      this.set({ queued: list.length - i, spooled: 0 });
      await this.upload(list[i]);
    }
    if (list.length) this.set({ queued: 0 });
  }

  /** 화면을 떠남 — 더 자르지 않는다(이미 올린 조각은 남는다). 폰에 둔 조각은 뒤에서 마저 올리고 지운다 */
  abort() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.set({ phase: 'done' });
    void this.uploads.then(() => this.flushDeferred()).catch(() => undefined);
  }
}
