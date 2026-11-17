import assert from 'node:assert/strict';
import { orderedFocus, focusPriority } from '../lib/mechanics/focus-priority.ts';
import { drillPicksFor, drillPurposeViews, groupDrills, type MechanicsDrillView } from '../lib/mechanics/drills.ts';
import type { CachedGuide } from '../lib/library-cache.ts';
import { assessMechanicsSession, buildLevelSession, buildProgramSession, freshState, type ProgramDrill } from '../lib/mechanics/program.ts';
import { newProgression } from '../lib/mechanics/progression.ts';
import { reportDrillsOf, type ElementRx } from '../lib/pitch-3d/v2/report.ts';
import { REPORT_CRITERIA } from '../lib/pitch-3d/v2/report-policy.ts';
import { levelSession } from '../lib/mechanics/levels.ts';
const allowed = ['드리프트', '드롭', '상하체 분리', '브레이크', '몸통 회전', '스로잉'];
assert.deepEqual(orderedFocus(['몸통 회전', '드롭', '드리프트', '상하체 분리', '브레이크', '스로잉'], allowed), ['몸통 회전', '드롭', '드리프트', '상하체 분리', '브레이크', '스로잉']);
assert.deepEqual(orderedFocus(['드롭', 'unknown', '드롭', '스로잉'], allowed), ['드롭', '스로잉']);
assert.deepEqual(orderedFocus([], allowed), []);
assert.equal(focusPriority(['드롭', '몸통 회전', '드리프트'], ['드리프트']), 2);
assert.equal(focusPriority(['드롭'], ['스로잉']), Infinity);
assert.equal(focusPriority(['드롭', '몸통 회전'], ['몸통 회전', '드롭']), 0);
const fixture = (title: string, focusPoints: string[], stage = '기초'): MechanicsDrillView => ({ title, focusPoints, stage, variants: [] });
const picks = drillPicksFor([
  fixture('third', ['드롭', '몸통 회전', '드리프트']),
  fixture('second', ['드롭', '드리프트']),
  fixture('first', ['드리프트']),
  fixture('unrelated', ['스로잉']),
], '드리프트');
assert.deepEqual(picks.items.map((item) => item.title), ['first', 'second', 'third']);
assert.equal(picks.count, 3);
assert.deepEqual(drillPicksFor([fixture('advanced', ['드리프트'], '통합'), fixture('basic', ['드롭', '드리프트'])], '드리프트').items.map((item) => item.title), ['basic', 'advanced']);
assert.deepEqual(drillPicksFor([fixture('no-arm-purpose', ['몸통 회전', '드리프트'])], '스로잉'), { count: 0, items: [] });
const sessionTitles = levelSession('intro', 0)!.titles;
const sessionPurposes = ['스로잉', '브레이크', '드리프트'];
const sessionDrills: ProgramDrill[] = sessionTitles.map((title, index) => ({
  title, focusPoints: [sessionPurposes[index]], stage: '기초',
  variants: [{ id: `seam-${index}`, category: '무브먼트 패턴 드릴', tool: '맨몸', equipment: ['맨몸'] }],
}));
const built = buildLevelSession({ drills: sessionDrills, level: 'intro', index: 0, owned: null });
const assessed = assessMechanicsSession({ drills: sessionDrills, state: freshState('intro'), owned: null });
assert.deepEqual(assessed.items.map((item) => item.guideId), built.map((item) => item.guideId));
assert.deepEqual(assessed.items.map((item) => item.element), ['드리프트', '브레이크', '스로잉']);
assert.deepEqual(assessed.missing, []);
assert.ok(assessed.items.every((item) => item.required));
const unavailable = sessionDrills.map((drill, index) => index === 1 ? { ...drill, variants: [{ ...drill.variants[0], equipment: ['메디신볼'] }] } : drill);
const limited = assessMechanicsSession({ drills: unavailable, state: freshState('intro'), owned: new Set(['맨몸']) });
assert.deepEqual(limited.items.map((item) => item.element), ['드리프트', '스로잉']);
assert.ok(limited.missing.some((item) => item.title === sessionTitles[1] && item.reason === 'gear'));
const absent = assessMechanicsSession({ drills: sessionDrills.slice(1), state: freshState('intro'), owned: null });
assert.ok(absent.missing.some((item) => item.title === sessionTitles[0] && item.reason === 'library'));
const guide = (id: string, title: string): CachedGuide => ({
  id, title, category: '메디신볼 드릴', description: '', videoPath: null, thumbPath: null,
  source: 'REFERENCE', referenceVideoId: null, aspectRatio: null, focusPoints: ['드롭', '몸통 회전'],
  equipment: ['메디신볼'], stage: '통합', sortOrder: 0, createdAt: '', hiddenAt: null,
});
const families = groupDrills([
  guide('large', '힌지 드라이브 스로우 (큰 메디신볼)'),
  guide('small', '힌지 드라이브 스로우 (작은 메디신볼)'),
]);
assert.equal(families.length, 1);
assert.deepEqual(families[0].variants.map((variant) => [variant.id, variant.tool]), [['small', '작은 메디신볼'], ['large', '큰 메디신볼']]);
assert.deepEqual(groupDrills([guide('legacy', '힌지 드라이브 스로우 (큰 공)')])[0].variants.map((variant) => variant.tool), ['큰 메디신볼']);
// The reviewed small/large videos differ. Neither input order may leak the large video's purpose to the small one.
const small = { ...guide('small', '힌지 드라이브 스로우 (작은 메디신볼)'), equipment: ['작은 메디신볼'] };
const large = { ...guide('large', '힌지 드라이브 스로우 (큰 메디신볼)'), equipment: ['큰 메디신볼'], focusPoints: ['드롭', '몸통 회전', '상하체 분리'] };
const title = '힌지 드라이브 스로우';
const rx: ElementRx = { element: '상하체 분리', key: 'sep', fault: 'sep.openAtPlant', level: 'improve', slots: 1, cue: 'fixture', target: null,
  weeks: [{ week: 1, label: '1주', stage: '통합', drills: [{ title, thumbUrl: null, dose: '' }] }] };
