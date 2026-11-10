/**
 * 가상 촬영 셀프 테스트 — 드라이브라인 공개 자료(3D 관절 중심, 투수 100명 · 411구 · 360Hz)를 가상 폰 두 대(옆 = 가슴 쪽 · 뒤 = 2루 쪽,
 * 촬영 안내의 거리 · 높이 · 각도 안에서 투구마다 달리)에 비춰 2D 를 만들고, 잡음 · 가림 · 좌우 바뀜을 합성 시험(synth-v2.mts)과 같은 규칙으로 섞어
 * 서버와 같은 길(pickSegment → fitPitch3dV2, 1배 초점 사전 · 움직임 틀)로 맞춘 뒤, 같은 3D 에서 잰 정답과 메카닉 점검 숫자 · 판정을 견준다.
 * 영상 · GPU 없음 — 2D 관절 모델(RTMW)은 안 거친다(그건 마커 촬영 채점이 본다).
 *
 *   node --import ./scripts/alias-register.mjs scripts/pitch-lab/obp/obp-synth.mts ~/obp-dl [--n=60] [--seed=1] [--part=0/4] [--out=<json>] [--dump=<폴더>] [--no-template]
 *
 * 자료(저장소 밖, CC BY-NC-SA — 결과를 앱에 넣지 않는 안쪽 시험에만): landmarks.csv · poi_metrics.csv(던지는 손) · metadata.csv(키). README.md.
 * 드라이브라인 자료에 없는 점은 몸 비율로 붙인다 — 코 · 귀(어깨선 위), 뒤꿈치 · 발끝(발목에서 무릎이 향한 쪽), 손 점(손 중심 옆). 그래서 착지 순간 ·
 * 머리 쪽은 실제보다 거칠 수 있다. 움직임 틀(motion-template.json)이 이 자료로 만든 것이라 틀이 메우는 구간은 실제보다 유리하게 나올 수 있다(--no-template 로 견줘 볼 것).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, FOCAL_PRIOR_1X, type Camera } from '@/lib/pitch-3d/camera';
import { add, cross, dot, mulV, normalize, scale, sub, svd3, mul3, transpose, det3, type Vec3, type Mat3 } from '@/lib/pitch-3d/linalg';
import { N_V2_JOINTS, V2J, V2_PAIRS, type V2Obs, type V2Track, type Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { fitPitch3dV2 } from '@/lib/pitch-3d/v2/fit';
import { pickSegment } from '@/lib/pitch-3d/v2/run-node';
import { mechChecks, type MechChecks } from '@/lib/pitch-3d/v2/mech-checks';
import { judgeMechanics } from '@/lib/pitch-3d/v2/mech-judge';
import { lookAt, rng } from '../synth.mts';

const dir = process.argv[2];
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const N = +arg('n', '60');
const SEED = +arg('seed', '1');
/** 촬영 씨앗 — 같은 투구를 다른 폰 자리 · 잡음으로 다시 '찍는다'(반복성) */
const CAM = +arg('cam', String(SEED));
const [PART, PARTS] = arg('part', '0/1').split('/').map(Number);
const OUT = arg('out', '');
const DUMP = arg('dump', '');
const motionTemplate = process.argv.includes('--no-template')
  ? undefined
  : JSON.parse(readFileSync(new URL('../../../lib/pitch-3d/v2/motion-template.json', import.meta.url), 'utf8'));

