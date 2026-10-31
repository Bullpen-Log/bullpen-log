/**
 * 암케어 루틴 만들기 · 운동 추가(native/src/armcare/routine-draft.ts) 규칙 시험 — `npm run native-routine-builder:test`
 * 검색(낱말 AND · 영문 대소문자 · 관련 부위) · 부위 · 장비(미등록 ≠ 맨몸) · 이번 선택(담김 · 남은 자리 · 다시 고르면 뒤로) · 담기(기존 그대로 ·
 * 기본 세트 · 15개) · 01↔02 넘겨주기(한 번만 · 판 · 계정) · 저장 결과 가르기(코드로)를 본다.
 */
import assert from 'node:assert/strict';
import {
  appendPicks,
  areaGroups,
  classifySaveFailure,
  deliverPicks,
  filterCatalog,
  gearOptions,
  newRoutineKey,
  openPicker,
  pickerSource,
  sameDraft,
  slotsLeft,
  takePicks,
  togglePending,
} from '~/armcare/routine-draft';
import { isRoutineId } from '@/lib/armcare/my-routines';
import { primaryArea } from '@/lib/armcare/anatomy';
import type { BuilderExercise } from '@/app/(app)/training/routine/[id]/routine-builder';

let passed = 0;
const ok = (cond: unknown, label: string) => {
  assert.ok(cond, label);
  if (process.env.V) console.log('ok', label);
  passed++;
};

const ex = (id: string, title: string, muscles: string[], equipment: string[], defaultSets = 2): BuilderExercise => ({
  view: {
    id,
    title,
    intensity: '낮음',
    difficulty: null,
    equipment,
    targetMuscles: muscles,
    prescription: null,
    thumbUrl: null,
    videoPath: null,
    referenceVideoId: null,
    aspectRatio: null,
    isReference: false,
    method: null,
  },
  defaultSets,
  area: primaryArea(muscles)?.key ?? null,
  minutes: [1, 2, 3, 4, 5],
  dose: '10회',
});
const list = [
  ex('a', '밴드 외회전', ['극하근', '소원근'], ['밴드'], 3),
  ex('b', 'TRX Y 레이즈', ['후면 삼각근', '손목 굴곡근'], ['TRX']),
  ex('c', '손목 굴곡', ['손목 굴곡근'], ['덤벨'], 1),
  ex('d', '월 슬라이드', ['광배근'], ['맨몸']),
  ex('e', '프론 홀드', ['대원근'], []),
];
const ids = (r: BuilderExercise[]) => r.map((e) => e.view.id).join(',');

/* 검색 · 필터 — 전체 목록 기준 */
ok(ids(filterCatalog(list, { q: '', area: null, gear: null })) === 'a,b,c,d,e', '조건 없음 = 전체(받은 차례)');
ok(ids(filterCatalog(list, { q: 'trx', area: null, gear: null })) === 'b', '영문 소문자로 찾기');
ok(ids(filterCatalog(list, { q: 'TRX 레이즈', area: null, gear: null })) === 'b', '낱말 둘 AND');
ok(ids(filterCatalog(list, { q: 'TRX 굴곡', area: null, gear: null })) === 'b', '근육 낱말도 찾음(AND)');
ok(ids(filterCatalog(list, { q: '밴드 손목', area: null, gear: null })) === '', 'AND 라 둘 다 없으면 0');
ok(ids(filterCatalog(list, { q: '극하근', area: null, gear: null })) === 'a', '등록 근육으로 찾기');
ok(ids(filterCatalog(list, { q: '팔꿈치 내측', area: null, gear: null })).includes('b'), '관련 부위 이름으로도 찾음');
ok(ids(filterCatalog(list, { q: '', area: 'elbow-inner', gear: null })) === 'b,c', '부위 필터는 관련 부위 포함(b 의 둘째 근육)');
ok(list[1].area === 'shoulder-back', '관련 부위로 찾혀도 주 부위는 그대로');
ok(ids(filterCatalog(list, { q: '', area: 'elbow-inner', gear: '덤벨' })) === 'c', '부위 AND 장비');
ok(ids(filterCatalog(list, { q: '', area: null, gear: '맨몸' })) === 'd', '맨몸은 등록된 것만 — 장비 미등록(e)은 아님');
ok(ids(filterCatalog(list, { q: '', area: null, gear: 'trx' })) === 'b', '장비도 영문 대소문자 무시');
const gears = gearOptions(list).map((g) => g.name);
ok(gears.length === 4 && !gears.includes('') && gears.includes('맨몸'), '장비 선택지 = 실제 등록 이름(빈 값 없음)');
const groups = areaGroups(list);
ok(groups.map((g) => g.joint).join() === '어깨,팔꿈치', '부위는 어깨 · 팔꿈치로 묶음');
ok(groups[0].areas.every((a) => a.n > 0) && groups[1].areas.map((a) => a.key).join() === 'elbow-inner', '목록에 있는 부위만');

