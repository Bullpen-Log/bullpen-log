import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import type { requireUser } from '@/lib/dal';
import { loadTodayCoreCached } from '@/lib/report/today-data';
import { loadHighlights } from '@/lib/report/highlights-load';
import { loadDayDetailCached } from '@/lib/day-detail';
import type { Advice } from '@/lib/nutrition/advice';
import { loadAdvice } from '@/lib/nutrition/advice-load';
import { serviceHour } from '@/lib/nutrition/advice-input';
import { dbDate } from '@/lib/nutrition/days';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { CHECKIN_PARTS } from '@/lib/checkin';
import { buildFeedItems } from '@/lib/report/feed-items';
import { FeedCard } from './feed-card';

type HomeUser = Awaited<ReturnType<typeof requireUser>>;

/**
 * 홈 요약 칸의 재료(서버) — 그리기는 feed-card.tsx, 장을 만드는 셈은 lib/report/feed-items.ts. 우리끼리 '뉴스'라 부르는 칸이다(화면에는
 * 그 말이 없다).
 *
 * 2026-10-14 부터 장은 늘 여섯(투구량 → 구속 → 부하 지수 → 컨디션 → 운동 → 영양). 오늘 기록이 없으면 지난 기록의 통계 · 그래프를, 아예
 * 없으면 '기록 없음 · 남기러 가기'를 보인다. 하이라이트('달라진 것')는 장을 더하지 않고 그 장의 말을 바꾼다.
 *
 * 오늘 자료는 한 요청에 한 번만(loadTodayCoreCached — 캘린더 밑 카드(page.tsx)와 같은 cache 를 같은 user 객체로 부른다).
 */

export async function Feed({ user, today }: { user: HomeUser; today: string }) {
  /*
   * 오늘 셈(무겁다)과 나머지 재료를 같이 읽는다 — 예전엔 오늘 셈을 다 기다린 뒤에야 하이라이트 · 영양 · 그날 요약을 읽어 왕복이
   * 둘 더 쌓였다(2026-10-15 탭 전환 속도). 하이라이트는 부하 지수만 오늘 셈에서 받고, 재료는 먼저 읽어 둔다.
   */
  const corePending = loadTodayCoreCached(user);
  const [core, { items: highlights, input, extra }, advice, detail, weekMeals] =
    await Promise.all([
      corePending,
      loadHighlights(
        user.id,
        today,
        corePending.then((c) => ({ zone: c.facts.load.zone, ratio: c.facts.load.ratio }))
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
        select: { date: true, kcal: true },
      }),
    ]);

  const byDay = new Map<string, number>();
  for (const m of weekMeals) {
    const k = toDateKey(m.date);
    byDay.set(k, (byDay.get(k) ?? 0) + m.kcal);
  }
  const week =
    byDay.size > 0
      ? {
          avgKcal: [...byDay.values()].reduce((a, b) => a + b, 0) / byDay.size,
          days: byDay.size,
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
    acuteChronic:
      facts.load.ratio != null
        ? { acute: facts.load.acute, chronic: facts.load.chronic }
        : null,
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

  return <FeedCard items={items} />;
}

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다(홈 page.tsx 와 같다) */
function now() {
  return appNow();
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
