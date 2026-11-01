'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { coachPaid } from '@/lib/coach-access';
import { ageOn, CONSENT_MIN_AGE } from '@/lib/analysis-consent';
import { HEALTH_CONSENT, HEALTH_PURPOSE } from '@/lib/health-consent';
import { healthConsentFor } from '@/lib/analysis-consent-store';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { isHardOuting } from '@/lib/report/facts';
import { outingOf } from '@/lib/engine/outing';
import { YOUTH_AGE_THRESHOLD } from '@/lib/report/plan';
import { BASELINE_WORKOUT_FREQ } from '@/lib/baseline';
import { activeProgram } from '@/lib/program/load';
import { parseProgram, PROGRAMS } from '@/lib/program/program';
import { isOutingTitle } from '@/lib/calendar-event';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { planWeek, suggestProgram, weekdayOf, type DaySlot, type FixedDay, type WeekInput } from '@/lib/coach/week';
import { startProgram } from '@/app/actions/program';
import { COACH_STEPS, mergeStep, savedOf, type CoachSaved, type CoachStep } from '@/lib/coach/answers';

/**
 * 코치 시작 흐름(앱, docs/designs/ai-coach.md 10-4) — 관문(유료 · 만 14세 · 건강정보 동의) → 질문(화면마다 저장) → 첫 주 미리보기 → 시작.
 * 운동 목록은 짜지 않는다 — 한 주 틀만(lib/coach/week.ts). 그날 운동은 기존 엔진이 만든다(R2).
 * 출시 전 베타에는 모듈째 잠긴다(lib/release-ops.ts 'coach' = /coach 와 같은 'analysis') — 그래서 밝힘 줄(allowFeature)을 두지 않는다.
 */

type Gate = 'free' | 'age' | 'consent' | 'ready';

async function gateOf(user: Awaited<ReturnType<typeof requireUser>>): Promise<{ gate: Gate; healthOk: boolean }> {
  if (!(await coachPaid(user))) return { gate: 'free', healthOk: false };
  const age = ageOn(user.birthDate, appNow());
  /* 만 14세 미만에게 AI 코치는 열지 않는다(U21). 생년월일을 모르면 묻는 대신 막는다 — 나이가 계획(성장기)에 들어가서 */
  if (age == null || age < CONSENT_MIN_AGE) return { gate: 'age', healthOk: false };
  const healthOk = (await healthConsentFor(user.id)).valid;
  return { gate: healthOk ? 'ready' : 'consent', healthOk };
}

/** 첫 화면 — 관문 · 지금 상태 · 저장된 답 · 확인할 내 정보 · 건강정보 동의 문서 */
export async function loadCoachStart() {
  const user = await requireUser();
  const [{ gate }, profile, program] = await Promise.all([
    gateOf(user),
    prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { status: true, answers: true } }),
    activeProgram(user.id),
  ]);
  const plan = program ? parseProgram(program.programKey) : null;
  return {
    ok: true as const,
    gate,
    status: (profile?.status ?? 'none') as 'none' | 'draft' | 'active' | 'paused',
    answers: savedOf(profile?.answers),
    info: {
      age: ageOn(user.birthDate, appNow()),
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      hand: user.throwingHand,
      level: user.trainingLevel,
      equipment: user.ownedEquipment,
      minutes: user.dailyWorkoutMinutes,
      program: plan ? { name: plan.def.name, perWeek: plan.perWeek } : null,
    },
    health: HEALTH_CONSENT,
  };
}

/** 건강정보 동의(그 자리 동의, U15) — 코치 시작 화면에서 */
export async function agreeHealthConsent(version: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (version !== HEALTH_CONSENT.version) return { error: '동의 내용이 바뀌었어요. 다시 읽고 동의해 주세요.' };
  const age = ageOn(user.birthDate, appNow());
  if (age != null && age < CONSENT_MIN_AGE) return { error: '만 14세 미만은 보호자의 동의가 필요해요.' };
  if ((await healthConsentFor(user.id)).valid) return { ok: true };
  await prisma.analysisConsent.create({ data: { userId: user.id, version: HEALTH_CONSENT.version, source: 'first_use', purpose: HEALTH_PURPOSE } });
  return { ok: true };
}

export async function saveCoachAnswer(step: unknown, value: unknown): Promise<{ ok: true; answers: CoachSaved } | { error: string }> {
  const user = await requireUser();
  const { gate, healthOk } = await gateOf(user);
  if (gate === 'free' || gate === 'age') return { error: '코치를 시작할 수 없어요.' };
  if (!(COACH_STEPS as readonly unknown[]).includes(step) || !value || typeof value !== 'object') return { error: '답을 다시 골라 주세요.' };
  const prev = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { answers: true, status: true } });
  const next = mergeStep(savedOf(prev?.answers), step as CoachStep, value as Record<string, unknown>, healthOk);
  if (!next) return { error: '답을 다시 골라 주세요.' };
  await prisma.coachProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, answers: next, status: 'draft' },
    update: { answers: next },
  });
  return { ok: true, answers: next };
}

