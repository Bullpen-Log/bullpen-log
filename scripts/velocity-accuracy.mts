/**
 * 구속 측정 정확도 시험대.
 *
 *   npm run velocity:accuracy            — 표를 찍는다
 *   npm run velocity:accuracy -- --json  — 숫자만(JSON) 찍는다(엔진을 고치기 전후 견줄 때)
 *
 * 진짜 구속을 아는 공을 프레임으로 **그려서**(가장자리 번짐 · 초점 흐림 · 모션 블러 · 센서 잡음 ·
 * 자동 노출 변화 · 배경 무늬 · 릴리스가 가운데서 벗어남 · 옆으로 흐름 · 공기저항) 엔진 전체
 * (배경 → 감지 → 추적 → 거리 → 맞춤 → 릴리스 추정)를 돌리고, 나온 값과 정답의 차이를 잰다.
 *
 * velocity-selftest 는 '관측(지름 · 시각)이 주어졌을 때 계산이 맞나'를 보고, velocity-detect-test 는
 * '규칙에 논리 오류가 없나'를 본다. 여기는 그 사이 — 실제 촬영에 가까운 그림에서 **얼마나** 틀리나를
 * 재서, 엔진을 고칠 때 좋아졌는지 나빠졌는지 숫자로 본다. 실제 스피드건 대조는 이걸로 대신 못 한다.
 *
 * 채점:
 *   avgErr  — 엔진의 구간 평균 구속 − 그 구간의 진짜 평균 구속(엔진이 쓴 거리 구간으로 계산)
 *   relErr  — 엔진의 릴리스 추정 − 진짜 릴리스 구속(v0)
 *   reject  — 숫자를 안 낸 비율
 */
import {
  analyzeFrames,
  type CapturedFrame,
} from '../lib/velocity-engine/analyze-frames.ts';
import { BALL_DIAMETER_M, focalPxFromFov } from '../lib/velocity-engine/geometry.ts';

const JSON_OUT = process.argv.includes('--json');
const SEEDS = Number(
  process.argv.find((a) => a.startsWith('--seeds='))?.split('=')[1] ?? 6
);
/** --only=글자 — 이름에 그 글자가 든 시나리오만(엔진을 고치며 빨리 돌려 볼 때) */
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? '';
/** --diag — 첫 씨앗에서 프레임마다 잰 지름 ÷ 진짜 지름을 크기 구간별로 찍는다(지름 치우침 찾기) */
const DIAG = process.argv.includes('--diag');

/** 공기저항 — 감속 a = K v² (m/s², v 는 m/s). 야구공(C_d≈0.35, 145g, 지름 7.3cm)이면 K≈0.006/m */
const DRAG_K = 0.006;

type Scenario = {
  name: string;
  kmh: number;
  fps: number;
  /** 원본 해상도 — 가로 · 세로(세로 촬영이면 1080×1920) */
  source: { w: number; h: number };
  releaseM?: number;
  /** 릴리스가 가운데서 벗어난 정도(원본 픽셀) */
  offsetPx?: { x: number; y: number };
  /** 옆으로 흐르는 속도(m/s) — 카메라 축과 비행 방향의 각도 */
  lateralMps?: { x: number; y: number };
  /** 공 밝기(0~255) — 배경은 90~115 */
  ball?: number;
  /** 초점 흐림(분석 해상도 픽셀, 가우스 σ) */
  blur?: number;
  /** 노출 시간 동안의 번짐 — true 면 셔터 1/(2·fps) 로 옆 움직임을 평균 */
  motionBlur?: boolean;
  /** 센서 잡음 σ */
  noise?: number;
  /** 자동 노출 — 공이 나타난 뒤 프레임마다 배경이 이만큼 밝아진다(누적, 0~255) */
  exposureDrift?: number;
  /** 카메라 흔들림(분석 픽셀) — 프레임마다 배경을 이만큼 옮긴다 */
  shakePx?: number;
  /** 엔진이 가정하는 화각과 다른 실제 화각 — 렌즈 오차 */
  trueFovDeg?: number;
  approach?: 'receding' | 'approaching';
  /** 다가오는 공이 시작하는 거리(m) — 포수 뒤. 릴리스 거리로도 엔진에 준다 */
  startM?: number;
  /** 렌즈 보정을 한 경우 — 엔진에 실제 초점거리를 준다(화각 가정 대신) */
  calibrated?: boolean;
};

const LANDSCAPE = { w: 1920, h: 1080 };
const PORTRAIT = { w: 1080, h: 1920 };
const ENGINE_FOV = 69;

