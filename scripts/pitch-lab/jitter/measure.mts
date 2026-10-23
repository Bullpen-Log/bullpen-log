/**
 * 떨림 재기 — 엔진 결과 하나를 원 결과(관절) · 화면 트랙(displayTrack)으로 나눠, 구간마다 관절별 잔떨림 p90(키 대비 %)을 JSON 으로.
 *   node --import ./scripts/alias-register.mjs scripts/pitch-lab/jitter/measure.mts <result.json>...
 * 잔떨림 = 그 장면 자리 − 앞뒤 9장면 가우스(σ 3) 평균. 빠른 팔은 진짜 움직임 몫도 섞이니 절댓값보다 기준과의 변화 · 원 결과와의 차이로 본다.
 */
import { readFileSync } from 'node:fs';
import { displayFrameDt, displayTrack } from '@/lib/pitch-3d/v2/display';
import { readPitch3dV2Result, V2J } from '@/lib/pitch-3d/v2/contract';
import { mannequinTrack } from '@/lib/pitch-3d/v2/mannequin-prep';
import { canonicalFrames, mannequinFrames } from '@/lib/pitch-3d/v2/mannequin-frames';

export const PHASES = ['prep', 'lift', 'stride', 'follow'] as const;
const NAMES = Object.keys(V2J);
const R = 9;
const W = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / 18));

type Frames = number[][][];
function jitter(F: Frames, j: number, k: number, heightM: number) {
  const s = [0, 0, 0];
  let ws = 0;
  for (let q = -R; q <= R; q++) {
    const f = F[k + q];
    if (!f) continue;
    for (let d = 0; d < 3; d++) s[d] += f[j][d] * W[q + R];
    ws += W[q + R];
  }
  return (Math.hypot(F[k][j][0] - s[0] / ws, F[k][j][1] - s[1] / ws, F[k][j][2] - s[2] / ws) * 100) / heightM;
}
const p90 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] : 0);
const round = (v: number) => Math.round(v * 100) / 100;

/** 구간 → 관절 이름 → [화면, 원] */
type Result = Parameters<typeof displayTrack>[0];
type Track = ReturnType<typeof displayTrack>;
const trackOf = (r: Result): Track => displayTrack(r, { ground: 'mound', heightM: 1.8 });

export function measure(r: Result, tr: Track = trackOf(r)) {
  const heightM = 1.8;
  const disp = tr.frames as Frames;
  const raw = r.joints.map((f) => f.map((p) => p.map((v) => v / 1000))) as Frames;
  const { kneeUp, footPlant, release } = r.events;
  const phaseOf = (k: number) => (kneeUp != null && k < kneeUp ? 0 : k < footPlant ? 1 : k <= release ? 2 : 3);
  const out: Record<string, Record<string, [number, number]>> = {};
  PHASES.forEach((p, i) => {
    const ks = disp.map((_, k) => k).filter((k) => phaseOf(k) === i);
    if (ks.length < 5) return;
    out[p] = Object.fromEntries(
      NAMES.map((n, j) => [n, [round(p90(ks.map((k) => jitter(disp, j, k, heightM)))), round(p90(ks.map((k) => jitter(raw, j, k, heightM))))]])
    );
  });
  return out;
}

/*
 * 이상한 움직임 세기(장면 수) — 사람 몸이 못 하는 것. 화면 · 원 결과를 따로.
 *  pop   마디 방향이 한 장면에 15° 넘게 돌았다가 곧바로 돌아옴(앞뒤 장면끼리는 그 절반 밑) — 순간 튐
 *  speed 마디 방향 각속도가 사람 한계를 넘음(실제 초 — 슬로모는 화면 모델처럼 착지 → 릴리스를 0.25초 안으로)
 *  knee  무릎이 발끝 반대쪽으로 KNEE_BACK_M 넘게 꺾임(뒤로 꺾인 무릎, 굽힘 60° 밑에서만)
 *  sep   상하체 분리(위에서 본 어깨선 − 엉덩이선) 75° 넘음
 */
