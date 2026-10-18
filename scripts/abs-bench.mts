/**
 * ABS 합성 시험대 — "통과 순간(깊이)을 얼마나 틀리나"를 숫자로.
 *
 *   npm run abs:bench               — 표
 *   npm run abs:bench -- --json     — 숫자만(전후 견주기)
 *   npm run abs:bench -- --n=300    — 시나리오마다 공 수(기본 120)
 *   npm run abs:bench -- --only=글자
 *
 * 진짜 3차원 궤적(중력 · 공기저항 · 회전 힘)을 투수 뒤 카메라(2배, f 2,790px, 1080×1920)에 60fps 로 비춰 공 중심 관측(픽셀 잡음)을 만들고,
 * 앱과 같은 궤적 맞추기(lib/velocity-engine/trajectory-fit.ts)로 되맞춘 뒤, 깊이 단서(σ_D)와 카메라 자세(보정 잡음)로 세상 미터로 옮겨
 * 판정 면 통과점을 구해 정답과 견준다. 공 찾기(덩어리 · 지름)는 여기서 안 본다 — 그것은 velocity-accuracy 가 보고, P4 실측이 본다.
 *
 * 채점: 좌우 · 높이 오차(cm) 평균 · p50 · p95, 통과 순간 오차(장면 수 RMS — P0 검문 ① 과 같은 양), 판정 일치 %, 경계 비율,
 * 보고한 σ 대비 실제 오차 비(1 근처면 σ 가 정직함). 가림(마지막 k 장면 없음) 시나리오는 외삽 오차.
 *
 * 투수 가림 연구(--occlusion): 팔로스루 투수 몸통이 존 가운데 · 날아가는 공을 가리는 장면 비율을 카메라 옆 비킴 0 · 0.5 · 1.0m 로.
 */
import { fitTrajectory, type FitOptions, type PinholeCamera, type TrackPoint } from '../lib/velocity-engine/trajectory-fit.ts';
import { behindPitcherPose, findCrossing, worldToCam, type Vec3 } from '../lib/abs/cross.ts';
import { judge } from '../lib/abs/judge.ts';
import { ballInZone, judgePlaneZ, zoneWorld } from '../lib/abs/zone.ts';
import { DEFAULT_BANDS, RULES, RUBBER_TO_APEX_M } from '../lib/abs/rules.ts';

const JSON_OUT = process.argv.includes('--json');
const N = Number(process.argv.find((a) => a.startsWith('--n='))?.split('=')[1] ?? 120);
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? '';
const OCCLUSION_ONLY = process.argv.includes('--occlusion');

/* ---------- 결정적 난수 ---------- */
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const uni = (a: number, b: number) => a + (b - a) * next();
  const gauss = () => {
    const u = Math.max(1e-12, next());
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, uni, gauss };
}