const SCENARIOS: Scenario[] = [
  { name: '기본 240fps 130km/h 세로', kmh: 130, fps: 240, source: PORTRAIT },
  { name: '기본 120fps 130km/h', kmh: 120, fps: 120, source: PORTRAIT },
  { name: '기본 60fps 130km/h', kmh: 130, fps: 60, source: PORTRAIT },
  { name: '느린 공 90km/h 120fps', kmh: 90, fps: 120, source: PORTRAIT },
  { name: '빠른 공 155km/h 240fps', kmh: 155, fps: 240, source: PORTRAIT },
  { name: '가로 1080p 240fps', kmh: 130, fps: 240, source: LANDSCAPE },
  {
    name: '릴리스 벗어남 200px · 옆으로 흐름',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    offsetPx: { x: 160, y: -120 },
    lateralMps: { x: 1.5, y: -1.0 },
  },
  { name: '어두운 공(대비 낮음)', kmh: 130, fps: 240, source: PORTRAIT, ball: 165 },
  { name: '초점 흐림 σ1.5', kmh: 130, fps: 240, source: PORTRAIT, blur: 1.5 },
  {
    name: '모션 블러 + 옆 흐름',
    kmh: 130,
    fps: 120,
    source: PORTRAIT,
    motionBlur: true,
    lateralMps: { x: 2.5, y: 0.5 },
  },
  { name: '센서 잡음 σ6', kmh: 130, fps: 240, source: PORTRAIT, noise: 6 },
  {
    name: '자동 노출 변화(프레임당 +1.5)',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    exposureDrift: 1.5,
  },
  { name: '멀리서 릴리스 2.2m', kmh: 130, fps: 240, source: PORTRAIT, releaseM: 2.2 },
  {
    name: '화각 오차(실제 63°, 가정 69°)',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    trueFovDeg: 63,
  },
  {
    name: '화각 오차 63° + 렌즈 보정',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    trueFovDeg: 63,
    calibrated: true,
  },
  {
    name: '포수 뒤(다가옴) 240fps',
    kmh: 130,
    fps: 240,
    source: PORTRAIT,
    approach: 'approaching',
    startM: 14,
  },
  {
    name: '모두 섞임(현실)',
    kmh: 135,
    fps: 240,
    source: PORTRAIT,
    offsetPx: { x: 80, y: -60 },
    lateralMps: { x: 1, y: -0.6 },
    ball: 200,
    blur: 0.8,
    motionBlur: true,
    noise: 3,
    exposureDrift: 0.5,
  },
];

/* ─────────────────────────── 그리기 ─────────────────────────── */

const ANALYZE_SHORT_SIDE = 720;

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 미리 뽑아 둔 정규 잡음 65536개 — 프레임마다 백만 픽셀에 gaussian() 을 부르면 몇 분이 걸린다 */
const NOISE_POOL = (() => {
  const r = makeRandom(4242);
  const pool = new Float32Array(65536);
  for (let i = 0; i < pool.length; i++) pool[i] = gaussian(r);
  return pool;
})();
/** 프레임에 잡음을 더한다 — 시작 위치만 씨앗에서 뽑아 표를 돌려 쓴다 */
function addNoise(luma: Float32Array, sigma: number, start: number) {
  if (!sigma) return;
  let j = start & 0xffff;
  for (let k = 0; k < luma.length; k++) {
    const v = luma[k] + NOISE_POOL[j] * sigma;
    luma[k] = v < 0 ? 0 : v > 255 ? 255 : v;
    j = (j + 1) & 0xffff;
  }
}

/** 배경 — 회색 무늬(위치마다 조금 다름). 흔들림은 x 방향으로 밀어 그린다 */
const BG_CACHE = new Map<string, Float32Array>();
function background(width: number, height: number, shiftX: number): Float32Array {
  const key = `${width}x${height}@${shiftX.toFixed(2)}`;
  const cached = BG_CACHE.get(key);
  if (cached) return new Float32Array(cached);
  const made = backgroundRaw(width, height, shiftX);
  if (shiftX === 0) BG_CACHE.set(key, made);
  return new Float32Array(made);
}
function backgroundRaw(width: number, height: number, shiftX: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x + shiftX;
      out[y * width + x] =
        90 + ((sx * 7 + y * 13) % 25) + 4 * Math.sin(sx / 17) * Math.cos(y / 23);
    }
  }
  return out;
}

/**
 * 공 — 가장자리는 부분 덮임(3×3 표본)으로 부드럽게, 옵션으로 초점 흐림 · 모션 블러.
 * 모션 블러는 셔터가 열린 동안 공이 옆으로 움직인 자리들을 평균한다(공의 크기 변화는 작아 무시).
 */
