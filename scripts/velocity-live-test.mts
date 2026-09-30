/**
 * 카메라 실시간 측정의 판단(lib/velocity-engine/live-meter.ts) 자가 시험 — 카메라 없이 장면을 그려 한 장씩 흘려 넣는다.
 *
 *   node scripts/velocity-live-test.mts                 — 그린 장면만(어디서나 돈다, 1분 안팎)
 *   node scripts/velocity-live-test.mts --cache=<폴더>   — 보정 영상 장면 캐시(<폴더>/<키>/w2/f<k>.gz · raw.json)가 있으면
 *                                                         실제 영상 두 개도 카메라처럼 흘려 본다(2차 보정 실험실의 캐시)
 *
 * 무엇을 보나: 장면 시각 고르게 펴기 · 초당 장면 수 · 투수 팔의 빈자리(유령)에 속지 않고 공으로 알아채기 · 담는 구간 ·
 * 촬영 조건 규칙(사용자, 2026-09-30 — 막지 않고 알림 · '낮음' · 넓은 ±: 30fps · 번진 공 · 잘린 화면 · 짐작한 화각 · 줌 · 느린
 * 카메라) · 던지지 않으면 알아채지 않기 · 카메라가 움직이면 다시 준비 · 두 번 던지면 두 번(쉬는 시간) · 다가오는 공(포수 뒤)은
 * 1.6.0 의 판단 그대로.
 */
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import {
  LiveMeter,
  MOTION_METER_CONFIG,
  analyzeJob,
  fpsFromTimes,
  isCroppedAspect,
  liveConditionSigma,
  liveFocalPx,
  liveReport,
  regularTimes,
  LIVE_BLUR_PX,
  LIVE_DOMAIN_SIGMA_REL,
  LIVE_EXPOSURE_BLUR_SIGMA_PER_PX,
  LIVE_FOV_GUESS_SIGMA_REL,
  type CaptureJob,
  type MeterEvent,
  type MeterStatus,
} from '../lib/velocity-engine/live-meter.ts';
import {
  focalPxFromFov,
  BALL_DIAMETER_M,
  DRAG_K_PER_M,
} from '../lib/velocity-engine/geometry.ts';
import { ERROR_INTERVAL_Z } from '../lib/velocity-engine/validate.ts';
import {
  analyzeFrames,
  measureTrack,
  type DiameterReport,
} from '../lib/velocity-engine/analyze-frames.ts';
import { simulatePitch } from '../lib/velocity-engine/simulate.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

/* ───────────────────────── 장면 그리기(720×1280, 세로) ───────────────────────── */

const W = 720;
const H = 1280;
const SRC_W = 1080;
const SRC_H = 1920;
const FOV = 59.8;
const FOCAL = focalPxFromFov(H, FOV); // 분석 픽셀
const CAMERA = {
  width: W,
  height: H,
  sourceWidth: SRC_W,
  sourceHeight: SRC_H,
  fovDeg: FOV,
  approach: 'receding' as const,
  releaseDistanceM: null,
};

function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const NOISE = (() => {
  const r = makeRandom(99);
  const out = new Float32Array(65536);
  for (let i = 0; i < out.length; i++) {
    const u = Math.max(r(), 1e-9);
    out[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }
  return out;
})();

/** 배경 — 어두운 실내(60 안팎) + 잔 무늬 + 48px 바둑판(±12, 카메라가 밀리면 귀퉁이가 바뀌게). shiftX 면 옆으로 밀린 것 */
function backgroundAt(shiftX = 0): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x + shiftX;
      const cell = (Math.floor(sx / 48) + Math.floor(y / 48)) % 2 ? 12 : -12;
      out[y * W + x] =
        60 + cell + ((sx * 7 + y * 13) % 25) + 4 * Math.sin(sx / 17) * Math.cos(y / 23);
    }
  }
  return out;
}
const BG = backgroundAt();
const BG_SHIFT = backgroundAt(24);

const srgbToLinear = (v: number) => {
  const e = Math.min(1, Math.max(0, v / 255));
  return e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4);
};
const linearToSrgb = (l: number) => {
  const x = Math.min(1, Math.max(0, l));
  return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
};

type Pose = { x: number; y: number; d: number };

