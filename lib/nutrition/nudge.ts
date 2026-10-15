import 'server-only';
import { prisma } from '@/lib/prisma';
import { featureLocks, FEATURE_HOME, SETUP_PATH } from '@/lib/feature-locks';
import { shiftDateKey } from '@/lib/pitch-stats';
import { ageBand } from '@/lib/nutrition/age';
import { ageOn, DEFAULT_PROFILE } from '@/lib/nutrition/targets';
import { recentWeightKg } from '@/lib/nutrition/load';
import { throwDayGuide, throwDayKind, type GuideSignals } from '@/lib/nutrition/guide';
import { afterProtein, afterWorkoutProtein, LATE_HOUR, trainingKindOf } from '@/lib/nutrition/advice';
import { serviceHour } from '@/lib/nutrition/advice-input';

/**
 * 영양을 '순간에 한 줄'로(docs/designs/nutrition-moments.md) — 투구 · 운동을 마친 순간에 영양 탭을 열지 않아도 한 줄이 뜬다.
 *
 * 음식을 적지 않아도 값이 나와야 한다(설계 전제 ①): 오늘 던졌는지 · 운동했는지는 앱이 이미 안다. 계산은 새로 하지 않고
 * 영양 탭의 던지는 날 가이드(guide.ts)와 홈 조언(advice.ts)의 같은 함수를 쓴다 — 세 곳의 말이 어긋나지 않게.
 *
 *   ① 투구 회복식  오늘 날짜의 그날 화면에, 오늘 불펜 · 라이브 · 경기 기록이 있으면(가이드 'after')
 *   ② 운동 뒤 단백질  축하 화면에, 웨이트 · 파워 운동을 했으면. 오늘 이미 던졌으면 ① 이 같은 말을 해서 뺀다
 *
 * 표는 더하지 않았다(2026-10-16 김민: 표 없이 먼저) — 반응은 인터뷰로 본다. ③ 등판 전 저녁은 던지는 일정 답이 0건이라 미뤘다.
 */

export type NutritionLine = {
  title: string;
  text: string;
  /** 음식 보기 — 없으면 null */
  example: string | null;
  /** [자세히] — 영양 탭의 오늘, 영양이 잠겼으면 첫 설정 */
  href: string;
};

type NudgeUser = Parameters<typeof featureLocks>[0] & {
  id: string;
  birthDate: Date | null;
  weightKg: number | null;
};

const dbDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

/** 체중 — 영양 기록 · 체크인의 최근 체중, 없으면 가입 때 적은 몸무게. 모르면 null(짐작으로 g 을 말하지 않는다) */
async function bodyOf(user: NudgeUser, date: string) {
  const kg = (await recentWeightKg(user.id, date)) ?? user.weightKg;
  return {
    weightKg: kg != null && kg > 0 ? kg : null,
    ageBand: ageBand(ageOn(user.birthDate, date)),
  };
}

const hrefOf = (user: NudgeUser) =>
  featureLocks(user).nutrition ? SETUP_PATH.nutrition : FEATURE_HOME.nutrition;

/** 오늘 던졌는지 · 오늘이 어떤 날인지 — 가이드가 읽는 신호 그대로 */
async function signalsOf(userId: string, date: string): Promise<GuideSignals> {
  const [pitches, plans] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId, date: dbDate(date) },
      select: { sessionType: true, pitchCount: true, createdAt: true },
    }),
    prisma.dailyCheckin.findMany({
      where: { userId, date: { in: [dbDate(date), dbDate(shiftDateKey(date, -1))] } },
      select: { date: true, throwPlan: true },
    }),
  ]);
  const planOn = (key: string) =>
    plans.find((p) => p.date.toISOString().slice(0, 10) === key)?.throwPlan ?? null;
  return {
    planToday: planOn(date),
    planYesterday: planOn(shiftDateKey(date, -1)),
    appetite: null,
    pitches: pitches.map((p) => ({
      sessionType: p.sessionType,
      pitchCount: p.pitchCount,
      loggedAt: p.createdAt.toISOString(),
    })),
  };
}

/** ① 투구 회복식 — 오늘(date === today) 던진 기록이 있을 때만. 지난 날짜에 '1~2시간 안'은 틀린 말이다 */
export async function pitchNutritionLine(
  user: NudgeUser,
  date: string,
  today: string
): Promise<NutritionLine | null> {
  if (date !== today) return null;
  const signals = await signalsOf(user.id, date);
  if (throwDayKind(signals) !== 'after') return null;
  const guide = throwDayGuide(signals, { ...(await bodyOf(user, date)), goal: DEFAULT_PROFILE.goal });
  if (!guide || guide.kind !== 'after') return null;
  return {
    title: guide.title,
    text: guide.lines[0],
    example: guide.lines[1] ?? null,
    href: hrefOf(user),
  };
}

/** ② 운동 뒤 단백질 — 오늘 마친 웨이트 · 파워 세션일 때만 */
export async function workoutNutritionLine(
  user: NudgeUser,
  input: { date: string; today: string; now: Date; categories: string[] }
): Promise<NutritionLine | null> {
  if (input.date !== input.today) return null;
  const kinds = input.categories.map(trainingKindOf);
  const power = kinds.includes('power');
  if (!power && !kinds.includes('strength')) return null;
  const signals = await signalsOf(user.id, input.date);
  /* 오늘 이미 던졌으면 그날 화면의 회복식 줄이 같은 말(단백질)을 한다 */
  if (throwDayKind(signals) === 'after') return null;
  const body = await bodyOf(user, input.date);
  const { headline, why } = afterWorkoutProtein(
    afterProtein(body.weightKg, body.ageBand),
    serviceHour(input.now) >= LATE_HOUR,
    power
  );
  return { title: '운동 뒤 단백질', text: headline, example: why, href: hrefOf(user) };
}
