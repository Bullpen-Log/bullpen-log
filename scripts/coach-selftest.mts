/**
 * 코치 주간 계획기 자체 시험(lib/coach/week.ts, docs/designs/ai-coach.md 10-3) — `npm run coach:test`.
 * ① 날 종류가 진짜 엔진(dayKindOf)과 같은가 ② 설계의 장면들 ③ 여러 입력을 돌려 불변(등판 날 큰 하체 0 · 이어진 이틀 큰 하체 0 · 쉬는 날 ≥ 1 ·
 * 가능 요일 밖 운동 0 · 강화 암케어 잇지 않음 · 메커니즘은 팔 쓴 날 밖) ④ 프로그램 제안.
 */
import { buildFacts, type CheckinLike } from '@/lib/report/facts';
import { dayKindOf } from '@/lib/engine/microcycle';
import { PROGRAMS, REQUIRED_EQUIPMENT, BASICS_REQUIRED_EQUIPMENT } from '@/lib/program/program';
import { STRENGTH_PER_WEEK } from '@/lib/armcare/routine';
import { shiftDateKey } from '@/lib/pitch-stats';
import { slotStateOf, startsOf } from '@/lib/coach/status';
import { applyAdjust, readAdjust, ADJUST_MINUTES } from '@/lib/coach/adjust';
import { limitedBy } from '@/lib/coach/limits';
import { FOLLOWUP_NEXT, followupAskOf, followupLine, followupReasonText, readFollowupWhy } from '@/lib/coach/followup';
import { COACH_MINUTES, coachMinutes } from '@/lib/coach/answers';
import { minutesChoicesFor } from '@/lib/report/theme';
import { buildReview, reviewWeekOf } from '@/lib/coach/review';
import { dayRuleOf, planWeek, suggestProgram, weekdayOf, type CoachAnswers, type DaySlot, type WeekInput, type Weekday } from '@/lib/coach/week';
import { applyWeekAsk, askWeekStart, mergePicks, prefillPicks, readWeekPicks, weekAskFor, weekAskOutings, withWeekAsk, WEEK_ASK_OUTING_TITLE, type WeekAsk } from '@/lib/coach/week-ask';
import { isOutingTitle } from '@/lib/calendar-event';
import { REASON_TEXT, slotLine } from '@/lib/coach/answers';

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

/* ─────────── ① 날 종류 = 엔진 ─────────── */
const TODAY = new Date('2026-11-04T09:00:00+09:00');
const D = '2026-11-04';
const checkin = (date: string, throwPlan: string | null): CheckinLike => ({
  date,
  condition: 7,
  sleep: '보통',
  shoulder: '정상',
  elbow: '정상',
  wrist: '정상',
  lowerBack: '정상',
  lowerBody: '정상',
  preferredParts: [],
  preferredWorkout: null,
  throwPlan,
});
const facts = (plan: string | null, yesterdayGame = false) =>
  buildFacts({
    nickname: '시험',
    age: 22,
    heightCm: 180,
    baselineDailyLoad: 100,
    today: TODAY,
    logs: yesterdayGame
      ? [{ date: new Date(TODAY.getTime() - 86_400_000).toISOString(), pitchCount: 95, intensity: 10, sessionType: '경기', maxVelocity: 130, avgVelocity: 120 }]
      : [],
    checkins: plan ? [checkin(D, plan)] : [],
    memos: [],
  });
const CROSS: { name: string; f: ReturnType<typeof facts>; outings: { date: string; soft: boolean }[] }[] = [
  { name: '오늘 등판', f: facts('오늘 등판'), outings: [{ date: D, soft: false }] },
  { name: '내일 등판', f: facts('내일 등판'), outings: [{ date: shiftDateKey(D, 1), soft: false }] },
  { name: '2~3일 뒤(3일)', f: facts('2~3일 뒤'), outings: [{ date: shiftDateKey(D, 3), soft: false }] },
  { name: '2~3일 뒤(2일)', f: facts('2~3일 뒤'), outings: [{ date: shiftDateKey(D, 2), soft: false }] },
  { name: '4일 이상 뒤', f: facts('4일 이상 뒤'), outings: [{ date: shiftDateKey(D, 4), soft: false }] },
  { name: '어제 경기 95구', f: facts(null, true), outings: [{ date: shiftDateKey(D, -1), soft: false }] },
  { name: '모름', f: facts(null), outings: [] },
];
for (const c of CROSS) {
  const eng = dayKindOf(c.f);
  const mine = dayRuleOf(D, c.outings);
  check(`① 날 종류 = 엔진 · ${c.name}`, eng.rule === mine.rule, `엔진 ${eng.rule} · 계획기 ${mine.rule}`);
  if (eng.rank === 'strength')
    check(`① 큰 하체 = 엔진 · ${c.name}`, eng.heavyLowerAllowed === mine.heavyLower, `엔진 ${eng.heavyLowerAllowed} · 계획기 ${mine.heavyLower}`);
}

/* ─────────── ② 장면 ─────────── */
const MON = '2026-11-02';
const ALL: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const answers = (o: Partial<CoachAnswers> = {}): CoachAnswers => ({ days: [0, 1, 2, 3, 4, 5], minutes: 60, outingDays: [], outingEvery: null, teamDays: [], ...o });
const input = (o: Partial<WeekInput> = {}): WeekInput => ({
  weekStart: MON,
  today: MON,
  answers: answers(),
  fixed: [],
  outingDate: null,
  lastOuting: null,
  youth: false,
  painArm: false,
  effortSpike: false,
  level: '중급',
  baselineFreq: null,
  program: null,
  mechanics: null,
  ...o,
});
const kinds = (s: DaySlot) => s.items.map((x) => x.kind);
const workouts = (w: DaySlot[]) => w.filter((s) => s.items.some((x) => x.kind === 'train' || x.kind === 'program'));
const heavy = (s: DaySlot) => s.items.some((x) => (x.kind === 'train' && x.fence.heavyLower) || (x.kind === 'program' && x.heavyLower));

