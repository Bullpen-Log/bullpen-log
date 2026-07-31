'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';

export type AdminState = { error?: string; success?: string } | undefined;

async function assertAdmin() {
  const user = await getCurrentUser();
  return user?.role === 'ADMIN' ? user : null;
}

/** 회원의 관리자 권한을 켜고 끈다. 본인 권한은 바꿀 수 없다. */
export async function toggleUserRole(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const admin = await assertAdmin();
  if (!admin) return { error: '관리자만 사용할 수 있습니다.' };

  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { error: '대상을 찾을 수 없습니다.' };

  // 스스로 권한을 내려 잠기는 상황을 막는다.
  if (userId === admin.id) {
    return { error: '본인의 권한은 변경할 수 없습니다.' };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, nickname: true },
  });
  if (!target) return { error: '대상을 찾을 수 없습니다.' };

  const nextRole = target.role === 'ADMIN' ? 'USER' : 'ADMIN';

  await prisma.user.update({
    where: { id: userId },
    data: { role: nextRole },
  });

  revalidatePath('/admin');
  return {
    success:
      nextRole === 'ADMIN'
        ? `${target.nickname}님을 관리자로 지정했습니다.`
        : `${target.nickname}님의 관리자 권한을 해제했습니다.`,
  };
}

/** 회원을 삭제한다. 그 회원의 기록·게시글도 함께 사라진다. */
export async function deleteUser(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const admin = await assertAdmin();
  if (!admin) return { error: '관리자만 사용할 수 있습니다.' };

  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { error: '대상을 찾을 수 없습니다.' };

  if (userId === admin.id) {
    return { error: '본인 계정은 삭제할 수 없습니다.' };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { nickname: true },
  });
  if (!target) return { error: '대상을 찾을 수 없습니다.' };

  await prisma.user.delete({ where: { id: userId } });

  revalidatePath('/admin');
  return { success: `${target.nickname}님을 삭제했습니다.` };
}
