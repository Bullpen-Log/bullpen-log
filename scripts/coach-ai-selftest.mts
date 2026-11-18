/**
 * 코치 AI 의 순수 부분 시험(docs/designs/ai-coach.md 10-6) — API 는 부르지 않는다(돈이 든다).
 * 맥락 덩이에 개인 정보 없음 · 건강 동의 없으면 신호 없음 · 바꿀 거리 거르기 · 판정 표 · 비용 셈.
 * 실행: npm run coach:ai-test
 */
import { aiGate, capUsdOf, AI_DAILY_CHATS, AI_BLOCK_TEXT, type AiGateInput } from '@/lib/coach/ai-gate';
import { costMicroOf } from '@/lib/coach/ai-price';
import { COACH_SYSTEM, COACH_SYSTEM_BLOCK, contextBlock, ageBandOf, scrubNames, throwsOf, type CoachAiContext, type CoachAiRecords, veloRowsOf } from '@/lib/coach/ai-prompt';
import { COACH_AI_CONSENT } from '@/lib/coach/ai-consent';
import { HEALTH_CONSENT, healthCutoffOf, historyFloorOf } from '@/lib/health-consent';
import { reasonTextsFor } from '@/lib/coach/answers';
import { activeRx, focusView, mechFocusFrom } from '@/lib/mechanics/program';
import { newProgression } from '@/lib/mechanics/progression';
import { REPORT_CRITERIA } from '@/lib/pitch-3d/v2/report-policy';
import type { ElementRx } from '@/lib/pitch-3d/v2/report';
import { CARD_SOURCES, COACH_CARDS, cardsBlock, shippedCards } from '@/lib/coach/cards';
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
{
  /* 적용하면 막히는 제안은 카드로 안 남긴다(2026-11-17 검토 [20]) — 프로그램 날 시간 · 이미 쉬는 날 쉬기 · 경기(회복) 날로 옮기기 */
  const w2: DaySlot[] = week.map((d) =>
    d.date === '2026-11-05'
      ? { ...d, items: [{ kind: 'fixed', what: 'game' }], rule: 'outingToday', rank: 'recovery' }
      : d.date === '2026-11-06'
        ? { ...d, items: [{ kind: 'program', heavyLower: false }] }
        : d
  );
  const kept = sanitizeAdjusts(
    [
      { ...nul, kind: 'minutes', date: '2026-11-06', minutes: 45 },
      { ...nul, kind: 'skip', date: '2026-11-07' },
      { ...nul, kind: 'move', from: '2026-11-04', to: '2026-11-05' },
      { ...nul, kind: 'minutes', date: '2026-11-04', minutes: 75 },
    ],
    w2,
    T,
    locked
  );
  check('④ 적용하면 막히는 제안(프로그램 날 시간 · 쉬는 날 쉬기 · 경기 날로 옮기기)은 버리고 되는 것만', JSON.stringify(kept) === JSON.stringify([{ kind: 'minutes', date: '2026-11-04', minutes: 75 }]), JSON.stringify(kept));
}

/* ⑤ 두 투구 코칭 기관 이름 — 지시문이 막고 답에서 한 번 더 지운다(2026-11-17 검토 [26]) */
check(
  '⑤ 답의 이름은 지우고 트레드밀은 그대로',
  scrubNames('드라이브라인처럼 짜 줄 수 있어요') === '다른 곳처럼 짜 줄 수 있어요' &&
    scrubNames('Driveline 방식, 트레드 애슬레틱스 방식, Tread Athletics') === '다른 곳 방식, 다른 곳 방식, 다른 곳' &&
    scrubNames('트레드밀 10분 · treadmill') === '트레드밀 10분 · treadmill' &&
    scrubNames('드라이브라인이라는 곳의 방식, 트레드라는 곳') === '다른 곳의 방식, 다른 곳',
  scrubNames('Driveline 방식, 트레드 애슬레틱스 방식, Tread Athletics')
);
check('⑤ 시스템 글은 이름을 안 쓰고 말하지 말라고 한다', scrubNames(COACH_SYSTEM) === COACH_SYSTEM && COACH_SYSTEM.includes('다른 회사 · 기관 · 프로그램 이름'));

