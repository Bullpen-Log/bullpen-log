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
const {
  buildReport,
  reportSummary,
  summaryChip,
  jobReportSummary,
  readReportSummary,
  REPORT_CRITERIA,
  coverageText,
  measurementText,
  prescriptionMessage,
  isMeasured,
  measuredCount,
} = await import('../lib/pitch-3d/v2/report.ts');
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
const { prescribedTitles } = await import('../lib/mechanics/prescriptions.ts');
const drills = ['기초', '연결', '통합'].flatMap((stage) =>
  prescribedTitles('drift.stuck', stage, 2).map((title) => ({
    title,
    stage,
    category: '무브먼트 패턴 드릴',
    focusPoints: ['드리프트'],
    thumbUrl: null,
    variants: [{ id: title, category: '무브먼트 패턴 드릴', equipment: ['맨몸'] }],
  }))
);
const ctx = { heightCm: 180, ground: 'mound', youth: false, drills };
const built = [];
const report = (m = base(), overrides = {}, res = result) => {
  globalThis.__reportMetrics = m;
  const r = buildReport(res, { ...ctx, ...overrides });
  built.push(r);
  return r;
};
const item = (r, name) => r.items.find((i) => i.element === name);

const missingRx = base();
missingRx.drift.aheadAtKneeUp = 0.04;
const requiredBasic = prescribedTitles('drift.stuck', '기초', 2);
const missingLibrary = drills.filter((d) => d.title !== requiredBasic[1]);
missingLibrary.push({ ...drills[0], title: '다른 드리프트 동작' });
assert.deepEqual(report(missingRx, { drills: missingLibrary }).rx, [], '같은 요소의 다른 동작으로 빠진 필수 드릴을 채우지 않는다');

const normal = report();
assert.deepEqual(normal.coverage, { evaluated: 1, reference: 5, unavailable: 0, total: 6 });
assert.doesNotMatch(normal.headline.title, /크게 고칠 곳이 없|지금 동작을 지켜/);
assert.match(normal.headline.title, /드리프트.*좋아요/);
assert.equal(summaryChip(reportSummary(normal)).text, '수치 6/6 · 평가 1/6');

/* 전부 신뢰도 충분 → 평가 1 · 참고 5 그대로, 참고 다섯은 서로 다른 관찰을 주 설명으로(검증 안내는 띠 밑으로) */
assert.match(normal.headline.title, /다른 5개 지표의 수치는 참고로 확인할 수 있어요/);
assert.doesNotMatch(normal.headline.title, /추가 확인/);
assert.equal(coverageText(normal.coverage), '수치 확인 6/6 · 평가 가능 1/6');
const notes = normal.items.filter((i) => i.status === 'note');
assert.equal(notes.length, 5);
assert.equal(new Set(notes.map((i) => i.line)).size, 5, '참고 항목마다 다른 관찰');
const OBSERVED = {
  드롭: /니업에서 착지까지 골반 높이가 다리 길이의 36%만큼 내려가요/,
  '상하체 분리': /어깨선은 디딤 방향을 기준으로 40° 닫혀 있어요/,
  브레이크: /착지에서 공을 놓을 때까지 앞무릎이 10° 펴져요/,
  '몸통 회전': /공을 놓을 때 몸통이 앞으로 30° 기울어져 있어요/,
  스로잉: /던지는 팔의 어깨 벌림은 88°예요/,
};
for (const i of notes) {
  assert.match(i.line, OBSERVED[i.element], i.element);
  assert.doesNotMatch(i.line, /잘 |충분히|덜 |늦|무너|검증|다시 찍/, `${i.element} 관찰에 평가 · 안내 말 없음`);
  assert.match(i.foot, /동작이나 촬영에 문제가 있다는 뜻은 아니에요/);
  assert.doesNotMatch(i.foot, /다시 찍|다시 촬영/, '검증 중이라고 재촬영을 권하지 않는다');
  assert.equal(i.prescriptionEligible, false);
  assert.ok(isMeasured(i));
}
assert.match(measurementText(item(normal, '브레이크')), /지표 검증 중/);
assert.match(prescriptionMessage(normal), /자동 처방의 근거로 쓰지 않아요/);
assert.doesNotMatch(prescriptionMessage(normal), /다시 촬영|다시 찍/);

