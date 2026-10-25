/** 측정값 이후의 실제 리포트·처방 정책을 검사한다. 3D 엔진 정확도 검사가 아니다. DB 접근 없음. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('/lib/pitch-3d/v2/mech-checks.ts'))
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export const DROP_RISE_MAX=.02; export const mechChecks=()=>globalThis.__reportMetrics;',
      };
    return next(url, context);
  },
});
const { buildReport, reportSummary, summaryChip, jobReportSummary, readReportSummary, REPORT_CRITERIA } =
  await import('../lib/pitch-3d/v2/report.ts');
const { focusPlan, focusView, freshState, readProgramState, programStateJson } = await import('../lib/mechanics/program.ts');
const base = () => ({
  hand: 'R',
  drift: { aheadAtKneeUp: 0.1, aheadAtKneeUpCm: 18, conf: 50 },
  drop: { pelvisDrop: 0.36, rise: 0, conf: 50 },
  separation: { trunkOpenAtPlantDeg: -40, trunkConf: 50 },
  trunkTilt: { forwardDeg: 30, conf: 50 },
  arm: { abductionAtPlantDeg: 88, conf: 50 },
  block: { pelvisDecelPct: 95, kneeExtensionDeg: 10, kneeCollapseDeg: 3, conf: 50 },
});
const result = {
  hand: 'R',
  joints: [],
  conf: [],
  events: { kneeUp: 5, footPlant: 10, release: 20 },
  t: Array.from({ length: 30 }, (_, i) => i / 60),
};
const drills = ['기초', '연결', '통합'].flatMap((stage) =>
  [0, 1].map((n) => ({
    title: `${stage}${n}`,
    stage,
    category: '무브먼트 패턴 드릴',
    focusPoints: ['드리프트'],
    thumbUrl: null,
    variants: [{ id: `${stage}${n}`, category: '무브먼트 패턴 드릴', equipment: ['맨몸'] }],
  }))
);
const ctx = { heightCm: 180, ground: 'mound', youth: false, drills };
const report = (m = base(), overrides = {}) => {
  globalThis.__reportMetrics = m;
  return buildReport(result, { ...ctx, ...overrides });
};
const item = (r, name) => r.items.find((i) => i.element === name);

const normal = report();
assert.deepEqual(normal.coverage, { evaluated: 1, reference: 5, unavailable: 0, total: 6 });
assert.doesNotMatch(normal.headline.title, /크게 고칠 곳이 없|지금 동작을 지켜/);
assert.match(normal.headline.title, /드리프트.*좋아요/);
assert.equal(summaryChip(reportSummary(normal)).text, '평가 1/6');

const block = base();
block.block.kneeCollapseDeg = 30;
const uncertainBlock = item(report(block), '브레이크');
assert.equal(uncertainBlock.assessment, 'improve', '기준상 수치 위치는 경계로 축소하지 않는다');
assert.equal(uncertainBlock.status, 'note');
assert.equal(uncertainBlock.value, '30°');
assert.equal(uncertainBlock.measurement.validation, 'provisional');
assert.equal(uncertainBlock.prescriptionEligible, false);
assert.equal(uncertainBlock.fault, null);
assert.deepEqual(report(block).rx, [], '검증 중인 큰 값이 연결·통합 처방을 만들지 않는다');

for (const [ahead, level] of [
  [0.04, 'improve'],
  [0.065, 'edge'],
]) {
  const m = base();
  m.drift.aheadAtKneeUp = ahead;
  const r = report(m);
  assert.equal(r.rx[0].level, level);
  assert.equal(r.rx[0].weeks[0].stage, '기초', '문제의 경중과 시작 단계를 분리한다');
  const plan = focusPlan({ rx: r.rx, done: 0, base: ['통합0', '연결0', '기초0', '기초1'], drills, criteria: REPORT_CRITERIA });
  assert.ok(plan.titles.length > 0);
  assert.ok(
    plan.titles.every((t) => drills.find((d) => d.title === t).stage === '기초'),
    '실제 세션에도 높은 단계가 섞이지 않는다'
  );
  for (const conf of [29, 0, null, undefined, NaN, Infinity, -1, 101]) {
    m.drift.conf = conf;
    const lower = report(m);
    assert.equal(item(lower, '드리프트').prescriptionEligible, false);
    assert.equal(item(lower, '드리프트').assessment, null);
    assert.equal(lower.rx.length, 0, '낮거나 빠진 신뢰도가 단계를 올리지 않는다');
  }
}

const partial = base();
for (const key of ['drop', 'trunkTilt', 'arm', 'block']) partial[key].conf = 0;
partial.separation.trunkConf = 0;
const one = report(partial);
assert.deepEqual(one.coverage, { evaluated: 1, reference: 0, unavailable: 5, total: 6 });
assert.match(one.headline.title, /나머지 5개/);
assert.doesNotMatch(one.headline.title, /크게 고칠 곳이 없/);
partial.drift.conf = 0;
assert.equal(report(partial).coverage.unavailable, 6);
assert.equal(report(partial).headline.tone, 'unsure');

for (const overrides of [{ ground: 'flat' }, { youth: true }]) {
  const m = base();
  m.drop.pelvisDrop = 0.01;
  const r = report(m, overrides);
  assert.equal(item(r, '드롭').status, 'note');
  assert.equal(item(r, '드롭').prescriptionEligible, false);
}
const invalid = base();
invalid.drift.aheadAtKneeUp = NaN;
assert.equal(item(report(invalid), '드리프트').measurement.quality, 'invalid');
assert.equal(item(report(invalid), '드리프트').value, null);
for (const name of ['상하체 분리', '몸통 회전', '스로잉']) assert.ok(item(normal, name).metricNote);

const m = base();
m.drift.aheadAtKneeUp = 0.04;
const missingBasics = report(m, {drills:drills.filter((d)=>d.stage !== '기초')});
assert.equal(missingBasics.rx.length,0,'기초 드릴이 없으면 연결부터 시작하는 처방을 만들지 않는다');
const current = report(m);
const focus = { reportId: 'r1', jobId: 'j1', rx: current.rx, startedOn: '2026-10-25', done: 2 };
const legacyState = { ...freshState('beginner'), focus };
const legacy = readProgramState(programStateJson(legacyState));
assert.deepEqual(legacy.focus, focus, '구형 처방의 구성·진행은 보존한다');
assert.match(focusView(legacy.focus).criteriaNote, /이전 판정 기준/);
assert.equal(focusView({ ...focus, criteria: REPORT_CRITERIA }).criteriaNote, null);
const sum = reportSummary(current);
assert.deepEqual(readReportSummary(sum), sum);
assert.equal(jobReportSummary({ shownJobId: 'j1', report: { ...sum, jobId: 'j1', criteria: '2026-10-21' } }), null);
assert.deepEqual(jobReportSummary({ shownJobId: 'j1', report: { ...sum, jobId: 'j1' } }), sum);
assert.equal(summaryChip({ v: 1, criteria: 'old', primary: null, bad: [], judged: true }).tone, 'muted');
const { APP_API_LEVEL, minAppApiForAction } = await import('../lib/app-api.ts');
assert.equal(APP_API_LEVEL, 4);
assert.equal(minAppApiForAction('pitch-lab.loadAppLabDetail'), 4);
assert.equal(minAppApiForAction('mechanics.startMechanicsFocus'), 4);
assert.equal(minAppApiForAction('mechanics.recordMechanicsDrill'), 3);
console.log('3D 리포트 정책 검사 통과: 신뢰도·평가·단계 분리, 참고 지표 차단, 확인 범위, 실제 세션, 구형 처방·요약 호환');
