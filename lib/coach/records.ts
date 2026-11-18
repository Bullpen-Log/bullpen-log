import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { loadLatestReport } from '@/lib/pitch-lab';
import { focusView, readProgramState } from '@/lib/mechanics/program';
import { loadVelocityHistory } from '@/lib/velocity-load';
import { loadArmcareHistory } from '@/lib/armcare/history';
import { loadAdvice } from '@/lib/nutrition/advice-load';
import { serviceHour } from '@/lib/nutrition/advice-input';
import { countryOf, hasNutrition } from '@/lib/country';
import type { DayDetailUser } from '@/lib/day-detail';
import type { CoachAiRecords } from '@/lib/coach/ai-prompt';

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
const VELO_SHOWN = 3;

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
  if (!focus || !focus.rx[0]) return 'none';
  const v = focusView(focus);
  return { element: focus.rx[0].element, done: v.done, total: v.total, stage: v.stage ?? null, finished: v.finished };
}

/**
 * 최근 측정한 날 셋 — 같은 날 세션은 한 줄로 합친다(구수 더함 · 최고는 큰 값 · 평균은 구수로 무게). 실제 계정에 1구짜리 시험 측정이 같은 날 여럿
 * 따로 잡혀 '최고 89.9'가 그날 값처럼 읽혔다(2026-11-19).
 */
async function veloOf(userId: string, today: string): Promise<CoachAiRecords['velo']> {
  const since = shiftDateKey(today, -VELO_DAYS);
  const days = new Map<string, { types: Set<string>; n: number; max: number; sum: number }>();
  for (const s of await loadVelocityHistory(userId)) {
    if (s.date < since || s.n <= 0) continue;
    const d = days.get(s.date) ?? { types: new Set<string>(), n: 0, max: 0, sum: 0 };
    if (s.sessionType) d.types.add(s.sessionType);
    d.n += s.n;
    d.max = Math.max(d.max, s.maxKmh);
    d.sum += s.avgKmh * s.n;
    days.set(s.date, d);
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, VELO_SHOWN)
    .map(([date, d]) => ({ date, type: [...d.types].join(', ') || null, n: d.n, max: d.max, avg: d.sum / d.n }));
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
    soft(veloOf(user.id, today)),
    soft(armcareOf(user.id, today)),
    soft(foodOf(user, today, now)),
  ]);
  return { lab, mechFocus, velo, armcare, food };
}
