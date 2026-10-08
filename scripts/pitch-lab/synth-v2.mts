/**
 * 합성 투수 v2 — synth.mts 의 17관절 투수에 귀 · 손 MCP 를 더해(25관절) 가짜 카메라 둘로 비춘 V2Track 을 만든다.
 * 쓰는 곳: scripts/pitch-3d-v2-selftest.mts. 시간 · 잡음 · 가려짐 규칙은 synth.mts makeTrack 과 같다(같은 씨앗이면 17관절 2D 가 같다).
 */
import { project, type Camera } from '../../lib/pitch-3d/camera.ts';
import {
  add,
  cross,
  mulV,
  norm,
  normalize,
  scale,
  sub,
  type Vec3,
} from '../../lib/pitch-3d/linalg.ts';
import { J } from '../../lib/pitch-3d/motion.ts';
import {
  N_V2_JOINTS,
  V2_PAIRS,
  V2J,
  type V2Obs,
  type V2Track,
} from '../../lib/pitch-3d/v2/contract.ts';
import { EV, H, pitcherHand, rng, type Scenario } from './synth.mts';

const Y_: Vec3 = [0, 1, 0];

/** 17관절 3D → 25관절 3D(귀 · 손 MCP 를 몸 비율로 붙인다) */
export function pitcher25(t: number, hand: 'R' | 'L'): Vec3[] {
  const p = pitcherHand(t, hand);
  const out: Vec3[] = Array.from({ length: N_V2_JOINTS }, () => [0, 0, 0]);
  for (let j = 0; j < 17; j++) out[j] = p[j];
  const left = normalize(sub(p[J.lSh], p[J.rSh]));
  const fwd = normalize(cross(left, Y_));
  out[V2J.lEar] = add(
    p[J.nose],
    add(scale(left, 0.075 * H), add(scale(fwd, -0.07 * H), scale(Y_, 0.01 * H)))
  );
  out[V2J.rEar] = add(
    p[J.nose],
    add(scale(left, -0.075 * H), add(scale(fwd, -0.07 * H), scale(Y_, 0.01 * H)))
  );
  for (const side of ['l', 'r'] as const) {
    const wr = p[side === 'l' ? J.lWr : J.rWr];
    const el = p[side === 'l' ? J.lEl : J.rEl];
    const fore = normalize(sub(wr, el));
    let lat = cross(fore, Y_);
    lat = norm(lat) > 1e-6 ? normalize(lat) : left;
    const sgn = side === 'l' ? 1 : -1;
    out[side === 'l' ? V2J.lHandMid : V2J.rHandMid] = add(wr, scale(fore, 0.09 * H));
    out[side === 'l' ? V2J.lHandIdx : V2J.rHandIdx] = add(
      wr,
      add(scale(fore, 0.085 * H), scale(lat, 0.022 * H * sgn))
    );
    out[side === 'l' ? V2J.lHandPinky : V2J.rHandPinky] = add(
      wr,
      add(scale(fore, 0.08 * H), scale(lat, -0.04 * H * sgn))
    );
  }
  return out;
}

