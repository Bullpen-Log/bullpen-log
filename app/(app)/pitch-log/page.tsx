import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { toDateKey } from '@/lib/pitch-stats';
import type { PlanNoteData } from '@/components/plan-note';
import type { PitchMetric } from '@/lib/pose/measure';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import { PitchLogClient } from './pitch-log-client';

/** ?date=2026-08-04 처럼 넘어온 값만 받는다. 형식이 아니면 무시하고 오늘로 연다. */
function readDateParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export default async function PitchLogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  // 홈 달력에서 날짜를 눌러 들어오면 그 날짜로 열린다.
  const initialDate = readDateParam((await searchParams).date);

  const now = new Date();
  const [logs, analyses, { plan }] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id },
      orderBy: { date: 'asc' },
    }),
    prisma.poseAnalysis.findMany({
      where: { userId: user.id },
    }),
    /*
     * 오늘 던질 양. 달력에서 오늘을 눌러 남길 때 견줄 기준이 된다.
     *
     * 오늘 기록을 빼고 낸다. 넣고 계산하면 던진 그 순간 '휴식'으로 바뀌어,
     * 방금 남긴 45구 옆에 "오늘 계획: 휴식"이 있게 된다.
     *
     * 지난 날짜에는 안 보여준다. 그날 아침에 무엇이 계획이었는지는 남겨두지
     * 않아서, 지금 다시 계산한 값을 그때 계획인 양 보여줄 수는 없다.
     */
    gatherFactsAndPlan(user, now, { excludeToday: true }),
  ]);

  const todayPlanDay = plan.days[0] ?? null;
  const todayPlan: PlanNoteData | null =
    todayPlanDay && !plan.halted
      ? {
          throwing: todayPlanDay.throwing,
          maxPitches: todayPlanDay.maxPitches,
          maxIntensity: todayPlanDay.maxIntensity,
          reason: todayPlanDay.reason,
        }
      : null;

  /*
   * 재생 주소는 여기서 만들지 않는다.
   * 기록이 많아지면 열 때마다 전부 발급하느라 느려지므로,
   * 실제로 보고 있는 영상만 /api/pitch-log/video-url 로 그때그때 받아온다.
   */
  // Date 객체는 클라이언트로 그대로 넘길 수 없어 문자열로 바꿔 전달한다.
  const initialLogs = logs.map((log) => ({
    ...log,
    date: log.date.toISOString(),
  }));

  // 저장된 분석에 기록 날짜를 붙인다 — 지난 세션과의 비교 기준이 된다.
  const dateByLogId = new Map(
    logs.map((l) => [l.id, l.date.toISOString().slice(0, 10)])
  );
  const savedAnalyses: SavedAnalysisView[] = analyses
    .filter((a) => dateByLogId.has(a.pitchLogId))
    .map((a) => ({
      videoPath: a.videoPath,
      date: dateByLogId.get(a.pitchLogId)!,
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
    }));

  return (
    <PitchLogClient
      initialLogs={initialLogs}
      initialDate={initialDate}
      heightCm={user.heightCm}
      savedAnalyses={savedAnalyses}
      todayKey={toDateKey(now)}
      todayPlan={todayPlan}
    />
  );
}
