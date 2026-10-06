/**
 * 엔진 2.0 의 입구 — 장면들 + 사용자가 넣은 거리 → 구속.
 *
 * 1.x 는 공의 화면 지름으로 장면마다 거리를 쟀다(z = f·D/d). 공이 멀어지면 몇 px 로 작아져 1px 만 틀려도 10% 넘게 틀렸고,
 * 밖 · 그물 앞 영상에서는 지름 자체가 망가져 19개 중 하나도 못 쟀다(2026-10-07). 2.0 은 PitchLab · SmartScout 처럼 거리를
 * 경기장에서 얻는다: 공의 화면 자리에 물리 궤적을 맞춰 깊이의 '비율'을 얻고(trajectory-fit.ts), 공이 그물 · 미트에 닿은 때의
 * 깊이를 사용자가 넣은 거리(카메라 → 그물 · 미트)로 둬 크기를 정한다. 공 지름은 쓰지 않는다.
 *
 * 검증(2026-10-07, 아이폰 15 Pro Max 2배 · 60fps · 투수 뒤 · 포켓 레이더 19개, 앱 분석 해상도 720, 거리는 같은 장소 나머지 영상으로
 * 맞춤, 숙임은 장면에서 읽음): 밖 13개 모두 잼 · 평균 오차 1.1km/h(최대 2.3, 그물 밑으로 빠진 1개 빼고), 실내(포수 + 흰 천) 6개
 * 모두 잼 · 4개 ±5 안 · 2개 ±18(미트 앞 끝 판정). 같은 영상에서 1.8.1 은 0개. 합성 장면 셀프테스트(npm run velocity:engine2-test)
 * 빠른 공 · 띄운 공 · 숙임 ±0.7% 안, 흰 천 −2.3%. 절대 크기(넣은 거리 그대로 맞나)는 줄자로 잰 영상이 없어 확인 전이다 — 스피드건
 * 보정(×a+b)이 메운다.
 */
import type { AnalyzeResult, CapturedFrame, Approach } from './analyze-frames.ts';
import { BALL_DIAMETER_M, type BallObservation } from './geometry.ts';
import { reject, MAX_CAMERA_SHAKE_PX, MIN_PLAUSIBLE_KMH, MAX_PLAUSIBLE_KMH, type Confidence } from './validate.ts';
import { fitTrajectory, speedWithSe, trajectoryState, type PinholeCamera, type TrajectoryFit } from './trajectory-fit.ts';
import {
  blobTrack,
  consistentPrefix,
  extendRansac,
  findSeeds,
  medianBackground,
  pixelScale,
  toPoints,
  type FrameSet,
  type Seed,
  type TrackedBall,
} from './ball-track.ts';

export type DistanceInput = {
  frames: CapturedFrame[];
  /** 던지기 전 장면들(배경) — 없어도 된다(구간 장면의 중앙값) */
  backgroundSamples?: ArrayLike<number>[];
  /** 분석 해상도 · 원본 해상도 */
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  /** 초점거리(원본 px) — 줌 · 렌즈 보정을 반영한 것 */
  focalPx: number;
  /**
   * 투수 뒤: 카메라에서 공이 닿는 곳(그물 · 포수 미트)까지(m). 포수 뒤: 카메라에서 릴리스(투수 손)까지(m).
   * 2.0 의 거리 자는 이것 하나다 — 5% 틀리면 구속도 5% 틀린다.
   */
  distanceM: number;
  approach?: Approach;
  /** 투수 뒤: 카메라에서 릴리스 지점까지(m, 기본 1) — 릴리스 구속을 그 깊이까지 되돌린다 */
  releaseDistM?: number | null;
  /** 카메라가 아래로 숙인 각(라디안, 폰 기울기 센서) — 모르면 0 */
  tiltRad?: number | null;
  /** 초당 장면 수 — 모르면 장면 시각에서 */
  fps?: number | null;
  /** 판단(live-meter)이 본 첫 공 — 있으면 그 둘레에서 씨앗을 먼저 찾는다(분석 px) */
  seedHint?: { t: number; x?: number; y?: number } | null;
  /** 카메라 흔들림(분석 px) — 넘으면 거부 */
  shakePx?: number;
};

