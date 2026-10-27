import assert from 'node:assert/strict';
import { instructionSections } from '../native/src/lib/instruction-blocks.ts';

// 새 표시 방식이 순서·횟수·주의 문장을 누락하지 않는지 확인한다.
const source = '■ 어떤 운동인가\n원문 설명입니다.\n두 번째 줄도 유지합니다.\n\n■ 이렇게 하세요\n1. 첫 단계\n2) 둘째 단계\n10. 열 번째 단계\n\n■ 주의점\n· 통증이 있으면 중단합니다.\n- 기존 제한을 유지합니다.';
const sections = instructionSections(source);
assert.deepEqual(sections.map((s) => s.title), ['어떤 운동인가', '이렇게 하세요', '주의점']);
assert.equal(sections[0].lines[0].text, '원문 설명입니다.\n두 번째 줄도 유지합니다.');
assert.deepEqual(sections[1].lines.map((l) => l.marker), ['1.', '2)', '10.']);
assert.equal(sections[2].caution, true);
assert.deepEqual(sections[2].lines.map((l) => l.text), ['통증이 있으면 중단합니다.', '기존 제한을 유지합니다.']);
assert.equal(sections[0].caution, false);

// 제목 없는 기존 글·수치·괄호·줄바꿈은 임의로 재작성하지 않는다.
const plain = '1.5kg · 2~3회 (예시)\r\n-3은 수치입니다.\r\n\r\n주의: 원문 조건을 유지합니다.';
assert.deepEqual(instructionSections(plain), [{
  title: null, caution: false,
  lines: [{ kind: 'paragraph', text: '1.5kg · 2~3회 (예시)\n-3은 수치입니다.' }, { kind: 'paragraph', text: '주의: 원문 조건을 유지합니다.' }],
}]);
assert.equal(instructionSections('## 중단 기준\n원문 경고')[0].caution, true);
assert.equal(instructionSections('■ 참고 원리\n보충 설명')[0].title, '참고 원리');
assert.deepEqual(instructionSections(' \n\t'), []);
assert.equal(instructionSections('■ 주의점')[0].title, '주의점');
console.log('운동·드릴 설명: 순서, 수치, 주의사항, 제목 없는 글 보존 확인');
