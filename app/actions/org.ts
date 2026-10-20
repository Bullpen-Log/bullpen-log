'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireMaster } from '@/lib/dal';
import { ORG_COOKIE, requireOrg } from '@/lib/org/access';
import {
  INVITE_DAYS,
  ORG_NAME_MAX,
  ORG_NOTE_MAX,
  ORG_REGION_MAX,
  inviteUsable,
  makeInviteCode,
  normalizeInviteCode,
  orgNameOk,
  parseTags,
} from '@/lib/org/rules';

/**
 * 팀 · 레슨장 마스터의 서버 동작(1단계) — 조직 고르기 · 조직 정보 · 초대 코드 · 구성원 빼기.
 * 모든 동작이 requireMaster(선수 차단) 뒤 requireOrg(그 조직의 마스터 · 스태프 · 관리자)를 거친다.
 */

export type OrgActionState = { error?: string; success?: string } | undefined;

/** 지금 볼 조직을 고른다(쿠키) — 조직 목록 · 위 막대 고르개 */
export async function chooseOrg(formData: FormData) {
  const user = await requireMaster();
  const org = await requireOrg(user, String(formData.get('orgId') ?? ''));
  (await cookies()).set(ORG_COOKIE, org.id, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  revalidatePath('/master', 'layout');
  redirect('/master');
}

/** 조직 이름 · 지역 · 메모 — 조직을 만든 마스터와 관리자만 */
export async function updateOrg(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const user = await requireMaster();
  const org = await requireOrg(user, String(formData.get('orgId') ?? ''));
  if (user.role !== 'ADMIN' && org.ownerId !== user.id)
    return { error: '조직 정보는 만든 사람만 고칠 수 있어요.' };
  const name = String(formData.get('name') ?? '').trim();
  if (!orgNameOk(name)) return { error: `이름을 2~${ORG_NAME_MAX}자로 적어 주세요.` };
  const region =
    String(formData.get('region') ?? '')
      .trim()
      .slice(0, ORG_REGION_MAX) || null;
  const note =
    String(formData.get('note') ?? '')
      .trim()
      .slice(0, ORG_NOTE_MAX) || null;
  await prisma.org.update({ where: { id: org.id }, data: { name, region, note } });
  revalidatePath('/master', 'layout');
  return { success: '고쳤어요.' };
}

/** 초대 코드 만들기 — 회원(선수) 코드는 기한까지 여럿이 쓰고, 스태프 코드는 한 번 */
export async function createInvite(formData: FormData) {
  const user = await requireMaster();
  const org = await requireOrg(user, String(formData.get('orgId') ?? ''));
  const role = formData.get('role') === 'STAFF' ? 'STAFF' : 'PLAYER';
  /* 코치(스태프) 초대는 만든 마스터와 관리자만 — 스태프는 설정 · 스태프 관리를 못 한다(5단계) */
  if (role === 'STAFF' && user.role !== 'ADMIN' && org.ownerId !== user.id) return;
  /* 초대 기한은 실제 시각 — 이 표는 시험 계정의 앱 시계(lib/prisma.ts TIME_FIELDS)를 안 쓴다 */
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeInviteCode();
    const dup = await prisma.orgInvite.findUnique({
      where: { code },
      select: { id: true },
    });
    if (dup) continue;
    await prisma.orgInvite.create({ data: { orgId: org.id, code, role, expiresAt } });
    break;
  }
  revalidatePath('/master/settings');
  revalidatePath('/master');
}

/** 초대 코드 지우기 — 더는 못 쓰게 */
export async function revokeInvite(formData: FormData) {
  const user = await requireMaster();
  const invite = await prisma.orgInvite.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, orgId: true },
  });
  if (!invite) return;
  await requireOrg(user, invite.orgId);
  await prisma.orgInvite.delete({ where: { id: invite.id } });
  revalidatePath('/master/settings');
  revalidatePath('/master');
}

/** 구성원 빼기 — 기록은 선수 것이라 남고, 조직 화면에서만 사라진다(LEFT) */
export async function removeMember(formData: FormData) {
  const user = await requireMaster();
  const member = await prisma.orgMember.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, orgId: true, role: true },
  });
  if (!member || member.role === 'MASTER') return;
  await requireOrg(user, member.orgId);
  await prisma.orgMember.update({
    where: { id: member.id },
    data: { status: 'LEFT', leftAt: new Date() },
  });
  revalidatePath('/master/players');
  revalidatePath('/master');
}

/** 구성원의 이름(조직 안 표시) · 태그 · 메모 — 스태프도 고친다 */
export async function updateMember(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const user = await requireMaster();
  const member = await prisma.orgMember.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, orgId: true },
  });
  if (!member) return { error: '구성원을 찾을 수 없어요.' };
  await requireOrg(user, member.orgId);
  const nickname = String(formData.get('nickname') ?? '')
    .trim()
    .slice(0, 20);
  if (nickname.length < 1) return { error: '이름을 적어 주세요.' };
  const tags = parseTags(String(formData.get('tags') ?? ''));
  const memo =
    String(formData.get('memo') ?? '')
      .trim()
      .slice(0, 500) || null;
  await prisma.orgMember.update({
    where: { id: member.id },
    data: { nickname, tags, memo },
  });
  revalidatePath('/master/players');
  return { success: '고쳤어요.' };
}

