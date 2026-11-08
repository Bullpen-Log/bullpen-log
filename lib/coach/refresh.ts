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
import { outingOf } from '@/lib/engine/outing';
import { YOUTH_AGE_THRESHOLD } from '@/lib/report/plan';
import { BASELINE_WORKOUT_FREQ } from '@/lib/baseline';
import { activeProgram } from '@/lib/program/load';
import { parseProgram } from '@/lib/program/program';
import { isOutingTitle } from '@/lib/calendar-event';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { planWeek, weekdayOf, type DaySlot, type FixedDay, type WeekInput } from '@/lib/coach/week';
import { coachMinutes, savedOf, type CoachLimit, type CoachSaved } from '@/lib/coach/answers';

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
  const lastHard = (facts.patterns.hardOutings ?? []).filter(isHardOuting).sort((a, b) => a.daysAgo - b.daysAgo)[0];
  const t = facts.condition.today;
  const fixed: FixedDay[] = events.filter((e) => isOutingTitle(e.title)).map((e) => ({ date: keyOfDbDate(e.date), kind: 'game' }));
  const freq = BASELINE_WORKOUT_FREQ.find((f) => f.name === user.baselineWorkoutFreq)?.sessionsPerWeek;
  return {
    weekStart,
    today,
    answers: {
      days: saved.days ?? [0, 1, 2, 3, 4, 5],
      minutes: coachMinutes(saved.minutes ?? user.dailyWorkoutMinutes ?? 60),
      outingDays: saved.outingDays ?? [],
      outingEvery: saved.outingEvery ?? null,
      teamDays: saved.teamDays ?? [],
    },
    fixed,
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
  };
}

/** 입력의 지문 — 날이 바뀐 것만으로는 다시 안 짠다(오늘 · 잠김 · 지난 틀 빼고) */
const weekKey = (input: WeekInput) => createHash('sha1').update(JSON.stringify({ ...input, today: null, todayLocked: null, prev: null })).digest('hex').slice(0, 16);

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
  const input: WeekInput = { ...(await weekInputOf(user, saved, consent.valid, facts)), todayLocked: started != null };
  const limits = [...(input.limits ?? [])];
  if (row && row.fingerprint === weekKey(input)) return { active: true, slots: stored, limits };
  return { active: true, slots: await saveWeek(user.id, input), limits };
}
