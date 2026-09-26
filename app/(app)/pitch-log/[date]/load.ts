import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { toDateKey } from '@/lib/pitch-stats';
import { intensityRangeText, pitchRangeText } from '@/lib/report/plan';
import type { PlanNoteData } from '@/components/plan-note';
import type { PitchMetric } from '@/lib/pose/measure';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import type { DayClient } from './day-client';

/**
 * 그날 화면이 쓰는 것을 읽는다 — 페이지(/pitch-log/<날짜>)와 팝업(app/(app)/@modal)이
 * 같이 쓴다. 날짜가 꼴이 틀리거나 없는 날이면 null(부르는 쪽이 404).
 */

/** 2026-08-28 같은 꼴만 받는다. 아니면 404 — 아무 글자나 주소에 넣어 볼 수 있다. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PitchDayData = Parameters<typeof DayClient>[0];

export async function loadPitchDay(date: string): Promise<PitchDayData | null> {
  if (!DATE_RE.test(date)) return null;

  /*
   * 날짜로 읽었는데 실제로 없는 날일 수 있다(2026-02-31 같은 것).
   * Date 는 그런 값을 조용히 다음 달로 넘겨 버리므로, 되돌려 찍어 확인한다.
   */
  const at = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) {
    return null;
  }

  const user = await requireUser();
  const now = new Date();
  const todayKey = toDateKey(now);

  const [logs, { plan }] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: at },
      orderBy: { createdAt: 'asc' },
    }),
    /*
     * 오늘 던질 양. 오늘 날짜일 때만 쓴다 — 지난 날짜에 지금 계산한 값을
     * 그때 계획인 양 보여줄 수는 없다. 그날 아침의 계획은 남겨두지 않는다.
     */
    gatherFactsAndPlan(user, now, { excludeToday: true }),
  ]);

  /* 이 날의 기록에 붙은 폼 분석만 읽는다. 다른 날 것까지 부를 이유가 없다. */
  const analyses = logs.length
    ? await prisma.poseAnalysis.findMany({
        where: { userId: user.id, pitchLogId: { in: logs.map((l) => l.id) } },
      })
    : [];

  /*
   * 지난 세션과 견주려면 이 날보다 앞선 분석도 필요하다. 같은 영상 경로가 아니라
   * '같은 사람의 이전 분석'을 찾는 것이라 날짜를 함께 읽는다.
   */
  const earlier = await prisma.poseAnalysis.findMany({
    where: { userId: user.id, pitchLog: { date: { lt: at } } },
    include: { pitchLog: { select: { date: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  const todayPlanDay = plan.today;
  const todayPlan: PlanNoteData | null =
    date === todayKey && todayPlanDay && !plan.halted
      ? {
          throwing: todayPlanDay.throwing,
          pitches: pitchRangeText(todayPlanDay),
          intensity: intensityRangeText(todayPlanDay),
          reason: todayPlanDay.reason,
        }
      : null;

  const toView = (a: (typeof analyses)[number], onDate: string): SavedAnalysisView => ({
    videoPath: a.videoPath,
    date: onDate,
    throwingSide: a.throwingSide as 'left' | 'right',
    wristSide: a.wristSide as 'left' | 'right',
    leadSide: a.leadSide as 'left' | 'right',
    direction: a.direction as 1 | -1,
    quality: a.quality,
    coverage: a.coverage,
    kneeUpT: a.kneeUpT,
    footPlantT: a.footPlantT,
    releaseT: a.releaseT,
    kneeUpManualT: a.kneeUpManualT,
    footPlantManualT: a.footPlantManualT,
    releaseManualT: a.releaseManualT,
    metrics: a.metrics as PitchMetric[],
    updatedAt: a.updatedAt.toISOString(),
  });

  /*
   * 오늘 계획의 상한 — 남긴 기록이 계획을 넘었는지 견준다. 계획 글(todayPlan)과 같은
   * 조건일 때만 준다. 예전에는 홈의 '오늘 투구' 상자가 견줬는데, 그 상자가 알림(종)으로
   * 옮겨 가면서 오늘 투구는 이 화면에서 남긴다.
   */
  const todayLimits =
    date === todayKey && todayPlanDay && !plan.halted
      ? {
          throwing: todayPlanDay.throwing,
          maxPitches: todayPlanDay.maxPitches,
          maxIntensity: todayPlanDay.maxIntensity,
        }
      : null;

  return {
    date,
    todayKey,
    heightCm: user.heightCm,
    todayPlan,
    todayLimits,
    initialLogs: logs.map((log) => ({ ...log, date: log.date.toISOString() })),
    saved: analyses.map((a) => toView(a, date)),
    earlier: earlier.map((a) => toView(a, a.pitchLog.date.toISOString().slice(0, 10))),
  };
}
