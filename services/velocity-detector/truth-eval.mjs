/**
 * 3판 모델 평가 — 떼어 둔 그룹의 공마다, 모델이 읽은 지름으로 거리를 되짚어 구속을 내고 스피드건과 견준다(2026-10-22 밤).
 *
 *   node services/velocity-detector/truth-eval.mjs --data=~/bullpen-velocity-lab/detector-v3 --eval=<eval.json>,<eval.json>
 *
 * 모델 거리 = 장면마다 f · 공 지름 / (상대 깊이 × 모델 지름) 의 가운데 = Dg × 가운데(라벨 지름 ÷ 모델 지름) — 라벨의 Dg 가 지워져 시험 공의
 * 스피드건 값을 안 쓴다. 구속은 엔진처럼 거리^1.076 로 옮긴다. 견줄 것: 지금 덩어리 규칙(덩어리 ÷ k, k 는 학습 쪽 그룹에서) · 엔진이 낸 값.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, f) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const DATA = resolve(arg('data', join(homedir(), 'bullpen-velocity-lab', 'detector-v3')));
const EVALS = arg('eval', '').split(',').filter(Boolean);
const MIN_SCORE = Number(arg('min-score', 0.3));
/* --deshrink=1: 모델은 작은 공을 크게 · 큰 공을 작게 읽는다(회귀가 가운데로 당김). log 모델 = c0 + (1 + c1)·log 진짜 를 '다른' 평가 파일의
   장면으로 맞춰(이 공들의 스피드건은 안 씀) 되돌린다 — 평가 파일이 둘 이상일 때만 */
const DESHRINK = arg('deshrink', '0') === '1';
const L = JSON.parse(readFileSync(join(DATA, 'labels.json'), 'utf8'));
const RAW = JSON.parse(readFileSync(join(DATA, 'labels-raw.json'), 'utf8'));
const med = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length ? (b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2) : NaN; };
const speedAt = (c, D) => c.kmh * (D / c.usedDist) ** 1.076;
/* 덩어리 ÷ 진짜(라벨을 맞추기 전 — 엔진 장면 시각 그대로) 공마다 가운데 */
const blobRatio = new Map(RAW.clips.map((c) => [c.id, med(c.frames.filter((f) => f.ball && f.blob).map((f) => f.blob / f.ball[2]))]));

const ALL = EVALS.map((p) => JSON.parse(readFileSync(p, 'utf8')));
const shrinkFit = (frames) => {
  const pts = frames.filter((r) => r.has && r.d_near != null && r.s_near >= MIN_SCORE).map((r) => [Math.log(r.d), Math.log(r.d_near / r.d)]);
  const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const c1 = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { c0: (sy - c1 * sx) / n, c1 };
};
const rows = [];
for (const [ei, E] of ALL.entries()) {
  const others = ALL.filter((_, j) => j !== ei).flatMap((o) => o.frames);
  const fit = DESHRINK && others.length ? shrinkFit(others) : null;
  if (fit) console.log(`평가 ${ei + 1}: 되돌림 c0 ${fit.c0.toFixed(3)} · c1 ${fit.c1.toFixed(3)}(다른 평가 파일로)`);
  const sizeOf = (r) => (fit ? Math.exp((Math.log(r.d_near) - fit.c0) / (1 + fit.c1)) : r.d_near);
  const test = new Set(E.report.test_clips);
  const kTrain = med(L.clips.filter((c) => !test.has(c.id)).map((c) => blobRatio.get(c.id)));
  const byClip = new Map();
  for (const r of E.frames) if (r.has && r.d_near != null) (byClip.get(r.clip) ?? byClip.set(r.clip, []).get(r.clip)).push(r);
  for (const c of L.clips.filter((c) => test.has(c.id))) {
    const fr = (byClip.get(c.id) ?? []).filter((r) => r.s_near >= MIN_SCORE);
    const R = med(fr.map((r) => sizeOf(r) / r.d)); // 모델 ÷ 진짜
    const Rgt = med(fr.map((r) => r.d_gt / r.d));
    const Dmodel = c.Dg / R;
    const Dblob = (c.Dg * kTrain) / blobRatio.get(c.id);
    rows.push({ id: c.id, g: c.group, gun: c.gun, engine: c.kmh, conf: c.conf, n: fr.length, R, Rgt,
      model: fr.length >= 5 ? speedAt(c, Dmodel) : null, blob: speedAt(c, Dblob), kTrain });
  }
}
const stat = (xs) => {
  const a = xs.map(Math.abs).sort((x, y) => x - y);
  return `${a.length}구 MAE ${(a.reduce((p, x) => p + x, 0) / a.length).toFixed(2)} · 90% ${a[Math.floor(a.length * 0.9)]?.toFixed(1)} · 치우침 ${(xs.reduce((p, x) => p + x, 0) / xs.length).toFixed(2)}`;
};
const show = (name, f) => {
  const r = rows.filter(f).filter((x) => x.model != null);
  console.log(`\n■ ${name}`);
  console.log(`  모델 크기      ${stat(r.map((x) => x.model - x.gun))}`);
  console.log(`  덩어리 ÷ k     ${stat(r.map((x) => x.blob - x.gun))}`);
  console.log(`  엔진이 낸 값   ${stat(r.map((x) => x.engine - x.gun))}`);
  const sd = (v) => { const m = med(v); return Math.sqrt(v.reduce((p, x) => p + (x / m - 1) ** 2, 0) / v.length) * 100; };
  console.log(`  공마다 크기 비 흩어짐: 모델 ±${sd(r.map((x) => x.R)).toFixed(1)}% · 덩어리 ±${sd(r.map((x) => blobRatio.get(x.id))).toFixed(1)}% · 모델 가운데 ${med(r.map((x) => x.R)).toFixed(3)}`);
};
show('떼어 둔 공 전부', () => true);
show('앱 카메라(10-09 · 10-21 · 녹화)', (x) => /10-09|10-21|rec-/.test(x.g));
show('카메라 앱 파일(09-28 · 10-03 · 10-06)', (x) => /09-28|10-03|10-06/.test(x.g));
console.log('\n그룹별 모델 크기 비(가운데) · MAE 모델 / 덩어리');
for (const g of [...new Set(rows.map((x) => x.g))]) {
  const r = rows.filter((x) => x.g === g && x.model != null);
  const mae = (k) => (r.reduce((p, x) => p + Math.abs(x[k] - x.gun), 0) / r.length).toFixed(1);
  console.log(`  ${g.padEnd(14)} ${r.length}구 · 비 ${med(r.map((x) => x.R)).toFixed(3)} · ${mae('model')} / ${mae('blob')}`);
}
if (arg('list', '0') === '1') for (const x of rows) console.log(x.id.padEnd(44), x.gun, '모델', x.model?.toFixed(1), '덩어리', x.blob.toFixed(1), '엔진', x.engine, 'R', x.R?.toFixed(3), 'n', x.n);
