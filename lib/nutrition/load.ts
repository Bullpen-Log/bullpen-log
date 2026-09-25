import 'server-only';
import { prisma } from '@/lib/prisma';
import { shiftDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
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
  type ProfileSettings,
  type Targets,
} from '@/lib/nutrition/targets';
import {
  pitchingBurn,
  totalBurn,
  trainingBurn,
  type BurnItem,
} from '@/lib/nutrition/burn';
import { mfdsEnabled } from '@/lib/nutrition/mfds';
import { popularFoods } from '@/lib/nutrition/popular';

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

export type WeightPoint = { date: string; kg: number };

export type NutritionDay = {
  date: string;
  profile: ProfileSettings;
  /** 목표를 한 번이라도 저장했나 — 안 했으면 처음 설정을 권한다 */
  hasProfile: boolean;
  targets: Targets;
  burnItems: BurnItem[];
  entries: MealEntryView[];
  waterMl: number;
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
  /** 고른 날까지 30일의 체중 */
  weights: WeightPoint[];
  /** 최근 먹은 것 — 같은 음식은 한 번만 */
  recent: Food[];
  mine: Food[];
  /** 즐겨찾기한 기본·식약처 음식 — '출처:열쇠' */
  favorites: string[];
  /** 전날 먹은 것 — '어제와 같이' 담기에 쓴다 */
  yesterday: MealEntryView[];
  /** 목표 계산에 쓴 몸 정보 — 목표 설정 창이 미리 계산해 보여 준다 */
  body: { weightKg: number | null; heightCm: number | null; age: number | null };
  /** 식약처 검색을 쓸 수 있나(인증키가 있나) */
  mfds: boolean;
  /** 모든 사람이 가장 많이 담은 20가지 — '전체 음식 → 인기' */
  popular: RankedFood[];
};

type UserBody = {
  id: string;
  birthDate: Date | null;
  heightCm: number | null;
  weightKg: number | null;
};

const WEEK_DAYS = 7;
const WEIGHT_DAYS = 30;
const RECENT_DAYS = 30;
const RECENT_MAX = 24;

function toProfile(
  row: {
    sex: string | null;
    goal: string;
    activity: string;
    proteinPerKg: number;
    kcalTarget: number | null;
    waterGoalMl: number | null;
  } | null
): ProfileSettings {
  if (!row) return DEFAULT_PROFILE;
  return {
    sex: isSex(row.sex) ? row.sex : null,
    goal: isGoalKey(row.goal) ? row.goal : DEFAULT_PROFILE.goal,
    activity: isActivityKey(row.activity) ? row.activity : DEFAULT_PROFILE.activity,
    proteinPerKg: row.proteinPerKg,
    kcalTarget: row.kcalTarget,
    waterGoalMl: row.waterGoalMl,
  };
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
  const recentStart = shiftDateKey(date, -RECENT_DAYS);
  /* 날짜 띠(일~토)와 7일 그래프를 한 번에 읽도록 둘을 덮는 범위 */
  const stripStart = shiftDateKey(date, -new Date(`${date}T00:00:00.000Z`).getUTCDay());
  const stripEnd = shiftDateKey(stripStart, 6);
  const rangeStart = weekStart < stripStart ? weekStart : stripStart;
  const rangeEnd = date > stripEnd ? date : stripEnd;
  const userId = user.id;

  const [
    profileRow,
    weekEntries,
    dailyRows,
    checkinWeights,
    sessions,
    pitches,
    recentRows,
    foodRows,
    popular,
  ] = await Promise.all([
    prisma.nutritionProfile.findUnique({ where: { userId } }),
    prisma.mealEntry.findMany({
      where: { userId, date: { gte: dbDate(rangeStart), lte: dbDate(rangeEnd) } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dailyNutrition.findMany({
      where: { userId, date: { gte: dbDate(weightStart), lte: dbDate(date) } },
      select: { date: true, waterMl: true, weightKg: true },
    }),
    prisma.dailyCheckin.findMany({
      where: {
        userId,
        date: { gte: dbDate(weightStart), lte: dbDate(date) },
        bodyWeightKg: { not: null },
      },
      select: { date: true, bodyWeightKg: true },
    }),
    prisma.trainingSession.findMany({
      where: { userId, date: { gte: dbDate(rangeStart), lte: dbDate(rangeEnd) } },
      select: { date: true, activeSeconds: true },
    }),
    prisma.pitchLog.findMany({
      where: { userId, date: { gte: dbDate(rangeStart), lte: dbDate(rangeEnd) } },
      select: { date: true, sessionType: true, pitchCount: true, intensity: true },
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
    popularFoods(),
  ]);

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
  const latestKg = weights.at(-1)?.kg ?? null;
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

  const body = {
    weightKg: bodyKg,
    heightCm: user.heightCm,
    age: ageOn(user.birthDate, date),
  };
  const burnItems = burnByDay.get(date) ?? [];
  const targets = computeTargets(profile, body, totalBurn(burnItems));

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

  const day = dailyRows.find((d) => keyOfDbDate(d.date) === date);

  return {
    date,
    profile,
    hasProfile: profileRow !== null,
    targets,
    burnItems,
    entries,
    waterMl: day?.waterMl ?? 0,
    weightKg: today?.kg ?? null,
    weightFrom: today?.from ?? null,
    week,
    strip,
    weights,
    recent,
    mine,
    favorites: foodRows
      .filter((f) => f.source !== 'mine' && f.sourceId)
      .map((f) => `${f.source}:${f.sourceId}`),
    yesterday,
    body,
    mfds: mfdsEnabled(),
    popular,
  };
}
