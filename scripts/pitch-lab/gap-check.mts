/**
 * 릴리스 근처 던지는 손목 · 손을 두 영상에서 10장면 지운 합성 — 맞춘 손목이 빈 구간에서 정답과 얼마나 어긋나는지(키 대비).
 * 결과 좌표는 정답과 축 · 크기가 달라, 보이는 관절로 닮음 변환(Umeyama)을 맞춘 뒤 잰다. 쓰는 곳: scripts/pitch-3d-v2-selftest.mts.
 *   단독: node --import ./scripts/alias-register.mjs scripts/pitch-lab/gap-check.mts
 */
import {
  add,
  det3,
  mul3,
  mulV,
  norm,
  scale,
  sub,
  svd3,
  transpose,
  type Mat3,
  type Vec3,
} from '../../lib/pitch-3d/linalg.ts';
import { V2J } from '../../lib/pitch-3d/v2/contract.ts';
import { fitPitch3dV2 } from '../../lib/pitch-3d/v2/fit.ts';
import { makeV2Track, pitcher25 } from './synth-v2.mts';
import { base, cameras, EV, H, realistic, type Scenario } from './synth.mts';

/** Umeyama 닮음 변환(src → dst) */
function align(src: Vec3[], dst: Vec3[]) {
  const n = src.length;
  const ms = scale(
    src.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3),
    1 / n
  );
  const md = scale(
    dst.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3),
    1 / n
  );
  const C = new Array<number>(9).fill(0);
  let vs = 0;
  for (let i = 0; i < n; i++) {
    const a = sub(src[i], ms);
    const b = sub(dst[i], md);
    vs += a[0] ** 2 + a[1] ** 2 + a[2] ** 2;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] += b[r] * a[c];
  }
  const { U, s, V } = svd3(C as Mat3);
  const d = det3(mul3(U, transpose(V))) < 0 ? -1 : 1;
  const R = mul3(mul3(U, [1, 0, 0, 0, 1, 0, 0, 0, d]), transpose(V));
  const k = (s[0] + s[1] + d * s[2]) / vs;
  const t = sub(md, scale(mulV(R, ms), k));
  return (x: Vec3) => add(scale(mulV(R, x), k), t);
}

const HAND = [V2J.rWr, V2J.rHandMid, V2J.rHandIdx, V2J.rHandPinky];

/** 빈 구간 손목 최대 오차(키 비율) · 보이는 주변 중앙 오차 — 맞추기 실패면 null */
export function gapWristError(seed: number): { gap: number; seen: number } | null {
  const sc: Scenario = {
    ...base,
    ...realistic,
    name: 'gap',
    slowSide: 4,
    slowBack: 4,
    offBack: 0,
    sampleSide: 1 / 30,
    sampleBack: 1 / 30,
  };
  const { side: cs, back: cb } = cameras(sc);
  const s = makeV2Track(sc, cs, sc.side, 'side', seed);
  const b = makeV2Track(sc, cb, sc.back, 'back', seed + 1);
  const [g0, g1] = [s.toMedia(EV.release - 0.06), s.toMedia(EV.release + 0.02)];
  for (const tr of [s.track, b.track])
    for (const f of tr.frames)
      if (f.t >= g0 && f.t <= g1)
        for (const j of HAND) f.p[j] = [f.p[j][0], f.p[j][1], 0];
  const { result } = fitPitch3dV2({
    side: s.track,
    back: b.track,
    hand: 'R',
    heightCm: null,
    jobId: '00000000-0000-4000-8000-000000000000',
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: 120,
    events: {
      kneeUp: s.toMedia(EV.kneeUp),
      footPlant: s.toMedia(EV.footPlant),
      release: s.toMedia(EV.release),
    },
  });
  if (!result.ok) return null;
  /* 옆 영상 시각 → 실제 시각(makeV2Track: 재생 30fps 같은 장면 · 슬로모 · 시작 -0.05초) */
  const truthAt = (k: number) =>
    pitcher25(
      Math.max(
        0,
        Math.min(1.5, Math.floor(result.t[k] * 30 + 1e-6) / 30 / sc.slowSide - 0.05)
      ),
      'R'
    );
  const inGap = (k: number) => result.t[k] >= g0 && result.t[k] <= g1;
  const src: Vec3[] = [];
  const dst: Vec3[] = [];
  result.joints.forEach((fr, k) => {
    const T = truthAt(k);
    for (let j = 0; j < 17; j++)
      if (result.conf[k][j] > 0 && !(HAND.includes(j) && inGap(k))) {
        src.push(fr[j] as Vec3);
        dst.push(T[j]);
      }
  });
  const f = align(src, dst);
  const err = (k: number) =>
    norm(sub(f(result.joints[k][V2J.rWr] as Vec3), truthAt(k)[V2J.rWr])) / H;
  let gap = 0;
  const seen: number[] = [];
  result.joints.forEach((_, k) => {
    if (inGap(k)) gap = Math.max(gap, err(k));
    else if (Math.abs(result.t[k] - (g0 + g1) / 2) < 0.3) seen.push(err(k));
  });
  seen.sort((a, z) => a - z);
  return { gap, seen: seen[seen.length >> 1] ?? 0 };
}

if (process.argv[1]?.endsWith('gap-check.mts'))
  for (const seed of [11, 22, 44, 55]) {
    const r = gapWristError(seed);
    console.log(
      `seed ${seed}: ` +
        (r
          ? `빈 구간 손목 최대 오차 ${(r.gap * 100).toFixed(1)}% · 보이는 주변 중앙 ${(r.seen * 100).toFixed(1)}%`
          : '맞추기 실패')
    );
  }