/** 2.0 이 덧붙이는 것 — 무엇으로 어떻게 쟀나(분석 JSON · 진단) */
export type DistanceReport = {
  method: 'distance';
  distanceM: number;
  tiltRad: number;
  /** 비행 끝을 무엇으로 정했나 — 'rebound' 맞고 튄 공의 줄과 만나는 때, 'end' 마지막 장면 반 장 뒤 */
  impact: 'rebound' | 'end';
  te: number | null;
  /** 비행 장면 수 · 그중 이어 찾기(RANSAC)로 더한 수 */
  flightFrames: number;
  extended: number;
  /** 화면 잔차 RMS(분석 px) */
  rmsPx: number | null;
  /** 3차원 속력 · 위아래를 뺀 수평 속력(km/h, 첫 장면 반 장 앞) */
  kmh3d: number | null;
  kmhHorizontal: number | null;
  /** 첫 장면의 깊이(m) — 카메라가 릴리스에서 얼마나 떨어졌나 */
  firstDepthM: number | null;
  /** 위로 던진 각(°) */
  launchDeg: number | null;
  /** 궤적을 릴리스(카메라 앞 releaseDistM)까지 되돌린 화면 자리(분석 px) — 투수 뒤만. 릴리스가 보이게 찍었으면 화면 안이다 */
  releasePx: [number, number] | null;
  /** 비행 끝 장면의 공 지름 ÷ 거리 D 에 있는 공의 지름(분석 px) — 덩어리 지름은 작은 공에서 20~35% 크게 잰다 */
  endSizeRatio: number | null;
  /** ln(지름) 을 ln(맞춘 깊이) 에 맞춘 기울기 — 공이면 −1 근처(멀어진 만큼 작아짐), 제자리 덩어리면 0 근처 */
  sizeSlope: number | null;
  /** 카메라 흔들림(분석 px, 귀퉁이 블록) · 문턱을 넘었나 — 넘어도 문턱 3배 안이면 재고 알린다 */
  shakePx: number;
  shaky: boolean;
  /** 씨앗 후보 수 · 고른 씨앗 장면 */
  seeds: number;
  seedFrame: number | null;
  timingMs: number;
};

export type DistanceResult = AnalyzeResult & { distance: DistanceReport };

/** 장면 시각 간격의 중앙값으로 잰 초당 장면 수 */
export function fpsOf(t: number[]): number | null {
  const g: number[] = [];
  for (let i = 1; i < t.length; i++) if (t[i] > t[i - 1]) g.push(t[i] - t[i - 1]);
  if (!g.length) return null;
  g.sort((a, b) => a - b);
  return 1 / g[g.length >> 1];
}

