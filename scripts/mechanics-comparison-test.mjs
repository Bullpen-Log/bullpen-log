/** 실제 비교·저장 파싱·진행 정책 검사. 엔진 정확도나 운동 효과 검증이 아니다. */
import assert from 'node:assert/strict';
import { snapshot } from './mechanics-comparison-fixture.mjs';
import {
  compareAnalysis,
  readAnalysisContext,
  readAnalysisSnapshot,
  readMechanicsReview,
  addFollowup,
  reviewView,
} from '../lib/mechanics/comparison.ts';
import { freshState, programStateJson, readProgramState, archiveFocus } from '../lib/mechanics/program.ts';
import { newProgression, readiness } from '../lib/mechanics/progression.ts';
const a = snapshot(),
  b = snapshot(true);
const good = compareAnalysis(a, b, 'same');
assert.equal(good.kind, 'measurement');
assert.equal(good.rows[0].delta, 8);
assert.equal(good.rows[1].delta, null);
assert.match(good.rows[1].reason, /참고 지표/);
assert.match(good.note, /개선·악화나 운동 효과를 확정하지 않아요/);
assert.equal(
  compareAnalysis(
    b,
    {
      ...a,
      context: {
        ...a.context,
        requestedAt: '2026-11-01T00:00:00Z',
        files: a.context.files.map((f) => ({ ...f, at: '2026-10-30T00:00:00Z' })),
      },
      savedAt: '2026-11-01T00:00:00Z',
    },
    'same'
  ).rows[0].delta,
  -8
);
for (const conditions of ['different', 'unknown']) assert.equal(compareAnalysis(a, b, conditions).rows[0].delta, null);
for (const mutate of [
  (s) => (s.source = 'changed'),
  (s) => (s.source = 'unknown'),
  (s) => (s.engine = 'new'),
  (s) => (s.engine = null),
  (s) => (s.criteria = 'new'),
  (s) => (s.metricsVersion = 'new'),
  (s) => (s.context = null),
  (s) => (s.context.hand = 'L'),
  (s) => (s.context.ground = 'flat'),
  (s) => (s.context.heightCm = 185),
  (s) => (s.youth = true),
  (s) => (s.context.slowmoFps = 240),
  (s) => (s.context.synced = false),
  (s) => (s.context.screenRecorded = true),
  (s) => (s.context.files = []),
  (s) => (s.context.files[0].timeSource = 'mvhd'),
  (s) => s.context.files.forEach((f) => (f.at = '2026-10-24T00:00:00Z')),
  (s) => s.context.files.forEach((f) => (f.at = '2026-12-01T00:00:00Z')),
]) {
  const changed = structuredClone(b);
  mutate(changed);
  assert.equal(compareAnalysis(a, changed, 'same').rows[0].delta, null);
}
const recompute = structuredClone(b);
recompute.context.files[0].fp = a.context.files[0].fp;
assert.equal(compareAnalysis(a, recompute, 'same').kind, 'recomputation');
for (const mutate of [
  (s) => (s.rows = []),
  (s) => (s.rows[0].label = '다른 지표'),
  (s) => (s.rows[0].unit = '°'),
  (s) => (s.rows[0].value = null),
  (s) => (s.rows[0].quality = 'low'),
  (s) => (s.rows[0].validation = 'provisional'),
  (s) => (s.rows[0].applicability = 'youth'),
]) {
  const changed = structuredClone(b);
  mutate(changed);
  assert.equal(compareAnalysis(a, changed, 'same').rows[0].delta, null);
}
assert.deepEqual(readAnalysisSnapshot(a), a);
assert.equal(readAnalysisSnapshot({ ...a, rows: [{ ...a.rows[0], value: NaN }] }), null);
assert.equal(readAnalysisContext({ ...a.context, files: [{ ...a.context.files[0], fp: 'client-guess' }] }), null);
let review = { v: 1, id: 'review', baseline: a, origin: 'start', baselinePractice: 0, followups: [], decisions: [] };
review = addFollowup(review, b, 'same', 4, b.savedAt);
assert.deepEqual(addFollowup(review, b, 'same', 4, b.savedAt), review);
assert.equal(review.followups.length, 1);
assert.ok('error' in addFollowup(review, { ...b, resultDigest: '0'.repeat(64) }, 'same', 4, b.savedAt));
assert.ok('error' in addFollowup(review, b, 'unknown', 4, b.savedAt));
assert.ok('error' in addFollowup(review, a, 'same', 0, b.savedAt));
assert.deepEqual(readMechanicsReview(JSON.parse(JSON.stringify(review))), review);
assert.equal(reviewView(review).followups[0].comparison.rows[0].delta, 8);
const rx = {
  element: '드리프트',
  key: 'drift',
  fault: 'drift.stuck',
  level: 'improve',
  slots: 1,
  cue: '목표',
  target: null,
  weeks: [{ week: 1, label: '기초', stage: '기초', drills: [{ title: '연습', dose: '', thumbUrl: null }] }],
};
const focus = {
  reportId: a.reportId,
  jobId: a.jobId,
  startedOn: '2026-10-24',
  done: 4,
  rx: [rx],
  review,
  progression: newProgression('run', [rx]),
};
const state = { ...freshState('intermediate'), focus };
const saved = readProgramState(programStateJson({ ...state, focus: null, focusHistory: archiveFocus(state, 'closed', '2026-10-26') }));
assert.deepEqual(saved.focusHistory[0].focus.review, review);
assert.equal(saved.focusHistory[0].focus.done, 4);
let p = focus.progression;
p.evidence = [
  {
    id: 'old',
    fault: rx.fault,
    stage: '기초',
    on: '2026-10-24',
    quality: 'yes',
    transferred: 'yes',
    during: 'clear',
    nextDay: 'clear',
    responseOn: '2026-10-25',
    source: 'self',
  },
];
assert.ok(readiness(p, rx.fault).ready);
p = { ...p, elements: p.elements.map((e) => ({ ...e, reviewFrom: 1 })) };
assert.equal(readiness(p, rx.fault).ready, false);
assert.equal(p.evidence.length, 1);
console.log('전후 비교 정책 통과: 버전·조건·촬영 순서·같은 영상·참고/미측정·재시도·역사 보존·재연습 확인 분리');