/* ── 자료 읽기 ── */
const csv = (f: string) => {
  const [head, ...lines] = readFileSync(join(dir, f), 'utf8').trim().split('\n');
  const cols = head.split(',');
  return { cols, rows: lines.map((l) => l.split(',')) };
};
const poi = csv('poi_metrics.csv');
const meta = csv('metadata.csv');
const handOf = new Map(poi.rows.map((r) => [r[0], r[poi.cols.indexOf('p_throws')] as 'R' | 'L']));
const heightOf = new Map(meta.rows.map((r) => [r[meta.cols.indexOf('session_pitch')], +r[meta.cols.indexOf('session_height_m')]]));
const lm = csv('landmarks.csv');
const C = (name: string) => lm.cols.indexOf(name);
const P3 = (r: string[], name: string): Vec3 => [+r[C(`${name}_x`)], +r[C(`${name}_y`)], +r[C(`${name}_z`)]];
const byPitch = new Map<string, string[][]>();
for (const r of lm.rows) (byPitch.get(r[0]) ?? byPitch.set(r[0], []).get(r[0])!).push(r);

/** 투구 고르기 — 투수마다 하나씩 먼저(투수 수만큼), 모자라면 더. 같은 씨앗이면 같은 투구 */
const pick = (() => {
  const all = [...byPitch.keys()].filter((k) => handOf.has(k) && heightOf.get(k));
  const r = rng(SEED * 7 + 3);
  const shuffled = all.map((k) => [r.u(), k] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const seen = new Set<string>();
  const first = shuffled.filter((k) => !seen.has(k.split('_')[0]) && seen.add(k.split('_')[0]));
  const rest = shuffled.filter((k) => !first.includes(k));
  const only = arg('only', '');
  return [...first, ...rest].slice(0, N).filter((k, i) => i % PARTS === PART && (!only || only.split(',').includes(k)));
})();

/* ── 3D 25관절(드라이브라인 좌표, 미터, z 위) ── */
const UP_OBP: Vec3 = [0, 0, 1];
const horiz = (v: Vec3, up: Vec3): Vec3 => sub(v, scale(up, dot(v, up)));
function joints25(r: string[], hand: 'R' | 'L', Hm: number): Vec3[] {
  const thr = hand === 'R' ? 'r' : 'l';
  const glv = hand === 'R' ? 'l' : 'r';
  const J: Record<string, Vec3> = {};
  J[`${thr}Sh`] = P3(r, 'shoulder_jc');
  J[`${glv}Sh`] = P3(r, 'glove_shoulder_jc');
  J[`${thr}El`] = P3(r, 'elbow_jc');
  J[`${glv}El`] = P3(r, 'glove_elbow_jc');
  J[`${thr}Wr`] = P3(r, 'wrist_jc');
  J[`${glv}Wr`] = P3(r, 'glove_wrist_jc');
  J[`${thr}Hip`] = P3(r, 'rear_hip');
  J[`${glv}Hip`] = P3(r, 'lead_hip');
  J[`${thr}Kn`] = P3(r, 'rear_knee_jc');
  J[`${glv}Kn`] = P3(r, 'lead_knee_jc');
  J[`${thr}An`] = P3(r, 'rear_ankle_jc');
  J[`${glv}An`] = P3(r, 'lead_ankle_jc');
  const hands: Record<string, Vec3> = { [thr]: P3(r, 'hand_jc'), [glv]: P3(r, 'glove_hand_jc') };
  const s = Hm / 1.83;
  /* 발: 뒤꿈치는 발목 밑 · 뒤, 발끝은 무릎이 향한 쪽으로(발목 높이 0.07 · 발 길이 0.2 × 키 비율) */
  for (const side of ['l', 'r']) {
    const an = J[`${side}An`];
    const kn = J[`${side}Kn`];
    const hp = J[`${side}Hip`];
    let fd = horiz(sub(kn, scale(add(hp, an), 0.5)), UP_OBP);
    if (Math.hypot(...fd) < 1e-3) fd = horiz(sub(kn, an), UP_OBP);
    fd = normalize(fd);
    J[`${side}He`] = add(an, add(scale(UP_OBP, -0.055 * s), scale(fd, -0.05 * s)));
    J[`${side}To`] = add(an, add(scale(UP_OBP, -0.06 * s), scale(fd, 0.15 * s)));
  }
  /* 머리: 어깨 가운데 위(몸통 축), 얼굴은 가슴 앞 */
  const neck = scale(add(J.lSh, J.rSh), 0.5);
  const tu = normalize(sub(neck, scale(add(J.lHip, J.rHip), 0.5)));
  const right = normalize(sub(J.rSh, J.lSh));
  const fwd = normalize(cross(tu, right));
  const head = add(neck, scale(tu, 0.13 * s));
  J.nose = add(head, scale(fwd, 0.09 * s));
  J.lEar = add(head, add(scale(right, -0.075 * s), scale(fwd, -0.01 * s)));
  J.rEar = add(head, add(scale(right, 0.075 * s), scale(fwd, -0.01 * s)));
  /* 손: 가운데 = 손 중심, 검지 · 새끼 = 아래팔과 손이 이루는 판에 수직으로 ±3.5cm */
  for (const side of ['l', 'r'] as const) {
    const wr = J[`${side}Wr`];
    const el = J[`${side}El`];
    const hm = hands[side];
    let n = cross(sub(wr, el), sub(hm, wr));
    if (Math.hypot(...n) < 1e-6) n = cross(sub(wr, el), UP_OBP);
    n = normalize(n);
    const sgn = side === 'r' ? 1 : -1;
    J[`${side}HandMid`] = hm;
    J[`${side}HandIdx`] = add(hm, scale(n, 0.035 * s * sgn));
    J[`${side}HandPinky`] = add(hm, scale(n, -0.035 * s * sgn));
  }
  return Object.entries(V2J)
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => J[name]);
}

