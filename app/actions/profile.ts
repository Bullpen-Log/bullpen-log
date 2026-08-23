'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { validateProfile } from '@/lib/profile';
import { validateBaseline } from '@/lib/baseline';
import { validateTargetVelocity } from '@/lib/velocity';
import { WORKOUT_MINUTES_CHOICES } from '@/lib/report/theme';
import { readTrainingProfile } from '@/lib/report/personalize';
import { withInput, type FormValues } from '@/lib/form-values';

export type ProfileState = {
  error?: string;
  success?: string;
  values?: FormValues;
} | undefined;

/**
 * 오늘의 운동 화면에서 하루 운동 시간을 기본값으로 저장한다.
 *
 * 시간 버튼 자체는 주소(?time=)로만 움직여 오늘 하루에 그친다.
 * 이 동작은 그 값을 프로필 기본값으로 굳히는 것이라, 끝나면 주소의
 * ?time= 을 지운 화면으로 보낸다 — 이제 기본값이 같은 값이다.
 */
export async function saveWorkoutMinutes(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const minutes = Number.parseInt(String(formData.get('minutes') ?? ''), 10);
  if (!(WORKOUT_MINUTES_CHOICES as readonly number[]).includes(minutes)) {
    redirect('/today');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { dailyWorkoutMinutes: minutes },
  });

  revalidatePath('/today');
  revalidatePath('/profile');
  redirect('/today');
}

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

  /*
   * 하루 운동 시간 — "45분" 형태로 오므로 숫자만 꺼내 허용 목록과 대조한다.
   * 안 고르고 저장하면(기존 화면 등) 지금 값을 그대로 둔다.
   */
  const rawMinutes = String(formData.get('dailyWorkoutMinutes') ?? '').trim();
  let minutesValue = {};
  if (rawMinutes !== '') {
    const minutes = Number.parseInt(rawMinutes, 10);
    if (!(WORKOUT_MINUTES_CHOICES as readonly number[]).includes(minutes)) {
      return { error: '하루 운동 시간을 다시 골라주세요.' };
    }
    minutesValue = { dailyWorkoutMinutes: minutes };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      nickname,
      ...checked.value,
      ...baselineValue,
      ...minutesValue,
      targetVelocity: target.value,
      // 경력·목표·장비. 안 고르면 비워 두고, 그러면 아무것도 안 걸러진다.
      ...readTrainingProfile(formData),
    },
  });

  // 헤더의 닉네임과 대시보드 안내 문구가 바로 반영되게 한다.
  revalidatePath('/', 'layout');

  return { success: '저장했습니다.' };
}
