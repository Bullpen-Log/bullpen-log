'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { profileHref, readPublicKeys } from '@/lib/public-profile';

/** 공개 프로필에 보일 싱커 항목 저장(2026-10-21 개편 3단계 3-6) — 내 것(/me)의 체크 상자 */
export async function setPublicSinker(formData: FormData): Promise<void> {
  const user = await requireUser();
  const keys = readPublicKeys(formData.getAll('keys').map(String));
  await prisma.user.update({ where: { id: user.id }, data: { publicSinker: keys } });
  revalidatePath('/me');
  revalidatePath(profileHref(user.nickname));
}
