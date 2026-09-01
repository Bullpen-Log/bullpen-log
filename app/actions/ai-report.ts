'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { ageFromBirthDate } from '@/lib/profile';
import { estimateDailyLoad } from '@/lib/baseline';
import { toDateKey } from '@/lib/pitch-stats';
import { AI_MODEL, isAiConfigured } from '@/lib/ai/client';
import { generateReportBody } from '@/lib/ai/report';
import { trainingLoad } from '@/lib/report/training-acwr';
import { reportReadiness } from '@/lib/report/cadence';
import { ACWR_ZONES } from '@/lib/pitch-stats';
import { buildFacts, type CheckinLike, type MemoNote } from '@/lib/report/facts';
import { buildPitchPlan } from '@/lib/report/plan';
import { readDailyPlan } from '@/lib/report/daily-plan';
import { formatPrescription } from '@/lib/exercise-meta';
import { pickCheckinParts } from '@/lib/checkin';

export type AiReportState = { error?: string; success?: string } | undefined;

/** 리포트에 쓸 자료를 모으는 기간. 4주 부하 계산에 여유를 둔다. */
const LOOKBACK_DAYS = 45;

/**
 * 오늘 기준 리포트를 만든다.
 *
 * 수치와 투구 계획은 코드가 먼저 확정하고, AI는 그것을 문장으로 옮기기만 한다.
 * 통증 신호가 있으면 AI를 아예 부르지 않고 휴식 안내만 저장한다.
 */
