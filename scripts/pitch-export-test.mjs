/** Report export and bridge checks use synthetic data; no account or storage access. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('/lib/pitch-3d/v2/mech-checks.ts')) return {
      format: 'module', shortCircuit: true,
      source: 'export const DROP_RISE_MAX=.02;export const mechChecks=()=>globalThis.__pitchExportMetrics;',
    };
    return next(url, context);
  },
});
const { buildReport } = await import('../lib/pitch-3d/v2/report.ts');
const { reportExportHtml } = await import('../lib/pitch-3d/v2/report-export.ts');
const { decodeExportChunk } = await import('../lib/pitch-3d/v2/export-bridge.ts');
globalThis.__pitchExportMetrics = {
  hand: 'R',
  drift: { aheadAtKneeUp: .1, aheadAtKneeUpCm: 18, conf: 50 },
  drop: { pelvisDrop: .36, rise: 0, conf: 50 },
  separation: { trunkOpenAtPlantDeg: -40, trunkConf: 50 },
  trunkTilt: { forwardDeg: 30, conf: 50 },
  arm: { abductionAtPlantDeg: 88, conf: 0 },
  block: { pelvisDecelPct: 95, kneeExtensionDeg: 10, kneeCollapseDeg: 3, worstFrame: 12, conf: 50, keyConf: 50 },
};
const result = { hand: 'R', joints: [], conf: [], events: { kneeUp: 5, footPlant: 10, release: 20 }, t: Array.from({ length: 30 }, (_, i) => i / 60) };
const report = buildReport(result, { heightCm: 180, ground: 'mound', youth: false, drills: [] });
const html = reportExportHtml(report, '<img src=x onerror=alert(1)>', '10월 1일', 'data:image/jpeg;base64,YWJj');
assert.match(html, /투구 분석 리포트/);
assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(html, /<img src=x/);
assert.match(html, /data:image\/jpeg;base64,YWJj/);
for (const name of ['드리프트', '드롭', '상하체 분리', '브레이크', '몸통 회전', '스로잉']) assert.ok(html.includes(name), name);
assert.match(html, /확인 어려움/);
assert.match(html, /원본 영상은 포함되지 않습니다/);
assert.doesNotMatch(reportExportHtml(report, '', '', 'data:image/jpeg;base64,abc" onerror="alert(1)'), /<figure>/);
for (let n = 1; n <= 128; n++) {
  const raw = Buffer.from(Array.from({ length: n }, (_, i) => (i * 79 + n) % 256));
  assert.deepEqual(Buffer.from(decodeExportChunk(raw.toString('base64'))), raw);
}
for (const invalid of ['', 'a', 'AA=A', 'AA==AAAA', 'abcd=', 'abcd\n', 'A'.repeat(262_148)]) assert.throws(() => decodeExportChunk(invalid));
if (process.argv[2]) {
  const fs = await import('node:fs/promises');
  const scene = process.argv[3] ? await fs.readFile(process.argv[3], 'utf8') : null;
  await fs.writeFile(process.argv[2], reportExportHtml(report, '투구', '10월 1일', scene));
}
console.log('리포트 내보내기 검사 통과: 실제 판정 결과·여섯 요소·확인 어려움·HTML 이스케이프·사진 제한·영상 조각 복원');
