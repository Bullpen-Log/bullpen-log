'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createSession, deleteSession } from '@/lib/session';
import { validateProfile } from '@/lib/profile';
import { validateBaseline } from '@/lib/baseline';

export type AuthState = { error?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const nickname = String(formData.get('nickname') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const passwordConfirm = String(formData.get('passwordConfirm') ?? '');

  if (!email || !nickname || !password) {
    return { error: '모든 항목을 입력해주세요.' };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: '올바른 이메일 형식이 아닙니다.' };
  }
  if (nickname.length < 2) {
    return { error: '닉네임은 2자 이상이어야 합니다.' };
  }
  if (password.length < 8) {
    return { error: '비밀번호는 8자 이상이어야 합니다.' };
  }
  if (password !== passwordConfirm) {
    return { error: '비밀번호가 일치하지 않습니다.' };
  }

  // 나이는 안전한 투구수 한도를 정하는 기준이라 가입할 때 함께 받는다.
  const profile = validateProfile(
    String(formData.get('birthDate') ?? ''),
    String(formData.get('heightCm') ?? ''),
    { requireBirthDate: true }
  );
  if ('error' in profile) return profile;

  // 평소 투구량 문진 — 부하 지수를 첫날부터 내기 위한 추정 기준선.
  const baseline = validateBaseline({
    baselineFreq: String(formData.get('baselineFreq') ?? ''),
    baselineVolume: String(formData.get('baselineVolume') ?? ''),
    baselineIntensity: String(formData.get('baselineIntensity') ?? ''),
  });
  if ('error' in baseline) return baseline;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: '이미 가입된 이메일입니다.' };
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const role = adminEmail && email === adminEmail ? 'ADMIN' : 'USER';

  const user = await prisma.user.create({
    data: {
      email,
      nickname,
      password: await bcrypt.hash(password, 10),
      role,
      ...profile.value,
      ...baseline.value,
    },
    select: { id: true, role: true },
  });

  await createSession({ userId: user.id, role: user.role });
  redirect('/dashboard');
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: '이메일과 비밀번호를 입력해주세요.' };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, password: true },
  });

  // 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분하지 않는다.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  await createSession({ userId: user.id, role: user.role });
  redirect('/dashboard');
}

export async function logout() {
  await deleteSession();
  redirect('/login');
}
