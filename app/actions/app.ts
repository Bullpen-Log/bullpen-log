'use server';

import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { appNow } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import { loadTrainingStrip, type TrainingStripDay } from '@/lib/training-week';
import { loadTrainingWeekCounts, type TrainingWeekCounts } from '@/lib/report/training-week-counts';
import { pickArmPain, pickCheckinParts, todayOutingRole, validateCheckinDate, type CheckinPartKey } from '@/lib/checkin';
import { GOOD_DAY_MIN, RATED_SESSION_TYPES } from '@/lib/pitch-satisfaction';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { dbDate, isNutritionDate, keyOfDbDate } from '@/lib/nutrition/days';
import { prisma } from '@/lib/prisma';
import { isOutingTitle, sortEvents, type CalendarEventView } from '@/lib/calendar-event';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { loadVelocityByDate, loadVelocityDay, withMissedAttempts } from '@/lib/velocity-load';
import { logPrefillOf, unloggedSessions, type LogPrefill, type VelocitySessionView } from '@/lib/velocity-meta';
import { loadNutritionDay } from '@/lib/nutrition/load';
import { loadAdvice } from '@/lib/nutrition/advice-load';
import { serviceHour } from '@/lib/nutrition/advice-input';
import type { Food, MealEntryView, RankedFood } from '@/lib/nutrition/meta';
import type { MealComboView } from '@/lib/nutrition/combos';
import type { PlanContext, PlanItem } from '@/lib/nutrition/meal-plan';
import type { AgeBand } from '@/lib/nutrition/age';
import { DIET_STYLES, MEAL_PATTERNS, type AvoidKey } from '@/lib/nutrition/diet-prefs';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { loadHomeFeed, loadHomeRings, type HomeRing } from '@/lib/report/home-today';
import { loadTodayCoreCached } from '@/lib/report/today-data';
import { armStatusOf, type ArmStatus } from '@/lib/report/arm-status';
import { pitchNutritionLine, type NutritionLine } from '@/lib/nutrition/nudge';
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
      /** 오늘 투구 기록이 있나(쉰 날 줄 포함) — 앱 위 막대 알림 종 */
      pitchDone: boolean;
      feed: FeedItem[];
      /** 최근 투구 메모에 통증 같은 말 — 체크인으로 확인할 때까지 투구는 쉬고 운동은 회복만(웹 홈 맨 위 경고 카드) */
      painWords: string[] | null;
      /** 최근 체크인 통증으로 오늘은 회복 운동만 */
      recovering: boolean;
      /** 투구 기록을 한 번도 안 남긴 사람 — 지금 팔 상태(첫날 카드) */
      firstDay: ArmStatus | null;
      pitchLocked: boolean;
      /** 지난번 잘 던진 날 남긴 말 — 오늘 던지는 날, 오늘 기록 전에만(웹 home-page.tsx goodNote · good-day-note.tsx) */
      goodNote: { date: string; sessionType: string; satisfaction: number; memo: string; cuesGood: string[] } | null;
    }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const today = toDateKey(appNow());
  const locks = featureLocks(user);
  const [rings, feed, core, goodDay] = await Promise.all([
    loadHomeRings(user, today, locks.pitch),
    loadHomeFeed(user, today),
    loadTodayCoreCached(user),
    /* 만족도가 높았던 날의 메모 — 5점 먼저, 같은 점수면 최근 것(웹 홈과 같은 조회) */
    prisma.pitchLog.findFirst({
      where: { userId: user.id, sessionType: { in: [...RATED_SESSION_TYPES] }, satisfaction: { gte: GOOD_DAY_MIN }, memo: { not: null } },
      orderBy: [{ satisfaction: 'desc' }, { date: 'desc' }, { createdAt: 'desc' }],
      select: { date: true, sessionType: true, satisfaction: true, memo: true, cuesGood: true },
    }),
  ]);
  const { plan, picked, facts } = core;
  return {
    ok: true,
    today,
    rings: rings.items,
    checkinDone: rings.checkinDone,
    pitchDone: rings.pitchDone,
    feed,
    painWords: plan.needsPainCheck && !picked.halted ? facts.condition.painWordsInMemo : null,
    recovering: plan.recovering && !plan.needsPainCheck && !picked.halted,
    firstDay: core.everLogged ? null : armStatusOf(facts),
    pitchLocked: locks.pitch,
    goodNote:
      goodDay?.memo && goodDay.satisfaction != null && todayOutingRole(facts.condition.throwPlanToday, facts.condition.throwPlanYesterday) != null && !rings.pitchDone
        ? { date: toDateKey(goodDay.date), sessionType: goodDay.sessionType, satisfaction: goodDay.satisfaction, memo: goodDay.memo, cuesGood: goodDay.cuesGood }
        : null,
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
      /** 끼니마다 단백질 목표 · 모자랄 때 예시(lib/nutrition/meal-protein.ts mealProtein)에 — 웹 끼니 칸과 같은 값 */
      ageBand: AgeBand;
      avoid: AvoidKey[];
      /** '오늘 식욕 · 끼니는요?' 카드의 답(오늘 · 답했을 때만, 웹 nutrition-checkin-card.tsx 와 같은 값) */
      checkinAnswers: { appetite: number | null; mealAmount: string | null; skippedMeals: string[] } | null;
      /** 전날 먹은 것 — 담기 화면의 '어제 아침과 같이 담기'(웹 food-sheet.tsx 와 같은 값) */
      yesterday: MealEntryView[];
      /** 제목 밑 날짜 띠(최근 6주 · 날마다 먹은 / 목표 kcal) — 웹 WeekStrip */
      strip: { date: string; kcal: number; target: number }[];
      /** 날짜 고르는 작은 달력의 점 — 날짜 → 그날 담은 음식 수(웹 DateNav calendar) */
      calendar: Record<string, number>;
      /** 오늘 카드 — 체중 조정 · 짐작한 칸 · 목표를 정했나(웹 TodayCard) */
      adjust: number;
      assumed: string[];
      hasProfile: boolean;
      /** 오늘 영양 할 일 한 줄 · 균형 점수(웹 TodayCard 의 advice — 오늘만, 지난 날은 null) */
      advice: { headline: string | null; score: number | null; highlight: boolean } | null;
      /** 던지는 날 가이드(웹 GuideCard) — 그날은 할 일 한 줄 대신 이것 */
      guide: { badge: string; title: string; lines: string[]; notes: string[]; hint: string | null } | null;
      /** 음식 담기 화면 — 자주 먹는 조합 · 분류 둘러보기의 세부 칸 수 · 인기(웹 food-sheet 와 같은 값) */
      combos: MealComboView[];
      browseSubs: Record<string, Record<string, number>>;
      popular: RankedFood[];
      /** ★ 내 음식에 둔 기본 · 식약처 · 바코드 음식의 열쇠('source:id') — 담기 화면의 '내 음식에 두기' */
      favorites: string[];
      planState: string[];
      /** 체중 흐름 권유가 선 날의 다음 조정값(웹 TodayCard nudge — 통계 화면의 체중 카드와 같은 plan.suggestion). 없으면 null */
      suggestAdjust: number | null;
    }
  | { ok: false; error: string; to?: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (featureLocks(user).nutrition) return { ok: false, error: '영양 첫 설정을 먼저 해 주세요.', to: SETUP_PATH.nutrition };
  if (!isNutritionDate(date)) return { ok: false, error: '날짜가 올바르지 않아요.' };
  const today = toDateKey(appNow());
  const [day, advice] = await Promise.all([
    loadNutritionDay(user, date),
    date === today ? loadAdvice(user, date, today, serviceHour(appNow())).catch(() => null) : null,
  ]);
  const t = day.targets;
  return {
    ok: true,
    date,
    today,
    targets: { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, burn: t.burn, base: t.base },
    entries: day.entries,
    weightKg: day.weightKg,
    recent: day.recent,
    mine: day.mine,
    mfds: day.mfds,
    mealPlan: day.mealPlan,
    ageBand: t.ageBand,
    avoid: day.prefs.avoid,
    checkinAnswers: day.checkinAnswers,
    yesterday: day.yesterday,
    strip: day.strip.map((d) => ({ date: d.date, kcal: d.kcal, target: d.target })),
    calendar: day.calendar,
    adjust: t.adjust,
    assumed: t.assumed,
    hasProfile: day.hasProfile,
    advice: advice ? { headline: advice.headline, score: advice.score, highlight: advice.highlight } : null,
    guide: day.guide ? { badge: day.guide.badge, title: day.guide.title, lines: day.guide.lines, notes: day.guide.notes, hint: day.guide.hint } : null,
    combos: day.combos,
    browseSubs: day.browseSubs,
    popular: day.popular,
    favorites: day.favorites,
    /* 식단 짜기 카드의 '오늘 상태 · 취향' 한 줄(웹 plan-parts PlanCard state) — 던지는 날 · 입맛 · 잠 · 식단 스타일 · 끼니 구성 */
    planState: [
      day.planSignals?.throwKind ? ({ eve: '내일 등판', today: '오늘 던지는 날', after: '던진 뒤' } as const)[day.planSignals.throwKind] : null,
      day.planSignals?.appetite != null && day.planSignals.appetite <= 2 ? '입맛 없음' : null,
      day.planSignals?.sleepShort ? '잠 부족' : null,
      DIET_STYLES.find((x) => x.key === day.prefs.dietStyle)?.label ?? null,
      MEAL_PATTERNS.find((x) => x.key === day.prefs.mealPattern)?.label ?? null,
    ].filter((x): x is string => x != null),
    suggestAdjust: day.plan.suggestion?.nextAdjust ?? null,
  };
}

