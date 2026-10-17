import { DualCamera, type Clip, type ThrowEvent } from '../../modules/dual-camera';
import type { EngineHandle, EngineResult, MeasureOpts } from './engine';

/**
 * 앱 구속 측정의 흐름 — 던짐 알림 → 클립 자르기 → 숨은 웹뷰 계산기로 재기 → 결과.
 *
 * 사이트 lib/velocity-engine/dual-capture.ts(DualCapture)의 같은 부분을 옮겼다 — 그쪽은 window.Capacitor 로 카메라를 불러 앱에서
 * 그대로 못 쓴다(검토 D3: 카메라 다리는 만들지 않음). 규칙 · 숫자는 그쪽과 같게 둔다 — 그쪽을 고치면 여기도 본다.
 *   - 'ball' — 날아가는 공이 확실 → 바로 화면에 띄우고 공 시각 둘레(BALL_RANGE)만 잰다. 클립 앞 0.6 · 뒤 1.6초.
 *   - 'seed' — 공 후보 → 안 보이게 재 보고 공 길이 나오면 보인다. 다른 작업이 없을 때만 받는다.
 *   - 'motion' — 볼 자리가 크게 움직임 → 안 보이게 넓은 클립(앞 0.5 · 뒤 2.6초)을 훑어 잰다.
 *   - 'skip' — 앱이 발열로 쉰 움직임 → 재지 않고 시도 기록에만.
 * 조용할 때 훑기(sweep, 사이트 2.7)는 아직 옮기지 않았다.
 */

const MAX_PENDING = 2;
const BALL_CLIP: [number, number] = [0.6, 1.6];
const BALL_RANGE: [number, number] = [0.25, 1.45];
const MOTION_CLIP: [number, number] = [0.5, 2.6];
export const LOST_BALL_NOTE = '공을 끝까지 찾지 못해 이번 공은 재지 못했어요. 다시 던져 주세요.';

type Job = {
  id: number;
  at: number;
  start: number;
  end: number;
  visible: boolean;
  ball: boolean;
  seed?: boolean;
  ballAt?: number;
  strength: number;
  thermal: number | null;
};

/** 화면이 정하는 재기 조건(사이트 DualCapture 의 set… 들) */
export type MeasureSettings = Omit<MeasureOpts, 'fps' | 'fovDeg' | 'fovKnown' | 'ballRange'> & { fallbackFovDeg: number };

export type CaptureStatus = 'armed' | 'capturing' | 'analyzing';

export type CaptureHandlers = {
  /** 잰 공(쟀든 못 쟀든 공 길이 있는 것) — clip 은 다 쓴 뒤 discard 를 부른다 */
  onResult(result: EngineResult, meta: { id: number; hitT: number; clip: Clip }): void;
  /** 화면에 띄울 작업 수가 바뀜 — '투구를 인식했어요' · '구속 계산 중' */
  onStatus(status: CaptureStatus, visible: number): void;
  onNotice(message: string): void;
  /** 시도 기록(사이트 recordVelocityAttempt 와 같은 칸) */
  onAttempt?(a: {
    id: number;
    kind: 'ball' | 'seed' | 'motion';
    atSec: number;
    strength: number;
    ok: boolean;
    code: string | null;
    why: string | null;
    thermal: number | null;
    trackFrames: number;
    rawKmh: number | null;
    confidence: string | null;
  }): void;
};

export class AppCapture {
  private jobs: Job[] = [];
  private recent: { start: number; end: number; until: number }[] = [];
  private queue: Promise<void> = Promise.resolve();
  private nextId = 0;
  /** 멈추거나 다시 켜면 올린다 — 그 전 작업의 결과는 버린다 */
  private gen = 0;
  armed = true;

  constructor(
    private engine: () => EngineHandle | null,
    private settings: () => MeasureSettings,
    private handlers: CaptureHandlers
  ) {}

  stop() {
    this.gen++;
    this.jobs = [];
  }

