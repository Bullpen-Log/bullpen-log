import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { toDateKey } from '@/lib/pitch-stats';
import type { PlanNoteData } from '@/components/plan-note';
import type { PitchMetric } from '@/lib/pose/measure';
import type { SavedAnalysisView } from '@/lib/pose/saved';
import { PitchLogClient } from './pitch-log-client';

/** 처음에 읽어 올 개월 수. 이보다 옛날 달은 넘길 때 그 달만 받아 온다. */
const INITIAL_MONTHS = 13;

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

  /*
   * 처음에 읽어 올 범위.
   *
   * 예전에는 가입 이래 모든 기록을 한 번에 읽었다. 지금은 수십 건이라
   * 순식간이지만, 매일 남기는 선수라면 3년에 천 건이 넘는다. 달력은 한 번에 한
   * 달만 보여주므로 그만큼만 있으면 된다.
   *
   * 그렇다고 한 달만 읽으면 달을 넘길 때마다 화면이 비었다 채워진다. 열세 달을
   * 읽어 두면 이번 시즌과 작년 같은 시기까지는 넘겨도 끊기지 않고, 그보다 옛날로
   * 가면 그때 그 달만 받아 온다.
   */
  /*
   * 달의 1일로 맞춘다.
   *
   * 그냥 13개월을 빼면 시작점이 달 중간이 된다. 그러면 그 달은 절반만 읽히는데
   * 화면은 '읽은 달'로 세므로, 그 달 앞쪽 기록이 조용히 빠진다. 실제로 그렇게
   * 만들어 봤더니 7월 26일 기록이 달력에서 사라졌다.
   */
  const initialFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - INITIAL_MONTHS, 1)
  );

  const [logs, analyses, { plan }] = await Promise.all([
    prisma.pitchLog.findMany({
      where: {
        userId: user.id,
        /*
         * 영상이 붙은 기록은 기간과 상관없이 다 읽는다. 2분할 비교가 예전 폼과
         * 지금을 견주는 기능이라, 오래된 영상이 목록에서 빠지면 뜻이 없어진다.
         * 영상은 한 기록에 최대 2개고 올리는 사람이 많지 않아 건수가 작다.
         */
        OR: [{ date: { gte: initialFrom } }, { NOT: { videoPaths: { isEmpty: true } } }],
      },
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
      loadedFrom={initialFrom.toISOString().slice(0, 7)}
    />
  );
}
