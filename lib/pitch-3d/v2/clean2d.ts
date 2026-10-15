import { median } from '@/lib/pitch-3d/linalg';
import { V2J, type V2Obs, type V2Track } from '@/lib/pitch-3d/v2/contract';

/**
 * 2D 모델(RTMW) 버릇 걷기 — 맞추기 전에 한 영상 안에서만 본다(두 영상 기하는 v1 core 가 맡는다).
 *
 * 다리 겹침: 다른 다리에 가려진 무릎 · 발목 · 발을 2D 모델은 보이는 다리 위에 겹쳐, 그것도 확신 0.7 쯤으로 찍는다. 좌우 이름이 바뀐 것과
 * 달리 두 점이 한 자리라 이름 바꾸기(v1 repairLabels)로는 못 고치고, 그대로 교차하면 가려진 다리가 보이는 다리 쪽으로 끌려 다리가 장면마다
 * 30cm 넘게 튀었다(드라이브라인 30구에 겹침을 섞은 시험: 다리 오차 1.8 → 8.8cm, 이것과 fit.ts 두 영상 가르기로 6.2cm). 두 점이 사람 키의 LEG_OVERLAP 안이면, 앞뒤의 겹치지
 * 않은 장면에서 이어 온 자리와 더 멀리 떨어진 쪽(가려진 다리)을 그 영상에서 안 보임으로 둔다 — 그 다리는 다른 영상 · 틀이 정한다.
 * 실제로 엇갈려 지나가는 다리는 두 점 다 앞뒤와 이어져 그대로 둔다.
 */

const LEG_PAIRS: [number, number][] = [
  [V2J.lKn, V2J.rKn],
  [V2J.lAn, V2J.rAn],
  [V2J.lHe, V2J.rHe],
  [V2J.lTo, V2J.rTo],
];
/** 두 다리 점이 이만큼(사람 키 대비) 가까우면 겹침 */
const LEG_OVERLAP = 0.035;
/** 앞뒤로 겹치지 않은 장면을 찾는 최대 장면 수 */
const LOOK = 20;
/**
 * 가려진 다리로 볼 만큼 앞뒤와 더 어긋남 — 이어 온 자리와의 거리가 다른 쪽의 DROP_RATIO 배 + 사람 키의 DROP_MARGIN 넘을 때만.
 * 1.5배 + 2% 면 섞인 점의 31%를 잡았지만 멀쩡히 엇갈리는 다리까지 걷어 합성 시험 셋(디딘 다리 · 발 이동 · 원근)이 깨졌다.
 * 3배 + 5% 는 23%를 잡고 잘못 걷는 것이 줄어 시험이 그대로다. 나머지는 fit.ts 의 두 영상 가르기가 잡는다.
 */
const DROP_RATIO = 3;
const DROP_MARGIN = 0.05;
/** 겹친 점 확신을 이만큼으로 — 엔진이 '안 보임'으로 보는 0.3 밑 */
const HIDDEN_V = 0.2;