/** 공(밝기 210) — 3×3 부분 덮임, 여러 자리면 노출 동안 움직인 것(평균), 선형 빛에서 섞는다 */
function drawBall(luma: Float32Array, poses: Pose[]) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of poses) {
    x0 = Math.min(x0, p.x - p.d / 2 - 2);
    x1 = Math.max(x1, p.x + p.d / 2 + 2);
    y0 = Math.min(y0, p.y - p.d / 2 - 2);
    y1 = Math.max(y1, p.y + p.d / 2 + 2);
  }
  const bx0 = Math.max(0, Math.floor(x0));
  const bx1 = Math.min(W - 1, Math.ceil(x1));
  const by0 = Math.max(0, Math.floor(y0));
  const by1 = Math.min(H - 1, Math.ceil(y1));
  const ball = srgbToLinear(210);
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      let c = 0;
      for (const p of poses) {
        const r2 = (p.d / 2) ** 2;
        let n = 0;
        for (let sy = 0; sy < 3; sy++)
          for (let sx = 0; sx < 3; sx++) {
            const px = x + (sx + 0.5) / 3 - 0.5 - p.x;
            const py = y + (sy + 0.5) / 3 - 0.5 - p.y;
            if (px * px + py * py <= r2) n++;
          }
        c += n / 9 / poses.length;
      }
      if (c <= 0) continue;
      const i = y * W + x;
      luma[i] = linearToSrgb(srgbToLinear(luma[i]) * (1 - c) + ball * c);
    }
  }
}

/** 투수의 팔 — 어두운(30) 막대. 가운데 상자의 왼쪽 가장자리에 걸쳐 있다가 떠난다 */
function drawArm(luma: Float32Array, dx: number) {
  for (let y = 700; y < 780; y++)
    for (let x = 150 + dx; x < 300 + dx; x++) if (x >= 0 && x < W) luma[y * W + x] = 30;
}

type Throw = {
  /** 릴리스 시각(초) · 거리(m) · 구속(km/h) */
  t: number;
  z0: number;
  kmh: number;
  /** 릴리스 자리(카메라 기준 m, 오른쪽 · 아래 +) · 옆 속도(m/s) */
  X0: number;
  Y0: number;
  vx: number;
  vy: number;
  /** 다가오는 공(네트에서 튀어 돌아옴) */
  back?: boolean;
};

/** 시각 t 의 공 자리(분석 픽셀) — 공기저항으로 멀어진다. 화면을 벗어나거나 너무 멀면 null */
function poseAt(th: Throw, t: number): Pose | null {
  const tau = t - th.t;
  if (tau < 0 || tau > 0.9) return null;
  const v = th.kmh / 3.6;
  const s = Math.log(1 + DRAG_K_PER_M * v * tau) / DRAG_K_PER_M;
  const z = th.back ? th.z0 - s : th.z0 + s;
  if (z < 0.6 || z > 40) return null;
  const X = th.X0 + th.vx * tau;
  const Y = th.Y0 + th.vy * tau;
  return {
    x: W / 2 + (FOCAL * X) / z,
    y: H / 2 + (FOCAL * Y) / z,
    d: (FOCAL * BALL_DIAMETER_M) / z,
  };
}

type SceneOpts = {
  throws?: Throw[];
  /** 팔이 떠나는 시각(초) — 없으면 팔을 그리지 않는다 */
  armLeaves?: number;
  /** 이 시각부터 카메라가 옆으로 밀린다 */
  shakeAt?: number;
  /** 노출(초) — 1/60 이 기본. 길면 공이 번진다 */
  exposure?: number;
};

let noiseAt = 0;
function frameAt(t: number, o: SceneOpts): Uint8Array {
  const base = o.shakeAt != null && t >= o.shakeAt ? BG_SHIFT : BG;
  const luma = new Float32Array(base);
  if (o.armLeaves != null) {
    /* 팔이 떠나기 전 0.3초 동안 왼쪽으로 빠져나간다 */
    const k = (t - (o.armLeaves - 0.3)) / 0.3;
    if (k < 1) drawArm(luma, k <= 0 ? 0 : -Math.round(320 * k));
  }
  for (const th of o.throws ?? []) {
    const exp = o.exposure ?? 1 / 60;
    const poses: Pose[] = [];
    for (let q = 0; q < 5; q++) {
      const p = poseAt(th, t - exp / 2 + (exp * (q + 0.5)) / 5);
      if (p && p.d >= 1.5 && p.x > -50 && p.x < W + 50 && p.y > -50 && p.y < H + 50)
        poses.push(p);
    }
    if (poses.length) drawBall(luma, poses);
  }
  const out = new Uint8Array(W * H);
  let j = (noiseAt += 7919) & 0xffff;
  for (let i = 0; i < out.length; i++) {
    /* 센서 잡음 σ1.2 — 1.6.0 의 잠잠함 문턱(가운데 평균 차 2.0)을 넘지 않는 정도(σ2 면 'motion' 이 영영 준비되지 않는다) */
    const v = luma[i] + NOISE[j] * 1.2;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    j = (j + 1) & 0xffff;
  }
  return out;
}

type Run = {
  statuses: { t: number; s: MeterStatus }[];
  jobs: CaptureJob[];
  results: ReturnType<typeof analyzeJob>[];
  meter: LiveMeter;
};

