/* 확인된 녹화 투구 27구를 엔진(복사본 가능)으로 재기 — 앱과 같은 조건(화각 38.33 · 녹화 거리 · 첫 라벨 시각 씨앗) */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, LAB, argOf } from '../cdp.mjs';
const L = JSON.parse(readFileSync(join(LAB, 'scan-v1/labels-rec.json'), 'utf8'));
const V = JSON.parse(readFileSync(join(LAB, 'scan-v1/verified-rec.json'), 'utf8')).ok;
const c = await open({ port: Number(argOf('port', 9831)), engine: argOf('engine') });
const out = [];
for (const k of V) {
  const th = L[k];
  const rec = th.file.split('/')[0];
  const D = JSON.parse(readFileSync(join(LAB, rec, 'cuts.json'), 'utf8')).meta?.distM ?? 20;
  const t0 = th.frames[0][0];
  await c.setFile(join(LAB, th.file));
  const r = await c.evaluate(`(async () => {
    const AV = window.__m['analyze-video'];
    const file = document.querySelector('input[type=file]').files[0];
    const res = await AV.analyzeVideo({ file, startSec: Math.max(0, ${t0} - 0.3), endSec: ${t0} + 1.4, seedT: ${t0}, fps: 60, fovDeg: 38.33, approach: 'receding', distanceM: ${D}, distanceAuto: false, tiltRad: 0.035 });
    const m = res.measure, d = res.distance ?? {};
    return m.ok ? { kmh: m.kmh, conf: m.confidence, why: d.why ?? null, se: m.detail.startSeKmh / m.detail.startKmh, size: d.sizeDistM, first: d.firstDepthM, slope: d.sizeSlope, frames: m.detail.frames } : { code: m.code, why: d.why ?? null };
  })()`);
  out.push({ k, file: th.file, D, ...r });
  console.log(k, th.file.padEnd(22), 'D', D, '|', r.kmh ? `${r.kmh.toFixed(1)} ${r.conf} se${(100 * r.se).toFixed(1)}% ${r.why ?? ''} sz${r.size} 첫${r.first} 기울기${r.slope} f${r.frames}` : `— ${r.code} ${r.why ?? ''}`);
}
writeFileSync(argOf('json', '/dev/null'), JSON.stringify(out));
await c.close();
process.exit(0);