/**
 * 앱 트레이닝 탭 첫 화면 — 웹 트레이닝 홈(app/(app)/training/training-home.tsx)과 같은 앱 카드 셋(lib/report/training-home-data.ts).
 * 카드 하나가 실패해도 나머지는 보인다(웹 SafeCard 와 같다). 마지막으로 쓴 앱(쿠키)이 맨 위.
 */
export async function loadAppTraining(): Promise<
  | {
      ok: true;
      today: string;
      cards: TrainingCard[];
      /** 제목 밑 날짜 띠(최근 6주, 웹 트레이닝 홈과 같은 lib/training-week.ts loadTrainingStrip) */
      strip: TrainingStripDay[];
      /** '이번 주 운동 N일 · 암케어 N일 · 메커니즘 N일'(lib/report/training-week-counts.ts) */
      week: TrainingWeekCounts;
    }
  | { ok: false; error: string; to?: string }
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
  const todayKey = toDateKey(now);
  const [cards, strip, week] = await Promise.all([
    Promise.all([
      safe('today', () => workoutCardData(user, now)),
      safe('armcare', () => armcareCardData(user, now)),
      safe('mechanics', () => mechanicsCardData(user.id)),
    ]),
    loadTrainingStrip(user.id, todayKey, todayKey),
    loadTrainingWeekCounts(user.id, now),
  ]);
  const last = readTrainingPart((await cookies()).get(TRAINING_PART_COOKIE)?.value);
  if (last) cards.sort((a, b) => Number(b.app === last) - Number(a.app === last));
  return { ok: true, today: todayKey, cards, strip, week };
}

