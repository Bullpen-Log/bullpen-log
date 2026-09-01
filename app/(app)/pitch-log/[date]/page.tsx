import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { toDateKey } from '@/lib/pitch-stats';
import {
  intensityRangeText,
  pitchRangeText,
} from '@/lib/report/plan';
import type { PlanNoteData } from '@/components/plan-note';
import type { PitchMetric } from '@/lib/pose/measure';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import { DayClient } from './day-client';

/**
 * 그날의 투구 기록 — 한 페이지.
 *
 * 예전에는 달력에서 날짜를 누르면 작은 창이 떴다. 그 안에 수치·느낀점·영상·폼
 * 분석·수정 폼이 전부 들어가다 보니, 영상 하나만 있어도 창 안에서 몇 판을
 * 굴려야 했고 정작 그날 적어둔 글은 맨 아래에 묻혔다.
 *
 * 창은 "잠깐 확인하고 닫는 것"에 맞는 그릇이다. 지난 기록을 되짚어 보는 일은
 * 그렇지 않다 — 읽고, 영상을 돌려 보고, 고치기도 한다. 그래서 페이지로 옮겼다.
 * 주소가 생기니 그날 기록을 북마크하거나 링크로 건네줄 수도 있다.
 */

/** 2026-08-28 같은 꼴만 받는다. 아니면 404 — 아무 글자나 주소에 넣어 볼 수 있다. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function PitchLogDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();

  /*
   * 날짜로 읽었는데 실제로 없는 날일 수 있다(2026-02-31 같은 것).
   * Date 는 그런 값을 조용히 다음 달로 넘겨 버리므로, 되돌려 찍어 확인한다.
   */
  const at = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) {
    notFound();
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

  const toView = (
    a: (typeof analyses)[number],
    onDate: string
  ): SavedAnalysisView => ({
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

  return (
    <DayClient
      date={date}
      todayKey={todayKey}
      heightCm={user.heightCm}
      todayPlan={todayPlan}
      initialLogs={logs.map((log) => ({ ...log, date: log.date.toISOString() }))}
      saved={analyses.map((a) => toView(a, date))}
      earlier={earlier.map((a) =>
        toView(a, a.pitchLog.date.toISOString().slice(0, 10))
      )}
    />
  );
}