  onThrow(e: ThrowEvent) {
    if (!this.armed) return;
    if (e.kind === 'skip') {
      this.handlers.onAttempt?.({
        id: ++this.nextId, kind: 'motion', atSec: e.atSec, strength: e.strength, ok: false, code: null,
        why: 'heat-skip', thermal: e.thermal, trackFrames: 0, rawKmh: null, confidence: null,
      });
      return;
    }
    const ball = e.kind === 'ball';
    const seed = e.kind === 'seed';
    const covering = this.jobs.find((j) => e.atSec >= j.start && e.atSec <= j.end);
    if (covering) {
      /* 재고 있는 움직임 클립 안에 공 알림이 왔다 — 그 공 시각으로 잰다 */
      if ((ball || seed) && !covering.ball && covering.ballAt == null) covering.ballAt = e.atSec;
      if (ball && !covering.visible) {
        covering.visible = true;
        this.sync();
      }
      return;
    }
    const now = Date.now();
    this.recent = this.recent.filter((r) => r.until > now);
    if (this.recent.some((r) => e.atSec >= r.start && e.atSec <= r.end)) return;
    if (this.jobs.length >= MAX_PENDING) {
      if (ball) this.handlers.onNotice('계산이 밀려 공 하나를 건너뛰었어요');
      return;
    }
    /* 후보는 비어 있을 때만 — 헛 후보가 뒤따르는 확실한 공의 자리를 차지하지 않게 */
    if (seed && this.jobs.length > 0) return;
    const [before, after] = ball || seed ? BALL_CLIP : MOTION_CLIP;
    const job: Job = {
      id: ++this.nextId,
      at: e.atSec,
      start: e.atSec - before,
      end: e.atSec + after,
      visible: ball,
      ball,
      ...(seed ? { seed: true, ballAt: e.atSec } : {}),
      strength: e.strength,
      thermal: e.thermal,
    };
    this.jobs.push(job);
    const gen = this.gen;
    this.sync();
    this.queue = this.queue
      .then(() => this.measure(job, gen))
      .catch((err: unknown) => {
        if (gen === this.gen && job.visible) this.handlers.onNotice(err instanceof Error ? err.message : '영상을 읽지 못했어요');
      })
      .finally(() => {
        this.jobs = this.jobs.filter((j) => j !== job);
        this.recent.push({ start: job.start, end: job.end, until: Date.now() + 5000 });
        if (gen === this.gen) this.sync();
      });
  }

  private sync() {
    const visible = this.jobs.filter((j) => j.visible).length;
    this.handlers.onStatus(this.jobs.length ? (visible ? 'analyzing' : 'capturing') : 'armed', visible);
  }

  private async measure(job: Job, gen: number) {
    const { main, wide } = await DualCamera.clip({ atSec: job.at, beforeSec: job.at - job.start, afterSec: job.end - job.at });
    const drop = (paths: string[]) => DualCamera.discard({ paths }).catch(() => undefined);
    if (wide) void drop([wide.path]);
    const engine = this.engine();
    if (gen !== this.gen || !engine) return void drop([main.path]);
    const s = this.settings();
    /* 공이 처음 보인 때(클립 시각) — 공 알림 작업은 알림 시각, 움직임 작업에 묶인 공 알림은 그 차이만큼 뒤 */
    const ballEv = job.ball ? main.eventSec : job.ballAt != null ? main.eventSec + (job.ballAt - job.at) : null;
    const opts: MeasureOpts = {
      fps: main.fps,
      fovDeg: main.fovDeg > 0 ? main.fovDeg : s.fallbackFovDeg,
      /* 렌즈 값 · 잰 자른 몫 · 보정 꺼짐이면 믿을 만하다. 짐작(estimate)이면 엔진이 ± 를 넓힌다 */
      fovKnown: main.fovDeg > 0 && main.fovSource !== 'estimate',
      ...(ballEv != null && ballEv < main.durationSec
        ? {
            ballRange: {
              startSec: Math.max(0, ballEv - BALL_RANGE[0]),
              endSec: Math.min(main.durationSec, ballEv + BALL_RANGE[1]),
              seedT: ballEv,
            },
          }
        : {}),
      approach: s.approach,
      focalPerLongSide: s.focalPerLongSide,
      releaseDistanceM: s.releaseDistanceM,
      distanceM: s.distanceM,
      distanceAuto: s.distanceAuto,
      tiltRad: s.tiltRad,
    };
    const { result } = await engine.measure(main, opts, () => {
      if (job.visible || gen !== this.gen) return;
      job.visible = true;
      this.sync();
    });
    if (gen !== this.gen) return void drop([main.path]);
    const ok = result.measure.ok;
    const track = result.track.length;
    const noBall = !ok && !job.ball && track < 4 && (job.ballAt == null || job.seed === true);
    this.handlers.onAttempt?.({
      id: job.id,
      kind: job.ball ? 'ball' : job.seed ? 'seed' : 'motion',
      atSec: job.at,
      strength: job.strength,
      ok,
      code: result.measure.ok ? null : result.measure.code,
      why: noBall ? 'no-ball' : (result.distance?.why ?? null),
      thermal: job.thermal,
      trackFrames: track,
      rawKmh: result.measure.ok ? result.measure.kmh : null,
      confidence: result.measure.ok ? result.measure.confidence : null,
    });
    /* 공 길이 거의 없으면 헛알림 — 띄웠던 공이면 알리고, 아니면 조용히 넘긴다 */
    if (!ok && (!job.visible || track < 4)) {
      if (job.visible) this.handlers.onNotice(LOST_BALL_NOTE);
      return void drop([main.path]);
    }
    this.handlers.onResult(result, { id: job.id, hitT: main.eventSec, clip: main });
  }
}
