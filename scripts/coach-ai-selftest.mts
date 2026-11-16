/**
 * 코치 AI 의 순수 부분 시험(docs/designs/ai-coach.md 10-6) — API 는 부르지 않는다(돈이 든다).
 * 맥락 덩이에 개인 정보 없음 · 건강 동의 없으면 신호 없음 · 바꿀 거리 거르기 · 판정 표 · 비용 셈.
 * 실행: npm run coach:ai-test
 */
import { aiGate, capUsdOf, AI_DAILY_CHATS, AI_BLOCK_TEXT, type AiGateInput } from '@/lib/coach/ai-gate';
import { costMicroOf } from '@/lib/coach/ai-price';
import { COACH_SYSTEM, contextBlock, ageBandOf, throwsOf, type CoachAiContext } from '@/lib/coach/ai-prompt';
import { slotProgressOf } from '@/lib/coach/status';
import { sanitizeAdjusts } from '@/lib/coach/adjust';
import type { DaySlot } from '@/lib/coach/week';

let pass = 0;
const fails: string[] = [];
const check = (name: string, ok: boolean, why = '') => (ok ? pass++ : fails.push(`${name}${why ? ` — ${why}` : ''}`));
const whyOf = (g: ReturnType<typeof aiGate>) => (g.ok ? 'ok' : g.why);

