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
import { COACH_MINUTES, coachMinutes } from '@/lib/coach/answers';
import { minutesChoicesFor } from '@/lib/report/theme';
import { buildReview, reviewWeekOf } from '@/lib/coach/review';
import { dayRuleOf, planWeek, suggestProgram, weekdayOf, type CoachAnswers, type DaySlot, type WeekInput, type Weekday } from '@/lib/coach/week';

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

{
  /* 선발 5일 간격 — 지난 등판 10-30(금) → 11-04(수) · 11-09(월, 다음 주) 짐작 */
  const w = planWeek(input({ answers: answers({ outingEvery: 5 }), lastOuting: '2026-10-30' }));
  const wed = w[2];
  check('② 선발 5일 · 등판 짐작 날은 운동 없음 · 보조', wed.rule === 'softOutingNear' && !kinds(wed).includes('program') && !heavy(wed), JSON.stringify(wed));
  check('② 선발 5일 · 짐작 등판 다음 날은 회복이 아니다(짐작은 가볍게 하는 쪽에만)', w[3].rule !== 'hard', w[3].rule);
}
{
  /* 확실한 등판(체크인 답 11-05 목) — 목 회복 · 금 회복 · 수 보조 */
  const w = planWeek(input({ outingDate: '2026-11-05' }));
  check('② 확실한 등판 날 · 다음 날은 운동 안 함 · 회복 암케어 제안', [w[3], w[4]].every((s) => workouts([s]).length === 0 && s.items.some((x) => x.kind === 'armcare' && x.mode === 'recovery')), JSON.stringify([w[3], w[4]].map(kinds)));
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
            const outingDays = w.filter((s) => s.rule === 'outingToday' || s.rule === 'hard');
            check('③ 등판 날 · 다음 날 운동 0', outingDays.every((s) => workouts([s]).length === 0), tag);
            check('③ 이어진 이틀 큰 하체 0', w.every((s, i) => i === 0 || !(heavy(s) && heavy(w[i - 1]))), tag);
            check('③ 쉬는 날 ≥ 1', w.some((s) => !s.items.some((x) => x.kind === 'train' || x.kind === 'program' || (x.kind === 'fixed' && x.what !== 'game'))), tag);
            check('③ 가능 요일 밖 운동 0', workouts(w).every((s) => days.includes(weekdayOf(s.date))), tag);
            const str = w.map((s, i) => (s.items.some((x) => x.kind === 'armcare' && x.mode === 'strength') ? i : -1)).filter((i) => i >= 0);
            check('③ 강화 암케어 ≤ 주 3 · 잇지 않음 · 모두 제안', str.length <= STRENGTH_PER_WEEK && str.every((x, k) => k === 0 || x - str[k - 1] > 1) && w.every((s) => s.items.every((x) => x.kind !== 'armcare' || x.suggested)), tag);
            check('③ 메커니즘은 팔 쓴 날 · 등판 전날 밖', w.every((s) => !s.items.some((x) => x.kind === 'mechanics') || !['outingToday', 'hard', 'outingTomorrow'].includes(s.rule)), tag);
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

console.log(`coach: ${pass}개 통과${fails.length ? `, ${fails.length}개 실패` : ''} (불변 입력 ${n}가지)`);
for (const f of fails.slice(0, 20)) console.log(`  - ${f}`);
if (fails.length) process.exit(1);
