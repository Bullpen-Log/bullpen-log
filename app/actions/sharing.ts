'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { notifyCoaches } from '@/lib/org/notify-org';
import { orgOpenHref } from '@/lib/org/space-nav';

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
    select: { userId: true, nickname: true, orgId: true, status: true, consent: { select: { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true } } },
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
  /* 처음 고르거나 바꾸면 대표 · 코치에게(계약 9-6 ③-1 — 앱 app-org.saveConsent 와 같게) */
  const before = member.consent;
  if (member.status === 'ACTIVE' && (!before || KEYS.some((k) => before[k] !== data[k])))
    await notifyCoaches(member.orgId, {
      kind: 'team',
      title: before ? `${member.nickname}님이 보여 주는 기록을 바꿨어요` : `${member.nickname}님이 보여 줄 기록을 골랐어요`,
      link: orgOpenHref(member.orgId, 'c', 'roster'),
    });
  revalidatePath('/sinker/sharing');
}
