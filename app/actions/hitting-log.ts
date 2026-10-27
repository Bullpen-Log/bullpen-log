'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow, appNowMs } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { DUPLICATE_WINDOW_MS, validateHitting, validateHittingSession, type HittingInput, type HittingSessionInput } from '@/lib/hitting-log';

export type HittingSaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

/**
 * 타격 기록 남기기 · 고치기(2026-10-20 타격 1단계 T5). 본인 기록만 — 고칠 때는 id 와 userId 를 같이 본다.
 * 새로 남길 때 같은 날 · 같은 종류 · 같은 스윙 수를 2분 안에 또 보내면 새로 안 만든다(끊긴 응답에 다시 누름 — 투구 기록과 같은 규칙).
 */
export async function saveHittingLog(input: HittingInput & { id?: string }): Promise<HittingSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  const checked = validateHitting(input, toDateKey(appNow()));
  if ('error' in checked) return { ok: false, error: checked.error, field: checked.field };
  const v = checked.value;
  const data = {
    date: new Date(`${v.date}T00:00:00.000Z`),
    sessionType: v.sessionType,
    swings: v.swings,
    effortPct: v.effortPct,
    memo: v.memo,
    satisfaction: v.satisfaction,
  };

  if (input.id) {
    const { count } = await prisma.hittingLog.updateMany({
      where: { id: input.id, userId: user.id },
      data,
    });
    if (count === 0) return { ok: false, error: '기록을 찾지 못했어요. 새로고침해 주세요.' };
    revalidatePath('/hitting');
    return { ok: true, id: input.id };
  }

  const dup = await prisma.hittingLog.findFirst({
    where: {
      userId: user.id,
      date: data.date,
      sessionType: data.sessionType,
      swings: data.swings,
      createdAt: { gte: new Date(appNowMs() - DUPLICATE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (dup) return { ok: true, id: dup.id };

  const row = await prisma.hittingLog.create({
    data: { ...data, userId: user.id },
    select: { id: true },
  });
  revalidatePath('/hitting');
  return { ok: true, id: row.id };
}

/** 타격 기록 지우기 — 본인 것만 */
export async function deleteHittingLog(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const { count } = await prisma.hittingLog.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return { ok: false, error: '기록을 찾지 못했어요.' };
  revalidatePath('/hitting');
  return { ok: true };
}

/** 새 기록은 요청 ID를 재사용해 재전송을 중복 없이 처리한다. 옛 테이블은 그대로 둔다. */
export async function saveHittingSession(input: HittingSessionInput & { id: string; editing: boolean }): Promise<HittingSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) {
    return { ok: false, error: '기록을 만들지 못했어요. 다시 시작해 주세요.' };
  }
  const checked = validateHittingSession(input, toDateKey(appNow()));
  if ('error' in checked) return { ok: false, error: checked.error, field: checked.field };
  const v = checked.value;
  const data = { date: new Date(`${v.date}T00:00:00.000Z`), sessionType: v.sessionType, swings: v.swings, effortPct: v.effortPct, memo: v.memo, satisfaction: v.satisfaction };
  if (input.editing) {
    const { count } = await prisma.hittingSession.updateMany({ where: { id: input.id, userId: user.id }, data });
    if (!count) return { ok: false, error: '기록을 찾지 못했어요. 새로고침해 주세요.' };
  } else {
    const result = await prisma.hittingSession.createMany({ data: [{ ...data, id: input.id, userId: user.id }], skipDuplicates: true });
    if (!result.count) {
      const existing = await prisma.hittingSession.findFirst({ where: { id: input.id, userId: user.id }, select: { id: true, date: true, sessionType: true, swings: true, effortPct: true, memo: true, satisfaction: true } });
      if (!existing) return { ok: false, error: '기록을 만들지 못했어요. 다시 시작해 주세요.' };
      if (existing.date.getTime() !== data.date.getTime() || existing.sessionType !== data.sessionType || existing.swings !== data.swings || existing.effortPct !== data.effortPct || existing.memo !== data.memo || existing.satisfaction !== data.satisfaction) {
        return { ok: false, error: '이전에 보낸 기록이 이미 저장됐어요. 새로고침해 확인한 뒤 수정해 주세요.' };
      }
    }
  }
  revalidatePath('/hitting');
  return { ok: true, id: input.id };
}

export async function deleteHittingSession(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const { count } = await prisma.hittingSession.deleteMany({ where: { id, userId: user.id } });
  if (!count) return { ok: false, error: '기록을 찾지 못했어요.' };
  revalidatePath('/hitting');
  return { ok: true };
}
