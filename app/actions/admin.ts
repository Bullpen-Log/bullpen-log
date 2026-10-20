'use server';

import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { deleteUserCompletely } from '@/lib/delete-user';
import { ROLE_LABEL, parseRole } from '@/lib/permissions';

export type AdminState = { error?: string; success?: string; tempPassword?: string } | undefined;

async function assertAdmin() {
  const user = await getCurrentUser();
  return user?.role === 'ADMIN' ? user : null;
}

/**
 * 회원의 역할을 정한다 — 일반 · 준관리자 · 대표관리자(2026-10-20, lib/permissions.ts). 대표관리자만, 본인 역할은 못 바꾼다.
 * 폼에 role 이 없으면(옛 앱 · 옛 화면) 예전처럼 대표관리자 ↔ 일반을 뒤집는다.
 */
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

  const asked = formData.get('role');
  const nextRole = asked == null ? (target.role === 'ADMIN' ? 'USER' : 'ADMIN') : parseRole(asked);
  if (nextRole === target.role) return { success: `${target.nickname}님은 이미 ${ROLE_LABEL[nextRole]}예요.` };

  await prisma.user.update({
    where: { id: userId },
    data: { role: nextRole },
  });

  revalidatePath('/admin');
  return {
    success: `${target.nickname}님을 ${ROLE_LABEL[nextRole]}로 바꿨어요.`,
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

  /* 저장소의 그 사람 파일까지 — 본인 탈퇴와 같은 길(lib/delete-user.ts) */
  await deleteUserCompletely(userId);

  revalidatePath('/admin');
  return { success: `${target.nickname}님을 삭제했습니다.` };
}

/* 헷갈리는 글자(0 O o 1 l I)를 뺀 글자 — 관리자가 말이나 메시지로 전해 주는 비밀번호라 읽기 쉬워야 한다 */
const TEMP_PASSWORD_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 임시 비밀번호 만들기 — 메일 보내는 길이 없어 비밀번호를 잊은 회원은 운영자에게 문의한다(로그인 화면 '비밀번호를 잊었어요').
 * 대표관리자만. 10자를 만들어 그 회원의 비밀번호로 정하고, 한 번만 돌려준다(저장하지 않는다 — 관리자가 회원에게 전한다).
 * 비밀번호가 바뀌면 그 회원의 모든 기기 로그인이 풀린다(로그인 표의 비밀번호 지문, lib/dal.ts getCurrentUser).
 */
export async function resetUserPassword(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const admin = await assertAdmin();
  if (!admin) return { error: '관리자만 사용할 수 있습니다.' };

  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { error: '대상을 찾을 수 없습니다.' };
  /* 본인 것은 내 정보에서 바꾼다 — 여기서 바꾸면 지금 이 로그인도 풀린다 */
  if (userId === admin.id) return { error: '본인 비밀번호는 내 정보에서 바꿔 주세요.' };

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } });
  if (!target) return { error: '대상을 찾을 수 없습니다.' };

  const tempPassword = Array.from({ length: 10 }, () => TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)]).join('');
  await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(tempPassword, 10) } });

  return { success: `${target.nickname}님의 임시 비밀번호를 만들었어요.`, tempPassword };
}
