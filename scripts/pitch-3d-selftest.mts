/**
 * 3D 투구 분석 엔진 시험 — 단위(수학 · 본질 행렬 · 교차 · 시간 맞추기 · 결과 검사) + 합성 투수 끝까지(설계 5절 1단계, 검토 R2 · R7).
 *
 *   npm run pitch3d:test            (빠른 판 — 장면 수 · 씨앗 적게)
 *   npm run pitch3d:test -- --full  (씨앗 늘려 숫자를 낸다 — 설계 문서 '잰 값')
 *
 * 합성 투수: 알려진 3D 관절(우투, 좌투는 거울)을 가짜 카메라 둘로 비춘다. 두 카메라 모두 투수를 겨눠 광축이 만나는 배치(초점이
 * 원리상 약하게 정해지는 경우, R2), 화면 녹화처럼 같은 장면 · 슬로모 속도 차 · 시작 어긋남, 2D 잡음, 한쪽에서 가려진 관절의 지어낸 값,
 * 뒤 영상 좌우 뒤바뀜, 폰 숙임 · 기울임을 넣는다. 진짜 지표는 같은 지표 함수로 진짜 3D 에서 잰다 — 차이 = 엔진(기하)의 오차.
 */
import { readPitch3dResult, storedAnalysisJson, MAX_STORED_BYTES, type Pitch3dOk } from '../lib/pitch-3d/analyze.ts';
import {
  decomposeEssential,
  essentialFrom,
  project,
  triangulate,
  type Camera,
} from '../lib/pitch-3d/camera.ts';
import { eigenSym, mul3, norm, normalize, rodrigues, rotvec, sub, svd3, transpose, type Mat3, type Vec3 } from '../lib/pitch-3d/linalg.ts';
import type { MetricKey } from '../lib/pitch-3d/metrics.ts';
import { base, realistic, rng, run, type Scenario } from './pitch-lab/synth.mts';

