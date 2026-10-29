import { clipSpanOf, coveredBy, nextSweepWindow, SWEEP_EVERY_SEC } from '@/lib/velocity-engine/sweep';
import { DualCamera, type Clip, type ThrowEvent } from '../../modules/dual-camera';
import { FRAME_LOSS_WARN, frameLossNotice, frameLossOf } from './clip-health';
import { EngineError, type EngineHandle, type EngineResult, type MeasureOpts } from './engine';
import { MISS_REASONS, type MissReason } from '@/lib/velocity-session';

/**
 * 앱 구속 측정의 흐름 — 던짐 알림 → 클립 자르기 → 숨은 웹뷰 계산기로 재기 → 결과.
 *
 * 사이트 lib/velocity-engine/dual-capture.ts(DualCapture)의 같은 부분을 옮겼다 — 그쪽은 window.Capacitor 로 카메라를 불러 앱에서
 * 그대로 못 쓴다(검토 D3: 카메라 다리는 만들지 않음). 규칙 · 숫자는 그쪽과 같게 둔다 — 그쪽을 고치면 여기도 본다.
 *   - 'net' — 학습 모델 공 알림(SPEC-detect D4) → 'ball' 과 같은 길. 모델이 도는 동안(카메라 통계 netMs, noteNet)은 아래 옛 알림(스위프트 MotionTrigger)
 *     — 'ball' · 'seed' · 'motion' · 'skip' — 을 받지 않는다. 시험대 녹화 38구: 모델 37 · 헛 알림 분당 1.2, 옛 공 알림 11 · 분당 5(bench-findings 6-1).
 *     모델이 없는 앱 판(10-24 TestFlight 전) · 모델을 못 읽은 폰은 옛 알림 그대로.
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
/**
 * 던짐 알림(공 · 움직임 · 후보) 뒤 이만큼(ms)은 훑기를 쉰다 — 계산기 줄은 하나라, 막 시작한 훑기(최대 15초) 뒤에서 진짜 공이 기다렸다
 * (사이트는 훑기를 재기와 따로 돌려 이런 일이 없다, 2026-10-20 검토). 알림이 오면 줄에 선 훑기도 뺀다(engine.yieldToMeasure).
 */
const SWEEP_AFTER_THROW_MS = 4000;
/**
 * 훑기가 찾은 공은 그 훑기 클립에서 바로 잰다 — 공 시각 앞 0.7 · 뒤 1.3초.
 * 예전엔 훑기 클립을 지우고 새로 잘라, 훑기가 오래 걸리면 앞 장면(릴리스)이 카메라가 쥔 8초 밖으로 밀려났다(2026-10-20 검토).
 * 합쳐 2초 안이어야 한다 — 엔진은 한 번에 120장(analyze-video.ts MAX_FRAMES)까지만 보고 넘치면 한 장씩 건너뛰어, 예전 2.8초(0.9 · 1.9)는
 * 60fps 영상을 30fps 로 쟀다(믿음이 낮게 나와 버려지기 쉬움, 2026-10-20 검토).
 */
const SWEEP_RANGE: [number, number] = [0.7, 1.3];
export const LOST_BALL_NOTE =
  '공을 알아챘는데 날아가는 길을 거의 못 잡았어요. 폰은 던지는 사람 1.5~2m 뒤, 손이 떠나는 자리가 화면 가운데 쪽에 오게 해 주세요.';

/** 'net' — 학습 모델 공 알림(SPEC-detect D4) — 'ball' 처럼 잰다 */
type ThrowKind = 'ball' | 'seed' | 'motion' | 'sweep' | 'net';

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

/**
 * 클립에 실린 모델 후보(Clip.hits 줄 [t, x, y, d, score]) → 계산기 옵션 netHits. 모양이 어긋난 줄은 뺀다. 좌표 변환은 하지 않는다 — 모듈이 이미
 * 세운 화면 비율로 준다(DualCameraCore.swift DualClip.hits, 약속 판 hitsSchema 1). 판이 다르면(모듈이 새 뜻으로 바뀜) 안 쓴다 — 조용히 옛 뜻으로 읽지 않게
 */