/** 배경으로 쓸 장면 — 던지기 전 장면(최대 8)과 구간 장면을 고르게(최대 13) */
function pickBackground(frames: CapturedFrame[], extra: ArrayLike<number>[]): ArrayLike<number>[] {
  const out: ArrayLike<number>[] = extra.slice(-8);
  const n = frames.length;
  const take = Math.min(13, n);
  for (let k = 0; k < take; k++) out.push(frames[Math.round((k * (n - 1)) / Math.max(1, take - 1))].luma);
  return out.length % 2 ? out : out.slice(1);
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * 투수 뒤(멀어지는 공) — 씨앗마다 이어 찾아 물리에 맞는 가장 긴 앞부분을 고른다. 공이면 지름이 두 배 넘게 줄고(멀어짐) 앞부분이
 * 길다. 판단이 본 공(seedHint)이 있으면 그 둘레(±0.1초) 씨앗을 먼저.
 */
function bestFlight(
  fs: FrameSet,
  bg: Uint8Array,
  cam: PinholeCamera,
  dt: number,
  distanceM: number,
  hint: DistanceInput['seedHint']
) {
  const s = pixelScale(fs);
  let hinted: Seed[] = [];
  if (hint) {
    const near = fs.t.map((t, i) => [t, i] as const).filter(([t]) => Math.abs(t - hint.t) <= 0.1);
    if (near.length) hinted = findSeeds(fs, bg, near[0][1], near[near.length - 1][1]);
  }
  /* 닫힌 함수 안에서 바꾸므로 null 로 좁혀지지 않게 단언으로 둔다 */
  let best = null as { seed: Seed; raw: TrackedBall[]; seg: ReturnType<typeof toPoints>; fit: TrajectoryFit } | null;
  const tryAll = (list: Seed[]) => {
    for (const seed of list.slice(0, 16)) {
      const raw = blobTrack(fs, bg, seed);
      if (raw.length < 8) continue;
      const inWin = toPoints(raw, s).filter((q) => q.t - raw[0].t <= 1.3);
      const pre = consistentPrefix(inWin, cam, dt, s, 8, distanceM);
      if (!pre) continue;
      const seg = pre.seg;
      const shrink = seg[0].diam / seg[seg.length - 1].diam;
      if (!(shrink >= 1.3)) continue;
      if (!best || seg.length > best.seg.length) best = { seed, raw, seg, fit: pre.fit };
      /* 충분히 긴 줄이면(0.25초 · 두 배 넘게 작아짐) 더 보지 않는다 — 이른 씨앗이 대개 그 공이다 */
      if (seg.length * Math.abs(dt) >= 0.25 && shrink >= 1.8) break;
    }
  };
  tryAll(hinted);
  let count = hinted.length;
  /* 힌트 둘레 씨앗이 비행이 안 되면 나머지 씨앗도 — 판단이 멀리서야 알아챈 공은 가까운 씨앗이 힌트 앞에 있다(실내 114) */
  if (!best) {
    const rest = findSeeds(fs, bg).filter((q) => !hinted.some((h) => h.i === q.i));
    count += rest.length;
    tryAll(rest);
  }
  return { best, seeds: count };
}

/**
 * 비행 끝(te) — 끝 뒤에 이어진 덩어리(맞고 튄 공)가 3장 넘게 2.5장 안에 있으면 그 줄(직선)과 궤적이 가장 가까워지는 때(마지막
 * 비행 장면과 첫 뒤 장면 사이), 아니면 마지막 장면 반 장 뒤.
 */
function impactTime(
  fit: TrajectoryFit,
  flight: TrackedBall[],
  post: TrackedBall[],
  dt: number
): { te: number; impact: 'rebound' | 'end' } {
  const tLast = flight[flight.length - 1].t;
  if (post.length >= 3 && post[0].t - tLast < 2.5 * dt) {
    const n = post.length;
    const mt = post.reduce((a, q) => a + q.t, 0) / n;
    const den = post.reduce((a, q) => a + (q.t - mt) ** 2, 0);
    const line = (key: 'u' | 'v') => {
      const m = post.reduce((a, q) => a + q[key], 0) / n;
      const b = den > 0 ? post.reduce((a, q) => a + (q.t - mt) * (q[key] - m), 0) / den : 0;
      return (t: number) => m + b * (t - mt);
    };
    const pu = line('u');
    const pv = line('v');
    let best: [number, number] | null = null;
    const span = post[0].t - tLast;
    for (let k = 0; k <= 40; k++) {
      const t = tLast + (span * k) / 40;
      const [u, v] = fit.project(t);
      const d = Math.hypot(u - pu(t), v - pv(t));
      if (!best || d < best[1]) best = [t, d];
    }
    if (best) return { te: best[0], impact: 'rebound' };
  }
  return { te: tLast + dt / 2, impact: 'end' };
}

export function analyzeByDistance(input: DistanceInput): DistanceResult {
  const t0 = now();
  const { frames, width, height, sourceWidth, sourceHeight } = input;
  const approach = input.approach ?? 'receding';
  const D = input.distanceM;
  const tilt = input.tiltRad ?? 0;
  const fs: FrameSet = { w: width, h: height, t: frames.map((f) => f.t), luma: frames.map((f) => f.luma) };
  const fps = input.fps && input.fps > 0 ? input.fps : (fpsOf(fs.t) ?? 60);
  const dt = 1 / fps;
  const s = pixelScale(fs);
  const kAnalyze = width / sourceWidth;
  const cam: PinholeCamera = { f: input.focalPx * kAnalyze, cx: width / 2, cy: height / 2 };
  const report: DistanceReport = {
    method: 'distance',
    distanceM: D,
    tiltRad: tilt,
    impact: 'end',
    te: null,
    flightFrames: 0,
    extended: 0,
    rmsPx: null,
    kmh3d: null,
    kmhHorizontal: null,
    firstDepthM: null,
    launchDeg: null,
    releasePx: null,
    endSizeRatio: null,
    sizeSlope: null,
    shakePx: Math.round((input.shakePx ?? 0) * 10) / 10,
    shaky: false,
    seeds: 0,
    seedFrame: null,
    timingMs: 0,
  };
  const base = {
    release: null,
    analyzeSize: { width, height },
    sourceSize: { width: sourceWidth, height: sourceHeight },
    fps,
    frameCount: frames.length,
    shakePx: input.shakePx ?? 0,
    focalPx: input.focalPx,
    diameter: {
      ruler: 'area' as const,
      seed: 0,
      kept: 0,
      drops: { bright: 0, limb: 0, guard: 0 },
      brightUsable: 0,
      limbPerArea: null,
      edgeWidthPx: null,
      blurCorrectionPx: 0,
      blurred: false,
      arcDrops: 0,
    },
  };
  const fail = (code: Parameters<typeof reject>[0], track: BallObservation[] = []): DistanceResult => {
    report.timingMs = Math.round(now() - t0);
    return { ...base, measure: { ok: false, ...reject(code) }, track, distance: report };
  };
  /*
   * 흔들림 — 문턱(1.x 와 같은 6, 분석 720 기준)의 3배를 넘으면 거부, 그 사이는 재고 알린다(사용자 규칙 2026-09-30: 실시간은 막지
   * 말고 알림). 실내 터널에서는 귀퉁이를 지나는 사람 · 포수 움직임도 문턱을 넘곤 했다(102).
   */
  const shakeLimit = MAX_CAMERA_SHAKE_PX * (width / 720);
  if ((input.shakePx ?? 0) > 3 * shakeLimit) return fail('CAMERA_SHAKE');
  report.shaky = (input.shakePx ?? 0) > shakeLimit;
  if (frames.length < 10 || !(D > 0)) return fail('NOT_ENOUGH_FRAMES');

  /* 다가오는 공(포수 뒤)은 시간을 거꾸로 놓고 같은 길로 찾는다 — 거꾸로 보면 공이 멀어지며 작아진다 */
  const order = approach === 'approaching' ? frames.map((_, i) => frames.length - 1 - i) : frames.map((_, i) => i);
  const fsOrdered: FrameSet = approach === 'approaching' ? { ...fs, t: order.map((i) => fs.t[i]), luma: order.map((i) => fs.luma[i]) } : fs;
  const bg = medianBackground(pickBackground(frames, input.backgroundSamples ?? []), width, height);
  const { best, seeds } = bestFlight(fsOrdered, bg, cam, approach === 'approaching' ? -dt : dt, D, input.seedHint ?? null);
  report.seeds = seeds;
  if (!best) return fail('NOT_ENOUGH_FRAMES');
  report.seedFrame = order[best.seed.i];
  /* 장면 번호를 원래 차례로 되돌린다 */
  const back = (o: TrackedBall): TrackedBall => ({ ...o, i: order[o.i] });

  let flight = best.seg.map((o) => ({ ...o }));
  let extended = 0;
  /*
   * 끝까지 이어 찾기(RANSAC) — 밖(그물)은 앞부분이 이미 맞은 자리까지 가서 덧붙는 것이 없고(19개 시험: 밖 13개 모두 0장), 실내(흰 천 ·
   * 포수 앞)는 놓친 뒤를 잇는다. 맞고 튄 덩어리로 끝을 판정해 건너뛰려 했더니 그물에 파고드는 공 · 덩어리 중심이 흔들리는 공에서
   * 판정이 갈려 오히려 나빴다 — 늘 돌린다.
   */
  /*
   * 잡힌 공 — 앞부분 끝의 공이 이미 거리 D 의 크기에 가깝고(덩어리 지름은 작은 공에서 20~35% 크게 잰다: 밖 그물 0.95~1.32배, 미트
   * 1.36배, 흰 천 앞에서 놓친 실내 공 2.0~2.4배) 바로 뒤 덩어리가 공이 갈 자리에서 커지면(미트 · 포수와 합쳐짐) 거기가 끝이다. 이어
   * 찾기는 미트 속 공을 따라가 끝을 0.1초 늦췄다(실내 102: −24km/h). 흰 천 앞 공은 윗부분이 천에 묻혀 작게 잡혀 D 크기처럼 보이기도
   * 한다 — 그때 커진 덩어리는 궤적에서 먼 딴 것이었다(실내 098: 34px).
   */
  const endO = flight[flight.length - 1];
  const dAtD = (cam.f * BALL_DIAMETER_M) / D;
  const near = (o: TrackedBall) => {
    const p = best.fit.project(o.t);
    return Math.hypot(p[0] - o.u, p[1] - o.v) <= Math.max(4 * s, 0.5 * endO.diam);
  };
  const caught =
    approach === 'receding' &&
    endO.diam <= 1.6 * dAtD &&
    best.raw.some(
      (o) => o.i > endO.i && o.i <= endO.i + Math.round((2 * fps) / 60) && o.diam >= 1.15 * endO.diam && near(o)
    );
  if (approach === 'receding' && !caught) {
    let ext = extendRansac(fsOrdered, flight, cam, fps, { dragScaleM: D });
    /*
     * 놓치기 직전 두 장은 공이 배경 띠 · 천 가장자리에 걸쳐 덩어리 중심이 치우친 때가 있다 — 그 두 점이 늘린 궤적을 비틀어 후보를
     * 못 찾았다(실내 098). 아무것도 못 더했으면 빼고 한 번 더.
     */
    /*
     * 받는 조건은 원래 끝보다 6장(60fps, 0.1초) 넘게 더 가는 것 — 밖 그물은 맞은 뒤 흔들리는 그물에서 우연한 점이 3~5장 이어지기도
     * 했다(132). 실내에서 놓친 공은 미트까지 8~14장을 더 간다.
     */
    if (!ext.added && flight.length > 10) {
      const ext2 = extendRansac(fsOrdered, flight.slice(0, -2), cam, fps, { dragScaleM: D });
      const beyond = ext2.pts[ext2.pts.length - 1].i - flight[flight.length - 1].i;
      /* 원래 끝 너머 부분도 75% 넘게 차야 한다 — 밖 그물에서 맞은 뒤 흔들림이 띄엄띄엄 이어진 것(129: 6장 중 4)을 거른다 */
      const endI = flight[flight.length - 1].i;
      const over = ext2.pts.filter((o) => o.i > endI).length;
      const dense = beyond > 0 && over / beyond >= 0.75;
      if (beyond >= Math.round((6 * fps) / 60) && dense) ext = ext2;
    }
    flight = ext.pts;
    extended = ext.added;
  }
  const flightReal = flight.map((o) => back(o)).sort((a, b) => a.t - b.t);
  const flightPts = toPoints(flightReal, s);
  const endI = approach === 'approaching' ? flightReal[0].i : flightReal[flightReal.length - 1].i;
  /* 끝 뒤 덩어리(맞고 튄 공)로 끝 시각을 정하는 것은 이어 찾기가 더한 것이 없을 때만 — 이어 찾은 끝 뒤의 덩어리는 엉뚱한 것이다 */
  const postReal = (extended ? [] : best.raw)
    .map(back)
    .filter((o) => (approach === 'approaching' ? o.i < endI && o.i >= endI - 6 : o.i > endI && o.i <= endI + Math.round((6 * fps) / 60)))
    .sort((a, b) => a.t - b.t)
    .slice(0, 4);

  /* 앞의 손 붙은 점을 한 번 더 걷고(4장까지) 끝을 정해 맞춘다 */
  const opts = { dragScaleM: D, tilt };
  let fit = fitTrajectory(flightPts, flightPts[flightPts.length - 1].t + dt / 2, cam, opts);
  let a = 0;
  while (a < 4 && fit.resid[a] > 3 * Math.max(0.5 * s, fit.rms) && fit.resid[a] > 2.5 * s) a++;
  const used = a ? flightPts.slice(a) : flightPts;
  if (used.length < 8) return fail('UNSTABLE_TRACK', obsOf(used));
  let te: number;
  if (approach === 'receding') {
    const imp = impactTime(fitTrajectory(used, used[used.length - 1].t + dt / 2, cam, opts), used, postReal, dt);
    te = imp.te;
    report.impact = imp.impact;
  } else {
    /* 다가오는 공: 크기 자는 릴리스 쪽 끝(시간상 첫 장면) — 거기서 사용자가 넣은 거리 */
    te = used[0].t - dt / 2;
  }
  fit = fitTrajectory(used, te, cam, opts);
  report.te = te;
  {
    const lastO = used[used.length - 1];
    report.endSizeRatio = Math.round((lastO.diam / ((cam.f * BALL_DIAMETER_M) / D)) * 100) / 100;
  }
  {
    const lz: number[] = [];
    const ld: number[] = [];
    /* 덩어리 점만 — 이어 찾은 테두리 점은 지름이 25% 작게 잡혀 기울기를 비튼다 */
    for (const o of used) {
      if (o.ring) continue;
      const z = fit.positionAt(o.t)[2];
      if (z > 0 && o.diam > 0) {
        lz.push(Math.log(z));
        ld.push(Math.log(o.diam));
      }
    }
    const n = lz.length;
    const mz = lz.reduce((a, x) => a + x, 0) / n;
    const md = ld.reduce((a, x) => a + x, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let k = 0; k < n; k++) {
      sxy += (lz[k] - mz) * (ld[k] - md);
      sxx += (lz[k] - mz) ** 2;
    }
    report.sizeSlope = n >= 3 && sxx > 0 ? Math.round((sxy / sxx) * 100) / 100 : null;
  }
  /*
   * 공인가 — 공이면 맞춘 깊이가 늘어난 만큼 지름이 줄어 기울기가 −1 근처다(밖 13개 −0.92 ~ −1.17, 실내 6개 −0.81 ~ −1.28: 자리만으로
   * 맞춘 깊이가 크기와 맞는다). 제자리에서 밝기만 바뀌는 덩어리 · 몸 · 그물은 0 근처이거나 −2 아래로 벗어난다(실내 111 투구 뒤 화면
   * 귀퉁이의 덩어리를 공으로 잡아 169.8km/h 를 냈다: −2.08). 공이 아니니 조용히 넘긴다(궤적을 안 넘긴다 — 화면이 '못 쟀어요'를
   * 말하지 않게).
   */
  if (report.sizeSlope != null && used.filter((o) => !o.ring).length >= 6 && (report.sizeSlope > -0.6 || report.sizeSlope < -1.6))
    return fail('UNSTABLE_TRACK');
  report.flightFrames = used.length;
  report.extended = extended;
  report.rmsPx = Math.round(fit.rms * 100) / 100;

  /* 속력 — 정규 단위 × D. 투수 뒤는 첫 장면 반 장 앞의 속력을 릴리스 깊이까지 되돌리고, 포수 뒤는 첫 장면(릴리스 쪽)에서 */
  const tFirst = used[0].t - dt / 2;
  const [vx, vy, vz] = fit.velocityAt(tFirst);
  const v3 = Math.hypot(vx, vy, vz) * D * 3.6;
  const up = -vy * Math.cos(tilt) - vz * Math.sin(tilt);
  const vh = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - up * up)) * D * 3.6;
  const zFirst = fit.positionAt(tFirst)[2] * D;
  report.kmh3d = round1(v3);
  report.kmhHorizontal = round1(vh);
  report.firstDepthM = round1(zFirst);
  report.launchDeg = round1((Math.atan2(up, Math.hypot(vx, vz)) * 180) / Math.PI);
  let tRel = tFirst;
  if (approach === 'receding') {
    const zRel = (input.releaseDistM ?? 1) / D;
    for (let k = 0; k < 150; k++) {
      const s2 = trajectoryState(fit.p, te, tRel - 0.002, opts);
      if (s2[2] <= zRel || s2[2] <= 0.01) break;
      tRel -= 0.002;
    }
    const [px, py, pz] = fit.positionAt(tRel);
    if (pz > 0) report.releasePx = [Math.round(cam.cx + (cam.f * px) / pz), Math.round(cam.cy + (cam.f * py) / pz)];
  }
  const sw = speedWithSe(fit, tRel, opts);
  /*
   * 대표 구속은 위아래를 뺀 수평 속력 — 스피드건(포켓 레이더)은 앞으로 가는 성분을 잰다. 띄워 던진 느린 공(10~14°)에서 3차원 속력과
   * 2~3% 갈렸고, 폰 기울기(숙임)를 넣고 수평 속력으로 견주면 밖 13개 평균 오차 2.2 → 1.1km/h(2026-10-07, 720). 낮게 던지는 투구는
   * 둘이 0.1% 안에서 같다.
   */
  const [rx, ry, rz] = fit.velocityAt(tRel);
  const upRel = -ry * Math.cos(tilt) - rz * Math.sin(tilt);
  const kmh = Math.sqrt(Math.max(0, rx * rx + ry * ry + rz * rz - upRel * upRel)) * D * 3.6;
  const track = obsOf(used);
  if (!(kmh >= MIN_PLAUSIBLE_KMH && kmh <= MAX_PLAUSIBLE_KMH)) return fail('IMPLAUSIBLE_SPEED', track);
  const durationSec = used[used.length - 1].t - used[0].t;
  if (durationSec < 0.15) return fail('TRAVEL_TOO_SHORT', track);

  /*
   * ± (90% 구간 = 1.645σ) — 넣은 거리 2%(줄자로 쟀다고 보고) · 모형 1.5%(19개 영상의 흩어짐) · 끝 시각 반 장(공이 그 사이 간
   * 거리 ÷ D) · 맞춤의 표준오차. 이어 찾기로 끝을 정했으면(포수 앞 · 흰 천) 끝이 몇 장 흔들려 3% 를 더한다(실내 5개 ±5%).
   */
  const relSe = sw.se != null && sw.speed > 0 ? sw.se / sw.speed : 0.02;
  const teRel = (0.5 * dt * Math.hypot(...fit.velocityAt(te))) / 1;
  const sigmaRel = Math.hypot(0.02, 0.015, teRel, relSe, extended ? 0.03 : 0, approach === 'approaching' ? 0.05 : 0, report.shaky ? 0.03 : 0);
  const errorKmh = 1.645 * sigmaRel * kmh;
  let confidence: Confidence = 'medium';
  if (approach === 'approaching' || extended > 0 || report.impact === 'end' || report.shaky) confidence = 'low';
  else if (used.length * dt >= 0.4 && fit.rms <= 1.2 * s) confidence = 'high';
  report.timingMs = Math.round(now() - t0);
  const kmhEnd = Math.hypot(...fit.velocityAt(used[used.length - 1].t)) * D * 3.6;
  return {
    ...base,
    measure: {
      ok: true,
      kmh: round1(kmh),
      errorKmh: round1(errorKmh),
      confidence,
      detail: {
        frames: used.length,
        fitQuality: Math.round(Math.max(0, 1 - fit.rms / (4 * s)) * 1000) / 1000,
        travelM: round1(Math.abs(fit.positionAt(used[used.length - 1].t)[2] - fit.positionAt(used[0].t)[2]) * D),
        releaseDistanceM: round1(fit.positionAt(tRel)[2] * D),
        durationSec: Math.round(durationSec * 1000) / 1000,
        startKmh: round1(v3),
        endKmh: round1(kmhEnd),
        startSeKmh: sw.se != null ? Math.round(sw.se * D * 3.6 * 100) / 100 : null,
        startT: tRel,
        startTrimmed: a,
        endTrimmed: 0,
        farTrimmed: 0,
        curvatureSigma: 0,
      },
    },
    track,
    distance: report,
  };
}

function obsOf(pts: { t: number; u: number; v: number; diam: number }[]): BallObservation[] {
  return pts.map((o) => ({ t: o.t, x: o.u, y: o.v, diameterPx: o.diam }));
}