/* ① 판정 표 */
const base: AiGateInput = { consent: true, age: 20, hasKey: true, capUsd: 30, monthCostMicro: 0, todayChats: 0 };
check('① 다 됨 → 남은 마디 전부', JSON.stringify(aiGate('chat', base)) === JSON.stringify({ ok: true, left: AI_DAILY_CHATS }));
check('① 동의 없음이 먼저', whyOf(aiGate('chat', { ...base, consent: false, age: 10, hasKey: false })) === 'consent');
check('① 만 13세 · 나이 모름 → age', whyOf(aiGate('chat', { ...base, age: 13 })) === 'age' && whyOf(aiGate('chat', { ...base, age: null })) === 'age');
check('① 열쇠 없음 → key', whyOf(aiGate('chat', { ...base, hasKey: false })) === 'key');
check('① 상한 0 → off(설명도)', whyOf(aiGate('explain', { ...base, capUsd: 0 })) === 'off');
check('① 이번 달 $30 닿음 → budget', whyOf(aiGate('explain', { ...base, monthCostMicro: 30_000_000 })) === 'budget' && aiGate('chat', { ...base, monthCostMicro: 29_999_999 }).ok);
check('① 하루 한도 → daily, 설명은 안 셈', whyOf(aiGate('chat', { ...base, todayChats: AI_DAILY_CHATS })) === 'daily' && aiGate('explain', { ...base, todayChats: AI_DAILY_CHATS }).ok);
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
  signals: 'no-consent',
  outingAnswer: null,
  throws: [],
  loggedToday: false,
  arm: null,
  efforts: [],
  effortSpike: false,
  limits: null,
  todayPlan: null,
  week: [{ date: '2026-11-04', day: '수', plan: '운동 60분', reasons: ['등판 3일 안'], state: 'today', did: [], left: ['운동'], extra: [], locked: false }],
};
const block = contextBlock(ctx);
check('③ 나이대 14-16 · 17-19 · 20+', ageBandOf(14) === '14-16' && ageBandOf(16) === '14-16' && ageBandOf(17) === '17-19' && ageBandOf(25) === '20+');
check('③ 건강 동의 없음 → 신호 · 팔 상태 · 피할 동작 모두 모름', block.includes('signals: 모름(건강정보 동의 없음)') && block.includes('팔 상태(앱 계산): 모름') && block.includes('피할 동작: 모름'));
check("③ 체크인 미입력은 '이상 없음'이 아니다", contextBlock({ ...ctx, signals: 'missing' }).includes('signals: 모름(오늘 체크인 안 함 · 이상 없다는 뜻이 아님)') && !/signals: (없음)?$/m.test(contextBlock({ ...ctx, signals: 'missing' })));
check('③ 체크인한 날은 값 그대로(통증 없음도 적는다)', contextBlock({ ...ctx, signals: ['condition:7', 'pain:none'] }).includes('signals: condition:7, pain:none'));
check('③ 투구 기록 없음은 기록 없음으로', block.includes('오늘 투구 기록: 아직 없음') && block.includes('- 기록 없음'));
{
  /* 던진 날 — 엔진과 같은 판정(40구 × 80% = 3,200 ≥ 2,700 → 세게 던진 날), 쉰 날 줄(0구)은 던진 날이 아님, 가까운 날부터 */
  const th = throwsOf([
    { date: '2026-11-03', sessionType: '캐치볼', pitchCount: 30, intensity: 5, effortPct: 50 },
    { date: '2026-11-04', sessionType: '불펜', pitchCount: 40, intensity: 8, effortPct: 80 },
    { date: '2026-11-02', sessionType: '휴식', pitchCount: 0, intensity: 1, effortPct: null },
  ]);
  check('③ 던진 날: 가까운 날부터 · 쉰 날 빠짐 · 세게 던진 날 표시', th.length === 2 && th[0].date === '2026-11-04' && th[0].hard && th[0].pitches === 40 && th[0].effortPct === 80 && !th[1].hard, JSON.stringify(th));
  const b2 = contextBlock({ ...ctx, throws: th, loggedToday: true, signals: ['condition:6', 'pain:none'], arm: { level: '주의', line: '오늘 많이 던졌어요' }, limits: ['점프'], efforts: [5, 7], effortSpike: true, todayPlan: { theme: '상체', minutes: 45, why: ['내일 등판이라 가볍게'] } });
  check('③ 던진 날 줄 · 팔 상태 · 오늘 운동 까닭이 덩이에', b2.includes('- 2026-11-04 | 불펜 | 40구 | 강도 80% | 세게 던진 날') && b2.includes('팔 상태(앱 계산): 주의 · 오늘 많이 던졌어요') && b2.includes('오늘 운동: 상체 · 45분 | 까닭: 내일 등판이라 가볍게') && b2.includes('운동 힘듦(최근 7일, 1~10): 5, 7 | 최근 급증') && b2.includes('피할 동작: 점프'), b2);
}
{
  /* 과제별 완료 — 암케어만 한 날은 '다 함'이 아니다 */
  const day = (items: DaySlot['items']): DaySlot => ({ date: '2026-11-03', items, reasons: [], owner: 'coach', rule: 'none', rank: 'none' });
  const both = day([{ kind: 'train', fence: { minutes: 60, heavyLower: false, light: false } }, { kind: 'mechanics' }]);
  const careOnly = slotProgressOf(both, { workout: false, drill: false, armcare: true });
  check('③ 암케어만 → 한 것 0 · 안 한 것 둘 · 계획 밖 암케어', careOnly.did.length === 0 && careOnly.left.join() === '운동,메커니즘 드릴' && careOnly.extra.join() === '암케어', JSON.stringify(careOnly));
  const half = slotProgressOf(both, { workout: true, drill: false, armcare: false });
  check('③ 운동만 → 일부', half.did.join() === '운동' && half.left.join() === '메커니즘 드릴');
  check('③ 쉬는 날에 운동 → 계획 밖', slotProgressOf(day([{ kind: 'rest' }]), { workout: true, drill: false, armcare: false }).extra.join() === '운동');
  const line = (p: ReturnType<typeof slotProgressOf>, state: 'done' | 'missed' | 'today') => contextBlock({ ...ctx, week: [{ date: '2026-11-03', day: '화', plan: '운동 60분 · 메커니즘 드릴', reasons: [], state, ...p, locked: true }] });
  check("③ 덩이: 암케어만 한 날은 '못 함'으로 적힌다(slotStateOf 는 '한 것')", line(careOnly, 'done').includes('| 못 함 | 안 한 것: 운동, 메커니즘 드릴 | 계획 밖에 한 것: 암케어'), line(careOnly, 'done'));
  check("③ 덩이: 일부만 한 날", line(half, 'done').includes('| 일부만 함 | 한 것: 운동 | 안 한 것: 메커니즘 드릴'), line(half, 'done'));
  check('③ 덩이: 어제 이어보기 답', contextBlock({ ...ctx, week: [{ date: '2026-11-03', day: '화', plan: '운동 60분', reasons: [], state: 'missed', did: [], left: ['운동'], extra: [], why: '시간이 없었어요', locked: true }] }).includes('| 못 함 | 안 한 것: 운동 | 못 한 까닭(사용자 답): 시간이 없었어요'));
  check("③ 덩이: 오늘은 '남은 것'", line(half, 'today').includes('| 오늘 · 일부만 함 | 한 것: 운동 | 남은 것: 메커니즘 드릴'), line(half, 'today'));
}
check('③ 맥락 타입에 이름 · 이메일 · 생일 · 메모 칸이 없다', !/name|email|birth|memo|note|userId/i.test(Object.keys(ctx).join(',')));
check('③ 시스템 글이 새 칸 읽는 법을 말한다', ['괜찮다는 뜻이 아니다', '투구 기록에 남겨', '암케어만 한 날', '팔 상태(앱 계산)'].every((w) => COACH_SYSTEM.includes(w)));
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
check('④ 이미 60분인 날을 60분으로는 뺀다(누를 것이 없는 단추)', sanitizeAdjusts([{ ...nul, kind: 'minutes', date: '2026-11-04', minutes: 60 }], week, T, locked).length === 0);

console.log(`coach-ai: ${pass}개 통과${fails.length ? `, ${fails.length}개 실패` : ''}`);
for (const f of fails) console.log(`  - ${f}`);
if (fails.length) process.exit(1);
