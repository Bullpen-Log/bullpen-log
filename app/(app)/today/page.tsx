import { Suspense } from 'react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { loadTodayCore } from '@/lib/report/today-data';
import { hasPain, pickCheckinParts } from '@/lib/checkin';
import { toDateKey } from '@/lib/pitch-stats';
import { Card, PageHeading } from '@/components/ui';
import { Skeleton } from '@/components/fallback';
import { trainingLoad } from '@/lib/report/training-acwr';
import { planSummaries, trainingSummaries } from '@/lib/report/training-history';
import { SummaryPanel, type RecentLog } from './summary-panel';
import { PitchLogPanel } from './pitch-log-panel';
import { AnalysisSkeleton } from './analysis-block';
import { AnalysisView } from './analysis-view';
import { readAnalysisTab, type AnalysisTab } from './analysis-tabs';

/**
 * 홈 — 오늘 남길 것.
 *
 * 예전에는 이 화면 하나가 체크인·투구 기록·운동 목록·근거 패널을 다 들고 있었다.
 * 631줄이었고, 운동 하나를 체크하려면 스크롤을 한참 내려야 했다.
 *
 * '남기는 것'과 '하는 것'으로 갈랐다. 실제 운동 목록과 체크는 트레이닝으로 옮겼다.
 *
 * 한동안 여기 '오늘 할 일' 상자 넷(체크인·투구·운동 일정·트레이닝 설정)이 있었다.
 * 그 할 일은 오른쪽 위 알림(종)으로 옮겼다 — 홈에서만 보이던 것이 어느 화면에서나
 * 보이고, 다 한 날에는 홈이 캘린더와 돌아보기만 남아 가벼워진다.
 */

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function now() {
  return new Date();
}

/**
 * 기다리는 동안 자리를 잡아 두는 모양.
 *
 * 화면과 같은 틀을 쓴다 — 돌아보기의 요약 칸 셋. 예전에는 모든 화면이 같은 회색
 * 덩어리 하나를 썼는데, 내용이 도착할 때 크게 튀었다.
 */
function TodaySkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">오늘 기록을 불러오는 중입니다</span>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * 제목은 곧바로, 나머지는 뒤따라.
 *
 * 예전에는 이 함수가 13번의 DB 조회를 모두 기다린 뒤에야 무언가를 내보냈다.
 * 재보니 누른 뒤 340ms 동안 회색 덩어리만 보였다(로컬 기준, 배포본은 여기에
 * 네트워크가 더 붙는다). 그 사이 화면에 진짜인 것은 하나도 없었다.
 *
 * 사용자는 레이아웃이 이미 읽어 둔 것이라(lib/dal.ts 의 cache) 이 await 는
 * DB 를 안 간다. 그래서 제목과 달력 · 돌아보기의 자리는 기다릴 것 없이 바로 나간다.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  // 그날 화면에서 '달력으로 돌아가기'로 들어오면 그 날짜를 짚어 둔다.
  const initialDate = readDateParam(params.date);
  // 예전 분석 탭 주소(/coach?view=…)로 들어오면 분석 칸의 그 칸을 편다
  const analysisTab = readAnalysisTab(params.analysis);

  return (
    <div className="space-y-6">
      {/*
        제목 — 다른 탭과 같은 모양(영어 이름표 + 한국어 제목).

        예전에는 제목이 '○○님, 오늘도 던져볼까요'였고 밑에 안내 한 줄이 더 있었다.
        매일 여는 화면에서 같은 인사를 읽을 까닭이 없어 인사와 안내는 뺐다. 제목은
        loading.tsx 도 똑같이 그려, 불러오는 동안과 다 온 뒤에 자리가 바뀌지 않는다.
      */}
      <PageHeading eyebrow="Home" title="홈" />

      {/*
        달력이 맨 앞이다.

        예전에는 '투구 일지'라는 탭이 따로 있었고 홈에는 오늘 것만 있었다.
        그런데 매일 하는 일은 결국 하나인데 두 화면에 갈라져 있어서, 하루를
        마치려면 오가야 했다. 달력을 여기로 올리고 탭을 없앴다.

        아래의 '돌아보기'와 Suspense 를 따로 두는 이유: 달력은 기록 한 번만
        읽으면 그려지지만 아래는 오늘 계획·부하를 셈하느라 여러 번 조회한다. 한
        울타리에 두면 달력이 다 준비되고도 아래를 기다리느라 같이 회색으로 남는다.
      */}
      <Suspense fallback={<Skeleton className="h-[26rem] rounded-2xl" />}>
        <PitchLogSection
          user={user}
          initialDate={initialDate}
          analysisTab={analysisTab}
        />
      </Suspense>

      <Suspense fallback={<TodaySkeleton />}>
        <TodayBody user={user} />
      </Suspense>
    </div>
  );
}

