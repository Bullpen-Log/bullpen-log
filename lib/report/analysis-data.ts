import 'server-only';
import { appNow } from '@/lib/clock';
import { zonedNoon } from '@/lib/time-zone';
import { prisma } from '@/lib/prisma';
import type { requireUser } from '@/lib/dal';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { trainingLoad } from '@/lib/report/training-acwr';
import { armCareMissingOf, trainingReview, type TrainingReview } from '@/lib/report/training-review';
import { loadGoodDays } from '@/lib/report/good-days-load';
import type { GoodDayResult } from '@/lib/report/good-days';
import { loadHighlights } from '@/lib/report/highlights-load';
import type { Highlight } from '@/lib/report/highlights';
import { loadTodayCore } from '@/lib/report/today-data';
import { trainingSummaries } from '@/lib/report/training-history';
import { analysisOverviewOf, type AnalysisOverview } from '@/lib/report/analysis-overview';
import { ANALYSIS_METRICS, daysOf, trendValues, type MetricKey } from '@/lib/report/trends';

/**
 * 분석 화면(투구 분석 · 트레이닝 분석)의 카드 재료 — 웹(app/(app)/today/analysis-view.tsx)과 아이폰 앱(app/actions/app-analysis.ts →
 * native/src/app/analysis.tsx)이 같은 함수로 읽는다. 둘이 따로 읽으면 같은 날의 부하 지수가 두 화면에서 달라진다(2026-10-18).
 * 'use server' 파일에 두지 않는다 — user 를 받는 함수가 거기 있으면 누구나 부를 수 있는 입구가 된다.
 */

type AnalysisUser = Awaited<ReturnType<typeof requireUser>>;
export type AnalysisKind = 'pitch' | 'training';

/**
 * 투구 칸이 읽어 오는 기간(일) — 최근 7일·직전 7일(14일), 28일 추이,
 * 기간별 돌아보기 30일 비교(60일)에 여유를 둔 값.
 */
const LOOKBACK_DAYS = 70;

/** DB 의 날짜 칸(@db.Date)과 견줄 값 */
const dbDay = (key: string) => new Date(`${key}T00:00:00.000Z`);

/**
 * 그날 정오(기기 시간대, lib/time-zone.ts). 부하·돌아보기 함수들이 받는 '오늘'이다 — toDateKey 가 그날로 읽고,
 * 시간대가 조금 어긋나도 날짜가 넘어가지 않는 한가운데.
 */
const noonOf = (key: string) => zonedNoon(key);

export type AnalysisCards = {
  /** 하이라이트 — 이 칸 것만, 오늘 분석일 때만. 분석 화면 자신을 가리키는 주소는 뺐다 */
  highlights: Highlight[];
  overview: AnalysisOverview;
  /** 트레이닝 칸만 — 최근 4주 */
  review: TrainingReview | null;
  armCareMissing: boolean;
  /** 투구 칸만 — 잘 던진 날 */
  goodDays: GoodDayResult | null;
};

/**
 * 부하와 추이 — 그날(date)까지의 기록으로 셈한다.
 *
 * 투구: 하이라이트 · 부하 지수 · 이번 주 · 마지막 투구 · 개인 최고 구속 · 잘 던진 날.
 * 트레이닝: 하이라이트 · 운동 부하 지수 · 최근 4주.
 */
export async function loadAnalysisCards(
  user: AnalysisUser,
  date: string,
  today: string,
  tab: AnalysisKind
): Promise<AnalysisCards> {
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
     * 부하 지수는 홈과 같은 셈(loadTodayCore)이라 숫자가 같다.
     */
    date === today
      ? loadTodayCore(user, appNow()).then((core) =>
          loadHighlights(user.id, today, core.facts, tab)
        )
      : null,
  ]);

  const overview = analysisOverviewOf({
    bestVelocity:
      best?.maxVelocity != null ? { value: best.maxVelocity, date: toDateKey(best.date) } : null,
    logs: logs.map((l) => ({
      date: l.date.toISOString(),
      sessionType: l.sessionType,
      pitchCount: l.pitchCount,
      intensity: l.intensity,
      /* 체감 강도(%) — 개요가 groupByDay(intensityOf)로 읽는다. 빼면 85% 가 9(90%)로 보이고 셈해진다 */
      effortPct: l.effortPct,
      maxVelocity: l.maxVelocity,
      avgVelocity: l.avgVelocity,
    })),
    training,
    user,
    today: asOf,
    totalRecords: logs.length,
  });

  return {
    /* 분석 화면 자신을 가리키는 주소는 뺀다 */
    highlights: (highlights?.items ?? []).map((h) =>
      h.href?.startsWith('/coach') ? { ...h, href: null } : h
    ),
    overview,
    review,
    armCareMissing: review ? armCareMissingOf(review.totals) : false,
    goodDays,
  };
}

/**
 * 그래프가 읽는 기간 — 12주 + 견줄 앞 12주. 앱은 4주 · 12주만 고른다(웹의 '기간 설정'은 아직 없다), 그 둘의 앞 기간까지 덮는다.
 */
const SERIES_DAYS = 168;

/** 앱 분석 화면 한 장 — 카드 + 그래프 재료 */
export type AppAnalysis = AnalysisCards & {
  view: AnalysisKind;
  date: string;
  today: string;
  /** 그래프 재료 — 지표마다 날짜 → 값(값이 있는 날만, 웹 HomeTrends 와 같은 trendValues). from 부터 오늘까지 */
  series: { from: string; values: Partial<Record<MetricKey, Record<string, number>>> };
};

export async function loadAppAnalysisData(
  user: AnalysisUser,
  view: AnalysisKind,
  date: string,
  today: string
): Promise<AppAnalysis> {
  const from = shiftDateKey(today, -(SERIES_DAYS - 1));
  const [cards, logs, trainingByDay] = await Promise.all([
    loadAnalysisCards(user, date, today, view),
    view === 'pitch'
      ? prisma.pitchLog.findMany({
          where: { userId: user.id, date: { gte: dbDay(from) } },
          select: { date: true, pitchCount: true, maxVelocity: true },
        })
      : [],
    /* 웹 그래프와 같은 운동 요약(홈 캘린더가 칠하는 그날 마친 운동 수) */
    view === 'training' ? trainingSummaries(user.id) : undefined,
  ]);

  const valueOf = trendValues({
    logs: logs.map((l) => ({ ...l, date: l.date.toISOString() })),
    trainingByDay,
  });
  const values: AppAnalysis['series']['values'] = {};
  for (const key of ANALYSIS_METRICS[view]) {
    const byDay: Record<string, number> = {};
    for (const day of daysOf({ from, to: today })) {
      const v = valueOf(key, day);
      if (v != null) byDay[day] = v;
    }
    values[key] = byDay;
  }

  return { ...cards, view, date, today, series: { from, values } };
}