/* 이번 선택 */
const original = new Set(['a']);
const slots = slotsLeft(13);
ok(slots === 2 && slotsLeft(15) === 0 && slotsLeft(20) === 0, '남은 자리 = 15 − 담은 수');
let p: readonly string[] = [];
ok(togglePending(p, 'a', original, slots) === p, '담김은 이번 선택으로 바뀌지 않음');
p = togglePending(p, 'b', original, slots);
p = togglePending(p, 'c', original, slots);
ok(p.join() === 'b,c', '고른 차례대로');
const full = togglePending(p, 'd', original, slots);
ok(full === p, '남은 자리를 다 고르면 새 것은 막힘(같은 배열)');
p = togglePending(p, 'b', original, slots);
ok(p.join() === 'c', '자리가 차도 해제는 됨');
p = togglePending(p, 'b', original, slots);
ok(p.join() === 'c,b', '해제했다 다시 고르면 맨 뒤로');

/* 담기 — 기존 이름 · 세트 · 차례 그대로, 새 것은 고른 차례 · 기본 세트, 같은 것 두 번 없음, 15개에서 멈춤 */
const items = [
  { exerciseId: 'a', sets: 4 },
  { exerciseId: 'x', sets: 1 },
];
const merged = appendPicks(items, [
  { exerciseId: 'c', sets: 1 },
  { exerciseId: 'a', sets: 3 },
  { exerciseId: 'b', sets: 2 },
]);
ok(JSON.stringify(merged) === JSON.stringify([...items, { exerciseId: 'c', sets: 1 }, { exerciseId: 'b', sets: 2 }]), '뒤에 붙임 · 이미 담긴 것 건너뜀 · 앞은 그대로');
ok(items.length === 2, '원래 배열은 안 바뀜');
const fourteen = Array.from({ length: 14 }, (_, i) => ({ exerciseId: `k${i}`, sets: 2 }));
ok(appendPicks(fourteen, [{ exerciseId: 'p1', sets: 1 }, { exerciseId: 'p2', sets: 1 }]).length === 15, '15개에서 멈춤');
ok(sameDraft({ name: 'n', items }, { name: 'n', items: [...items] }) && !sameDraft({ name: 'n', items }, { name: 'n', items: [items[1], items[0]] }), '차례가 다르면 다른 초안');

/* 01 ↔ 02 넘겨주기 */
openPicker('d1', { epoch: 1, version: 3, ids: ['a', 'x'] });
ok(pickerSource('d1', 1)?.ids.join() === 'a,x', '02 가 연 때의 구성을 읽음');
ok(pickerSource('d1', 2) == null, '다른 계정이면 못 읽음');
ok(pickerSource('none', 1) == null, '없는 초안이면 못 읽음');
ok(!deliverPicks('d1', { epoch: 1, version: 4, picks: [], exercises: [] }), '연 때의 판이 아니면 안 넘김');
const pick = { epoch: 1, version: 3, picks: [{ exerciseId: 'c', sets: 1 }], exercises: [list[2]] };
ok(deliverPicks('d1', pick), '담기 한 번 넘김');
ok(!deliverPicks('d1', pick), '연타 · 다시 눌러도 두 번째는 안 넘김');
ok(takePicks('d1', 2) == null && takePicks('d1', 1) == null, '다른 계정이 받으면 버림(그 뒤엔 없음)');
openPicker('d2', { epoch: 1, version: 0, ids: [] });
deliverPicks('d2', { ...pick, version: 0 });
ok(takePicks('d2', 1)?.picks[0].exerciseId === 'c', '돌아와서 한 번 받음');
ok(takePicks('d2', 1) == null, '두 번 받지 않음');

/* 저장 결과 가르기 — 오류 글이 아니라 코드로 */
for (const code of ['offline', 'server', 'timeout', 'unknown', null, undefined])
  ok(classifySaveFailure(code).kind === 'uncertain', `${code} → 결과 확인 필요`);
for (const code of ['update', 'unknown-action', 'bad-body', 'http', 'FEATURE_LOCKED_BETA', 'PERMISSION_DENIED'])
  ok(classifySaveFailure(code).kind === 'refused', `${code} → 쓰지 않음 확정`);
ok(classifySaveFailure('redirect').kind === 'login', 'redirect → 로그인');

/* 새 루틴 key — 서버가 받는 uuid 모양, 매번 다름 */
const keys = new Set(Array.from({ length: 200 }, newRoutineKey));
ok([...keys].every(isRoutineId) && keys.size === 200, 'key 는 uuid 모양 · 겹치지 않음');

console.log(`native-routine-builder: ${passed}개 통과`);
