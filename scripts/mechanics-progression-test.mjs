/** 실제 순수 계산을 사용한다. 자가 확인 정책 검사이며 의학적·3D 정확도 검증이 아니다. */
import assert from 'node:assert/strict';
import {
  newProgression,
  readiness,
  saveNextDay,
  advanceSkill,
  skillStage,
  skillFinished,
  skillPainToday,
  readProgression,
} from '../lib/mechanics/progression.ts';
import {
  assessMechanicsSession,
  freshState,
  finishState,
  focusActive,
  focusView,
  programStateJson,
  readProgramState,
} from '../lib/mechanics/program.ts';
import { REPORT_CRITERIA } from '../lib/pitch-3d/v2/report-policy.ts';
import { levelSession } from '../lib/mechanics/levels.ts';

const rx = {
  element: '드리프트',
  key: 'drift',
  fault: 'drift.stuck',
  level: 'improve',
  slots: 2,
  cue: '동작 목표',
  target: null,
  weeks: ['기초', '연결', '통합'].map((stage, i) => ({
    week: i + 1,
    label: `${i + 1}단계`,
    stage,
    drills: [0, 1].map((n) => ({ title: `${stage}-${n}`, thumbUrl: null, dose: '' })),
  })),
};
const guide = (title, stage = '기초', equipment = ['맨몸']) => ({
  title,
  focusPoints: ['드리프트'],
  stage,
  variants: [{ id: title, tool: '도구', category: '무브먼트 패턴 드릴', equipment }],
});
const drills = rx.weeks.flatMap((w) => w.drills.map((d, i) => guide(d.title, w.stage, i === 1 ? ['밴드'] : ['맨몸'])));
for (const title of levelSession('intermediate', 0).titles)
  if (!drills.some((d) => d.title === title)) drills.push({ ...guide(title), focusPoints: ['드롭'] });
let progression = newProgression('run-1', [rx]);
let state = {
  ...freshState('intermediate'),
  focus: { reportId: 'r1', jobId: 'j1', criteria: REPORT_CRITERIA, rx: [rx], startedOn: '2026-10-26', done: 0, progression },
};
const before = assessMechanicsSession({ drills, state, owned: new Set(['맨몸']) });
assert.equal(before.missing.length, 1);
assert.equal(before.missing[0].title, '기초-1');
assert.deepEqual(before.missing[0].need, ['밴드']);
assert.equal(before.items.filter((i) => i.required).length, 1, '필수 누락은 보조 운동으로 채워 완료 처리하지 않는다');
assert.ok(before.items.some((i) => i.required === false));
const all = assessMechanicsSession({ drills, state, owned: new Set(['밴드']) });
assert.deepEqual(all.missing, []);
assert.equal(all.items.filter((i) => i.required).length, 2);
assert.ok(all.items.filter((i) => i.required).every((i) => i.skill?.fault === rx.fault));
assert.ok(all.items.every((i) => i.stage === '기초'));
const removed = assessMechanicsSession({ drills: drills.filter((d) => d.title !== '기초-0'), state, owned: new Set(['밴드']) });
assert.equal(removed.missing[0].reason, 'library');
for (let i = 0; i < 20; i++) state = finishState(state, false);
assert.equal(state.focus.done, 20);
assert.equal(skillStage(state.focus.progression, rx.fault), '기초', '같은 날·여러 번 체크해도 단계는 그대로');
assert.ok(focusActive(state.focus), '9회 뒤에도 자동 종료하지 않는다');
assert.equal(focusView(state.focus).finished, false);
assert.equal(readProgramState(programStateJson(state)).focus.done, 20, '새 기준의 누적 횟수를 9에서 자르지 않는다');

