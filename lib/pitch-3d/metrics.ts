import { imageRight, imageUp, opticalAxis, type Camera } from '@/lib/pitch-3d/camera';
import {
  add,
  angleDeg,
  cross,
  dot,
  median,
  mid,
  normalize,
  norm,
  reject,
  scale,
  sub,
  type Vec3,
} from '@/lib/pitch-3d/linalg';
import { J } from '@/lib/pitch-3d/motion';

/**
 * 기준 축 · 지표(설계 3절 6 · 8, 4절, 검토 R5).
 *
 * 기준 축: 위 U = 두 카메라 화면 가로축의 외적(폰을 숙여도 가로축은 수평이라 숙임과 무관), 앞 F = 니업~착지 사이 골반이 나아간
 * 수평 방향(뒤 카메라가 홈에서 비켜 있어도 투수가 실제로 간 길), 글러브 쪽 G(우투 = 왼쪽 = U × F).
 * 지표는 그 축으로 잰 각도 · 키 대비 % 다. 크기는 임의라(카메라 거리 모름) 키는 서 있을 때 코~발목(키의 0.87)으로 어림한다.
 */

export type Frame3 = (Vec3 | null)[];

export type WorldAxes = { U: Vec3; F: Vec3; G: Vec3; warnings: string[]; travelVsBackDeg: number | null };

/** 키 대비 코~발목(서 있을 때) · 골반~발목(다리, 넓적다리 + 정강이) */
const NOSE_TO_ANKLE_RATIO = 0.87;
const LEG_RATIO = 0.48;

const midOf = (p: Frame3, a: number, b: number): Vec3 | null => (p[a] && p[b] ? mid(p[a]!, p[b]!) : null);

export function worldAxes(
  side: Camera,
  back: Camera,
  frames: Frame3[],
  hand: 'R' | 'L',
  ev: { start: number; footPlant: number }
): WorldAxes {
  const warnings: string[] = [];
  const zs = opticalAxis(side);
  const zb = opticalAxis(back);
  let U: Vec3;
  if (angleDeg(zs, zb) < 30 || angleDeg(zs, zb) > 150) {
    /* 두 카메라가 거의 같은(또는 마주 본) 방향이면 외적이 불안정 — 화면 위 방향 평균 */
    U = normalize(add(imageUp(side), imageUp(back)));
  } else {
    U = normalize(cross(imageRight(side), imageRight(back)));
    if (dot(U, add(imageUp(side), imageUp(back))) < 0) U = scale(U, -1);
  }

  /* 서 있는 몸통과 견줌 — 니업 전 장면들의 골반 → 어깨 방향 */
  const standing: Vec3[] = [];
  for (let i = 0; i <= Math.min(ev.start, frames.length - 1); i++) {
    const h = midOf(frames[i], J.lHip, J.rHip);
    const s = midOf(frames[i], J.lSh, J.rSh);
    if (h && s) standing.push(normalize(sub(s, h)));
  }
  if (standing.length >= 3) {
    const avg = normalize(standing.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3));
    if (angleDeg(avg, U) > 10) warnings.push('vertical');
  }

  /* 앞 F — 니업(또는 처음)부터 착지까지 골반이 나아간 수평 방향. 너무 짧으면 뒤 카메라 광축 */
  const h0 = firstMid(frames, ev.start, J.lHip, J.rHip, +1);
  const h1 = firstMid(frames, ev.footPlant, J.lHip, J.rHip, -1);
  const backAxis = normalize(reject(zb, U));
  let F = backAxis;
  let travelVsBackDeg: number | null = null;
  if (h0 && h1) {
    const travel = reject(sub(h1, h0), U);
    const legs = legLength(frames);
    if (legs && norm(travel) > legs * 0.25) {
      F = normalize(travel);
      travelVsBackDeg = angleDeg(F, backAxis);
      if (travelVsBackDeg > 15) warnings.push('backCamera');
    }
  }
  const G = hand === 'L' ? normalize(cross(F, U)) : normalize(cross(U, F));
  return { U, F, G, warnings, travelVsBackDeg };
}