export function netHitsOf(clip: Clip): NonNullable<MeasureOpts['netHits']> | null {
  if (clip.hitsSchema !== 1 || !Array.isArray(clip.hits) || clip.hits.length === 0) return null;
  const out: NonNullable<MeasureOpts['netHits']> = [];
  for (const row of clip.hits) {
    if (!Array.isArray(row) || row.length < 5 || !row.every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    const [t, x, y, d, score] = row;
    out.push({ t, x, y, d, score });
  }
  return out.length ? out : null;
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
  /** 차례가 와 재기를 시작했나 — 시작 전인 안 보이는 작업만 공에게 자리를 내준다 */
  started?: boolean;
  /** 공에게 자리를 내주고 빠졌다 — 재지 않는다 */
  dropped?: boolean;
  /** 같은 공을 따로 세운 공 작업이 맡았다 — 이미 돌고 있으면 끝까지 가되 결과는 버린다 */
  superseded?: boolean;
  /**
   * 알림을 받자마자 자른 클립(pre 가 없을 때). 예전엔 차례가 와서야 잘라, 앞 작업의 계산(3~10초)이 길면 공 영상이 카메라가 쥔 8초 밖으로
   * 밀려 '그 순간의 영상이 없어요'가 됐다(2026-10-20 검토). 카메라 모듈은 자르기를 차례로 하니 여기서 바로 청해도 된다.
   */
  clip?: Promise<{ main: Clip; wide: Clip | null }>;
  seed?: boolean;
  /** 조용할 때 훑기가 찾은 공 — 결과에 late 표시 */
  sweep?: boolean;
  /** 학습 모델 알림으로 세운 공 작업(ball 도 켜짐) — 시도 기록 kind 'net' */
  net?: boolean;
  ballAt?: number;
  strength: number;
  thermal: number | null;
  /** 이미 잘라 둔 클립(훑기가 찾은 공) · 그 클립의 첫 장면 카메라 시각 — 새로 자르지 않는다 */
  pre?: { clip: Clip; t0: number };
  /** 클립을 받아 계산기로 넘겼나 — 그 전엔 '투구를 인식했어요', 뒤엔 '구속 계산 중' */
  analyzing?: boolean;
  /** 조용히 재던 클립이 공을 찾았다 — 이때까지 '인식했어요'를 먼저 보인다(웹처럼 결과가 불쑥 뜨지 않게) */
  flashUntil?: number;
  /** 계산기가 공 길을 찾았다고 알렸다('ball') — 그 뒤는 '구속 계산 중'. 공 구간을 받은 작업은 계산기가 이 알림을 안 보낸다 */
  pathFound?: boolean;
};

const kindOf = (job: Job): ThrowKind => (job.net ? 'net' : job.ball ? 'ball' : job.seed ? 'seed' : job.sweep ? 'sweep' : 'motion');
/** 모델이 돈다고 보는 시간 — 카메라 통계(1초마다)의 netMs 가 이만큼 끊기면 옛 알림으로 돌아간다 */
const NET_ALIVE_MS = 3000;

/** 이 앱 판에서 훑기가 되나 — 카메라 시계(DualCamera.now)가 있어야 지난 창을 자른다 */
export const canSweep = () => typeof DualCamera.now === 'function';

/** 화면이 정하는 재기 조건(사이트 DualCapture 의 set… 들) */
export type MeasureSettings = Omit<MeasureOpts, 'fps' | 'fovDeg' | 'fovKnown' | 'ballRange'> & { fallbackFovDeg: number };

/** armed 대기 · capturing 투구를 알아채 클립을 기다림 · analyzing 계산기가 공 길을 찾는 중 · computing 계산기가 공 길을 찾았다고 알림(구속 계산) */
export type CaptureStatus = 'armed' | 'capturing' | 'analyzing' | 'computing';
/** 화면에 띄우는 알림의 종류 — missed 공 길을 못 잡음 · failed 계산 실패 · backlog 앞 공 처리 중이라 못 잼 · info 재기는 이어 가는 알림 */
export type NoticeKind = 'missed' | 'failed' | 'backlog' | 'info';

/** 화면이 잰 공을 받았나 — 안 받으면(측정 불가 · 잡음) 클립을 지우고 시도 기록에 까닭을 남긴다 */
export type Verdict = { kept: true } | { kept: false; code?: string; why?: string };

export type CaptureHandlers = {
  /** 잰 공(쟀든 못 쟀든 공 길이 있는 것). 받으면(kept) 클립은 화면 것 — 다 쓴 뒤 화면이 discard 를 부른다 */
  /** queuedAt — 투구를 알아챈 때(Date.now) — ABS 가 그때의 타자로 판정한다 */
  onResult(result: EngineResult, meta: { id: number; hitT: number; clip: Clip; late: boolean; queuedAt: number }): Verdict;
  /** 화면에 띄울 작업 수가 바뀜 — '투구를 인식했어요' · '구속 계산 중' */
  onStatus(status: CaptureStatus, visible: number): void;
  /** miss — 못 잰 공 알림이면 그 짧은 까닭(화면 집계 · 소리 안내). kind — 화면이 실패를 가르는 종류 */
  onNotice(message: string, miss: MissReason | undefined, kind: NoticeKind): void;
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
    /** 단계별 시간 — 시도 기록(analysis.timing)에도 싣는다. 폰 콘솔 · 관리자 진단에만 있으면 현장 뒤에 원격으로 못 읽었다(2026-10-20) */
    timing?: JobTiming;
    /** 계산기에 넘긴 옵션 그대로(잰 작업만) — 화면이 설정 칸(analysis.settings)으로 옮겨 적는다(2026-10-25 설계안 작업 A) */
    opts?: MeasureOpts;
    /** 클립에 실려 온 모델 후보 수(모듈이 준 것 — 계산기가 못 받으면 opts.netHits 는 없고 이것만 남는다, 작업 B) */
    hitsAvail?: number;
  }): void;
};