/* ---------- 물리(세상 좌표: x 1루 · y 위 · z 투수 쪽) ---------- */
const G = 9.81;
const K = 0.006;
type S = { p: Vec3; v: Vec3 };
function step(s: S, a: Vec3, dt: number): S {
  const sp = Math.hypot(s.v[0], s.v[1], s.v[2]);
  const acc: Vec3 = [a[0] - K * sp * s.v[0], a[1] - G - K * sp * s.v[1], a[2] - K * sp * s.v[2]];
  return {
    p: [s.p[0] + s.v[0] * dt + 0.5 * acc[0] * dt * dt, s.p[1] + s.v[1] * dt + 0.5 * acc[1] * dt * dt, s.p[2] + s.v[2] * dt + 0.5 * acc[2] * dt * dt],
    v: [s.v[0] + acc[0] * dt, s.v[1] + acc[1] * dt, s.v[2] + acc[2] * dt],
  };
}
const DT = 0.001;
/** 릴리스에서 z 가 zStop 밑으로 갈 때까지 적분 — 1ms 간격 자리표 */
function simulate(p0: Vec3, v0: Vec3, a: Vec3, zStop: number): S[] {
  const out: S[] = [{ p: p0, v: v0 }];
  let s = out[0];
  for (let i = 0; i < 2000 && s.p[2] > zStop; i++) {
    s = step(s, a, DT);
    out.push(s);
  }
  return out;
}
function stateAt(track: S[], t: number): S {
  const i = Math.min(track.length - 2, Math.max(0, Math.floor(t / DT)));
  const f = t / DT - i;
  const a = track[i];
  const b = track[i + 1];
  return {
    p: [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f, a.p[2] + (b.p[2] - a.p[2]) * f],
    v: a.v,
  };
}
/** z = zPlane 을 지나는 시각 · 자리(선형 보간) */
function planeCross(track: S[], zPlane: number): { t: number; p: Vec3 } | null {
  for (let i = 1; i < track.length; i++) {
    if (track[i].p[2] <= zPlane && track[i - 1].p[2] > zPlane) {
      const f = (track[i - 1].p[2] - zPlane) / (track[i - 1].p[2] - track[i].p[2]);
      const a = track[i - 1].p;
      const b = track[i].p;
      return { t: (i - 1 + f) * DT, p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, zPlane] };
    }
  }
  return null;
}
/** 목표점(zPlane 의 x · y)에 닿게 처음 속도 방향을 맞춘다(속력 고정, 4번 고침) */
function aim(p0: Vec3, speed: number, target: Vec3, a: Vec3, zStop: number): S[] {
  let dir: Vec3 = [target[0] - p0[0], target[1] - p0[1], target[2] - p0[2]];
  for (let it = 0; it < 5; it++) {
    const n = Math.hypot(...dir);
    const v0: Vec3 = [(dir[0] / n) * speed, (dir[1] / n) * speed, (dir[2] / n) * speed];
    const tr = simulate(p0, v0, a, zStop);
    const c = planeCross(tr, target[2]);
    if (!c) break;
    dir = [dir[0] + (target[0] - c.p[0]) * 0.9, dir[1] + (target[1] - c.p[1]) * 0.9, dir[2]];
    if (it === 4) return tr;
  }
  const n = Math.hypot(...dir);
  return simulate(p0, [(dir[0] / n) * speed, (dir[1] / n) * speed, (dir[2] / n) * speed], a, zStop);
}

/* ---------- 카메라 ---------- */
const CAM: PinholeCamera = { f: 2790, cx: 540, cy: 960 };
const FPS = 60;
const MITT_Z = -0.55;

type Scenario = {
  name: string;
  /** 카메라 옆 비킴(m, +x) · 투수판 뒤(m) · 높이(m) */
  offsetX: number;
  back: number;
  camH: number;
  /** 깊이 단서 σ(m) */
  sigmaD: number;
  /** 공 중심 픽셀 잡음 σ(원본 px) */
  pxSigma: number;
  /** 플레이트 앞 가림 — 마지막 k 장면을 뺀다 */
  dropLast?: number;
  /** 보정 잡음(각 px · 자리 m) */
  calibPx?: number;
  calibPosM?: number;
  /** 궤적 맞추기에 쓰는 거리(공기저항 배율)도 D 추정값 */
};

const BASE = { back: 4, camH: 1.4, calibPx: 0.5, calibPosM: 0.03 };
const SCENARIOS: Scenario[] = [
  { name: '옆 0.5m · σD 0 · 잡음 0(바닥)', offsetX: 0.5, sigmaD: 0, pxSigma: 0.05, ...BASE, calibPx: 0, calibPosM: 0 },
  { name: '옆 0.5m · σD 0.1 · 깨끗', offsetX: 0.5, sigmaD: 0.1, pxSigma: 0.5, ...BASE },
  { name: '축 위 · σD 0.15 · 깨끗', offsetX: 0, sigmaD: 0.15, pxSigma: 0.5, ...BASE },
  { name: '축 위 · σD 0.3 · 보통', offsetX: 0, sigmaD: 0.3, pxSigma: 0.8, ...BASE },
  { name: '축 위 · σD 0.5 · 나쁨', offsetX: 0, sigmaD: 0.5, pxSigma: 1.2, ...BASE },
  { name: '옆 0.5m · σD 0.15 · 깨끗', offsetX: 0.5, sigmaD: 0.15, pxSigma: 0.5, ...BASE },
  { name: '옆 0.5m · σD 0.3 · 보통', offsetX: 0.5, sigmaD: 0.3, pxSigma: 0.8, ...BASE },
  { name: '옆 0.5m · σD 0.5 · 나쁨', offsetX: 0.5, sigmaD: 0.5, pxSigma: 1.2, ...BASE },
  { name: '옆 1.0m · σD 0.15 · 깨끗', offsetX: 1.0, sigmaD: 0.15, pxSigma: 0.5, ...BASE },
  { name: '옆 1.0m · σD 0.3 · 보통', offsetX: 1.0, sigmaD: 0.3, pxSigma: 0.8, ...BASE },
  { name: '옆 1.0m · σD 0.5 · 나쁨', offsetX: 1.0, sigmaD: 0.5, pxSigma: 1.2, ...BASE },
  { name: '옆 0.5m · 보통 · 가림 2장(외삽)', offsetX: 0.5, sigmaD: 0.3, pxSigma: 0.8, dropLast: 2, ...BASE },
  { name: '옆 0.5m · 보통 · 가림 4장(외삽)', offsetX: 0.5, sigmaD: 0.3, pxSigma: 0.8, dropLast: 4, ...BASE },
  { name: '옆 0.5m · 보통 · 보정 나쁨(1.5px · 10cm)', offsetX: 0.5, sigmaD: 0.3, pxSigma: 0.8, ...BASE, calibPx: 1.5, calibPosM: 0.1 },
  { name: '옆 0.5m · 깊이 모름(σD 1.0)', offsetX: 0.5, sigmaD: 1.0, pxSigma: 0.8, ...BASE },
];