/** 코치가 대신 만드는 자리 — 아직 가입 안 한 회원(선수). 나중에 그 사람이 초대 코드로 가입하면 이 자리를 이어받는다(2단계 · 3단계) */
export async function addPlaceholderMember(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const user = await requireMaster();
  const org = await requireOrg(user, String(formData.get('orgId') ?? ''));
  const nickname = String(formData.get('nickname') ?? '')
    .trim()
    .slice(0, 20);
  if (nickname.length < 1) return { error: '이름을 적어 주세요.' };
  const tags = parseTags(String(formData.get('tags') ?? ''));
  await prisma.orgMember.create({
    data: {
      orgId: org.id,
      userId: null,
      role: 'PLAYER',
      status: 'ACTIVE',
      nickname,
      tags,
    },
  });
  revalidatePath('/master/players');
  revalidatePath('/master');
  return { success: '더했어요.' };
}

/** 로그인한 마스터 계정이 스태프 초대 코드로 다른 레슨장 · 팀에 코치로 들어간다(5단계) — 코드는 한 번만 */
export async function joinAsStaff(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const user = await requireMaster();
  const code = normalizeInviteCode(formData.get('code'));
  const invite = code
    ? await prisma.orgInvite.findUnique({
        where: { code },
        select: {
          id: true,
          orgId: true,
          role: true,
          expiresAt: true,
          usedAt: true,
          org: { select: { name: true } },
        },
      })
    : null;
  if (!invite || invite.role !== 'STAFF' || !inviteUsable(invite, new Date()))
    return { error: '코치 초대 코드가 맞지 않거나 기한이 지났어요.' };
  await prisma.$transaction(async (tx) => {
    const existing = await tx.orgMember.findUnique({
      where: { orgId_userId: { orgId: invite.orgId, userId: user.id } },
      select: { id: true, role: true },
    });
    if (existing) {
      await tx.orgMember.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          leftAt: null,
          role: existing.role === 'MASTER' ? 'MASTER' : 'STAFF',
        },
      });
    } else {
      await tx.orgMember.create({
        data: {
          orgId: invite.orgId,
          userId: user.id,
          role: 'STAFF',
          status: 'ACTIVE',
          nickname: user.nickname,
        },
      });
    }
    await tx.orgInvite.update({
      where: { id: invite.id },
      data: { usedById: user.id, usedAt: new Date() },
    });
  });
  (await cookies()).set(ORG_COOKIE, invite.orgId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  revalidatePath('/master', 'layout');
  return { success: `${invite.org.name}에 코치로 들어갔어요.` };
}

/** 요금제 · 자리 수 · 메모(6단계) — 결제 연동 전이라 관리자가 손으로 적는다 */
export async function updateOrgPlan(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  await requireAdmin();
  const id = String(formData.get('orgId') ?? '');
  const org = await prisma.org.findUnique({ where: { id }, select: { id: true } });
  if (!org) return { error: '조직을 찾을 수 없어요.' };
  const plan =
    String(formData.get('plan') ?? '')
      .trim()
      .slice(0, 20) || null;
  const rawSeats = String(formData.get('seats') ?? '').trim();
  const seats = rawSeats ? Number.parseInt(rawSeats, 10) : null;
  if (seats != null && (!Number.isInteger(seats) || seats < 0 || seats > 10_000))
    return { error: '자리 수를 올바르게 적어 주세요.' };
  const planNote =
    String(formData.get('planNote') ?? '')
      .trim()
      .slice(0, 120) || null;
  await prisma.org.update({ where: { id: org.id }, data: { plan, seats, planNote } });
  revalidatePath('/master/orgs');
  revalidatePath('/master/settings');
  return { success: '저장했어요.' };
}

/**
 * 대표관리자가 관리자 화면에서 팀 · 레슨장 화면으로 넘어간다(2026-10-20 사용자: "관리자는 관리자 메뉴에서 전환해서 팀 인터페이스를 보고 사용할 수 있게").
 * 고른 종류의 '내 조직'(관리자가 만든 것)이 있으면 그것, 없으면 하나 만든다 — 관리자가 직접 눌렀을 때만 생긴다. 만든 뒤에는 설정에서 이름을 바꿔 쓴다.
 * 다른 사람의 조직은 /master/orgs 에서 고른다.
 */
export async function adminEnterOrg(formData: FormData) {
  const user = await requireAdmin();
  const kind = formData.get('kind') === 'LESSON' ? 'LESSON' : 'TEAM';
  let org = await prisma.org.findFirst({
    where: { ownerId: user.id, kind },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!org) {
    org = await prisma.$transaction(async (tx) => {
      const created = await tx.org.create({
        data: {
          kind,
          name: kind === 'TEAM' ? '관리자 팀' : '관리자 레슨장',
          ownerId: user.id,
          planNote: '대표관리자 체험용',
        },
        select: { id: true },
      });
      await tx.orgMember.create({
        data: {
          orgId: created.id,
          userId: user.id,
          role: 'MASTER',
          status: 'ACTIVE',
          nickname: user.nickname,
        },
      });
      return created;
    });
  }
  (await cookies()).set(ORG_COOKIE, org.id, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  revalidatePath('/master', 'layout');
  redirect('/master');
}
