/**
 * 던지는 팔 진단을 합성 투수로 — 실제 샘플의 Modal 로그 `[pitch3d diag]` 와 같은 숫자(run-node.ts armDiag)를 정답 있는 영상에서 본다.
 *   npm 없이: node --import ./scripts/alias-register.mjs scripts/pitch-lab/diag-arm.mts
 * 장면 간격(30 · 60 · 120fps) · 잡음을 바꿔 릴리스 근처 굽힘 축 뒤집힘 · 손목 이동이 어디서 생기는지 견준다.
 */
import { fitPitch3dV2 } from '../../lib/pitch-3d/v2/fit.ts';
import { armDiag } from '../../lib/pitch-3d/v2/run-node.ts';
import { makeV2Track } from './synth-v2.mts';
import { base, cameras, realistic, type Scenario } from './synth.mts';

for (const fps of [30, 60, 120]) {
  const sc: Scenario = {
    ...base,
    ...realistic,
    name: `${fps}fps`,
    slowSide: 1,
    slowBack: 1,
    sampleSide: 1 / fps,
    sampleBack: 1 / fps,
  };
  const { side: camS, back: camB } = cameras(sc);
  const s = makeV2Track(sc, camS, sc.side, 'side', 7);
  const b = makeV2Track(sc, camB, sc.back, 'back', 8);
  const { result } = fitPitch3dV2({
    side: s.track,
    back: b.track,
    hand: sc.hand,
    heightCm: null,
    jobId: '00000000-0000-4000-8000-000000000000',
    poseModel: 'synth',
  });
  if (!result.ok) {
    console.log(fps, 'fail', result.code);
    continue;
  }
  const d = armDiag(result);
  console.log(
    `${fps}fps 장면 ${d.n} · 굽힘 뒤집힘 ${d.flips} · 손바닥 뒤집힘 ${d.palmFlips} · 손목 최대 이동 ${d.maxStep}mm`
  );
  for (const row of d.rows.filter((r) => Math.abs(r[0]) <= 4)) console.log('  ', JSON.stringify(row));
}
