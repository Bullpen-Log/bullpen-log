/**
 * 공 하나의 공 길을 장면마다 찍는다(진단) — 앱과 같은 조건(20m · 공 시각 둘레)으로 재고 관측 · 맞춘 깊이 · 끝 시각을 보인다. DB 안 씀.
 *   node scripts/velocity-lab/probe-track.mjs <영상> --seed=<공 시각 초> [--from= --to=(구간, 씨앗 없이)] [--fov=38.33] [--dist=20]
 */
import { open, argOf } from './cdp.mjs';
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const c = await open({ port: Number(argOf('port', 9452)) });
await c.setFile(file);
const r = await c.evaluate(`(async () => {
  const AV = window.__m['analyze-video'];
  const file = document.querySelector('input[type=file]').files[0];
  const seed = ${Number(argOf('seed', 0))};
  const from = ${argOf('from', 'null')}, to = ${argOf('to', 'null')};
  const res = await AV.analyzeVideo({ file, startSec: from ?? Math.max(0, seed - 0.25), endSec: to ?? seed + 1.45, seedT: from != null ? null : seed, fps: 60, fovDeg: ${Number(argOf('fov', 38.33))}, approach: 'receding', distanceM: ${Number(argOf('dist', 20))}, distanceAuto: false, tiltRad: 0.035 });
  const d = res.distance ?? {};
  const { fit, ...dd } = d;
  return { measure: res.measure.ok ? { kmh: res.measure.kmh, conf: res.measure.confidence, detail: res.measure.detail } : res.measure, distance: dd, fit,
    track: (res.track ?? []).map((o) => [Math.round(o.t * 1000) / 1000, Math.round(o.x), Math.round(o.y), Math.round((o.d ?? o.diameter ?? 0) * 10) / 10]),
    size: res.analyzeSize, src: res.sourceSize };
})()`);
console.log(JSON.stringify(r, null, 0));
await c.close();
process.exit(0);