/* ─────────── ①-2 오늘 칸 = 엔진(withEngineToday — 2026-11-17 코치 · 엔진 검토 [4] · [5] · [15]) ─────────── */
{
  const Y = shiftDateKey(D, -1);
  const engineFacts = (o: { log?: { count: number; intensity: number; type?: string }; yesterdayPlan?: string; todayPlan?: string; spike?: boolean }) =>
    buildFacts({
      nickname: '시험',
      age: 22,
      heightCm: 180,
      baselineDailyLoad: 100,
      today: TODAY,
      logs: o.log
        ? [{ date: new Date(TODAY.getTime() - 86_400_000).toISOString(), pitchCount: o.log.count, intensity: o.log.intensity, sessionType: o.log.type ?? '경기', maxVelocity: 130, avgVelocity: 120 }]
        : [],
      checkins: [...(o.yesterdayPlan ? [checkin(Y, o.yesterdayPlan)] : []), ...(o.todayPlan ? [checkin(D, o.todayPlan)] : [])],
      memos: [],
      /* 어제까지 7일 셋 9 · 그 앞 5 넷 — 급증(lib/workout/effort.ts) */
      ...(o.spike ? { trainingNotes: [1, 3, 6, 9, 12, 16, 20].map((a, i) => ({ date: shiftDateKey(D, -a), intensity: i < 3 ? 9 : 5 })) } : {}),
    });
  const today = (f: ReturnType<typeof engineFacts>, o: Partial<WeekInput> = {}) => {
    const dk = dayKindOf(f);
    const w = planWeek(input({ today: D, mechanics: { perWeek: 2 }, todayKind: { rule: dk.rule, afterOuting: dk.afterOuting, heavyLower: dk.heavyLowerAllowed }, ...o }));
    return { dk, s: w[2] };
  };
  const recoveryCare = (s: DaySlot) => s.items.some((x) => x.kind === 'armcare' && x.mode === 'recovery');

  /* [4] 어제 경기 95구 + 힘듦 급증 — 엔진 R2 회복 · 프로그램 쉼, 예전 코치는 '등판 다음 날 · 운동 60분 · 하체 무겁게' */
  const r2 = today(engineFacts({ log: { count: 95, intensity: 10 }, spike: true }), { lastOuting: Y });
  check(
    '①-2 [4] 어제 경기 95구 + 급증 → 엔진 회복(R2) · 오늘 칸도 회복(운동 없음 · 회복 암케어 · 메커니즘 없음 · 까닭 등판 다음 날 + 최근 힘들었음)',
    r2.dk.rule === 'moderateSpike' && r2.s.rule === 'moderateSpike' && r2.s.rank === 'recovery' && workouts([r2.s]).length === 0 && recoveryCare(r2.s) &&
      !kinds(r2.s).includes('mechanics') && r2.s.reasons.includes('after-outing') && r2.s.reasons.filter((r) => r === 'effort-spike').length === 1,
    JSON.stringify(r2.s)
  );
  const r2p = today(engineFacts({ log: { count: 95, intensity: 10 }, spike: true }), { lastOuting: Y, program: { perWeek: 3 } });
  check('①-2 [4] 프로그램이어도 오늘은 프로그램 날이 아니다(엔진 프로그램도 쉼)', !kinds(r2p.s).includes('program'), JSON.stringify(r2p.s));

  /* 어제 불펜 30구 70%(2,100 — 중간 부하, 세게 던진 날 밑) + 급증 → R2 회복인데 등판 다음 날은 아니다. 회복 암케어는 쉬는 날이라 그대로 */
  const mid = today(engineFacts({ log: { count: 30, intensity: 7, type: '불펜' }, spike: true }));
  check(
    '①-2 [4] 어제 중간 부하 + 급증 → 오늘 칸 회복 · 회복 암케어(등판 다음 날 아님)',
    mid.dk.rule === 'moderateSpike' && !mid.dk.afterOuting && mid.s.rank === 'recovery' && recoveryCare(mid.s) && !mid.s.reasons.includes('after-outing'),
    JSON.stringify(mid.s)
  );

  /* [5] 어제 '오늘 등판' 답 · 기록 없음 — 엔진은 등판 다음 날(기록 없는 등판), 계획기 혼자는 모른다(lastOuting 은 세게 던진 기록만) */
  const claimed = today(engineFacts({ yesterdayPlan: '오늘 등판' }));
  check(
    '①-2 [5] 기록 없는 등판 다음 날 → 오늘 칸도 등판 다음 날(운동 날 · 회복 암케어 · 메커니즘 없음)',
    claimed.dk.rule === 'afterOuting' && claimed.s.rule === 'afterOuting' && claimed.s.reasons.includes('after-outing') && workouts([claimed.s]).length === 1 &&
      recoveryCare(claimed.s) && !kinds(claimed.s).includes('mechanics'),
    JSON.stringify(claimed.s)
  );

  /* [15] 계획한 선발(어제 경기 일정)인데 25구만(2,500 — 세게 던진 날 밑) — 엔진은 등판 다음 날이 아니다 */
  const light = today(engineFacts({ log: { count: 25, intensity: 10 } }), { fixed: [{ date: Y, kind: 'game' }] });
  check(
    '①-2 [15] 계획한 선발이어도 가볍게 던졌으면 오늘 칸은 등판 다음 날이 아니다(회복 암케어 없음 · 메커니즘 놓을 수 있음)',
    dayRuleOf(D, [{ date: Y, soft: false }]).rule === 'afterOuting' && light.dk.afterOuting === false && light.s.rule !== 'afterOuting' &&
      !light.s.reasons.includes('after-outing') && !recoveryCare(light.s),
    JSON.stringify(light.s)
  );

  /* 계획기가 더 가벼우면 계획기 — 확실한 경기 날(엔진은 달력 경기를 짐작으로만 본다) */
  const game = today(engineFacts({}), { fixed: [{ date: D, kind: 'game' }] });
  check('①-2 확실한 경기 날은 엔진이 몰라도 등판 날(운동 없음)', game.s.rule === 'outingToday' && workouts([game.s]).length === 0, JSON.stringify(game.s));

  /* 엔진만 아는 창 — 체크인 '2~3일 뒤'(하루로 못 박지 않아 계획기 outingDate 가 없다) */
  const soon = today(engineFacts({ todayPlan: '2~3일 뒤' }));
  check('①-2 체크인 2~3일 뒤 → 오늘 칸 등판 3일 안 · 큰 하체 없음', soon.dk.rule === 'outingSoon' && soon.s.rule === 'outingSoon' && !heavy(soon.s), JSON.stringify(soon.s));

  /* 다시 맞춰도 오늘 칸의 날 종류가 그대로(lib/coach/refresh.ts sameToday 가 이 비교로 다시 짤지 정한다 — 같은 입력이면 늘 같아야 한다) */
  const first = planWeek(input({ today: D, lastOuting: Y, todayKind: { rule: r2.dk.rule, afterOuting: r2.dk.afterOuting, heavyLower: r2.dk.heavyLowerAllowed } }));
  const again = planWeek(input({ today: D, lastOuting: Y, todayKind: { rule: r2.dk.rule, afterOuting: r2.dk.afterOuting, heavyLower: r2.dk.heavyLowerAllowed }, prev: first }));
  check('①-2 같은 입력으로 다시 맞추면 오늘 칸이 같다(다시 짜기가 돌지 않는다)', JSON.stringify(first[2]) === JSON.stringify(again[2]), JSON.stringify([first[2], again[2]]));

  /* todayKind 가 없으면(옛 입력 · 시험) 예전 그대로 */
  const plain = planWeek(input({ today: D, lastOuting: Y }));
  check('①-2 엔진 판정이 없으면 계획기 그대로(어제 세게 던진 날 → 등판 다음 날)', plain[2].rule === 'afterOuting', plain[2].rule);
}