const block = base();
block.block.kneeCollapseDeg = 30;
const uncertainBlock = item(report(block), '브레이크');
assert.equal(uncertainBlock.assessment, 'improve', '기준상 수치 위치는 경계로 축소하지 않는다');
assert.equal(uncertainBlock.status, 'note');
assert.equal(uncertainBlock.value, '30°');
assert.equal(uncertainBlock.measurement.validation, 'provisional');
assert.equal(uncertainBlock.prescriptionEligible, false);
assert.equal(uncertainBlock.fault, null);
assert.match(uncertainBlock.line, /최대 30° 더 굽어져요/, '큰 편차도 중립 관찰로');
assert.doesNotMatch(uncertainBlock.line, /무너|고칠/);
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
  const plan = focusPlan({ rx: r.rx, done: 0, base: drills.map((d) => d.title), drills, criteria: REPORT_CRITERIA });
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
assert.match(one.headline.title, /드리프트 지표는 좋아요\.\n다른 5개 지표는 확인하지 못했어요/);
assert.equal(coverageText(one.coverage), '수치 확인 1/6 · 평가 가능 1/6');
for (const i of one.items.filter((x) => x.status === 'unsure')) {
  assert.equal(i.value, null, `${i.element} 신뢰도 부족은 수치를 안 보인다`);
  assert.match(i.line, /잘 보이지 않아 판정하지 않았어요/);
  assert.doesNotMatch(i.line, /내려가요|기울어져|벌림은|펴져요|닫혀 있어요/, '신뢰도 부족에 관찰 문장 없음');
  assert.match(measurementText(i), /확인 어려움 · 영상 신뢰도 부족/);
  assert.equal(i.metricNote, null, '확인 못 한 칸에 지표 정의를 붙이지 않는다');
}
assert.match(item(one, '드롭').line, /니업과 착지 때 골반 · 다리가/);
assert.match(item(one, '스로잉').line, /착지 때 던지는 팔이/);
assert.match(prescriptionMessage(one), /확인하지 못한 항목은 투구의 흐름에서 까닭을/);
assert.doesNotMatch(one.headline.title, /크게 고칠 곳이 없/);
partial.drift.conf = 0;
assert.equal(report(partial).coverage.unavailable, 6);
assert.equal(report(partial).headline.tone, 'unsure');
assert.match(report(partial).headline.title, /확인하지 못했어요/);
assert.doesNotMatch(report(partial).headline.title, /좋아요|참고로 확인/, '전부 확인 못 함을 성공처럼 쓰지 않는다');
assert.equal(summaryChip(reportSummary(report(partial))).text, '확인 어려움');
/* 일부만 확인 못 함 · 평가 0 */
const mixed = base();
mixed.drift.conf = 10;
mixed.arm.conf = 10;
const mx = report(mixed);
assert.deepEqual(mx.coverage, { evaluated: 0, reference: 4, unavailable: 2, total: 6 });
assert.match(mx.headline.title, /4개 지표의 수치를 참고로 확인할 수 있어요\.\n2개는 확인하지 못했어요/);
assert.equal(summaryChip(reportSummary(mx)).text, '수치 4/6 · 평가 0/6');

/* 신뢰도 경계 29 / 30 — 이전과 같은 문턱 */
for (const [conf, st] of [
  [29, 'unsure'],
  [30, 'note'],
]) {
  const mm = base();
  mm.separation.trunkConf = conf;
  assert.equal(item(report(mm), '상하체 분리').status, st, `분리 신뢰도 ${conf}`);
}

/* 부호 · 0 · 단위 */
const sign = (mutate, name, re) => {
  const mm = base();
  mutate(mm);
  assert.match(item(report(mm), name).line, re);
};
sign((mm) => (mm.separation.trunkOpenAtPlantDeg = 12), '상하체 분리', /12° 열려 있어요/);
sign((mm) => (mm.separation.trunkOpenAtPlantDeg = 0.2), '상하체 분리', /디딤 방향과 나란해요/);
sign((mm) => (mm.drop.pelvisDrop = -0.03), '드롭', /니업 때보다 다리 길이의 3%만큼 높아요/);
sign((mm) => (mm.drop.pelvisDrop = 0.001), '드롭', /거의 그대로예요/);
sign((mm) => (mm.drop.rise = 0.04), '드롭', /한때 니업보다 다리 길이의 4%만큼 올라갔어요/);
sign((mm) => ((mm.block.kneeCollapseDeg = 0), (mm.block.kneeExtensionDeg = -5)), '브레이크', /앞무릎이 5° 더 굽어져요/);
sign((mm) => (mm.block.kneeCollapseDeg = 0.3), '브레이크', /펴져요/);
sign((mm) => (mm.trunkTilt.forwardDeg = -5), '몸통 회전', /뒤로 5° 젖혀져 있어요/);
sign((mm) => (mm.trunkTilt.forwardDeg = 0.3), '몸통 회전', /거의 기울지 않았어요/);
const lefty = base();
lefty.hand = 'L';
assert.match(item(report(lefty), '상하체 분리').line, /40° 닫혀 있어요/, '좌투도 부호 그대로');

