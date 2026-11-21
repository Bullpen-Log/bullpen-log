import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { loadLatestReport } from '@/lib/pitch-lab';
import { mechFocusFrom, readProgramState } from '@/lib/mechanics/program';
import { loadVelocityHistory } from '@/lib/velocity-load';
import { loadArmcareHistory } from '@/lib/armcare/history';
import { loadAdvice } from '@/lib/nutrition/advice-load';
import { serviceHour } from '@/lib/nutrition/advice-input';
import { countryOf, hasNutrition } from '@/lib/country';
import type { DayDetailUser } from '@/lib/day-detail';
import { veloRowsOf, type CoachAiRecords } from '@/lib/coach/ai-prompt';
import { COACH_VELOCITY } from '@/lib/coach/act';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { loadGoodDays } from '@/lib/report/good-days-load';
import { PROGRESS_DAYS, goodDayLinesOf, liftTrendsOf, pitchFeelOf, recheckOf, type CoachAiProgress } from '@/lib/coach/progress';
import { GROWTH_FEEL_WEEKS, GROWTH_LOOKBACK_DAYS, growthLineOf } from '@/lib/coach/review';
import { defaultUnits } from '@/lib/units';

/**
 * 코치가 '다 안다'(자비스 1단계, 2026-11-19 김민: "모든 걸 다 떠먹여 줄 수 있는 자비스") — 일정 밖 기록을 AI 맥락용으로 모은다.
 * 이미 있는 읽기 함수만 부른다(3D 리포트 요약 · 메커니즘 처방 · 구속 세션 · 암케어 · 영양 조언). 하나가 실패하거나 늦어도 대화는 간다 — 그 칸만 null(=모름).
 * 영상 · 메모 글 · 각도 숫자는 안 넣는다. 영양 할 일 한 줄은 체크인 신호(잠 · 근육통)가 섞여 있어 부르는 쪽이 건강 동의로 거른다.
 */
export type CoachRecordsUser = DayDetailUser & { country: string | null };

/**
 * 3D 요약은 DB 가 아니라 저장소 파일(샘플마다 두 개)이라 샘플이 많으면 1.5~2.6초 걸렸다(2026-11-19 실제 계정). 그래서 사람마다 10분 기억해 두고,
 * 분석 작업 · 샘플이 바뀌면(app/actions/pitch-lab.ts) forgetCoachLab 으로 비운다. 기억이 없을 때만 이만큼 기다리고 '모름'으로 간다.
 */
const LAB_WAIT_MS = 3000;
const LAB_KEEP_S = 600;
const labTag = (userId: string) => `coach-lab:${userId}`;
const VELO_DAYS = 60;

