import { appNow } from '@/lib/clock';
import { cache } from 'react';
import type { requireUser } from '@/lib/dal';
import { loadTodayCore } from '@/lib/report/today-data';
import { loadHighlights } from '@/lib/report/highlights-load';
import type { Advice } from '@/lib/nutrition/advice';
import { loadAdvice } from '@/lib/nutrition/advice-load';
import { serviceHour } from '@/lib/nutrition/advice-input';
import { ACWR_ZONES } from '@/lib/pitch-stats';
import { FeedCard, type FeedItem } from './feed-card';

type HomeUser = Awaited<ReturnType<typeof requireUser>>;

/**
 * 홈 요약 칸의 재료(서버) — 그리기는 feed-card.tsx. 우리끼리 '뉴스'라 부르는 칸이다(화면에는 그 말이 없다).
 *
 * 장의 차례: 하이라이트(평소와 달라진 것 — 안전 → 성장 → 꾸준함, lib/report/highlights.ts, 투구 · 운동 · 홈 몫 모두) → 부하 지수 →
 * 오늘 운동 → 영양 한 줄. 하이라이트는 예전에 캘린더 밑에 따로 있던 것을 여기로 옮겼고(2026-10-13), 영양은 예전 이 자리의 카드
 * (nutrition-card.tsx)를 한 장으로 줄인 것이다 — 할 일 한 줄 + 탄 · 단 · 지 더 먹을 양. 모두 누르면 그 탭으로 간다.
 * 분석 › 투구 · 트레이닝 제목 옆 '분석' 단추에서 보이는 하이라이트(highlights-load.ts 의 part)는 그대로다 — 여기는 모든 몫을 돌린다.
 *
 * 오늘 자료는 한 요청에 한 번만(React cache — 링 · 캘린더 밑 카드가 같은 user 객체로 부른다).
 */
const homeCore = cache((user: HomeUser) => loadTodayCore(user, now()));

export async function Feed({ user, today }: { user: HomeUser; today: string }) {
  const core = await homeCore(user);
  const load = { zone: core.facts.load.zone, ratio: core.facts.load.ratio };
  const [{ items: highlights }, advice] = await Promise.all([
    loadHighlights(user.id, today, load),
    loadAdvice(user, today, today, serviceHour(now())),
  ]);
  const items: FeedItem[] = [];

  for (const h of highlights) {
    items.push({
      key: `hl-${h.key}-${h.label}`,
      label: h.label,
      text: h.text,
      speed: h.speed,
      diff: h.diff,
      href: h.href,
      warn: h.warn,
      chart: h.chart,
      icon:
        h.key === 'training'
          ? 'dumbbell'
          : h.key === 'condition' || h.key === 'streak'
            ? 'shield'
            : 'baseball',
    });
  }

  /*
   * 부하 지수 — 하이라이트가 '달라진 것'만 말하므로 평소에는 안 뜬다. 사용자가 "부하 점수 · 분석 · 그래프 요약도 여기서"라고 해서
   * 늘 한 장 둔다(기록이 있어 지수가 셈해질 때). 누르면 분석 › 투구.
   */
  if (
    load.ratio != null &&
    load.zone != null &&
    !highlights.some((h) => h.key === 'load')
  ) {
    const z = ACWR_ZONES[load.zone];
    items.push({
      key: 'load',
      label: '부하 지수',
      text: `${load.ratio.toFixed(2)} · ${z.label}`,
      sub: z.meaning,
      href: '/coach?view=pitch',
      warn: z.tone === 'warn' || z.tone === 'bad',
      icon: 'gauge',
    });
  }

  /* 오늘 운동 — 일정이 있고 멈춘 날이 아닐 때. 프로그램 날은 프로그램 일차 이름으로 */
  const plan = core.savedPlan;
  if (plan && !core.picked.halted) {
    const done = core.doneIds.size;
    const total = core.shownPicks.length;
    items.push({
      key: 'workout',
      label: '오늘 운동',
      text: plan.program
        ? `${plan.program.label} · ${core.shownMinutes}분`
        : `${plan.theme.label} · ${core.shownMinutes}분`,
      sub:
        total > 0 && done > 0
          ? done >= total
            ? '오늘 운동을 다 마쳤어요'
            : `${total}개 중 ${done}개 했어요`
          : (plan.goal ?? undefined),
      href: '/training',
      icon: 'dumbbell',
    });
  }

  items.push(nutritionItem(advice));

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

/** 영양 한 장 — 할 일 한 줄 + 탄 · 단 · 지(더 먹을 양 · 충분 · 자료가 없으면 권하는 범위) */
function nutritionItem(a: Advice): FeedItem {
  const parts = MACROS.map(([key, label]) => {
    if (a.more) {
      const v = a.more[key];
      if (v <= 0) return `${label} 충분`;
      return `${label} ${a.more.basis === 'estimate' ? '약 ' : ''}+${v}g`;
    }
    return `${label} ${a.range[key].lo}~${a.range[key].hi}g`;
  });
  return {
    key: 'nutrition',
    label: a.score !== null ? `영양 · 균형 ${a.score}` : '영양',
    text: a.headline ?? '오늘 권하는 양이에요',
    sub: parts.join(' · '),
    href: '/nutrition',
    icon: 'utensils',
  };
}
