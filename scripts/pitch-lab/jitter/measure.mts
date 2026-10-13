/**
 * 떨림 재기 — 엔진 결과 하나를 원 결과(관절) · 화면 트랙(displayTrack)으로 나눠, 구간마다 관절별 잔떨림 p90(키 대비 %)을 JSON 으로.
 *   node --import ./scripts/alias-register.mjs scripts/pitch-lab/jitter/measure.mts <result.json>...
 * 잔떨림 = 그 장면 자리 − 앞뒤 9장면 가우스(σ 3) 평균. 빠른 팔은 진짜 움직임 몫도 섞이니 절댓값보다 기준과의 변화 · 원 결과와의 차이로 본다.
 */
import { readFileSync } from 'node:fs';
import { displayTrack } from '@/lib/pitch-3d/v2/display';
import { V2J } from '@/lib/pitch-3d/v2/contract';

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
export function measure(r: Parameters<typeof displayTrack>[0]) {
  const heightM = 1.8;
  const disp = displayTrack(r, { ground: 'mound', heightM }).frames as Frames;
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

/* 결과 파일마다 한 줄 */
for (const path of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(path, 'utf8'));
  console.log(JSON.stringify(r.ok ? measure(r) : { failed: r.code ?? 'fail' }));
}
