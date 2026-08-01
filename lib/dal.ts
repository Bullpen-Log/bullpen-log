import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

/**
 * 현재 로그인한 사용자를 반환한다. 로그인하지 않았으면 null.
 * 한 요청 안에서 여러 번 호출해도 DB는 한 번만 조회한다.
 */
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      nickname: true,
      role: true,
      birthDate: true,
      heightCm: true,
    },
  });

  return user;
});

/** 로그인이 필요한 페이지에서 사용. 비로그인 시 /login으로 보낸다. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** 관리자 전용 동작에서 사용. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') redirect('/dashboard');
  return user;
}