/** 장면을 fps 로 duration 초 동안 흘려 넣는다. 일감은 바로 계산하고 finish() */
function run(
  o: SceneOpts,
  opts: {
    fps?: number;
    duration: number;
    approach?: 'receding' | 'approaching';
    motion?: boolean;
    analyze?: boolean;
  }
) {
  const fps = opts.fps ?? 60;
  const meter = new LiveMeter(W, H, opts.approach ?? 'receding', {
    ...(opts.motion ? MOTION_METER_CONFIG : {}),
    focalPx: FOCAL,
  });
  const r: Run = { statuses: [], jobs: [], results: [], meter };
  const take = (evs: MeterEvent[], t: number) => {
    for (const e of evs) {
      if (e.kind === 'status') r.statuses.push({ t, s: e.status });
      if (e.kind === 'capture') {
        r.jobs.push(e.job);
        if (opts.analyze !== false)
          r.results.push(
            analyzeJob(e.job, { ...CAMERA, approach: opts.approach ?? 'receding' })
          );
        take(meter.finish(false), t);
      }
    }
  };
  take(meter.arm(), 0);
  for (let k = 0; k < Math.round(opts.duration * fps); k++) {
    const t = (k + 0.5) / fps;
    take(meter.push({ t, luma: frameAt(t, o) }), t);
  }
  return r;
}

/* ───────────────────────── 1) 시각 · 초당 장면 수 ───────────────────────── */

console.log('\n1) 장면 시각 · 초당 장면 수');
{
  const times = Array.from({ length: 40 }, (_, k) => 0.01 + k / 60);
  check('fpsFromTimes — 60fps', Math.abs((fpsFromTimes(times) ?? 0) - 60) < 1e-6);
  const dropped = times.filter((_, k) => k % 7 !== 3);
  check(
    'fpsFromTimes — 장면이 빠져도 60',
    Math.abs((fpsFromTimes(dropped) ?? 0) - 60) < 1e-6
  );
  const rnd = makeRandom(5);
  const jit = dropped.map((t) => t + (rnd() - 0.5) * 0.006);
  const even = regularTimes(jit);
  const worst = even
    ? Math.max(...even.map((t, i) => Math.abs(t - dropped[i])))
    : Infinity;
  check(
    'regularTimes — ±3ms 흔들린 시각을 1ms 안으로 편다(빠진 장면은 건너뜀)',
    worst < 0.001,
    `최대 ${(worst * 1000).toFixed(2)}ms`
  );
  const mixed = [
    ...Array.from({ length: 10 }, (_, k) => k / 60),
    ...Array.from({ length: 10 }, (_, k) => 10 / 60 + (k + 1) / 45),
  ];
  check(
    'regularTimes — 간격이 바뀌면(60 → 45fps) 그대로 둔다(null)',
    regularTimes(mixed) == null
  );
  /* 윈도 가짜 카메라처럼 시각이 15.625ms 타이머 눈금에 붙어 31.25 · 46.9ms 가 번갈아 오는 30fps — 간격 중앙값으로 번호를 매기면 무너졌다 */
  const tick = 1 / 64;
  const ticked = Array.from(
    { length: 30 },
    (_, k) => Math.ceil((0.003 + k / 30) / tick) * tick
  );
  const evenT = regularTimes(ticked);
  const period = evenT
    ? (evenT[evenT.length - 1] - evenT[0]) / (evenT.length - 1)
    : null;
  check(
    'regularTimes — 타이머 눈금에 붙은 30fps(31 · 47ms 번갈아)도 참 간격 33.3ms 로 편다',
    period != null && Math.abs(period - 1 / 30) / (1 / 30) < 0.005,
    period != null ? `${(period * 1000).toFixed(2)}ms` : 'null'
  );
}

