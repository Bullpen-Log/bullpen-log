import { clipSpanOf, coveredBy, nextSweepWindow, SWEEP_EVERY_SEC } from '@/lib/velocity-engine/sweep';
import { DualCamera, type Clip, type ThrowEvent } from '../../modules/dual-camera';
import { FRAME_LOSS_WARN, frameLossNotice, frameLossOf } from './clip-health';
import { EngineError, type EngineHandle, type EngineResult, type MeasureOpts } from './engine';

/**
 * 앱 구속 측정의 흐름 — 던짐 알림 → 클립 자르기 → 숨은 웹뷰 계산기로 재기 → 결과.
 *
 * 사이트 lib/velocity-engine/dual-capture.ts(DualCapture)의 같은 부분을 옮겼다 — 그쪽은 window.Capacitor 로 카메라를 불러 앱에서
 * 그대로 못 쓴다(검토 D3: 카메라 다리는 만들지 않음). 규칙 · 숫자는 그쪽과 같게 둔다 — 그쪽을 고치면 여기도 본다.
 *   - 'ball' — 날아가는 공이 확실 → 바로 화면에 띄우고 공 시각 둘레(BALL_RANGE)만 잰다. 클립 앞 0.6 · 뒤 1.6초.
 *   - 'seed' — 공 후보 → 안 보이게 재 보고 공 길이 나오면 보인다. 다른 작업이 없을 때만 받는다.
 *   - 'motion' — 볼 자리가 크게 움직임 → 안 보이게 넓은 클립(앞 0.5 · 뒤 2.6초)을 훑어 잰다.
 *   - 'skip' — 앱이 발열로 쉰 움직임 → 재지 않고 시도 기록에만.
 *   - 'sweep' — 조용할 때 훑기(사이트 2.7, 2026-10-19 옮김)가 찾은 공 → 움직임과 같은 길(넓은 클립)로 안 보이게 잰다. 훑기의
 *     공 시각은 알림보다 0.4~0.9초 어긋날 수 있어 씨앗으로 못 박지 않는다. 결과에 '뒤늦게 찾은 공'(late) 표시.
 *
 * 조용할 때 훑기(sweep): 알아채기가 켜진(armed) 동안 재는 중이 없으면 SWEEP_EVERY_SEC 마다 지난 창(sweep.ts nextSweepWindow)을
 * 앱 카메라에서 잘라 계산기의 훑기(engine.locate — 학습 모델 2.7.1, 못 받으면 거친 훑기)에 넘기고, 공을 믿으면 그 시각으로 잰다.
 * 앱 알림(공 · 움직임)이 발열 · 폰 자리 때문에 침묵해도 영상에 공이 있으면 몇 초 뒤엔 잡힌다. 시계는 DualCamera.now(알림 atSec 과
 * 같은 카메라 시계)라 사이트의 역산 꾀가 필요 없다 — now 가 없는 옛 앱 판은 훑기를 안 한다. 훑기 한 번이 2.5초 넘으면(느린 폰)
 * 다음 하나는 건너뛴다.
 */

const MAX_PENDING = 2;
/** 공 알림 클립 앞 · 뒤(초) — 재는 범위(BALL_RANGE)보다 0.1~0.15초만 넉넉히. 0.6 · 1.6 이었을 때 클립의 1할이 안 쓰는 장면이었다(다리 바이트, 2026-10-20) */
const BALL_CLIP: [number, number] = [0.4, 1.55];
const BALL_RANGE: [number, number] = [0.25, 1.45];
const MOTION_CLIP: [number, number] = [0.5, 2.6];
/** 훑기 한 번이 이보다 오래 걸리면 다음 하나를 쉰다(사이트 dual-capture 와 같다) */
const SWEEP_SLOW_MS = 2500;
export const LOST_BALL_NOTE = '공을 끝까지 찾지 못해 이번 공은 재지 못했어요. 다시 던져 주세요.';

type ThrowKind = 'ball' | 'seed' | 'motion' | 'sweep';

/**
 * 한 작업의 단계별 시간(ms) — 콘솔 '[velo] …' 한 줄 · 관리자 진단(2026-10-20: 10-20 세션에서 30초가 어디서 가는지 알 길이 없었다).
 * queue 알림 뒤 차례 기다림 · clip 카메라 모듈 자르기 · read 클립 읽기 + 조각 보내기 · engine 계산기 안 · total 알림부터 결과까지
 */