export function dropLegOverlaps(track: V2Track): { track: V2Track; dropped: number } {
  const fr = track.frames;
  const seen = (p: V2Obs | undefined) => !!p && p[2] >= 0.3;
  const heights = fr.flatMap((f) => {
    const n = f.p[V2J.nose];
    const a = [f.p[V2J.lAn], f.p[V2J.rAn]].filter(seen);
    return seen(n) && a.length ? [Math.max(...a.map((p) => p[1])) - n[1]] : [];
  });
  const person = heights.length ? median(heights) : (track.H || 1) * 0.5;
  const out = fr.map((f) => ({ t: f.t, p: f.p.map((q) => [...q] as V2Obs) }));
  let dropped = 0;
  for (const [a, b] of LEG_PAIRS) {
    const dup = fr.map(
      (f) =>
        seen(f.p[a]) &&
        seen(f.p[b]) &&
        Math.hypot(f.p[a][0] - f.p[b][0], f.p[a][1] - f.p[b][1]) < LEG_OVERLAP * person
    );
    const clean = (k: number) => !dup[k] && seen(fr[k].p[a]) && seen(fr[k].p[b]);
    for (let k = 0; k < fr.length; k++) {
      if (!dup[k]) continue;
      let kp = -1;
      for (let q = k - 1; q >= Math.max(0, k - LOOK); q--) if (clean(q)) { kp = q; break; }
      let kn = -1;
      for (let q = k + 1; q <= Math.min(fr.length - 1, k + LOOK); q++) if (clean(q)) { kn = q; break; }
      if (kp < 0 && kn < 0) continue;
      const pred = (j: number): [number, number] => {
        if (kp < 0) return [fr[kn].p[j][0], fr[kn].p[j][1]];
        if (kn < 0) return [fr[kp].p[j][0], fr[kp].p[j][1]];
        const s = (k - kp) / (kn - kp);
        return [
          fr[kp].p[j][0] + (fr[kn].p[j][0] - fr[kp].p[j][0]) * s,
          fr[kp].p[j][1] + (fr[kn].p[j][1] - fr[kp].p[j][1]) * s,
        ];
      };
      const dev = (j: number) => {
        const P = pred(j);
        return Math.hypot(fr[k].p[j][0] - P[0], fr[k].p[j][1] - P[1]);
      };
      const da = dev(a);
      const db = dev(b);
      const hid = da > db ? a : b;
      const dh = Math.max(da, db);
      const dk = Math.min(da, db);
      if (dh < DROP_RATIO * dk + DROP_MARGIN * person) continue;
      out[k].p[hid][2] = Math.min(out[k].p[hid][2], HIDDEN_V);
      dropped++;
    }
  }
  return { track: { ...track, frames: out }, dropped };
}

/*
 * 어깨 이름 뒤바뀜 — 몸통이 도는 동안 2D 모델이 두 어깨가 실제로 엇갈리기 몇 장면 전에 이름을 미리 바꿔 찍는다(2026-10-15 실험실 샘플 1 뒤 영상:
 * 착지 4장면 전에 왼 어깨 이름이 한 장면에 124px 뛰어 오른 어깨 자리로, 실제 엇갈림은 착지 2~3장면 뒤 — 그사이 6장면 팔꿈치까지 바뀌고 두 손목은
 * 공 위에 겹쳐 엔진 좌우 고침(repairLabels)이 못 잡았다: 손목이 겹쳐 바꿔도 30% 넘게 안 나아지고, 앞뒤 장면도 같이 틀려 '앞뒤와 이어짐' 조건이
 * 틀린 쪽을 지켰다. 3D 던지는 어깨가 몸 가운데로 끌려 팔이 들리고 벌어졌다).
 * 두 손목이 겹쳐 있고 두 어깨가 SH_APART 넘게 떨어져 있는데 어깨 이름 하나가 한 장면에 사람 키의 SH_JUMP 넘게 뛰어 다른 어깨의 앞 장면 자리 SH_TAKE 안에 내리면 그 장면부터, 두 어깨 점이 SH_CROSS 안으로
 * 가까워지거나(실제 엇갈림) 뛴 이름이 제자리로 돌아올 때까지(최대 SH_MAX 장면) 그 영상의 팔 이름을 바로잡는다(아래).
 */
const SH_JUMP = 0.1;
/**
 * 뛰기 전 두 어깨가 이만큼(사람 키 대비) 넘게 떨어져 있었을 때만 — 실제로 엇갈리는 순간(어깨선이 카메라 축과 나란해져 두 점이 가까움)은
 * 이름이 자리를 바꾸는 게 맞다. 실험실 8샘플 · 마커 15구에서 실제 엇갈림은 7~12%, 샘플 1 의 미리 바꿈은 16%.
 */