/**
 * 날짜별 구속 측정 요약(공 수 · 최고 · 클립 수 · 지문) — 웹 홈 · 투구 달력과 같은 loadVelocityByDate. 앱 달력의 영상 점(클립도 셈)과
 * 그날 칸의 '카메라로 잰 공' 줄이 쓴다. 측정만 남은 날도 달력에 칠한다(웹 홈과 같다).
 */
/**
 * 그날의 대표 영상(★) — 웹 투구 탭 영상 달력 · 홈 그날 칸이 읽는 DailyFeaturedVideo. 날짜 → 영상 경로.
 * 고르기는 featured-video.setFeaturedVideo(웹과 같은 동작)로.
 */
export async function loadAppFeatured(): Promise<{ ok: true; featured: Record<string, string> } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const rows = await prisma.dailyFeaturedVideo.findMany({ where: { userId: user.id }, select: { date: true, videoPath: true } });
  return { ok: true, featured: Object.fromEntries(rows.map((r) => [toDateKey(r.date), r.videoPath])) };
}

/** 체크인 메모를 남긴 날 — 투구 달력 칸의 작은 쪽지(웹 videos-page noteDays). 하루 한 줄이라 전부 읽어도 가볍다 */
export async function loadAppNoteDays(): Promise<{ ok: true; days: string[] } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const rows = await prisma.dailyCheckin.findMany({ where: { userId: user.id, note: { not: null } }, select: { date: true, note: true } });
  return { ok: true, days: rows.filter((r) => r.note?.trim()).map((r) => toDateKey(r.date)) };
}

export async function loadAppVelocityDays(): Promise<
  { ok: true; days: Record<string, { n: number; max: number; clips: number; sig: string }> } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  return { ok: true, days: await loadVelocityByDate(user.id) };
}

/**
 * 앱 홈 달력의 일정 전부 — 웹 홈(home-page.tsx)과 같은 범위 · 같은 상한(3,000). 달력 칸 밑 일정 막대 · 그날 칸 · 알림 다시 걸기가 쓴다.
 */