{
  /* 선발 5일 간격 — 지난 등판 10-30(금) → 11-04(수) · 11-09(월, 다음 주) 짐작 */
  const w = planWeek(input({ answers: answers({ outingEvery: 5 }), lastOuting: '2026-10-30' }));
  const wed = w[2];
  check('② 선발 5일 · 등판 짐작 날은 운동 없음 · 보조', wed.rule === 'softOutingNear' && !kinds(wed).includes('program') && !heavy(wed), JSON.stringify(wed));
  check('② 선발 5일 · 짐작 등판 다음 날은 등판 다음 날로 보지 않는다(짐작은 가볍게 하는 쪽에만)', w[3].rule !== 'afterOuting' && !w[3].reasons.includes('after-outing'), w[3].rule);
}
{
  /* 확실한 등판(체크인 답 11-05 목) — 목 회복 · 금 등판 다음 날의 운동 날(2026-11-16 김민 결정) · 수 보조 */
  const w = planWeek(input({ outingDate: '2026-11-05' }));
  check('② 확실한 등판 날은 운동 안 함 · 다음 날은 운동 날(큰 하체) · 둘 다 회복 암케어 제안', workouts([w[3]]).length === 0 && w[4].rule === 'afterOuting' && workouts([w[4]]).length === 1 && heavy(w[4]) && [w[3], w[4]].every((s) => s.items.some((x) => x.kind === 'armcare' && x.mode === 'recovery')), JSON.stringify([w[3], w[4]].map(kinds)));
  check('② 등판 전날은 보조(큰 하체 없음)', w[2].rule === 'outingTomorrow' && !heavy(w[2]), JSON.stringify(w[2]));
}
{
  const w = planWeek(input({ answers: answers({ teamDays: [1, 3] }) }));
  check('② 팀 훈련 화 · 목 — 그날 코치 운동 없음', [w[1], w[3]].every((s) => kinds(s).includes('fixed') && workouts([s]).length === 0));
}
{
  const w = planWeek(input({ fixed: [{ date: '2026-11-04', kind: 'lesson' }], baselineFreq: 3 }));
  check('② 레슨 있는 날은 운동량에 셈 — 코치 운동 날 2개 + 레슨', workouts(w).length === 2 && workouts([w[2]]).length === 0, String(workouts(w).length));
}
{
  const w = planWeek(input({ program: { perWeek: 3 }, outingDate: '2026-11-08' }));
  const p = w.filter((s) => kinds(s).includes('program'));
  check('② 프로그램 주 3번 — 3날, 등판 전날(보조) 아님', p.length === 3 && p.every((s) => s.rank !== 'light'), JSON.stringify(p.map((s) => s.date)));
  check('② 프로그램 날은 이어지지 않음', p.every((s, i) => i === 0 || shiftDateKey(p[i - 1].date, 1) !== s.date));
}
{
  const w = planWeek(input({ baselineFreq: 4 }));
  check('② 프로그램 없음 — 평소 횟수(4)만큼 그날그날 운동', workouts(w).length === 4 && w.every((s) => !kinds(s).includes('program')));
}
{
  const w = planWeek(input({ answers: answers({ days: [1, 4] }), baselineFreq: 5 }));
  check('② 가능 요일 둘뿐 — 운동은 화 · 금만', workouts(w).length === 2 && workouts(w).every((s) => [1, 4].includes(weekdayOf(s.date))));
}
{
  const w = planWeek(input({ answers: answers({ days: ALL }), baselineFreq: 7 }));
  check('② 매일 가능 · 7번 원해도 쉬는 날 하루', w.filter((s) => kinds(s).includes('rest')).length >= 1, String(workouts(w).length));
}
{
  const w = planWeek(input({ painArm: true, mechanics: { perWeek: 2 } }));
  check('② 통증 — 메커니즘 · 강화 암케어 없음', w.every((s) => !s.items.some((x) => x.kind === 'mechanics' || (x.kind === 'armcare' && x.mode === 'strength'))) && w.some((s) => s.reasons.includes('pain')));
}
{
  const w = planWeek(input({ youth: true, baselineFreq: 5 }));
  check('② 성장기 — 큰 하체 0 · 주 3번까지', w.every((s) => !heavy(s)) && workouts(w).length <= 3, String(workouts(w).length));
}
{
  const a = workouts(planWeek(input({ baselineFreq: 4 }))).length;
  const b = workouts(planWeek(input({ baselineFreq: 4, effortSpike: true }))).length;
  check('② 힘듦 급증 주 — 운동 날 하나 줄임', b === a - 1, `${a} → ${b}`);
}
{
  /* 수요일에 다시 맞춤 — 월(지난 날, 운동 칸)은 못 했어도 그대로 · 그 몫을 뒤로 몰지 않음 */
  const first = planWeek(input({ baselineFreq: 3 }));
  const again = planWeek(input({ baselineFreq: 3, today: '2026-11-04', prev: first }));
  check('② 다시 맞춤 — 지난 날은 그대로', JSON.stringify(again.slice(0, 2)) === JSON.stringify(first.slice(0, 2)));
  check('② 다시 맞춤 — 못 한 날을 몰아넣지 않음(주 운동 수 그대로)', workouts(again).length === workouts(first).length, `${workouts(first).length} → ${workouts(again).length}`);
}
{
  const first = planWeek(input({ baselineFreq: 3 }));
  const mine: DaySlot = { ...first[5], owner: 'user', items: [{ kind: 'rest' }], reasons: ['rest'] };
  const prev = first.map((s, i) => (i === 5 ? mine : s));
  const again = planWeek(input({ baselineFreq: 3, today: '2026-11-04', prev, outingDate: '2026-11-08' }));
  check('② 사용자가 고친 날은 안 덮음', JSON.stringify(again[5]) === JSON.stringify(mine));
}
{
  /* 피할 동작(코치 질문, 2026-11-03) — 무거운 하체면 운동 칸에 큰 하체 0, 던지기면 메커니즘 0. 프로그램 칸은 프로그램대로 */
  const h = planWeek(input({ baselineFreq: 3, limits: ['heavyLower'] }));
  check('② 피할 동작 무거운 하체 → 큰 하체 0 · 까닭', h.every((s) => !heavy(s)) && h.some((s) => s.reasons.includes('limit')), JSON.stringify(h.map((s) => s.reasons)));
  const t = planWeek(input({ baselineFreq: 3, limits: ['throwing'], mechanics: { perWeek: 2 } }));
  check('② 피할 동작 던지기 → 메커니즘 0 · 까닭', t.every((s) => !kinds(s).includes('mechanics')) && t.some((s) => s.reasons.includes('limit')));
  check('② 피할 동작 점프 · 머리 위 → 주 틀은 그대로(그날 운동에서 뺌)', JSON.stringify(planWeek(input({ baselineFreq: 3, limits: ['jump', 'overhead'] }))) === JSON.stringify(planWeek(input({ baselineFreq: 3 }))));
  check('② 프로그램 칸은 피할 동작에도 프로그램대로', JSON.stringify(planWeek(input({ program: { perWeek: 3 }, limits: ['heavyLower'] }))) === JSON.stringify(planWeek(input({ program: { perWeek: 3 } }))));
  const ex = (o: Partial<Parameters<typeof limitedBy>[0]>): Parameters<typeof limitedBy>[0] => ({ title: '운동', category: '상체 스트렝스', intensity: '중간', bodyParts: [], equipment: [], movementPattern: null, ...o });
  check(
    '② 피할 동작 거르기: 바벨 하체 · 하체 점프 · 메디신볼 · 숄더 프레스만 걸림',
    limitedBy(ex({ category: '하체 스트렝스', equipment: ['바벨'] }), ['heavyLower']) &&
      limitedBy(ex({ category: '파워', movementPattern: '스쿼트' }), ['jump']) &&
      limitedBy(ex({ category: '파워', equipment: ['메디신볼'] }), ['throwing']) &&
      limitedBy(ex({ title: '덤벨 숄더 프레스' }), ['overhead']) &&
      !limitedBy(ex({ title: '덤벨 벤치 프레스' }), ['overhead', 'jump', 'throwing', 'heavyLower']) &&
      !limitedBy(ex({ category: '하체 스트렝스', equipment: ['바벨'] }), [])
  );
}
{
  /* 주중 다시 맞춤(U24, 2026-11-03) — 쉬기로 한 날 · 조정한 날은 그대로, 뺀 운동을 다른 날로 되살리지 않음, 시작한 오늘은 그대로 */
  const TODAY = '2026-11-04';
  const first = planWeek(input({ baselineFreq: 3 }));
  const d0 = first.find((s) => s.date >= TODAY && s.items.some((x) => x.kind === 'train'))!.date;
  const sk = applyAdjust(first, { kind: 'skip', date: d0 }, (d) => d < TODAY);
  if (!('week' in sk)) check('②-U24 쉬기 조정', false, JSON.stringify(sk));
  else {
    check('②-U24 조정한 칸에 표시', sk.week.find((s) => s.date === d0)!.adjusted === true && sk.week.filter((s) => s.adjusted).length === sk.changed.length);
    const again = planWeek(input({ baselineFreq: 3, today: TODAY, prev: sk.week, painArm: true, fixed: [{ date: '2026-11-07', kind: 'game' }] }));
    check('②-U24 다시 맞춤 — 쉬기로 한 날 그대로', JSON.stringify(again.find((s) => s.date === d0)) === JSON.stringify(sk.week.find((s) => s.date === d0)));
    check('②-U24 다시 맞춤 — 뺀 운동을 다른 날로 되살리지 않음', workouts(again).length <= workouts(sk.week).length, `${workouts(sk.week).length} → ${workouts(again).length}`);
    check('②-U24 다시 맞춤 — 새 경기 날은 운동 0', workouts([again.find((s) => s.date === '2026-11-07')!]).length === 0);
  }
  const locked = planWeek(input({ baselineFreq: 3, today: TODAY, prev: first, outingDate: TODAY, todayLocked: true }));
  const open = planWeek(input({ baselineFreq: 3, today: TODAY, prev: first, outingDate: TODAY }));
  check('②-U24 운동을 시작한 오늘은 그대로', JSON.stringify(locked[2]) === JSON.stringify(first[2]));
  check('②-U24 시작 안 한 오늘은 새 상태로(오늘 등판 → 운동 0)', workouts([open[2]]).length === 0 && workouts([first[2]]).length === 1, JSON.stringify(open[2]));
  /* 그대로 둔 뒷날이 큰 하체면 앞날 새 칸은 큰 하체를 안 든다 */
  const nextHeavy: DaySlot = { ...first[4], items: [{ kind: 'train', fence: { minutes: 60, heavyLower: true, light: false } }], adjusted: true };
  const w = planWeek(input({ baselineFreq: 6, today: TODAY, prev: first.map((s, i) => (i === 4 ? nextHeavy : s)) }));
  check('②-U24 그대로 둔 뒷날 큰 하체 → 앞날 큰 하체 0', !heavy(w[3]), JSON.stringify(w[3]));
}
{
  const a = planWeek(input({ program: { perWeek: 2 }, mechanics: { perWeek: 2 }, answers: answers({ outingEvery: 5, teamDays: [2] }), lastOuting: '2026-10-31' }));
  const b = planWeek(input({ program: { perWeek: 2 }, mechanics: { perWeek: 2 }, answers: answers({ outingEvery: 5, teamDays: [2] }), lastOuting: '2026-10-31' }));
  check('② 같은 입력 같은 결과', JSON.stringify(a) === JSON.stringify(b));
}