const SEGS: { name: string; a: string | string[]; b: string | string[]; lim: number }[] = [
  { name: '골반선', a: 'lHip', b: 'rHip', lim: 1500 },
  { name: '어깨선', a: 'lSh', b: 'rSh', lim: 2000 },
  { name: '몸통', a: ['lHip', 'rHip'], b: ['lSh', 'rSh'], lim: 1500 },
  { name: '머리', a: ['lEar', 'rEar'], b: 'nose', lim: 2000 },
  ...(['l', 'r'] as const).flatMap((s) => [
    { name: `${s}넙다리`, a: `${s}Hip`, b: `${s}Kn`, lim: 2000 },
    { name: `${s}정강이`, a: `${s}Kn`, b: `${s}An`, lim: 2500 },
    { name: `${s}발`, a: `${s}He`, b: `${s}To`, lim: 2500 },
    { name: `${s}위팔`, a: `${s}Sh`, b: `${s}El`, lim: 4000 },
    { name: `${s}아래팔`, a: `${s}El`, b: `${s}Wr`, lim: 6000 },
  ]),
];
/** 뒤로 꺾인 무릎 판정 — 앞다리를 쭉 펴 버티면 몇 ° 젖혀질 수 있어(무릎 5° ≈ 4cm) 그 넘게만 */
const KNEE_BACK_M = Number(process.env.KNEE_BACK_M ?? 0.04);
type F3 = number[][][];
const J = V2J as Record<string, number>;
const pt = (fr: number[][], x: string | string[]) =>
  Array.isArray(x) ? [0, 1, 2].map((d) => x.reduce((s, n) => s + fr[J[n]][d], 0) / x.length) : fr[J[x]];
const dirOf = (fr: number[][], a: string | string[], b: string | string[]) => {
  const pa = pt(fr, a);
  const v = pt(fr, b).map((x, d) => x - pa[d]);
  const m = Math.hypot(...v) || 1;
  return v.map((x) => x / m);
};
const angle = (u: number[], v: number[]) => (Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) * 180) / Math.PI;

export function oddities(F: F3, dt: number) {
  const n = F.length;
  const out = { pop: 0, speed: 0, knee: 0, sep: 0, where: {} as Record<string, number> };
  const bump = (kind: 'pop' | 'speed' | 'knee' | 'sep', name: string) => {
    out[kind]++;
    out.where[`${kind}:${name}`] = (out.where[`${kind}:${name}`] ?? 0) + 1;
  };
  for (const s of SEGS) {
    const d = F.map((fr) => dirOf(fr, s.a, s.b));
    for (let k = 1; k + 1 < n; k++) {
      const d1 = angle(d[k - 1], d[k]);
      const d2 = angle(d[k], d[k + 1]);
      if (Math.min(d1, d2) > 15 && angle(d[k - 1], d[k + 1]) < 0.5 * Math.min(d1, d2)) bump('pop', s.name);
      if (angle(d[k - 1], d[k + 1]) / (2 * dt) > s.lim) bump('speed', s.name);
    }
  }
  for (let k = 0; k < n; k++) {
    const fr = F[k];
    for (const s of ['l', 'r']) {
      const H = pt(fr, `${s}Hip`), K = pt(fr, `${s}Kn`), A = pt(fr, `${s}An`);
      const ax = A.map((x, i) => x - H[i]);
      const L = Math.hypot(...ax) || 1;
      const e = ax.map((x) => x / L);
      const kv = K.map((x, i) => x - H[i]);
      const along = kv[0] * e[0] + kv[1] * e[1] + kv[2] * e[2];
      const off = kv.map((x, i) => x - along * e[i]);
      const toe = pt(fr, `${s}To`).map((x, i) => x - pt(fr, `${s}He`)[i]);
      const ta = toe[0] * e[0] + toe[1] * e[1] + toe[2] * e[2];
      const fwd = toe.map((x, i) => x - ta * e[i]);
      const fm = Math.hypot(...fwd);
      /* 많이 굽힌 무릎(다리 들기)은 발이 아래로 처져 발끝 방향이 기준이 못 된다 — 60° 밑에서만 */
      const ku = K.map((x, i) => x - H[i]), ks = A.map((x, i) => x - K[i]);
      const bend = angle(ku.map((x) => x / (Math.hypot(...ku) || 1)), ks.map((x) => x / (Math.hypot(...ks) || 1)));
      if (bend < 60 && fm > 1e-6 && (off[0] * fwd[0] + off[1] * fwd[1] + off[2] * fwd[2]) / fm < -KNEE_BACK_M) bump('knee', `${s}무릎`);
    }
    /*
     * 몸통 축(엉덩이 가운데 → 어깨 가운데)에 수직인 면에서 잰 어깨선 − 엉덩이선 각. 예전엔 위에서 본(세상 y) 각이라, 팔로스루에 골반이 옆으로
     * 크게 기울면(엉덩이선이 거의 위아래) 화면이 몸 전체를 마운드에 맞춰 몇 도 기울인 것만으로 분리가 −70 → −78° 로 바뀌어 '75° 넘음'이 됐다(6814 샘플).
     */
    const T = nz(pt(fr, ['lSh', 'rSh']).map((x, i) => x - pt(fr, ['lHip', 'rHip'])[i]));
    const onPlane = (a: string, b: string) => {
      const v = pt(fr, b).map((x, i) => x - pt(fr, a)[i]);
      const d = v[0] * T[0] + v[1] * T[1] + v[2] * T[2];
      return nz(v.map((x, i) => x - d * T[i]));
    };
    const h = onPlane('lHip', 'rHip'), sv = onPlane('lSh', 'rSh');
    const cr = [h[1] * sv[2] - h[2] * sv[1], h[2] * sv[0] - h[0] * sv[2], h[0] * sv[1] - h[1] * sv[0]];
    const sep = (Math.atan2(cr[0] * T[0] + cr[1] * T[1] + cr[2] * T[2], h[0] * sv[0] + h[1] * sv[1] + h[2] * sv[2]) * 180) / Math.PI;
    if (Math.abs(sep) > 75) bump('sep', '분리');
  }
  return out;
}

