import 'server-only';
import type { AccountType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { inviteUsable, normalizeInviteCode, type Consent } from '@/lib/org/rules';

/**
 * 초대 코드로 조직에 들어가기 — 웹 참여 화면(app/actions/org-join.ts joinOrg)과 앱(app/actions/app-org.ts joinOrgApp)이 같이 쓴다.
 * 코치가 대신 만든 자리(초대의 memberId)는 그 줄을 이어받고, 공유 범위는 들어가는 사람이 고른 그대로 저장한다(합류 = 동의를 함께 고름).
 */
export type JoinResult = { ok: true; orgId: string; memberId: string } | { ok: false; error: 'code' | 'expired' | 'staff' };

export async function joinWithCode(
  user: { id: string; nickname: string; accountType: AccountType },
  rawCode: unknown,
  consent: Consent
): Promise<JoinResult> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return { ok: false, error: 'code' };
  const invite = await prisma.orgInvite.findUnique({
    where: { code },
    select: {
      id: true,
      orgId: true,
      role: true,
      memberId: true,
      expiresAt: true,
      usedAt: true,
    },
  });
  if (!invite || !inviteUsable(invite, new Date())) return { ok: false, error: 'expired' };
  /* 스태프 코드는 마스터 계정이 쓰는 것(5단계) — 선수 계정에는 안 맞는다 */
  if (invite.role !== 'PLAYER' && user.accountType !== 'MASTER') return { ok: false, error: 'staff' };

  const memberId = await prisma.$transaction(async (tx) => {
    const existing = await tx.orgMember.findUnique({
      where: { orgId_userId: { orgId: invite.orgId, userId: user.id } },
      select: { id: true, status: true },
    });
    let memberId: string;
    if (existing) {
      memberId = existing.id;
      if (existing.status !== 'ACTIVE')
        await tx.orgMember.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', leftAt: null, joinedAt: new Date() },
        });
    } else if (invite.memberId) {
      /* 코치가 대신 만들어 둔 자리를 이어받는다 — 그 자리의 이름 · 태그 · 메모는 그대로 */
      const placeholder = await tx.orgMember.findFirst({
        where: { id: invite.memberId, orgId: invite.orgId, userId: null },
        select: { id: true },
      });
      if (placeholder) {
        await tx.orgMember.update({
          where: { id: placeholder.id },
          data: { userId: user.id, status: 'ACTIVE', joinedAt: new Date() },
        });
        memberId = placeholder.id;
      } else {
        const created = await tx.orgMember.create({
          data: {
            orgId: invite.orgId,
            userId: user.id,
            role: invite.role,
            status: 'ACTIVE',
            nickname: user.nickname,
          },
          select: { id: true },
        });
        memberId = created.id;
      }
    } else {
      const created = await tx.orgMember.create({
        data: {
          orgId: invite.orgId,
          userId: user.id,
          role: invite.role,
          status: 'ACTIVE',
          nickname: user.nickname,
        },
        select: { id: true },
      });
      memberId = created.id;
    }
    await tx.shareConsent.upsert({
      where: { memberId },
      update: { ...consent, byUserId: user.id },
      create: { memberId, ...consent, byUserId: user.id },
    });
    if (invite.role !== 'PLAYER') {
      await tx.orgInvite.update({
        where: { id: invite.id },
        data: { usedById: user.id, usedAt: new Date() },
      });
    }
    return memberId;
  });
  return { ok: true, orgId: invite.orgId, memberId };
}