/* ─────────── ③ 불변 ─────────── */
const DAY_SETS: Weekday[][] = [[0, 2, 4], [1, 3], ALL, [0, 1, 2, 3, 4], [5, 6], [0, 1, 3, 4, 5]];
let n = 0;
for (const days of DAY_SETS)
  for (const outing of [null, '2026-11-03', '2026-11-06', '2026-11-08'])
    for (const every of [null, 5, 7])
      for (const program of [null, { perWeek: 2 }, { perWeek: 3 }])
        for (const team of [[], [2], [1, 3]] as Weekday[][])
          for (const flags of [0, 1, 2, 3]) {
            n++;
            const inp = input({
              answers: answers({ days, outingEvery: every, outingDays: every ? [] : [5], teamDays: team }),
              outingDate: outing,
              lastOuting: '2026-10-31',
              program,
              mechanics: { perWeek: 2 },
              youth: flags === 1,
              painArm: flags === 2,
              effortSpike: flags === 3,
              baselineFreq: 4,
            });
            const w = planWeek(inp);
            const tag = JSON.stringify({ days, outing, every, program, team, flags });
            /* 2026-11-17 바뀜 — 왜: 계획기는 'hard' 를 안 내고 등판 다음 날은 운동 날이 됐다(2026-11-16). 등판 날 운동 0, 다음 날은 팔 일 · 강화 없이 회복 암케어(검토 [12]) */
            const outingDays = w.filter((s) => s.rule === 'outingToday');
            check('③ 등판 날 운동 0', outingDays.length > 0 === (outing != null && outing <= shiftDateKey(MON, 6)) && outingDays.every((s) => workouts([s]).length === 0), tag);
            const afterDays = w.filter((s) => s.reasons.includes('after-outing'));
            check(
              '③ 등판 다음 날 · 메커니즘 · 강화 암케어 0 · 회복 암케어 있음',
              afterDays.every((s) => !s.items.some((x) => x.kind === 'mechanics' || (x.kind === 'armcare' && x.mode === 'strength')) && s.items.some((x) => x.kind === 'armcare' && x.mode === 'recovery')),
              tag
            );
            check('③ 이어진 이틀 큰 하체 0', w.every((s, i) => i === 0 || !(heavy(s) && heavy(w[i - 1]))), tag);
            check('③ 쉬는 날 ≥ 1', w.some((s) => !s.items.some((x) => x.kind === 'train' || x.kind === 'program' || (x.kind === 'fixed' && x.what !== 'game'))), tag);
            check('③ 가능 요일 밖 운동 0', workouts(w).every((s) => days.includes(weekdayOf(s.date))), tag);
            const str = w.map((s, i) => (s.items.some((x) => x.kind === 'armcare' && x.mode === 'strength') ? i : -1)).filter((i) => i >= 0);
            check('③ 강화 암케어 ≤ 주 3 · 잇지 않음 · 모두 제안', str.length <= STRENGTH_PER_WEEK && str.every((x, k) => k === 0 || x - str[k - 1] > 1) && w.every((s) => s.items.every((x) => x.kind !== 'armcare' || x.suggested)), tag);
            check('③ 메커니즘은 팔 쓴 날 · 등판 전날 · 다음 날 밖', w.every((s) => !s.items.some((x) => x.kind === 'mechanics') || (s.rank !== 'recovery' && s.rule !== 'outingTomorrow' && !s.reasons.includes('after-outing'))), tag);
            check('③ 성장기 큰 하체 0', !inp.youth || w.every((s) => !heavy(s)), tag);
            check('③ 칸 7 · 날짜 차례', w.length === 7 && w.every((s, i) => s.date === shiftDateKey(MON, i)), tag);
          }

/* ─────────── ④ 프로그램 제안 ─────────── */
const ALL_GEAR = [...new Set([...REQUIRED_EQUIPMENT, ...BASICS_REQUIRED_EQUIPMENT, ...PROGRAMS.flatMap((p) => p.required ?? [])])];
const pick = (o: Partial<Parameters<typeof suggestProgram>[0]>) =>
  suggestProgram({ age: 25, level: '중급', ownedEquipment: ALL_GEAR, basicsDone: false, priority: null, trainingDays: 3, ...o });