function drawBall(
  luma: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  diameter: number,
  brightness: number,
  blurSigma: number,
  smear: { dx: number; dy: number } | null,
  /** 원근 타원 — 화면 중심(분석 픽셀)과 초점거리(분석 픽셀). 가운데서 벗어난 공은 시선 방향으로 1/cosθ 늘어난다 */
  ellipse: { cx: number; cy: number; focalPx: number } | null = null
) {
  const r = diameter / 2;
  /* 타원 축 — u 는 화면 중심에서 공으로 향하는 단위 벡터, 그 방향 반지름이 r/cosθ */
  let ux = 1;
  let uy = 0;
  let ra = r;
  if (ellipse) {
    const dx = cx - ellipse.cx;
    const dy = cy - ellipse.cy;
    const rr = Math.hypot(dx, dy);
    if (rr > 1e-6) {
      ux = dx / rr;
      uy = dy / rr;
      const cos = ellipse.focalPx / Math.hypot(ellipse.focalPx, rr);
      ra = r / cos;
    }
  }
  const inside = (px: number, py: number, ox: number, oy: number) => {
    const ex = px - ox;
    const ey = py - oy;
    const pu = ex * ux + ey * uy;
    const pv = -ex * uy + ey * ux;
    return (pu * pu) / (ra * ra) + (pv * pv) / (r * r) <= 1;
  };
  const pad = Math.ceil(
    Math.max(r, ra) + 3 * blurSigma + (smear ? Math.hypot(smear.dx, smear.dy) : 0) + 2
  );
  const x0 = Math.max(0, Math.floor(cx - pad));
  const x1 = Math.min(width - 1, Math.ceil(cx + pad));
  const y0 = Math.max(0, Math.floor(cy - pad));
  const y1 = Math.min(height - 1, Math.ceil(cy + pad));
  const steps = smear ? 6 : 1;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const cover = new Float32Array(w * h);

  for (let s = 0; s < steps; s++) {
    const f = steps === 1 ? 0 : s / (steps - 1) - 0.5;
    const ox = cx + (smear ? smear.dx * f : 0);
    const oy = cy + (smear ? smear.dy * f : 0);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let insideN = 0;
        for (let sy = 0; sy < 3; sy++) {
          for (let sx = 0; sx < 3; sx++) {
            const px = x + (sx + 0.5) / 3 - 0.5;
            const py = y + (sy + 0.5) / 3 - 0.5;
            if (inside(px, py, ox, oy)) insideN++;
          }
        }
        cover[(y - y0) * w + (x - x0)] += insideN / 9 / steps;
      }
    }
  }

  let field = cover;
  if (blurSigma > 0) {
    const k = Math.ceil(3 * blurSigma);
    const kernel: number[] = [];
    let sum = 0;
    for (let i = -k; i <= k; i++) {
      const v = Math.exp(-(i * i) / (2 * blurSigma * blurSigma));
      kernel.push(v);
      sum += v;
    }
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -k; i <= k; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i));
          acc += cover[y * w + xx] * kernel[i + k];
        }
        tmp[y * w + x] = acc / sum;
      }
    field = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -k; i <= k; i++) {
          const yy = Math.min(h - 1, Math.max(0, y + i));
          acc += tmp[yy * w + x] * kernel[i + k];
        }
        field[y * w + x] = acc / sum;
      }
  }

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = field[(y - y0) * w + (x - x0)];
      if (c <= 0) continue;
      const i = y * width + x;
      luma[i] = luma[i] * (1 - c) + brightness * c;
    }
  }
}

/* ─────────────────────────── 한 번 던지기 ─────────────────────────── */

type Outcome =
  | { ok: true; avgErr: number; relErr: number; frames: number; conf: string }
  | { ok: false; code: string };