function firstMid(frames: Frame3[], from: number, a: number, b: number, dir: 1 | -1): Vec3 | null {
  for (let i = from, n = 0; i >= 0 && i < frames.length && n < 8; i += dir, n++) {
    const m = midOf(frames[i], a, b);
    if (m) return m;
  }
  return null;
}

function legLength(frames: Frame3[]): number | null {
  const ls: number[] = [];
  for (const p of frames) {
    for (const [h, k, a] of [
      [J.lHip, J.lKn, J.lAn],
      [J.rHip, J.rKn, J.rAn],
    ]) {
      if (p[h] && p[k] && p[a]) ls.push(norm(sub(p[h]!, p[k]!)) + norm(sub(p[k]!, p[a]!)));
    }
  }
  return ls.length ? median(ls) : null;
}

/** 키(3D 단위) — 니업 전 장면의 코 ~ 낮은 쪽 발목 세로 / 0.87(다리를 드는 동안에도 디딘 발로), 없으면 다리 길이 / 0.48 */
export function bodyHeight(frames: Frame3[], U: Vec3, standingUntil: number): number | null {
  const hs: number[] = [];
  for (let i = 0; i <= Math.min(standingUntil, frames.length - 1); i++) {
    const p = frames[i];
    if (!p[J.nose] || !p[J.lAn] || !p[J.rAn]) continue;
    const low = Math.min(dot(p[J.lAn]!, U), dot(p[J.rAn]!, U));
    hs.push((dot(p[J.nose]!, U) - low) / NOSE_TO_ANKLE_RATIO);
  }
  if (hs.length >= 3) return median(hs);
  const legs = legLength(frames);
  return legs ? legs / LEG_RATIO : null;
}

/* ───────────────────────────── 지표 ───────────────────────────── */

export type MetricKey =
  | 'trunkForwardTilt'
  | 'trunkLateralTilt'
  | 'separationMax'
  | 'separationAtPlant'
  | 'leadKneeAtPlant'
  | 'leadKneeAtRelease'
  | 'strideLength'
  | 'strideOffset'
  | 'shoulderAbduction'
  | 'maxExternalRotation'
  | 'plantToRelease';

export type Metric = {
  key: MetricKey;
  value: number;
  unit: 'deg' | 'pct' | 'ms';
  /** 어림 오차(± 같은 단위) */
  pm: number;
  trust: 'high' | 'medium' | 'low';
  experimental?: boolean;
  /** 몸으로 나오기 어려운 범위(투구 연구의 흔한 범위 밖) — 화면은 '확인 필요' */
  check?: true;
};

/** 그럴 만한 범위(넓게 — 엘리트 · 유소년 투수 연구 값을 덮는다). 밖이면 check */
export const PLAUSIBLE: Record<MetricKey, [number, number]> = {
  trunkForwardTilt: [-10, 60],
  trunkLateralTilt: [-20, 50],
  separationMax: [0, 75],
  separationAtPlant: [-20, 75],
  leadKneeAtPlant: [0, 90],
  leadKneeAtRelease: [-10, 90],
  strideLength: [50, 110],
  strideOffset: [-25, 25],
  shoulderAbduction: [50, 140],
  maxExternalRotation: [120, 200],
  plantToRelease: [80, 300],
};

/** 문헌으로 어림한 기본 오차(설계 4절 · 정확도 검토 표의 가운데) */
const BASE_PM: Record<MetricKey, number> = {
  trunkForwardTilt: 5,
  trunkLateralTilt: 5,
  separationMax: 9,
  separationAtPlant: 9,
  leadKneeAtPlant: 7,
  leadKneeAtRelease: 7,
  strideLength: 3.5,
  strideOffset: 3,
  shoulderAbduction: 9,
  maxExternalRotation: 20,
  plantToRelease: 8,
};

export type Ctx = { U: Vec3; F: Vec3; G: Vec3; hand: 'R' | 'L'; height: number };