type PitchResult = {
  errX: number;
  errY: number;
  errFrames: number;
  sigX: number;
  sigY: number;
  agree: boolean;
  borderline: boolean;
  trueStrike: boolean;
  ok: boolean;
};

const rule = RULES['kbo-2025'];

function runScenario(sc: Scenario, n: number, seed: number): PitchResult[] {
  const r = rng(seed);
  const out: PitchResult[] = [];
  for (let i = 0; i < n; i++) {
    const heightCm = r.uni(160, 190);
    const box = zoneWorld(heightCm, rule);
    const zPlane = judgePlaneZ(box, rule);
    /* 투구 — 우투 · 좌투 섞음, 90~150km/h, 목표는 존 둘레 ±0.35m(경계 공이 많이 나오게) */
    const hand = r.next() < 0.75 ? 1 : -1;
    const speed = r.uni(90, 150) / 3.6;
    const release: Vec3 = [hand * r.uni(0.2, 0.55), r.uni(1.6, 2.05), RUBBER_TO_APEX_M - r.uni(1.3, 1.9)];
    const target: Vec3 = [
      r.uni(box.left - 0.35, box.right + 0.35),
      r.uni(box.bottom - 0.3, box.top + 0.3),
      zPlane,
    ];
    /* 회전 힘(m/s²) — 옆 ±3 · 위 −2~+6(라이징 패스트볼 ~ 커브) */
    const spin: Vec3 = [r.uni(-3, 3), r.uni(-2, 6), 0];
    const track = aim(release, speed, target, spin, MITT_Z);
    const truth = planeCross(track, zPlane);
    if (!truth) continue;
    const tEnd = (track.length - 1) * DT;

    /* 카메라 자세 — 플레이트 위 1m 를 보게 숙이고 돌림 */
    const camPos: Vec3 = [sc.offsetX, sc.camH, RUBBER_TO_APEX_M + sc.back];
    const tilt = Math.atan2(sc.camH - 1.0, camPos[2]);
    const yaw = Math.atan2(-sc.offsetX, camPos[2]);
    const truePose = behindPitcherPose(camPos, tilt, yaw);
    /*
     * 보정으로 안 자세 — 플레이트 모서리 픽셀 잡음은 각 오차(px/f)로 나타난다. 카메라 자리의 좌우 · 위아래 오차는 플레이트가 제자리에 비치도록
     * 회전이 보상하므로 플레이트 근처 점에는 각 오차만 남는다. 거리(깊이) 오차 dz 는 남는데, 깊이 단서(플레이트 폭 · 포수 발)도 같은 보정에서
     * 나와 같은 쪽으로 틀린다 — 그래서 D 에도 같은 dz 를 더한다(시차 단서는 아니지만 1차 모형).
     */
    const dAng = (sc.calibPx ?? 0) / CAM.f;
    const dz = r.gauss() * (sc.calibPosM ?? 0);
    const estPose = behindPitcherPose([camPos[0], camPos[1], camPos[2] + dz], tilt + r.gauss() * dAng, yaw + r.gauss() * dAng);

    /* 관측 — 릴리스 뒤 손을 떠난 첫 장면부터 미트까지, 60fps, 임의 위상 */
    const phase = r.next() / FPS;
    const times: number[] = [];
    for (let t = 0.03 + phase; t < tEnd; t += 1 / FPS) times.push(t);
    const kept = sc.dropLast ? times.slice(0, Math.max(6, times.length - sc.dropLast)) : times;
    const pts: TrackPoint[] = kept.map((t) => {
      const pc = worldToCam(stateAt(track, t).p, truePose);
      return {
        t,
        u: CAM.cx + (CAM.f * pc[0]) / pc[2] + r.gauss() * sc.pxSigma,
        v: CAM.cy + (CAM.f * pc[1]) / pc[2] + r.gauss() * sc.pxSigma,
        sigma: sc.pxSigma,
        diam: (CAM.f * 0.073) / pc[2],
      };
    });
    if (pts.length < 6) continue;
    /* te = 마지막 관측 반 장 뒤(엔진처럼), 그때의 진짜 깊이에 단서 잡음 */
    const te = kept[kept.length - 1] + 0.5 / FPS;
    const Dtrue = worldToCam(stateAt(track, Math.min(te, tEnd)).p, truePose)[2];
    const D = Dtrue + dz + r.gauss() * sc.sigmaD;
    const opts: FitOptions = { dragScaleM: D, tilt };
    let fit;
    try {
      fit = fitTrajectory(pts, te, CAM, opts);
    } catch {
      out.push({ errX: NaN, errY: NaN, errFrames: NaN, sigX: NaN, sigY: NaN, agree: false, borderline: false, trueStrike: false, ok: false });
      continue;
    }
    const c = findCrossing(fit, opts, D, sc.sigmaD, estPose, zPlane, kept);
    const trueStrike = ballInZone(truth.p[0], truth.p[1], box, rule);
    if (c.t == null) {
      out.push({ errX: NaN, errY: NaN, errFrames: NaN, sigX: NaN, sigY: NaN, agree: false, borderline: false, trueStrike, ok: false });
      continue;
    }
    const v = judge(c, box, rule, DEFAULT_BANDS);
    out.push({
      errX: (c.point[0] - truth.p[0]) * 100,
      errY: (c.point[1] - truth.p[1]) * 100,
      errFrames: (c.t - truth.t) * FPS,
      sigX: c.sigmaX * 100,
      sigY: c.sigmaY * 100,
      agree: (v.call === 'strike') === trueStrike,
      borderline: v.borderline,
      trueStrike,
      ok: true,
    });
  }
  return out;
}

