/**
 * 투구 탭 '오늘' 카드의 보이기 · 가는 곳(native/src/pitch/today-view.ts — today-card.tsx 가 그대로 쓴다) 시험.
 * 실행: npm run native-today-card:test
 * 재현(2026-10-26): 투구 탭을 켜 둔 채 날짜가 바뀌면 카드가 어제 값으로 남아 '오늘 기록 남기기'가 어제 화면을 열었다.
 * 실제 자정 · 백그라운드 복귀에서 껍데기가 today 를 바꾸는 것은 이 시험이 보지 못한다(앱 껍데기가 서버에 다시 묻는다).
 */
import assert from 'node:assert/strict';
import { todayView } from '~/pitch/today-view';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};

eq(todayView(null, '2026-10-26'), { show: 'none', go: '/pitch/2026-10-26' }, '받기 전 — 카드 없음(예전과 같음)');
eq(todayView({ today: '2026-10-26' }, '2026-10-26'), { show: 'full', go: '/pitch/2026-10-26' }, '오늘 값 — 다 보임');
/* 한국 자정을 넘김 — 새 값이 오기 전에도 단추는 오늘로 */
eq(todayView({ today: '2026-10-26' }, '2026-10-27'), { show: 'button', go: '/pitch/2026-10-27' }, '자정 뒤 — 어제 팔 상태는 숨기고 오늘로');
/* 월말 · 연말 */
eq(todayView({ today: '2026-10-31' }, '2026-11-01').go, '/pitch/2026-11-01', '월말');
eq(todayView({ today: '2026-12-31' }, '2027-01-01'), { show: 'button', go: '/pitch/2027-01-01' }, '연말');
/* 며칠 뒤 복귀(백그라운드) — 가는 곳은 복귀한 날 */
eq(todayView({ today: '2026-10-20' }, '2026-10-26').go, '/pitch/2026-10-26', '여러 날 뒤 복귀');
/* 시험 계정 — 서버의 시험 날짜가 오늘(폰 날짜와 달라도) */
eq(todayView({ today: '2026-08-02' }, '2026-08-02'), { show: 'full', go: '/pitch/2026-08-02' }, '시험 날짜');
eq(todayView({ today: '2026-08-01' }, '2026-08-02').show, 'button', '시험 날짜를 하루 넘김');

console.log(`투구 '오늘' 카드 ${n}개 통과`);
