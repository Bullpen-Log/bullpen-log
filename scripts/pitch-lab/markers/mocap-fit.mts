/**
 * mocap_bench.py 가 만든 tracks.json → 엔진(분석 서버와 같은 길: 순간 찾기 pickSegment → 맞추기 fitPitch3dV2) → result.json.
 * node --import ./scripts/alias-register.mjs scripts/pitch-lab/markers/mocap-fit.mts <폴더> [--segment-only] [--template 틀.json]
 * 순간(초)은 <폴더>/seg.json 에도 남긴다(틀 만들기가 엔진과 같은 순간을 쓰게).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fitPitch3dV2 } from '../../../lib/pitch-3d/v2/fit.ts';
import { pickSegment } from '../../../lib/pitch-3d/v2/run-node.ts';

const dir = process.argv[2];
const segOnly = process.argv.includes('--segment-only');
const tplArg = process.argv.indexOf('--template');
const motionTemplate = tplArg > 0 ? JSON.parse(readFileSync(process.argv[tplArg + 1], 'utf8')) : undefined;
const tr = JSON.parse(readFileSync(join(dir, 'tracks.json'), 'utf8'));
const seg = pickSegment({ side: tr.side, back: tr.back, fps: { side: tr.side.fps, back: tr.back.fps } });
if (!seg.ok) {
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ ok: false, code: `segment:${seg.code}` }));
  console.log('순간 찾기 실패', seg.code);
  process.exit(0);
}
writeFileSync(join(dir, 'seg.json'), JSON.stringify(seg.events));
if (segOnly) {
  console.log('순간(초)', JSON.stringify(seg.events));
  process.exit(0);
}
const t0 = performance.now();
const { result } = fitPitch3dV2({
  side: tr.side,
  back: tr.back,
  hand: tr.meta.hand,
  heightCm: Math.round(tr.meta.height_m * 100),
  jobId: '00000000-0000-4000-8000-000000000000',
  poseModel: 'mocap-bench',
  slowmoFps: null,
  screenRecorded: false,
  events: seg.events,
  ...(motionTemplate ? { motionTemplate } : {}),
} as never);
writeFileSync(join(dir, 'result.json'), JSON.stringify(result));
const r = result as { ok: boolean; code?: string };
console.log(r.ok ? `맞추기 ${(performance.now() - t0).toFixed(0)}ms · 순간(초) ${JSON.stringify(seg.events)}` : `맞추기 실패 ${r.code}`);