function throwOnce(sc: Scenario, seed: number): Outcome {
  const rand = makeRandom(seed * 7919 + 17);
  const { w: sw, h: sh } = sc.source;
  const scale = Math.min(1, ANALYZE_SHORT_SIDE / Math.min(sw, sh));
  const width = Math.round(sw * scale);
  const height = Math.round(sh * scale);
  const longSide = Math.max(sw, sh);
  const trueFocal = focalPxFromFov(longSide, sc.trueFovDeg ?? ENGINE_FOV);
  const approach = sc.approach ?? 'receding';

  const v0 = sc.kmh / 3.6;
  const dt = 1 / sc.fps;
  const z0 = approach === 'receding' ? (sc.releaseM ?? 1.2) : (sc.startM ?? 14);
  const ball = sc.ball ?? 235;
  const noise = sc.noise ?? 2;
  const blur = sc.blur ?? 0.6;
  const lat = sc.lateralMps ?? { x: 0, y: 0 };
  const off = sc.offsetPx ?? { x: 0, y: 0 };

  /* 물리 — v(t) = v0 / (1 + K v0 t), 나아간 거리 s(t) = ln(1 + K v0 t) / K (거리만 쓴다) */
  const distAt = (t: number) => Math.log(1 + DRAG_K * v0 * t) / DRAG_K;

  const frames: CapturedFrame[] = [];
  const backgroundSamples: Float32Array[] = [];
  const truth: { t: number; z: number }[] = [];

  /* 던지기 전 잠잠한 프레임 넷 — 배경 표본 */
  for (let i = 0; i < 4; i++) {
    const luma = background(width, height, 0);
    addNoise(luma, noise, Math.floor(rand() * 65536));
    backgroundSamples.push(luma);
    frames.push({ t: -(4 - i) * dt, luma });
  }

  let exposure = 0;
  for (let i = 0; i < 400; i++) {
    const t = i * dt;
    const s = distAt(t);
    const z = approach === 'receding' ? z0 + s : z0 - s;
    if (z < 0.5) break;
    const dSource = (BALL_DIAMETER_M * trueFocal) / z;
    const dSmall = dSource * scale;
    if (approach === 'receding' && dSmall < 3) break;
    if (approach === 'receding' && s > 12) break;
    /* 옆으로 흐른 만큼 화면에서 옮겨간다 — 원근으로 거리에 반비례 */
    const lx = (lat.x * t * trueFocal) / z;
    const ly = (lat.y * t * trueFocal) / z;
    const cx = (sw / 2 + off.x + lx) * scale;
    const cy = (sh / 2 + off.y + ly) * scale;
    const shift = sc.shakePx ? (rand() - 0.5) * 2 * sc.shakePx : 0;
    const luma = background(width, height, shift);
    exposure += sc.exposureDrift ?? 0;
    if (exposure) for (let k = 0; k < luma.length; k++) luma[k] += exposure;
    const smear =
      sc.motionBlur && (lat.x || lat.y)
        ? {
            dx: ((lat.x * (dt / 2) * trueFocal) / z) * scale,
            dy: ((lat.y * (dt / 2) * trueFocal) / z) * scale,
          }
        : null;
    drawBall(luma, width, height, cx, cy, dSmall, ball, blur, smear, {
      cx: (sw / 2) * scale,
      cy: (sh / 2) * scale,
      focalPx: trueFocal * scale,
    });
    addNoise(luma, noise, Math.floor(rand() * 65536));
    frames.push({ t, luma });
    truth.push({ t, z });
    if (approach === 'approaching' && dSmall > 120) break;
  }

  const result = analyzeFrames({
    frames,
    backgroundSamples,
    width,
    height,
    sourceWidth: sw,
    sourceHeight: sh,
    fovDeg: ENGINE_FOV,
    focalPx: sc.calibrated ? trueFocal : undefined,
    approach,
    releaseDistanceM: approach === 'approaching' ? z0 : undefined,
  });
  if (!result.measure.ok) return { ok: false, code: result.measure.code };

  /* 엔진이 쓴 거리 구간의 진짜 평균 속도 — 거리 → 시각을 물리에서 거꾸로 */
  const m = result.measure;
  const zStart = m.detail.releaseDistanceM;
  const zEnd =
    approach === 'receding' ? zStart + m.detail.travelM : zStart - m.detail.travelM;
  const tOf = (z: number) => {
    const s = approach === 'receding' ? z - z0 : z0 - z;
    return (Math.exp(DRAG_K * s) - 1) / (DRAG_K * v0);
  };
  const t1 = tOf(zStart);
  const t2 = tOf(zEnd);
  /* 3차원 위치 — 가운데서 벗어난 공은 그 시선을 따라 비스듬히 날아가므로 z 변화보다 길다 */
  const posAt = (t: number) => {
    const zz = approach === 'receding' ? z0 + distAt(t) : z0 - distAt(t);
    return {
      x: (off.x / trueFocal) * zz + lat.x * t,
      y: (off.y / trueFocal) * zz + lat.y * t,
      z: zz,
    };
  };
  const p1 = posAt(t1);
  const p2 = posAt(t2);
  const trueAvg =
    (Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z) / Math.abs(t2 - t1)) * 3.6;
  const avgErr = m.kmh - trueAvg;
  /* 릴리스 참값도 3차원 — 시선 방향 성분(off/f · v0)과 옆 흐름을 더한 속력 */
  const v0Vec = {
    x: (off.x / trueFocal) * v0 + lat.x,
    y: (off.y / trueFocal) * v0 + lat.y,
    z: v0,
  };
  const trueRelease = Math.hypot(v0Vec.x, v0Vec.y, v0Vec.z) * 3.6;
  const relErr = result.release ? result.release.releaseKmh - trueRelease : NaN;
  if (DIAG && seed === 1) {
    const buckets: Record<string, number[]> = {
      '≥30px': [],
      '15~30': [],
      '9~15': [],
      '<9': [],
    };
    for (const o of result.track) {
      const tr = truth.find((x) => Math.abs(x.t - o.t) < 1e-9);
      if (!tr) continue;
      const trueD = ((BALL_DIAMETER_M * trueFocal) / tr.z) * scale;
      const key =
        trueD >= 30 ? '≥30px' : trueD >= 15 ? '15~30' : trueD >= 9 ? '9~15' : '<9';
      buckets[key].push(o.diameterPx / trueD);
    }
    const fmt = (a: number[]) =>
      a.length
        ? `${((a.reduce((x, y) => x + y, 0) / a.length - 1) * 100).toFixed(2)}% (n=${a.length})`
        : '—';
    console.log(
      `  [diag] ${sc.name}: 지름 치우침 ` +
        Object.entries(buckets)
          .map(([k, v]) => `${k} ${fmt(v)}`)
          .join(' · ') +
        ` · 첫 관측 ${m.detail.releaseDistanceM}m · startKmh ${m.detail.startKmh} · 참 v0(3D) ${trueRelease.toFixed(1)}`
    );
  }
  return { ok: true, avgErr, relErr, frames: m.detail.frames, conf: m.confidence };
}