const throwSide = (hand: 'R' | 'L') =>
  hand === 'L'
    ? { sh: J.lSh, el: J.lEl, wr: J.lWr, hip: J.lHip, gsh: J.rSh, ghip: J.rHip, lead: { hip: J.rHip, kn: J.rKn, an: J.rAn }, backAn: J.lAn }
    : { sh: J.rSh, el: J.rEl, wr: J.rWr, hip: J.rHip, gsh: J.lSh, ghip: J.lHip, lead: { hip: J.lHip, kn: J.lKn, an: J.lAn }, backAn: J.rAn };

/** 몸통 축(골반 가운데 → 어깨 가운데) */
const trunk = (p: Frame3): Vec3 | null => {
  const h = midOf(p, J.lHip, J.rHip);
  const s = midOf(p, J.lSh, J.rSh);
  return h && s ? sub(s, h) : null;
};

/** 몸통 앞 기울기 · 옆(글러브 쪽) 기울기(도) */
export function trunkTilt(p: Frame3, c: Ctx): { forward: number; lateral: number } | null {
  const T = trunk(p);
  if (!T) return null;
  const up = dot(T, c.U);
  return {
    forward: (Math.atan2(dot(T, c.F), up) * 180) / Math.PI,
    lateral: (Math.atan2(dot(T, c.G), up) * 180) / Math.PI,
  };
}

/**
 * 열림 각(도): 글러브 쪽 → 던지는 쪽 선(어깨 또는 골반)의 반대, 즉 '던지는 쪽 → 글러브 쪽' 선이 홈(F)에서 글러브 쪽(G)으로
 * 돌아간 정도. 준비 자세(닫힘) 0° 근처, 몸이 홈을 보면 90° 근처.
 */
function openness(throwPt: Vec3, glovePt: Vec3, c: Ctx): number {
  const a = reject(sub(glovePt, throwPt), c.U);
  return (Math.atan2(dot(a, c.G), dot(a, c.F)) * 180) / Math.PI;
}