check('④ 구속 우선 · 중급 → 파워 프로그램', pick({ priority: 'velocity' })?.id === 'pitcher-power', JSON.stringify(pick({ priority: 'velocity' })));
check('④ 초급 → 스트롱리프트 주 3', JSON.stringify(pick({ level: '초급' })) === JSON.stringify({ id: 'stronglifts-5x5', perWeek: 3 }), JSON.stringify(pick({ level: '초급' })));
check('④ 초급 · 주 2일 → 주 3 프로그램은 건너뜀', pick({ level: '초급', trainingDays: 2 })?.perWeek === 2, JSON.stringify(pick({ level: '초급', trainingDays: 2 })));
check('④ 입문(기본기 안 마침) → 기본기 4주', pick({ level: '입문' })?.id === 'basics-4w', JSON.stringify(pick({ level: '입문' })));
check('④ 만 12세 → 없음', pick({ age: 12 }) === null);
check('④ 장비 없음 → 없음', pick({ ownedEquipment: [] }) === null);
check('④ 주 1일 → 없음', pick({ trainingDays: 1 }) === null);

/* ─────────── ⑤ 칸 상태 · 시작 ─────────── */
const slotOf = (date: string, items: DaySlot['items']): DaySlot => ({ date, items, reasons: [], owner: 'coach', rule: 'none', rank: 'none' });
const NONE = { workout: false, armcare: false, drill: false };
const T = '2026-11-04';
const trainSlot = (d: string) => slotOf(d, [{ kind: 'train', fence: { minutes: 60, heavyLower: true, light: false } }]);
check('⑤ 지난 운동 날 · 기록 없음 → 못 함', slotStateOf(trainSlot('2026-11-03'), NONE, T) === 'missed');
check('⑤ 지난 운동 날 · 마침 → 한 것', slotStateOf(trainSlot('2026-11-03'), { ...NONE, workout: true }, T) === 'done');
check('⑤ 지난 쉬는 날 · 기록 없음 → 못 함 아님', slotStateOf(slotOf('2026-11-03', [{ kind: 'rest' }]), NONE, T) === 'off');
check('⑤ 지난 날 암케어 제안만 · 안 함 → 못 함 아님', slotStateOf(slotOf('2026-11-03', [{ kind: 'rest' }, { kind: 'armcare', mode: 'strength', suggested: true }]), undefined, T) === 'off');
check('⑤ 쉬는 날에 암케어를 했다 → 한 것', slotStateOf(slotOf('2026-11-03', [{ kind: 'rest' }]), { ...NONE, armcare: true }, T) === 'done');
check('⑤ 오늘 · 아직 → 오늘', slotStateOf(trainSlot(T), NONE, T) === 'today');
check('⑤ 뒤 날 → 뒤', slotStateOf(trainSlot('2026-11-05'), NONE, T) === 'later');
check('⑤ 시작 차례: 운동 → 메커니즘 → 암케어', startsOf(slotOf(T, [{ kind: 'armcare', mode: 'recovery', suggested: true }, { kind: 'mechanics' }, { kind: 'program', heavyLower: false }])).map((x) => x.kind).join() === 'train,mechanics,armcare');
check('⑤ 쉬는 날 · 팀 훈련 → 시작 없음', startsOf(slotOf(T, [{ kind: 'fixed', what: 'team' }])).length === 0);

/* ─────────── ⑥ 조정 단추 ─────────── */
{
  const W0: WeekInput = {
    weekStart: '2026-11-02', today: '2026-11-04',
    answers: { days: [0, 1, 2, 3, 4, 5], minutes: 60, outingDays: [], outingEvery: null, teamDays: [3] },
    fixed: [{ date: '2026-11-07', kind: 'game' }], outingDate: null, lastOuting: null, youth: false, painArm: false,
    effortSpike: false, level: '중급', baselineFreq: 3, program: null, mechanics: null,
  };
  const wk = planWeek(W0);
  const TODAY = '2026-11-04';
  const lockPast = (d: string) => d < TODAY;
  const trainDays = wk.filter((s) => s.items.some((x) => x.kind === 'train')).map((s) => s.date);
  const future = trainDays.filter((d) => d >= TODAY);
  check('⑥ 시험 주에 오늘 뒤 운동 날이 있다', future.length > 0, JSON.stringify(trainDays));
  const d0 = future[0];
  const m = applyAdjust(wk, { kind: 'minutes', date: d0, minutes: 45 }, lockPast);
  check('⑥ 시간 바꾸기 → 그날만 45분', 'week' in m && m.changed.join() === d0 && m.week.find((s) => s.date === d0)!.items.some((x) => x.kind === 'train' && x.fence.minutes === 45), JSON.stringify(m));
  const sk = applyAdjust(wk, { kind: 'skip', date: d0 }, lockPast);
  check('⑥ 쉬기 → 운동 빠지고 쉬기 · 까닭', 'week' in sk && sk.week.find((s) => s.date === d0)!.items.every((x) => x.kind !== 'train') && sk.week.find((s) => s.date === d0)!.reasons.includes('skipped'), JSON.stringify(sk));
  const past = trainDays.find((d) => d < TODAY);
  if (past) check('⑥ 지난 날은 못 바꿈', 'error' in applyAdjust(wk, { kind: 'skip', date: past }, lockPast));
  const game = applyAdjust(wk, { kind: 'move', from: d0, to: '2026-11-07' }, lockPast);
  check('⑥ 경기 날로는 못 옮김', 'error' in game, JSON.stringify(game));
  const eve = wk.find((s) => s.date === '2026-11-06')!;
  const free = wk.find((s) => s.date >= TODAY && s.date !== d0 && !s.items.some((x) => x.kind === 'train') && s.rank !== 'recovery');
  if (free) {
    const mv = applyAdjust(wk, { kind: 'move', from: d0, to: free.date }, lockPast);
    check('⑥ 옮기기 → 새 날에 운동 · 옛 날은 쉬기', 'week' in mv && mv.week.find((s) => s.date === free.date)!.items.some((x) => x.kind === 'train') && !mv.week.find((s) => s.date === d0)!.items.some((x) => x.kind === 'train'), JSON.stringify(mv));
  }
  if (eve.rank === 'light' && d0 !== eve.date) {
    const toEve = applyAdjust(wk, { kind: 'move', from: d0, to: eve.date }, lockPast);
    check('⑥ 등판 전날로 옮기면 가볍게 · 큰 하체 끔', 'week' in toEve && toEve.week.find((s) => s.date === eve.date)!.items.some((x) => x.kind === 'train' && x.fence.light && !x.fence.heavyLower), JSON.stringify(toEve));
  }
  const busy = applyAdjust(wk, { kind: 'busy' }, lockPast);
  check('⑥ 바쁜 주 → 운동 날 하나 줄임', 'week' in busy && busy.week.filter((s) => s.items.some((x) => x.kind === 'train')).length === trainDays.length - 1, JSON.stringify(busy));
  check('⑥ 같은 시간이면 바뀌는 게 없음', 'error' in applyAdjust(wk, { kind: 'minutes', date: d0, minutes: 60 }, lockPast));
  check('⑥ 모양 검사: 범위 밖 분 · 같은 날 옮기기 거름', readAdjust({ kind: 'minutes', date: d0, minutes: 61 }) === null && readAdjust({ kind: 'minutes', date: d0, minutes: 30 }) === null && readAdjust({ kind: 'move', from: d0, to: d0 }) === null && readAdjust({ kind: 'busy' }) !== null);
  check('⑥ 코치 시간 = 엔진 선택지(코치 30분이 실제로 45분이던 것)', JSON.stringify([...COACH_MINUTES]) === JSON.stringify(minutesChoicesFor(null)) && ADJUST_MINUTES === COACH_MINUTES, JSON.stringify(minutesChoicesFor(null)));
  check('⑥ 옛 시간 맞추기: 20 · 30 → 45, 60 그대로, 120 → 90', coachMinutes(20) === 45 && coachMinutes(30) === 45 && coachMinutes(60) === 60 && coachMinutes(120) === 90);
  /* 이틀 잇는 큰 하체는 어떤 옮기기 뒤에도 없다 */
  let consec = 0;
  for (const a of wk) for (const b of wk) {
    if (a.date === b.date) continue;
    const r = applyAdjust(wk, { kind: 'move', from: a.date, to: b.date }, lockPast);
    if (!('week' in r)) continue;
    for (let i = 1; i < 7; i++) {
      const h = (s: DaySlot) => s.items.some((x) => (x.kind === 'train' && x.fence.heavyLower) || (x.kind === 'program' && x.heavyLower));
      if (r.week[i].date >= TODAY && h(r.week[i - 1]) && h(r.week[i])) consec++;
    }
  }
  check('⑥ 옮긴 뒤 이틀 잇는 큰 하체 없음', consec === 0, String(consec));
}

