import 'server-only';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { NUTRITION_BACK_DAYS, dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import {
  isActivityKey,
  isGoalKey,
  isMealKey,
  isSex,
  scaleMacros,
  type EntrySource,
  type Food,
  type MealEntryView,
  type RankedFood,
} from '@/lib/nutrition/meta';
import {
  DEFAULT_PROFILE,
  ageOn,
  computeTargets,
  type Body,
  type ProfileSettings,
  type Targets,
} from '@/lib/nutrition/targets';
import {
  pitchingBurn,
  totalBurn,
  trainingBurn,
  type BurnItem,
} from '@/lib/nutrition/burn';
import { ageBand } from '@/lib/nutrition/age';
import { mfdsEnabled } from '@/lib/nutrition/mfds-key';
import { throwDayGuide, type ThrowGuide } from '@/lib/nutrition/guide';
import {
  INTAKE_DAYS,
  TREND_DAYS,
  weightGoal,
  type WeightGoal,
  type WeightPoint,
} from '@/lib/nutrition/weight-goal';
import { popularFoods } from '@/lib/nutrition/popular';
import { COMBO_MAX, comboView, type MealComboView } from '@/lib/nutrition/combos';

/**
 * 영양 탭 한 화면에 필요한 것을 한 번에 읽는다.
 *
 * 쿼리 여덟 개를 한꺼번에 보낸다. 하나씩 기다리면 DB 를 여덟 번 오가는 시간이
 * 그대로 더해진다(서울 DB 라도 한 번에 10ms 남짓).
 */

export type DaySummary = {
  date: string;
  kcal: number;
  protein: number;
  /** 그날의 목표(운동한 만큼 더한 것) */
  target: number;
};

export type { WeightPoint };

export type NutritionDay = {
  date: string;
  profile: ProfileSettings;
  /** 목표를 한 번이라도 저장했나 — 안 했으면 처음 설정을 권한다 */
  hasProfile: boolean;
  targets: Targets;
  burnItems: BurnItem[];
  entries: MealEntryView[];
  /** 그날 적은 체중과 어디서 왔나 */
  weightKg: number | null;
  weightFrom: 'nutrition' | 'checkin' | null;
  /** 고른 날까지 7일 — 아래 '최근 7일' 그래프 */
  week: DaySummary[];
  /**
   * 고른 날이 든 한 주(일~토) — 위쪽 날짜 띠. 달력처럼 일요일부터라, 이 주 안에서
   * 날짜를 옮겨도 띠가 흔들리지 않는다. 앞날도 칸은 있다(누를 수는 없다).
   */
  strip: DaySummary[];
  /** 고른 날까지 56일의 체중 — 그래프와 추세가 읽는다(목표 계산의 체중은 여전히 30일 안에서 고른다) */
  weights: WeightPoint[];
  /** 체중 목표 — 흐름과 계획을 견준 결과(lib/nutrition/weight-goal.ts) */
  plan: WeightGoal;
  /** 최근 먹은 것 — 같은 음식은 한 번만 */
  recent: Food[];
  mine: Food[];
  /** 즐겨찾기한 기본·식약처 음식 — '출처:열쇠' */
  favorites: string[];
  /** 자주 먹는 조합(lib/nutrition/combos.ts) — 자주 담은 것부터 */
  combos: MealComboView[];
  /** 전날 먹은 것 — '어제와 같이' 담기에 쓴다 */
  yesterday: MealEntryView[];
  /** 목표 계산에 쓴 몸 정보 — 목표 설정 창이 미리 계산해 보여 준다 */
  body: Body;
  /** 식약처 검색을 쓸 수 있나(인증키가 있나) */
  mfds: boolean;
  /**
   * 던지는 날 가이드 — 오늘을 볼 때만, 띄울 것이 있는 날만(등판 · 불펜 전날과 당일, 던진 뒤).
   * 지난 날을 볼 때는 늘 null 이다: 그날 무엇을 먹으라는 말은 지나고 나면 쓸모가 없다.
   */
  guide: ThrowGuide | null;
  /** 모든 사람이 가장 많이 담은 20가지 — '전체 음식 → 인기' */
  popular: RankedFood[];
  /**
   * 날짜 고르개(작은 달력)의 점 — 날짜별로 먹은 칼로리. 적은 날만 들어 있다.
   *
   * 고를 수 있는 한 해 전체를 한 번에 읽는다. 달력은 달을 넘겨 가며 훑는 물건이라,
   * 넘길 때마다 묻게 하면 넘길 때마다 점이 늦게 찍힌다. 하루 한 숫자라 작다.
   */
  calendar: Record<string, number>;
};

type UserBody = {
  id: string;
  birthDate: Date | null;
  /** 계정의 성별 'M' | 'F' — 내 정보에서 고친다 */
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
};

const WEEK_DAYS = 7;
const WEIGHT_DAYS = 30;
const RECENT_DAYS = 30;
const RECENT_MAX = 24;

/*
 * 성별은 여기서 읽지 않는다. 영양 목표 줄(NutritionProfile)에도 sex 칸이 남아 있지만
 * 더는 쓰지 않는다 — 성별은 계정(User.sex)에 있고 몸 정보(Body)로 따라온다.
 */
export function toProfile(
  row: {
    goal: string;
    activity: string;
    proteinPerKg: number;
    kcalTarget: number | null;
    /* 직접 정한 단백질 — 이 칸이 생기기 전의 줄 모양도 받는다 */
    proteinTargetG?: number | null;
    /* 체중 목표의 네 칸 — 이 칸들이 생기기 전의 줄 모양도 받는다(없으면 비어 있는 것과 같다) */
    targetWeightKg?: number | null;
    weeklyRateKg?: number | null;
    kcalAdjust?: number | null;
    planSince?: Date | null;
    updatedAt?: Date;
  } | null
): ProfileSettings {
  if (!row) return DEFAULT_PROFILE;
  return {
    goal: isGoalKey(row.goal) ? row.goal : DEFAULT_PROFILE.goal,
    activity: isActivityKey(row.activity) ? row.activity : DEFAULT_PROFILE.activity,
    proteinPerKg: row.proteinPerKg,
    kcalTarget: row.kcalTarget,
    proteinTargetG: row.proteinTargetG ?? null,
    targetWeightKg: row.targetWeightKg ?? null,
    weeklyRateKg: row.weeklyRateKg ?? null,
    kcalAdjust: row.kcalAdjust ?? null,
    /*
     * 계획 시작일이 없는 줄(이 칸이 생기기 전에 저장한 목표)은 마지막으로 저장한 날을 시작일로 본다 —
     * 배포 며칠 전에 유지 → 증량으로 바꾼 사람에게 첫날 "계획보다 느려요"가 뜨지 않게. 오래된 줄은 그 날짜가
     * 56일 창보다 앞이라 전체를 견준다(달라지는 것이 없다).
     */
    planSince: row.planSince
      ? keyOfDbDate(row.planSince)
      : row.updatedAt
        ? toDateKey(row.updatedAt)
        : null,
  };
}

/**
 * 그날 목표에 쓰는 체중 — 그날까지 30일 안에서 가장 최근에 적은 것(같은 날이면 영양 탭에 적은 값이 체크인보다 앞선다).
 * 아래 loadNutritionDay 의 '그날 적은 것 → 가장 최근 것' 과 같은 규칙이다. 캘린더의 그날 칸(lib/day-detail.ts)이 이것을
 * 써서 두 화면의 목표가 같다 — 예전에는 그날 칸만 가입 때 적은 몸무게로 건너뛰어 kcal · 단백질 목표가 달랐다.
 * 없으면 null(부르는 쪽이 가입 때 적은 몸무게로).
 */
export async function recentWeightKg(
  userId: string,
  date: string
): Promise<number | null> {
  const range = {
    gte: dbDate(shiftDateKey(date, -(WEIGHT_DAYS - 1))),
    lte: dbDate(date),
  };
  const [daily, checkin] = await Promise.all([
    prisma.dailyNutrition.findFirst({
      where: { userId, date: range, weightKg: { not: null } },
      orderBy: { date: 'desc' },
      select: { date: true, weightKg: true },
    }),
    prisma.dailyCheckin.findFirst({
      where: { userId, date: range, bodyWeightKg: { not: null } },
      orderBy: { date: 'desc' },
      select: { date: true, bodyWeightKg: true },
    }),
  ]);
  if (daily && (!checkin || daily.date >= checkin.date)) return daily.weightKg;
  return checkin?.bodyWeightKg ?? null;
}

const SOURCES: EntrySource[] = ['basic', 'mfds', 'mine', 'free'];
const asSource = (s: string): EntrySource =>
  (SOURCES as string[]).includes(s) ? (s as EntrySource) : 'free';

export async function loadNutritionDay(
  user: UserBody,
  date: string
): Promise<NutritionDay> {
  const weekStart = shiftDateKey(date, -(WEEK_DAYS - 1));
  const weightStart = shiftDateKey(date, -(WEIGHT_DAYS - 1));
  /* 체중은 추세 창(56일)만큼 읽는다 — 목표 계산의 체중은 그 가운데 최근 30일에서 고른다(아래 recent30) */
  const trendStart = shiftDateKey(date, -(TREND_DAYS - 1));
  const recentStart = shiftDateKey(date, -RECENT_DAYS);
  /* 날짜 띠(일~토)와 7일 그래프를 한 번에 읽도록 둘을 덮는 범위 */
  const stripStart = shiftDateKey(date, -new Date(`${date}T00:00:00.000Z`).getUTCDay());
  const stripEnd = shiftDateKey(stripStart, 6);
  const rangeStart = weekStart < stripStart ? weekStart : stripStart;
  const rangeEnd = date > stripEnd ? date : stripEnd;
  /* 운동 기록은 식사 확인의 14일까지 — 그날그날의 목표(운동한 만큼 더한 것)를 알아야 '목표만큼 먹었나'를 본다 */
  const intakeStart = shiftDateKey(date, -INTAKE_DAYS);
  const burnStart = intakeStart < rangeStart ? intakeStart : rangeStart;
  const userId = user.id;
  /* 던지는 날 가이드는 오늘에만 뜬다 — 지난 날을 볼 때는 그 몫의 체크인을 읽지 않는다 */
  const isToday = date === toDateKey(new Date());

  const [
    profileRow,
    weekEntries,
    dailyRows,
    checkinWeights,
    sessions,
    pitches,
    recentRows,
    foodRows,
    comboRows,
    popular,
    calendarRows,
    planRows,
  ] = await Promise.all([
    prisma.nutritionProfile.findUnique({ where: { userId } }),
    prisma.mealEntry.findMany({
      where: { userId, date: { gte: dbDate(rangeStart), lte: dbDate(rangeEnd) } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dailyNutrition.findMany({
      where: { userId, date: { gte: dbDate(trendStart), lte: dbDate(date) } },
      select: { date: true, weightKg: true },
    }),
    prisma.dailyCheckin.findMany({
      where: {
        userId,
        date: { gte: dbDate(trendStart), lte: dbDate(date) },
        bodyWeightKg: { not: null },
      },
      select: { date: true, bodyWeightKg: true },
    }),
    prisma.trainingSession.findMany({
      where: { userId, date: { gte: dbDate(burnStart), lte: dbDate(rangeEnd) } },
      select: { date: true, activeSeconds: true },
    }),
    prisma.pitchLog.findMany({
      where: { userId, date: { gte: dbDate(burnStart), lte: dbDate(rangeEnd) } },
      select: {
        date: true,
        sessionType: true,
        pitchCount: true,
        intensity: true,
        createdAt: true,
      },
    }),
    prisma.mealEntry.findMany({
      where: { userId, date: { gte: dbDate(recentStart), lte: dbDate(date) } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        name: true,
        source: true,
        sourceId: true,
        servingLabel: true,
        servingGrams: true,
        kcal: true,
        carbs: true,
        protein: true,
        fat: true,
      },
    }),
    prisma.userFood.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.mealCombo.findMany({
      where: { userId },
      orderBy: [{ useCount: 'desc' }, { createdAt: 'asc' }],
      take: COMBO_MAX,
      select: { id: true, name: true, meal: true, items: true, useCount: true },
    }),
    popularFoods(),
    /* 고른 날에서 한 해 앞까지 — 앞날에는 적을 수 없어 끝은 두지 않는다 */
    prisma.mealEntry.findMany({
      where: {
        userId,
        date: { gte: dbDate(shiftDateKey(date, -NUTRITION_BACK_DAYS)) },
      },
      select: { date: true, kcal: true, amount: true },
    }),
    /* 오늘과 어제 체크인의 '던지는 일정' · '식욕' — 어제 '내일 등판'이라 적었으면 오늘이 등판일이다 */
    isToday
      ? prisma.dailyCheckin.findMany({
          where: {
            userId,
            date: { gte: dbDate(shiftDateKey(date, -1)), lte: dbDate(date) },
          },
          select: { date: true, throwPlan: true, appetite: true },
        })
      : [],
  ]);

  const calendar: Record<string, number> = {};
  for (const row of calendarRows) {
    const key = keyOfDbDate(row.date);
    calendar[key] = (calendar[key] ?? 0) + row.kcal * row.amount;
  }
  for (const key of Object.keys(calendar)) calendar[key] = Math.round(calendar[key]);

  const profile = toProfile(profileRow);

  /* ── 체중: 그날 적은 것 → 가장 최근 것 → 가입 때 적은 것 ── */
  const weightByDay = new Map<string, { kg: number; from: 'nutrition' | 'checkin' }>();
  for (const c of checkinWeights) {
    if (c.bodyWeightKg !== null) {
      weightByDay.set(keyOfDbDate(c.date), { kg: c.bodyWeightKg, from: 'checkin' });
    }
  }
  /* 영양 탭에 적은 것이 체크인보다 앞선다 — 나중에 따로 고쳐 적은 값이다 */
  for (const d of dailyRows) {
    if (d.weightKg !== null) {
      weightByDay.set(keyOfDbDate(d.date), { kg: d.weightKg, from: 'nutrition' });
    }
  }
  const weights = [...weightByDay.entries()]
    .map(([day, w]) => ({ date: day, kg: w.kg }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const today = weightByDay.get(date) ?? null;
  /*
   * 목표 계산의 체중은 예전처럼 30일 안에서 고른다 — recentWeightKg()(캘린더의 그날 칸)와 같은 규칙이어야
   * 두 화면의 목표가 같다. 56일로 넓힌 것은 그래프와 추세뿐이다.
   */
  const latestKg = weights.filter((w) => w.date >= weightStart).at(-1)?.kg ?? null;
  const bodyKg = today?.kg ?? latestKg ?? user.weightKg;

  /* ── 운동으로 쓴 것(OUT) — 날마다 ── */
  const burnKg = bodyKg ?? 75;
  const burnByDay = new Map<string, BurnItem[]>();
  const pushBurn = (day: string, item: BurnItem | null) => {
    if (!item) return;
    burnByDay.set(day, [...(burnByDay.get(day) ?? []), item]);
  };
  for (const s of sessions)
    pushBurn(keyOfDbDate(s.date), trainingBurn(s.activeSeconds, burnKg));
  for (const p of pitches) {
    pushBurn(
      keyOfDbDate(p.date),
      pitchingBurn(p.sessionType, p.pitchCount, p.intensity, burnKg)
    );
  }

  const body: Body = {
    weightKg: bodyKg,
    heightCm: user.heightCm,
    age: ageOn(user.birthDate, date),
    sex: isSex(user.sex) ? user.sex : null,
  };
  const burnItems = burnByDay.get(date) ?? [];
  const targets = computeTargets(profile, body, totalBurn(burnItems));

  /* ── 체중 목표: 흐름을 계획과 견준다 ── */
  const intake = Array.from({ length: INTAKE_DAYS }, (_, i) => {
    const day = shiftDateKey(date, -(i + 1));
    return {
      kcal: calendar[day] ?? 0,
      target: computeTargets(
        profile,
        { ...body, age: ageOn(user.birthDate, day) },
        totalBurn(burnByDay.get(day) ?? [])
      ).kcal,
    };
  });
  /*
   * 생일이 지나 나이 칸이 바뀌면(만 13세 · 18세) 속도와 하루 칼로리가 그날부터 달라진다 — 저장은 안 했어도
   * 계획이 바뀐 것이다. 추세 창 안에 그런 날이 있으면 그날을 계획 시작일로 쳐서, 옛 계획의 체중으로 새 계획을
   * 판정하지 않는다(생일날 목표가 내려간 선수에게 곧바로 "100 더 줄여 볼까요?"가 뜨던 자리).
   */
  let bandSince: string | null = null;
  for (let i = 1; i < TREND_DAYS; i++) {
    const day = shiftDateKey(date, -i);
    if (ageBand(ageOn(user.birthDate, day)) !== ageBand(body.age)) {
      bandSince = shiftDateKey(day, 1);
      break;
    }
  }
  const planProfile =
    bandSince && (!profile.planSince || bandSince > profile.planSince)
      ? { ...profile, planSince: bandSince }
      : profile;
  const plan = weightGoal({
    date,
    isToday,
    hasProfile: profileRow !== null,
    points: weights,
    profile: planProfile,
    targets,
    age: body.age,
    intake,
  });

  /* ── 기록 ── */
  const toView = (e: (typeof weekEntries)[number]): MealEntryView => ({
    id: e.id,
    meal: isMealKey(e.meal) ? e.meal : 'snack',
    name: e.name,
    source: asSource(e.source),
    sourceId: e.sourceId,
    servingLabel: e.servingLabel,
    servingGrams: e.servingGrams,
    amount: e.amount,
    kcal: e.kcal,
    carbs: e.carbs,
    protein: e.protein,
    fat: e.fat,
    loggedAt: e.createdAt.toISOString(),
  });
  const entries = weekEntries.filter((e) => keyOfDbDate(e.date) === date).map(toView);
  const prevDay = shiftDateKey(date, -1);
  const yesterday = weekEntries
    .filter((e) => keyOfDbDate(e.date) === prevDay)
    .map(toView);

  /* ── 날마다 요약 — 7일 그래프와 날짜 띠가 같이 쓴다 ── */
  const summarize = (day: string): DaySummary => {
    const eaten = weekEntries
      .filter((e) => keyOfDbDate(e.date) === day)
      .map((e) => scaleMacros(e, e.amount));
    const dayTargets = computeTargets(
      profile,
      { ...body, age: ageOn(user.birthDate, day) },
      totalBurn(burnByDay.get(day) ?? [])
    );
    return {
      date: day,
      kcal: Math.round(eaten.reduce((s, m) => s + m.kcal, 0)),
      protein: Math.round(eaten.reduce((s, m) => s + m.protein, 0)),
      target: dayTargets.kcal,
    };
  };
  const week = Array.from({ length: WEEK_DAYS }, (_, i) =>
    summarize(shiftDateKey(weekStart, i))
  );
  const strip = Array.from({ length: 7 }, (_, i) =>
    summarize(shiftDateKey(stripStart, i))
  );

  /* ── 최근 먹은 것 — 같은 음식은 가장 최근 한 번만 ── */
  const seen = new Set<string>();
  const recent: Food[] = [];
  for (const r of recentRows) {
    const key = `${r.source}:${r.sourceId ?? r.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recent.push({
      source: asSource(r.source),
      id: r.sourceId,
      name: r.name,
      servingLabel: r.servingLabel ?? '1인분',
      servingGrams: r.servingGrams,
      kcal: r.kcal,
      carbs: r.carbs,
      protein: r.protein,
      fat: r.fat,
    });
    if (recent.length >= RECENT_MAX) break;
  }

  const mine: Food[] = foodRows.map((f) => ({
    source: 'mine',
    id: f.id,
    name: f.name,
    servingLabel: f.servingLabel,
    servingGrams: f.servingGrams,
    kcal: f.kcal,
    carbs: f.carbs,
    protein: f.protein,
    fat: f.fat,
    /* 즐겨찾기로 옮겨 온 것은 원래 어디서 왔는지 적어 둔다 */
    note: f.source === 'mfds' ? '식약처' : f.source === 'basic' ? '기본' : undefined,
  }));

  /* ── 던지는 날 가이드(오늘만) ── */
  const planOf = (day: string) => planRows.find((c) => keyOfDbDate(c.date) === day);
  const guide = isToday
    ? throwDayGuide(
        {
          planToday: planOf(date)?.throwPlan ?? null,
          planYesterday: planOf(prevDay)?.throwPlan ?? null,
          appetite: planOf(date)?.appetite ?? null,
          pitches: pitches
            .filter((p) => keyOfDbDate(p.date) === date)
            .map((p) => ({
              sessionType: p.sessionType,
              pitchCount: p.pitchCount,
              loggedAt: p.createdAt.toISOString(),
            })),
        },
        /* 체중을 모르면(짐작 75kg) g 을 말하지 않는다 */
        { weightKg: bodyKg, ageBand: targets.ageBand, goal: targets.goal }
      )
    : null;

  return {
    date,
    profile,
    hasProfile: profileRow !== null,
    targets,
    burnItems,
    entries,
    weightKg: today?.kg ?? null,
    weightFrom: today?.from ?? null,
    week,
    strip,
    weights,
    plan,
    recent,
    mine,
    favorites: foodRows
      .filter((f) => f.source !== 'mine' && f.sourceId)
      .map((f) => `${f.source}:${f.sourceId}`),
    combos: comboRows.map(comboView).filter((c): c is MealComboView => c !== null),
    yesterday,
    body,
    mfds: mfdsEnabled(),
    popular,
    calendar,
    guide,
  };
}
