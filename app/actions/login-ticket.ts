'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser, requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { createSession, passwordFingerprint } from '@/lib/session';
import { isTicketCode, makeTicketCode, normalizeTicketCode, ticketStateOf, TICKET_TTL_MS } from '@/lib/login-ticket';

/**
 * 코드 · QR 로그인(2026-10-21 개편 7단계 7-3) — 셋.
 * 1 createLoginTicket: PC(로그인 전)가 코드를 만든다. 2 approveLoginTicket: 로그인된 폰이 /link/<code> 에서 승인(requireUser).
 * 3 claimLoginTicket: PC 가 2초마다 묻다가 승인됐으면 그 사람으로 세션을 만든다 — 코드는 한 번만, 2분 안에.
 * 코드는 32^8 ≈ 1조 가지라 맞히기는 어렵고, 승인 전엔 아무 정보도 안 준다.
 */
export async function createLoginTicket(): Promise<{ code: string; expiresAt: string }> {
  const now = Date.now();
  /* 지난 것 정리 — 표가 안 자라게 */
  await prisma.loginTicket.deleteMany({ where: { expiresAt: { lt: new Date(now - 60 * 60 * 1000) } } }).catch(() => undefined);
  for (let i = 0; i < 5; i++) {
    const code = makeTicketCode();
    try {
      const t = await prisma.loginTicket.create({ data: { code, expiresAt: new Date(now + TICKET_TTL_MS) } });
      return { code: t.code, expiresAt: t.expiresAt.toISOString() };
    } catch {
      /* 겹침 — 다시 */
    }
  }
  throw new Error('코드를 만들지 못했어요. 다시 시도해 주세요.');
}

export async function approveLoginTicket(formData: FormData): Promise<void> {
  const user = await requireUser();
  const code = normalizeTicketCode(String(formData.get('code') ?? ''));
  if (!isTicketCode(code)) return;
  const now = new Date();
  await prisma.loginTicket.updateMany({
    where: { code, userId: null, claimedAt: null, expiresAt: { gt: now } },
    data: { userId: user.id },
  });
  redirect(`/link/${code}?done=1`);
}

export async function claimLoginTicket(input: { code: string }): Promise<{ state: 'waiting' | 'approved' | 'expired' | 'used' }> {
  const code = normalizeTicketCode(String(input?.code ?? ''));
  if (!isTicketCode(code)) return { state: 'expired' };
  const now = new Date();
  const t = await prisma.loginTicket.findUnique({ where: { code } });
  if (!t) return { state: 'expired' };
  const state = ticketStateOf(t, now);
  if (state !== 'approved' || !t.userId) return { state };
  /* 한 번만 — 먼저 claimedAt 을 찍고(원자적) 그 뒤 세션 */
  const taken = await prisma.loginTicket.updateMany({ where: { code, claimedAt: null }, data: { claimedAt: now } });
  if (taken.count !== 1) return { state: 'used' };
  const user = await prisma.user.findUnique({ where: { id: t.userId }, select: { id: true, role: true, password: true } });
  if (!user) return { state: 'expired' };
  /* 이미 다른 계정으로 로그인돼 있던 PC 면 바꿔 끼운다 */
  await getCurrentUser();
  await createSession({ userId: user.id, role: user.role, pw: passwordFingerprint(user.password) }, true);
  return { state: 'approved' };
}
