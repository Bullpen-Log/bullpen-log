'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { validateProfile } from '@/lib/profile';

export type ProfileState = { error?: string; success?: string } | undefined;

/** 내 신체 정보(생년월일·키)와 닉네임을 수정한다. */
export async function updateProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const nickname = String(formData.get('nickname') ?? '').trim();
  if (nickname.length < 2) {
    return { error: '닉네임은 2자 이상이어야 합니다.' };
  }

  const checked = validateProfile(
    String(formData.get('birthDate') ?? ''),
    String(formData.get('heightCm') ?? ''),
    { requireBirthDate: true }
  );
  if ('error' in checked) return checked;

  await prisma.user.update({
    where: { id: user.id },
    data: { nickname, ...checked.value },
  });

  // 헤더의 닉네임과 대시보드 안내 문구가 바로 반영되게 한다.
  revalidatePath('/', 'layout');

  return { success: '저장했습니다.' };
}
