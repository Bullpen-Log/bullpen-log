import 'server-only';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import type { requireUser } from '@/lib/dal';
import { loadDayDetailCached } from '@/lib/day-detail';
import { SETUP_PATH } from '@/lib/feature-locks';
import type { Advice } from '@/lib/nutrition/advice';
import { loadAdvice } from '@/lib/nutrition/advice-load';
import { serviceHour } from '@/lib/nutrition/advice-input';
import { dbDate } from '@/lib/nutrition/days';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { CHECKIN_PARTS } from '@/lib/checkin';
import { loadTodayCoreCached } from '@/lib/report/today-data';
import { loadHighlights } from '@/lib/report/highlights-load';
import { buildFeedItems, type FeedItem } from '@/lib/report/feed-items';

/**
 * 홈 맨 위 두 카드의 숫자(서버) — 링 넷(체크인 · 투구 · 운동 · 영양)과 요약 칸('뉴스') 장들. 웹 홈(app/(app)/today/today-rings.tsx ·
 * feed.tsx)과 아이폰 앱 홈(native/, /api/rpc/app.loadAppHome)이 같은 값을 그린다 — 그리기만 따로.
 * 무거운 오늘 셈 · 그날 요약은 한 요청에 한 번(loadTodayCoreCached · loadDayDetailCached — 같은 user 객체면 처음 것).
 */
type HomeUser = Awaited<ReturnType<typeof requireUser>>;

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다 */
function now() {
  return appNow();
}

/** 링 하나 — value 0~1(넘쳐도 한 바퀴), href 가 없으면 체크인 흐름을 연다 */
export type HomeRing = {
  key: 'checkin' | 'pitch' | 'training' | 'nutrition';
  label: string;
  value: number;
  /** 링 밑 한 줄 — '42구' · '3/6' · '남기기'(화면 읽기 글) */
  caption: string;
  href?: string;
};

/**
 * 링 셋 — 체크인 · 투구는 했나 안 했나, 운동은 오늘 일정 가운데 체크한 수. 투구 기록이 잠겨 있으면 투구 링은 첫 설정 화면으로.
 * 영양 링은 뺐다(2026-10-21 김민: 홈 개편 — 체크인 · 투구 · 운동 셋). 'nutrition' 키는 옛 앱이 읽을 수 있게 타입에만 남긴다.
 */
export async function loadHomeRings(
  user: HomeUser,
  today: string,
  pitchLocked: boolean
): Promise<{ items: HomeRing[]; checkinDone: boolean; pitchDone: boolean }> {
  const [detail, logs] = await Promise.all([
    loadDayDetailCached(user, today),
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: dbDate(today) },
      select: { sessionType: true, pitchCount: true },
    }),
  ]);

  const exercises = detail.training.exercises;
  const doneCount = exercises.filter((e) => e.done).length;
  const rested =
    logs.length > 0 && logs.every((l) => l.sessionType === REST_SESSION_TYPE);
  const pitches = logs.reduce((n, l) => n + l.pitchCount, 0);

  const items: HomeRing[] = [
    {
      key: 'checkin',
      label: '체크인',
      value: detail.checkin ? 1 : 0,
      caption: detail.checkin ? `컨디션 ${detail.checkin.condition}` : '남기기',
    },
    {
      key: 'pitch',
      label: '투구',
      value: logs.length > 0 ? 1 : 0,
      caption:
        logs.length === 0
          ? pitchLocked
            ? '설정하기'
            : '남기기'
          : rested
            ? '휴식'
            : `${pitches}구`,
      href: pitchLocked ? SETUP_PATH.pitch : `/pitch-log/${today}`,
    },
    {
      key: 'training',
      label: '운동',
      value: exercises.length > 0 ? doneCount / exercises.length : 0,
      caption: exercises.length > 0 ? `${doneCount}/${exercises.length}` : '일정 없음',
      href: '/training',
    },
  ];

  /* pitchDone — 오늘 투구 기록이 한 줄이라도(쉰 날 줄 포함) 있나: 앱 위 막대 알림 종의 '오늘 할 일'(웹 종과 같은 판정) */
  return { items, checkinDone: detail.checkin != null, pitchDone: logs.length > 0 };
}