/** V2Track — 실제 시각 → 영상 시각(슬로모 배수 · 시작 어긋남), 재생 30fps 같은 장면, 잡음 · 가려짐 · 뒤바뀜(synth.mts 와 같은 규칙) */
export function makeV2Track(
  sc: Scenario,
  cam: Camera,
  cfg: Scenario['side'],
  which: 'side' | 'back',
  seed: number
): {
  track: V2Track;
  toMedia: (t: number) => number;
  contentReal: Map<number, number>;
} {
  const slow = which === 'side' ? sc.slowSide : sc.slowBack;
  const off = which === 'side' ? 0 : sc.offBack;
  const realStart = which === 'side' ? -0.05 : -0.25;
  const realEnd = which === 'side' ? (sc.sideEnd ?? 1.5) : (sc.backEnd ?? 1.6);
  const toMedia = (tr: number) => (tr - realStart + off) * slow;
  const fromMedia = (tm: number) => tm / slow + realStart - off;
  const mediaEnd = toMedia(realEnd);
  const step = which === 'side' ? sc.sampleSide : sc.sampleBack;
  const frames: V2Track['frames'] = [];
  const contentReal = new Map<number, number>();
  const personPx = (cam.f * H) / cfg.D;
  const LR17 = V2_PAIRS.filter(([l]) => l < 17);
  for (let tm = 0; tm <= mediaEnd; tm += step) {
    const shownIdx = Math.floor(tm * 30);
    const shown = shownIdx / 30;
    const r = rng(seed * 100003 + shownIdx * 7919);
    const tr = fromMedia(shown);
    const P = pitcher25(Math.max(0, Math.min(1.5, tr)), sc.hand);
    const cams = P.map((X) => add(mulV(cam.R, X), cam.t));
    const img = P.map((X) => project(cam, X) ?? [0, 0]);
    const vis = new Array(N_V2_JOINTS).fill(0.95);
    const pts = img.map((p) => [p[0], p[1]] as [number, number]);
    if (sc.occlusion) {
      for (const [a, b] of LR17) {
        const dd = Math.hypot(img[a][0] - img[b][0], img[a][1] - img[b][1]);
        const dz = cams[a][2] - cams[b][2];
        if (dd < personPx * 0.06 && Math.abs(dz) > 0.1) {
          const far = dz > 0 ? a : b;
          const near = far === a ? b : a;
          vis[far] = 0.35;
          pts[far] = [
            pts[far][0] + (pts[near][0] - pts[far][0]) * 0.25,
            pts[far][1] + (pts[near][1] - pts[far][1]) * 0.25,
          ];
        }
      }
    }
    const nearRelease = Math.abs(tr - EV.release) < 0.06;
    const isHand = (j: number) => j >= V2J.lHandMid;
    for (let j = 0; j < N_V2_JOINTS; j++) {
      const limb = (j >= 3 && j <= 6) || isHand(j) ? 1.6 : j >= 9 && j < 17 ? 1.2 : 1;
      const blur =
        nearRelease &&
        (j === J.rWr || j === J.lWr || j === J.rEl || j === J.lEl || isHand(j))
          ? 2
          : 1;
      const occ = vis[j] < 0.5 ? 2 : 1;
      const s = sc.noise * personPx * limb * blur * occ;
      pts[j] = [pts[j][0] + r.n() * s, pts[j][1] + r.n() * s];
      if (blur > 1) vis[j] = Math.min(vis[j], 0.45);
    }
    /* 손 점은 손목 확신을 따른다(손목이 가려지면 손도) */
    for (const [wr, hand] of [
      [J.lWr, [V2J.lHandIdx, V2J.lHandMid, V2J.lHandPinky]],
      [J.rWr, [V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky]],
    ] as const)
      for (const j of hand) vis[j] = Math.min(vis[j], vis[wr]);
    const order = Array.from({ length: N_V2_JOINTS }, (_, j) => j);
    const swap = (pairs: readonly (readonly [number, number])[]) => {
      for (const [a, b] of pairs) [order[a], order[b]] = [order[b], order[a]];
    };
    if (which === 'back') {
      if (sc.backMirror) swap(V2_PAIRS);
      /* 팔 묶음이 뒤바뀌면 손도 함께(관절 모델은 팔 전체를 바꾼다) */
      if (r.u() < sc.flipRate)
        swap([
          [1, 2],
          [3, 4],
          [5, 6],
          [V2J.lHandMid, V2J.rHandMid],
          [V2J.lHandIdx, V2J.rHandIdx],
          [V2J.lHandPinky, V2J.rHandPinky],
        ]);
      if (r.u() < sc.flipRate)
        swap([
          [7, 8],
          [9, 10],
          [11, 12],
          [13, 14],
          [15, 16],
        ]);
    }
    const p: V2Obs[] = order.map((src) => [pts[src][0], pts[src][1], vis[src]]);
    frames.push({ t: tm, p });
    contentReal.set(tm, Math.max(0, Math.min(1.5, tr)));
  }
  return {
    track: { W: cfg.W, H: cfg.H, fps: Math.round(1 / step), frames },
    toMedia,
    contentReal,
  };
}
