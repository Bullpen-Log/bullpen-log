/**
 * 던지는 팔 진단을 합성 투수로 — 실제 샘플의 Modal 로그 `[pitch3d diag]` 와 같은 숫자(run-node.ts armDiag)를 정답 있는 영상에서 본다.
 *   node --import ./scripts/alias-register.mjs scripts/pitch-lab/diag-arm.mts
 * 손목 최고 속도를 정답과 견준다(팔 채찍이 맞추기에서 깎이는지). 30fps 화면 녹화(재생 30) · 120fps 슬로모를 함께.
 */
import { norm, sub, type Vec3 } from '../../lib/pitch-3d/linalg.ts';
import { V2J } from '../../lib/pitch-3d/v2/contract.ts';
import { fitPitch3dV2 } from '../../lib/pitch-3d/v2/fit.ts';
import { armDiag } from '../../lib/pitch-3d/v2/run-node.ts';
import { makeV2Track, pitcher25 } from './synth-v2.mts';
import { base, cameras, H, realistic, type Scenario } from './synth.mts';

/** 정답 손목 최고 속도(키 = 1000 단위/초) — 투구 전체 */
function truthPeak(hand: 'R' | 'L') {
  const W = hand === 'L' ? V2J.lWr : V2J.rWr;
  let peak = 0;
  for (let t = 0; t <= 1.45; t += 0.001) {
    const v = norm(sub(pitcher25(t + 0.001, hand)[W], pitcher25(t, hand)[W])) / 0.001;
    peak = Math.max(peak, (v / H) * 1000);
  }
  return peak;
}

export function wristPeakRatio(sc: Scenario, seed: number) {
  const { side: camS, back: camB } = cameras(sc);
  const s = makeV2Track(sc, camS, sc.side, 'side', seed);
  const b = makeV2Track(sc, camB, sc.back, 'back', seed + 1);
  const { result } = fitPitch3dV2({
    side: s.track,
    back: b.track,
    hand: sc.hand,
    heightCm: null,
    jobId: '00000000-0000-4000-8000-000000000000',
    poseModel: 'synth',
    screenRecorded: true,
    slowmoFps: sc.slowSide > 1 ? 30 * sc.slowSide : null,
  });
  if (!result.ok) return { ok: false as const, code: result.code };
  const W = sc.hand === 'L' ? V2J.lWr : V2J.rWr;
  /* 영상 전체에서 — 릴리스 앞뒤만 보면 순간을 조금만 잘못 잡아도 최고점을 놓친다(2026-10-08 처음에 23~29% 로 잘못 쟀다) */
  let peak = 0;
  for (let k = 1; k < result.joints.length; k++) {
    const dtReal = (result.t[k] - result.t[k - 1]) / sc.slowSide;
    if (dtReal <= 0) continue;
    peak = Math.max(peak, norm(sub(result.joints[k][W] as Vec3, result.joints[k - 1][W] as Vec3)) / dtReal);
  }
  return { ok: true as const, ratio: peak / truthPeak(sc.hand), diag: armDiag(result) };
}

const scenarios: Scenario[] = [
  { ...base, ...realistic, name: '30fps 화면 녹화', slowSide: 1, slowBack: 1, sampleSide: 1 / 30, sampleBack: 1 / 30 },
  { ...base, ...realistic, name: '120fps 슬로모', slowSide: 4, slowBack: 4, sampleSide: 1 / 30, sampleBack: 1 / 30 },
];
for (const sc of scenarios) {
  const rs = [1, 2, 3].map((seed) => wristPeakRatio(sc, seed * 11));
  console.log(
    `${sc.name}: 손목 최고 속도 / 정답 = ${rs.map((r) => (r.ok ? `${Math.round(r.ratio * 100)}%` : r.code)).join(' · ')}` +
      ` · 굽힘 뒤집힘 ${rs.map((r) => (r.ok ? r.diag.flips : '-')).join('/')}`
  );
}