function q(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const rms = (xs: number[]) => (xs.length ? Math.sqrt(mean(xs.map((x) => x * x))) : NaN);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '-');

type Summary = {
  name: string;
  n: number;
  failed: number;
  lat: { mean: number; p50: number; p95: number };
  ver: { mean: number; p50: number; p95: number; bias: number };
  framesRms: number;
  agreePct: number;
  borderlinePct: number;
  /** 실제 오차 RMS ÷ 보고한 σ 평균 — 1 근처면 정직 */
  sigRatioX: number;
  sigRatioY: number;
};

function summarize(name: string, rs: PitchResult[]): Summary {
  const ok = rs.filter((x) => x.ok);
  const ax = ok.map((x) => Math.abs(x.errX));
  const ay = ok.map((x) => Math.abs(x.errY));
  return {
    name,
    n: rs.length,
    failed: rs.length - ok.length,
    lat: { mean: mean(ax), p50: q(ax, 0.5), p95: q(ax, 0.95) },
    ver: { mean: mean(ay), p50: q(ay, 0.5), p95: q(ay, 0.95), bias: mean(ok.map((x) => x.errY)) },
    framesRms: rms(ok.map((x) => x.errFrames)),
    agreePct: (100 * ok.filter((x) => x.agree).length) / Math.max(1, ok.length),
    borderlinePct: (100 * ok.filter((x) => x.borderline).length) / Math.max(1, ok.length),
    sigRatioX: rms(ok.map((x) => x.errX)) / mean(ok.map((x) => x.sigX)),
    sigRatioY: rms(ok.map((x) => x.errY)) / mean(ok.map((x) => x.sigY)),
  };
}