/** 처음에 읽어 올 개월 수. 이보다 옛날 달은 넘길 때 그 달만 받아 온다. */
const INITIAL_MONTHS = 13;

/** ?date=2026-08-04 처럼 넘어온 값만 받는다. 형식이 아니면 무시하고 오늘로 연다. */
function readDateParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * 달력에 칠할 기록을 읽어 온다.
 *
 * 예전에는 가입 이래 모든 기록을 한 번에 읽었다. 지금은 수십 건이라 순식간이지만,
 * 매일 남기는 선수라면 3년에 천 건이 넘는다. 달력은 한 번에 한 달만 보여주므로
 * 그만큼만 있으면 된다.
 *
 * 그렇다고 한 달만 읽으면 달을 넘길 때마다 화면이 비었다 채워진다. 열세 달을
 * 읽어 두면 이번 시즌과 작년 같은 시기까지는 넘겨도 끊기지 않고, 그보다 옛날로
 * 가면 그때 그 달만 받아 온다(/api/pitch-log).
 */
async function PitchLogSection({
  user,
  initialDate,
  analysisTab,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  initialDate: string | null;
  analysisTab: AnalysisTab;
}) {
  const now = new Date();

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

  /*
   * 운동 요약을 함께 읽는다.
   *
   * 날짜를 누르면 달력 밑에 그날 요약이 뜨는데, 투구만 있고 운동이 없으면
   * 반쪽이다. 하루에 한 줄(개수·강도·메모 여부)뿐이라 groupBy 두 번이면 되고,
   * 트레이닝 화면이 쓰는 것과 같은 함수다 — 같은 날의 숫자가 화면마다 다르면
   * 안 된다.
   *
   * 눌렀을 때 그때그때 받아 오는 방법도 있었지만, 날짜를 옮길 때마다 기다리게
   * 된다. 달력은 이 칸 저 칸 눌러보며 훑는 물건이라 그 기다림이 계속 쌓인다.
   *
   * 그날 만든 운동 일정의 테마도 같은 까닭으로 함께 읽는다(하루 한 줄로 줄여서).
   *
   * 영상 탭에서 고른 그날의 대표 영상도 읽는다 — 요약에서 그 영상을 튼다. 같은 날
   * 기록은 남긴 차례로 둔다(createdAt). 대표를 안 고른 날은 그날 처음 올린 영상을
   * 보여주는데, 차례가 없으면 열 때마다 바뀔 수 있다.
   */
  /*
   * 달력 옆 '그날' 칸이 투구·운동 말고도 영양·컨디션·리포트까지 한 번에 보여 준다.
   * 날짜를 누를 때마다 받아 오면 칸을 옮길 때마다 기다리므로 여기서 같이 읽는다.
   * 모두 하루 한 줄로 줄여서 넘긴다(영양은 칼로리·단백질 합, 체크인은 컨디션·통증).
   */
  const [logs, training, plans, featured, meals, checkins, reports] = await Promise.all(
    [
      prisma.pitchLog.findMany({
        where: { userId: user.id, date: { gte: initialFrom } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      trainingSummaries(user.id),
      planSummaries(user.id),
      prisma.dailyFeaturedVideo.findMany({
        where: { userId: user.id, date: { gte: initialFrom } },
        select: { date: true, videoPath: true },
      }),
      prisma.mealEntry.findMany({
        where: { userId: user.id, date: { gte: initialFrom } },
        select: { date: true, kcal: true, protein: true, amount: true },
      }),
      prisma.dailyCheckin.findMany({
        where: { userId: user.id, date: { gte: initialFrom } },
        select: {
          date: true,
          condition: true,
          shoulder: true,
          elbow: true,
          wrist: true,
          lowerBack: true,
          lowerBody: true,
        },
      }),
      prisma.aiReport.findMany({
        where: { userId: user.id, asOf: { gte: initialFrom } },
        select: { asOf: true },
      }),
    ]
  );

  const nutritionByDay: Record<string, { kcal: number; protein: number }> = {};
  for (const m of meals) {
    const key = toDateKey(m.date);
    const day = (nutritionByDay[key] ??= { kcal: 0, protein: 0 });
    day.kcal += m.kcal * m.amount;
    day.protein += (m.protein ?? 0) * m.amount;
  }
  for (const day of Object.values(nutritionByDay)) {
    day.kcal = Math.round(day.kcal);
    day.protein = Math.round(day.protein);
  }

  /*
   * 그날의 수치·영상·폼 분석은 여기서 안 읽는다. 날짜를 누르면
   * /pitch-log/<날짜> 가 그날 것만 따로 읽는다 — 달력은 어느 날 얼마나
   * 던졌는지만 칠하면 된다.
   */
  // Date 객체는 클라이언트로 그대로 넘길 수 없어 문자열로 바꿔 전달한다.
  const initialLogs = logs.map((log) => ({
    ...log,
    date: log.date.toISOString(),
  }));

  return (
    <PitchLogPanel
      today={toDateKey(now)}
      initialLogs={initialLogs}
      initialDate={initialDate}
      loadedFrom={initialFrom.toISOString().slice(0, 7)}
      trainingByDay={training}
      planByDay={plans}
      featuredByDay={Object.fromEntries(
        featured.map((f) => [toDateKey(f.date), f.videoPath])
      )}
      nutritionByDay={nutritionByDay}
      checkinByDay={Object.fromEntries(
        checkins.map((c) => [
          toDateKey(c.date),
          { condition: c.condition, pain: hasPain(pickCheckinParts(c)) },
        ])
      )}
      reportDays={reports.map((r) => toDateKey(r.asOf))}
      /*
        오늘의 리포트 — 캘린더 밑 분석 칸이 처음 보여 주는 것. 따로 기다리게 둔다
        (Suspense): 캘린더는 이것을 기다리지 않고 먼저 그려진다. 리포트를 만들면
        서버가 홈을 새로 그리며 이것도 새것으로 온다.
      */
      analysisSlot={
        <Suspense fallback={<AnalysisSkeleton />}>
          <AnalysisView
            user={user}
            date={toDateKey(now)}
            today={toDateKey(now)}
            tab="report"
          />
        </Suspense>
      }
      initialAnalysisTab={analysisTab}
    />
  );
}

/** 자료가 다 모여야 그릴 수 있는 부분 — 알림 두 장과 '돌아보기' */
async function TodayBody({ user }: { user: Awaited<ReturnType<typeof requireUser>> }) {
  const today = now();

  /*
   * 예전에는 여기서 '오늘 할 일' 상자 넷(체크인·투구·운동 일정·트레이닝 설정)을 그렸다.
   * 그 할 일은 오른쪽 위 알림(종)으로 옮겼다(components/notice-bell.tsx) — 어느 화면에서나
   * 보이고, 다 한 날에는 홈을 비워 준다. 운동 일정은 트레이닝 탭, 트레이닝 설정은 설정
   * 창에 있다. 그 상자만 쓰던 조회(오늘 투구 한 건·체크인 열흘·7일 막대·폼 분석 등)도 뺐다.
   */
  const [core, training, recentLogs] = await Promise.all([
    loadTodayCore(user, today),
    /*
     * 요약 칸에 쓸 것 둘.
     *
     * 운동 부하는 분석 칸과 같은 계산기를 쓴다 — 같은 이름의 값이 화면마다
     * 다르면 안 된다.
     */
    trainingLoad(user, today),
    /*
     * 최근 기록 몇 건 — 요약 칸에 "마지막으로 뭘 했나"로 쓴다.
     *
     * 기간을 걸지 않는다. 두 주로 잘랐더니 한 달 쉰 사람에게는 빈칸이 됐는데,
     * 그 사람에게야말로 마지막이 언제였는지가 필요하다.
     */
    prisma.pitchLog.findMany({
      where: { userId: user.id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 4,
      select: {
        id: true,
        date: true,
        sessionType: true,
        pitchCount: true,
        intensity: true,
      },
    }),
  ]);
  const { facts, plan, picked } = core;

  const summaryRecent: RecentLog[] = recentLogs.map((l) => ({
    id: l.id,
    date: l.date.toISOString().slice(0, 10),
    sessionType: l.sessionType,
    pitchCount: l.pitchCount,
    intensity: l.intensity,
  }));

  return (
    <>
      {/*
        최근 메모에 통증 같은 표현이 있었던 경우.
        알림 창에 넣기에는 긴 이야기라, 홈에 그대로 둔다.
      */}
      {plan.needsPainCheck && !picked.halted && (
        <Card className="space-y-2 border-warn-line bg-warn-bg py-4">
          <p className="text-sm font-bold text-warn">지금 통증이 있으신가요?</p>
          <p className="text-sm leading-relaxed text-warn">
            최근 투구 일지 메모에{' '}
            <strong>{facts.condition.painWordsInMemo.join(', ')}</strong> 같은 표현이
            있었습니다. 실제로 통증이 있는지 알 수 없어, 확인될 때까지 투구는 휴식으로
            두고 운동은 회복·가동성 수준만 골랐습니다.
          </p>
          <p className="text-sm leading-relaxed text-warn">
            통증이 있다면 던지지 말고 전문의와 상담하세요. 통증이 아니라면 오른쪽 위
            알림(종)에서 오늘 체크인을 남겨주시면 바로 평소 계획으로 돌아갑니다.
          </p>
        </Card>
      )}

      {/* 최근 체크인에 통증이 있었던 경우. */}
      {plan.recovering && !plan.needsPainCheck && !picked.halted && (
        <Card className="space-y-1 border-warn-line bg-warn-bg py-4">
          <p className="text-sm font-bold text-warn">회복 수준으로 낮춰 배정했습니다</p>
          <p className="text-sm leading-relaxed text-warn">
            최근 체크인에 통증 기록이 있어, 오늘은 무게를 다루는 운동을 빼고 회복·가동성
            운동만 골랐습니다. 통증이 다시 느껴지면 오른쪽 위 알림(종)에서 오늘 체크인에
            그대로 남겨주세요.
          </p>
        </Card>
      )}

      {/*
        처음 온 사람에게 어디부터인지 알려준다.

        무엇을 먼저 해야 하는지는 알림(종)이 알려 주지만, 처음 온 사람은 종이 있는
        줄 모른다. 투구 기록이 하나도 없을 때만 낸다. 한 번이라도 남긴 사람에게는
        잔소리가 되고, 매일 뜨는 안내는 곧 안 읽게 된다.
      */}
      {!core.hasLogs && (
        <div className="rounded-2xl border border-sky-soft/60 bg-sky-tint px-5 py-4">
          <p className="text-sm font-bold text-sky-strong">여기부터 시작하세요</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink/80">
            오른쪽 위 <strong className="text-ink">알림(종)</strong>을 눌러{' '}
            <strong className="text-ink">오늘 투구</strong>를 먼저 남겨주세요. 던진 양을
            알아야 부하를 재고 무리가 안 되는 운동을 고를 수 있습니다. 오늘 안
            던지셨다면 <strong className="text-ink">‘오늘 안 던졌어요’</strong>를
            눌러주시면 됩니다.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-heading px-1 text-xl text-ink">돌아보기</h2>
        <SummaryPanel
          pitching={{
            ratio: facts.load.ratio,
            zone: facts.load.zone,
            waiting: core.hasLogs ? '기록을 쌓는 중' : '기록하면 나옵니다',
          }}
          training={{
            ratio: training.ratio,
            zone: training.zone,
            waiting:
              training.historyDays > 0 ? '기록을 쌓는 중' : '운동을 체크하면 나옵니다',
          }}
          week={{
            pitches: facts.volume.current.totalPitches,
            throwDays: facts.volume.current.activeDays,
            workoutDays: training.recentDays,
            workoutMinutes: training.recentMinutes,
          }}
          recent={summaryRecent}
        />
      </div>
    </>
  );
}
