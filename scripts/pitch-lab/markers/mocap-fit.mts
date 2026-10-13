/**
 * mocap_bench.py 가 만든 tracks.json → 엔진(분석 서버와 같은 길: 순간 찾기 pickSegment → 맞추기 fitPitch3dV2) → result.json.
 * node --import ./scripts/alias-register.mjs scripts/pitch-lab/markers/mocap-fit.mts <폴더> [--segment-only] [--template 틀.json | --no-template]
 * 순간(초)은 <폴더>/seg.json 에도 남긴다(틀 만들기가 엔진과 같은 순간을 쓰게).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fitPitch3dV2 } from '../../../lib/pitch-3d/v2/fit.ts';
import { pickSegment } from '../../../lib/pitch-3d/v2/run-node.ts';

const dir = process.argv[2];
const segOnly = process.argv.includes('--segment-only');
/* 통계 움직임 틀 — 서버(run-node.ts)처럼 기본으로 lib 의 motion-template.json 을 쓴다. --template 로 바꾸고 --no-template 로 끈다 */
const tplArg = process.argv.indexOf('--template');
const tplPath = tplArg > 0 ? process.argv[tplArg + 1] : new URL('../../../lib/pitch-3d/v2/motion-template.json', import.meta.url);
const motionTemplate = process.argv.includes('--no-template') ? undefined : JSON.parse(readFileSync(tplPath, 'utf8'));
const tr = JSON.parse(readFileSync(join(dir, 'tracks.json'), 'utf8'));
/*
 * 서버(services/pitch3d-gpu/pipeline.py)와 같은 길 — 순간 찾기는 거친 30fps 로, 맞추기는 그 구간(옆 · 뒤 영상 초)의 장면만.
 * 옛 판은 4초 전체를 넣어 서버보다 앞뒤가 길었다(2026-10-13). --whole 이면 예전처럼 전체.
 */
const whole = process.argv.includes('--whole');
type Tr = { W: number; H: number; fps: number; frames: { t: number; p: number[][] }[] };
const decimate = (t: Tr, fps: number): Tr => {
  const out: Tr['frames'] = [];
  let last = -1e9;
  for (const f of t.frames) {
    if (f.t - last < 1 / fps - 1e-4) continue;
    out.push(f);
    last = f.t;
  }
  return { ...t, fps, frames: out };
};
const coarse = (t: Tr) => (whole ? t : decimate(t, Math.min(30, t.fps)));
const seg = pickSegment({ side: coarse(tr.side), back: coarse(tr.back), fps: { side: tr.side.fps, back: tr.back.fps } });
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
const cut = (t: Tr, w: { fromSec: number; toSec: number }): Tr =>
  whole ? t : { ...t, frames: t.frames.filter((f) => f.t >= w.fromSec - 1e-6 && f.t <= w.toSec + 1e-6) };
const { result } = fitPitch3dV2({
  side: cut(tr.side, seg.side),
  back: cut(tr.back, seg.back),
  hand: tr.meta.hand,
  heightCm: Math.round(tr.meta.height_m * 100),
  jobId: '00000000-0000-4000-8000-000000000000',
  poseModel: 'mocap-bench',
  slowmoFps: null,
  screenRecorded: false,
  events: seg.events,
  /* 1배로 찍었다고 알면 초점 사전(tracks.meta.focal_prior — 마커 채점 bench.py 가 넣는다) */
  ...(tr.meta.focal_prior ? { focalPrior: tr.meta.focal_prior } : {}),
  ...(motionTemplate ? { motionTemplate } : {}),
} as never);
writeFileSync(join(dir, 'result.json'), JSON.stringify(result));
const r = result as { ok: boolean; code?: string };
console.log(r.ok ? `맞추기 ${(performance.now() - t0).toFixed(0)}ms · 순간(초) ${JSON.stringify(seg.events)}` : `맞추기 실패 ${r.code}`);