/* ── 닮음 맞춤(Umeyama, 거울 없이) — 정답을 엔진 결과 좌표로 ── */
function similarity(A: Vec3[], B: Vec3[]) {
  const n = A.length;
  const ca = scale(A.reduce((s, v) => add(s, v), [0, 0, 0] as Vec3), 1 / n);
  const cb = scale(B.reduce((s, v) => add(s, v), [0, 0, 0] as Vec3), 1 / n);
  const M: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let va = 0;
  for (let i = 0; i < n; i++) {
    const a = sub(A[i], ca);
    const b = sub(B[i], cb);
    va += dot(a, a);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[r * 3 + c] += b[r] * a[c];
  }
  const { U, s, V } = svd3(M);
  const d = det3(mul3(U, transpose(V))) < 0 ? -1 : 1;
  const Dm: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, d];
  const R = mul3(mul3(U, Dm), transpose(V));
  const k = (s[0] + s[1] + d * s[2]) / va;
  return (v: Vec3) => add(scale(mulV(R, sub(v, ca)), k), cb);
}

/* ── 2D 만들기(synth-v2.mts makeV2Track 과 같은 잡음 · 가림 · 바뀜) ── */
const NOISE = 0.008;
const FLIP = 0.03;
type Sc = { D: number; k: number; up: number; roll: number; W: number; H: number };
function track(at: (t: number) => Vec3[], t0: number, t1: number, release: number, cam: Camera, cfg: Sc, which: 'side' | 'back', off: number, Hm: number, seed: number): V2Track {
  const frames: V2Track['frames'] = [];
  const personPx = (cam.f * Hm) / cfg.D;
  const LR17 = V2_PAIRS.filter(([l]) => l < 17);
  const step = 1 / 120;
  for (let k = 0, tr = t0; tr <= t1; k++, tr = t0 + k * step) {
    const r = rng(seed * 100003 + k * 7919);
    const P = at(tr);
    const cams = P.map((X) => add(mulV(cam.R, X), cam.t));
    const img = P.map((X) => project(cam, X) ?? [0, 0]);
    const vis = new Array(N_V2_JOINTS).fill(0.95);
    const pts = img.map((p) => [p[0], p[1]] as [number, number]);
    for (const [a, b] of LR17) {
      const dd = Math.hypot(img[a][0] - img[b][0], img[a][1] - img[b][1]);
      const dz = cams[a][2] - cams[b][2];
      if (dd < personPx * 0.06 && Math.abs(dz) > 0.1) {
        const far = dz > 0 ? a : b;
        const near = far === a ? b : a;
        vis[far] = 0.35;
        pts[far] = [pts[far][0] + (pts[near][0] - pts[far][0]) * 0.25, pts[far][1] + (pts[near][1] - pts[far][1]) * 0.25];
      }
    }
    const nearRelease = Math.abs(tr - release) < 0.06;
    const isHand = (j: number) => j >= V2J.lHandMid;
    for (let j = 0; j < N_V2_JOINTS; j++) {
      const limb = (j >= 3 && j <= 6) || isHand(j) ? 1.6 : j >= 9 && j < 17 ? 1.2 : 1;
      const blur = nearRelease && (j === V2J.rWr || j === V2J.lWr || j === V2J.rEl || j === V2J.lEl || isHand(j)) ? 2 : 1;
      const occ = vis[j] < 0.5 ? 2 : 1;
      const s = NOISE * personPx * limb * blur * occ;
      pts[j] = [pts[j][0] + r.n() * s, pts[j][1] + r.n() * s];
      if (blur > 1) vis[j] = Math.min(vis[j], 0.45);
    }
    for (const [wr, hand] of [
      [V2J.lWr, [V2J.lHandIdx, V2J.lHandMid, V2J.lHandPinky]],
      [V2J.rWr, [V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky]],
    ] as const)
      for (const j of hand) vis[j] = Math.min(vis[j], vis[wr]);
    const order = Array.from({ length: N_V2_JOINTS }, (_, j) => j);
    const swap = (pairs: readonly (readonly [number, number])[]) => {
      for (const [a, b] of pairs) [order[a], order[b]] = [order[b], order[a]];
    };
    if (which === 'back') {
      if (r.u() < FLIP) swap([[1, 2], [3, 4], [5, 6], [V2J.lHandMid, V2J.rHandMid], [V2J.lHandIdx, V2J.rHandIdx], [V2J.lHandPinky, V2J.rHandPinky]]);
      if (r.u() < FLIP) swap([[7, 8], [9, 10], [11, 12], [13, 14], [15, 16]]);
    }
    const p: V2Obs[] = order.map((src) => [pts[src][0], pts[src][1], vis[src]]);
    frames.push({ t: tr - t0 + off, p });
  }
  return { W: cfg.W, H: cfg.H, fps: 120, frames };
}

