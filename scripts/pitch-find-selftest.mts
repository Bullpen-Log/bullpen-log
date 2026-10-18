/**
 * 투구 기록 '느낌으로 찾기' 규칙(lib/pitch-find.ts) 셀프테스트 — npm run pitch-find:test
 */
import {
  EMPTY_FIND,
  cycleCue,
  filterLogs,
  isFindActive,
  matchesFind,
  type FindQuery,
  type FindableLog,
} from '../lib/pitch-find.ts';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  OK   ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  실패 ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const q = (over: Partial<FindQuery>): FindQuery => ({ ...EMPTY_FIND, ...over });

/** 제구가 좋았고 몸이 일찍 열려 아쉬웠던 불펜, 만족 4 */
const control: FindableLog = {
  sessionType: '불펜',
  memo: '슬라이더 각 좋음',
  cuesGood: ['제구', '릴리스'],
  cuesBad: ['몸이 일찍 열림'],
  satisfaction: 4,
};
/** 옛 기록 — 감각 · 만족 칸이 null(2026-10-06 전) */
const old: FindableLog = {
  sessionType: '라이브',
  memo: '팔이 무거움',
  cuesGood: null,
  cuesBad: null,
  satisfaction: null,
};
/** 캐치볼 — 칸이 아예 없음(undefined) */
const catchball: FindableLog = { sessionType: '캐치볼', memo: null };
const logs = [control, old, catchball];

console.log('[빈 조건]');
check('빈 조건은 안 켜짐', !isFindActive(EMPTY_FIND));
check('공백만도 안 켜짐', !isFindActive(q({ text: '   ' })));
check('빈 조건 = 전체', filterLogs(logs, EMPTY_FIND).length === 3);
check('공백만 = 전체', filterLogs(logs, q({ text: ' \n ' })).length === 3);
check('filterLogs 는 새 배열', filterLogs(logs, EMPTY_FIND) !== logs);

console.log('[칩 돌리기]');
check('끔 → 좋았던', cycleCue(undefined) === 'good');
check('좋았던 → 아쉬웠던', cycleCue('good') === 'bad');
check('아쉬웠던 → 끔', cycleCue('bad') === undefined);

console.log('[감각 칩]');
check(
  '좋았던 제구 = control 만',
  filterLogs(logs, q({ cues: { 제구: 'good' } })).length === 1
);
check('좋았던 제구는 control', matchesFind(control, q({ cues: { 제구: 'good' } })));
check(
  '아쉬웠던 제구는 control 아님',
  !matchesFind(control, q({ cues: { 제구: 'bad' } }))
);
check(
  '아쉬웠던 몸이 일찍 열림 = control',
  matchesFind(control, q({ cues: { '몸이 일찍 열림': 'bad' } }))
);
check(
  '켠 칩끼리 AND — 좋았던 제구 + 아쉬웠던 몸 = control',
  matchesFind(control, q({ cues: { 제구: 'good', '몸이 일찍 열림': 'bad' } }))
);
check(
  'AND — 좋았던 제구 + 좋았던 하체는 없음',
  filterLogs(logs, q({ cues: { 제구: 'good', 하체: 'good' } })).length === 0
);
check(
  '칸이 null 인 옛 기록은 칩에서 빠짐',
  !matchesFind(old, q({ cues: { 제구: 'good' } }))
);
check(
  '칸이 없는 캐치볼도 칩에서 빠짐(예외 없음)',
  !matchesFind(catchball, q({ cues: { 릴리스: 'bad' } }))
);
check('칩이 켜지면 활성', isFindActive(q({ cues: { 제구: 'good' } })));

console.log('[만족 칩]');
check(
  '만족(4~5) = control',
  filterLogs(logs, q({ satisfaction: 'good' })).length === 1
);
check('아쉬움(1~2)은 없음', filterLogs(logs, q({ satisfaction: 'bad' })).length === 0);
check(
  '만족 3 은 어느 쪽도 아님',
  !matchesFind({ ...control, satisfaction: 3 }, q({ satisfaction: 'good' })) &&
    !matchesFind({ ...control, satisfaction: 3 }, q({ satisfaction: 'bad' }))
);
check(
  '만족 2 는 아쉬움',
  matchesFind({ ...control, satisfaction: 2 }, q({ satisfaction: 'bad' }))
);
check('만족 null 은 빠짐', !matchesFind(old, q({ satisfaction: 'good' })));

console.log('[검색 칸]');
check('메모 부분 일치', filterLogs(logs, q({ text: '슬라이더' })).length === 1);
check(
  '대소문자 · 공백 무시',
  matchesFind({ ...control, memo: 'Slider  Good' }, q({ text: 'slider good' }))
);
check(
  '종류 이름으로',
  filterLogs(logs, q({ text: '라이브' })).length === 1 &&
    matchesFind(old, q({ text: '라이브' }))
);
check('감각 이름으로(좋았던)', matchesFind(control, q({ text: '제구' })));
check('감각 이름으로(아쉬웠던)', matchesFind(control, q({ text: '일찍 열림' })));
check('옛 기록도 메모로는 나옴', matchesFind(old, q({ text: '무거' })));
check(
  '메모 없는 기록은 종류로만',
  matchesFind(catchball, q({ text: '캐치' })) &&
    !matchesFind(catchball, q({ text: '무거' }))
);
check('없는 글은 0', filterLogs(logs, q({ text: '포크볼' })).length === 0);

console.log('[겹치기]');
check(
  '검색 + 칩 + 만족 모두 AND',
  matchesFind(
    control,
    q({ text: '슬라이더', cues: { 제구: 'good' }, satisfaction: 'good' })
  ) &&
    !matchesFind(
      control,
      q({ text: '슬라이더', cues: { 제구: 'good' }, satisfaction: 'bad' })
    )
);

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);
