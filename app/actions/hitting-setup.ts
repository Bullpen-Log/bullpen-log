'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { isBattingHand, isPosition } from '@/lib/position';

export type HittingSetupResult = { ok: true } | { ok: false; error: string };

/**
 * 타격 첫 설정 — 포지션 · 치는 손을 적고 타격 칸을 연다(2026-10-20, docs/designs/hitting-restructure.md T2).
 * 다시 들어와 고쳐도 처음 연 시각(hitSetupAt)은 그대로 둔다.
 */
export async function finishHittingSetup(input: {
  position: string;
  battingHand: string;
}): Promise<HittingSetupResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (!isPosition(input.position)) return { ok: false, error: '포지션을 골라 주세요.' };
  if (!isBattingHand(input.battingHand)) return { ok: false, error: '치는 손을 골라 주세요.' };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      position: input.position,
      battingHand: input.battingHand,
      hitSetupAt: user.hitSetupAt ?? appNow(),
    },
  });

  /* 타격 판의 잠금 · 막대의 흐림 · 트레이닝의 투구 전용 카드(포지션)까지 새로 읽게 */
  revalidatePath('/', 'layout');
  return { ok: true };
}