console.log('\n1b) 촬영 조건 — 막지 않고 알림 · 믿음 · ±');
{
  const lensCam = { ...CAMERA, focalPx: focalPxFromFov(SRC_H, FOV) };
  const good = liveConditionSigma(60, lensCam);
  check(
    "좋은 조건(60fps · 렌즈 보정) — 늘 붙는 실시간 σ 만, '낮음' 아님",
    !good.low && Math.abs(good.sigmaRel - LIVE_DOMAIN_SIGMA_REL) < 1e-9
  );
  const guess = liveConditionSigma(60, CAMERA);
  check(
    "화각 짐작(렌즈 보정 없음) — '낮음' · σ 에 화각 몫",
    guess.low &&
      Math.abs(
        guess.sigmaRel - Math.hypot(LIVE_DOMAIN_SIGMA_REL, LIVE_FOV_GUESS_SIGMA_REL)
      ) < 1e-9,
    `σ ${(guess.sigmaRel * 100).toFixed(1)}%`
  );
  const s30 = liveConditionSigma(30, lensCam);
  const s12 = liveConditionSigma(12, lensCam);
  check(
    "30fps — '낮음' · σ 가 넓어지고, 12fps 는 더 넓다",
    s30.low && s30.sigmaRel > good.sigmaRel && s12.sigmaRel > s30.sigmaRel,
    `${(s30.sigmaRel * 100).toFixed(1)}% · ${(s12.sigmaRel * 100).toFixed(1)}%`
  );
  check(
    '잘린 비율 — 1080×1080 잘림, 1080×1920 · 1440×1080 · 1280×720 아님',
    isCroppedAspect(1080, 1080) &&
      !isCroppedAspect(1080, 1920) &&
      !isCroppedAspect(1440, 1080) &&
      !isCroppedAspect(1280, 720)
  );
  const crop = { ...CAMERA, sourceWidth: 1080, sourceHeight: 1080, cropped: true };
  check(
    '잘린 화면(1080×1080)의 초점거리는 잘리기 전 1080×1920 으로 짐작(1.6.0 은 긴 변 1080 에 대어 −44%)',
    Math.abs(liveFocalPx(crop) - focalPxFromFov(1920, FOV)) < 1e-6
  );
  check(
    '줌 2배면 초점거리 2배',
    Math.abs(liveFocalPx({ ...CAMERA, zoom: 2 }) - 2 * focalPxFromFov(SRC_H, FOV)) <
      1e-6
  );
  check(
    "잘린 화면 · 줌은 '낮음' · σ 가 더 넓다",
    liveConditionSigma(60, crop).low &&
      liveConditionSigma(60, crop).sigmaRel > guess.sigmaRel &&
      liveConditionSigma(60, { ...CAMERA, zoom: 2 }).sigmaRel > guess.sigmaRel
  );
  /* 폰이 바빠 장면이 들쭉날쭉(간격 6~60ms)하면 시각이 공의 자리와 어긋난다 — 알림 · '낮음' · ± 를 넓힌다(2026-09-30 실시간 검증) */
  const shaky = {
    frames: 50,
    medianGapMs: 16.7,
    sdGapMs: 9,
    maxGapMs: 60,
    dropped: 4,
    regularized: false,
  };
  const jit = liveConditionSigma(60, lensCam, shaky);
  const evened = liveConditionSigma(60, lensCam, { ...shaky, regularized: true });
  check(
    "장면 시각이 고르지 않으면(표준편차 ÷ 간격 0.54) '낮음' · σ 넓힘 · 알림 TIMING, 고르게 폈으면 그대로",
    jit.low &&
      jit.sigmaRel > good.sigmaRel + 0.1 &&
      !evened.low &&
      liveReport(60, lensCam, null, shaky).notes.some((n) => n.code === 'TIMING'),
    `σ ${(jit.sigmaRel * 100).toFixed(1)}%`
  );
  /* fps 알림은 10장마다 — 예전에는 30장이 찬 뒤 매 장면 나가 워커 → 화면 말이 초당 60번이었다 */
  const meter = new LiveMeter(32, 32);
  let fpsEvents = 0;
  for (let k = 0; k < 120; k++) {
    const events: MeterEvent[] = meter.push({
      t: k / 60,
      luma: new Uint8Array(32 * 32),
    });
    fpsEvents += events.filter((e) => e.kind === 'fps').length;
  }
  check('fps 알림은 10장마다(120장에 12번)', fpsEvents === 12, `${fpsEvents}번`);
}

/* ───────────────────────── 2) 공으로 알아채기(팔의 유령) ───────────────────────── */

const THROW: Throw = {
  t: 1.6,
  z0: 2.4,
  kmh: 120,
  X0: -0.1,
  Y0: -0.12,
  vx: 0.4,
  vy: 1.2,
};