// 이전 상태나 폼 값이 필요 없는 동작이라 인자를 받지 않는다.
// useActionState는 인자를 넘기지만, 받지 않는 함수에 넘겨도 문제없다.
export async function generateAiReport(): Promise<AiReportState> {
  const user = await requireUser();

  if (!isAiConfigured()) {
    return { error: 'AI가 아직 설정되지 않았습니다. 관리자에게 문의해주세요.' };
  }

  const today = new Date();
  const asOfKey = toDateKey(today);
  const since = new Date(today);
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  const [logs, checkins] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: 'asc' },
    }),
    prisma.dailyCheckin.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: 'desc' },
    }),
  ]);

  if (logs.length === 0) {
    return { error: '투구 기록이 있어야 리포트를 만들 수 있습니다.' };
  }

  /*
   * 리포트는 하루에 한 번이다.
   *
   * 화면에서도 단추를 감추지만 여기서 한 번 더 본다 — 화면을 거치지 않고
   * 들어올 수 있고, 부르면 AI 비용이 실제로 나간다.
   */
  const latest = await prisma.aiReport.findFirst({
    where: { userId: user.id },
    orderBy: { asOf: 'desc' },
    select: { asOf: true, halted: true },
  });
  const readiness = reportReadiness(
    asOfKey,
    latest
      ? { asOf: latest.asOf.toISOString().slice(0, 10), halted: latest.halted }
      : null
  );
  if (!readiness.ready) {
    return { error: readiness.message };
  }

  const facts = buildFacts({
    nickname: user.nickname,
    age: user.birthDate ? ageFromBirthDate(user.birthDate, today) : null,
    heightCm: user.heightCm,
    trainingLevel: user.trainingLevel,
    baselineDailyLoad: estimateDailyLoad(user),
    logs: logs.map((l) => ({
      date: l.date.toISOString(),
      sessionType: l.sessionType,
      pitchCount: l.pitchCount,
      intensity: l.intensity,
      maxVelocity: l.maxVelocity,
      avgVelocity: l.avgVelocity,
    })),
    checkins: checkins.map<CheckinLike>((c) => ({
      date: c.date.toISOString().slice(0, 10),
      ...pickCheckinParts(c),
      condition: c.condition,
      sleep: c.sleep,
      preferredParts: c.preferredParts,
    })),
    // 메모는 최근 것 위주로 넘긴다. 통증 표현 감지에도 쓰인다.
    memos: logs
      .filter((l) => l.memo?.trim())
      .slice(-5)
      .map<MemoNote>((l) => ({
        date: l.date.toISOString().slice(0, 10),
        text: l.memo!.trim(),
      })),
    today,
  });

  const plan = buildPitchPlan(facts);
  const asOf = new Date(`${asOfKey}T00:00:00.000Z`);

  // 통증 신호가 있으면 AI를 부르지 않는다. 훈련 조언 자체를 만들지 않는 것이 안전하다.
  if (plan.halted) {
    await prisma.aiReport.upsert({
      where: { userId_asOf: { userId: user.id, asOf } },
      update: {
        halted: true,
        haltReason: plan.haltReason,
        // 예전에 만든 훈련 조언이 남아 있으면 안 되므로 반드시 비운다.
        // undefined는 "그대로 두기"라서 DbNull을 써야 실제로 지워진다.
        body: Prisma.DbNull,
        facts,
        plan,
        model: AI_MODEL,
        inputTokens: 0,
        outputTokens: 0,
      },
      create: {
        userId: user.id,
        asOf,
        halted: true,
        haltReason: plan.haltReason,
        facts,
        plan,
        model: AI_MODEL,
      },
    });
    revalidatePath('/coach');
    // 예전 훈련 설명이 화면에 남아 있으면 안 된다.
    revalidatePath('/today');
    return { success: '통증 신호가 있어 휴식 안내를 저장했습니다.' };
  }

  /*
   * 오늘 만들어 둔 운동 일정을 AI에게 넘긴다.
   *
   * 여기서 새로 만들지 않는다. 예전에는 리포트가 자기 몫의 일정을 따로
   * 계산했는데, 선수가 만든 적 없는 운동을 리포트만 설명하는 일이 생겼다.
   * 일정을 아직 안 만든 날에는 훈련 이야기를 아예 넣지 않는다.
   */
  const todaySetup = await prisma.dailyTrainingSetup.findUnique({
    where: { userId_date: { userId: user.id, date: asOf } },
    select: { plan: true },
  });
  const dailyPlan = readDailyPlan(todaySetup?.plan);

  const library = await prisma.exerciseVideo.findMany({
    where: { hiddenAt: null }, // 숨긴 운동은 새 일정에 안 나온다
    orderBy: { createdAt: 'asc' },
  });
  const byId = new Map(library.map((ex) => [ex.id, ex]));

  const training =
    dailyPlan != null
      ? {
          theme: { label: dailyPlan.theme.label, reason: dailyPlan.theme.reason },
          picked: dailyPlan.picks
            .map((p) => byId.get(p.exerciseId))
            .filter((ex): ex is NonNullable<typeof ex> => ex != null)
            .map((ex) => ({
              title: ex.title,
              category: ex.category,
              intensity: ex.intensity,
              bodyParts: ex.bodyParts,
              prescription: formatPrescription(ex),
            })),
          excluded: dailyPlan.excluded,
          basis: [...dailyPlan.basis, ...dailyPlan.notes],
          goal: dailyPlan.goal,
          preferredParts: facts.condition.today?.preferredParts ?? [],
          requestedMinutes: dailyPlan.minutes,
          estimatedMinutes: dailyPlan.estimatedMinutes,
        }
      : undefined;

  /*
   * AI가 지어낸 운동 이름을 잡아내는 데 쓰는 목록이다. 장비로 거르기 전의
   * 전체를 넘긴다 — 거른 뒤 것을 넘기면, 있지도 않은 운동을 지어낸 것과
   * 장비가 없어 오늘 빠진 운동을 말한 것을 구별하지 못한다.
   */
  /*
   * 최근 운동량과 운동 부하.
   *
   * 투구만 보면 몸에 걸린 부담의 절반만 보는 셈이다. 다만 두 부하는 단위가
   * 달라 합치지 않는다 — 프롬프트에서도 합치지 말라고 못 박아 두었다.
   */
  const workoutLoad = await trainingLoad(user.id, today);
  const workoutZone = workoutLoad.zone ? ACWR_ZONES[workoutLoad.zone] : null;

  const result = await generateReportBody(
    facts,
    plan,
    training,
    library.map((ex) => ex.title),
    {
      ratio: workoutLoad.ratio,
      zoneLabel: workoutZone?.label ?? null,
      zoneMeaning: workoutZone?.meaning ?? null,
      historyDays: workoutLoad.historyDays,
      daysNeeded: workoutLoad.daysNeeded,
      recentDays: workoutLoad.recentDays,
      recentMinutes: workoutLoad.recentMinutes,
      recentCount: workoutLoad.recentCount,
      estimatedIntensityDays: workoutLoad.estimatedIntensityDays,
    }
  );
  if (!result.ok) return { error: result.reason };

  await prisma.aiReport.upsert({
    where: { userId_asOf: { userId: user.id, asOf } },
    update: {
      halted: false,
      haltReason: null,
      body: result.body,
      facts,
      plan,
      model: AI_MODEL,
      inputTokens: result.usage.input,
      outputTokens: result.usage.output,
    },
    create: {
      userId: user.id,
      asOf,
      body: result.body,
      facts,
      plan,
      model: AI_MODEL,
      inputTokens: result.usage.input,
      outputTokens: result.usage.output,
    },
  });

  revalidatePath('/coach');
  revalidatePath('/today');
  return { success: '리포트를 만들었습니다.' };
}