/*
 * 인형의 방향(그리는 틀) — 팔 · 다리는 둥근 원통이라 제 축 돌림이 안 보이고, 골반 · 가슴 · 머리 · 두 손 · 두 발의 방향이 보인다. 손 방향은
 * '손 방향 × 위팔'이라 팔을 쭉 펴면 정해지지 않아 휙 돌 수 있다. 순간 튐(20° 넘게 돌았다 돌아옴) · 사람 한계를 넘는 빠르기(°/초)를 센다.
 */
type MF = ReturnType<typeof mannequinFrames>[number];
const nz = (v: number[]) => {
  const m = Math.hypot(...v) || 1;
  return v.map((x) => x / m);
};
/** 부위마다 두 축 — 장면 사이 돈 각 = 두 축 중 더 많이 돈 쪽 */
const PARTS: { name: string; lim: number; ax: (f: MF) => [number[], number[]] }[] = [
  { name: '골반', lim: 1200, ax: (f) => [f.pelvis.xa, f.pelvis.ya] },
  { name: '가슴', lim: 1500, ax: (f) => [f.chest.xa, f.chest.ya] },
  { name: '머리', lim: 1500, ax: (f) => [f.head.up, f.head.fw] },
  /* 던지는 손은 공 놓는 순간 위팔 안쪽 돌림(투수 7000°/초 안팎) + 아래팔 엎침이 겹친다 — 9000 */
  { name: '던지는손', lim: 9000, ax: (f) => [f.throwing.hd, f.throwing.side] },
  { name: '글러브손', lim: 3000, ax: (f) => [f.glove.hd, f.glove.side] },
  { name: '뒷발', lim: 3000, ax: (f) => [nz(f.rear.toe.map((x, i) => x - f.rear.heel[i])), f.rear.n] },
  { name: '앞발', lim: 3000, ax: (f) => [nz(f.lead.toe.map((x, i) => x - f.lead.heel[i])), f.lead.n] },
];
const turn = (a: [number[], number[]], b: [number[], number[]]) => Math.max(angle(a[0], b[0]), angle(a[1], b[1]));