/* ─────────── ⑥-2 어제 이어보기(2026-11-16) ─────────── */
{
  const y = '2026-11-03';
  const both = slotOf(y, [{ kind: 'train', fence: { minutes: 60, heavyLower: false, light: false } }, { kind: 'mechanics' }]);
  const careOnly = followupAskOf(both, { workout: false, drill: false, armcare: true });
  check('⑥-2 암케어만 한 날 → 묻는다(운동 · 드릴 남음)', careOnly?.left.join() === '운동,메커니즘 드릴' && careOnly.did.length === 0, JSON.stringify(careOnly));
  check('⑥-2 다 한 날 → 안 묻는다', followupAskOf(both, { workout: true, drill: true, armcare: false }) === null);
  check('⑥-2 쉬는 날 · 암케어 제안만 → 안 묻는다', followupAskOf(slotOf(y, [{ kind: 'rest' }, { kind: 'armcare', mode: 'strength', suggested: true }]), undefined) === null);
  check('⑥-2 이미 답한 날 → 안 묻는다', followupAskOf({ ...both, followup: { why: 'time', at: 'x' } }, undefined) === null);
  check('⑥-2 사용자가 가져간 날 → 안 묻는다', followupAskOf({ ...both, owner: 'user' }, undefined) === null);
  const half = followupAskOf(both, { workout: true, drill: false, armcare: false })!;
  check('⑥-2 한 줄: 일부', followupLine(half, '화') === '어제(화) 운동은 했고 메커니즘 드릴은 못 했어요.', followupLine(half, '화'));
  check('⑥-2 한 줄: 하나도 못 함', followupLine(careOnly!, '화') === '어제(화) 계획한 운동 · 메커니즘 드릴을 못 했어요.', followupLine(careOnly!, '화'));
  check('⑥-2 답 읽기: 모르는 값 거름 · 넘어가기 받음', readFollowupWhy('time') === 'time' && readFollowupWhy('skip') === 'skip' && readFollowupWhy('drop table') === null);
  check('⑥-2 다음 걸음 글: 해요체 · 줄표 없음 · 몰아서 하자는 말 없음', Object.values(FOLLOWUP_NEXT).every((n) => n.text.endsWith('요.') && !n.text.includes('—') && !/몰아서 해|두 배|더 하/.test(n.text)));
  check('⑥-2 아팠어요 → 체크인 · 전문가, 진단 없음', FOLLOWUP_NEXT.pain.action?.kind === 'checkin' && FOLLOWUP_NEXT.pain.text.includes('전문가'));
  check('⑥-2 AI 맥락 글: 넘어가기 · 없음은 null', followupReasonText('skip') === null && followupReasonText(undefined) === null && followupReasonText('gear') === '장비 · 장소가 없었어요');
  /* 주중 다시 맞춤이 지난 날의 답을 지우지 않는다 */
  const first = planWeek(input({ baselineFreq: 3 }));
  const answered = first.map((s, i) => (i === 1 ? { ...s, followup: { why: 'time' as const, at: 'x' } } : s));
  const again = planWeek(input({ baselineFreq: 3, today: '2026-11-04', prev: answered, painArm: true }));
  check('⑥-2 다시 맞춰도 어제 답은 남는다', again[1].followup?.why === 'time');
  /* 주중에 처음 지은 틀 — 이미 지난 날은 본 적 없는 계획이라 묻지도 '못 함'으로 세지도 않는다 */
  const midweek = planWeek(input({ baselineFreq: 6, today: '2026-11-04' }));
  const lateWork = midweek.filter((s) => s.date < '2026-11-04' && s.items.some((x) => x.kind === 'train'));
  check('⑥-2 주중 첫 틀: 지난 날에 표시 · 오늘부터는 없음', lateWork.length > 0 && midweek.every((s) => !!s.late === s.date < '2026-11-04'), JSON.stringify(midweek.map((s) => s.late)));
  check('⑥-2 주중 첫 틀: 지난 날은 안 묻고 못 함도 아님', lateWork.every((s) => followupAskOf(s, undefined) === null && slotStateOf(s, undefined, '2026-11-04') === 'off'));
  check('⑥-2 다시 맞춰도 표시는 남고 새 표시는 안 생긴다', planWeek(input({ baselineFreq: 6, today: '2026-11-05', prev: midweek, painArm: true })).every((s, i) => s.late === midweek[i].late));
  check('⑥-2 월요일에 지은 틀은 표시 없음(지난 날이 진짜 계획)', planWeek(input({ baselineFreq: 3 })).every((s) => !s.late));
}

/* ─────────── ⑦ 주간 리뷰 ─────────── */
{
  check('⑦ 일요일 17시 → 아직', reviewWeekOf('2026-11-08', 17) === null);
  check('⑦ 일요일 18시 → 이번 주', reviewWeekOf('2026-11-08', 18) === '2026-11-02');
  check('⑦ 월요일 → 지난주', reviewWeekOf('2026-11-09', 9) === '2026-11-02');
  check('⑦ 화요일 → 없음', reviewWeekOf('2026-11-10', 20) === null);
  const ws = '2026-11-02';
  const day = (i: number) => shiftDateKey(ws, i);
  const tr = (i: number): DaySlot => ({ date: day(i), items: [{ kind: 'train', fence: { minutes: 60, heavyLower: false, light: false } }], reasons: [], owner: 'coach', rule: 'none', rank: 'none' });
  const rs = (i: number): DaySlot => ({ date: day(i), items: [{ kind: 'rest' }], reasons: ['rest'], owner: 'coach', rule: 'none', rank: 'none' });
  const slots = [tr(0), rs(1), tr(2), rs(3), tr(4), rs(5), rs(6)];
  const r = buildReview({
    weekStart: ws, slots,
    states: ['done', 'done', 'missed', 'off', 'done', 'off', 'off'],
    efforts: { [day(0)]: 5, [day(1)]: 6, [day(4)]: 8 },
    discomfort: { [day(0)]: ['hinge'], [day(1)]: ['hinge'], [day(4)]: ['hinge', 'hinge'] },
  });
  check('⑦ 계획 3 · 한 것 2 · 계획 밖 1 · 못 함 1', r.planned === 3 && r.done === 2 && r.extra === 1 && r.missed === 1, JSON.stringify(r));
  check('⑦ 힘듦 평균 · 갈수록 힘들어짐', r.effortAvg === 6.3 && r.lines.some((l) => l.includes('갈수록 힘들어졌어요')), JSON.stringify(r.lines));
  check('⑦ 같은 동작 3일 → 전문가 한 줄(같은 날 두 번은 하루로)', r.repeated && r.lines.some((l) => l.includes('전문가')), JSON.stringify(r));
  const r2 = buildReview({ weekStart: ws, slots, states: ['missed', 'off', 'missed', 'off', 'done', 'off', 'off'], efforts: {}, discomfort: { [day(0)]: ['hinge'], [day(2)]: ['hinge'] } });
  check('⑦ 이틀 불편은 아직 · 못 한 날 많음 한 줄', !r2.repeated && r2.lines.some((l) => l.includes('못 한 날이 많았어요')), JSON.stringify(r2));
  check('⑦ 글에 줄표 없음', [...r.lines, ...r2.lines].every((l) => !l.includes('—')));
}

