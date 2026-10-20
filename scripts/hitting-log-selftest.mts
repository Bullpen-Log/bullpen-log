/**
 * 타격 기록 검사 시험 — `npm run hitting:test`(2026-10-20 타격 1단계 T5).
 */
import { hittingLine, validateHitting } from '../lib/hitting-log.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const today = '2026-10-20';
const ok = (r: ReturnType<typeof validateHitting>) => 'value' in r;
const field = (r: ReturnType<typeof validateHitting>) => ('field' in r ? r.field : '');

const base = { date: today, sessionType: '티배팅', swings: 120 };

check('기본 입력은 통과', ok(validateHitting(base, today)));
check('문자열 숫자도 받는다', ok(validateHitting({ ...base, swings: '80', effortPct: '70', satisfaction: '4' }, today)));
check('앞날은 막는다', field(validateHitting({ ...base, date: '2026-10-21' }, today)) === 'date');
check('날짜 모양이 틀리면 막는다', field(validateHitting({ ...base, date: '2026-10-20T05:00Z' }, today)) === 'date');
check('모르는 종류는 막는다', field(validateHitting({ ...base, sessionType: '불펜' }, today)) === 'sessionType');
check('스윙 0 은 된다(경기에서 못 친 날)', ok(validateHitting({ ...base, swings: 0 }, today)));
check('스윙 음수는 막는다', field(validateHitting({ ...base, swings: -1 }, today)) === 'swings');
check('스윙 1001 은 막는다', field(validateHitting({ ...base, swings: 1001 }, today)) === 'swings');
check('스윙 소수는 막는다', field(validateHitting({ ...base, swings: 12.5 }, today)) === 'swings');
check('스윙 빈칸은 막는다', field(validateHitting({ ...base, swings: '' }, today)) === 'swings');
check('강도 5 단위가 아니면 막는다', field(validateHitting({ ...base, effortPct: 72 }, today)) === 'effortPct');
check('강도 0 은 막는다', field(validateHitting({ ...base, effortPct: 0 }, today)) === 'effortPct');
check('강도 비우면 null', (() => {
  const r = validateHitting({ ...base, effortPct: '' }, today);
  return 'value' in r && r.value.effortPct === null;
})());
check('만족도 6 은 막는다', field(validateHitting({ ...base, satisfaction: 6 }, today)) === 'satisfaction');
check('메모 1001자는 막는다', field(validateHitting({ ...base, memo: 'a'.repeat(1001) }, today)) === 'memo');
check('메모 공백만이면 null', (() => {
  const r = validateHitting({ ...base, memo: '   ' }, today);
  return 'value' in r && r.value.memo === null;
})());
check('한 줄 — 강도 있음', hittingLine({ sessionType: '토스', swings: 50, effortPct: 70 }) === '토스 50회 · 강도 7');
check('한 줄 — 강도 없음', hittingLine({ sessionType: '경기', swings: 4, effortPct: null }) === '경기 4회');

console.log(`hitting-log: ${pass} 통과 · ${fail} 실패`);
if (fail > 0) process.exit(1);
