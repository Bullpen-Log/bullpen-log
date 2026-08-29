'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { deleteVideos } from '@/lib/storage';
import { createSession, deleteSession } from '@/lib/session';
import { validateProfile } from '@/lib/profile';
import { validateBaseline } from '@/lib/baseline';
import { withInput, type FormValues } from '@/lib/form-values';

export type AuthState = { error?: string; values?: FormValues } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 가입 실패로 끝나면 입력한 값을 함께 돌려준다.
 * 이메일 하나 잘못 썼다고 문진까지 다시 채우게 할 수는 없다.
 * (비밀번호는 돌려보내지 않는다 — lib/form-values.ts 참고)
 */
export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  return withInput(await trySignup(formData), formData);
}

async function trySignup(formData: FormData): Promise<AuthState> {
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

  /*
   * 약관·개인정보 동의.
   *
   * 화면에서 required 로 막고 있지만 여기서 한 번 더 본다 — 화면을 거치지 않고
   * 들어올 수 있고, 동의 없이 만들어진 계정은 나중에 되돌릴 방법이 없다.
   */
  if (formData.get('agreeTerms') !== 'on' || formData.get('agreePrivacy') !== 'on') {
    return { error: '이용약관과 개인정보 처리방침에 동의해주세요.' };
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
    baselineWorkoutFreq: String(formData.get('baselineWorkoutFreq') ?? ''),
    throwingHand: String(formData.get('throwingHand') ?? ''),
    competitionLevel: String(formData.get('competitionLevel') ?? ''),
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
  redirect('/today');
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  return withInput(await tryLogin(formData), formData);
}

async function tryLogin(formData: FormData): Promise<AuthState> {
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
  redirect('/today');
}

export async function logout() {
  await deleteSession();
  redirect('/login');
}

/* ─────────────────────────── 계정 관리 ─────────────────────────── */

export type AccountState = { error?: string; success?: string } | undefined;

/** 비밀번호 규칙 한 곳. 가입과 변경이 같은 선을 봐야 한다. */
const MIN_PASSWORD = 8;

/**
 * 비밀번호 바꾸기.
 *
 * 지금까지는 바꿀 방법이 아예 없었다. 남의 컴퓨터에서 로그인했거나 비밀번호를
 * 남에게 보여준 적이 있어도 손쓸 도리가 없었다는 뜻이다.
 *
 * 지금 비밀번호를 먼저 확인한다. 로그인한 채로 자리를 비운 사이 누가 바꿔 버리면
 * 본인이 되레 못 들어오게 된다.
 */
export async function changePassword(
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const current = String(formData.get('currentPassword') ?? '');
  const next = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('newPasswordConfirm') ?? '');

  if (!current || !next) {
    return { error: '지금 비밀번호와 새 비밀번호를 모두 입력해주세요.' };
  }
  if (next.length < MIN_PASSWORD) {
    return { error: `새 비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.` };
  }
  if (next !== confirm) {
    return { error: '새 비밀번호가 서로 다릅니다.' };
  }
  if (next === current) {
    return { error: '지금 쓰는 비밀번호와 같습니다. 다른 것으로 정해주세요.' };
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { password: true },
  });
  if (!row || !(await bcrypt.compare(current, row.password))) {
    return { error: '지금 비밀번호가 맞지 않습니다.' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(next, 10) },
  });

  return { success: '비밀번호를 바꿨습니다.' };
}

/**
 * 회원 탈퇴.
 *
 * 나갈 문이 없는 서비스는 못 쓰는 서비스다. 그만두고 싶은 사람이 사람을 찾아
 * 연락해야 했다.
 *
 * 비밀번호와 '탈퇴' 두 글자를 함께 받는다. 지우면 투구 기록·영상·체크인·운동
 * 기록이 전부 사라지고 되돌릴 수 없다 — 실수로 누르는 자리가 아니어야 한다.
 *
 * 저장소의 영상 파일은 함께 지운다. DB 에서만 지우면 파일만 남아 떠돈다.
 */
export async function deleteAccount(
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const password = String(formData.get('password') ?? '');
  const typed = String(formData.get('confirmWord') ?? '').trim();

  if (typed !== '탈퇴') {
    return { error: '확인란에 탈퇴 두 글자를 그대로 적어주세요.' };
  }
  if (!password) {
    return { error: '비밀번호를 입력해주세요.' };
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { password: true },
  });
  if (!row || !(await bcrypt.compare(password, row.password))) {
    return { error: '비밀번호가 맞지 않습니다.' };
  }

  /*
   * 올려둔 영상을 먼저 챙겨 지운다. 회원을 지우면 기록이 함께 사라져(Cascade)
   * 경로를 알 길이 없어지고, 파일만 저장소에 남는다.
   */
  const logs = await prisma.pitchLog.findMany({
    where: { userId: user.id },
    select: { videoPaths: true },
  });
  const paths = logs.flatMap((l) => l.videoPaths);
  if (paths.length > 0) await deleteVideos(paths);

  await prisma.user.delete({ where: { id: user.id } });
  await deleteSession();
  redirect('/login');
}
