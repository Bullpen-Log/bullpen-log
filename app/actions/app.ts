'use server';

import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { appNow } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { dbDate, isNutritionDate, keyOfDbDate } from '@/lib/nutrition/days';
import { prisma } from '@/lib/prisma';
import { sortEvents, type CalendarEventView } from '@/lib/calendar-event';
import { loadNutritionDay } from '@/lib/nutrition/load';
import type { Food, MealEntryView } from '@/lib/nutrition/meta';
import type { PlanContext, PlanItem } from '@/lib/nutrition/meal-plan';
import { toDateKey } from '@/lib/pitch-stats';
import { loadHomeFeed, loadHomeRings, type HomeRing } from '@/lib/report/home-today';
import { loadTodayCoreCached } from '@/lib/report/today-data';
import { armStatusOf, type ArmStatus } from '@/lib/report/arm-status';
import type { FeedItem } from '@/lib/report/feed-items';
import {
  armcareCardData,
  mechanicsCardData,
  workoutCardData,
  type TrainingCard,
} from '@/lib/report/training-home-data';
import { TRAINING_PART_COOKIE, readTrainingPart, type TrainingPart } from '@/lib/training-part';

/**
 * 아이폰 앱(native/)이 화면을 열 때 — 누구인가(폰 영상 경로 `{userId}/local-…` 를 만든다) · 오늘(시험 계정 날짜까지) · 잠긴 탭 · 관리자.
 * /api/rpc/app.loadAppMe 로 부른다.
 */
export async function loadAppMe(): Promise<
  | {
      ok: true;
      userId: string;
      nickname: string;
      isAdmin: boolean;
      today: string;
      locks: { pitch: boolean; training: boolean; nutrition: boolean };
    }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  return {
    ok: true,
    userId: user.id,
    nickname: user.nickname,
    isAdmin: user.role === 'ADMIN',
    today: toDateKey(appNow()),
    locks: featureLocks(user),
  };
}

/**
 * 앱 홈 — 웹 홈(app/(app)/today/home-page.tsx)과 같은 숫자: 링 넷 · 요약 칸 장들(lib/report/home-today.ts) · 캘린더 밑 알림 카드
 * (메모의 통증 말 · 회복만 고른 날 · 첫날의 팔 상태). 그리기는 앱이(native/src/home). 캘린더 · 그날 칸은 투구 기록 API · /api/day-detail.
 */
export async function loadAppHome(): Promise<
  | {
      ok: true;
      today: string;
      rings: HomeRing[];
      checkinDone: boolean;
      feed: FeedItem[];
      /** 최근 투구 메모에 통증 같은 말 — 체크인으로 확인할 때까지 투구는 쉬고 운동은 회복만(웹 홈 맨 위 경고 카드) */
      painWords: string[] | null;
      /** 최근 체크인 통증으로 오늘은 회복 운동만 */
      recovering: boolean;
      /** 투구 기록을 한 번도 안 남긴 사람 — 지금 팔 상태(첫날 카드) */
      firstDay: ArmStatus | null;
      pitchLocked: boolean;
    }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const today = toDateKey(appNow());
  const locks = featureLocks(user);
  const [rings, feed, core] = await Promise.all([
    loadHomeRings(user, today, locks.pitch),
    loadHomeFeed(user, today),
    loadTodayCoreCached(user),
  ]);
  const { plan, picked, facts } = core;
  return {
    ok: true,
    today,
    rings: rings.items,
    checkinDone: rings.checkinDone,
    feed,
    painWords: plan.needsPainCheck && !picked.halted ? facts.condition.painWordsInMemo : null,
    recovering: plan.recovering && !plan.needsPainCheck && !picked.halted,
    firstDay: core.everLogged ? null : armStatusOf(facts),
    pitchLocked: locks.pitch,
  };
}

/**
 * 앱 영양 탭 — 웹 영양 탭과 같은 그날 자료(lib/nutrition/load.ts loadNutritionDay)에서 앱이 그리는 칸만: 목표 · 그날 먹은 것 · 체중 ·
 * 최근 먹은 것 · 내 음식. 담기 · 양 바꾸기 · 지우기 · 체중은 웹과 같은 서버 동작(nutrition.*)을 부른다.
 * 첫 설정 전이면 ok:false + to(웹 첫 설정 화면).
 */