/** 저장된 답 + 앱의 기록 → 계획기 입력(그 주 월요일부터) */
async function weekInputOf(user: Awaited<ReturnType<typeof requireUser>>, saved: CoachSaved, healthOk: boolean): Promise<WeekInput> {
  const now = appNow();
  const today = toDateKey(now);
  const weekStart = shiftDateKey(today, -weekdayOf(today));
  const weekEnd = shiftDateKey(weekStart, 6);
  const [{ facts }, program, mechanics, events] = await Promise.all([
    gatherFactsAndPlan(user, now),
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
      minutes: saved.minutes ?? user.dailyWorkoutMinutes ?? 60,
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
    effortSpike: facts.condition.trainingEffort?.spikeFlag ?? false,
    level: user.trainingLevel,
    baselineFreq: freq == null ? null : Math.round(freq),
    program: program ? { perWeek: parseProgram(program.programKey)?.perWeek ?? 3 } : null,
    /* ponytail: 메커니즘 프로그램엔 주당 횟수 칸이 없다 — 주 2번으로 둔다(12세션 순서는 날짜 의무가 아님), 칸이 생기면 그것으로 */
    mechanics: mechanics ? { perWeek: 2 } : null,
  };
}

const programPick = (user: Awaited<ReturnType<typeof requireUser>>, saved: CoachSaved, hasProgram: boolean) => {
  if (hasProgram) return null;
  const pick = suggestProgram({
    age: ageOn(user.birthDate, appNow()),
    level: user.trainingLevel,
    ownedEquipment: user.ownedEquipment,
    basicsDone: false,
    priority: saved.priority ?? null,
    trainingDays: saved.days?.length ?? 0,
  });
  const def = pick ? PROGRAMS.find((p) => p.id === pick.id) : null;
  return pick && def ? { ...pick, name: def.name, why: def.why ?? null } : null;
};

/** 첫 주 미리보기 — 저장하지 않는다. 프로그램이 없으면 제안 하나(U26), 미리보기는 '프로그램 없이' 짠 주와 '프로그램으로' 짠 주 둘 */
export async function previewCoachWeek() {
  const user = await requireUser();
  const { gate, healthOk } = await gateOf(user);
  if (gate === 'free' || gate === 'age') return { error: '코치를 시작할 수 없어요.' } as const;
  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { answers: true } });
  const saved = savedOf(profile?.answers);
  if (!saved.days?.length) return { error: '운동할 수 있는 요일부터 골라 주세요.' } as const;
  const input = await weekInputOf(user, saved, healthOk);
  const suggested = programPick(user, saved, input.program != null);
  return {
    ok: true as const,
    weekStart: input.weekStart,
    week: planWeek(input),
    hasProgram: input.program != null,
    suggested,
    withProgram: suggested ? planWeek({ ...input, program: { perWeek: suggested.perWeek } }) : null,
  };
}

/** 시작 — 관문을 다시 보고, 고르면 제안 프로그램을 시작하고, 이번 주 틀을 저장한다 */
export async function startCoach(input: { program?: unknown }): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const { gate, healthOk } = await gateOf(user);
  if (gate !== 'ready') return { error: gate === 'consent' ? '건강정보 동의가 필요해요.' : '코치를 시작할 수 없어요.' };
  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { answers: true } });
  const saved = savedOf(profile?.answers);
  if (!saved.days?.length) return { error: '운동할 수 있는 요일부터 골라 주세요.' };
  let week = await weekInputOf(user, saved, healthOk);
  if (input?.program === true && week.program == null) {
    const pick = programPick(user, saved, false);
    if (!pick) return { error: '맞는 프로그램이 없어요. 프로그램 없이 시작해 주세요.' };
    const started = await startProgram({ programId: pick.id, perWeek: pick.perWeek });
    if ('error' in started) return { error: started.error };
    week = { ...week, program: { perWeek: pick.perWeek } };
  }
  const slots: DaySlot[] = planWeek(week);
  const fingerprint = createHash('sha1').update(JSON.stringify({ ...week, today: null })).digest('hex').slice(0, 16);
  const weekStart = dbDate(week.weekStart);
  await prisma.$transaction([
    prisma.coachWeek.upsert({
      where: { userId_weekStart: { userId: user.id, weekStart } },
      create: { userId: user.id, weekStart, slots, fingerprint },
      update: { slots, fingerprint, generatedAt: new Date() },
    }),
    prisma.coachProfile.update({ where: { userId: user.id }, data: { status: 'active', startedAt: new Date() } }),
  ]);
  revalidatePath('/coach');
  return { ok: true };
}

/** 이번 주 틀(코치 탭 · PC 읽기) — 없으면 null */
export async function loadCoachWeek() {
  const user = await requireUser();
  if (!(await coachPaid(user))) return { ok: true as const, week: null };
  const today = toDateKey(appNow());
  const weekStart = shiftDateKey(today, -weekdayOf(today));
  const row = await prisma.coachWeek.findUnique({ where: { userId_weekStart: { userId: user.id, weekStart: dbDate(weekStart) } }, select: { slots: true } });
  return { ok: true as const, today, weekStart, week: row ? (row.slots as unknown as DaySlot[]) : null };
}
