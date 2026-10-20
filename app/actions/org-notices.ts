'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/dal';
import { requireOrg } from '@/lib/org/access';
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX } from '@/lib/org/rules';

/** 조직 공지(OrgNotice, 5단계) — 앱 전체 공지(SupportNotice)와 다른 표. 선수는 /join 의 '참여한 팀 · 레슨장'에서 본다 */

export type OrgActionState = { error?: string; success?: string } | undefined;

export async function saveOrgNotice(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const user = await requireMaster();
  const org = await requireOrg(user, String(formData.get('orgId') ?? ''));
  const id = String(formData.get('id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim().slice(0, NOTICE_TITLE_MAX);
  const body = String(formData.get('body') ?? '').trim().slice(0, NOTICE_BODY_MAX);
  const pinned = formData.get('pinned') === 'on';
  if (!title) return { error: '제목을 적어 주세요.' };
  if (!body) return { error: '내용을 적어 주세요.' };
  if (id) {
    const found = await prisma.orgNotice.findFirst({ where: { id, orgId: org.id }, select: { id: true } });
    if (!found) return { error: '공지를 찾을 수 없어요.' };
    await prisma.orgNotice.update({ where: { id }, data: { title, body, pinned } });
  } else {
    await prisma.orgNotice.create({ data: { orgId: org.id, title, body, pinned, authorId: user.id } });
  }
  revalidatePath('/master/notices');
  revalidatePath('/master');
  revalidatePath('/join');
  return { success: id ? '고쳤어요.' : '올렸어요.' };
}

export async function deleteOrgNotice(formData: FormData) {
  const user = await requireMaster();
  const n = await prisma.orgNotice.findUnique({ where: { id: String(formData.get('id') ?? '') }, select: { id: true, orgId: true } });
  if (!n) return;
  await requireOrg(user, n.orgId);
  await prisma.orgNotice.delete({ where: { id: n.id } });
  revalidatePath('/master/notices');
  revalidatePath('/master');
  revalidatePath('/join');
}