const evidence = (id, stage = '기초', extra = {}) => ({
  id,
  fault: rx.fault,
  stage,
  on: '2026-10-26',
  quality: 'yes',
  transferred: 'unknown',
  during: 'clear',
  nextDay: 'unknown',
  responseOn: null,
  source: 'self',
  ...extra,
});
progression = { ...progression, evidence: [evidence('a')] };
assert.equal(readiness(progression, rx.fault).ready, false);
assert.ok('error' in saveNextDay(progression, 'a', 'clear', '2026-10-26'));
progression = saveNextDay(progression, 'a', 'unknown', '2026-10-27');
assert.equal(readiness(progression, rx.fault).ready, false);
progression = saveNextDay(progression, 'a', 'clear', '2026-10-27');
assert.equal(readiness(progression, rx.fault).ready, true);
let next = advanceSkill(progression, rx.fault, '기초', 'a', 'move-1', '2026-10-27');
assert.equal(skillStage(next, rx.fault), '연결');
assert.deepEqual(advanceSkill(next, rx.fault, '기초', 'a', 'move-1', '2026-10-27'), next, '응답 유실 재시도는 다시 올리지 않는다');
assert.ok('error' in advanceSkill(next, rx.fault, '기초', 'a', 'move-2', '2026-10-27'), '늦은 화면의 새 요청도 두 단계 전환하지 않는다');
next = { ...next, evidence: [...next.evidence, evidence('b', '연결')] };
next = saveNextDay(next, 'b', 'clear', '2026-10-27');
assert.equal(readiness(next, rx.fault).ready, false, '연결부터 실제 캐치볼 전이 자가 확인이 필요하다');
next.evidence[next.evidence.length - 1].transferred = 'yes';
assert.equal(readiness(next, rx.fault).ready, true);
next = { ...next, evidence: [...next.evidence, evidence('c', '연결', { quality: 'no' })] };
assert.equal(readiness(next, rx.fault).ready, false, '이전의 좋은 기록만 골라 새 실패를 무시하지 않는다');
next = saveNextDay(next, 'c', 'pain', '2026-10-27');
assert.ok(skillPainToday(next, '2026-10-27'));
const latePain = saveNextDay({ ...next, evidence: [evidence('late', '연결')] }, 'late', 'pain', '2026-10-29');
assert.ok(skillPainToday(latePain, '2026-10-27'));
assert.equal(skillPainToday(latePain, '2026-10-29'), false, '과거 다음 날 반응을 오늘 통증으로 바꾸지 않는다');
assert.equal(readiness(latePain, rx.fault).ready, false, '입력 날짜와 무관하게 해당 연습의 단계 진행은 보류한다');
assert.ok('error' in saveNextDay(next, 'c', 'clear', '2026-10-28'), '통증 이력을 지워 진행하지 않는다');
assert.equal(readiness(next, rx.fault).ready, false);

const second = { ...rx, fault: 'trunk.upright', element: '몸통 회전' };
const independent = newProgression('multi', [rx, second]);
independent.evidence = [evidence('a', '기초', { nextDay: 'clear', responseOn: '2026-10-27' })];
const moved = advanceSkill(independent, rx.fault, '기초', 'a', 'one', '2026-10-27');
assert.equal(skillStage(moved, second.fault), '기초', '요소별 단계는 따로 관리한다');
assert.equal(skillStage(moved, rx.fault), '연결');
let final = newProgression('final', [rx], () => '통합');
final.evidence = [evidence('z', '통합', { transferred: 'yes', nextDay: 'clear', responseOn: '2026-10-27' })];
final = advanceSkill(final, rx.fault, '통합', 'z', 'finish', '2026-10-27');
assert.ok(skillFinished(final));
assert.equal(focusActive({ ...state.focus, progression: final }), false);
assert.deepEqual(readProgression(JSON.parse(JSON.stringify(final)), [rx]), final);
assert.equal(readProgression({ ...final, evidence: [evidence('bad-date', '통합', { on: '2026-99-99' })] }, [rx]), null);
const completeNormal = { ...freshState('intermediate'), index: 12 };
assert.deepEqual(assessMechanicsSession({ drills, state: completeNormal, owned: new Set() }), { items: [], missing: [] });
const corrupt = readProgramState({ ...programStateJson(state), focus: { ...state.focus, progression: { ...final, elements: [] } } });
assert.equal(corrupt.focus.progressionInvalid, true);
assert.ok(assessMechanicsSession({ drills, state: corrupt, owned: new Set(['밴드']) }).missing.length);
console.log('메커니즘 단계 정책 검사 통과: 필수·보조, 장비·라이브러리 누락, 9회 이후 유지, 다음 날·전이·통증, 요소별 전환·재시도');