/* ─────────── ⑧ 주마다 일정 묻기(lib/coach/week-ask.ts) ─────────── */
{
  /* 2026-11-08 은 일요일 */
  check('⑧ 물을 주 · 수요일은 이번 주', askWeekStart('2026-11-04', 20) === MON);
  check('⑧ 물을 주 · 일요일 17시는 이번 주 · 18시부터 다음 주', askWeekStart('2026-11-08', 17) === MON && askWeekStart('2026-11-08', 18) === shiftDateKey(MON, 7));
  check('⑧ 답 검사 · 요일 0~6 과 넷 중 하나만', JSON.stringify(readWeekPicks({ 1: 'relief', 3: 'start' })) === JSON.stringify({ 1: 'relief', 3: 'start' }));
  check('⑧ 답 검사 · 틀린 모양은 null', [{ 7: 'start' }, { 1: 'game' }, ['start'], 'start', null].every((v) => readWeekPicks(v) === null));
  const a1: WeekAsk = { weekStart: shiftDateKey(MON, -7), picks: { 1: 'relief', 5: 'team' } };
  const a2: WeekAsk = { weekStart: MON, picks: { 3: 'start' } };
  const a3: WeekAsk = { weekStart: shiftDateKey(MON, 7), picks: {}, skipped: true };
  const kept = withWeekAsk(withWeekAsk([a1], a2), a3);
  check('⑧ 최근 두 주만 남긴다 · 같은 주는 바꿔 끼움', kept.length === 2 && kept[0].weekStart === MON && withWeekAsk([a2], { ...a2, picks: {} })[0].picks[3] === undefined, JSON.stringify(kept));
  check('⑧ 저장된 것이 엉망이어도 죽지 않는다', weekAskFor('x', MON) === null && weekAskFor([{ weekStart: MON, picks: { 9: 'start' } }], MON) === null);
  const known = { games: [3] as Weekday[], teamDays: [5] as Weekday[] };
  check('⑧ 미리 채움 · 그 주 답이 먼저', JSON.stringify(prefillPicks([a1, a2], MON, known)) === JSON.stringify({ picks: { 3: 'start' }, same: false }));
  check('⑧ 미리 채움 · 지난주 답(지난주와 같아요)', JSON.stringify(prefillPicks([a1], MON, known)) === JSON.stringify({ picks: { 1: 'relief', 5: 'team' }, same: true }));
  check('⑧ 미리 채움 · 없으면 달력 경기(선발) · 되풀이 팀 훈련', JSON.stringify(prefillPicks([], MON, known)) === JSON.stringify({ picks: { 3: 'start', 5: 'team' }, same: false }));
  check('⑧ 건너뛴 지난주는 미리 채움에 안 쓴다', prefillPicks([{ ...a1, skipped: true }], MON, known).same === false);
  check('⑧ 지난 날의 답은 지킨다(오늘 수요일)', JSON.stringify(mergePicks({ 1: 'start', 4: 'team' }, { 0: 'off', 5: 'relief' }, 2)) === JSON.stringify({ 1: 'start', 5: 'relief' }));

  const base = { days: [0, 1, 2, 3, 4, 5] as Weekday[], fixed: [{ date: shiftDateKey(MON, 1), kind: 'game' as const }] };
  check('⑧ 건너뛴 주 · 답 없는 주는 짐작 그대로(null)', applyWeekAsk(null, base) === null && applyWeekAsk(a3, base) === null);
  /* 화 불펜 대기(달력에도 경기) · 목 선발 · 금 팀 훈련 · 토 못 하는 날 */
  const ap = applyWeekAsk({ weekStart: MON, picks: { 1: 'relief', 3: 'start', 4: 'team', 5: 'off' } }, base)!;
  check('⑧ 달력 경기를 불펜 대기로 골랐으면 불펜 대기', ap.fixed.filter((f) => f.date === shiftDateKey(MON, 1)).length === 1 && ap.fixed[0].relief === true, JSON.stringify(ap.fixed));
  check('⑧ 선발은 확실한 경기 · 팀 훈련 요일 · 못 하는 날 빼기', ap.fixed.some((f) => f.date === shiftDateKey(MON, 3) && !f.relief) && JSON.stringify(ap.teamDays) === '[4]' && !ap.days.includes(5), JSON.stringify(ap));

  const w = planWeek(input({ answers: answers({ days: ap.days, teamDays: ap.teamDays }), fixed: ap.fixed }));
  const [mon, tue, wed, thu, fri, sat] = w;
  check('⑧ 불펜 대기 날 · 경기 칸 · 운동 없음 · 까닭 불펜 대기', kinds(tue).includes('fixed') && workouts([tue]).length === 0 && tue.reasons.includes('standby') && !tue.reasons.includes('outing-soft'), JSON.stringify(tue));
  check('⑧ 불펜 대기 전날 · 가볍게 · 까닭 내일 불펜 대기', mon.reasons.includes('standby-tomorrow') && !heavy(mon) && mon.items.every((x) => x.kind !== 'train' || x.fence.light), JSON.stringify(mon));
  check('⑧ 불펜 대기 다음 날은 등판 다음 날로 못 박지 않는다(던졌는지는 기록으로)', wed.rule !== 'afterOuting' && !wed.reasons.includes('after-outing'), wed.rule);
  check('⑧ 선발 날 · 경기 칸 · 등판', kinds(thu).includes('fixed') && thu.rule === 'outingToday', JSON.stringify(thu));
  check('⑧ 선발 다음 날(팀 훈련 날) · 등판 다음 날 · 팀 훈련이 있어 운동은 안 얹는다 · 회복 암케어', fri.rule === 'afterOuting' && fri.reasons.includes('after-outing') && workouts([fri]).length === 0 && fri.items.some((x) => x.kind === 'armcare' && x.mode === 'recovery'), JSON.stringify(fri));
  check('⑧ 못 하는 날 · 운동 없음 · 까닭 못 하는 날', workouts([sat]).length === 0 && sat.reasons.includes('not-available'), JSON.stringify(sat));
  check('⑧ 새 까닭 글', REASON_TEXT.standby === '불펜 대기' && REASON_TEXT['standby-tomorrow'] === '내일 불펜 대기');

  /* 불펜 대기 날 실제로 세게 던졌으면(기록) 다음 날은 등판 다음 날 — 기록이 이긴다. 그날이 선발 전날이면 가볍게(내일 등판)가 먼저다 */
  const threw = planWeek(input({ answers: answers({ days: ap.days }), fixed: ap.fixed, lastOuting: shiftDateKey(MON, 1), today: shiftDateKey(MON, 2) }));
  check('⑧ 불펜 대기 날 세게 던진 기록이 있으면 다음 날은 등판 다음 날(회복 암케어) · 선발 전날이라 가볍게', threw[2].reasons.includes('after-outing') && threw[2].rule === 'outingTomorrow' && !heavy(threw[2]) && threw[2].items.some((x) => x.kind === 'armcare' && x.mode === 'recovery'), JSON.stringify(threw[2]));

  /* 선발 다음 날 — 2026-11-16(김민 결정)부터 쉬는 날이 아니라 운동 날: 운동을 여기 먼저 놓고(큰 하체), 회복 암케어를 같이 제안한다 */
  /* 메커니즘 진행 중 — 없으면 '메커니즘을 안 넣는다' 검사가 늘 참이다(검토 [12]) */
  const st = planWeek(input({ fixed: [{ date: shiftDateKey(MON, 2), kind: 'game' }], mechanics: { perWeek: 2 } }));
  const after = st[3];
  check('⑧ 선발 다음 날 · 운동 날(큰 하체) · 까닭 등판 다음 날 · 회복 암케어', after.rule === 'afterOuting' && workouts([after]).length === 1 && heavy(after) && after.reasons.includes('after-outing') && after.items.some((x) => x.kind === 'armcare' && x.mode === 'recovery'), JSON.stringify(after));
  /* 칸 글의 시간 줄임은 엔진 판정(오늘 칸만, slot.cut — lib/coach/refresh.ts withTodayCut)으로만 — 계획한 경기로 정한 '등판 다음 날' 까닭만으로는 줄여 보이지 않는다 */
  check('⑧ 계획기 칸 자체에는 시간 줄임 표시가 없다(엔진이 실제로 줄일 때만 싣는다)', !slotLine(after).includes('→') && st.every((s) => s.cut == null), slotLine(after));
  check('⑧ 엔진이 줄이는 오늘 칸(cut)은 실제 시간을 보인다 · 저장값은 그대로', slotLine({ ...after, cut: true }).startsWith('운동 60분 → 45분 · 하체 무겁게') && after.items.some((x) => x.kind === 'train' && x.fence.minutes === 60), slotLine({ ...after, cut: true }));
  check('⑧ 회복 날에는 cut 이 있어도 줄여 보이지 않는다', st.filter((s) => s.rank === 'recovery').every((s) => !slotLine({ ...s, cut: true }).includes('→')));
  check('⑧ 선발 다음 날에는 메커니즘 · 강화 암케어를 안 넣는다', !after.items.some((x) => x.kind === 'mechanics' || (x.kind === 'armcare' && x.mode === 'strength')), JSON.stringify(after.items));
  check('⑧ 가벼운 회복 운동(선택) 칸은 이제 만들지 않는다', st.every((s) => !s.items.some((x) => x.kind === 'rest' && x.light)) && !slotLine(after).includes('가벼운 회복'));
}

