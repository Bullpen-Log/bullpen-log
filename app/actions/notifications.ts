'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';

/** 알림함(2026-10-21 개편 5단계 5-2) — 읽음 표시. 하나 또는 전부 */
export async function markNotificationsRead(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}