const dec = (t: V2Track, fps: number): V2Track => {
  const out: V2Track['frames'] = [];
  let last = -1e9;
  for (const f of t.frames) {
    if (f.t - last < 1 / fps - 1e-4) continue;
    out.push(f);
    last = f.t;
  }
  return { ...t, fps, frames: out };
};
const cut = (t: V2Track, w: { fromSec: number; toSec: number }): V2Track => ({ ...t, frames: t.frames.filter((f) => f.t >= w.fromSec - 1e-6 && f.t <= w.toSec + 1e-6) });

/* ── 판정에 쓰는 숫자 ── */
const KEYS: [string, (m: MechChecks) => number | null | undefined][] = [
  ['드리프트 니업 cm', (m) => m.drift?.aheadAtKneeUpCm],
  ['착지 때 상체 °', (m) => m.separation?.trunkOpenAtPlantDeg],
  ['몸통 도는 때 %', (m) => m.separation?.trunkHalfPct],
  ['골반 감속 %', (m) => m.block?.pelvisDecelPct],
  ['앞무릎 착지 °', (m) => m.block?.kneeAtPlantDeg],
  ['앞무릎 펴짐 °', (m) => m.block?.kneeExtensionDeg],
  ['몸통 앞 기울기 °', (m) => m.trunkTilt?.forwardDeg],
  ['착지 손 높이 cm', (m) => m.arm?.handRiseCm],
  ['착지 손 높이 팔길이%', (m) => (m.arm?.handRise != null ? m.arm.handRise * 100 : null)],
];
const SHOWN = ['drift', 'trunkTiming', 'trunkAtPlant', 'block', 'hand'];