export type JobTiming = {
  id: number;
  kind: ThrowKind;
  queueMs: number;
  clipMs: number;
  readMs: number;
  engineMs: number;
  totalMs: number;
  bytes: number;
  /** 클립에 담긴 초당 장면 수(옛 앱 판은 null) */
  fpsActual: number | null;
  /** 계산기 안 시간 나눔(lib/velocity-engine/analyze-video.ts timing) — 결과에 실려 올 때만 */
  inner?: { framesMs: number; analyzeMs: number; coarseMs: number };
  /** 'ok 112.3 high' · 'NOT_ENOUGH_FRAMES no-flight' · 'TIMEOUT' */
  outcome: string;
};

/** 진단 한 줄 — '#3 ball 큐 120 · 자르기 410 · 읽기 380(3.1MB · 58fps) · 계산 2900(장면 900 · 분석 1500) · 합 3800ms → ok 112.3 high' */
export function timingLine(t: JobTiming): string {
  const inner = t.inner ? `(장면 ${t.inner.framesMs} · 분석 ${t.inner.analyzeMs}${t.inner.coarseMs ? ` · 훑기 ${t.inner.coarseMs}` : ''})` : '';
  const fps = t.fpsActual != null ? ` · ${Math.round(t.fpsActual)}fps` : '';
  return `#${t.id} ${t.kind} 큐 ${t.queueMs} · 자르기 ${t.clipMs} · 읽기 ${t.readMs}(${(t.bytes / 1e6).toFixed(1)}MB${fps}) · 계산 ${t.engineMs}${inner} · 합 ${t.totalMs}ms → ${t.outcome}`;
}

/** 계산기 안 시간 나눔 — 결과에 timing 이 실려 올 때만 */
function innerTimingOf(result: EngineResult): JobTiming['inner'] {
  const t = (result as { timing?: { framesMs?: unknown; analyzeMs?: unknown; coarseMs?: unknown } }).timing;
  if (!t) return undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
  return { framesMs: n(t.framesMs), analyzeMs: n(t.analyzeMs), coarseMs: n(t.coarseMs) };
}

/** 실패를 시도 기록 코드로 — 계산기(EngineError.code) · 카메라 모듈(Expo 코드: clip 그 순간의 영상 없음 · off · read …) */
function errorCodeOf(err: unknown): string {
  if (err instanceof EngineError) return err.code;
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) {
    if (code === 'clip') return 'NO_CLIP';
    if (code === 'off') return 'CAMERA_OFF';
    return `CLIP_${code.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`.slice(0, 40);
  }
  return 'ERROR';
}

type Job = {
  id: number;
  at: number;
  start: number;
  end: number;
  /** 알림이 온 때(벽시계 ms) — 차례 기다림 · 전체 시간 재기 */
  queuedAt: number;
  visible: boolean;
  ball: boolean;
  /** 시도 기록을 이미 남겼나 — 실패 길에서 두 번 적지 않게 */
  recorded?: boolean;
  seed?: boolean;
  /** 조용할 때 훑기가 찾은 공 — 결과에 late 표시 */
  sweep?: boolean;
  ballAt?: number;
  strength: number;
  thermal: number | null;
};

const kindOf = (job: Job): ThrowKind => (job.ball ? 'ball' : job.seed ? 'seed' : job.sweep ? 'sweep' : 'motion');

/** 이 앱 판에서 훑기가 되나 — 카메라 시계(DualCamera.now)가 있어야 지난 창을 자른다 */
export const canSweep = () => typeof DualCamera.now === 'function';

/** 화면이 정하는 재기 조건(사이트 DualCapture 의 set… 들) */
export type MeasureSettings = Omit<MeasureOpts, 'fps' | 'fovDeg' | 'fovKnown' | 'ballRange'> & { fallbackFovDeg: number };

export type CaptureStatus = 'armed' | 'capturing' | 'analyzing';

/** 화면이 잰 공을 받았나 — 안 받으면(측정 불가 · 잡음) 클립을 지우고 시도 기록에 까닭을 남긴다 */
export type Verdict = { kept: true } | { kept: false; code?: string; why?: string };