/* ⑥ 지식 카드(lib/coach/cards.ts — AI 코치 2판 1단계, docs/designs/ai-coach-knowledge-memory.md 3절) */
{
  const text = (c: (typeof COACH_CARDS)[number]) => `${c.when} ${c.do} ${c.dont}`;
  const safety = COACH_CARDS.filter((c) => c.kind === 'safety');
  const coaching = COACH_CARDS.filter((c) => c.kind === 'coaching');
  check('⑥ 카드 25장(안전 19 · 코칭 6) · 번호가 겹치지 않는다', COACH_CARDS.length === 25 && safety.length === 19 && coaching.length === 6 && new Set(COACH_CARDS.map((c) => c.id)).size === 25);
  check('⑥ 숫자 처방 없음 — 카드 글에 숫자가 없다(투구 수 · 휴식일 · 세트 · 무게 · 시간은 앱 엔진만, D1)', COACH_CARDS.every((c) => !/\d/.test(text(c))), COACH_CARDS.filter((c) => /\d/.test(text(c))).map((c) => c.id).join());
  check('⑥ 출처 번호가 출처 표에 있다', COACH_CARDS.every((c) => c.sources.every((id) => id in CARD_SOURCES)));
  check('⑥ 카드 글에 기관 이름이 없다', COACH_CARDS.every((c) => scrubNames(text(c)) === text(c)));
  check(
    '⑥ 실리는 카드 — 안전 카드는 늘, 코칭 카드는 검토자가 적힌 것만(D3)',
    shippedCards().length === 19 &&
      shippedCards().every((c) => c.kind === 'safety') &&
      shippedCards([...COACH_CARDS.slice(0, 1), { ...coaching[0], review: { by: '시험', at: '2026-11-17' } }]).length === 2
  );
  check('⑥ 카드 25장을 다 실어도 4,000자 안(D2 — 글자 수로 어림)', cardsBlock(COACH_CARDS).length <= 4000, String(cardsBlock(COACH_CARDS).length));
  check(
    '⑥ AI 고정 덩이 = 규칙 글 + 실린 카드(검토 전 코칭 카드는 없다) · 날짜 없음(캐시)',
    COACH_SYSTEM_BLOCK.startsWith(COACH_SYSTEM) &&
      safety.every((c) => COACH_SYSTEM_BLOCK.includes(c.when)) &&
      coaching.every((c) => !COACH_SYSTEM_BLOCK.includes(c.when)) &&
      !/\d{4}-\d{2}-\d{2}/.test(COACH_SYSTEM_BLOCK) &&
      !COACH_CARDS.some((c) => COACH_SYSTEM_BLOCK.includes(c.id))
  );
}

/* ⑦ 일정 밖 기록(자비스 1단계) — 줄 모양 · 모름 · 영양 끄기 · 규칙 글 */
{
  const recs: CoachAiRecords = {
    lab: { date: '2026-11-12', judged: true, issues: [{ element: '드롭', level: 'improve' }, { element: '브레이크', level: 'edge' }] },
    mechFocus: { element: '드롭', done: 3, total: 9, stage: '기초', finished: false },
    velo: [{ date: '2026-11-15', type: '불펜', n: 14, max: 128.34, avg: 122.06 }],
    armcare: { days: 6, last: '2026-11-17' },
    food: { headline: '저녁에 밥을 넉넉히 드세요', more: { carbs: 40, protein: 30, fat: -10, basis: 'logged' }, score: 72 },
  };
  const b = contextBlock({ ...ctx, records: recs });
  check('⑦ 3D 판정 줄(요소 · 고칠 점 · 경계)', b.includes('3D 동작 분석(가장 최근): 2026-11-12 | 드롭(고칠 점), 브레이크(경계)'));
  check('⑦ 메커니즘 처방 줄', b.includes('메커니즘 처방: 드롭 | 3/9회 | 단계 기초'));
  check('⑦ 구속 줄(소수 한 자리)', b.includes('- 2026-11-15 | 불펜 | 14구 | 최고 128.3 | 평균 122.1'));
  check('⑦ 암케어 줄', b.includes('암케어(최근 14일): 6일 · 마지막 2026-11-17'));
  check('⑦ 영양 줄 — 넘긴 양은 음수 대신 넘음', b.includes('할 일: 저녁에 밥을 넉넉히 드세요') && b.includes('지방 목표보다 10g 넘음') && b.includes('균형 점수: 72'));
  check('⑦ 기록 칸이 week 앞에', b.indexOf('3D 동작 분석') < b.indexOf('week:'));
  const none = contextBlock(ctx);
  check("⑦ records 가 없으면 모두 '모름'(짐작 안 함)", ['3D 동작 분석(가장 최근): 모름', '메커니즘 처방: 모름', '- 모름', '암케어(최근 14일): 모름', '영양(오늘): 모름'].every((w) => none.includes(w)));
  const empty = contextBlock({ ...ctx, records: { lab: 'none', mechFocus: 'none', velo: [], armcare: { days: 0, last: null }, food: 'unset' } });
  check('⑦ 없음 · 안 함 · 설정 안 함은 모름과 다르게', ['분석한 적 없음', '메커니즘 처방: 없음', '- 측정 없음', '암케어(최근 14일): 안 함', '영양 설정 안 함'].every((w) => empty.includes(w)));
  check('⑦ 판정 못 한 3D 는 영상 조건이라고', contextBlock({ ...ctx, records: { ...recs, lab: { date: '2026-11-12', judged: false, issues: [] } } }).includes('판정한 요소 없음(영상 조건)'));
  const off = contextBlock({ ...ctx, records: { ...recs, food: 'off' } });
  check('⑦ 영양 기능을 안 쓰면 영양 값이 안 실린다', off.includes('영양 기능 안 씀') && !off.includes('균형 점수'));
  check(
    '⑦ 규칙 글: 구속 약속 금지 · 영상 본 척 금지 · 처방 바꾸라 안 함 · 모름 짐작 금지 · 먼저 꺼내 말함',
    ['구속이 얼마나 · 언제 오를지 약속하지 않고', '영상을 직접 본 것처럼 말하지 않는다', '단계를 올리거나 처방을 바꾸라고 하지 않는다', "'모름'인 칸을 짐작으로 채우지 않는다", '네가 먼저 꺼내 말한다'].every((w) => COACH_SYSTEM.includes(w))
  );
  check('⑦ 동의 글에 새로 보내는 것이 적혀 있다', ['3D 동작 분석의 판정', '구속 측정값', '암케어', '더 먹을 양', '투구 기록'].every((w) => COACH_AI_CONSENT.items.includes(w)) && COACH_AI_CONSENT.version === '2026-11-19');
}

