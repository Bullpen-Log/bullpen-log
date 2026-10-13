/**
 * 앱의 메커니즘 점검 계산(lib/pitch-3d/v2/mech-checks.ts)을 마커 정답(mech_truth.py → work/mech_truth.json)에 대어 본다.
 *
 *   (세션 폴더에서) python <저장소>/scripts/pitch-lab/markers/selfcal/mech_truth.py
 *   (저장소에서) node --import ./scripts/alias-register.mjs scripts/pitch-lab/markers/selfcal/mech-score.mts <세션 폴더>/work [키 cm]
 *
 * 엔진 결과는 work/bench/pNN/result.json(bench.py → mocap-fit.mts) — 화면이 받는 결과와 같은 모양. 키(cm)는 줄자 기록의 키(기본 175).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { mechChecks, type MechChecks } from '@/lib/pitch-3d/v2/mech-checks';
import { judgeMechanics } from '@/lib/pitch-3d/v2/mech-judge';

const work = process.argv[2];
const heightCm = Number(process.argv[3] ?? 175);
const truth = JSON.parse(readFileSync(join(work, 'mech_truth.json'), 'utf8')) as Record<string, Record<string, number | null>>;
const rows: Record<string, [number, number][]> = {};
const apps: MechChecks[] = [];
const truths: MechChecks[] = [];
const put = (k: string, e: number | null | undefined, t: number | null | undefined) => {
  if (e == null || t == null || !Number.isFinite(e) || !Number.isFinite(t)) return;
  (rows[k] ??= []).push([e, t]);
};
for (const [p, T] of Object.entries(truth)) {
  const r = JSON.parse(readFileSync(join(work, 'bench', `p${p.padStart(2, '0')}`, 'result.json'), 'utf8')) as Pitch3dV2Ok;
  const m = mechChecks(r, heightCm);
  apps.push(m);
  const n = (k: string) => (T[k] == null ? NaN : (T[k] as number));
  truths.push({
    hand: r.hand,
    drift: { aheadAtKneeUp: n('aheadAtKneeUpCm') / heightCm, aheadAtKneeUpCm: n('aheadAtKneeUpCm'), travel: n('travelCm') / heightCm, travelCm: n('travelCm'), speed: n('speedMs') * 100 / heightCm, speedMs: n('speedMs'), conf: null },
    pelvisLevel: { tiltDeg: n('tiltDeg'), conf: null },
    separation: { frame: 0, peakMs: n('peakMs'), peakDeg: n('peakDeg'), atPlantDeg: n('atPlantDeg'), trunkOpenAtPlantDeg: n('trunkOpenAtPlantDeg'), pelvisOpenAtPlantDeg: n('pelvisOpenAtPlantDeg'), trunkHalfPct: T.trunkHalfPct == null ? null : n('trunkHalfPct'), trunkHalfFrame: null, trunkConf: null, conf: null },
    block: { pelvisDecelPct: n('pelvisDecelPct'), kneeAtPlantDeg: n('kneeAtPlantDeg'), kneeAtReleaseDeg: n('kneeAtReleaseDeg'), kneeExtensionDeg: n('kneeExtensionDeg'), kneeCollapseDeg: n('kneeCollapseDeg'), conf: null },
  });
  put('드리프트: 니업 때 골반이 축발보다 앞(cm)', m.drift?.aheadAtKneeUpCm, T.aheadAtKneeUpCm);
  put('드리프트: 첫 장면 → 니업 앞으로 간 거리(cm)', m.drift?.travelCm, T.travelCm);
  put('드리프트: 니업 때 앞으로 가는 속도(m/s)', m.drift?.speedMs, T.speedMs);
  put('골반 수평: 착지 때 엉덩이선 기울기(°)', m.pelvisLevel.tiltDeg, T.tiltDeg);
  put('분리 시점: 착지 기준(ms)', m.separation.peakMs, T.peakMs);
  put('분리 크기: 그때 분리(°)', m.separation.peakDeg, T.peakDeg);
  put('분리: 착지 순간(°)', m.separation.atPlantDeg, T.atPlantDeg);
  const tbl = (k: string) => r.metrics.find((x) => x.key === k)?.value;
  put('(엔진 표) 골반-어깨 꼬임 최대(°)', tbl('separationMax'), T.peakDeg);
  put('(엔진 표) 골반-어깨 꼬임 착지(°)', tbl('separationAtPlant'), T.atPlantDeg);
  put('착지 때 몸통 열림(°)', m.separation.trunkOpenAtPlantDeg, T.trunkOpenAtPlantDeg);
  put('착지 때 골반 열림(°)', m.separation.pelvisOpenAtPlantDeg, T.pelvisOpenAtPlantDeg);
  put('몸통이 도는 때: 어깨선 절반(착지 → 공 놓기 %)', m.separation.trunkHalfPct, T.trunkHalfPct);
  put('블록: 골반 앞 속도 줄어든 몫(%)', m.block.pelvisDecelPct, T.pelvisDecelPct);
  put('블록: 앞무릎 착지(°)', m.block.kneeAtPlantDeg, T.kneeAtPlantDeg);
  put('블록: 앞무릎 릴리스(°)', m.block.kneeAtReleaseDeg, T.kneeAtReleaseDeg);
  put('블록: 착지 → 릴리스 펴진 만큼(°)', m.block.kneeExtensionDeg, T.kneeExtensionDeg);
  put('블록: 착지 뒤 더 굽은 만큼(°)', m.block.kneeCollapseDeg, T.kneeCollapseDeg);
}
const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const corr = (a: number[], b: number[]) => {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
};
console.log(`키 ${heightCm}cm · ${Object.keys(truth).length}구 — 앱 계산 vs 정답(K4)`);
console.log('항목'.padEnd(34), '구', '  앱 평균', ' 정답 평균', ' |차| 가운데', ' 최대', '  치우침', ' 정답 SD', ' 상관');
for (const [k, v] of Object.entries(rows)) {
  const e = v.map((x) => x[0]);
  const t = v.map((x) => x[1]);
  const d = v.map((x) => x[0] - x[1]);
  const sd = Math.sqrt(t.reduce((s, x) => s + (x - t.reduce((q, y) => q + y, 0) / t.length) ** 2, 0) / t.length);
  const f = (x: number, w = 8) => x.toFixed(2).padStart(w);
  console.log(
    k.padEnd(34), String(v.length).padStart(2), f(e.reduce((s, x) => s + x, 0) / e.length), f(t.reduce((s, x) => s + x, 0) / t.length),
    f(med(d.map(Math.abs)), 10), f(Math.max(...d.map(Math.abs)), 6), f(d.reduce((s, x) => s + x, 0) / d.length), f(sd), f(corr(e, t), 6)
  );
}

/* 판정 — 구마다 앱 vs 정답이 같은 판정인가, 그리고 15구 평균 판정 */
const keys = ['drift', 'separation', 'block'] as const;
const agree: Record<string, string[]> = {};
apps.forEach((m, i) => {
  const ja = judgeMechanics([m], heightCm).items;
  const jt = judgeMechanics([truths[i]], heightCm).items;
  for (const k of keys) (agree[k] ??= []).push(`${ja.find((x) => x.key === k)!.status}/${jt.find((x) => x.key === k)!.status}`);
});
console.log('\n판정(앱/정답) 구마다:');
for (const k of keys) {
  const same = agree[k].filter((x) => x.split('/')[0] === x.split('/')[1]).length;
  console.log(`  ${k.padEnd(10)} 같음 ${same}/${agree[k].length} · ${agree[k].join(' ')}`);
}
for (const [nm, L] of [['앱', apps], ['정답', truths]] as const) {
  const j = judgeMechanics(L, heightCm);
  console.log(`\n${nm} ${j.pitches}구 평균:`);
  for (const it of j.items.filter((x) => x.shown)) console.log(`  [${it.status}] ${it.title}: ${it.line} (${it.detail})`);
}
