'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import {
  checkOptionalNumber,
  MAX_WEIGHT_KG,
  MAX_WINGSPAN_CM,
  MIN_WEIGHT_KG,
  MIN_WINGSPAN_CM,
  validateProfile,
} from '@/lib/profile';
import { validateBaseline } from '@/lib/baseline';
import { validateTargetVelocity } from '@/lib/velocity';
import { WORKOUT_MINUTES_CHOICES } from '@/lib/report/theme';
import { withInput, type FormValues } from '@/lib/form-values';
import { deleteVideos, isOwnedBy } from '@/lib/storage';

export type ProfileState =
  | {
      error?: string;
      success?: string;
      values?: FormValues;
    }
  | undefined;

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

  // 가입 문진 — 기존 회원이 나중에 채우는 경우가 있어 여기서도 받는다.
  const rawBaseline = {
    baselineFreq: String(formData.get('baselineFreq') ?? ''),
    baselineVolume: String(formData.get('baselineVolume') ?? ''),
    baselineIntensity: String(formData.get('baselineIntensity') ?? ''),
    baselineWorkoutFreq: String(formData.get('baselineWorkoutFreq') ?? ''),
    throwingHand: String(formData.get('throwingHand') ?? ''),
    competitionLevel: String(formData.get('competitionLevel') ?? ''),
  };
  const anyBaseline = Object.values(rawBaseline).some((v) => v.trim() !== '');
  let baselineValue = {};
  if (anyBaseline) {
    const baseline = validateBaseline(rawBaseline);
    if ('error' in baseline) return baseline;
    baselineValue = baseline.value;
  }

  /*
   * 몸무게와 윙스팬 — 둘 다 비워둘 수 있다.
   *
   * 화면이 파운드·인치로 보여주더라도 여기로는 언제나 kg·cm 가 온다(숨겨 둔
   * 칸이 바꿔 보낸다). 단위가 섞여 들어오면 나중에 어느 줄이 파운드인지
   * 알 수 없다.
   */
  const weight = checkOptionalNumber(String(formData.get('weightKg') ?? ''), {
    label: '몸무게',
    min: MIN_WEIGHT_KG,
    max: MAX_WEIGHT_KG,
    unit: 'kg',
  });
  if ('error' in weight) return weight;

  const wingspan = checkOptionalNumber(String(formData.get('wingspanCm') ?? ''), {
    label: '윙스팬',
    min: MIN_WINGSPAN_CM,
    max: MAX_WINGSPAN_CM,
    unit: 'cm',
  });
  if ('error' in wingspan) return wingspan;

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
      weightKg: weight.value,
      wingspanCm: wingspan.value,
      ...baselineValue,
      ...minutesValue,
      targetVelocity: target.value,
      /*
       * 경력·목표·장비는 여기서 건드리지 않는다. 트레이닝 화면에서 고르고
       * saveTrainingSettings 가 저장한다. 이 폼은 그 항목을 보내지 않으므로,
       * 여기서 함께 쓰면 프로필을 저장할 때마다 설정이 지워진다.
       */
    },
  });

  // 헤더의 닉네임과 대시보드 안내 문구가 바로 반영되게 한다.
  revalidatePath('/', 'layout');

  return { success: '저장했습니다.' };
}

/**
 * 프로필 사진을 바꾸거나 지운다.
 *
 * 파일은 이미 브라우저가 저장소에 올린 뒤다(app/api/profile/avatar-url).
 * 여기서는 '어느 파일이 내 사진인가'만 적는다.
 *
 * 경로를 그대로 믿지 않는다. 폼에서 오는 값이라 남의 폴더를 가리켜 보낼 수
 * 있는데, 그러면 남의 사진을 자기 프로필로 걸 수 있다. 본인 폴더인지 여기서
 * 확인한다(isOwnedBy).
 *
 * 쓰던 사진은 새것이 자리를 잡은 뒤에 지운다. 먼저 지우면 저장이 실패했을 때
 * 사진만 사라진다.
 */
export async function saveAvatar(path: string | null): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  if (path != null && !isOwnedBy(path, user.id)) {
    return { error: '올린 사진을 찾지 못했습니다. 다시 시도해주세요.' };
  }

  const before = user.avatarPath;
  if (before === path) return { success: '저장했습니다.' };

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarPath: path },
  });

  /* 쓰지 않게 된 파일은 저장소에서도 치운다 — 안 지우면 바꿀 때마다 쌓인다 */
  if (before) await deleteVideos([before]);

  // 막대와 상단 바의 아바타가 바로 바뀌게 한다.
  revalidatePath('/', 'layout');

  return { success: path ? '사진을 바꿨습니다.' : '사진을 지웠습니다.' };
}
