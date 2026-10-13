import { prisma } from '@/lib/prisma';
import type { requireUser } from '@/lib/dal';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { trainingLoad } from '@/lib/report/training-acwr';
import { REVIEW_WEEKS, trainingReview } from '@/lib/report/training-review';
import { ReportClient } from '@/app/(app)/coach/report-client';
import { StatsOverview } from '@/app/(app)/coach/overview';
import { TrainingReviewCards } from '@/app/(app)/coach/training-review';
import { GoodDaysCard } from '@/app/(app)/coach/good-days';
import { loadGoodDays } from '@/lib/report/good-days-load';
import type { AnalysisTab } from './analysis-tabs';
import { Highlights } from './highlights';
import { loadHighlights } from '@/lib/report/highlights-load';
import { loadTodayCore } from '@/lib/report/today-data';
import { appNow } from '@/lib/clock';

/**
 * 홈 분석 칸의 속 — 고른 날 기준의 분석. 서버에서 그린다.
 *
 * 분석 탭(app/(app)/coach)의 부품을 그대로 쓴다. 다른 것은 기준일이다. 분석 탭은 늘
 * 오늘로 셈했지만, 여기는 캘린더에서 고른 날로 셈한다 — 그날까지의 기록으로, 그날
 * 부하 지수·추이·돌아보기가 어땠는지를 본다.
 *
 * 처음 칸은 coach/page.tsx 가 함께 그려 보내고, 다른 날·칸은 분석 칸이 바꿀 때마다
 * app/actions/analysis.tsx 가 그려 돌려준다.
 */

type User = Awaited<ReturnType<typeof requireUser>>;

/**
 * 투구 칸이 읽어 오는 기간(일). 분석 탭과 같다 — 최근 7일·직전 7일(14일), 28일 추이,
 * 기간별 돌아보기 30일 비교(60일)에 여유를 둔 값.
 */
const LOOKBACK_DAYS = 70;

/** DB 의 날짜 칸(@db.Date)과 견줄 값 */
const dbDay = (key: string) => new Date(`${key}T00:00:00.000Z`);

/**
 * 그날 정오(서울). 부하·돌아보기 함수들이 받는 '오늘'이다 — toDateKey 가 그날로 읽고,
 * 시간대가 조금 어긋나도 날짜가 넘어가지 않는 한가운데.
 */
const noonOf = (key: string) => new Date(`${key}T12:00:00+09:00`);

export async function AnalysisView({
  user,
  date,
  today,
  tab,
}: {
  user: User;
  /** 기준일 (YYYY-MM-DD) */
  date: string;
  today: string;
  tab: AnalysisTab;
}) {
  return <LoadView user={user} date={date} today={today} tab={tab} />;
}

/* ─────────────────────────── 투구 · 트레이닝 ─────────────────────────── */

/**
 * 부하와 추이 — 그날까지의 기록으로 셈한다.
 *
 * 투구: 부하 지수, 이번 주·마지막 투구·개인 최고 구속, 28일 추이, 기간별 기록.
 * 트레이닝: 운동 부하 지수와 4주 돌아보기(부위별 세트).
 */
async function LoadView({
  user,
  date,
  today,
  tab,
}: {
  user: User;
  date: string;
  today: string;
  tab: AnalysisTab;
}) {
  const asOf = noonOf(date);
  const since = shiftDateKey(date, -LOOKBACK_DAYS);

  const [logs, training, best, review, goodDays, highlights] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: { gte: dbDay(since), lte: dbDay(date) } },
      orderBy: { date: 'asc' },
    }),
    trainingLoad(user, asOf),
    /* 개인 최고 구속 — 그날까지의 것 중에서. 전체 기간에서 가장 빠른 줄 하나만 묻는다. */
    prisma.pitchLog.findFirst({
      where: {
        userId: user.id,
        maxVelocity: { not: null },
        date: { lte: dbDay(date) },
      },
      orderBy: { maxVelocity: 'desc' },
      select: { maxVelocity: true, date: true },
    }),
    /* 돌아보기는 트레이닝 칸에서만 — 4주치 운동 기록이라 가볍지 않다 */
    tab === 'training' ? trainingReview(user.id, asOf) : null,
    /* 잘 던진 날은 투구 칸에서만 — 매긴 날이 8일 안 되면 날짜만 센다(lib/report/good-days-load.ts) */
    tab === 'pitch' ? loadGoodDays(user.id, date) : null,
    /*
     * 하이라이트 — 이 칸(투구 · 트레이닝) 것만, 오늘 분석일 때만(2026-10-13 김민: 홈에서 각 카테고리로 옮김 — 두 탭 제목 옆 '분석' 단추로 들어온다).
     * 부하 지수는 홈과 같은 셈(loadTodayCore)이라 숫자가 같다. 분석 화면 자신을 가리키는 주소는 뺀다.
     */
    date === today
      ? loadTodayCore(user, appNow()).then((core) =>
          loadHighlights(user.id, today, { zone: core.facts.load.zone, ratio: core.facts.load.ratio }, tab)
        )
      : null,
  ]);

  const serialized = logs.map((log) => ({ ...log, date: log.date.toISOString() }));

  return (
    <div className="space-y-6">
      {highlights && highlights.items.length > 0 && (
        <Highlights items={highlights.items.map((h) => (h.href?.startsWith('/coach') ? { ...h, href: null } : h))} />
      )}
      <StatsOverview
        view={tab}
        bestVelocity={
          best?.maxVelocity != null
            ? { value: best.maxVelocity, date: toDateKey(best.date) }
            : null
        }
        logs={serialized.map((l) => ({
          date: l.date,
          sessionType: l.sessionType,
          pitchCount: l.pitchCount,
          intensity: l.intensity,
          /* 체감 강도(%) — 개요가 groupByDay(intensityOf)로 읽는다. 빼면 85% 가 9(90%)로 보이고 셈해진다 */
          effortPct: l.effortPct,
          maxVelocity: l.maxVelocity,
          avgVelocity: l.avgVelocity,
        }))}
        training={training}
        user={user}
        today={asOf}
        totalRecords={logs.length}
      />

      {tab === 'training' && review && (
        <TrainingReviewCards review={review} weeks={REVIEW_WEEKS} />
      )}
      {tab === 'pitch' && goodDays && <GoodDaysCard result={goodDays} />}
      {tab === 'pitch' && <ReportClient logs={serialized} today={asOf} />}

      <p className="pb-2 text-center text-[11px] leading-relaxed text-muted/60">
        부하 지수는 훈련량 관리를 돕는 참고 지표예요. 통증이 있다면 수치와 관계없이
        전문의와 상담하세요.
      </p>
    </div>
  );
}