/* ⑧ 검토 반영(2026-11-19) — 건강 동의가 없어진 뒤 보내는 것 · 지금 연습하는 요소 · 구속 종류별. 실제 AI 호출 없이 */
{
  const at = (d: string) => new Date(`${d}T12:00:00+09:00`);
  const rec = (version: string, agreed: string, revoked: string | null) => ({ id: version + agreed, version, source: 'first_use', agreedAt: at(agreed), revokedAt: revoked ? at(revoked) : null });
  check('⑧ 동의한 적 없음 · 지금 유효 → 거를 것 없음', healthCutoffOf([]) === null && healthCutoffOf([rec(HEALTH_CONSENT.version, '2026-11-02', null)]) === null);
  const revoked = healthCutoffOf([rec(HEALTH_CONSENT.version, '2026-11-02', '2026-11-10'), rec(HEALTH_CONSENT.version, '2026-11-01', '2026-11-05')]);
  check('⑧ 거뒀으면 가장 늦게 거둔 때부터만', revoked instanceof Date && revoked.getTime() === at('2026-11-10').getTime());
  check('⑧ 판이 바뀌어 무효면 지난 대화를 모두 뺀다', healthCutoffOf([rec('2020-01-01', '2026-11-02', null)]) === 'all');
  check('⑧ 거둔 뒤 다시 동의하면 다시 보낸다', healthCutoffOf([rec(HEALTH_CONSENT.version, '2026-11-02', '2026-11-05'), rec(HEALTH_CONSENT.version, '2026-11-08', null)]) === null);
  const keep = at('2026-10-20');
  check('⑧ 보낼 대화의 시작 = 보관 창 · 경계 중 늦은 쪽', historyFloorOf(keep, null) === keep && historyFloorOf(keep, at('2026-11-10'))?.getTime() === at('2026-11-10').getTime() && historyFloorOf(keep, at('2026-10-01')) === keep && historyFloorOf(keep, 'all') === null);
  /* 어제 팔꿈치 통증으로 쉬기로 짠 칸 · 피할 동작 — 오늘 건강 동의가 없으면 까닭에서 빠진다(일정 까닭은 그대로) */
  check('⑧ 건강 동의 없으면 칸 까닭에서 팔 통증 · 피할 동작을 뺀다', JSON.stringify(reasonTextsFor(['pain', 'limit', 'outing-near'], false)) === JSON.stringify(['등판 3일 안']) && reasonTextsFor(['pain', 'limit'], true).length === 2);
  const sent = contextBlock({ ...ctx, week: [{ date: '2026-11-03', day: '화', plan: '쉬기', reasons: reasonTextsFor(['pain', 'skipped'], false), state: 'done', did: [], left: [], extra: [], locked: true }] });
  const dayLines = sent.split('\n').filter((l) => l.startsWith('- 2026'));
  check('⑧ 동의 없는 날 보내는 일정 줄에 건강 까닭이 없다', dayLines.length === 1 && !dayLines.some((l) => /통증|피할 동작/.test(l)), dayLines.join(' / '));

  /* 첫 요소(상하체 분리)를 마치고 둘째(드롭) '연결' 단계로 넘어간 선수 — 이름과 단계가 같은 요소여야 */
  const rxOf = (element: '상하체 분리' | '드롭', fault: string): ElementRx => ({ element, key: fault, fault: fault as ElementRx['fault'], level: 'improve', slots: 1, cue: 'fixture', target: null, weeks: [] });
  const rx = [rxOf('상하체 분리', 'sep.openAtPlant'), rxOf('드롭', 'drop.knee')];
  const progression = newProgression('fixture', rx);
  progression.elements = [
    { fault: 'sep.openAtPlant', stage: '통합', finished: true },
    { fault: 'drop.knee', stage: '연결', finished: false },
  ];
  const focus = { jobId: null, startedOn: '2026-11-01', reportId: 'r', done: 5, rx, criteria: REPORT_CRITERIA, progression };
  const m = mechFocusFrom(focus);
  check('⑧ 지금 요소 = 안 끝난 둘째 · 단계도 그 요소의 것', activeRx(focus).element === '드롭' && m.element === '드롭' && m.stage === '연결' && m.stage === focusView(focus).stage, JSON.stringify(m));
  check('⑧ 단계별 진행은 9회 상한이 없어 한 횟수만', m.total === null && contextBlock({ ...ctx, records: { lab: 'none', mechFocus: m, velo: [], armcare: null, food: null } }).includes('메커니즘 처방: 드롭 | 5회 함 | 단계 연결'));
  const old = mechFocusFrom({ ...focus, progression: undefined });
  check('⑧ 옛 처방은 첫 요소 · n/9회', old.element === '상하체 분리' && old.total === 9);

  /* 같은 날 캐치볼 · 불펜 — 종류를 섞지 않고, 같은 종류 여러 세션은 구수로 무게 */
  const v = veloRowsOf([
    { date: '2026-11-15', sessionType: '불펜', n: 10, maxKmh: 128, avgKmh: 120 },
    { date: '2026-11-15', sessionType: '불펜', n: 30, maxKmh: 126, avgKmh: 124 },
    { date: '2026-11-15', sessionType: '캐치볼', n: 6, maxKmh: 95, avgKmh: 90 },
    { date: '2026-11-12', sessionType: '불펜', n: 0, maxKmh: 0, avgKmh: 0 },
    { date: '2026-11-10', sessionType: null, n: 4, maxKmh: 110, avgKmh: 105 },
    { date: '2026-11-08', sessionType: '불펜', n: 5, maxKmh: 120, avgKmh: 115 },
    { date: '2026-11-01', sessionType: '불펜', n: 5, maxKmh: 119, avgKmh: 114 },
  ]);
  const pen = v.find((r) => r.date === '2026-11-15' && r.type === '불펜');
  check('⑧ 같은 날 불펜 · 캐치볼은 따로', v.filter((r) => r.date === '2026-11-15').length === 2 && v.some((r) => r.type === '캐치볼' && r.avg === 90));
  check('⑧ 같은 종류 여러 세션은 구수 더하고 평균은 구수로 무게', pen?.n === 40 && pen.max === 128 && pen.avg === 123);
  check('⑧ 가까운 측정일 셋까지(0구는 측정일 아님)', JSON.stringify([...new Set(v.map((r) => r.date))]) === JSON.stringify(['2026-11-15', '2026-11-10', '2026-11-08']));
  check('⑧ 종류 모름은 그렇게 적는다', contextBlock({ ...ctx, records: { lab: 'none', mechFocus: 'none', velo: v, armcare: null, food: null } }).includes('- 2026-11-10 | 종류 모름 | 4구'));
}

console.log(`coach-ai: ${pass}개 통과${fails.length ? `, ${fails.length}개 실패` : ''}`);
for (const f of fails) console.log(`  - ${f}`);
if (fails.length) process.exit(1);
