import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import type { getCurrentUser } from '@/lib/dal';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { coachPaid } from '@/lib/coach-access';
import { ageOn, CONSENT_MIN_AGE } from '@/lib/analysis-consent';
import { healthConsentFor } from '@/lib/analysis-consent-store';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { isHardOuting, type ReportFacts } from '@/lib/report/facts';
import { dayKindOf } from '@/lib/engine/microcycle';
import { outingOf } from '@/lib/engine/outing';
import { YOUTH_AGE_THRESHOLD } from '@/lib/report/plan';
import { BASELINE_WORKOUT_FREQ } from '@/lib/baseline';
import { activeProgram } from '@/lib/program/load';
import { parseProgram } from '@/lib/program/program';
import { isOutingTitle } from '@/lib/calendar-event';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { planWeek, weekdayOf, type DaySlot, type FixedDay, type WeekInput } from '@/lib/coach/week';
import { coachMinutes, savedOf, type CoachLimit, type CoachSaved } from '@/lib/coach/answers';
import { applyWeekAsk, weekAskFor } from '@/lib/coach/week-ask';

/**
 * 코치 한 주 틀 짓기 · 다시 맞추기(docs/designs/ai-coach.md 10-3 · 10-5 U24) — 코치 화면(app/actions/coach.ts)과 오늘 운동 만들기(training-setup.ts)가 같이 쓴다.
 * 'use server' 파일에 두면 RPC 로 열려 여기에 둔다.
 */
export type CoachUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** 저장된 답 + 앱의 기록 → 계획기 입력(그 주 월요일부터). facts 를 이미 읽었으면 넘긴다(같은 계산을 두 번 안 하게) */
export async function weekInputOf(user: CoachUser, saved: CoachSaved, healthOk: boolean, known?: ReportFacts): Promise<WeekInput> {
  const now = appNow();
  const today = toDateKey(now);
  const weekStart = shiftDateKey(today, -weekdayOf(today));
  const weekEnd = shiftDateKey(weekStart, 6);
  const [facts, program, mechanics, events] = await Promise.all([
    known ?? gatherFactsAndPlan(user, now).then((g) => g.facts),
    activeProgram(user.id),
    prisma.mechanicsProgram.findUnique({ where: { userId: user.id }, select: { id: true } }),
    prisma.calendarEvent.findMany({ where: { userId: user.id, date: { gte: dbDate(weekStart), lte: dbDate(weekEnd) } }, select: { date: true, title: true } }),
  ]);
  const outing = outingOf(facts);
  const dk = dayKindOf(facts);
  const lastHard = (facts.patterns.hardOutings ?? []).filter(isHardOuting).sort((a, b) => a.daysAgo - b.daysAgo)[0];
  const t = facts.condition.today;
  const calendar: FixedDay[] = events.filter((e) => isOutingTitle(e.title)).map((e) => ({ date: keyOfDbDate(e.date), kind: 'game' }));
  const freq = BASELINE_WORKOUT_FREQ.find((f) => f.name === user.baselineWorkoutFreq)?.sessionsPerWeek;
  const days = saved.days ?? [0, 1, 2, 3, 4, 5];
  /* 주마다 일정 묻기에 답한 주 — 등판을 짐작하지 않고 답한 그대로(선발 · 불펜 대기 · 팀 훈련 · 못 하는 날) */
  const asked = applyWeekAsk(weekAskFor(saved.weekAsks, weekStart), { days, fixed: calendar });
  return {
    weekStart,
    today,
    answers: {
      days: asked?.days ?? days,
      minutes: coachMinutes(saved.minutes ?? user.dailyWorkoutMinutes ?? 60),
      outingDays: asked ? [] : (saved.outingDays ?? []),
      outingEvery: asked ? null : (saved.outingEvery ?? null),
      teamDays: asked?.teamDays ?? saved.teamDays ?? [],
    },
    fixed: asked?.fixed ?? calendar,
    outingDate: outing.nextDay != null ? shiftDateKey(today, outing.nextDay) : null,
    lastOuting: lastHard ? shiftDateKey(today, -lastHard.daysAgo) : null,
    youth: (facts.profile.age ?? 99) < YOUTH_AGE_THRESHOLD,
    /* 건강정보 — 동의가 있을 때만 읽는다(U18) */
    painArm: healthOk && !!t && (t.shoulder === '통증' || t.elbow === '통증'),
    limits: healthOk ? (saved.limits ?? []) : [],
    effortSpike: facts.condition.trainingEffort?.spikeFlag ?? false,
    level: user.trainingLevel,
    baselineFreq: freq == null ? null : Math.round(freq),
    program: program ? { perWeek: parseProgram(program.programKey)?.perWeek ?? 3 } : null,
    /* ponytail: 메커니즘 프로그램엔 주당 횟수 칸이 없다 — 주 2번으로 둔다(12세션 순서는 날짜 의무가 아님), 칸이 생기면 그것으로 */
    mechanics: mechanics ? { perWeek: 2 } : null,
    todayKind: { rule: dk.rule, afterOuting: dk.afterOuting, heavyLower: dk.heavyLowerAllowed },
  };
}

/**
 * 오늘 칸에 '그날 엔진이 시간을 줄인다'를 싣는다(DaySlot.cut — slotLine 이 '60분 → 45분'으로 보인다). 요청마다 셈하고 저장하지 않는다 — 오늘 칸의
 * 날 종류는 엔진과 맞추지만(withEngineToday), 구원 '어제 20구 넘게'처럼 날 종류에 안 드러나는 줄임도 있어서다(2026-11-16 검토).
 */