const FULL = process.argv.includes('--full');
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'OK  ' : '실패'} ${name}${detail ? ' — ' + detail : ''}`);
}

/* ───────────────────────────── 단위 시험 ───────────────────────────── */
console.log('■ 수학');
{
  const r = rng(1);
  const A = [
    [4, 1, 2],
    [1, 3, 0.5],
    [2, 0.5, 5],
  ];
  const { values, vectors } = eigenSym(A);
  let worst = 0;
  values.forEach((lam, k) => {
    const v = vectors[k];
    const Av = A.map((row) => row.reduce((s, x, i) => s + x * v[i], 0));
    worst = Math.max(worst, ...Av.map((x, i) => Math.abs(x - lam * v[i])));
  });
  check('고윳값: A·v = λ·v', worst < 1e-9, `최대 차이 ${worst.toExponential(1)}`);

  const M: Mat3 = Array.from({ length: 9 }, () => r.n());
  const { U, s, V } = svd3(M);
  const back = mul3(mul3(U, [s[0], 0, 0, 0, s[1], 0, 0, 0, s[2]]), transpose(V));
  check('SVD: U·S·Vᵀ = M', Math.max(...back.map((x, i) => Math.abs(x - M[i]))) < 1e-9);

  const rv: Vec3 = [0.3, -1.1, 0.7];
  const rr = rotvec(rodrigues(rv));
  check('회전 벡터 왕복', norm(sub(rr, rv)) < 1e-9);
}

console.log('■ 본질 행렬 · 교차');
{
  const r = rng(2);
  const R = rodrigues([0.1, 1.45, -0.05]);
  const t = normalize([1, 0.1, 0.6]);
  const side: Camera = { f: 1000, cx: 500, cy: 600, R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
  const backCam: Camera = { f: 900, cx: 450, cy: 550, R, t };
  const pts: Vec3[] = Array.from({ length: 200 }, () => [r.n() * 0.4, r.n() * 0.5, 3 + r.n() * 0.4]);
  const pairs = pts.flatMap((X) => {
    const a = project(side, X);
    const b = project(backCam, X);
    return a && b
      ? [{ a: [(a[0] - 500) / 1000, (a[1] - 600) / 1000] as [number, number], b: [(b[0] - 450) / 900, (b[1] - 550) / 900] as [number, number], w: 1 }]
      : [];
  });
  const E = essentialFrom(pairs)!;
  const cands = decomposeEssential(E);
  const hit = cands.some((c) => norm(rotvec(mul3(c.R, transpose(R)))) < 1e-4 && norm(sub(c.t, t)) < 1e-4);
  check('8점 → 네 후보 중 진짜 R · t', hit);
  const X0: Vec3 = [0.2, -0.3, 3.1];
  const pa = project(side, X0)!;
  const pb = project(backCam, X0)!;
  const X = triangulate(side, { x: pa[0], y: pa[1], v: 1 }, backCam, { x: pb[0], y: pb[1], v: 1 });
  check('두 광선 교차 = 그 점', !!X && norm(sub(X, X0)) < 1e-9);
}

/*
 * 기준 — 빠른 판(씨앗 1)은 '무너짐'을 잡는 넉넉한 문턱(씨앗 5개에서 잰 최대 + 여유, 좌우가 통째로 뒤바뀌면 30~130 이 나온다),
 * --full 은 씨앗 5개 평균이 정확도 목표 안인지 본다(2026-10-08 잰 값: 설계 문서 '잰 값').
 */
const CLEAN: Partial<Record<MetricKey, number>> = { trunkForwardTilt: 1.5, trunkLateralTilt: 1.5, separationMax: 1.5, separationAtPlant: 1.5, leadKneeAtPlant: 1.5, leadKneeAtRelease: 1.5, strideLength: 1, strideOffset: 1, shoulderAbduction: 1.5 };
const MAX: Partial<Record<MetricKey, number>> = { trunkForwardTilt: 10, trunkLateralTilt: 5, separationMax: 13, separationAtPlant: 12, leadKneeAtPlant: 8, leadKneeAtRelease: 11, strideLength: 4, strideOffset: 7, shoulderAbduction: 14 };
const MEAN: Partial<Record<MetricKey, number>> = { trunkForwardTilt: 5.5, trunkLateralTilt: 3, separationMax: 6, separationAtPlant: 6, leadKneeAtPlant: 3.5, leadKneeAtRelease: 5, strideLength: 2.5, strideOffset: 4, shoulderAbduction: 8 };
const SCENARIOS: { sc: Scenario; budget: Partial<Record<MetricKey, number>> | null; mean?: Partial<Record<MetricKey, number>>; expect?: string }[] = [
  { sc: { ...base, name: '깨끗함(잡음 없음 · 멀리 줌)' }, budget: CLEAN, mean: CLEAN },
  { sc: { ...base, ...realistic, name: '실제처럼(멀리 줌 · 잡음 · 가려짐 · 뒤바뀜 · 슬로모 차)' }, budget: MAX, mean: MEAN },
  { sc: { ...base, ...realistic, name: '가까이 넓게(원근 강함, 초점 0.9배 · 3.2m)', side: { ...base.side, D: 3.2, k: 0.9 }, back: { ...base.back, D: 3.4, k: 0.95 } }, budget: MAX, mean: MEAN },
  { sc: { ...base, ...realistic, name: '폰 숙임 · 기울임(위 1.2m 에서 · 롤 2°)', side: { ...base.side, up: 1.2, roll: 2 }, back: { ...base.back, up: 1.4, roll: -1.5 } }, budget: MAX, mean: MEAN },
  { sc: { ...base, ...realistic, hand: 'L', backMirror: true, name: '좌투 · 뒤 영상 좌우 거울' }, budget: MAX, mean: MEAN },
  { sc: { ...base, ...realistic, name: '각도 좁음(35°) → 경고', angle: 35 }, budget: null, expect: 'narrow' },
  { sc: { ...base, ...realistic, name: '장면 적음(옆 초당 11) → 경고', sampleSide: 1 / 11 }, budget: null, expect: 'density' },
  { sc: { ...base, ...realistic, name: '뒤 영상이 착지 뒤 곧 끝남 → 구간 다름', backEnd: 1.1 }, budget: null, expect: 'range' },
];

const seeds = FULL ? [1, 2, 3, 4, 5] : [1];
console.log(`■ 합성 투수(씨앗 ${seeds.length}개씩)`);
const summary: { name: string; key: string; mean: number; max: number }[] = [];
for (const { sc, budget, mean: meanBudget, expect } of SCENARIOS) {
  const runs = seeds.map((s) => run(sc, s));
  const msAvg = Math.round(runs.reduce((a, r) => a + r.ms, 0) / runs.length);
  if (expect === 'range') {
    check(`${sc.name}`, runs.every((r) => !r.result.ok && r.result.code === 'range'), runs.map((r) => (r.result.ok ? 'ok' : r.result.code)).join(','));
    continue;
  }
  const okRuns = runs.filter((r) => r.result.ok);
  if (okRuns.length !== runs.length) {
    check(`${sc.name} — 분석 성공`, false, runs.map((r) => (r.result.ok ? 'ok' : `${r.result.code}`)).join(','));
    continue;
  }
  const q = (okRuns[0].result as Pitch3dOk).quality;
  console.log(`  · ${sc.name}: ${msAvg}ms · 다시 비춤 ${q.reprojPct}% · 뼈 흔들림 몸통 ${q.boneCv.trunk}% 다리 ${q.boneCv.legs}% 위팔 ${q.boneCv.upperArm}% 아래팔 ${q.boneCv.forearm}% · 광축 사이 ${q.axisAngleDeg}° · 초점 옆 ${q.focal.side}(진짜 ${sc.side.k}) 뒤 ${q.focal.back}(진짜 ${sc.back.k}) 폭 ${q.focal.spread} · 보정 믿음 ${q.calibration} · 고친 좌우 ${q.flips.repaired} · 경고 ${(okRuns[0].result as Pitch3dOk).warnings.join(',') || '없음'}`);
  if (expect) {
    check(`${sc.name}`, okRuns.every((r) => (r.result as Pitch3dOk).warnings.includes(expect as never)));
    continue;
  }
  for (const [key, lim] of Object.entries(budget!)) {
    const errs = okRuns.map((r) => r.errors[key as MetricKey]).filter((e): e is number => e != null);
    if (errs.length === 0) {
      check(`${sc.name} · ${key}`, false, '값 없음');
      continue;
    }
    const mean = errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length;
    const max = Math.max(...errs.map(Math.abs));
    summary.push({ name: sc.name, key, mean, max });
    check(`${sc.name} · ${key} 오차 ±${lim} 안`, max <= lim, `평균 ${mean.toFixed(2)} · 최대 ${max.toFixed(2)}`);
    const mLim = meanBudget?.[key as MetricKey];
    if (FULL && mLim != null) check(`${sc.name} · ${key} 평균 오차 ±${mLim} 안(씨앗 ${errs.length})`, mean <= mLim, `평균 ${mean.toFixed(2)}`);
  }
}

console.log('■ 결과 저장 · 읽기');
{
  const r = run({ ...base, ...realistic, name: 'json' }, 7).result;
  const json = JSON.stringify(r);
  check('결과가 나온다(실제처럼 · 씨앗 7)', r.ok === true, r.ok ? '' : String((r as { code?: string }).code));
  check('결과 크기 300KB 밑', json.length < 300_000, `${Math.round(json.length / 1024)}KB`);
  check('저장 상한(900KB)보다 작다', json.length < MAX_STORED_BYTES);
  check('읽기: 엔진 결과는 그대로 받는다', readPitch3dResult(JSON.parse(json)) !== null);
  const bad = JSON.parse(json);
  bad.joints[0][0] = ['x', 1, 2];
  check('읽기: 숫자가 아닌 좌표는 거절', readPitch3dResult(bad) === null);
  check('읽기: 판 번호 없으면 거절', readPitch3dResult({ ...JSON.parse(json), version: undefined }) === null);
  check('읽기: 모르는 경고 코드는 거절', readPitch3dResult({ ...JSON.parse(json), warnings: ['hack'] }) === null);
  check('저장: 검사를 지난 결과만 문자열로', 'json' in storedAnalysisJson(JSON.parse(json)) && 'error' in storedAnalysisJson({ ok: true }));
  check('저장: 900KB 넘으면 거절(품질 칸에 큰 글을 넣어도)', 'error' in storedAnalysisJson({ ...JSON.parse(json), quality: { pad: 'x'.repeat(1_000_000) } }));
  check('읽기: 실패 결과는 까닭 글을 다시 붙인다', (readPitch3dResult({ ok: false, version: '0.1.0', code: 'range', reason: '<b>x</b>' }) as { reason: string } | null)?.reason?.startsWith('두 영상이') === true);
}

if (FULL) {
  console.log('\n■ 지표별 오차(합성, 씨앗 5개) — 설계 문서 "잰 값"');
  for (const s of summary) console.log(`  ${s.name} | ${s.key} | 평균 ${s.mean.toFixed(1)} · 최대 ${s.max.toFixed(1)}`);
}

console.log(`\n${passed} 통과 · ${failed} 실패`);
if (failed > 0) process.exit(1);
