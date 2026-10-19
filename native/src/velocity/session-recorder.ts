import { rpc } from '~/lib/rpc';
import { DualCamera } from '../../modules/dual-camera';

/**
 * 세션 통째 녹화(관리자) — 웹 lib/velocity-dual-recorder.ts DualSessionRecorder 를 앱으로. 재는 동안 앱 카메라가 쥔 최근 8초에서
 * 4초마다 '지난번 끝 ~ 지금'을 잘라 서버 녹화(VelocityRecording — 웹 녹화 편집기에서 본다)로 올린다. 놓친 공을 나중에 찾아보고,
 * 공 감지 학습 자료로 쓴다. 조각 약 7MB(14Mbps) — 와이파이용. 올리기가 3개 넘게 밀리면 그 구간은 건너뛴다.
 *
 * 카메라 시계는 DualCamera.now(앱 카메라의 장면 시각과 같은 호스트 시계) — 옛 앱 판에는 없어 녹화를 켜지 않는다.
 */
export type RecState = { phase: 'idle' | 'starting' | 'recording' | 'stopping' | 'done' | 'error'; parts: number; uploaded: number; failed: number; error: string | null };

const TICK_MS = 4000;
/** 마지막 조각이 아직 안 닫혔을 수 있다 — 지금에서 이만큼 띄운다 */
const LAG_SEC = 0.4;
const MAX_CUT_SEC = 4;
const MAX_PENDING = 3;

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const canRecordSession = () => typeof DualCamera.now === 'function';

export class SessionRecorder {
  private id: string | null = null;
  private t0: number | null = null;
  private lastEnd: number | null = null;
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cutting = false;
  private pending = 0;
  private uploads: Promise<void> = Promise.resolve();
  private startedAt = 0;
  state: RecState = { phase: 'idle', parts: 0, uploaded: 0, failed: 0, error: null };

  constructor(private onChange: (s: RecState) => void) {}

  private set(patch: Partial<RecState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  async start(date: string, meta: Record<string, unknown>) {
    if (this.state.phase !== 'idle' || !canRecordSession()) return;
    this.set({ phase: 'starting' });
    try {
      const res = await rpc<Res<{ id: string }>>('velocity-recording.startVelocityRecording', { date, meta });
      if (!res.ok) return this.set({ phase: 'error', error: res.error });
      if ((this.state as RecState).phase !== 'starting') return;
      this.id = res.id;
      this.startedAt = Date.now();
      /* 켜기 전 영상은 안 담는다 — 첫 조각은 지금부터 */
      this.lastEnd = DualCamera.now!();
      this.set({ phase: 'recording' });
      this.timer = setInterval(() => void this.tick(), TICK_MS);
    } catch {
      this.set({ phase: 'error', error: '신호가 약해 녹화를 시작하지 못했어요.' });
    }
  }

  private async tick(final = false) {
    if (this.cutting || this.lastEnd == null) return;
    const to = DualCamera.now!() - LAG_SEC;
    const span = Math.min(MAX_CUT_SEC, to - this.lastEnd);
    if (span < (final ? 0.5 : 2)) return;
    this.cutting = true;
    try {
      if (this.pending >= MAX_PENDING) {
        /* 올리기가 밀렸다 — 이 구간은 버리고 여기서 이어 간다 */
        this.lastEnd += span;
        this.set({ failed: this.state.failed + 1, error: '올리기가 밀려 조각 하나를 건너뛰었어요.' });
        return;
      }
      const from = this.lastEnd;
      const { main } = await DualCamera.clip({ atSec: from, beforeSec: 0.1, afterSec: span });
      if (this.t0 == null) this.t0 = from;
      this.lastEnd = from + span;
      const index = this.index++;
      const offsetSec = Math.max(0, from - this.t0);
      this.set({ parts: this.state.parts + 1 });
      this.pending++;
      this.uploads = this.uploads.then(() => this.upload(index, main.path, main.bytes, offsetSec, main.durationSec)).finally(() => this.pending--);
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : '영상을 자르지 못했어요.' });
    } finally {
      this.cutting = false;
    }
  }

  private async upload(index: number, path: string, bytes: number, offsetSec: number, durationSec: number) {
    const id = this.id;
    if (!id) return;
    let error = '신호가 약해 조각을 올리지 못했어요.';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const target = await rpc<Res<{ path: string; signedUrl: string }>>('velocity-recording.createRecordingPartUpload', id, 'video/mp4', bytes);
        if (!target.ok) {
          error = target.error;
          break;
        }
        const put = await DualCamera.upload({ path, url: target.signedUrl, contentType: 'video/mp4' });
        if (put.status < 200 || put.status >= 300) throw new Error(`올리기 ${put.status}`);
        const attached = await rpc<Res>('velocity-recording.attachRecordingPart', id, { index, path: target.path, bytes, mime: 'video/mp4', offsetSec, durationSec });
        if (!attached.ok) {
          error = attached.error;
          break;
        }
        this.set({ uploaded: this.state.uploaded + 1 });
        void DualCamera.discard({ paths: [path] });
        return;
      } catch (e) {
        error = e instanceof Error ? e.message : error;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    void DualCamera.discard({ paths: [path] });
    this.set({ failed: this.state.failed + 1, error });
  }

  /** 멈춤 — 남은 구간을 한 번 더 자르고 다 올린 뒤 녹화를 끝낸다 */
  async stop() {
    if (this.state.phase !== 'recording' && this.state.phase !== 'starting') return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const was = this.state.phase === 'recording';
    this.set({ phase: 'stopping' });
    if (was) {
      await this.tick(true).catch(() => undefined);
      await this.uploads;
    }
    if (this.id)
      await rpc('velocity-recording.finishVelocityRecording', this.id, { durationSec: (Date.now() - this.startedAt) / 1000 }).catch(() => undefined);
    this.set({ phase: 'done' });
  }

  /** 화면을 떠남 — 더 자르지 않는다(이미 올린 조각은 남는다) */
  abort() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.set({ phase: 'done' });
  }
}
