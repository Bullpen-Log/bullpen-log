import 'server-only';
import { prisma } from '@/lib/prisma';
import { hasPain, pickCheckinParts } from '@/lib/checkin';
import { toDateKey } from '@/lib/pitch-stats';
import { planSummaries, trainingSummaries } from '@/lib/report/training-history';
import { loadVelocityByDate } from '@/lib/velocity-load';

/**
 * 지난 기록 열세 달 — 홈 캘린더(page.tsx)와 분석 · 그래프 화면(/coach)이 같이 쓴다.
 *
 * 둘이 따로 읽으면 같은 날의 숫자가 화면마다 달라질 수 있어 한 함수에 둔다(2026-10-05 홈 정리 때 그래프가 /coach 로
 * 옮겨 가며 page.tsx 의 PitchLogSection 에서 떼어 냈다).
 *
 * 예전에는 가입 이래 모든 기록을 한 번에 읽었다. 달력은 한 번에 한 달만 보여 주지만 한 달만 읽으면 달을 넘길 때마다
 * 화면이 비었다 채워진다. 열세 달을 읽어 두면 이번 시즌과 작년 같은 시기까지는 끊기지 않고, 그보다 옛날 달은 그때
 * 그 달만 받아 온다(/api/pitch-log).
 *
 * 그날 칸이 투구 · 운동 말고도 영양 · 컨디션 · 리포트까지 한 번에 보여 주므로 모두 하루 한 줄로 줄여 같이 읽는다 —
 * 날짜를 누를 때마다 받아 오면 칸을 옮길 때마다 기다린다.
 */
export async function loadPitchHistory(user: { id: string }) {
  const now = new Date();
  /*
   * 달의 1일로 맞춘다. 그냥 13개월을 빼면 시작점이 달 중간이 되어 그 달은 절반만 읽히는데, 화면은 '읽은 달'로
   * 세므로 그 달 앞쪽 기록이 조용히 빠진다(7월 26일 기록이 달력에서 사라진 적이 있다).
   */
  const initialFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - INITIAL_MONTHS, 1)
  );

  const [
    logs,
    training,
    plans,
    featured,
    meals,
    checkins,
    dailyWeights,
    velocityByDay,
  ] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: { gte: initialFrom } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    }),
    trainingSummaries(user.id),
    planSummaries(user.id),
    /* 영상 탭에서 고른 그날의 대표 영상 — 그날 요약에서 그 영상을 튼다 */
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
        /* 그래프의 체중 */
        bodyWeightKg: true,
      },
    }),
    /* 영양 탭에 적은 체중 — 그래프의 체중 */
    prisma.dailyNutrition.findMany({
      where: { userId: user.id, date: { gte: initialFrom }, weightKg: { not: null } },
      select: { date: true, weightKg: true },
    }),
    /* 카메라로 잰 공 — 그날 칸의 투구 · 영상 아이콘(공 수 · 최고 · 영상 수) */
    loadVelocityByDate(user.id, initialFrom),
  ]);

  /* 체중 — 체크인에 적은 것 위에 영양 탭에 적은 것을 덮는다(영양 탭과 같은 차례) */
  const weightByDay: Record<string, number> = {};
  for (const c of checkins) {
    if (c.bodyWeightKg != null) weightByDay[toDateKey(c.date)] = c.bodyWeightKg;
  }
  for (const d of dailyWeights) {
    if (d.weightKg != null) weightByDay[toDateKey(d.date)] = d.weightKg;
  }

  const nutritionByDay: Record<string, { kcal: number; protein: number }> = {};
  for (const m of meals) {
    const day = (nutritionByDay[toDateKey(m.date)] ??= { kcal: 0, protein: 0 });
    day.kcal += m.kcal * m.amount;
    day.protein += (m.protein ?? 0) * m.amount;
  }
  for (const day of Object.values(nutritionByDay)) {
    day.kcal = Math.round(day.kcal);
    day.protein = Math.round(day.protein);
  }

  return {
    /** 처음 받아 온 가장 오래된 달(YYYY-MM) — 이보다 옛날 달은 넘길 때 받아 온다 */
    loadedFrom: initialFrom.toISOString().slice(0, 7),
    /* Date 객체는 화면 쪽으로 그대로 못 넘겨 문자열로 */
    logs: logs.map((log) => ({ ...log, date: log.date.toISOString() })),
    training,
    plans,
    featuredByDay: Object.fromEntries(
      featured.map((f) => [toDateKey(f.date), f.videoPath])
    ),
    nutritionByDay,
    velocityByDay,
    checkinByDay: Object.fromEntries(
      checkins.map((c) => [
        toDateKey(c.date),
        { condition: c.condition, pain: hasPain(pickCheckinParts(c)) },
      ])
    ),
    weightByDay,
  };
}

/** 처음에 읽어 올 개월 수. 이보다 옛날 달은 넘길 때 그 달만 받아 온다. */
const INITIAL_MONTHS = 13;

/** ?date=2026-08-04 처럼 넘어온 값만 받는다. 형식이 아니면 null(오늘로 연다). */
export function readDateParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
