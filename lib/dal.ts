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
      targetVelocity: true,
      baselineFreq: true,
      baselineVolume: true,
      baselineIntensity: true,
      dailyWorkoutMinutes: true,
      ownedEquipment: true,
      trainingLevel: true,
      trainingGoal: true,
    },
  });

  return user;
});

/** 로그인이 필요한 페이지에서 사용. 비로그인 시 /login으로 보낸다. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    /*
     * 토큰은 멀쩡한데 회원이 없는 경우가 있다 — 관리자가 계정을 삭제했는데
     * 그 사람 브라우저에 로그인 쿠키가 남아 있을 때.
     *
     * 이때 그냥 /login 으로 보내면 프록시가 토큰만 보고 다시 /dashboard 로
     * 돌려보내 무한 리다이렉트가 된다. 페이지를 그리는 중에는 쿠키를 지울
     * 수 없으므로, 쿠키를 지워주는 경로를 한 번 거쳐서 나간다.
     */
    const session = await getSession();
    redirect(session ? '/api/session/clear' : '/login');
  }
  return user;
}

/** 관리자 전용 동작에서 사용. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') redirect('/dashboard');
  return user;
}
