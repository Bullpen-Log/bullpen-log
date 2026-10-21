'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';

/**
 * 연결(2026-10-21 개편 4단계 4-5, /sinker/sharing) — 어느 팀 · 레슨장에 무엇을 보일지(ShareConsent). 내 구성원 줄만 고친다.
 * 칸 이름은 표 그대로(pitch · training · checkin · video · nutrition · weight).
 */
const KEYS = ['pitch', 'training', 'checkin', 'video', 'nutrition', 'weight'] as const;

export async function setShareConsent(formData: FormData): Promise<void> {
  const user = await requireUser();
  const memberId = String(formData.get('memberId') ?? '');
  const member = await prisma.orgMember.findUnique({
    where: { id: memberId },
    select: { userId: true },
  });
  if (!member || member.userId !== user.id) return;
  const on = new Set(formData.getAll('keys').map(String));
  const data = Object.fromEntries(KEYS.map((k) => [k, on.has(k)])) as Record<
    (typeof KEYS)[number],
    boolean
  >;
  await prisma.shareConsent.upsert({
    where: { memberId },
    update: { ...data, byUserId: user.id },
    create: { memberId, ...data, byUserId: user.id },
  });
  revalidatePath('/sinker/sharing');
}
