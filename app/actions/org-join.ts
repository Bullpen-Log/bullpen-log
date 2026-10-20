'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { consentFromForm, inviteUsable, normalizeInviteCode } from '@/lib/org/rules';

/**
 * 선수가 초대 코드로 조직(팀 · 레슨장)에 참여한다 — 선수 화면 app/(app)/join. 마스터 계정은 여기로 못 온다((app) 틀이 /master 로 보낸다).
 * 공유 범위는 참여 화면의 체크박스(scope-*)에서 — 기본값은 lib/org/rules.ts consentDefaults.
 */
export async function joinOrg(formData: FormData) {
  const user = await requireUser();
  const code = normalizeInviteCode(formData.get('code'));
  if (!code) redirect('/join?error=code');
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
  if (!invite || !inviteUsable(invite, new Date())) redirect('/join?error=expired');
  /* 스태프 코드는 마스터 계정이 쓰는 것(5단계) — 선수 계정에는 안 맞는다 */
  if (invite.role !== 'PLAYER' && user.accountType !== 'MASTER')
    redirect('/join?error=staff');
  const consent = consentFromForm((name) => formData.get(name));

  await prisma.$transaction(async (tx) => {
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
  });
  revalidatePath('/join');
  revalidatePath('/master', 'layout');
  redirect(`/join?joined=${invite.orgId}`);
}
