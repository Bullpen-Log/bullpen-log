'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { validateProfile } from '@/lib/profile';
import { validateBaseline } from '@/lib/baseline';
import { validateTargetVelocity } from '@/lib/velocity';
import { withInput, type FormValues } from '@/lib/form-values';

export type ProfileState = {
  error?: string;
  success?: string;
  values?: FormValues;
} | undefined;

/** 내 신체 정보(생년월일·키)와 닉네임을 수정한다. */
export async function updateProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  // 오류로 끝나면 고치던 내용을 돌려준다. 저장 전 값으로 되돌아가면 안 된다.
  return withInput(await tryUpdateProfile(formData), formData);
}

async function tryUpdateProfile(formData: FormData): Promise<ProfileState> {
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

  // 평소 투구량 문진 — 기존 회원이 나중에 채우는 경우가 있어 여기서도 받는다.
  const rawBaseline = {
    baselineFreq: String(formData.get('baselineFreq') ?? ''),
    baselineVolume: String(formData.get('baselineVolume') ?? ''),
    baselineIntensity: String(formData.get('baselineIntensity') ?? ''),
  };
  const anyBaseline = Object.values(rawBaseline).some((v) => v.trim() !== '');
  let baselineValue = {};
  if (anyBaseline) {
    const baseline = validateBaseline(rawBaseline);
    if ('error' in baseline) return baseline;
    baselineValue = baseline.value;
  }

  // 목표 구속 — 비워두면 목표를 지운다.
  const target = validateTargetVelocity(String(formData.get('targetVelocity') ?? ''));
  if ('error' in target) return target;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      nickname,
      ...checked.value,
      ...baselineValue,
      targetVelocity: target.value,
    },
  });

  // 헤더의 닉네임과 대시보드 안내 문구가 바로 반영되게 한다.
  revalidatePath('/', 'layout');

  return { success: '저장했습니다.' };
}
