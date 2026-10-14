/**
 * 겹쳐 보기 재료 — 엔진 관절 · 화면 모델 관절을 옆 · 뒤 카메라에 비춘 2D 와 AI 2D 를 장면마다 JSON 으로(overlay.mjs 가 부른다).
 *   node --import ./scripts/alias-register.mjs scripts/pitch-lab/overlay/points.mts <샘플 폴더> <나갈 json> <키 m>
 * 부위(사슬) 넷: arm 던지는 팔 · glove 글러브 팔 · lead 앞다리 · back 뒷다리. 화면 모델은 장면마다 몸통 네 점(자리 · 방향)을 엔진에 맞춘다 —
 * 인형은 발을 마운드에 세우려 몸 전체를 옮기고 기울이는데, 앱에서는 영상 위에 안 겹쳐 그 옮김은 안 보인다(모양만 견준다).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { displayTrack } from '@/lib/pitch-3d/v2/display';
import { V2J } from '@/lib/pitch-3d/v2/contract';

const [dir, out, heightM] = process.argv.slice(2);
const r = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
const tr = JSON.parse(readFileSync(join(dir, 'tracks.json'), 'utf8'));
const E: number[][][] = r.joints.map((f: number[][]) => f.map((p) => p.map((v) => v / 1000)));
const D = displayTrack(r, { ground: 'mound', heightM: Number(heightM) || 1.8 }).frames as number[][][];
const J = (n: string) => V2J[n as keyof typeof V2J];
const mean = (P: number[][]) => [0, 1, 2].map((a) => P.reduce((s, p) => s + p[a], 0) / P.length);
// 화면 → 엔진 좌표: 클립 하나 크기 배율(화면 모델은 엔진과 같은 축이고 높이 · 땅만 옮긴다)
const ref = ['lSh', 'rSh', 'lHip', 'rHip', 'lKn', 'rKn', 'lAn', 'rAn'].map(J);
const A: number[][] = [], B: number[][] = [];
for (let k = 0; k < E.length; k++) for (const j of ref) { A.push(D[k][j]); B.push(E[k][j]); }
const ma = mean(A), mb = mean(B);
const spread = (P: number[][], m: number[]) => Math.sqrt(P.reduce((s, p) => s + (p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2 + (p[2] - m[2]) ** 2, 0));
const sc = spread(B, mb) / spread(A, ma);
const toE = (p: number[]) => p.map((v, a) => (v - ma[a]) * sc + mb[a]);
const proj = (c: { R: number[]; t: number[]; f: number; cx: number; cy: number }, X: number[]) => {
  const x = [0, 1, 2].map((i) => c.R[3 * i] * X[0] + c.R[3 * i + 1] * X[1] + c.R[3 * i + 2] * X[2] + c.t[i]);
  return [(c.f * x[0]) / x[2] + c.cx, (c.f * x[1]) / x[2] + c.cy];
};
const h = r.hand === 'L' ? 'l' : 'r', g = h === 'r' ? 'l' : 'r';
const parts: Record<string, number[]> = {
  arm: ['Sh', 'El', 'Wr', 'HandMid'].map((s) => J(h + s)),
  glove: ['Sh', 'El', 'Wr', 'HandMid'].map((s) => J(g + s)),
  lead: ['Hip', 'Kn', 'An', 'To'].map((s) => J(g + s)),
  back: ['Hip', 'Kn', 'An', 'To'].map((s) => J(h + s)),
};
const torso = ['lSh', 'rSh', 'lHip', 'rHip'].map(J);
/** P → Q 회전(Kabsch, 3×3 은 극분해를 되풀이로) — 몸통 네 점을 맞춰 인형의 마운드 기울기(몸 전체 돌림)도 뺀다 */
function kabsch(P: number[][], Q: number[][]) {
  let M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => P.reduce((s, p, n) => s + Q[n][i] * p[j], 0)));
  for (let it = 0; it < 50; it++) {
    const [a, b, c] = M;
    const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    const inv = [
      [b[1] * c[2] - b[2] * c[1], a[2] * c[1] - a[1] * c[2], a[1] * b[2] - a[2] * b[1]],
      [b[2] * c[0] - b[0] * c[2], a[0] * c[2] - a[2] * c[0], a[2] * b[0] - a[0] * b[2]],
      [b[0] * c[1] - b[1] * c[0], a[1] * c[0] - a[0] * c[1], a[0] * b[1] - a[1] * b[0]],
    ].map((r) => r.map((v) => v / det));
    M = M.map((r, i) => r.map((v, j) => (v + inv[j][i]) / 2));
  }
  return M;
}
const near = (view: string, t: number) => {
  const F = tr[view].frames;
  let b = 0;
  for (let i = 0; i < F.length; i++) if (Math.abs(F[i].t - t) < Math.abs(F[b].t - t)) b = i;
  return F[b];
};
const frames = E.map((_, k) => {
  const ce = mean(torso.map((j) => E[k][j]));
  const cd = mean(torso.map((j) => toE(D[k][j])));
  const Rk = kabsch(torso.map((j) => toE(D[k][j]).map((v, a) => v - cd[a])), torso.map((j) => E[k][j].map((v, a) => v - ce[a])));
  const toEk = (p: number[]) => {
    const q = toE(p).map((v, a) => v - cd[a]);
    return [0, 1, 2].map((i) => Rk[i][0] * q[0] + Rk[i][1] * q[1] + Rk[i][2] * q[2] + ce[i]);
  };
  const o: Record<string, unknown> = { k, t: r.t[k], tb: r.tBack[k] };
  for (const [view, tk] of [['side', r.t[k]], ['back', r.tBack[k]]] as const) {
    const c = r.cameras[view];
    const f = near(view, tk);
    o[view] = Object.fromEntries(
      Object.entries(parts).map(([name, js]) => [
        name,
        { ai: js.map((j) => f.p[j]), eng: js.map((j) => proj(c, E[k][j])), disp: js.map((j) => proj(c, toEk(D[k][j]))) },
      ])
    );
  }
  return o;
});
writeFileSync(out, JSON.stringify({ events: r.events, hand: r.hand, frames }));