export function withTodayCut(slots: DaySlot[], today: string, facts: ReportFacts): DaySlot[] {
  const dk = dayKindOf(facts);
  if (!dk.shorten || dk.rank === 'recovery') return slots;
  return slots.map((s) => (s.date === today && s.rank !== 'recovery' ? { ...s, cut: true as const } : s));
}

/** 입력의 지문 — 날이 바뀐 것만으로는 다시 안 짠다(오늘 · 잠김 · 지난 틀 · 오늘 엔진 판정 빼고 — 판정은 sameToday 가 따로 본다) */
const weekKey = (input: WeekInput) =>
  createHash('sha1').update(JSON.stringify({ ...input, today: null, todayLocked: null, prev: null, todayKind: null })).digest('hex').slice(0, 16);

/**
 * 저장한 오늘 칸의 날 종류 · '등판 다음 날'이 지금 엔진 판정으로 다시 짠 것과 같은가 — 다르면 다시 맞춘다. 칸 전체를 견주지 않는 까닭: 지난 날이
 * 늘면(그대로 둔 칸) 남은 날의 배치가 달라질 수 있어, 날만 바뀌어도 다시 짜게 된다(weekKey 의 약속). 그대로 둔 오늘(시작함 · 가져감 · 조정함)은 늘 같다.
 */
function sameToday(stored: readonly DaySlot[], input: WeekInput): boolean {
  const pick = (slots: readonly DaySlot[]) => {
    const s = slots.find((x) => x.date === input.today);
    return s ? `${s.rule}|${s.reasons.includes('after-outing')}` : '';
  };
  return pick(stored) === pick(planWeek({ ...input, prev: stored }));
}

/**
 * 그 주 틀을 저장 — 지난 틀이 있으면 지난 날 · 사용자가 가져간 날 · 조정한 날 · 시작한 오늘은 그대로(planWeek prev).
 * restart(코치 답을 고쳐 다시 시작)면 조정한 날도 새로 짠다.
 */
export async function saveWeek(userId: string, input: WeekInput, opts: { restart?: boolean } = {}): Promise<DaySlot[]> {
  const weekStart = dbDate(input.weekStart);
  const old = await prisma.coachWeek.findUnique({ where: { userId_weekStart: { userId, weekStart } }, select: { slots: true } });
  const prev = old ? (old.slots as unknown as DaySlot[]).map((s) => (opts.restart ? { ...s, adjusted: undefined } : s)) : null;
  const slots = planWeek({ ...input, prev });
  const fingerprint = weekKey(input);
  await prisma.coachWeek.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    create: { userId, weekStart, slots: slots as unknown as object, fingerprint },
    update: { slots: slots as unknown as object, fingerprint, generatedAt: new Date() },
  });
  return slots;
}

/**
 * 이번 주 틀을 지금 상태로(U24) — 코치 진행 중이면 계획기 입력(달력 경기 · 체크인 등판 · 팔 통증 · 힘듦 급증 · 프로그램 · 답)을 다시 모아
 * 저장 때와 지문이 다르면 다시 맞춘다. 새 주라 틀이 없으면 짓는다(크론 없이). 진행 중이 아니면 저장된 틀 그대로.
 * active 는 코치가 오늘을 맡는가(진행 중 · 유료 · 나이), limits 는 그날 운동에서 뺄 동작(건강 동의가 있을 때만).
 */
export async function currentCoachWeek(
  user: CoachUser,
  facts?: ReportFacts
): Promise<{ active: boolean; slots: DaySlot[] | null; limits: CoachLimit[] }> {
  const today = toDateKey(appNow());
  const weekStart = dbDate(shiftDateKey(today, -weekdayOf(today)));
  const [profile, row] = await Promise.all([
    prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { status: true, answers: true } }),
    prisma.coachWeek.findUnique({ where: { userId_weekStart: { userId: user.id, weekStart } }, select: { slots: true, fingerprint: true } }),
  ]);
  const stored = row ? (row.slots as unknown as DaySlot[]) : null;
  const saved = savedOf(profile?.answers);
  const age = ageOn(user.birthDate, appNow());
  if (profile?.status !== 'active' || age == null || age < CONSENT_MIN_AGE || !saved.days?.length || !(await coachPaid(user)))
    return { active: false, slots: stored, limits: [] };
  const [consent, started] = await Promise.all([
    healthConsentFor(user.id),
    prisma.trainingSession.findFirst({ where: { userId: user.id, date: dbDate(today) }, select: { id: true } }),
  ]);
  const f = facts ?? (await gatherFactsAndPlan(user, appNow())).facts;
  const input: WeekInput = { ...(await weekInputOf(user, saved, consent.valid, f)), todayLocked: started != null };
  const limits = [...(input.limits ?? [])];
  const slots = row && row.fingerprint === weekKey(input) && sameToday(stored!, input) ? stored! : await saveWeek(user.id, input);
  /* 돌려주는 칸에만 오늘 시간 줄임을 싣는다 — 저장한 칸에는 없다(저장하는 곳은 모두 DB 의 칸을 읽어 고친다) */
  return { active: true, slots: withTodayCut(slots, today, f), limits };
}