/** 골반-어깨 꼬임(도) = 골반 열림 − 어깨 열림(골반이 먼저 열리면 +) */
export function separation(p: Frame3, c: Ctx): number | null {
  const s = throwSide(c.hand);
  if (!p[s.sh] || !p[s.gsh] || !p[s.hip] || !p[s.ghip]) return null;
  let d = openness(p[s.hip]!, p[s.ghip]!, c) - openness(p[s.sh]!, p[s.gsh]!, c);
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** 앞다리 무릎 굽힘(도) = 180 − 골반-무릎-발목 각 */
export function leadKnee(p: Frame3, c: Ctx): number | null {
  const { hip, kn, an } = throwSide(c.hand).lead;
  if (!p[hip] || !p[kn] || !p[an]) return null;
  return 180 - angleDeg(sub(p[hip]!, p[kn]!), sub(p[an]!, p[kn]!));
}

/** 보폭 · 디딤 방향(키 대비 %) — 뒷발목 → 앞발목의 F 성분 · G 성분(+ = 글러브 쪽 = 열림) */
export function stride(p: Frame3, c: Ctx): { length: number; offset: number } | null {
  const s = throwSide(c.hand);
  if (!p[s.lead.an] || !p[s.backAn]) return null;
  const d = sub(p[s.lead.an]!, p[s.backAn]!);
  return { length: (dot(d, c.F) / c.height) * 100, offset: (dot(d, c.G) / c.height) * 100 };
}

/** 던지는 팔 어깨 벌림(도) = 위팔과 몸통 아래 방향 사이 각 */
export function shoulderAbduction(p: Frame3, c: Ctx): number | null {
  const s = throwSide(c.hand);
  const T = trunk(p);
  if (!T || !p[s.sh] || !p[s.el]) return null;
  return angleDeg(sub(p[s.el]!, p[s.sh]!), scale(T, -1));
}

/**
 * 어깨 외회전(도, 실험) — 위팔 축을 둘레로 아래팔이 몸통 위쪽에서 뒤쪽으로 돈 정도. 아래팔이 위를 가리키면 90°, 뒤로 누우면 180°.
 * 팔꿈치가 펴져 있으면(아래팔이 위팔과 거의 나란) 재지 않는다.
 */
export function externalRotation(p: Frame3, c: Ctx): number | null {
  const s = throwSide(c.hand);
  const T = trunk(p);
  if (!T || !p[s.sh] || !p[s.el] || !p[s.wr] || !p[s.gsh]) return null;
  const u = normalize(sub(p[s.el]!, p[s.sh]!));
  const v = sub(p[s.wr]!, p[s.el]!);
  if (angleDeg(u, v) < 30) return null;
  const ref = normalize(reject(normalize(T), u));
  /* 가슴 앞 방향: 어깨 선 × 몸통 축의 부호를 F 쪽으로 */
  let chest = normalize(cross(sub(p[s.gsh]!, p[s.sh]!), T));
  if (dot(chest, c.F) < 0) chest = scale(chest, -1);
  const post = normalize(reject(scale(chest, -1), u));
  const vp = reject(v, u);
  return 90 + (Math.atan2(dot(vp, post), dot(vp, ref)) * 180) / Math.PI;
}

/** ± 를 키우는 조건(검토 R1 · R2 · R5) */
export type PmFactors = {
  calibration: number;
  narrow: number;
  density: number;
  vertical: number;
  /** 두 영상 관절이 덜 맞음(다시 비춤 · 뼈 흔들림이 1단계 기준 밖) */
  consistency?: number;
};

function rate(key: MetricKey, value: number, unit: Metric['unit'], f: PmFactors, extra = 1, experimental = false): Metric {
  const tilt = key === 'trunkForwardTilt' || key === 'trunkLateralTilt';
  const k = f.calibration * f.narrow * f.density * (tilt ? f.vertical : 1) * (f.consistency ?? 1) * extra;
  const pm = BASE_PM[key] * k;
  const [lo, hi] = PLAUSIBLE[key];
  const odd = !(value >= lo && value <= hi);
  const trust: Metric['trust'] = experimental || odd ? 'low' : k <= 1.15 ? 'high' : k <= 1.7 ? 'medium' : 'low';
  return {
    key,
    value: Math.round(value * 10) / 10,
    unit,
    pm: Math.round(pm * 10) / 10,
    trust,
    ...(experimental ? { experimental } : {}),
    ...(odd ? { check: true as const } : {}),
  };
}

export function computeMetrics(
  frames: Frame3[],
  c: Ctx,
  ev: { kneeUp: number | null; footPlant: number; release: number },
  f: PmFactors,
  /** 착지→릴리스 실제 시간(ms) — 슬로모 설정을 알 때만 */
  plantToReleaseMs: number | null
): Metric[] {
  const out: Metric[] = [];
  const at = (i: number) => frames[Math.max(0, Math.min(frames.length - 1, i))];
  /** 순간의 값 = 앞뒤 2장면까지 5장면의 중앙값(한 장면의 2D 잡음 · 흐림에 덜 흔들린다, 고른 기울기는 그대로) */
  const near = <T>(idx: number, fn: (p: Frame3) => T | null, key: (v: T) => number): T | null => {
    const vals: T[] = [];
    for (let i = idx - 2; i <= idx + 2; i++) {
      if (i < 0 || i >= frames.length) continue;
      const v = fn(frames[i]);
      if (v != null) vals.push(v);
    }
    if (vals.length === 0) return null;
    vals.sort((x, y) => key(x) - key(y));
    return vals[vals.length >> 1];
  };

  const fwd = near(ev.release, (p) => trunkTilt(p, c)?.forward ?? null, (v) => v);
  const lat = near(ev.release, (p) => trunkTilt(p, c)?.lateral ?? null, (v) => v);
  if (fwd != null) out.push(rate('trunkForwardTilt', fwd, 'deg', f));
  if (lat != null) out.push(rate('trunkLateralTilt', lat, 'deg', f));

  /*
   * 꼬임 — 골반 · 어깨의 열림 각을 장면마다 재 시간으로 다듬은 뒤(중앙값 5 → 평균 7) 뺀다. 닫힌 자세에서는 한쪽 영상에서 좌우가
   * 겹쳐 열림 각이 장면마다 ±20° 흔들렸다(합성) — 실제 회전은 장면 사이에 1~2° 라 다듬어도 거의 안 늦는다.
   */
  const from = ev.kneeUp ?? Math.max(0, ev.footPlant - Math.round((ev.release - ev.footPlant) * 3));
  const lo = Math.max(0, from - 6);
  const hi = Math.min(frames.length - 1, ev.release + 6);
  const s = throwSide(c.hand);
  const series = (a: number, b: number) => {
    const raw: (number | null)[] = [];
    for (let i = lo; i <= hi; i++) {
      const p = frames[i];
      raw.push(p[a] && p[b] ? openness(p[a]!, p[b]!, c) : null);
    }
    /* 이어 붙이기(±180 넘김) */
    let prev: number | null = null;
    const un = raw.map((v) => {
      if (v == null) return null;
      let x = v;
      if (prev != null) {
        while (x - prev > 180) x -= 360;
        while (x - prev < -180) x += 360;
      }
      prev = x;
      return x;
    });
    const med = un.map((_, k) => {
      const w = un.slice(Math.max(0, k - 2), k + 3).filter((v): v is number => v != null);
      return w.length >= 3 ? median(w) : null;
    });
    return med.map((_, k) => {
      const w = med.slice(Math.max(0, k - 3), k + 4).filter((v): v is number => v != null);
      return w.length >= 4 ? w.reduce((x, y) => x + y, 0) / w.length : null;
    });
  };
  const pel = series(s.hip, s.ghip);
  const sho = series(s.sh, s.gsh);
  const sepAt = (i: number) => {
    const k = i - lo;
    const a = pel[k];
    const b = sho[k];
    if (a == null || b == null) return null;
    let d = a - b;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  };
  let sepMax: number | null = null;
  for (let i = from; i <= ev.release; i++) {
    const v = sepAt(i);
    if (v != null && (sepMax == null || v > sepMax)) sepMax = v;
  }
  if (sepMax != null) out.push(rate('separationMax', sepMax, 'deg', f));
  const sepFp = sepAt(ev.footPlant);
  if (sepFp != null) out.push(rate('separationAtPlant', sepFp, 'deg', f));

  const kFp = near(ev.footPlant, (p) => leadKnee(p, c), (v) => v);
  if (kFp != null) out.push(rate('leadKneeAtPlant', kFp, 'deg', f));
  const kRel = near(ev.release, (p) => leadKnee(p, c), (v) => v);
  if (kRel != null) out.push(rate('leadKneeAtRelease', kRel, 'deg', f));
  const len = near(ev.footPlant, (p) => stride(p, c)?.length ?? null, (v) => v);
  const off = near(ev.footPlant, (p) => stride(p, c)?.offset ?? null, (v) => v);
  if (len != null) out.push(rate('strideLength', len, 'pct', f));
  if (off != null) out.push(rate('strideOffset', off, 'pct', f));
  const ab = near(ev.release, (p) => shoulderAbduction(p, c), (v) => v);
  if (ab != null) out.push(rate('shoulderAbduction', ab, 'deg', f, 1.1));
  const ers: (number | null)[] = [];
  for (let i = ev.footPlant; i <= ev.release; i++) ers.push(externalRotation(at(i), c));
  let mer: number | null = null;
  ers.forEach((_, k) => {
    const win = ers.slice(Math.max(0, k - 1), k + 2).filter((v): v is number => v != null);
    if (win.length < 2) return;
    const m = median(win);
    if (mer == null || m > mer) mer = m;
  });
  if (mer != null) out.push(rate('maxExternalRotation', mer, 'deg', f, 1, true));
  if (plantToReleaseMs != null) out.push(rate('plantToRelease', plantToReleaseMs, 'ms', { ...f, calibration: 1, narrow: 1 }));
  return out;
}