type Row = { pitch: string; hand: 'R' | 'L'; ok: boolean; code?: string; angle: number; dSide: number; chestOff?: number; diffs: Record<string, number>; geom: Record<string, number>; judge: Record<string, [string, string]>; evMs?: (number | null)[] };
const rows: Row[] = [];
for (const [i, pitch] of pick.entries()) {
  const hand = handOf.get(pitch)!;
  const Hm = heightOf.get(pitch)!;
  const rs = byPitch.get(pitch)!;
  const r0 = rs[0];
  const num = (k: string) => (r0[C(k)] === '' ? NaN : +r0[C(k)]);
  const ev = { pkh: num('pkh_time'), fp10: num('fp_10_time'), fp100: num('fp_100_time'), br: num('BR_time') };
  const ts = rs.map((r) => +r[C('time')]);
  /* 자료 순간 검사 — 발판 순간이 비었거나, 공 놓은 뒤거나, 앞발목이 처음 멈춘 때(수평 0.5m/s 밑)와 0.1초 넘게 어긋나면
     그 투구의 정답 순간을 못 믿는다(403구 중 가운데 0ms · 90% 안 −47 ~ +25ms) */
  const ankleSpeedAt = (k: number) => {
    if (k < 3 || k > ts.length - 4) return Infinity;
    const a = P3(rs[k - 3], 'lead_ankle_jc');
    const b = P3(rs[k + 3], 'lead_ankle_jc');
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / (ts[k + 3] - ts[k - 3]);
  };
  const stopK = ts.findIndex((t, k) => t > ev.br - 0.4 && t < ev.br + 0.2 && ankleSpeedAt(k) < 0.5);
  if (!(Number.isFinite(ev.fp10) && Number.isFinite(ev.fp100) && ev.fp100 < ev.br && stopK >= 0 && Math.abs(ts[stopK] - ev.fp100) <= 0.1)) {
    rows.push({ pitch, hand, ok: false, code: 'obp-events', angle: 0, dSide: 0, diffs: {}, geom: {}, judge: {} });
    continue;
  }
  const raw = rs.map((r) => joints25(r, hand, Hm));
  /* 드라이브라인 → 합성 좌표(x 투구 방향 · y 위 · z = x × y, 미터, 원점 = 처음 축발목 밑 바닥) */
  /* 자료가 다리를 들기 시작한 뒤부터인 투구가 많다(411구 중 180구가 니업 0.6초 안) — 실제 영상처럼 첫 자세로 0.8초 멈춰 서 있게 한다 */
  const aOf = (t: number) => {
    if (t <= ts[0]) return raw[0];
    if (t >= ts.at(-1)!) return raw.at(-1)!;
    let k = 0;
    while (k < ts.length - 2 && ts[k + 1] < t) k++;
    const w = Math.max(0, Math.min(1, (t - ts[k]) / (ts[k + 1] - ts[k])));
    return raw[k].map((p, j) => add(scale(p, 1 - w), scale(raw[k + 1][j], w)));
  };
  const thrAn = hand === 'R' ? V2J.rAn : V2J.lAn;
  const glvAn = hand === 'R' ? V2J.lAn : V2J.rAn;
  const start = Math.min(ts[0] - 0.8, ev.pkh - 1.0);
  const end = ev.br + 1.0;
  const p0 = aOf(start);
  const F = normalize(horiz(sub(aOf(ev.fp100)[glvAn], p0[thrAn]), UP_OBP));
  const Z = cross(F, UP_OBP);
  const o: Vec3 = [p0[thrAn][0], p0[thrAn][1], 0];
  const toSyn = (p: Vec3): Vec3 => {
    const d = sub(p, o);
    return [dot(d, F), dot(d, UP_OBP), dot(d, Z)];
  };
  const at = (t: number) => aOf(t).map(toSyn);
  /* 가상 폰 — 옆은 가슴 쪽(우투 3루 · 좌투 1루), 뒤는 2루 쪽에서 각도만큼, 안내 범위 안에서 투구마다 */
  const r = rng(CAM * 1000 + i * 31 + 7);
  const u = (a: number, b: number) => a + (b - a) * r.u();
  const s0 = at(start);
  /* 가슴 쪽 = 투구 방향에 수직인 두 쪽 중 첫 장면 가슴이 향한 쪽(첫 장면에 이미 몸을 틀었어도 옆에서 본다) */
  const chest0 = cross([0, 1, 0], sub(s0[V2J.rHip], s0[V2J.lHip]));
  const chest: Vec3 = [0, 0, chest0[2] >= 0 ? 1 : -1];
  const chestOff = (Math.acos(Math.abs(normalize(horiz(chest0, [0, 1, 0]))[2])) * 180) / Math.PI;
  const angle = u(70, 110);
  const a = (angle * Math.PI) / 180;
  const backDir = normalize(add(scale(chest, Math.cos(a)), scale([-1, 0, 0], Math.sin(a))));
  const target: Vec3 = [0.6, 0.9 * (Hm / 1.83), 0];
  const side: Sc = { D: u(3.5, 5), k: u(0.7, 0.84), up: u(0.05, 0.45), roll: u(-2, 2), W: 1920, H: 1080 };
  const back: Sc = { D: u(4, 5), k: u(0.7, 0.84), up: u(0.15, 0.6), roll: u(-2, 2), W: 1080, H: 1920 };
  const camS = lookAt(add(target, add(scale(chest, side.D), [0, side.up, 0])), target, side.k * 1920, side.W, side.H, side.roll);
  const camB = lookAt(add(target, add(scale(backDir, back.D), [0, back.up, 0])), target, back.k * 1920, back.W, back.H, back.roll);
  const offB = u(0.05, 0.4);
  const sideT = track(at, start, end, ev.br, camS, side, 'side', 0, Hm, i * 10 + 1 + CAM * 7777);
  const backT = track(at, start - offB * 0.5, end + 0.1, ev.br, camB, back, 'back', offB, Hm, i * 10 + 2 + CAM * 7777);
  const seg = pickSegment({ side: dec(sideT, 30), back: dec(backT, 30), fps: { side: 120, back: 120 } } as never) as never as {
    ok: boolean; code?: string; side: { fromSec: number; toSec: number }; back: { fromSec: number; toSec: number }; events: never;
  };
  const row: Row = { pitch, hand, ok: false, angle, dSide: side.D, chestOff: chestOff * Math.sign(chest0[2]), diffs: {}, geom: {}, judge: {} };
  if (process.env.V) console.error(`${pitch} 자료 ${ts[0].toFixed(2)}~${ts.at(-1)!.toFixed(2)} · 니업 ${ev.pkh} · 닿음 ${ev.fp10} · 착지 ${ev.fp100} · 공 ${ev.br} · 구간 ${start.toFixed(2)}~${end.toFixed(2)}`);
  if (!seg.ok) {
    if (process.env.V) console.error(`  구간 실패 ${seg.code} ${JSON.stringify((seg as never as { detail?: unknown }).detail)}`);
    rows.push({ ...row, code: `segment:${seg.code}` });
    continue;
  }
  if (process.env.V) { const d = (seg as never as { diag: Record<string, unknown> }).diag; console.error(`  방향 ${d.direction} 손목 ${d.wrist} 앞다리 ${d.lead}`); }
  if (process.env.V) console.error(`  엔진 순간(실제 초) 니업 ${(seg.events as never as { kneeUp: number | null }).kneeUp != null ? ((seg.events as never as { kneeUp: number }).kneeUp + start).toFixed(2) : '-'} · 착지 ${((seg.events as never as { footPlant: number }).footPlant + start).toFixed(2)} · 공 ${((seg.events as never as { release: number }).release + start).toFixed(2)}`);
  const { result } = fitPitch3dV2({
    side: cut(sideT, seg.side),
    back: cut(backT, seg.back),
    hand,
    heightCm: Math.round(Hm * 100),
    jobId: '00000000-0000-4000-8000-000000000000',
    poseModel: 'obp-synth',
    events: seg.events,
    focalPrior: FOCAL_PRIOR_1X,
    ...(motionTemplate ? { motionTemplate } : {}),
  } as never);
  if (!result.ok) {
    rows.push({ ...row, code: (result as { code: string }).code });
    continue;
  }
  const res = result as Pitch3dV2Ok;
  /* 정답: 결과 장면 시각(옆 영상 = 실제 − start) 의 진짜 3D 를 결과 좌표로 닮음 맞춤 → 같은 점검 함수 */
  const truth = res.t.map((t) => at(t + start));
  const body = [V2J.lSh, V2J.rSh, V2J.lEl, V2J.rEl, V2J.lWr, V2J.rWr, V2J.lHip, V2J.rHip, V2J.lKn, V2J.rKn, V2J.lAn, V2J.rAn];
  const A: Vec3[] = [];
  const B: Vec3[] = [];
  for (let k = 0; k < truth.length; k++) for (const j of body) (A.push(truth[k][j]), B.push(res.joints[k][j] as Vec3));
  const T = similarity(A, B);
  const idx = (t: number) => res.t.reduce((bi, x, k) => (Math.abs(x + start - t) < Math.abs(res.t[bi] + start - t) ? k : bi), 0);
  const tr: Pitch3dV2Ok = {
    ...res,
    joints: truth.map((f) => f.map((p) => T(p).map(Math.round) as never)),
    events: { ...res.events, kneeUp: idx(ev.pkh), footContact: idx(ev.fp10), footPlant: idx(ev.fp100), release: idx(ev.br) },
  };
  const hcm = Hm * 100;
  const ma = mechChecks(res, hcm);
  const mt = mechChecks(tr, hcm);
  /* 같은 순간(엔진이 잡은 장면)의 정답 — 3D 탓만 */
  const mg = mechChecks({ ...tr, events: res.events }, hcm);
  for (const [k, f] of KEYS) {
    const x = f(ma);
    const y = f(mt);
    const g = f(mg);
    if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) row.diffs[k] = x - y;
    if (x != null && g != null && Number.isFinite(x) && Number.isFinite(g)) row.geom[k] = x - g;
  }
  /* 착지 손 높이 띠(report.ts HAND_BAND 와 같은 선 — 팔 길이 비율 −0.14 · 0 · 0.14) */
  const handBand = (m: MechChecks) => {
    const v = m.arm?.handRise;
    return v == null || !Number.isFinite(v) ? '-' : v < -0.14 ? 'improve' : v < 0 ? 'edge' : v < 0.14 ? 'fair' : 'good';
  };
  row.judge.hand = [handBand(ma), handBand(mt)];
  const ja = judgeMechanics([ma], hcm).items;
  const jt = judgeMechanics([mt], hcm).items;
  for (const it of ja) if (SHOWN.includes(it.key)) row.judge[it.key] = [it.status, jt.find((x) => x.key === it.key)?.status ?? '-'];
  const evMs = (['kneeUp', 'footContact', 'footPlant', 'release'] as const).map((k) => {
    const a = res.events[k];
    const b = tr.events[k];
    return a == null || b == null ? null : Math.round((res.t[a] - res.t[b]) * 1000);
  });
  row.evMs = evMs;
  rows.push({ ...row, ok: true });
  /* --dump=<폴더>: 투구마다 엔진 결과 · 정답 관절 · 정답 순간(결과 시각)을 남긴다 — 순간 찾기 규칙을 밖에서 빨리 바꿔 보려고 */
  if (DUMP)
    writeFileSync(
      `${DUMP}/${pitch}.json`,
      JSON.stringify({ pitch, hand, heightM: Hm, t: res.t, joints: res.joints, truth: tr.joints, events: res.events, truthT: { pkh: ev.pkh - start, fp10: ev.fp10 - start, fp100: ev.fp100 - start, br: ev.br - start } })
    );
  if (process.env.V) console.error(`${pitch} ${hand} 각 ${angle.toFixed(0)}° · 순간차ms(니업 · 닿음 · 착지 · 릴리스) ${row.evMs?.join('/')} · ${Object.entries(row.diffs).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')}`);
}

