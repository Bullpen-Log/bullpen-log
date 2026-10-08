/** 진단: 장면 하나를 씨앗 여럿으로 — 씨앗마다 품질 · 오차 */
import type { Pitch3dOk } from '../../lib/pitch-3d/analyze.ts';
import { base, realistic, run, type Scenario } from './synth.mts';
const which = process.argv[2] ?? 'realistic';
const sc: Scenario =
  which === 'close'
    ? { ...base, ...realistic, name: 'close', side: { ...base.side, D: 3.2, k: 0.9 }, back: { ...base.back, D: 3.4, k: 0.95 } }
    : which === 'pitched'
      ? { ...base, ...realistic, name: 'pitched', side: { ...base.side, up: 1.2, roll: 2 }, back: { ...base.back, up: 1.4, roll: -1.5 } }
      : which === 'lefty'
        ? { ...base, ...realistic, hand: 'L', backMirror: true, name: 'lefty' }
        : { ...base, ...realistic, name: 'realistic' };
for (const seed of (process.argv[3] ?? "1,2,3,4,5").split(",").map(Number)) {
  const r = run(sc, seed);
  if (!r.result.ok) {
    console.log(seed, 'FAIL', r.result.code, JSON.stringify(r.result.quality ?? {}));
    continue;
  }
  const q = (r.result as Pitch3dOk).quality;
  const e = Object.entries(r.errors).map(([k, v]) => `${k.replace(/[a-z]/g, '').slice(0, 4) || k.slice(0, 4)}${k.slice(0, 3)}:${(v as number).toFixed(1)}`).join(' ');
  console.log(seed, `axis ${q.axisAngleDeg} f ${q.focal.side}/${q.focal.back} reproj ${q.reprojPct} bone ${q.boneCv.trunk}/${q.boneCv.legs} flips ${JSON.stringify(q.flips)} sync ${q.syncCost} off ${q.offsetFrames}`);
  console.log('   ', e);
}