const SH_APART = 0.13;
const SH_TAKE = 0.05;
const SH_CROSS = 0.05;
const SH_MAX = 15;
const ARM_PAIRS_ALL: [number, number][] = [
  [V2J.lSh, V2J.rSh],
  [V2J.lEl, V2J.rEl],
  [V2J.lWr, V2J.rWr],
  [V2J.lHandIdx, V2J.rHandIdx],
  [V2J.lHandMid, V2J.rHandMid],
  [V2J.lHandPinky, V2J.rHandPinky],
];

export function fixShoulderSwaps(track: V2Track): { track: V2Track; dropped: number } {
  const fr = track.frames;
  const seen = (p: V2Obs | undefined) => !!p && p[2] >= 0.3;
  const heights = fr.flatMap((f) => {
    const n = f.p[V2J.nose];
    const a = [f.p[V2J.lAn], f.p[V2J.rAn]].filter(seen);
    return seen(n) && a.length ? [Math.max(...a.map((p) => p[1])) - n[1]] : [];
  });
  const person = heights.length ? median(heights) : (track.H || 1) * 0.5;
  const d = (a: V2Obs, b: V2Obs) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const out = fr.map((f) => ({ t: f.t, p: f.p.map((q) => [...q] as V2Obs) }));
  let dropped = 0;
  for (let k = 1; k < fr.length; k++) {
    const [p, c] = [fr[k - 1].p, fr[k].p];
    const sides: [number, number][] = [[V2J.lSh, V2J.rSh], [V2J.rSh, V2J.lSh]];
    const jumper = sides.find(
      ([a, o]) =>
        seen(p[a]) &&
        seen(p[o]) &&
        seen(c[a]) &&
        d(p[a], p[o]) > SH_APART * person &&
        d(c[a], p[a]) > SH_JUMP * person &&
        d(c[a], p[o]) < SH_TAKE * person
    );
    /*
     * 두 손목이 한 자리에 겹쳤을 때만 — 손목이 갈라져 있으면 엔진 좌우 고침(repairLabels)이 팔을 통째로 바꿔 고친다(합성 시험의 '뒤바뀜'). 겹친 손목은
     * 바꿔도 다시 비춤이 안 줄어 그 고침이 못 한다(샘플 1).
     */
    const wristsMerged = seen(c[V2J.lWr]) && seen(c[V2J.rWr]) && d(c[V2J.lWr], c[V2J.rWr]) < SH_TAKE * person;
    if (!jumper || !wristsMerged) continue;
    const a = jumper[0];
    let e = k;
    while (e < fr.length && e - k < SH_MAX) {
      const q = fr[e].p;
      if (e > k && seen(q[V2J.lSh]) && seen(q[V2J.rSh]) && d(q[V2J.lSh], q[V2J.rSh]) < SH_CROSS * person) break;
      /* 뛴 이름이 한 번 더 크게 뛰면(제자리로 돌아옴) 끝 */
      if (e > k && seen(q[a]) && seen(fr[e - 1].p[a]) && d(q[a], fr[e - 1].p[a]) > SH_JUMP * person) break;
      /*
       * 이름 바로잡기 — 뛴 쪽(a) 이름이 다른 쪽 팔 위에 찍혔으니 팔 짝마다 서로 바꾼다. 바꾼 뒤에도 두 점이 한 자리면(그 팔 위에 두 이름이 겹침)
       * a 쪽은 가짜라 안 보임으로. 숨기기만 하면 그 영상의 실제 던지는 팔까지 버려 어깨 깊이를 못 정했다(샘플 1: 팔꿈치 10px 나아지고 어깨 15px 나빠짐).
       */
      for (const [l, r] of ARM_PAIRS_ALL) {
        const [x, y] = [q[l], q[r]];
        out[e].p[l] = [...y] as V2Obs;
        out[e].p[r] = [...x] as V2Obs;
        const fake = a === V2J.lSh ? l : r;
        if (seen(x) && seen(y) && d(x, y) < SH_TAKE * person) out[e].p[fake][2] = Math.min(out[e].p[fake][2], HIDDEN_V);
      }
      dropped++;
      e++;
    }
    k = e;
  }
  return { track: { ...track, frames: out }, dropped };
}

