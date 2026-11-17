/** EX-STEPBOX01: 운영 DB 없이 실제 장비 판정·검색·프로그램·기록 계약을 확인한다. */
import assert from 'node:assert/strict';
import {
  BULGARIAN_JUMP_ID, BOX_SUPPORT_CONDITION, STEP_BOX, canUseEquipment,
  equipmentConditions, equipmentName, equipmentRequirements, equipmentSearchTags,
  equipmentSummary, missingEquipment, primaryEquipment,
} from '@/lib/equipment-requirements';
import { canDo, filterByEquipment, equipmentForToday, SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { EXERCISE_EQUIPMENT, usesWeight, needsWeight, pickMany } from '@/lib/exercise-meta';
import { variantCandidates, type PinnableExercise } from '@/lib/program/program';
import { weightKindOf } from '@/lib/program/next-weight';
import { matchesFilters, matchesQuery, searchTerms, EMPTY_FILTERS } from '../native/src/library/browse.ts';

let checked = 0;
function check(name: string, fn: () => void) {
  try { fn(); checked++; } catch (e) { console.error(`실패: ${name}`); throw e; }
}
const base = { id: BULGARIAN_JUMP_ID, title: '불가리안 스플릿 스쿼트 점프', category: '파워', bodyParts: ['고관절'], equipment: ['박스'], intensity: '높음', difficulty: '상급', movementPattern: '런지', perSide: true };
const boxJump = { ...base, id: 'unprofiled-box-jump', title: '박스 점프', equipment: ['박스'], movementPattern: '스쿼트' };
const plainStep = { ...base, id: 'plain-step', equipment: [STEP_BOX] };

for (const support of [['박스'], [STEP_BOX], ['박스', STEP_BOX]]) {
  for (const extra of [[], ['밴드'], ['덤벨'], ['덤벨', '밴드']]) {
    const ex = { ...base, equipment: [...support, ...extra] };
    for (const owned of [[], ['맨몸'], ['박스'], [STEP_BOX], ['박스', STEP_BOX], ['밴드', STEP_BOX], ['덤벨', '박스'], ['덤벨', '밴드', STEP_BOX]]) {
      const expected = (owned.includes('박스') || owned.includes(STEP_BOX)) && extra.every((e) => owned.includes(e));
      check(`대체 OR/필수 AND ${JSON.stringify({support,extra,owned})}`, () => {
        assert.equal(canDo(ex, new Set(owned)), expected);
        assert.equal(canUseEquipment(ex, new Set(owned)), expected);
      });
    }
    check('판정이 입력·기록을 변경하지 않음', () => {
      const before = JSON.stringify(ex); Object.freeze(ex.equipment); Object.freeze(ex);
      equipmentRequirements(ex); equipmentSummary(ex); primaryEquipment(ex);
      assert.equal(JSON.stringify(ex), before);
    });
  }
}
check('ID 없는 옛 조합은 모두 필요', () => {
  assert.equal(canDo({ equipment: ['박스', STEP_BOX] }, new Set([STEP_BOX])), false);
  assert.equal(canDo({ equipment: ['박스', '벤치'] }, new Set(['박스'])), false);
});
check('전역 별명·제목 추측 없음', () => {
  assert.equal(canDo(boxJump, new Set([STEP_BOX])), false);
  const titleCollision = { ...boxJump, title: base.title };
  assert.equal(canDo(titleCollision, new Set([STEP_BOX])), false);
  assert.equal(canDo(plainStep, new Set(['박스'])), false);
});
check('프로필 없는 장비·받침 제거 편집 보존', () => {
  assert.equal(canDo({ ...base, equipment: ['미등록 기구'] }, new Set(['박스', STEP_BOX])), false);
  assert.deepEqual(primaryEquipment({ ...base, equipment: ['밴드'] }), ['밴드']);
  assert.equal(canDo({ equipment: [''] }, new Set()), false);
  assert.equal(canDo({ equipment: ['맨몸'] }, new Set()), true);
});
check('미선택 장비와 오늘 선택의 기존 규칙', () => {
  assert.equal(filterByEquipment([base, boxJump], []).pool.length, 2);
  assert.deepEqual(equipmentForToday(['박스'], [STEP_BOX]), ['맨몸', STEP_BOX]);
  assert.deepEqual(filterByEquipment([base, boxJump], ['맨몸', STEP_BOX]).pool.map((x) => x.id), [base.id]);
});
check('하나 추가 추천은 AND/OR 실제 증가 수', () => {
  const both = { ...base, equipment: ['박스', '밴드'] };
  assert.deepEqual(filterByEquipment([both], ['맨몸'], [STEP_BOX, '박스', '밴드']).bestAddition, null);
  assert.deepEqual(filterByEquipment([both], ['밴드'], [STEP_BOX]).bestAddition, { name: STEP_BOX, unlocks: 1 });
  assert.equal(filterByEquipment([base], [STEP_BOX]).bestAddition, null);
  assert.deepEqual(filterByEquipment([base], ['맨몸']).bestAddition, { name: STEP_BOX, unlocks: 1 });
});
check('기본 장비와 조건 표시', () => {
  assert.deepEqual(primaryEquipment(base), [STEP_BOX]);
  assert.deepEqual(equipmentSearchTags(base), [STEP_BOX, '박스']);
  assert.deepEqual(equipmentConditions(base), [BOX_SUPPORT_CONDITION]);
  assert.match(equipmentSummary(base), /스텝박스.*또는.*박스.*높이·안정성/);
  assert.deepEqual(missingEquipment(base, new Set()), equipmentRequirements(base));
  assert.notEqual(equipmentName('박스'), equipmentName(STEP_BOX));
});
for (const gear of ['박스', STEP_BOX]) {
  check(`앱 검색·필터 ${gear}`, () => {
    assert.equal(matchesFilters(base, { ...EMPTY_FILTERS, equipment: [gear] }), true);
    assert.equal(matchesQuery(base, searchTerms(gear)), true);
  });
}
check('검색 그룹 OR·서로 다른 그룹 AND 유지', () => {
  assert.equal(matchesFilters(base, { ...EMPTY_FILTERS, equipment: ['바벨', STEP_BOX] }), true);
  assert.equal(matchesFilters(base, { ...EMPTY_FILTERS, equipment: [STEP_BOX], bodyParts: ['팔꿈치'] }), false);
  assert.equal(matchesFilters(boxJump, { ...EMPTY_FILTERS, equipment: [STEP_BOX] }), false);
});
check('프로그램 점프 후보의 실제 가용 장비', () => {
  const pool: PinnableExercise[] = [base, boxJump, plainStep];
  const ids = variantCandidates('jump', pool, [STEP_BOX], '상급').map((x) => x.id);
  assert(ids.includes(base.id)); assert(ids.includes(plainStep.id)); assert(!ids.includes(boxJump.id));
  assert(variantCandidates('jump', pool, ['박스'], '상급').some((x) => x.id === base.id));
  assert(!variantCandidates('jump', pool, ['맨몸'], '상급').some((x) => x.id === base.id));
});
check('선택기·검증용 같은 목록에 두 장비 존재', () => {
  assert(EXERCISE_EQUIPMENT.includes(STEP_BOX as never));
  assert(SELECTABLE_EQUIPMENT.includes(STEP_BOX as never));
  assert(EXERCISE_EQUIPMENT.includes('박스'));
  assert.deepEqual(pickMany(['박스', STEP_BOX, '未登録'], EXERCISE_EQUIPMENT), ['박스', STEP_BOX]);
});
check('main의 받침은 무게 입력/추천 없음', () => {
  assert.equal(usesWeight([STEP_BOX]), false); assert.equal(needsWeight([STEP_BOX]), false);
  assert.equal(weightKindOf([STEP_BOX]), 'none');
  assert.equal(weightKindOf(['박스']), 'none');
});
check('main의 덤벨+받침은 덤벨 기준 유지', () => {
  for (const equipment of [['덤벨', STEP_BOX], ['덤벨', '박스']]) {
    assert.equal(usesWeight(equipment), true); assert.equal(needsWeight(equipment), true);
    assert.equal(weightKindOf(equipment), 'dumbbell');
  }
});
console.log(`EX-STEPBOX01 standalone-main: ${checked} checks passed; legacy weight helpers, no R1 imports.`);