export type CaptureHandlers = {
  /** 잰 공(쟀든 못 쟀든 공 길이 있는 것). 받으면(kept) 클립은 화면 것 — 다 쓴 뒤 화면이 discard 를 부른다 */
  onResult(result: EngineResult, meta: { id: number; hitT: number; clip: Clip; late: boolean }): Verdict;
  /** 화면에 띄울 작업 수가 바뀜 — '투구를 인식했어요' · '구속 계산 중' */
  onStatus(status: CaptureStatus, visible: number): void;
  onNotice(message: string): void;
  /** 작업 하나가 끝날 때(쟀든 실패했든) 단계별 시간 — 관리자 진단 */
  onTiming?(t: JobTiming): void;
  /** 시도 기록(사이트 recordVelocityAttempt 와 같은 칸) */
  onAttempt?(a: {
    id: number;
    kind: ThrowKind;
    atSec: number;
    strength: number;
    ok: boolean;
    code: string | null;
    why: string | null;
    thermal: number | null;
    trackFrames: number;
    rawKmh: number | null;
    confidence: string | null;
    distance?: unknown;
  }): void;
};

export class AppCapture {
  private jobs: Job[] = [];
  private recent: { start: number; end: number; until: number }[] = [];
  private queue: Promise<void> = Promise.resolve();
  private nextId = 0;
  /** 멈추거나 다시 켜면 올린다 — 그 전 작업의 결과는 버린다 */
  private gen = 0;
  private armedNow = true;
  /* 조용할 때 훑기 */
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweptUntil: number | null = null;
  private sweeping = false;
  private sweepSkip = 0;
  /** 장면 빠짐 알림을 마지막으로 띄운 때 — 10초에 한 번만 */
  private lastLossNoticeAt = 0;

  constructor(
    private engine: () => EngineHandle | null,
    private settings: () => MeasureSettings,
    private handlers: CaptureHandlers
  ) {}

  /** 알아채기 켜짐 — 켜면 훑기도 같이 돌고, 끄면 멈춘다(화면이 측정 단계에서만 켠다) */
  get armed() {
    return this.armedNow;
  }

  set armed(on: boolean) {
    this.armedNow = on;
    if (on) this.startSweep();
    else this.stopSweep();
  }

  stop() {
    this.gen++;
    this.jobs = [];
    this.stopSweep();
  }

  onThrow(e: ThrowEvent) {
    if (!this.armedNow) return;
    if (e.kind === 'skip') {
      this.handlers.onAttempt?.({
        id: ++this.nextId, kind: 'motion', atSec: e.atSec, strength: e.strength, ok: false, code: null,
        why: 'heat-skip', thermal: e.thermal, trackFrames: 0, rawKmh: null, confidence: null,
      });
      return;
    }
    this.enqueue(e.atSec, e.kind, e.strength, e.thermal);
  }

