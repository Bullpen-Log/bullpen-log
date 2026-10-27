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
  RX_PRACTICE_NOTE,
  rxAction,
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
const drills = ['drift.stuck', 'block.collapse'].flatMap((fault) =>
  ['기초', '연결', '통합'].flatMap((stage) =>
    prescribedTitles(fault, stage, 2).map((title) => ({
      title,
      stage,
      category: '무브먼트 패턴 드릴',
      focusPoints: [fault === 'drift.stuck' ? '드리프트' : '브레이크'],
      thumbUrl: null,
      variants: [{ id: title, category: '무브먼트 패턴 드릴', equipment: ['맨몸'] }],
    }))
  )
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
const requiredBasic = prescribedTitles('drift.stuck', '기초', 1);
const missingLibrary = drills.filter((d) => d.title !== requiredBasic[0]);
missingLibrary.push({ ...drills[0], title: '다른 드리프트 동작' });
assert.deepEqual(report(missingRx, { drills: missingLibrary }).rx, [], '같은 요소의 다른 동작으로 빠진 필수 드릴을 채우지 않는다');

/* 2026-10-26 등급: 드롭 · 상하체 분리 · 브레이크 · 몸통 회전은 평가(A), 스로잉만 참고(B) */
const normal = report();
assert.deepEqual(normal.coverage, { evaluated: 5, reference: 1, unavailable: 0, total: 6 });
assert.equal(normal.headline.title, '평가한 5개 지표에 고칠 점이 없어요.\n다른 1개 지표의 수치는 참고로 확인할 수 있어요.');
assert.doesNotMatch(normal.headline.title, /처방할 항목|추가 확인|크게 고칠 곳이 없|지금 동작을 지켜/);
assert.equal(summaryChip(reportSummary(normal)).text, '수치 6/6 · 평가 5/6');
assert.equal(coverageText(normal.coverage), '수치 확인 6/6 · 평가 가능 5/6');
for (const name of ['드리프트', '드롭', '상하체 분리', '브레이크', '몸통 회전']) {
  const i = item(normal, name);
  assert.equal(i.status, 'good', name);
  assert.equal(i.measurement.validation, 'supported', name);
  assert.match(measurementText(i), /수치 확인 · 평가 가능/, name);
  assert.equal(i.why, null, name);
}
const arm = item(normal, '스로잉');
assert.equal(arm.status, 'note');
assert.equal(arm.assessment, 'good', '참고여도 기준상 위치는 계산한다');
assert.equal(arm.prescriptionEligible, false);
assert.match(arm.line, /던지는 팔의 어깨 벌림은 88°예요/);
assert.doesNotMatch(arm.line, /잘 |충분히|덜 |늦|무너|검증|다시 찍/, '참고 관찰에 평가 · 안내 말 없음');
assert.match(arm.foot, /동작이나 촬영에 문제가 있다는 뜻은 아니에요/);
assert.match(measurementText(arm), /지표 검증 중/);
assert.match(prescriptionMessage(normal), /고칠 점이 없어 따로 권할 드릴이 없어요/);
assert.match(prescriptionMessage(normal), /참고 지표의 수치로는 드릴을 권하지 않아요/);
assert.doesNotMatch(prescriptionMessage(normal), /자동 처방|다시 촬영|다시 찍/);

/* 큰 브레이크 값은 이제 평가 · 개선 드릴(크게 굽는 실제 동작 — 실험실 c4d8 · f046 이 50~70°) */
const block = base();
block.block.kneeCollapseDeg = 30;
const bigBlock = report(block);
const blk = item(bigBlock, '브레이크');
assert.equal(blk.status, 'improve');
assert.equal(blk.assessment, 'improve');
assert.equal(blk.measurement.validation, 'supported');
assert.equal(blk.prescriptionEligible, true);
assert.equal(blk.fault, 'block.collapse');
assert.equal(bigBlock.headline.tag, '브레이크 · 고칠 점');
assert.equal(bigBlock.rx[0].element, '브레이크');
assert.deepEqual(
  bigBlock.rx[0].weeks.map((w) => [w.stage, w.drills.length]),
  [
    ['기초', 1],
    ['연결', 1],
    ['통합', 1],
  ],
  '개선 드릴은 단계마다 하나 — 쉬운 것부터 한 번 보는 목록'
);
for (const collapse of [45, 69, 90]) {
  const mm = base();
  mm.block.kneeCollapseDeg = collapse;
  assert.equal(item(report(mm), '브레이크').status, 'improve', `더 굽음 ${collapse}° 는 실제 동작으로 평가`);
}
const pelvisBack = base();
pelvisBack.block.pelvisDecelPct = 128;
assert.equal(item(report(pelvisBack), '브레이크').status, 'good', '골반 감속 100% 넘음(멈춘 뒤 살짝 뒤로)은 오류가 아니다');
const tooDeep = base();
tooDeep.block.kneeCollapseDeg = 95;
assert.match(item(report(tooDeep), '브레이크').line, /정상 범위를 벗어나/, '사람 무릎으로 못 내는 크기만 막는다');
const hiddenKnee = base();
hiddenKnee.block.keyConf = 20;
const hk = item(report(hiddenKnee), '브레이크');
assert.equal(hk.status, 'unsure', '착지 · 가장 굽은 장면이 안 보였으면 값을 믿지 않는다');
assert.equal(hk.measurement.quality, 'low');
assert.match(hk.line, /앞다리가 영상에서 잘 보이지 않아/);

/* 개선 드릴 단추 — 새 3주 처방은 시작하지 않는다, 진행 중인 옛 처방은 그대로 */
assert.deepEqual(rxAction(true, null), { kind: 'drills', label: '드릴 영상 보기', note: RX_PRACTICE_NOTE });
assert.equal(rxAction(false, null).kind, 'drills');
assert.equal(rxAction(true, { done: 2, total: 9 }).kind, 'progress');
assert.equal(rxAction(true, { done: 9, total: 9 }).kind, 'retake');

for (const [ahead, level] of [
  [0.04, 'improve'],
  [0.065, 'edge'],
]) {
  const m = base();
  m.drift.aheadAtKneeUp = ahead;
  const r = report(m);
  assert.equal(r.rx[0].level, level);
  assert.equal(r.rx[0].weeks[0].stage, '기초', '문제의 경중과 시작 단계를 분리한다');
  const driftOnly = drills.filter((d) => d.focusPoints[0] === '드리프트');
  const plan = focusPlan({ rx: r.rx, done: 0, base: driftOnly.map((d) => d.title), drills: driftOnly, criteria: REPORT_CRITERIA });
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
assert.match(prescriptionMessage(one), /확인하지 못한 항목은 여섯 요소 판독에서 까닭을/);
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
assert.deepEqual(mx.coverage, { evaluated: 4, reference: 0, unavailable: 2, total: 6 });
assert.equal(mx.headline.title, '평가한 4개 지표에 고칠 점이 없어요.\n다른 2개 지표는 확인하지 못했어요.');
assert.equal(summaryChip(reportSummary(mx)).text, '수치 4/6 · 평가 4/6');
/* 평가 0 · 참고만 남은 경우 */
const refOnly = base();
for (const key of ['drift', 'drop', 'trunkTilt', 'block']) refOnly[key].conf = 10;
refOnly.separation.trunkConf = 10;
const ro = report(refOnly);
assert.deepEqual(ro.coverage, { evaluated: 0, reference: 1, unavailable: 5, total: 6 });
assert.match(ro.headline.title, /1개 지표의 수치를 참고로 확인할 수 있어요\.\n5개는 확인하지 못했어요/);

/* 신뢰도 경계 29 / 30 — 이전과 같은 문턱 */
for (const [conf, st] of [
  [29, 'unsure'],
  [30, 'good'],
]) {
  const mm = base();
  mm.separation.trunkConf = conf;
  assert.equal(item(report(mm), '상하체 분리').status, st, `분리 신뢰도 ${conf}`);
}

/* 부호 · 0 · 단위 */
/* 관찰 문장은 참고 칸의 주 설명 — 드롭 · 브레이크 · 몸통은 성장기면 참고라 그때 본다. 상하체 분리는 평가만이라 값 글자로 */
const sign = (mutate, name, re) => {
  const mm = base();
  mutate(mm);
  const i = item(report(mm, { youth: true }), name);
  assert.equal(i.status, 'note', name);
  assert.match(i.line, re);
};
const sepValue = (deg) => {
  const mm = base();
  mm.separation.trunkOpenAtPlantDeg = deg;
  return item(report(mm), '상하체 분리').value;
};
assert.equal(sepValue(12), '12° 열림');
assert.equal(sepValue(-40), '40° 닫힘');
sign((mm) => (mm.drop.pelvisDrop = -0.03), '드롭', /니업 때보다 다리 길이의 3%만큼 높아요/);
sign((mm) => (mm.drop.pelvisDrop = 0.001), '드롭', /거의 그대로예요/);
sign((mm) => (mm.drop.rise = 0.04), '드롭', /한때 니업보다 다리 길이의 4%만큼 올라갔어요/);
sign((mm) => ((mm.block.kneeCollapseDeg = 0), (mm.block.kneeExtensionDeg = -5)), '브레이크', /앞무릎이 5° 더 굽어져요/);
sign((mm) => (mm.block.kneeCollapseDeg = 0.3), '브레이크', /펴져요/);
sign((mm) => (mm.trunkTilt.forwardDeg = -5), '몸통 회전', /뒤로 5° 젖혀져 있어요/);
sign((mm) => (mm.trunkTilt.forwardDeg = 0.3), '몸통 회전', /거의 기울지 않았어요/);
const lefty = base();
lefty.hand = 'L';
assert.equal(item(report(lefty), '상하체 분리').value, '40° 닫힘', '좌투도 부호 그대로');

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
/* 직전 리포트와 견주기 — 평가 지표만 숫자로, 같은 날 연달아 찍은 공도, 순서가 거꾸로면 까닭 */
const { snapshot } = await import('./mechanics-comparison-fixture.mjs');
const { previousComparisonOf } = await import('../lib/pitch-3d/v2/compare-view.ts');
const prevRef = { reportId: 'p1', requestedAt: '2026-10-24T01:00:00Z' };
const pc = previousComparisonOf(prevRef, snapshot(), snapshot(true));
assert.equal(pc.compared, true);
assert.deepEqual(
  pc.rows.map((r) => [r.element, r.before, r.after, r.delta]),
  [['드리프트', 4, 12, 8]],
  '검증 중(provisional) 지표는 빠진다'
);
const sameDay = snapshot(true);
sameDay.context.files.forEach((f) => (f.at = '2026-10-24T00:30:00Z'));
assert.equal(previousComparisonOf(prevRef, snapshot(), sameDay).compared, true, '지난 분석 요청 전이라도 지난 영상 뒤에 찍었으면 견준다');
const earlier = snapshot(true);
earlier.context.files.forEach((f) => (f.at = '2026-10-23T00:00:00Z'));
assert.equal(previousComparisonOf(prevRef, snapshot(), earlier).reason, '지난번 영상보다 먼저 찍은 영상이에요.');
const otherEngine = snapshot(true);
otherEngine.engine = 'engine-2';
const oe = previousComparisonOf(prevRef, snapshot(), otherEngine);
assert.equal(oe.compared, false);
assert.match(oe.reason, /엔진 버전/);
assert.deepEqual(oe.rows, []);
const { APP_API_LEVEL, minAppApiForAction } = await import('../lib/app-api.ts');
assert.ok(APP_API_LEVEL >= 4);
assert.ok(minAppApiForAction('pitch-lab.loadAppLabDetail') >= 4);
assert.ok(minAppApiForAction('mechanics.startMechanicsFocus') >= 4);
assert.ok(minAppApiForAction('mechanics.recordMechanicsDrill') >= 3);
console.log(
  '3D 리포트 정책 검사 통과: 등급(평가 5 · 참고 1) · 브레이크 거르기 · 개선 드릴(단계마다 하나 · 새 3주 처방 없음) · 참고 관찰 · 확인 못 함 구분 · 부호 · 경계 · 비정상값 · 확인 범위 · 구형 처방·요약 호환 · 직전 리포트와 견주기'
);