export async function loadAppNutrition(date: string): Promise<
  | {
      ok: true;
      date: string;
      today: string;
      targets: { kcal: number; protein: number; carbs: number; fat: number; burn: number; base: number };
      entries: MealEntryView[];
      weightKg: number | null;
      recent: Food[];
      mine: Food[];
      mfds: boolean;
      /** 그날 짜 둔 식단(먹은 기록과 따로) — 없으면 null */
      mealPlan: { items: PlanItem[]; context: PlanContext } | null;
    }
  | { ok: false; error: string; to?: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (featureLocks(user).nutrition) return { ok: false, error: '영양 첫 설정을 먼저 해 주세요.', to: SETUP_PATH.nutrition };
  if (!isNutritionDate(date)) return { ok: false, error: '날짜가 올바르지 않아요.' };
  const day = await loadNutritionDay(user, date);
  const t = day.targets;
  return {
    ok: true,
    date,
    today: toDateKey(appNow()),
    targets: { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, burn: t.burn, base: t.base },
    entries: day.entries,
    weightKg: day.weightKg,
    recent: day.recent,
    mine: day.mine,
    mfds: day.mfds,
    mealPlan: day.mealPlan,
  };
}

/**
 * 앱 트레이닝 탭 첫 화면 — 웹 트레이닝 홈(app/(app)/training/training-home.tsx)과 같은 앱 카드 셋(lib/report/training-home-data.ts).
 * 카드 하나가 실패해도 나머지는 보인다(웹 SafeCard 와 같다). 마지막으로 쓴 앱(쿠키)이 맨 위.
 */
export async function loadAppTraining(): Promise<
  { ok: true; today: string; cards: TrainingCard[] } | { ok: false; error: string; to?: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (featureLocks(user).training) return { ok: false, error: '트레이닝 첫 설정을 먼저 해 주세요.', to: SETUP_PATH.training };
  const now = appNow();
  const safe = async (app: TrainingPart, job: () => Promise<TrainingCard>): Promise<TrainingCard> => {
    try {
      return await job();
    } catch (err) {
      unstable_rethrow(err);
      console.error(`[앱 트레이닝] ${app} 카드`, err);
      return { app, status: '지금은 불러오지 못했어요. 눌러서 열어 보세요', tone: 'warn', action: null };
    }
  };
  const cards = await Promise.all([
    safe('today', () => workoutCardData(user, now)),
    safe('armcare', () => armcareCardData(user, now)),
    safe('mechanics', () => mechanicsCardData(user.id)),
  ]);
  const last = readTrainingPart((await cookies()).get(TRAINING_PART_COOKIE)?.value);
  if (last) cards.sort((a, b) => Number(b.app === last) - Number(a.app === last));
  return { ok: true, today: toDateKey(now), cards };
}

/**
 * 앱 홈 그날 칸의 일정 — 웹 홈 달력과 같은 범위(내 일정, 관리자는 다른 관리자 일정도 읽기만 — owner 닉네임). 더하기 · 고치기 · 지우기는
 * 웹과 같은 calendar-event.saveCalendarEvent · deleteCalendarEvent.
 */
export async function loadAppDayEvents(
  date: string
): Promise<{ ok: true; events: CalendarEventView[] } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: '날짜가 올바르지 않아요.' };
  const rows = await prisma.calendarEvent.findMany({
    where: {
      date: dbDate(date),
      ...(user.role === 'ADMIN' ? { user: { role: 'ADMIN' } } : { userId: user.id }),
    },
    select: { id: true, date: true, title: true, time: true, memo: true, remindMin: true, userId: true, user: { select: { nickname: true } } },
  });
  return {
    ok: true,
    events: sortEvents(
      rows.map(({ userId, user: owner, ...e }) => ({
        ...e,
        date: keyOfDbDate(e.date),
        ...(userId === user.id ? {} : { owner: owner.nickname }),
      }))
    ),
  };
}