/*
 * 꺾임 — 마디 방향이 국소 3차 곡선(앞뒤 KINK_HALF 장면 최소제곱)에서 KINK_DEG 넘게 벗어난 구간 수. 빠르지만 매끈한 움직임(던지는 팔의 가속)은
 * 곡선이 따라가 안 세고, 갑자기 꺾이는 것만 센다 — 2026-10-22 김민 "짧은 시간에 관절이 사람이 못 하는 각도로 팍팍 튄다"(던지는 손 · 아래팔,
 * 착지 ~ 릴리스 뒤). 앞발 휘두름 — 인형 앞발이 FOOT_WHIP °/초 넘게 도는 장면 수(착지 앞뒤 발 돌림 — 실험실 8샘플 지금 가장 큰 1275, 고치기 전 판 4샘플이 1768~2821).
 */
const KINK_DEG = 6;
const KINK_HALF = 6;
const FOOT_WHIP = 1500;
/** 다리 늘어남 — 넙다리 · 정강이 길이가 그 마디 가운데 길이에서 이만큼(m, 키 1.8m) 넘게 벗어난 장면 수(2026-10-23 착지 맞춤이 앞정강이를 5~34cm 늘였다) */
const LIMB_STRETCH_M = 0.03;
const KINK_W = (() => {
  const xs = Array.from({ length: 2 * KINK_HALF + 1 }, (_, i) => i - KINK_HALF);
  const A = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => xs.reduce((a, x) => a + x ** (i + j), 0)));
  /* (AᵀA)⁻¹ 의 첫 행 — 가운데 장면 값의 가중치 */
  const M = A.map((r, i) => [...r, ...[0, 1, 2, 3].map((j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let q = c + 1; q < 4; q++) if (Math.abs(M[q][c]) > Math.abs(M[p][c])) p = q;
    [M[c], M[p]] = [M[p], M[c]];
    const v = M[c][c];
    for (let j = 0; j < 8; j++) M[c][j] /= v;
    for (let q = 0; q < 4; q++) if (q !== c) { const f = M[q][c]; for (let j = 0; j < 8; j++) M[q][j] -= f * M[c][j]; }
  }
  const inv0 = M[0].slice(4);
  return xs.map((x) => [1, x, x * x, x * x * x].reduce((a, v, i) => a + v * inv0[i], 0));
})();
function kinkRuns(d: number[][]): number {
  let runs = 0;
  let inRun = false;
  for (let k = 0; k < d.length; k++) {
    let off = 0;
    if (k >= KINK_HALF && k + KINK_HALF < d.length) {
      const s = [0, 0, 0];
      for (let q = -KINK_HALF; q <= KINK_HALF; q++) for (let i = 0; i < 3; i++) s[i] += d[k + q][i] * KINK_W[q + KINK_HALF];
      off = angle(d[k], nz(s));
    }
    if (off > KINK_DEG && !inRun) runs++;
    inRun = off > KINK_DEG;
  }
  return runs;
}

/*
 * 인형 셈의 시계는 화면 모델과 같은 displayFrameDt 하나(영상 시간, 슬로모만 착지 → 릴리스 0.25초로 줄임). 예전엔 빠르기는 이 시계, 앞발 휘두름은
 * 인형 시계(첫 닿음 → 릴리스 0.15초)라 슬로모에서 1.67배 달랐다. 0.15초 시계로 모두 재면 실제 120fps 마커 투구(첫 닿음 → 릴리스 약 0.21초)도
 * 사람 한계를 넘는 것으로 잘못 세어(샘플마다 13~75장면) 이쪽으로 맞췄다(2026-10-22 검토).
 */