console.log('\n2) 60fps — 투수 팔이 떠난 빈자리(유령)에 속지 않고 공으로 알아챈다');
{
  const r = run({ throws: [THROW], armLeaves: 1.0 }, { duration: 3 });
  const job = r.jobs[0];
  check('한 번만 알아챈다', r.jobs.length === 1, `${r.jobs.length}번`);
  check(
    '공이 처음 보인 장면(릴리스 뒤 한 장 안)에 알아챈다',
    !!job?.ball && job.ball.t >= THROW.t - 1e-6 && job.ball.t <= THROW.t + 1.5 / 60,
    job?.ball
      ? `릴리스 +${((job.ball.t - THROW.t) * 1000).toFixed(0)}ms, 이음 ${job.ball.links}`
      : '공 없음'
  );
  check(
    '공 앞 0.12초부터 담는다',
    !!job && Math.abs(job.frames[0].t - (job.ball!.t - 0.12)) <= 1 / 60 + 1e-6
  );
  check('초당 장면 수 60', !!job && Math.abs((job.fps ?? 0) - 60) < 0.01);
  check(
    '배경 — 던지기 전 기록 3장 + 구간 7장, 엔진은 더 뽑지 않음',
    !!job && job.backgroundSamples.length === 10 && job.inWindowBackground === 0,
    `${job?.backgroundSamples.length}장 · 구간 ${job?.inWindowBackground}`
  );
  const res = r.results[0];
  const rel = res?.release?.releaseKmh ?? null;
  /*
   * 영상 파일 방식(analyze-video: 공 앞 장면부터 1초 · 처음 · 가운데 · 끝 + 구간 7장 배경)으로 같은 장면을 잰 값과 견준다 — 판단이
   * 계산에 넘기는 것이 파일과 같은 질인가. 참값과의 차이는 그린 공(평평한 원판)과 윤곽 자의 궁합이라 여기서 보지 않는다
   * (그린 공으로 재는 정확도는 scripts/velocity-accuracy.mts).
   */
  const all: { t: number; luma: Uint8Array }[] = [];
  for (let k = 0; k < 180; k++) {
    const t = (k + 0.5) / 60;
    all.push({ t, luma: frameAt(t, { throws: [THROW], armLeaves: 1.0 }) });
  }
  const ballT = all.find((f) => f.t >= THROW.t)!.t;
  const prevT = ballT - 1 / 60;
  const nearest = (t: number) =>
    all.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a)).luma;
  const file = analyzeFrames({
    frames: all.filter((f) => f.t >= prevT - 0.1 && f.t <= prevT + 0.9),
    backgroundSamples: [
      0,
      1.5,
      2.95,
      ...Array.from({ length: 7 }, (_, j) => prevT - 0.1 + j / 6),
    ].map(nearest),
    inWindowBackground: 0,
    width: W,
    height: H,
    sourceWidth: SRC_W,
    sourceHeight: SRC_H,
    fovDeg: FOV,
    fps: 60,
    seedFrames: Number.POSITIVE_INFINITY,
    approach: 'receding',
    releaseDistanceM: null,
  });
  const fileRel = file.release?.releaseKmh ?? null;
  check(
    '계산 — 영상 파일 방식으로 같은 장면을 잰 값과 1.5% 안',
    rel != null && fileRel != null && Math.abs(rel - fileRel) / fileRel < 0.015,
    `실시간 ${rel ?? (res && !res.measure.ok ? res.measure.code : '-')} · 파일 방식 ${fileRel ?? (file.measure.ok ? '-' : file.measure.code)} · 참값 ${THROW.kmh}`
  );
  check(
    '참값과도 크게 어긋나지 않는다(20% 안 — 그린 공이라 넉넉히)',
    rel != null && Math.abs(rel - THROW.kmh) / THROW.kmh < 0.2
  );
  check(
    "카메라 실시간은 믿음 '보통'까지",
    res?.measure.ok === true && res.measure.confidence !== 'high'
  );
  check(
    "화각을 짐작했으니 '낮음' · 알림(FOV_GUESS)이 붙는다",
    res?.measure.ok === true &&
      res.measure.confidence === 'low' &&
      res.live.notes.some((n) => n.code === 'FOV_GUESS'),
    res ? res.live.notes.map((n) => n.code).join(',') : '-'
  );
  const lensRes = job
    ? analyzeJob(job, { ...CAMERA, focalPx: focalPxFromFov(SRC_H, FOV) })
    : null;
  check(
    '렌즈 보정(같은 초점거리)이면 알림 없음 · 값은 같고 ± 만 좁다',
    lensRes?.measure.ok === true &&
      res?.measure.ok === true &&
      lensRes.live.notes.length === 0 &&
      lensRes.release?.releaseKmh === rel &&
      lensRes.measure.errorKmh < res.measure.errorKmh,
    lensRes?.measure.ok
      ? `± ${lensRes.measure.errorKmh} (짐작 ${res?.measure.ok ? res.measure.errorKmh : '-'}) · ${lensRes.measure.confidence}`
      : '-'
  );
  const seq = r.statuses.map((s) => s.s).join('>');
  check(
    '상태 settling → armed → capturing → analyzing → armed',
    seq === 'settling>armed>capturing>analyzing>armed',
    seq
  );

  const old = run(
    { throws: [THROW], armLeaves: 1.0 },
    { duration: 3, motion: true, analyze: false }
  );
  const oldT = old.jobs[0]?.triggerT ?? null;
  check(
    "견줌: 1.6.0 의 판단('motion')은 팔의 빈자리에 먼저 알아챈다(이번에 고친 것)",
    oldT != null && oldT < THROW.t - 0.1,
    oldT != null ? `릴리스 ${((oldT - THROW.t) * 1000).toFixed(0)}ms` : '못 알아챔'
  );
}