const focus = { jobId: null, startedOn: '2026-11-17', reportId: 'fixture', done: 0, rx: [rx], criteria: REPORT_CRITERIA };
for (const rows of [[small, large], [large, small]]) {
  const grouped = groupDrills(rows);
  assert.deepEqual(grouped[0].focusPoints, small.focusPoints); // deterministic default, never union
  assert.deepEqual(grouped[0].variants.map((v) => [v.id, v.focusPoints, v.stage]), [
    ['small', small.focusPoints, '통합'], ['large', large.focusPoints, '통합'],
  ]);
  assert.equal(drillPicksFor(grouped, '상하체 분리').count, 1);
  const exact = drillPurposeViews(grouped).filter((d) => d.focusPoints.includes('상하체 분리'));
  assert.deepEqual(exact.flatMap((d) => d.variants.map((v) => v.id)), ['large']);
  assert.deepEqual(reportDrillsOf(grouped).map((d) => d.focusPoints), [small.focusPoints, large.focusPoints]);
  const state = { ...freshState('intro'), focus };
  const all = buildProgramSession({ drills: grouped, state, owned: null }).filter((i) => i.rx);
  assert.deepEqual(all.map((i) => [i.guideId, i.rx?.element, i.stage]), [['large', '상하체 분리', '통합']]);
  assert.deepEqual(buildProgramSession({ drills: grouped, state, owned: new Set(['작은 메디신볼']) }).filter((i) => i.rx), []);
  assert.deepEqual(buildProgramSession({ drills: grouped, state, owned: new Set(['큰 메디신볼']) }).filter((i) => i.rx).map((i) => i.guideId), ['large']);
  const skill = { ...state, focus: { ...focus, progression: newProgression('fixture', [rx], () => '통합') } };
  const blocked = assessMechanicsSession({ drills: grouped, state: skill, owned: new Set(['작은 메디신볼']) });
  assert.deepEqual(blocked.items.filter((i) => i.rx), []);
  assert.ok(blocked.missing.some((m) => m.title === title && m.reason === 'gear' && m.need.includes('큰 메디신볼')));
  const ready = assessMechanicsSession({ drills: grouped, state: skill, owned: new Set(['큰 메디신볼']) });
  assert.deepEqual(ready.items.filter((i) => i.rx).map((i) => [i.guideId, i.stage]), [['large', '통합']]);
  assert.deepEqual(ready.missing, []);
  // Same purpose, different priorities: preserve each order and pick the most specific owned video.
  const ranked = groupDrills([{ ...small, focusPoints: ['상하체 분리', '드롭'] }, large]);
  assert.deepEqual(buildProgramSession({ drills: ranked, state, owned: null }).filter((i) => i.rx).map((i) => i.guideId), ['small']);
  assert.deepEqual(buildProgramSession({ drills: ranked, state, owned: new Set(['큰 메디신볼']) }).filter((i) => i.rx).map((i) => i.guideId), ['large']);
  // An easy variant must not lend its stage to a harder one, even with identical purposes.
  const stages = groupDrills([{ ...small, stage: '기초', focusPoints: large.focusPoints }, large]);
  const basicRx: ElementRx = { ...rx, weeks: [{ ...rx.weeks[0], stage: '기초' }] };
  const basicState = { ...state, focus: { ...focus, rx: [basicRx] } };
  assert.deepEqual(buildProgramSession({ drills: stages, state: basicState, owned: new Set(['큰 메디신볼']) }).filter((i) => i.rx), []);
  assert.deepEqual(buildProgramSession({ drills: stages, state: basicState, owned: new Set(['작은 메디신볼']) }).filter((i) => i.rx).map((i) => [i.guideId, i.stage]), [['small', '기초']]);
  assert.equal(drillPicksFor(stages, '상하체 분리').items[0].stage, '기초');
  const noRecipe: ElementRx = { ...rx, weeks: [{ ...rx.weeks[0], drills: [] }] };
  const combined = groupDrills([{ ...small, focusPoints: ['드롭'] }, large]);
  const combinedState = { ...state, focus: { ...focus, criteria: null, rx: [{ ...noRecipe, element: '드롭' as const }, noRecipe] } };
  assert.deepEqual(buildProgramSession({ drills: combined, state: combinedState, owned: null }).filter((i) => i.rx).map((i) => i.guideId), ['large']);
  assert.deepEqual(buildProgramSession({ drills: combined, state: combinedState, owned: new Set(['작은 메디신볼']) }).filter((i) => i.rx), []);
}
// Fixed-level sessions must enforce level stages independently from prescription tags.
const introTitle = sessionTitles[0];
const hardSmall = { ...small, id: 'small-hard', title: `${introTitle} (작은 메디신볼)`, stage: '통합', focusPoints: ['드리프트'] };
const basicLarge = { ...large, id: 'large-basic', title: `${introTitle} (큰 메디신볼)`, stage: '기초', focusPoints: ['드리프트'] };
for (const rows of [[hardSmall, basicLarge], [basicLarge, hardSmall]]) {
  const intro = [...groupDrills(rows), ...sessionDrills.slice(1)];
  for (const owned of [null, new Set(['큰 메디신볼']), new Set(['작은 메디신볼', '큰 메디신볼'])]) {
    const built = buildLevelSession({ drills: intro, level: 'intro', index: 0, owned });
    const checked = assessMechanicsSession({ drills: intro, state: freshState('intro'), owned });
    assert.equal(built.find((i) => i.title === introTitle)?.guideId, 'large-basic');
    assert.ok(checked.items.every((i) => i.stage === '기초'));
    assert.deepEqual(checked.items.map((i) => i.guideId), built.map((i) => i.guideId));
    assert.deepEqual(checked.missing, []);
  }
  const owned = new Set(['작은 메디신볼']);
  const blockedBuild = buildLevelSession({ drills: intro, level: 'intro', index: 0, owned });
  const blocked = assessMechanicsSession({ drills: intro, state: freshState('intro'), owned });
  assert.ok(!blockedBuild.some((i) => i.title === introTitle));
  assert.ok(!blocked.items.some((i) => i.title === introTitle));
  assert.deepEqual(blocked.missing, [{ title: introTitle, reason: 'gear', need: ['큰 메디신볼'] }]);
  assert.deepEqual(blocked.items.map((i) => i.guideId), blockedBuild.map((i) => i.guideId));
}
const wrongStageOnly = [...groupDrills([hardSmall]), ...sessionDrills.slice(1)];
const noEligible = assessMechanicsSession({ drills: wrongStageOnly, state: freshState('intro'), owned: null });
assert.ok(!noEligible.items.some((i) => i.title === introTitle));
assert.deepEqual(noEligible.missing, [{ title: introTitle, reason: 'recipe', need: [] }]);
const unknownStage = [...groupDrills([{ ...hardSmall, stage: null }]), ...sessionDrills.slice(1)];
assert.deepEqual(assessMechanicsSession({ drills: unknownStage, state: freshState('intro'), owned: null }).missing, [{ title: introTitle, reason: 'recipe', need: [] }]);
console.log('mechanics focus priority: all ordering, variant purpose, equipment, prescription and ordinary-level stage assertions passed');
