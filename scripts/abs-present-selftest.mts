/**
 * 앱 ABS 화면 글 · 셈(native/src/velocity/abs/present.ts) 시험 — 판정 카드 · 위 알약 · 세션 요약 · 공 목록이 같은 자료를 같은 말로 읽는지.
 * 실행: npm run abs:test(맨 끝)
 */
import { absHeadOf, absRowText, absStatusLine, batterAt, noVerdictReason, placeText, tallyAbs } from '../native/src/velocity/abs/present.ts';
import type { AbsAnalysis } from '../lib/abs/analysis.ts';
import type { Verdict } from '../lib/abs/judge.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else {
    fail++;
    console.log(`실패 ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const V = (o: Partial<Verdict>): Verdict => ({ call: 'ball', cell: null, dxCm: 0, dyCm: 0, edgeCm: 0, borderline: false, confidence: 'high', reasons: [], ...o });
const A = (o: Partial<AbsAnalysis>): AbsAnalysis => ({ batter: 1, heightCm: 175, event: 'pitch', verdict: null, reason: null, ...o }) as AbsAnalysis;

/* 머리 */
check('없음 → 판정 없음', absHeadOf(null) === 'none');
check('타격 → 타격', absHeadOf(A({ event: 'contact' })) === 'contact');
check('판정 없음(까닭) → 판정 없음', absHeadOf(A({ reason: '공이 플레이트까지 안 갔어요' })) === 'none');
check('스트라이크', absHeadOf(A({ verdict: V({ call: 'strike', cell: 5 }) })) === 'strike');

/* 자리 글 — 타석 모르면 1루 · 3루 쪽 */
check('모름 · +x 는 1루 쪽', placeText(V({ dxCm: 4.2, dyCm: 1, edgeCm: 4.2 }), null) === '1루 쪽으로 4cm 빠졌어요');
check('모름 · −x 는 3루 쪽', placeText(V({ dxCm: -3, dyCm: 1, edgeCm: 3 }), null) === '3루 쪽으로 3cm 빠졌어요');
check('우타 · +x 는 바깥쪽', placeText(V({ dxCm: 4, dyCm: 1, edgeCm: 4 }), 'R') === '바깥쪽으로 4cm 빠졌어요');
check('좌타 · +x 는 몸쪽', placeText(V({ dxCm: 4, dyCm: 1, edgeCm: 4 }), 'L') === '몸쪽으로 4cm 빠졌어요');
check('높이', placeText(V({ dxCm: 1, dyCm: -5.4, edgeCm: 5.4 }), null) === '낮게 5cm 빠졌어요');
check('스트라이크 안쪽', placeText(V({ call: 'strike', edgeCm: -2 }), null) === '존 안쪽 2cm');
check('걸침', placeText(V({ call: 'strike', edgeCm: -0.3 }), null) === '존 가장자리에 걸쳤어요');

/* 판정 없음 까닭 */
check('저장된 까닭', noVerdictReason(A({ reason: '깊이 단서가 없어요' }), true) === '깊이 단서가 없어요');
check('abs 없음 · fit 있음 → 보정 없음', noVerdictReason(null, true).includes('보정'));
check('abs 없음 · fit 없음 → 궤적', noVerdictReason(null, false).includes('궤적'));

/* 위 알약 */
check('대기', absStatusLine({ status: 'armed', visible: 0, judged: 0, total: 0, recalibrate: false }).text === '던지면 저절로 판정해요');
check('인식', absStatusLine({ status: 'capturing', visible: 1, judged: 0, total: 0, recalibrate: false }).text === '투구를 인식했어요');
check('계산', absStatusLine({ status: 'analyzing', visible: 1, judged: 0, total: 0, recalibrate: true }).text === '판정 계산 중');
check('위치 경고', absStatusLine({ status: 'armed', visible: 0, judged: 2, total: 3, recalibrate: true }).tone === 'warn');
check('판정 수', absStatusLine({ status: 'armed', visible: 0, judged: 2, total: 3, recalibrate: false }).text === '판정 2구 · 판정 없음 1');

/* 세션 셈 — 분모 · 존 밖 볼 */
const items = [
  A({ verdict: V({ call: 'strike', cell: 5 }) }),
  A({ verdict: V({ call: 'strike', cell: null, borderline: true }) }), // 걸친 스트라이크 — 칸 없음이지만 존 밖 볼 아님
  A({ verdict: V({ call: 'ball', cell: null }) }),
  A({ event: 'contact' }),
  A({ reason: '공이 플레이트까지 안 갔어요' }),
  null,
];
const t = tallyAbs(items);
check('판정 3', t.judged === 3, String(t.judged));
check('스트라이크 2 · 볼 1', t.strikes === 2 && t.balls === 1);
check('타격 1 · 판정 없음 2', t.contacts === 1 && t.none === 2, `${t.contacts}/${t.none}`);
check('존 밖 볼은 볼만', t.outsideBalls === 1, String(t.outsideBalls));
check('경계 1', t.borderline === 1);
check('비율은 판정만 분모 67%', t.strikePct === 67, String(t.strikePct));
check('칸 5 하나', t.cells[4] === 1 && t.cells.reduce((a, b) => a + b, 0) === 1);
const zero = tallyAbs([A({ event: 'contact' }), null]);
check('판정 0구 → 비율 null', zero.strikePct === null && zero.judged === 0);

/* 공 목록 줄 */
check('목록 S 경계 참고', absRowText(A({ batter: 2, heightCm: 182, verdict: V({ call: 'strike', cell: 1, borderline: true, confidence: 'low' }) })) === '타자 2 · 182cm · S · 경계 · 참고');
check('목록 abs 없음', absRowText(null) === '판정 없음');
check('목록 타격', absRowText(A({ event: 'contact' })) === '타자 1 · 175cm · 타격');

/* 타자 기록 — 알아챈 때의 타자 */
const hist = [
  { since: 0, batter: 1, heightCm: 175 },
  { since: 1000, batter: 2, heightCm: 190 },
];
check('바꾸기 전 알아챈 공은 앞 타자', batterAt(hist, 900)?.batter === 1);
check('바꾼 뒤는 새 타자', batterAt(hist, 1500)?.batter === 2 && batterAt(hist, 1500)?.heightCm === 190);
check('때를 모르면 지금 타자', batterAt(hist, undefined)?.batter === 2);
check('기록 없으면 null', batterAt([], 5) === null);

console.log(`abs-present ${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
