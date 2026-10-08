import type { PoseFrame, PosePoint, PoseTrack } from '@/lib/pose/types';
import { median } from '@/lib/pitch-3d/linalg';
import { N_V2_JOINTS, V2_JOINTS, V2J, type V2Obs, type V2Track } from '@/lib/pitch-3d/v2/contract';

/**
 * v2 2D 관절(25개, 픽셀)과 v1 엔진 입력(MediaPipe 33점, 0~1) 사이 — v1 의 시간 맞추기 · 카메라 · 순간 찾기를 그대로 쓰려고
 * 25개 중 짝이 있는 것을 33점 자리에 넣고, 없는 자리는 가까운 것으로 채운다(joint-map.json _mediapipeFill).
 */

const EMPTY: PosePoint = { x: 0, y: 0, z: 0, visibility: 0 };
/** 몸통 핵심(lib/pose/types CORE_LANDMARKS 와 같은 뜻 — 엔진 번호로) */
const CORE = [V2J.lSh, V2J.rSh, V2J.lHip, V2J.rHip, V2J.lKn, V2J.rKn, V2J.lAn, V2J.rAn];

export function toPoseTrack(track: V2Track): PoseTrack {
  const W = track.W || 1;
  const H = track.H || 1;
  let qSum = 0;
  let qN = 0;
  let covered = 0;
  const frames: PoseFrame[] = track.frames.map((f) => {
    const lm: PosePoint[] = Array.from({ length: 33 }, () => EMPTY);
    const at = (j: number): PosePoint => {
      const p = f.p[j];
      return p ? { x: p[0] / W, y: p[1] / H, z: 0, visibility: p[2] } : EMPTY;
    };
    V2_JOINTS.forEach((j, i) => {
      if (j.mp != null) lm[j.mp] = at(i);
    });
    /* 빈 자리 채우기 — 눈 · 입은 코, 엄지는 손목(좌우 바꿀 때 엇갈리지 않게 같은 쪽) */
    for (const k of [1, 2, 3, 4, 5, 6, 9, 10]) lm[k] = lm[0];
    lm[21] = lm[15];
    lm[22] = lm[16];
    const core = CORE.map((j) => f.p[j]?.[2] ?? 0);
    const q = core.reduce((a, v) => a + v, 0) / core.length;
    qSum += q;
    qN++;
    if (q >= 0.5) covered++;
    return { t: f.t, landmarks: lm };
  });
  return {
    frames,
    connections: [],
    videoWidth: W,
    videoHeight: H,
    sampleStep: track.fps > 0 ? 1 / track.fps : 1 / 30,
    quality: qN ? qSum / qN : 0,
    coverage: qN ? covered / qN : 0,
  };
}

/** 장면 시각 → 그 장면의 관절(정확히 같은 시각만) */
export function byTime(track: V2Track): Map<number, V2Obs[]> {
  const m = new Map<number, V2Obs[]>();
  for (const f of track.frames) m.set(f.t, f.p);
  return m;
}

export const medianStepOf = (track: V2Track) =>
  median(track.frames.slice(1).map((f, i) => f.t - track.frames[i].t)) || 1 / 30;

/** 시각 t 로 보간(앞뒤 장면이 중앙 간격의 3배 넘게 떨어져 있으면 null) — motion.ts backAt 과 같은 규칙 */
export function obsAt(track: V2Track, t: number, medianDt: number): V2Obs[] | null {
  const fr = track.frames;
  if (fr.length < 2 || t < fr[0].t || t > fr[fr.length - 1].t) return null;
  let lo = 0;
  let hi = fr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fr[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = fr[lo];
  const b = fr[hi];
  const gap = b.t - a.t;
  if (gap > medianDt * 3) return null;
  const u = gap > 0 ? (t - a.t) / gap : 0;
  const out: V2Obs[] = [];
  for (let j = 0; j < N_V2_JOINTS; j++) {
    const pa = a.p[j];
    const pb = b.p[j];
    if (!pa || !pb) {
      out.push([0, 0, 0]);
      continue;
    }
    out.push([
      pa[0] + (pb[0] - pa[0]) * u,
      pa[1] + (pb[1] - pa[1]) * u,
      Math.min(pa[2], pb[2]),
    ]);
  }
  return out;
}

/** 모양 검사 — GPU 가 보낸 입력(신뢰 경계). 틀리면 null */
export function readV2Track(raw: unknown): V2Track | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!num(r.W) || !num(r.H) || !num(r.fps) || !Array.isArray(r.frames)) return null;
  const frames: V2Track['frames'] = [];
  for (const f of r.frames as Record<string, unknown>[]) {
    if (!f || !num(f.t) || !Array.isArray(f.p) || f.p.length !== N_V2_JOINTS)
      return null;
    const p: V2Obs[] = [];
    for (const o of f.p as unknown[]) {
      if (!Array.isArray(o) || o.length !== 3 || !o.every(num)) return null;
      p.push([o[0], o[1], Math.max(0, Math.min(1, o[2]))]);
    }
    frames.push({ t: f.t as number, p });
  }
  frames.sort((a, b) => a.t - b.t);
  return { W: r.W as number, H: r.H as number, fps: r.fps as number, frames };
}
