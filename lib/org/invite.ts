import 'server-only';
import { prisma } from '@/lib/prisma';
import { INVITE_DAYS, makeInviteCode } from '@/lib/org/rules';

/**
 * 초대 코드 하나 만들기 — 웹 설정(app/actions/org.ts createInvite)과 앱(app/actions/app-org.ts makeInvite)이 같이 쓴다.
 * 회원(선수) 코드는 기한까지 여럿이 쓰고, 스태프(코치) 코드는 한 번. 권한(누가 만들 수 있나)은 부르는 쪽이 본다.
 * 초대 기한은 실제 시각 — 이 표는 시험 계정의 앱 시계(lib/prisma.ts TIME_FIELDS)를 안 쓴다. 겹치는 코드면 다섯 번까지 다시 뽑는다.
 */
export async function createInviteCode(orgId: string, role: 'PLAYER' | 'STAFF'): Promise<{ code: string; expiresAt: Date } | null> {
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeInviteCode();
    const dup = await prisma.orgInvite.findUnique({ where: { code }, select: { id: true } });
    if (dup) continue;
    await prisma.orgInvite.create({ data: { orgId, code, role, expiresAt } });
    return { code, expiresAt };
  }
  return null;
}