export class AppCapture {
  private jobs: Job[] = [];
  private recent: { start: number; end: number; until: number }[] = [];
  /** 계산기로 넘기는 작업이 돌고 있나 — 한 번에 하나(계산기도 하나다). 다음 차례는 보이는 작업(공)부터(pump) */
  private running = false;
  /*
   * 작업 번호는 화면을 열 때마다 1부터가 아니라 지금 시각부터 — 이어서 잰 세션은 맡겨 둔 공이 옛 번호(1, 2, …)를 갖고 있어, 새 작업의 시도
   * 기록이 옛 공에 붙었다(2026-10-20 검토). ms 시각이라 실행마다 겹치지 않는다.
   */
  private nextId = Date.now();
  /** 마지막 던짐 알림(벽시계 ms) — 그 뒤 잠깐은 훑기를 쉰다 */
  private lastThrowAt = 0;
  /** 학습 모델이 마지막으로 돈 때(벽시계 ms) — 카메라 통계 netMs 또는 모델 알림 */
  private netAt = 0;
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
    /* 아직 안 잰 작업의 클립은 이미 잘라 두었다 — 지운다(돌고 있는 작업은 gen 이 바뀌어 스스로 지운다) */
    for (const j of this.jobs)
      if (!j.started) {
        this.discardJob(j);
        this.lostJob(j, 'STOPPED', 'stopped-before-run');
      }
    this.jobs = [];
    this.stopSweep();
  }

  /** 안 잴 작업의 클립을 지운다 — 미리 자른 클립 · 훑기 클립 */
  private discardJob(job: Job) {
    const paths = (c: { main: Clip; wide: Clip | null }) => [c.main.path, ...(c.wide ? [c.wide.path] : [])];
    if (job.pre) void DualCamera.discard({ paths: [job.pre.clip.path] }).catch(() => undefined);
    void job.clip?.then((c) => DualCamera.discard({ paths: paths(c) })).catch(() => undefined);
  }

  /**
   * 재지도 못하고 끝난 알림 · 작업을 시도로 남긴다(2026-10-25 설계안 작업 A — "큐 포화 · 중복 제외까지 이벤트를 남긴다"). 예전엔 줄이 차서 버린 공 ·
   * 막 잰 창 안에 든 알림 · 공에게 자리를 내준 움직임 작업이 어디에도 안 남아, 알림 수와 기록 수의 차이를 설명할 수 없었다. 시도 하나가 투구 하나는 아니다
   * (한 투구에 알림이 여럿) — 세지 말고 되짚는 데 쓴다.
   *   QUEUE_FULL 줄이 차 못 세움 · DUP_WINDOW 막 잰 창 안의 알림 · MERGED 재는 클립 안에 든 알림(그 작업에 합침, why 에 어느 작업) · SEED_BUSY 후보인데 다른 작업이 있음 ·
   *   DROPPED 공에게 자리를 내줌 · 공 작업이 따로 서서 비킴 · SUPERSEDED 돌던 작업을 공 작업이 대신해 결과를 버림 · STOPPED 측정을 끝내 재지 않음
   */
  private lost(a: { id?: number; kind: ThrowKind; atSec: number; strength: number; thermal: number | null; code: string; why: string }) {
    this.handlers.onAttempt?.({
      id: a.id ?? ++this.nextId, kind: a.kind, atSec: a.atSec, strength: a.strength, ok: false, code: a.code, why: a.why,
      thermal: a.thermal, trackFrames: 0, rawKmh: null, confidence: null,
    });
  }

  /** 줄에 섰던 작업이 재지 못하고 빠진다 — 한 번만 적는다 */
  private lostJob(job: Job, code: string, why: string) {
    if (job.recorded) return;
    job.recorded = true;
    this.lost({ id: job.id, kind: kindOf(job), atSec: job.at, strength: job.strength, thermal: job.thermal, code, why });
  }

  /** 작업을 줄에서 뺀다(재지 않음) */
  private dropJob(job: Job, why: string) {
    job.dropped = true;
    this.jobs = this.jobs.filter((j) => j !== job);
    this.discardJob(job);
    this.lostJob(job, 'DROPPED', why);
  }

  /** 카메라 통계(1초마다)의 장면당 모델 시간 — 0 보다 크면 모델이 돈다 */
  noteNet(netMs: number | null | undefined) {
    if (netMs != null && netMs > 0) this.netAt = Date.now();
  }

  onThrow(e: ThrowEvent) {
    if (!this.armedNow) return;
    if (e.kind === 'net') this.netAt = Date.now();
    /* 모델이 도는 동안 옛 알림은 버린다 — 헛 알림이 계산기 줄 · 훑기 쉼을 차지했다(SPEC-detect D4) */
    else if (Date.now() - this.netAt < NET_ALIVE_MS) return;
    this.lastThrowAt = Date.now();
    if (e.kind === 'skip') {
      this.handlers.onAttempt?.({
        id: ++this.nextId, kind: 'motion', atSec: e.atSec, strength: e.strength, ok: false, code: null,
        why: 'heat-skip', thermal: e.thermal, trackFrames: 0, rawKmh: null, confidence: null,
      });
      return;
    }
    this.enqueue(e.atSec, e.kind, e.strength, e.thermal);
  }

  /** 작업을 줄에 세운다 — 받았으면 true(pre 클립은 작업 것), 안 받았으면 false(pre 클립은 부른 쪽이 지운다) */
  private enqueue(atSec: number, kind: ThrowKind, strength: number, thermal: number | null, pre?: { clip: Clip; t0: number }): boolean {
    const net = kind === 'net';
    const ball = kind === 'ball' || net;
    const seed = kind === 'seed';
    const sweep = kind === 'sweep';
    const covering = this.jobs.find((j) => atSec >= j.start && atSec <= j.end);
    let displace: Job | undefined;
    if (covering) {
      /*
       * 재고 있는 움직임 클립 안에 공 알림이 왔다 — 그 클립에 공 구간(BALL_RANGE)이 다 들고 아직 안 쟀으면 그 공 시각으로 잰다. 아니면(이미 재는 중 ·
       * 클립이 그물 전에 끝남) 공 작업을 따로 세우고 그 작업은 비킨다 — 예전엔 붙기만 해 공이 클립에 다 안 들거나 ballAt 이 무시됐다(2026-10-20 검토)
       */
      const fits = !covering.started && !covering.pre && atSec - BALL_RANGE[0] >= covering.start && atSec + BALL_RANGE[1] <= covering.end;
      /* 이미 재면서 공 길을 찾은 작업(보이게 됨)이면 그 공이다 — 새로 세우지 않는다 */
      const found = covering.started && covering.visible;
      if (!ball || covering.ball || fits || found) {
        /* 진짜 공 알림이 후보 클립 안에 들었다 — 후보 시각보다 공 시각이 맞다 */
        if (ball && covering.seed && fits) covering.ballAt = atSec;
        else if ((ball || seed) && !covering.ball && covering.ballAt == null) covering.ballAt = atSec;
        if (ball && !covering.visible) {
          covering.visible = true;
          this.sync();
        }
        this.lost({ kind, atSec, strength, thermal, code: 'MERGED', why: `merged:${kindOf(covering)}#${covering.id % 100000}` });
        return false;
      }
      /* 공이 그 클립에 다 안 든다 — 아래 거절 검사를 다 넘으면 그 작업을 비킨다(먼저 비키면 공이 거절될 때 둘 다 잃었다) */
      displace = covering;
    }
    const now = Date.now();
    this.recent = this.recent.filter((r) => r.until > now);
    if (this.recent.some((r) => atSec >= r.start && atSec <= r.end)) {
      this.lost({ kind, atSec, strength, thermal, code: 'DUP_WINDOW', why: 'dup-window' });
      return false;
    }
    /* 비킬 작업이 아직 안 시작했으면 자리를 셀 때 빼 둔다(그 자리에 선다) */
    const others = displace && !displace.started ? this.jobs.filter((j) => j !== displace) : this.jobs;
    if (others.length >= MAX_PENDING) {
      /*
       * 확실한 공이면 아직 시작 안 한 안 보이는 작업(움직임 · 훑기)을 빼고 그 자리에 선다. 10-20 금윤호 실내 화면 녹화: 사람이 화면 앞을
       * 오가며 낸 움직임 작업이 줄을 채워, 첫 투구부터 진짜 공이 '계산이 밀려 건너뛰었어요'로 버려졌다.
       */
      const victim = ball ? [...others].reverse().find((j) => !j.visible && !j.started) : undefined;
      if (!victim) {
        if (ball) this.handlers.onNotice('계산이 밀려 공 하나를 건너뛰었어요', undefined, 'backlog');
        this.lost({ kind, atSec, strength, thermal, code: 'QUEUE_FULL', why: 'queue-full' });
        return false;
      }
      this.dropJob(victim, 'displaced-by-ball');
    }
    /* 후보는 비어 있을 때만 — 헛 후보가 뒤따르는 확실한 공의 자리를 차지하지 않게 */
    if (seed && this.jobs.length > 0) {
      this.lost({ kind, atSec, strength, thermal, code: 'SEED_BUSY', why: 'seed-busy' });
      return false;
    }
    if (displace) {
      if (displace.started) displace.superseded = true;
      else this.dropJob(displace, 'displaced');
    }
    /* 진짜 공이 왔다 — 훑기는 비킨다(돌고 있어도 끊는다, 엔진 2.7.3) */
    if (!sweep) this.engine()?.yieldToMeasure();
    const [before, after] = pre ? SWEEP_RANGE : ball || seed ? BALL_CLIP : MOTION_CLIP;
    const job: Job = {
      id: ++this.nextId,
      at: atSec,
      start: atSec - before,
      end: atSec + after,
      queuedAt: now,
      visible: ball,
      ball,
      ...(net ? { net: true } : {}),
      ...(seed ? { seed: true, ballAt: atSec } : {}),
      ...(sweep ? { sweep: true } : {}),
      ...(pre ? { pre } : { clip: DualCamera.clip({ atSec, beforeSec: before, afterSec: after }) }),
      strength,
      thermal,
    };
    /* 기다리는 동안 실패해도 '처리 안 된 거부'로 남지 않게 — 실패는 measure 가 받는다 */
    job.clip?.catch(() => undefined);
    this.jobs.push(job);
    this.sync();
    this.pump();
    return true;
  }

  /** 다음 작업을 계산기로 — 한 번에 하나, 보이는 작업(공)이 먼저. 예전엔 들어온 차례대로라 공이 안 보이는 움직임 작업 뒤에서 기다렸다 */
  private pump() {
    if (this.running) return;
    const next = this.jobs.find((j) => !j.started && j.visible) ?? this.jobs.find((j) => !j.started);
    if (!next) return;
    next.started = true;
    this.running = true;
    void this.run(next, this.gen).finally(() => {
      this.running = false;
      this.pump();
    });
  }

  private async run(job: Job, gen: number) {
    let yielded = false;
    try {
      yielded = (await this.measure(job, gen)) === 'yield';
    } catch (err: unknown) {
      if (gen === this.gen && !job.superseded) {
        /*
         * 시한 초과 · 계산기 죽음 · 클립 없음도 시도로 남긴다(2026-10-20: 10-20 세션의 30초 시한 초과가 DB 에 한 줄도 없어 공을 몇 개
         * 잃었는지 셀 수 없었다). 코드는 EngineError.code(TIMEOUT · ENGINE_…) · 카메라 모듈 코드(NO_CLIP · CAMERA_OFF …)
         */
        const code = errorCodeOf(err);
        const timing: JobTiming = {
          id: job.id, kind: kindOf(job), queueMs: 0, clipMs: 0, readMs: 0, engineMs: 0, totalMs: Date.now() - job.queuedAt,
          bytes: 0, fpsActual: null, outcome: code,
        };
        if (!job.recorded) {
          job.recorded = true;
          this.handlers.onAttempt?.({
            id: job.id, kind: kindOf(job), atSec: job.at, strength: job.strength, ok: false, code,
            why: code.toLowerCase().replace(/_/g, '-'), thermal: job.thermal, trackFrames: 0, rawKmh: null, confidence: null, timing,
          });
        }
        this.report(timing);
        if (job.visible)
          this.handlers.onNotice(
            err instanceof Error ? err.message : '영상을 읽지 못했어요',
            undefined,
            err instanceof EngineError && err.code === 'TIMEOUT' && err.queued ? 'backlog' : 'failed'
          );
      }
    } finally {
      if (!yielded) {
        this.jobs = this.jobs.filter((j) => j !== job);
        this.recent.push({ start: job.start, end: job.end, until: Date.now() + 5000 });
        /* 결과를 버린 작업도 시도로 — 공 작업이 대신한 것(superseded) · 측정을 끝내 버린 것(gen) */
        if (job.superseded) this.lostJob(job, 'SUPERSEDED', 'superseded');
        else if (gen !== this.gen) this.lostJob(job, 'STOPPED', 'stopped-while-run');
      }
      if (gen === this.gen) this.sync();
    }
  }

  /*
   * 화면 상태 — 보이는 작업 중 클립을 아직 기다리거나 막 공을 찾은(flash) 것이 있으면 '투구를 인식했어요'(capturing), 모두 계산기로 넘어갔으면
   * '구속 계산 중'(analyzing). 예전엔 보이는 작업이 있으면 늘 analyzing 이라 '인식했어요'가 한 번도 안 떴다(2026-10-20 — 사이트는 둘을 가른다).
   */
  private sync() {
    const visible = this.jobs.filter((j) => j.visible);
    const now = Date.now();
    const recognizing = visible.some((j) => !j.analyzing || (j.flashUntil ?? 0) > now);
    const working: CaptureStatus = visible.some((j) => j.pathFound) ? 'computing' : 'analyzing';
    this.handlers.onStatus(this.jobs.length ? (visible.length && !recognizing ? working : 'capturing') : 'armed', visible.length);
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
    this.handlers.onNotice(frameLossNotice(clip.fpsActual ?? 0), undefined, 'info');
  }

  /** 'yield' — 공 작업에게 차례를 내주고 줄로 돌아갔다(클립은 그대로 쥔다) */
  private async measure(job: Job, gen: number): Promise<'yield' | void> {
    const t0 = Date.now();
    const drop = (paths: string[]) => DualCamera.discard({ paths }).catch(() => undefined);
    const { main, wide } = job.pre ? { main: job.pre.clip, wide: null } : await job.clip!;
    /* 차례가 와서 클립을 마저 기다린 시간(알림 때 바로 청했다) */
    const clipMs = Date.now() - t0;
    if (wide) void drop([wide.path]);
    if (gen !== this.gen || job.superseded) return void drop([main.path]);
    /*
     * 클립을 기다리는 사이 공이 왔다 — 안 보이는 작업(움직임 · 훑기 공)은 계산기로 넘기기 전에 공에게 차례를 내준다. 계산기는 돌던 재기를 못 끊어,
     * 넘기고 나면 공이 3~10초 기다렸다(2026-10-20 검토). 클립은 이미 잘려 있으니 나중에 그대로 잰다.
     */
    if (!job.visible && this.jobs.some((j) => !j.started && j.visible)) {
      job.started = false;
      if (!job.pre) job.clip = Promise.resolve({ main, wide: null });
      return 'yield';
    }
    const engine = this.engine();
    if (!engine) {
      void drop([main.path]);
      throw new EngineError('ENGINE_DOWN', '계산기를 불러오지 못했어요. 신호를 확인해 주세요.');
    }
    /* 화면에 띄운 작업만 알린다 — 조용한 움직임 작업까지 알리면 마지막 공이 오래된 값처럼 흐려졌다(stale) */
    if (job.visible) this.warnFrameLoss(main);
    const s = this.settings();
    /*
     * 공이 처음 보인 때(클립 시각) — 공 알림 작업은 알림 시각, 움직임 작업에 묶인 공 알림은 그 차이만큼 뒤, 훑기가 찾은 공은 훑기 클립 안의 그 시각
     * (훑기 공 시각은 어긋날 수 있어 범위만 넓게 — SWEEP_RANGE, 씨앗은 엔진이 둘레부터 찾는 힌트일 뿐)
     */
    const ballEv = job.pre
      ? job.at - job.pre.t0
      : job.ball
        ? main.eventSec
        : job.ballAt != null
          ? main.eventSec + (job.ballAt - job.at)
          : null;
    const range = job.pre ? SWEEP_RANGE : BALL_RANGE;
    /*
     * 클립에 실린 모델 후보 → 공 길 안내(작업 B). 계산기(사이트)가 받을 수 있다고 알렸을 때만(ready caps.netHits) — 옛 사이트에 보내면 모르는 칸이라
     * 버려지는데, 그걸 '보냈다'고 적으면 안 되니 시도 기록에는 받은 쪽 수(netHits)와 모듈이 준 수(hitsAvail)를 따로 남긴다
     */
    const hits = netHitsOf(main);
    const netHits = hits && engine.info()?.caps.netHits === true ? hits : null;
    const opts: MeasureOpts = {
      fps: main.fps,
      fovDeg: main.fovDeg > 0 ? main.fovDeg : s.fallbackFovDeg,
      /* 렌즈 값 · 잰 자른 몫 · 보정 꺼짐이면 믿을 만하다. 짐작(estimate)이면 엔진이 ± 를 넓힌다 */
      fovKnown: main.fovDeg > 0 && main.fovSource !== 'estimate',
      ...(ballEv != null && ballEv < main.durationSec
        ? {
            ballRange: {
              startSec: Math.max(0, ballEv - range[0]),
              endSec: Math.min(main.durationSec, ballEv + range[1]),
              seedT: ballEv,
            },
          }
        : {}),
      approach: s.approach,
      focalPerLongSide: s.focalPerLongSide,
      releaseDistanceM: s.releaseDistanceM,
      distanceM: s.distanceM,
      distanceAuto: s.distanceAuto,
      distanceChosen: s.distanceChosen,
      tiltRad: s.tiltRad,
      ...(netHits ? { netHits } : {}),
    };
    job.analyzing = true;
    if (gen === this.gen) this.sync();
    let measured: Awaited<ReturnType<EngineHandle['measure']>>;
    try {
      measured = await engine.measure(main, opts, () => {
        if (job.superseded || gen !== this.gen) return;
        job.pathFound = true;
        if (job.visible) return this.sync();
        /* 조용히 재던 클립이 공을 찾았다 — '인식했어요'를 잠깐 먼저 보인다 */
        job.visible = true;
        job.flashUntil = Date.now() + 400;
        this.sync();
        setTimeout(() => {
          if (gen === this.gen) this.sync();
        }, 420);
      });
    } catch (e) {
      /* 시한 초과 · 계산기 멈춤 — 클립 파일을 남기지 않는다(예전엔 실패마다 3~7MB 가 폰에 쌓였다) */
      void drop([main.path]);
      throw e;
    }
    const { result, ms, readMs } = measured;
    /* 같은 공을 공 작업이 따로 잰다 — 이 결과는 버린다(같은 공이 두 번 남지 않게) */
    if (gen !== this.gen || job.superseded) return void drop([main.path]);
    const ok = result.measure.ok;
    const track = result.track.length;
    const noBall = !ok && !job.ball && track < 4 && (job.ballAt == null || job.seed === true);
    /*
     * 공 길이 거의 없으면 헛알림 — 띄웠던 공이면 알리고, 아니면 조용히 넘긴다. 아니면 화면이 받을지 정한다. 훑기가 공 감지 모델로 찾은 공(sweep)은
     * 안 띄웠어도 공 길이 있으면 못 잰 까닭을 알린다(2026-10-22 — 알림 없이 던진 공이 말없이 사라지던 것).
     */
    const silent = !ok && ((!job.visible && !job.sweep) || track < 4);
    if (silent && job.visible) this.handlers.onNotice(LOST_BALL_NOTE, MISS_REASONS.short, 'missed');
    let decided: Verdict;
    try {
      decided = silent
        ? { kept: false }
        : this.handlers.onResult(result, { id: job.id, hitT: job.pre && ballEv != null ? ballEv : main.eventSec, clip: main, late: job.sweep === true, queuedAt: job.queuedAt });
    } catch (e) {
      void drop([main.path]);
      throw e;
    }
    const verdict = decided;
    const dropped = ok && !verdict.kept;
    const m = result.measure;
    const timing: JobTiming = {
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
    };
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
      timing,
      opts,
      hitsAvail: hits?.length ?? 0,
    });
    this.report(timing);
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
    /*
     * 계산기가 아직 붙든 일이 있으면(앱이 포기한 일 포함) 쉰다 — 예전엔 포기한 일 뒤에 훑기를 계속 쌓아 줄이 끝없이 길어졌다(2026-10-20).
     * 막 던짐 알림이 왔으면 그 공 재기가 먼저다. 창은 6초(sweep.ts SWEEP_MAX_SEC — 5초 간격 + 겹침 1초) — 4초면 매번 0.4~1초를 못 봤다.
     */
    if (!engine || !DualCamera.now || engine.busy() || Date.now() - this.lastThrowAt < SWEEP_AFTER_THROW_MS) return;
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
          /* 이 훑기 클립으로 바로 잰다 — 작업이 받으면 클립은 작업 것(아래 finally 가 지우지 않는다) */
          if (this.enqueue(t, 'sweep', 0, null, { clip: main, t0: span.start })) path = null;
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