/* ───────────────────────── 3) 30fps ───────────────────────── */

console.log(
  '\n3) 30fps — 막지 않는다: 값을 내고 믿음 낮음 · 알림(LOW_FPS), 번진 공도 값을 내되 ± 를 넓힌다'
);
{
  const r = run({ throws: [THROW] }, { fps: 30, duration: 3 });
  const res = r.results[0];
  const rel = res?.release?.releaseKmh ?? null;
  check(
    '30fps 에도 공으로 알아챈다',
    r.jobs.length === 1 && !!r.jobs[0].ball,
    `${r.jobs.length}번`
  );
  check(
    "짧은 노출 — 값 · 믿음 '낮음' · 알림 '초당 장면이 30이라…' · 참값의 20% 안(그린 공)",
    res != null &&
      res.measure.ok &&
      res.measure.confidence === 'low' &&
      rel != null &&
      Math.abs(rel - THROW.kmh) / THROW.kmh < 0.2 &&
      res.live.notes.some(
        (n) => n.code === 'LOW_FPS' && n.text.startsWith('초당 장면이 30이라')
      ),
    res?.measure.ok
      ? `릴리스 ${rel} ${res.measure.confidence}`
      : `거부 ${res && !res.measure.ok ? res.measure.code : '-'}`
  );
  const blur = run({ throws: [THROW], exposure: 1 / 30 }, { fps: 30, duration: 3 });
  const b = blur.results[0];
  const brel = b?.release?.releaseKmh ?? null;
  check(
    "긴 노출(1/30초) — 값을 내면 믿음 '낮음'(못 이었으면 거부 까닭, 초당 장면 수로는 거부 안 함)",
    b != null &&
      (!b.measure.ok || b.measure.confidence === 'low') &&
      (b.measure.ok || b.measure.code !== 'FRAME_RATE_TOO_LOW'),
    b
      ? b.measure.ok
        ? `릴리스 ${brel} ${b.measure.confidence} (폭 ${b.diameter.edgeWidthPx})`
        : `거부 ${b.measure.code} (폭 ${b.diameter.edgeWidthPx})`
      : '안 알아챔'
  );
}

{
  /*
   * 노출 번짐 규칙 — 가장자리 폭이 문턱 이상이면 값은 내되 믿음 '낮음' · ± 를 넓힌다(사용자 규칙: 촬영 조건으로 막지 않는다).
   * 실제 영상 두 장면을 겹친 1/30초 흉내는 폭 2.6~6.2px 였지만 그린 평평한 원판은 번져도 폭이 넓어지지 않아, 마지막
   * 단계(measureTrack)에 폭을 직접 넣어 본다.
   */
  const lens = {
    focalPx: focalPxFromFov(SRC_H, FOV),
    frameWidth: SRC_W,
    frameHeight: SRC_H,
  };
  const sim = simulatePitch({
    kmh: 110,
    lens,
    fps: 30,
    releaseDistanceM: 2.4,
    travelM: 12,
    seed: 3,
  });
  const report = (edge: number): DiameterReport => ({
    ruler: 'limb',
    seed: sim.observations.length,
    kept: sim.observations.length,
    drops: { bright: 0, limb: 0, guard: 0 },
    brightUsable: 0,
    limbPerArea: 1.05,
    edgeWidthPx: edge,
    blurCorrectionPx: 0,
    blurred: false,
    arcDrops: 0,
  });
  const live = {
    domainSigmaRel: 0.07,
    confidenceCap: 'low' as const,
    exposureBlurPx: LIVE_BLUR_PX,
    exposureBlurSigmaPerPx: LIVE_EXPOSURE_BLUR_SIGMA_PER_PX,
  };
  const base = {
    observations: sim.observations,
    anchor: null,
    lens,
    shakePx: 0,
    approach: 'receding' as const,
    footage: null,
  };
  const sharp = measureTrack({ ...base, ...live, diameter: report(1.45) });
  const smeared = measureTrack({ ...base, ...live, diameter: report(2.7) });
  const want =
    sharp.measure.ok && smeared.measure.ok
      ? Math.hypot(
          sharp.measure.errorKmh,
          ERROR_INTERVAL_Z *
            LIVE_EXPOSURE_BLUR_SIGMA_PER_PX *
            (2.7 - 1.6) *
            smeared.measure.kmh
        )
      : null;
  check(
    "번짐 규칙 — 폭 2.7px 도 값을 내고('낮음') ± 가 1px 당 6% 만큼 넓다",
    sharp.measure.ok &&
      smeared.measure.ok &&
      smeared.measure.confidence === 'low' &&
      want != null &&
      smeared.measure.errorKmh >= want * 0.9,
    `± ${sharp.measure.ok ? sharp.measure.errorKmh : sharp.measure.code} → ${smeared.measure.ok ? smeared.measure.errorKmh : smeared.measure.code}`
  );
  const short = measureTrack({
    ...base,
    ...live,
    observations: sim.observations.slice(0, 3),
    diameter: report(2.7),
  });
  check(
    '번져서 공을 못 이었으면(장면 부족) 까닭을 MOTION_BLUR 로',
    !short.measure.ok && short.measure.code === 'MOTION_BLUR',
    short.measure.ok ? 'ok' : short.measure.code
  );
  const file = measureTrack({ ...base, diameter: report(2.7) });
  const fileShort = measureTrack({
    ...base,
    observations: sim.observations.slice(0, 3),
    diameter: report(2.7),
  });
  check(
    '번짐 규칙은 카메라 실시간만 — 넘기지 않으면(영상 파일) ± · 까닭 그대로',
    (!file.measure.ok ||
      !smeared.measure.ok ||
      file.measure.errorKmh < smeared.measure.errorKmh) &&
      !fileShort.measure.ok &&
      fileShort.measure.code !== 'MOTION_BLUR'
  );
}