/* ---------- 투수 가림 연구 ---------- */
type Occlusion = { offsetX: number; zoneCenterPct: number; ballPct: number };
function occlusionStudy(): Occlusion[] {
  const r = rng(7);
  const out: Occlusion[] = [];
  for (const offsetX of [0, 0.5, 1.0]) {
    let zoneOcc = 0;
    let ballOcc = 0;
    let frames = 0;
    let ballFrames = 0;
    for (let i = 0; i < 200; i++) {
      const hand = r.next() < 0.75 ? 1 : -1;
      const camPos: Vec3 = [offsetX, 1.4, RUBBER_TO_APEX_M + 4];
      const box = zoneWorld(175, rule);
      const zoneC: Vec3 = [0, (box.top + box.bottom) / 2, box.zMid];
      const speed = r.uni(100, 140) / 3.6;
      const release: Vec3 = [hand * 0.4, 1.85, RUBBER_TO_APEX_M - 1.6];
      const track = aim(release, speed, [r.uni(-0.3, 0.3), r.uni(0.4, 1.1), box.zMid], [0, 2, 0], MITT_Z);
      const tEnd = (track.length - 1) * DT;
      /* 몸통 상자: 릴리스 뒤 0.45초 동안 z 17.0 → 16.1, x 는 글러브 쪽(−hand)으로 0.1 → 0.6, 높이 0.8~1.75 → 0.7~1.45(숙임), 폭 0.55 */
      for (let t = 0; t < 0.5; t += 1 / FPS) {
        const k = Math.min(1, t / 0.45);
        const torso = {
          x: hand * 0.1 - hand * 0.5 * k,
          z: RUBBER_TO_APEX_M - 1.4 - 0.9 * k,
          yLo: 0.8 - 0.1 * k,
          yHi: 1.75 - 0.3 * k,
          halfW: 0.275,
        };
        const occludes = (target: Vec3): boolean => {
          if (target[2] >= torso.z) return false;
          const f = (camPos[2] - torso.z) / (camPos[2] - target[2]);
          const x = camPos[0] + (target[0] - camPos[0]) * f;
          const y = camPos[1] + (target[1] - camPos[1]) * f;
          return Math.abs(x - torso.x) <= torso.halfW && y >= torso.yLo && y <= torso.yHi;
        };
        frames++;
        if (occludes(zoneC)) zoneOcc++;
        if (t + 0.03 < tEnd) {
          ballFrames++;
          if (occludes(stateAt(track, t + 0.03).p)) ballOcc++;
        }
      }
    }
    out.push({ offsetX, zoneCenterPct: (100 * zoneOcc) / frames, ballPct: (100 * ballOcc) / ballFrames });
  }
  return out;
}

/* ---------- 실행 ---------- */
const t0 = Date.now();
const occ = occlusionStudy();
const summaries: Summary[] = OCCLUSION_ONLY
  ? []
  : SCENARIOS.filter((s) => !ONLY || s.name.includes(ONLY)).map((s, i) => summarize(s.name, runScenario(s, N, 1000 + i)));
const ms = Date.now() - t0;

if (JSON_OUT) {
  console.log(JSON.stringify({ n: N, scenarios: summaries, occlusion: occ, ms }, null, 1));
} else {
  console.log(`ABS 합성 시험대 — 시나리오마다 ${N}구, ${(ms / 1000).toFixed(1)}초`);
  console.log(
    '시나리오'.padEnd(34) +
      '실패 ' +
      '좌우 평균/p50/p95(cm) '.padEnd(24) +
      '높이 평균/p50/p95(cm) 치우침 '.padEnd(30) +
      '통과 장면 RMS  일치%  경계%  σ비 x/y'
  );
  for (const s of summaries) {
    console.log(
      s.name.padEnd(34) +
        String(s.failed).padStart(3) +
        '  ' +
        `${f1(s.lat.mean)} / ${f1(s.lat.p50)} / ${f1(s.lat.p95)}`.padEnd(24) +
        `${f1(s.ver.mean)} / ${f1(s.ver.p50)} / ${f1(s.ver.p95)}  ${s.ver.bias >= 0 ? '+' : ''}${f1(s.ver.bias)}`.padEnd(30) +
        `${f2(s.framesRms)}장`.padEnd(14) +
        `${f1(s.agreePct)}`.padStart(5) +
        `${f1(s.borderlinePct)}`.padStart(7) +
        `  ${f2(s.sigRatioX)} / ${f2(s.sigRatioY)}`
    );
  }
  console.log('\n투수 몸통 가림(팔로스루 0.45초, 200구) — 카메라 옆 비킴별 가려진 장면 비율');
  for (const o of occ)
    console.log(`  옆 ${o.offsetX.toFixed(1)}m: 존 가운데 ${o.zoneCenterPct.toFixed(0)}% · 날아가는 공 ${o.ballPct.toFixed(0)}%`);
  console.log(
    '\n검문 1 기준(보통 조건): 좌우 p95 ≤ 2cm · 높이 p95 ≤ 3cm · 통과 장면 RMS < 0.3장. 공 찾기 오차 · 실제 깊이 단서 σ 는 여기 없다(P0 촬영 · P4 실측).'
  );
}