export async function loadAppEvents(): Promise<{ ok: true; events: CalendarEventView[] } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const rows = await prisma.calendarEvent.findMany({
    where: user.role === 'ADMIN' ? { user: { role: 'ADMIN' } } : { userId: user.id },
    orderBy: { date: 'asc' },
    take: 3000,
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

/**
 * 앱 체크인 화면(native/src/app/checkin.tsx)이 고치기로 열 때 — 그날 저장한 값 그대로(팔 통증 자리 · 정도까지). 그날 칸(lib/day-detail.ts)은
 * 보이는 글이라 팔 통증 자리가 없어, 그것으로 채우면 다시 저장할 때 팔 통증 자리가 지워졌다.
 */
export async function loadAppCheckin(date: string): Promise<
  | {
      ok: true;
      checkin: {
        condition: number;
        sleepQuality: number | null;
        parts: Record<CheckinPartKey, string>;
        armSpots: string[];
        armLevel: number | null;
        note: string;
      } | null;
    }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (!validateCheckinDate(String(date))) return { ok: false, error: '날짜가 올바르지 않아요.' };
  const row = await prisma.dailyCheckin.findUnique({
    where: { userId_date: { userId: user.id, date: new Date(`${date}T00:00:00.000Z`) } },
  });
  if (!row) return { ok: true, checkin: null };
  const arm = pickArmPain(row);
  return {
    ok: true,
    checkin: {
      condition: row.condition,
      sleepQuality: row.sleepQuality ?? null,
      parts: pickCheckinParts(row as Partial<Record<CheckinPartKey, string>>),
      armSpots: arm.armPainSpots,
      armLevel: arm.armPainLevel,
      note: row.note ?? '',
    },
  };
}

/**
 * 앱 그날 화면의 구속 측정 칸 — 웹 그날 화면(app/(app)/pitch-log/[date]/load.ts)과 같은 세션 · 공(lib/velocity-load.ts loadVelocityDay —
 * 서버 클립은 서명 주소, 폰 클립은 경로 그대로)과, 아직 투구 기록으로 안 남긴 측정으로 새 기록을 채울 값(logPrefillOf).
 */
export async function loadAppVelocityDay(
  date: string
): Promise<{ ok: true; sessions: VelocitySessionView[]; prefill: LogPrefill | null } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: '날짜가 올바르지 않아요.' };
  const at = dbDate(date);
  const [sessions, logs] = await Promise.all([
    loadVelocityDay(user.id, at),
    prisma.pitchLog.findMany({ where: { userId: user.id, date: at }, select: { createdAt: true } }),
  ]);
  return {
    ok: true,
    sessions,
    prefill: await withMissedAttempts(
      user.id,
      logPrefillOf(unloggedSessions(sessions, logs.map((l) => l.createdAt.toISOString())))
    ),
  };
}

/**
 * 앱 투구 탭 맨 위 '오늘' 카드 — 웹 투구 탭(app/(app)/videos/videos-page.tsx)과 같은 값: 지금 팔 상태(armStatusOf — 오늘 던진 기록까지),
 * 오늘 남긴 공 수, 아직 투구 기록으로 안 남긴 구속 측정 공 수, '오늘 던지는 일정' 질문(체크인 줄의 답 · 달력 오늘/내일 등판 힌트).
 */
export async function loadAppPitchToday(): Promise<
  | {
      ok: true;
      today: string;
      status: ArmStatus;
      logged: { pitches: number } | null;
      unloggedVelocity: number | null;
      throwCard: { plan: string | null; hasCheckin: boolean; hint: string | null };
      /** 던진 뒤 회복식 한 줄 — 오늘 불펜 · 라이브 · 경기 기록이 있을 때만(웹 그날 화면 NutritionLineNote, lib/nutrition/nudge.ts) */
      nutritionLine: NutritionLine | null;
    }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const now = appNow();
  const todayKey = toDateKey(now);
  const todayAt = dbDate(todayKey);
  const [gathered, todayLogs, velocityToday, checkinToday, calendarRows, nutritionLine] = await Promise.all([
    gatherFactsAndPlan(user, now),
    prisma.pitchLog.findMany({ where: { userId: user.id, date: todayAt }, select: { pitchCount: true, createdAt: true } }),
    prisma.velocitySession.findMany({
      where: { userId: user.id, date: todayAt, pitchLogId: null },
      select: { createdAt: true, _count: { select: { pitches: true } } },
    }),
    prisma.dailyCheckin.findUnique({
      where: { userId_date: { userId: user.id, date: todayAt } },
      select: { throwPlan: true },
    }),
    prisma.calendarEvent.findMany({
      where: { userId: user.id, date: { gte: todayAt, lte: dbDate(shiftDateKey(todayKey, 1)) } },
      select: { date: true, title: true },
    }),
    pitchNutritionLine(user, todayKey, todayKey),
  ]);
  const outingOn = (day: string) => calendarRows.some((e) => keyOfDbDate(e.date) === day && isOutingTitle(e.title));
  return {
    ok: true,
    today: todayKey,
    status: armStatusOf(gathered.facts),
    logged: todayLogs.length ? { pitches: todayLogs.reduce((n, l) => n + l.pitchCount, 0) } : null,
    unloggedVelocity:
      unloggedSessions(
        velocityToday.map((s) => ({ pitchLogId: null, createdAt: s.createdAt.toISOString(), n: s._count.pitches })),
        todayLogs.map((l) => l.createdAt.toISOString())
      ).reduce((n, s) => n + s.n, 0) || null,
    throwCard: {
      plan: checkinToday?.throwPlan ?? null,
      hasCheckin: checkinToday != null,
      hint: outingOn(todayKey) ? '오늘 등판' : outingOn(shiftDateKey(todayKey, 1)) ? '내일 등판' : null,
    },
    nutritionLine,
  };
}