export function mannequinOddities(r: Result, tr: Track = trackOf(r)) {
  const mt = mannequinTrack(tr, r, 1.8);
  const dt = displayFrameDt(r);
  const C = canonicalFrames(mt);
  const M = mannequinFrames(C, 1.8);
  const out = { pop: 0, speed: 0, kink: 0, whip: 0, stretch: 0, where: {} as Record<string, number> };
  const len = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const LEGS: [string, (k: number) => number][] = [
    ['앞넙다리', (k) => len(C[k].lh, C[k].lk)], ['앞정강이', (k) => len(C[k].lk, C[k].la)],
    ['뒷넙다리', (k) => len(C[k].rh, C[k].rk)], ['뒷정강이', (k) => len(C[k].rk, C[k].ra)],
  ];
  for (const [name, f] of LEGS) {
    const L = C.map((_, k) => f(k));
    const mid = [...L].sort((a, b) => a - b)[L.length >> 1];
    const n = L.filter((x) => Math.abs(x - mid) > LIMB_STRETCH_M).length;
    if (!n) continue;
    out.stretch += n;
    out.where[`stretch:${name}`] = n;
  }
  const seg = (a: number[], b: number[]) => nz(b.map((x, i) => x - a[i]));
  const LIMBS: [string, (k: number) => number[]][] = [
    ['던지는위팔', (k) => seg(C[k].sh, C[k].el)], ['던지는아래팔', (k) => seg(C[k].el, C[k].wr)], ['던지는손', (k) => M[k].throwing.hd],
    ['글러브위팔', (k) => seg(C[k].gs, C[k].ge)], ['글러브아래팔', (k) => seg(C[k].ge, C[k].gw)], ['글러브손', (k) => M[k].glove.hd],
    ['뒷넙다리', (k) => seg(C[k].rh, C[k].rk)], ['앞넙다리', (k) => seg(C[k].lh, C[k].lk)], ['뒷정강이', (k) => seg(C[k].rk, C[k].ra)],
    ['앞정강이', (k) => seg(C[k].lk, C[k].la)], ['골반', (k) => M[k].pelvis.xa], ['가슴', (k) => M[k].chest.xa], ['머리', (k) => M[k].head.fw],
  ];
  for (const [name, f] of LIMBS) {
    const n = kinkRuns(C.map((_, k) => f(k)));
    if (!n) continue;
    out.kink += n;
    out.where[`kink:${name}`] = n;
  }
  const lead = M.map((f) => nz(f.lead.toe.map((x, i) => x - f.lead.heel[i])));
  for (let k = 1; k + 1 < lead.length; k++)
    if (angle(lead[k - 1], lead[k + 1]) / (2 * dt) > FOOT_WHIP) {
      out.whip++;
      out.where['whip:앞발'] = (out.where['whip:앞발'] ?? 0) + 1;
    }
  for (const p of PARTS) {
    const q = M.map(p.ax);
    for (let k = 1; k + 1 < q.length; k++) {
      const a1 = turn(q[k - 1], q[k]);
      const a2 = turn(q[k], q[k + 1]);
      const span = turn(q[k - 1], q[k + 1]);
      if (Math.min(a1, a2) > 20 && span < 0.5 * Math.min(a1, a2)) {
        out.pop++;
        out.where[`pop:${p.name}`] = (out.where[`pop:${p.name}`] ?? 0) + 1;
      }
      if (span / (2 * dt) > p.lim) {
        out.speed++;
        out.where[`speed:${p.name}`] = (out.where[`speed:${p.name}`] ?? 0) + 1;
      }
    }
  }
  return out;
}

/* 결과 파일마다 한 줄 — { phases(떨림), odd: { disp, raw }(이상한 움직임) } */
for (const path of process.argv.slice(2)) {
  /* 앱처럼 결과 읽기를 거친다 — 옛 결과의 '착지'(heelContact)도 화면과 같게 */
  const file = JSON.parse(readFileSync(path, 'utf8'));
  const r = (file.ok ? readPitch3dV2Result(file) : null) ?? file;
  if (!r.ok) {
    console.log(JSON.stringify({ failed: r.code ?? 'fail' }));
    continue;
  }
  const dt = displayFrameDt(r);
  const tr = trackOf(r);
  const disp = tr.frames as F3;
  const raw = r.joints.map((f: number[][]) => f.map((p) => p.map((v) => v / 1000))) as F3;
  console.log(JSON.stringify({ phases: measure(r, tr), odd: { disp: oddities(disp, dt), raw: oddities(raw, dt), man: mannequinOddities(r, tr) } }));
}
