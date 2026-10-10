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
