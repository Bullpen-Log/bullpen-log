import 'server-only';
import { revalidatePath } from 'next/cache';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dbDate } from '@/lib/nutrition/days';
import { readDailyPlan } from '@/lib/report/daily-plan';
import { remakeFieldsOf } from '@/lib/report/state-notice';
import type { CoachVolume } from '@/lib/report/volume';
import { generateAppTodayPlan } from '@/app/actions/training-setup';
import type { DaySlot } from '@/lib/coach/week';

/**
 * 하루의 주인 하나(개인 비서 2단계, 2026-11-20 김민: "코치와 오늘의 운동이 따로 놀면 안 된다") — 코치가 오늘을 바꾸면 오늘 운동도 같은 만들기
 * 길(training-setup generateTodayPlan)로 다시 짠다. 운동을 시작한 날은 오늘이 잠겨 부르는 쪽이 여기 오지 않는다.
 */

/**
 * 오늘 운동을 지금 상태로 다시 짠다 — 만든 판이 있으면 그 칸 그대로(다시 만들기 띠와 같은 remakeFieldsOf), 없으면 자동 맞춤으로 새로.
 * auto 를 주면 자동 맞춤으로(코치가 부위 · 종류를 바꾼 날 — 자동 맞춤이 오늘 고른 부위 · 종류를 읽는다), coachVolume 을 주면 그 운동량으로.
 * 만들기는 체크인이 없으면 아무것도 안 하고 돌아간다(만들기 쪽 규칙 그대로).
 */
export async function remakeToday(userId: string, today: string, opts: { coachVolume?: CoachVolume | null; auto?: boolean } = {}): Promise<void> {
  const row = await prisma.dailyTrainingSetup.findUnique({ where: { userId_date: { userId, date: dbDate(today) } }, select: { plan: true, availableEquipment: true } });
  const saved = readDailyPlan(row?.plan);
  const base = saved
    ? remakeFieldsOf(saved, { returnTo: '/training', availableToday: row?.availableEquipment })
    : [['mode', 'auto'] as [string, string], ...(row?.availableEquipment ?? []).map((n) => ['availableEquipment', n] as [string, string])];
  const fields = base.filter(([k]) => k !== 'coachVolume' && !(opts.auto && k === 'mode'));
  if (opts.auto) fields.push(['mode', 'auto']);
  const volume = opts.coachVolume === undefined ? saved?.coachVolume : opts.coachVolume;
  if (volume) fields.push(['coachVolume', volume]);
  try {
    await generateAppTodayPlan(fields);
  } catch (e) {
    /* 만들기는 끝에 화면으로 돌려보낸다(redirect) — 그것이 '다 만들었다'는 뜻이다 */
    if (!isRedirectError(e)) throw e;
  }
  revalidatePath('/training');
}

/**
 * 코치 일정이 오늘을 바꾸면(applyCoachAdjust) 이미 만든 오늘 운동도 같이 — 오늘이 운동 없는 칸이 되면(쉬기 · 옮겨 감) 만든 판을 걷고,
 * 운동 칸이면 다시 짠다(자동 맞춤이 코치 시간을 그대로 읽는다). 아직 안 만든 날은 그대로.
 */
export async function syncTodayPlan(userId: string, week: readonly DaySlot[], today: string, changed: readonly string[]): Promise<void> {
  if (!changed.includes(today)) return;
  const where = { userId_date: { userId, date: dbDate(today) } };
  const row = await prisma.dailyTrainingSetup.findUnique({ where, select: { plan: true } });
  if (!readDailyPlan(row?.plan)) return;
  const works = week.find((s) => s.date === today)?.items.some((x) => x.kind === 'train' || x.kind === 'program');
  if (works) return remakeToday(userId, today);
  await prisma.dailyTrainingSetup.update({ where, data: { plan: Prisma.DbNull, generatedAt: null } });
  revalidatePath('/training');
}