/* 사건 미검출 · 계산 불가 — 니업을 못 찾았다고 일괄 단정하지 않는다 */
const noDrop = base();
noDrop.drop = null;
const nd = item(report(noDrop), '드롭');
assert.equal(nd.status, 'unsure');
assert.match(nd.line, /높이 기준선을 잡지 못해/);
assert.doesNotMatch(nd.line, /니업\)을 찾지 못해/);
assert.match(measurementText(nd), /계산하지 못함/);
const noKnee = base();
noKnee.drift = null;
noKnee.drop = null;
const nk = report(noKnee, {}, { ...result, events: { ...result.events, kneeUp: null } });
assert.match(item(nk, '드리프트').line, /니업\)을 찾지 못해 이 지표는/);
assert.doesNotMatch(item(nk, '드리프트').line, /영상 전체|분석 실패/);

/* 비정상 계산값 — 정상 수치 · 관찰처럼 보이지 않는다 */
for (const bad of [NaN, Infinity, -Infinity]) {
  const s1 = base();
  s1.separation.trunkOpenAtPlantDeg = bad;
  const sp = item(report(s1), '상하체 분리');
  assert.equal(sp.status, 'unsure');
  assert.equal(sp.measurement.quality, 'invalid');
  assert.equal(sp.value, null);
  assert.match(sp.line, /분석 확인이 필요해요/);
  const t1 = base();
  t1.trunkTilt.forwardDeg = bad;
  const tt = item(report(t1), '몸통 회전');
  assert.equal(tt.measurement.quality, 'invalid');
  assert.equal(tt.value, null);
  assert.doesNotMatch(tt.line, /기울어져|젖혀져/);
}
const imp = base();
imp.block.kneeCollapseDeg = 45;
assert.match(item(report(imp), '브레이크').line, /정상 범위를 벗어나/);

for (const overrides of [{ ground: 'flat' }, { youth: true }]) {
  const m = base();
  m.drop.pelvisDrop = 0.01;
  const r = report(m, overrides);
  assert.equal(item(r, '드롭').status, 'note');
  assert.equal(item(r, '드롭').prescriptionEligible, false);
  assert.match(item(r, '드롭').line, /다리 길이의 1%만큼 내려가요/, '평지 · 성장기도 측정 관찰은 보인다');
  assert.doesNotMatch(item(r, '드롭').line, /떠요|고칠/);
  assert.match(
    item(r, '드롭').foot,
    overrides.ground === 'flat' ? /평지 영상은 평가하지 않고 수치만/ : /성장기는 크기보다 순서를 먼저 봐서 이 수치로 교정 필요를 정하지 않아요/
  );
  assert.match(measurementText(item(r, '드롭')), overrides.ground === 'flat' ? /평지 영상이라 참고/ : /성장기라 참고/);
}
const invalid = base();
invalid.drift.aheadAtKneeUp = NaN;
assert.equal(item(report(invalid), '드리프트').measurement.quality, 'invalid');
assert.equal(item(report(invalid), '드리프트').value, null);
for (const name of ['상하체 분리', '몸통 회전', '스로잉']) assert.ok(item(normal, name).metricNote);

const m = base();
m.drift.aheadAtKneeUp = 0.04;
const missingBasics = report(m, { drills: drills.filter((d) => d.stage !== '기초') });
assert.equal(missingBasics.rx.length, 0, '기초 드릴이 없으면 연결부터 시작하는 처방을 만들지 않는다');
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
for (const r of built) {
  assert.equal(r.items.filter(isMeasured).length, measuredCount(r.coverage), '수치 확인 개수 = 신뢰도 충분 + 유한한 값');
  assert.ok(r.items.every((i) => (i.status === 'note' || i.status === 'unsure') === (i.why != null)));
}
const { APP_API_LEVEL, minAppApiForAction } = await import('../lib/app-api.ts');
assert.ok(APP_API_LEVEL >= 4);
assert.ok(minAppApiForAction('pitch-lab.loadAppLabDetail') >= 4);
assert.ok(minAppApiForAction('mechanics.startMechanicsFocus') >= 4);
assert.ok(minAppApiForAction('mechanics.recordMechanicsDrill') >= 3);
console.log(
  '3D 리포트 정책 검사 통과: 신뢰도·평가·단계 분리, 참고 지표 차단, 참고 관찰 · 확인 못 함 구분, 부호 · 경계 · 비정상값, 확인 범위, 실제 세션, 구형 처방·요약 호환'
);