/** 요약 칸 장들 — 장을 만드는 셈은 lib/report/feed-items.ts(순수), 여기는 재료를 모은다 */
export async function loadHomeFeed(user: HomeUser, today: string): Promise<FeedItem[]> {
  const corePending = loadTodayCoreCached(user);
  const [core, { items: highlights, input, extra }, advice, detail, weekMeals] =
    await Promise.all([
      corePending,
      loadHighlights(
        user.id,
        today,
        corePending.then((c) => c.facts)
      ),
      loadAdvice(user, today, today, serviceHour(now())),
      /* 오늘 먹은 kcal · 목표 — 홈 링과 같은 그날 요약(한 요청에 한 번) */
      loadDayDetailCached(user, today),
      /* 최근 7일(오늘 뺌)의 식사 — 오늘 안 적은 날의 '지난 기록' 장 */
      prisma.mealEntry.findMany({
        where: {
          userId: user.id,
          date: { gte: dbDate(shiftDateKey(today, -7)), lt: dbDate(today) },
        },
        select: { date: true, kcal: true, amount: true, meal: true },
      }),
    ]);

  /*
   * 평균은 두 끼 이상 적은 날만 — 간식 하나만 적은 날까지 넣으면 '7일 평균 400kcal · 목표의 15%'가 떴다(2026-10-16 베타 100명).
   */
  const byDay = new Map<string, { kcal: number; meals: Set<string> }>();
  for (const m of weekMeals) {
    const k = toDateKey(m.date);
    const d = byDay.get(k) ?? { kcal: 0, meals: new Set<string>() };
    /* kcal 은 1인분 값 — 먹은 양(amount)을 곱한다(lib/nutrition/load.ts 와 같은 셈, 2026-10-17 김민 발견) */
    d.kcal += m.kcal * m.amount;
    d.meals.add(m.meal);
    byDay.set(k, d);
  }
  const fullDays = [...byDay.values()].filter((d) => d.meals.size >= 2);
  const week =
    fullDays.length > 0
      ? {
          avgKcal: fullDays.reduce((a, d) => a + d.kcal, 0) / fullDays.length,
          days: fullDays.length,
        }
      : null;

  const plan = core.savedPlan;
  const facts = core.facts;
  const partLabel = new Map<string, string>(CHECKIN_PARTS.map((p) => [p.key, p.label]));
  const items = buildFeedItems({
    ...input,
    ...extra,
    lastOutingAdjusted: facts.patterns.lastOutingAdjusted,
    missingDays: facts.patterns.missingDays,
    age: facts.profile.age,
    usualCondition: facts.condition.usualCondition?.median ?? null,
    painRecentParts: (facts.condition.painRecentParts ?? [])
      .map((k) => partLabel.get(k))
      .filter((l): l is string => l != null),
    painToday: facts.condition.painToday,
    workout:
      plan && !core.picked.halted
        ? {
            label: plan.program ? plan.program.label : plan.theme.label,
            minutes: core.shownMinutes,
            done: core.doneIds.size,
            total: core.shownPicks.length,
            goal: plan.goal ?? null,
            programDay: plan.program?.day ?? null,
            leftMinutes: core.leftMinutes,
          }
        : null,
    nutrition: {
      score: advice.score,
      headline: advice.headline,
      parts: macroParts(advice),
      todayKcal: detail.nutrition.kcal,
      targetKcal: detail.nutrition.target.kcal,
      protein: detail.nutrition.protein,
      targetProtein: detail.nutrition.target.protein,
      mealsToday: detail.nutrition.meals.filter((m) => m.kcal > 0).length,
      week,
    },
    highlights,
  });

  return items;
}

const MACROS = [
  ['carbs', '탄수화물'],
  ['protein', '단백질'],
  ['fat', '지방'],
] as const;

/** 영양 장의 밑줄 — 탄 · 단 · 지(더 먹을 양 · 충분 · 자료가 없으면 권하는 범위) */
function macroParts(a: Advice): string[] {
  return MACROS.map(([key, label]) => {
    if (a.more) {
      const v = a.more[key];
      if (v <= 0) return `${label} 충분`;
      return `${label} ${a.more.basis === 'estimate' ? '약 ' : ''}+${v}g`;
    }
    return `${label} ${a.range[key].lo}~${a.range[key].hi}g`;
  });
}