/* ponytail: 실패 · 늦음을 모두 null 로 — 3D 요약을 대화마다 저장소에서 읽는다. 늦은 사람이 늘면 요약을 DB 칸이나 짧은 기억에 두기 */
async function soft<T>(p: Promise<T>, ms?: number): Promise<T | null> {
  const guarded = p.catch(() => null);
  if (!ms) return guarded;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)));
  try {
    return await Promise.race([guarded, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** 3D 작업 · 샘플이 바뀐 서버 동작에서 부른다 — 다음 대화가 새 판정을 읽게. 화면 그리기 중에는 못 부르니 실패는 삼킨다(10분 뒤 저절로 새로) */
export function forgetCoachLab(userId: string) {
  try {
    revalidateTag(labTag(userId), { expire: 0 });
  } catch {
    /* 서버 동작 밖 — 기억은 10분 뒤 새로 */
  }
}

const cachedLab = (userId: string) =>
  unstable_cache(() => labOf(userId), ['coach-lab', userId], { tags: [labTag(userId)], revalidate: LAB_KEEP_S })();

async function labOf(userId: string): Promise<CoachAiRecords['lab']> {
  const latest = await loadLatestReport(userId);
  if (!latest) return 'none';
  const { summary } = latest;
  return {
    date: latest.finishedAt ? toDateKey(new Date(latest.finishedAt)) : '모름',
    judged: summary.judged,
    issues: summary.bad.map((b) => ({ element: b.element, level: b.level })),
  };
}

async function mechFocusOf(userId: string): Promise<CoachAiRecords['mechFocus']> {
  const row = await prisma.mechanicsProgram.findUnique({ where: { userId }, select: { progress: true } });
  const focus = row ? readProgramState(row.progress).focus : null;
  return focus?.rx[0] ? mechFocusFrom(focus) : 'none';
}

/** 최근 60일 구속 측정 — 날짜 · 종류별 한 줄(같은 종류 여러 세션은 구수로 무게, lib/coach/ai-prompt.ts veloRowsOf) */
async function veloOf(userId: string, today: string): Promise<CoachAiRecords['velo']> {
  return veloRowsOf(await loadVelocityHistory(userId, dbDate(shiftDateKey(today, -VELO_DAYS))));
}

/** 최근 14일(loadArmcareHistory 의 창) 암케어를 한 날 수 · 마지막 날 */
async function armcareOf(userId: string, today: string): Promise<CoachAiRecords['armcare']> {
  const rows = await loadArmcareHistory(userId, today);
  const days = [...new Set(rows.map((r) => r.on))].sort();
  return { days: days.length, last: days.at(-1) ?? null };
}

async function foodOf(user: CoachRecordsUser, today: string, now: Date): Promise<CoachAiRecords['food']> {
  if (!hasNutrition(countryOf(user.country))) return 'off';
  const profile = await prisma.nutritionProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!profile) return 'unset';
  const a = await loadAdvice(user, today, today, serviceHour(now));
  return { headline: a.headline, more: a.more, score: a.score };
}

export async function coachRecordsOf(user: CoachRecordsUser, today: string, now: Date): Promise<CoachAiRecords> {
  const [lab, mechFocus, velo, armcare, food] = await Promise.all([
    soft(cachedLab(user.id), LAB_WAIT_MS),
    soft(mechFocusOf(user.id)),
    COACH_VELOCITY ? soft(veloOf(user.id, today)) : null,
    soft(armcareOf(user.id, today)),
    soft(foodOf(user, today, now)),
  ]);
  return { lab, mechFocus, velo, armcare, food };
}

/** 잘 던진 날은 180일을 읽고 순열을 돌려 늦을 수 있다 — 이만큼만 기다리고 '모름' */
const GOOD_DAYS_WAIT_MS = 2000;

/**
 * 진척(lib/coach/progress.ts) — 최근 4주 운동 무게 · 투구 만족도와 감각 칩 · 3D 다시 재기 · 잘 던진 날. 칸마다 실패하면 그 칸만 빈다.
 * 몸 상태가 섞인 것(감각 칩 '팔 무거움' · 잘 던진 날의 잠 · 컨디션 · 근육통 · 팔)은 건강 동의가 있을 때만.
 */
/**
 * 무게를 적은 기록 — 두 곳에 남는다: 운동 체크의 톱세트(UserExerciseLog)와 운동 중 세트(UserExerciseSet). 둘 다 읽는다(암케어 빼고).
 * 진척(coachProgressOf)과 주간 리뷰의 늘어난 것(weekGrowthOf)이 같이 쓴다.
 */
async function liftRowsOf(userId: string, from: string, to: string) {
  const where = { userId, date: { gte: dbDate(from), lte: dbDate(to) }, weightKg: { gt: 0 }, exercise: { category: { not: '암케어' } } };
  const [logs, sets] = await Promise.all([
    prisma.userExerciseLog.findMany({ where: { ...where, completed: true }, select: { date: true, weightKg: true, repsDone: true, exercise: { select: { title: true } } } }),
    prisma.userExerciseSet.findMany({ where, select: { date: true, weightKg: true, reps: true, exercise: { select: { title: true } } } }),
  ]);
  return [
    ...logs.map((l) => ({ date: keyOfDbDate(l.date), name: l.exercise.title, weightKg: l.weightKg, reps: l.repsDone })),
    ...sets.map((l) => ({ date: keyOfDbDate(l.date), name: l.exercise.title, weightKg: l.weightKg, reps: l.reps })),
  ];
}

export async function coachProgressOf(user: CoachRecordsUser, today: string, health: Promise<boolean>): Promise<CoachAiProgress> {
  const fromKey = shiftDateKey(today, -(PROGRESS_DAYS - 1));
  const where = { userId: user.id, date: { gte: dbDate(fromKey), lte: dbDate(today) } };
  const [lifts, pitches, recheck, good, h] = await Promise.all([
    soft(liftRowsOf(user.id, fromKey, today)),
    soft(prisma.pitchLog.findMany({ where, select: { date: true, sessionType: true, satisfaction: true, cuesGood: true, cuesBad: true } })),
    soft(
      prisma.mechanicsProgram
        .findUnique({ where: { userId: user.id }, select: { progress: true } })
        .then((r) => recheckOf(r ? readProgramState(r.progress).focus?.review : null))
    ),
    soft(loadGoodDays(user.id, today), GOOD_DAYS_WAIT_MS),
    health.catch(() => false),
  ]);
  return {
    lifts: liftTrendsOf(lifts ?? []),
    pitch: pitchFeelOf((pitches ?? []).map((l) => ({ ...l, date: keyOfDbDate(l.date) })), today, h),
    recheck,
    goodDays: good ? goodDayLinesOf(good, h, hasNutrition(countryOf(user.country))) : null,
  };
}

/**
 * 주간 리뷰의 늘어난 것 한 줄(lib/coach/review.ts growthLineOf) — 그 주 무게와 그 전 8주 · 투구 만족도 앞 3주 · 그 주 3D 다시 재기.
 * 무게 단위는 나라 기본값(미국 lb). ponytail: 앱 설정에서 단위를 바꾼 것은 서버가 모른다 — 단위 설정을 서버에 두게 되면 그 값으로
 */
export async function weekGrowthOf(user: CoachRecordsUser, weekStart: string): Promise<string | null> {
  const end = shiftDateKey(weekStart, 6);
  const [lifts, pitches, program] = await Promise.all([
    soft(liftRowsOf(user.id, shiftDateKey(weekStart, -GROWTH_LOOKBACK_DAYS), end)),
    soft(
      prisma.pitchLog.findMany({
        where: { userId: user.id, date: { gte: dbDate(shiftDateKey(weekStart, -7 * GROWTH_FEEL_WEEKS)), lte: dbDate(end) } },
        select: { date: true, sessionType: true, satisfaction: true },
      })
    ),
    soft(prisma.mechanicsProgram.findUnique({ where: { userId: user.id }, select: { progress: true } })),
  ]);
  const followups = program ? (readProgramState(program.progress).focus?.review?.followups ?? []) : [];
  return growthLineOf({
    weekStart,
    lifts: lifts ?? [],
    pitches: (pitches ?? []).map((l) => ({ ...l, date: keyOfDbDate(l.date) })),
    rechecked: followups.some((f) => {
      const d = toDateKey(new Date(f.linkedAt));
      return d >= weekStart && d <= end;
    }),
    unit: defaultUnits(countryOf(user.country)).weight,
  });
}