console.log(
  '\n3a) 느린 카메라(15 · 12fps) — 막지 않는다: 알아채면 값(낮음) 아니면 진짜 실패 까닭만'
);
for (const fps of [15, 12]) {
  const r = run({ throws: [THROW] }, { fps, duration: 3 });
  const res = r.results[0];
  check(
    `${fps}fps — 공으로 알아채고, 초당 장면 수 · 화면 크기로는 거부하지 않는다`,
    r.jobs.length >= 1 &&
      !!res &&
      (res.measure.ok
        ? res.measure.confidence === 'low'
        : !['FRAME_RATE_TOO_LOW', 'RESOLUTION_TOO_LOW'].includes(res.measure.code)),
    `${r.jobs.length}번 · ${res ? (res.measure.ok ? `${res.release?.releaseKmh}km/h ±${res.measure.errorKmh} ${res.measure.confidence}` : res.measure.code) : '-'}`
  );
}

console.log(
  '\n3b) 앱의 고속 촬영(120 · 240fps) — 스피드건 짝은 없지만 알아채기 · 담기는 되어야 한다'
);
for (const fps of [120, 240]) {
  const r = run({ throws: [THROW], exposure: 1 / fps }, { fps, duration: 2.6 });
  const job = r.jobs[0];
  const res = r.results[0];
  check(
    `${fps}fps — 공으로 알아채고(릴리스 +40ms 안) 값이 나온다`,
    r.jobs.length === 1 &&
      !!job.ball &&
      job.ball.t - THROW.t < 0.04 &&
      res?.measure.ok === true,
    `${r.jobs.length}번${job?.ball ? ` · 릴리스 +${((job.ball.t - THROW.t) * 1000).toFixed(0)}ms · ${job.frames.length}장` : ''} · ${res ? (res.measure.ok ? `${res.release?.releaseKmh}km/h ${res.measure.confidence}` : res.measure.code) : '-'}`
  );
}

/* ───────────────────────── 4) 알아채지 말아야 할 것 ───────────────────────── */

console.log('\n4) 던지지 않으면 · 카메라가 움직이면 · 두 번 던지면 · 튀어 돌아오면');
{
  const idle = run({ armLeaves: 1.0 }, { duration: 2.5, analyze: false });
  check(
    '팔만 움직이고 던지지 않으면 알아채지 않는다',
    idle.jobs.length === 0,
    `${idle.jobs.length}번`
  );
  check(
    '그동안 armed 로 기다린다',
    idle.meter.getStatus() === 'armed',
    idle.meter.getStatus()
  );

  const shaken = run({ shakeAt: 1.2 }, { duration: 1.25, analyze: false });
  check(
    '카메라가 밀리면 배경을 다시 준비한다(settling)',
    shaken.meter.getStatus() === 'settling',
    shaken.meter.getStatus()
  );

  const second: Throw = { ...THROW, t: 4.2, kmh: 100 };
  const two = run({ throws: [THROW, second] }, { duration: 5.4 });
  check(
    '두 번 던지면 두 번(각 공에서)',
    two.jobs.length === 2 &&
      two.jobs.every(
        (j, i) => !!j.ball && Math.abs(j.ball.t - [THROW, second][i].t) < 0.03
      ),
    two.jobs
      .map((j) => (j.ball ? `+${((j.ball.t - 0) * 1000).toFixed(0)}ms` : '-'))
      .join(', ')
  );
  const bounce: Throw = {
    t: 2.3,
    z0: 8,
    kmh: 30,
    X0: 0.05,
    Y0: 0.1,
    vx: 0,
    vy: 0,
    back: true,
  };
  const bounced = run({ throws: [THROW, bounce] }, { duration: 3.3, analyze: false });
  check(
    '네트에서 튀어 돌아오는 공(다가옴)은 세지 않는다',
    bounced.jobs.length === 1,
    `${bounced.jobs.length}번`
  );

  const app = new LiveMeter(W, H, 'approaching', { focalPx: FOCAL });
  let appCaptured = false;
  app.arm();
  for (let k = 0; k < 150; k++) {
    const t = (k + 0.5) / 60;
    for (const e of app.push({
      t,
      luma: frameAt(t, {
        throws: [{ t: 1.5, z0: 12, kmh: 110, X0: 0, Y0: 0, vx: 0, vy: 0, back: true }],
      }),
    }))
      if (e.kind === 'capture') appCaptured = true;
  }
  check("포수 뒤(다가옴)는 1.6.0 의 판단('motion')으로 담는다", appCaptured);
}

