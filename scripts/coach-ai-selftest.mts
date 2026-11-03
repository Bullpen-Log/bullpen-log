/**
 * 코치 AI 의 순수 부분 시험(docs/designs/ai-coach.md 10-6) — API 는 부르지 않는다(돈이 든다).
 * 맥락 덩이에 개인 정보 없음 · 건강 동의 없으면 신호 없음 · 바꿀 거리 거르기 · 판정 표 · 비용 셈.
 * 실행: npm run coach:ai-test
 */
import { aiGate, capUsdOf, AI_DAILY_CHATS, AI_BLOCK_TEXT, type AiGateInput } from '@/lib/coach/ai-gate';
import { costMicroOf } from '@/lib/coach/ai-price';
import { COACH_SYSTEM, contextBlock, ageBandOf, type CoachAiContext } from '@/lib/coach/ai-prompt';
import { sanitizeAdjusts } from '@/lib/coach/adjust';
import type { DaySlot } from '@/lib/coach/week';

let pass = 0;
const fails: string[] = [];
const check = (name: string, ok: boolean, why = '') => (ok ? pass++ : fails.push(`${name}${why ? ` — ${why}` : ''}`));
const whyOf = (g: ReturnType<typeof aiGate>) => (g.ok ? 'ok' : g.why);

/* ① 판정 표 */
const base: AiGateInput = { consent: true, age: 20, hasKey: true, capUsd: 30, monthCostMicro: 0, todayChats: 0 };
check('① 다 됨 → 남은 30', JSON.stringify(aiGate('chat', base)) === JSON.stringify({ ok: true, left: AI_DAILY_CHATS }));
check('① 동의 없음이 먼저', whyOf(aiGate('chat', { ...base, consent: false, age: 10, hasKey: false })) === 'consent');
check('① 만 13세 · 나이 모름 → age', whyOf(aiGate('chat', { ...base, age: 13 })) === 'age' && whyOf(aiGate('chat', { ...base, age: null })) === 'age');
check('① 열쇠 없음 → key', whyOf(aiGate('chat', { ...base, hasKey: false })) === 'key');
check('① 상한 0 → off(설명도)', whyOf(aiGate('explain', { ...base, capUsd: 0 })) === 'off');
check('① 이번 달 $30 닿음 → budget', whyOf(aiGate('explain', { ...base, monthCostMicro: 30_000_000 })) === 'budget' && aiGate('chat', { ...base, monthCostMicro: 29_999_999 }).ok);
check('① 하루 30마디 → daily, 설명은 안 셈', whyOf(aiGate('chat', { ...base, todayChats: 30 })) === 'daily' && aiGate('explain', { ...base, todayChats: 30 }).ok);
check('① 상한 읽기: 없음 30 · 0 은 0 · 이상한 값 30', capUsdOf(undefined) === 30 && capUsdOf('0') === 0 && capUsdOf('abc') === 30 && capUsdOf('12.5') === 12.5 && capUsdOf('-3') === 30);
check('① 막힘 글: 해요체 · 줄표 없음', Object.values(AI_BLOCK_TEXT).every((t) => t.endsWith('요.') && !t.includes('—')));

/* ② 비용 셈 */
check('② Opus 5.5: 입력 1000 · 출력 500 · 캐시 읽기 2000', costMicroOf('claude-opus-5-5', { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000 }) === 14400);
check('② 캐시 쓰기 1.25배', costMicroOf('claude-opus-5-5', { cache_creation_input_tokens: 1000 }) === 5000);
check('② Haiku 5.5 싸다', costMicroOf('claude-haiku-5-5', { input_tokens: 1000, output_tokens: 500 }) === 350);
check('② 모르는 모델은 가장 비싼 값', costMicroOf('who-knows', { input_tokens: 1000 }) === 4000);
check('② 빈 usage 0', costMicroOf('claude-opus-5-5', {}) === 0);

/* ③ 맥락 덩이 — 개인 정보 없음, 건강 동의 없으면 신호 null */
const ctx: CoachAiContext = {
  today: '2026-11-04',
  ageBand: ageBandOf(15),
  role: 'starter',
  priority: 'velocity',
  nextOutingInDays: 3,
  signals: null,
  week: [{ date: '2026-11-04', day: '수', plan: '운동 60분', reasons: ['등판 3일 안'], state: 'today', locked: false }],
};
const block = contextBlock(ctx);
check('③ 나이대 14-16 · 17-19 · 20+', ageBandOf(14) === '14-16' && ageBandOf(16) === '14-16' && ageBandOf(17) === '17-19' && ageBandOf(25) === '20+');
check('③ 신호 없음은 null 로', block.includes('signals: null'));
check('③ 신호 있으면 코드만', contextBlock({ ...ctx, signals: ['shoulder-pain'] }).includes('signals: shoulder-pain'));
check('③ 맥락 타입에 이름 · 이메일 · 생일 · 메모 칸이 없다', !/name|email|birth|memo|note|userId/i.test(Object.keys(ctx).join(',')));
check('③ 시스템 글은 날짜 · 사람마다 다른 것이 없다(캐시)', !/\d{4}-\d{2}-\d{2}/.test(COACH_SYSTEM) && COACH_SYSTEM.length > 1200);

/* ④ 바꿀 거리 거르기 */
const slot = (date: string, kind: 'train' | 'rest'): DaySlot => ({
  date,
  items: kind === 'train' ? [{ kind: 'train', fence: { minutes: 60, heavyLower: false, light: false } }] : [{ kind: 'rest' }],
  reasons: [],
  owner: 'coach',
  rule: 'none',
  rank: 'none',
});
const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map((d, i) => slot(d, i % 2 ? 'rest' : 'train'));
const T = '2026-11-04';
const locked = (d: string) => d < T;
const nul = { date: null, minutes: null, from: null, to: null };
const s = sanitizeAdjusts(
  [
    { ...nul, kind: 'minutes', date: '2026-11-04', minutes: 45 },
    { ...nul, kind: 'skip', date: '2026-11-03' },
    { ...nul, kind: 'skip', date: '2026-11-20' },
    { ...nul, kind: 'minutes', date: '2026-11-06', minutes: 61 },
    { ...nul, kind: 'minutes', date: '2026-11-04', minutes: 45 },
    { ...nul, kind: 'delete-all' },
    { ...nul, kind: 'move', from: '2026-11-06', to: '2026-11-07' },
    { ...nul, kind: 'busy' },
    { ...nul, kind: 'skip', date: '2026-11-08' },
  ],
  week,
  T,
  locked
);
check(
  '④ 지난 날 · 주 밖 · 범위 밖 분 · 모르는 종류 · 같은 것은 버리고 3개까지',
  JSON.stringify(s) === JSON.stringify([{ kind: 'minutes', date: '2026-11-04', minutes: 45 }, { kind: 'move', from: '2026-11-06', to: '2026-11-07' }, { kind: 'busy' }]),
  JSON.stringify(s)
);
check('④ 배열이 아니면 빈 목록', sanitizeAdjusts('skip everything', week, T, locked).length === 0);

console.log(`coach-ai: ${pass}개 통과${fails.length ? `, ${fails.length}개 실패` : ''}`);
for (const f of fails) console.log(`  - ${f}`);
if (fails.length) process.exit(1);