if (OUT) writeFileSync(OUT, JSON.stringify(rows));
/* 엔진이 투구 순간을 0.15초 넘게 틀리게 잡은 투구는 숫자 비교에서 따로 센다(다른 장면을 견주게 되므로) */
const evBad = (r: Row) => (r.evMs ?? []).some((x) => x != null && Math.abs(x) > 150);
const okRows = rows.filter((r) => r.ok && !evBad(r));
console.log(`자료 순간 이상으로 뺀 투구 ${rows.filter((r) => r.code === 'obp-events').length}`);
console.log(`순간을 0.15초 넘게 틀린 투구 ${rows.filter((r) => r.ok && evBad(r)).length}: ${rows.filter((r) => r.ok && evBad(r)).map((r) => r.pitch).join(' ')}`);
const tried = rows.filter((r) => r.code !== 'obp-events');
console.log(`${tried.length}구 · 맞춤 ${tried.filter((r) => r.ok).length} · 실패 ${tried.filter((r) => !r.ok).length}${tried.some((r) => !r.ok) ? ` (${tried.filter((r) => !r.ok).map((r) => `${r.pitch} ${r.code}`).join(', ')})` : ''}`);
const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))];
for (const hand of ['R', 'L', null] as const) {
  const rs = okRows.filter((r) => hand == null || r.hand === hand);
  if (!rs.length) continue;
  console.log(`\n${hand === 'R' ? '우투' : hand === 'L' ? '좌투' : '모두'} ${rs.length}구`);
  for (const [k] of KEYS) {
    const v = rs.map((r) => r.diffs[k]).filter((x) => x != null);
    if (!v.length) continue;
    const g = rs.map((r) => r.geom[k]).filter((x) => x != null);
    const med = (xs: number[]) => q(xs, 0.5);
    console.log(
      `  ${k.padEnd(12)} |차| 가운데 ${med(v.map(Math.abs)).toFixed(1)} · 90% ${q(v.map(Math.abs), 0.9).toFixed(1)} · 치우침(가운데) ${med(v).toFixed(1)}` +
        (g.length ? `  | 같은 순간: |차| 가운데 ${med(g.map(Math.abs)).toFixed(1)} · 90% ${q(g.map(Math.abs), 0.9).toFixed(1)} · 치우침 ${med(g).toFixed(1)}` : '')
    );
  }
  for (const [n, name] of ['니업', '닿음', '착지', '공 놓음'].entries()) {
    const v = rs.map((r) => r.evMs?.[n]).filter((x): x is number => x != null);
    if (v.length) console.log(`  순간 ${name.padEnd(4)} 엔진 − 정답 ms 가운데 ${q(v, 0.5)} · |차| 90% ${q(v.map(Math.abs), 0.9)}`);
  }
  for (const key of SHOWN) {
    const js = rs.map((r) => r.judge[key]).filter(Boolean);
    const same = js.filter(([a, t]) => a === t).length;
    const unsure = js.filter(([a]) => a === 'unsure').length;
    const falseImprove = js.filter(([a, t]) => a === 'improve' && t !== 'improve').length;
    const missImprove = js.filter(([a, t]) => t === 'improve' && a !== 'improve').length;
    console.log(`  판정 ${key.padEnd(12)} 같음 ${same}/${js.length} · 확인 안 됨 ${unsure} · 잘못 '고칠 점' ${falseImprove} · 놓친 '고칠 점' ${missImprove}`);
  }
}