/* ───────────────────────── 5) 실제 영상(캐시가 있을 때만) ───────────────────────── */

const cacheArg = process.argv.find((a) => a.startsWith('--cache='))?.slice(8);
if (cacheArg && existsSync(cacheArg)) {
  console.log(
    '\n5) 실제 보정 영상 — 카메라처럼 흘려 넣기(스피드건 · 영상 파일 1.6.0 값과 견줌)'
  );
  /** 키 · 눈으로 정한 릴리스 장면(격자 번호) · 스피드건 · 영상 파일 1.6.0 릴리스 값 */
  const CLIPS = [
    { key: '017af066', rel: 23, gun: 96, file: 94.8 },
    { key: 'b3fb4050', rel: 22, gun: 109, file: 108 },
  ];
  for (const c of CLIPS) {
    const dir = join(cacheArg, c.key, 'w2');
    if (!existsSync(join(dir, 'raw.json'))) {
      console.log(`  (건너뜀 ${c.key} — 캐시 없음)`);
      continue;
    }
    const raw = JSON.parse(readFileSync(join(dir, 'raw.json'), 'utf8')) as {
      nSamples: number;
      labels: number[];
      period: number | null;
    };
    const luma = (k: number) => {
      const rgb = gunzipSync(readFileSync(join(dir, `f${k}.gz`)));
      const out = new Uint8Array(rgb.length / 3);
      for (let i = 0, j = 0; i < out.length; i++, j += 3)
        out[i] = (rgb[j] * 77 + rgb[j + 1] * 150 + rgb[j + 2] * 29 + 128) >> 8;
      return out;
    };
    const meter = new LiveMeter(W, H, 'receding', { focalPx: FOCAL });
    const jobs: CaptureJob[] = [];
    const take = (evs: MeterEvent[]) => {
      for (const e of evs)
        if (e.kind === 'capture') {
          jobs.push(e.job);
          meter.finish(false);
        }
    };
    take(meter.arm());
    const p = raw.period ?? 1 / 60;
    const first = luma(0);
    for (let q = 30; q >= 1; q--)
      take(meter.push({ t: raw.labels[0] - q * p, luma: first }));
    for (let k = 0; k < raw.nSamples; k++)
      take(meter.push({ t: raw.labels[k], luma: k ? luma(k) : first }));
    let t = raw.labels[raw.nSamples - 1];
    const last = luma(raw.nSamples - 1);
    for (let q = 0; q < 60 && meter.getStatus() === 'capturing'; q++)
      take(meter.push({ t: (t += p), luma: last }));
    const relT = (c.rel + 0.5) / 60;
    const job = jobs[0];
    check(
      `${c.key} — 릴리스 뒤 0~50ms 에 공으로 알아챈다`,
      jobs.length === 1 &&
        !!job.ball &&
        job.ball.t - relT >= -0.02 &&
        job.ball.t - relT <= 0.05,
      job?.ball ? `${((job.ball.t - relT) * 1000).toFixed(0)}ms` : '못 알아챔'
    );
    const res = job ? analyzeJob(job, CAMERA) : null;
    const rel = res?.release?.releaseKmh ?? null;
    check(
      `${c.key} — 영상 파일 값(${c.file})과 2km/h 안 · 스피드건 ${c.gun}`,
      rel != null && Math.abs(rel - c.file) <= 2,
      res?.measure.ok
        ? `릴리스 ${rel} ±${res.release?.errorKmh}`
        : `거부 ${res && !res.measure.ok ? res.measure.code : '-'}`
    );
  }
} else {
  console.log('\n5) 실제 보정 영상 — 건너뜀(--cache=<폴더> 를 주면 돈다)');
}

console.log(`\n${'═'.repeat(50)}\n통과 ${passed} / 실패 ${failed}`);
if (failed) process.exit(1);