/* ─────────── ⑨ 안전 쪽 검토 반영(2026-11-16) ─────────── */
{
  /* 주마다 답한 선발 · 불펜 대기를 엔진도 안다 — 코치 칸이 '등판 전날 · 가볍게'면 그날 엔진도 무게 없는 날(달력 일정처럼 짐작한 등판) */
  const asks: WeekAsk[] = [
    { weekStart: '2026-11-02', picks: { 3: 'start', 5: 'relief', 1: 'team' } },
    { weekStart: '2026-10-26', picks: { 2: 'start' }, skipped: true },
  ];
  const ev = weekAskOutings(asks);
  check('⑨ 답한 주의 선발 · 불펜 대기만 날짜로 · 건너뛴 주 빼고 · 엔진이 등판으로 읽는 이름', JSON.stringify(ev.map((e) => e.date)) === JSON.stringify(['2026-11-05', '2026-11-07']) && ev.every((e) => isOutingTitle(e.title)) && isOutingTitle(WEEK_ASK_OUTING_TITLE.relief), JSON.stringify(ev));
  check('⑨ 엉망인 저장값은 빈 목록', weekAskOutings('x').length === 0 && weekAskOutings([{ weekStart: MON, picks: { 9: 'start' } }]).length === 0);
  const withAsk = (picks: WeekAsk['picks']) =>
    buildFacts({
      nickname: '시험', age: 22, heightCm: 180, baselineDailyLoad: 100, today: TODAY, logs: [], checkins: [], memos: [],
      calendarEvents: weekAskOutings([{ weekStart: MON, picks }]),
    });
  /* TODAY = 11-04(수) — 목 선발이면 오늘은 등판 전날, 토 불펜 대기면 3일 안 */
  const eve = dayKindOf(withAsk({ 3: 'start' }));
  const soon = dayKindOf(withAsk({ 5: 'relief' }));
  const none = dayKindOf(withAsk({ 3: 'team' }));
  check('⑨ 내일 선발로 답했으면 엔진도 무게 없는 날 · 큰 하체 없음', eve.rank === 'light' && !eve.heavyLowerAllowed, `${eve.rule} · ${eve.heavyLowerAllowed}`);
  check('⑨ 3일 뒤 불펜 대기면 엔진도 큰 하체 없음', soon.rule === 'outingSoon' && !soon.heavyLowerAllowed, `${soon.rule}`);
  check('⑨ 팀 훈련만 답한 날은 엔진이 등판으로 안 본다', none.rule === 'none', none.rule);

  /* 날 바꾸기 — 메커니즘(던지기) 드릴은 등판 다음 날 · 등판 전날로 옮기지 않는다 */
  const wk = planWeek(input({ fixed: [{ date: shiftDateKey(MON, 1), kind: 'game' }], mechanics: { perWeek: 2 } }));
  const afterDay = wk[2];
  const mechDay = wk.find((x) => x.date > afterDay.date && x.items.some((i) => i.kind === 'mechanics'));
  check('⑨ 준비 — 화 경기 · 수 등판 다음 날 운동 · 메커니즘이 있는 뒷날', afterDay.reasons.includes('after-outing') && workouts([afterDay]).length === 1 && !!mechDay, JSON.stringify(wk.map(kinds)));
  if (mechDay) {
    const mechOnly = !mechDay.items.some((i) => i.kind === 'train' || i.kind === 'program');
    const r = applyAdjust(wk, { kind: 'move', from: mechDay.date, to: afterDay.date }, () => false);
    if (mechOnly) check('⑨ 메커니즘만 있는 날을 등판 다음 날로 옮기면 막는다', 'error' in r, JSON.stringify(r));
    else check('⑨ 옮겨도 메커니즘은 제자리에 남는다', !('error' in r) && !r.week.find((x) => x.date === afterDay.date)!.items.some((i) => i.kind === 'mechanics'), JSON.stringify(r));
    const back = applyAdjust(wk, { kind: 'move', from: afterDay.date, to: mechDay.date }, () => false);
    check('⑨ 등판 다음 날 운동을 메커니즘 날로 옮기면 맞바꿔도 메커니즘은 등판 다음 날로 안 온다', !('error' in back) && !back.week.find((x) => x.date === afterDay.date)!.items.some((i) => i.kind === 'mechanics') && back.week.find((x) => x.date === mechDay.date)!.items.some((i) => i.kind === 'mechanics'), JSON.stringify(back));
  }
  const eveDay = wk[0];
  if (mechDay && eveDay.rule === 'outingTomorrow') {
    const r = applyAdjust(wk, { kind: 'move', from: mechDay.date, to: eveDay.date }, () => false);
    check('⑨ 등판 전날로도 메커니즘을 옮기지 않는다', 'error' in r || !r.week[0].items.some((i) => i.kind === 'mechanics'), JSON.stringify(r));
  }
}

console.log(`coach: ${pass}개 통과${fails.length ? `, ${fails.length}개 실패` : ''} (불변 입력 ${n}가지)`);
for (const f of fails.slice(0, 20)) console.log(`  - ${f}`);
if (fails.length) process.exit(1);