/* ─────────────────────────── 채점 ─────────────────────────── */

type Row = {
  name: string;
  n: number;
  rejected: number;
  rejectCodes: Record<string, number>;
  avgBias: number;
  avgP90: number;
  relBias: number;
  relP90: number;
  frames: number;
};

const rows: Row[] = [];
for (const sc of SCENARIOS.filter((x) => !ONLY || x.name.includes(ONLY))) {
  const outs: Outcome[] = [];
  for (let s = 1; s <= SEEDS; s++) outs.push(throwOnce(sc, s));
  const ok = outs.filter((o): o is Extract<Outcome, { ok: true }> => o.ok);
  const rejected = outs.filter((o): o is Extract<Outcome, { ok: false }> => !o.ok);
  const codes: Record<string, number> = {};
  for (const r of rejected) codes[r.code] = (codes[r.code] ?? 0) + 1;
  const p90 = (xs: number[]) => {
    const a = xs.map(Math.abs).sort((x, y) => x - y);
    return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.9))] : NaN;
  };
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  const rel = ok.map((o) => o.relErr).filter((v) => Number.isFinite(v));
  rows.push({
    name: sc.name,
    n: outs.length,
    rejected: rejected.length,
    rejectCodes: codes,
    avgBias: mean(ok.map((o) => o.avgErr)),
    avgP90: p90(ok.map((o) => o.avgErr)),
    relBias: mean(rel),
    relP90: p90(rel),
    frames: mean(ok.map((o) => o.frames)),
  });
}

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const f1 = (v: number) =>
    Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(1) : '  —  ';
  console.log(
    '\n구속 측정 정확도 시험대 — 130km/h 기준 오차(km/h). bias=평균 편향, p90=절대오차 90퍼센타일\n'
  );
  console.log(
    '시나리오'.padEnd(34) +
      '거부'.padStart(6) +
      '  평균bias  평균p90  릴리스bias  릴리스p90  프레임'
  );
  for (const r of rows) {
    const rej = `${r.rejected}/${r.n}`;
    const codes = Object.entries(r.rejectCodes)
      .map(([k, v]) => `${k}×${v}`)
      .join(',');
    console.log(
      r.name.padEnd(34) +
        rej.padStart(6) +
        '  ' +
        f1(r.avgBias).padStart(8) +
        '  ' +
        f1(r.avgP90).padStart(7) +
        '  ' +
        f1(r.relBias).padStart(10) +
        '  ' +
        f1(r.relP90).padStart(9) +
        '  ' +
        (Number.isFinite(r.frames) ? r.frames.toFixed(0) : '—').padStart(6) +
        (codes ? '   ' + codes : '')
    );
  }
  const worst = Math.max(
    ...rows.filter((r) => Number.isFinite(r.relP90)).map((r) => r.relP90)
  );
  console.log(`\n가장 나쁜 릴리스 p90: ${worst.toFixed(1)} km/h\n`);
}