  private enqueue(atSec: number, kind: ThrowKind, strength: number, thermal: number | null) {
    const ball = kind === 'ball';
    const seed = kind === 'seed';
    const sweep = kind === 'sweep';
    const covering = this.jobs.find((j) => atSec >= j.start && atSec <= j.end);
    if (covering) {
      /* 재고 있는 움직임 클립 안에 공 알림이 왔다 — 그 공 시각으로 잰다 */
      if ((ball || seed) && !covering.ball && covering.ballAt == null) covering.ballAt = atSec;
      if (ball && !covering.visible) {
        covering.visible = true;
        this.sync();
      }
      return;
    }
    const now = Date.now();
    this.recent = this.recent.filter((r) => r.until > now);
    if (this.recent.some((r) => atSec >= r.start && atSec <= r.end)) return;
    if (this.jobs.length >= MAX_PENDING) {
      if (ball) this.handlers.onNotice('계산이 밀려 공 하나를 건너뛰었어요');
      return;
    }
    /* 후보는 비어 있을 때만 — 헛 후보가 뒤따르는 확실한 공의 자리를 차지하지 않게 */
    if (seed && this.jobs.length > 0) return;
    const [before, after] = ball || seed ? BALL_CLIP : MOTION_CLIP;
    const job: Job = {
      id: ++this.nextId,
      at: atSec,
      start: atSec - before,
      end: atSec + after,
      queuedAt: now,
      visible: ball,
      ball,
      ...(seed ? { seed: true, ballAt: atSec } : {}),
      ...(sweep ? { sweep: true } : {}),
      strength,
      thermal,
    };
    this.jobs.push(job);
    const gen = this.gen;
    this.sync();
    this.queue = this.queue
      .then(() => this.measure(job, gen))
      .catch((err: unknown) => {
        if (gen !== this.gen) return;
        /*
         * 시한 초과 · 계산기 죽음 · 클립 없음도 시도로 남긴다(2026-10-20: 10-20 세션의 30초 시한 초과가 DB 에 한 줄도 없어 공을 몇 개
         * 잃었는지 셀 수 없었다). 코드는 EngineError.code(TIMEOUT · ENGINE_…) · 카메라 모듈 코드(NO_CLIP · CAMERA_OFF …)
         */
        const code = errorCodeOf(err);
        if (!job.recorded) {
          job.recorded = true;
          this.handlers.onAttempt?.({
            id: job.id, kind: kindOf(job), atSec: job.at, strength: job.strength, ok: false, code,
            why: code.toLowerCase().replace(/_/g, '-'), thermal: job.thermal, trackFrames: 0, rawKmh: null, confidence: null,
          });
        }
        this.report({
          id: job.id, kind: kindOf(job), queueMs: 0, clipMs: 0, readMs: 0, engineMs: 0, totalMs: Date.now() - job.queuedAt,
          bytes: 0, fpsActual: null, outcome: code,
        });
        if (job.visible) this.handlers.onNotice(err instanceof Error ? err.message : '영상을 읽지 못했어요');
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

  /** 단계별 시간을 한 줄로 — 콘솔 · 관리자 진단(2026-10-20) */
  private report(t: JobTiming) {
    console.info(`[velo] ${timingLine(t)}`);
    this.handlers.onTiming?.(t);
  }

  /** 클립에 장면이 많이 빠졌으면(캡처가 늦은 장면을 버림) 알린다 — 10초에 한 번. 재기는 그대로 간다(막지 않는다) */
  private warnFrameLoss(clip: Clip) {
    const loss = frameLossOf(clip);
    if (loss == null || loss < FRAME_LOSS_WARN) return;
    const now = Date.now();
    if (now - this.lastLossNoticeAt < 10_000) return;
    this.lastLossNoticeAt = now;
    this.handlers.onNotice(frameLossNotice(clip.fpsActual ?? 0));
  }

  private async measure(job: Job, gen: number) {
    const t0 = Date.now();
    const { main, wide } = await DualCamera.clip({ atSec: job.at, beforeSec: job.at - job.start, afterSec: job.end - job.at });
    const clipMs = Date.now() - t0;
    const drop = (paths: string[]) => DualCamera.discard({ paths }).catch(() => undefined);
    if (wide) void drop([wide.path]);
    const engine = this.engine();
    if (gen !== this.gen || !engine) return void drop([main.path]);
    this.warnFrameLoss(main);
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
    const { result, ms, readMs } = await engine.measure(main, opts, () => {
      if (job.visible || gen !== this.gen) return;
      job.visible = true;
      this.sync();
    });
    if (gen !== this.gen) return void drop([main.path]);
    const ok = result.measure.ok;
    const track = result.track.length;
    const noBall = !ok && !job.ball && track < 4 && (job.ballAt == null || job.seed === true);
    /* 공 길이 거의 없으면 헛알림 — 띄웠던 공이면 알리고, 아니면 조용히 넘긴다. 아니면 화면이 받을지 정한다 */
    const silent = !ok && (!job.visible || track < 4);
    if (silent && job.visible) this.handlers.onNotice(LOST_BALL_NOTE);
    const verdict: Verdict = silent
      ? { kept: false }
      : this.handlers.onResult(result, { id: job.id, hitT: main.eventSec, clip: main, late: job.sweep === true });
    const dropped = ok && !verdict.kept;
    job.recorded = true;
    this.handlers.onAttempt?.({
      id: job.id,
      kind: kindOf(job),
      atSec: job.at,
      strength: job.strength,
      ok: ok && verdict.kept,
      code: result.measure.ok ? (dropped ? (verdict.code ?? 'LOW_CONFIDENCE') : null) : result.measure.code,
      why: noBall ? 'no-ball' : dropped ? (verdict.why ?? null) : (result.distance?.why ?? null),
      thermal: job.thermal,
      trackFrames: track,
      rawKmh: result.measure.ok ? result.measure.kmh : null,
      confidence: result.measure.ok ? result.measure.confidence : null,
      distance: result.distance,
    });
    const m = result.measure;
    this.report({
      id: job.id,
      kind: kindOf(job),
      queueMs: t0 - job.queuedAt,
      clipMs,
      readMs,
      engineMs: ms,
      totalMs: Date.now() - job.queuedAt,
      bytes: main.bytes,
      fpsActual: main.fpsActual ?? null,
      inner: innerTimingOf(result),
      outcome: m.ok
        ? `${verdict.kept ? 'ok' : (verdict.code ?? 'LOW_CONFIDENCE')} ${m.kmh.toFixed(1)} ${m.confidence}`
        : `${m.code}${noBall ? ' no-ball' : result.distance?.why ? ` ${result.distance.why}` : ''} 장면 ${track}`,
    });
    if (!verdict.kept) drop([main.path]);
  }

  /* ── 조용할 때 훑기(2.7) ── */

  private startSweep() {
    if (this.sweepTimer || !canSweep()) return;
    this.sweptUntil = null;
    this.sweepSkip = 0;
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_EVERY_SEC * 1000);
  }

  private stopSweep() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    /* sweeping 은 돌던 sweep() 의 finally 가 내린다 — 여기서 내리면 잠깐 껐다 켤 때 옛 훑기와 새 훑기가 겹쳐 돌았다 */
  }

  /**
   * 지난 창을 잘라 훑는다 — 재는 중 · 훑는 중이면 쉰다. 공을 믿었고 재는 중 · 최근 잰 창에 없으면 그 시각으로 'sweep' 작업을 건다.
   * 잘린 실제 구간(앱 모듈이 한 번에 주는 길이에 맞춰 줄 수 있다)을 sweptUntil 로 두어 다음 창이 거기서 이어진다.
   */
  private async sweep() {
    if (!this.armedNow || this.sweeping || this.jobs.length > 0) return;
    if (this.sweepSkip > 0) {
      this.sweepSkip--;
      return;
    }
    const engine = this.engine();
    if (!engine || !DualCamera.now) return;
    const win = nextSweepWindow(this.sweptUntil, DualCamera.now());
    if (!win) return;
    const gen = this.gen;
    this.sweeping = true;
    const t0 = Date.now();
    let path: string | null = null;
    try {
      const { main, wide } = await DualCamera.clip({ atSec: win.from, beforeSec: 0, afterSec: win.to - win.from });
      path = main.path;
      if (wide) void DualCamera.discard({ paths: [wide.path] }).catch(() => undefined);
      if (gen !== this.gen || !this.armedNow) return;
      const span = clipSpanOf(win.from, main, win.to);
      const s = this.settings();
      const { found } = await engine.locate(main, {
        fps: main.fps,
        fovDeg: main.fovDeg > 0 ? main.fovDeg : s.fallbackFovDeg,
        approach: s.approach,
        focalPerLongSide: s.focalPerLongSide,
      });
      if (gen !== this.gen || !this.armedNow) return;
      this.sweptUntil = span.end;
      if (found?.accepted && Number.isFinite(found.ballT)) {
        const t = span.start + found.ballT;
        const now = Date.now();
        const busy = [...this.jobs.map((j) => ({ start: j.start, end: j.end })), ...this.recent.filter((r) => r.until > now)];
        /* 겹침 안에서 찾은 공은 지난 훑기 · 알림이 이미 쟀을 수 있다 — 재는 중 · 최근 창에 없을 때만 */
        if (!coveredBy(t, busy)) {
          console.info(`[velo] sweep ${span.start.toFixed(2)}~${span.end.toFixed(2)} → 공 ${t.toFixed(2)} (${found.via})`);
          this.enqueue(t, 'sweep', 0, null);
        }
      }
    } catch (e) {
      console.info('[velo] sweep 실패', e instanceof Error ? e.message : e);
    } finally {
      if (path) void DualCamera.discard({ paths: [path] }).catch(() => undefined);
      this.sweeping = false;
      if (Date.now() - t0 > SWEEP_SLOW_MS) this.sweepSkip = 1;
    }
  }
}
