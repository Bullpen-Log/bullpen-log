'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser, requireUser } from '@/lib/dal';
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

/**
 * 종 밑 작은 창(components/notification-list.tsx — 싱커 · 덕아웃 둘 다, 2026-10-22 금윤호 "진짜 알림으로, 없으면 알림이 없습니다")이 열릴 때 읽는다.
 * 로그인 전이면 빈 목록(덕아웃은 로그인 없이 보는 공간이라 막지 않는다).
 */
export type BellNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  /** ISO — 화면이 '방금 · 3분 전'으로 바꾼다 */
  at: string;
};

export async function loadBellNotifications(): Promise<{ items: BellNotification[]; unread: number }> {
  const user = await getCurrentUser();
  if (!user) return { items: [], unread: 0 };
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return {
    items: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      read: !!n.readAt,
      at: n.createdAt.toISOString(),
    })),
    unread,
  };
}

/** 종의 점 — 안 읽은 알림 수(로그인 전 0) */
export async function countBellNotifications(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  return prisma.notification.count({ where: { userId: user.id, readAt: null } });
}

/** 종 창에서 읽음 — 하나(id) 또는 전부(id 없음). 화면 다시 그리기는 부르는 쪽이 한다(창이 닫히지 않게 revalidate 하지 않는다) */
export async function readBellNotifications(id?: string): Promise<number> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return prisma.notification.count({ where: { userId: user.id, readAt: null } });
}
