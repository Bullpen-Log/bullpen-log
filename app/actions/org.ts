'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/dal';
import { ORG_COOKIE, requireOrg } from '@/lib/org/access';
import {
  INVITE_DAYS,
  ORG_NAME_MAX,
  ORG_NOTE_MAX,
  ORG_REGION_MAX,
  makeInviteCode,
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
