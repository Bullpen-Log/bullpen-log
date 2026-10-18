'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { getCurrentUser } from '@/lib/dal';
import {
  checkOptionalNumber,
  MAX_NICKNAME,
  MAX_WEIGHT_KG,
  MIN_WEIGHT_KG,
  isSex,
  toDateInputValue,
  validateProfile,
  type Sex,
} from '@/lib/profile';
import { withInput, type FormValues } from '@/lib/form-values';
import { createAvatarUrl, deleteVideos, forgetPlaybackUrls, isOwnAvatarPath } from '@/lib/storage';

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
  if (!user) return { error: '로그인이 필요해요.' };

  const nickname = String(formData.get('nickname') ?? '').trim();
  if (nickname.length < 2) {
    return { error: '닉네임은 2자 이상이어야 해요.' };
  }
  /* 가입(20자)과 같은 선 — 내 정보에만 위 한계가 없어 아무 길이나 저장됐다(2026-10-17) */
  if (nickname.length > MAX_NICKNAME) {
    return { error: `닉네임은 ${MAX_NICKNAME}자까지예요.` };
  }

  const checked = validateProfile(
    String(formData.get('birthDate') ?? ''),
    String(formData.get('heightCm') ?? ''),
    { requireBirthDate: true }
  );
  if ('error' in checked) return checked;

  /*
   * 몸무게 — 비워둘 수 있다. 윙스팬 · 하루 운동 시간 · 던지는 손 · 평소 웨이트는 2026-10-15 내 정보에서 뺐다(김민) — 여기서 쓰지 않아
   * 저장된 값은 그대로 남는다(던지는 손 · 운동 시간은 투구 · 트레이닝 첫 설정이 정한다).
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

  /*
   * 성별 — 영양 목표의 기초대사량 계산에 쓴다.
   *
   * 안 고르고 저장하면 지금 값을 그대로 둔다. 이 칸이 생기기 전에 가입한 계정은
   * 비어 있어서, 여기서 꼭 고르라고 하면 닉네임 하나 고치려다 막힌다.
   */
  const rawSex = String(formData.get('sex') ?? '').trim();
  let sexValue = {};
  if (rawSex !== '') {
    if (!isSex(rawSex)) return { error: '성별을 다시 골라주세요.' };
    sexValue = { sex: rawSex };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      nickname,
      ...checked.value,
      ...sexValue,
      weightKg: weight.value,
      /* 목표 구속은 2026-10-10 부터 사용자가 적지 않는다 — 나중에 앱이 계산해 채운다 */
      /*
       * 경력·목표·장비는 여기서 건드리지 않는다. 트레이닝 화면에서 고르고
       * saveTrainingSettings 가 저장한다. 이 폼은 그 항목을 보내지 않으므로,
       * 여기서 함께 쓰면 프로필을 저장할 때마다 설정이 지워진다.
       */
    },
  });

  /*
   * 몸무게를 바꿨으면 오늘 체중 기록에도 남긴다 — 영양 목표 · 소모 칼로리는 최근 30일 체중 기록을 User 보다 먼저 읽어서(lib/nutrition/load.ts
   * recentWeightKg), 프로필에서만 고치면 한 달 동안 옛 체중으로 셌다(2026-10-16 통합 검토 D5: 가장 최근 기록 하나가 진실). 그대로면 안 쓴다 —
   * 닉네임만 고쳐도 오늘 기록이 생기면 다른 날 적은 체중보다 앞서 버린다.
   */
  if (weight.value != null && weight.value !== user.weightKg) {
    const date = dbDate(toDateKey(appNow()));
    await prisma.dailyNutrition.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { weightKg: weight.value },
      create: { userId: user.id, date, weightKg: weight.value },
    });
  }

  // 헤더의 닉네임과 대시보드 안내 문구가 바로 반영되게 한다(성별 · 몸무게가 바뀌면 영양 목표도).
  revalidatePath('/', 'layout');

  return { success: '저장했어요.' };
}

/**
 * 프로필 사진을 바꾸거나 지운다.
 *
 * 파일은 이미 브라우저가 저장소에 올린 뒤다(app/api/profile/avatar-url).
 * 여기서는 '어느 파일이 내 사진인가'만 적는다.
 *
 * 경로를 그대로 믿지 않는다. 폼에서 오는 값이라 남의 폴더를 가리켜 보낼 수
 * 있는데, 그러면 남의 사진을 자기 프로필로 걸 수 있다. 본인 사진 자리인지 여기서
 * 확인한다(isOwnAvatarPath) — 본인 폴더인지만 보면 자기 투구 영상을 사진으로 걸
 * 수 있고, 다음에 사진을 바꿀 때 그 영상이 '쓰던 사진'으로 지워진다.
 *
 * 쓰던 사진은 새것이 자리를 잡은 뒤에 지운다. 먼저 지우면 저장이 실패했을 때
 * 사진만 사라진다.
 */
export async function saveAvatar(path: string | null): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요해요.' };

  if (path != null && !isOwnAvatarPath(path, user.id)) {
    return { error: '올린 사진을 찾지 못했어요. 다시 해 주세요.' };
  }

  const before = user.avatarPath;
  if (before === path) {
    /*
     * 바꿀 것은 없지만 화면은 새로 보낸다. 다른 기기에서 이미 바꾼(지운) 사진을 이
     * 탭이 옛것으로 들고 있으면, 여기서 새로 그려야 막대의 사진까지 맞춰진다.
     */
    revalidatePath('/', 'layout');
    return { success: '저장했어요.' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarPath: path },
  });

  /*
   * 쓰지 않게 된 파일은 저장소에서도 치운다 — 안 지우면 바꿀 때마다 쌓인다.
   *
   * 사진 자리일 때만 지운다. 예전(검사가 폴더만 보던 때)에 다른 파일이 사진으로
   * 걸렸을 수 있다. 들고 있던 옛 주소도 버린다.
   */
  if (before) {
    forgetPlaybackUrls([before]);
    if (isOwnAvatarPath(before, user.id)) await deleteVideos([before]);
  }

  // 막대와 상단 바의 아바타가 바로 바뀌게 한다.
  revalidatePath('/', 'layout');

  return { success: path ? '사진을 바꿨어요.' : '사진을 지웠어요.' };
}

/* ─────────────────────────────── 아이폰 앱 ─────────────────────────────── */

export type AppProfile = {
  email: string;
  nickname: string;
  /** YYYY-MM-DD, 안 적었으면 '' */
  birthDate: string;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  isAdmin: boolean;
  /** 지금 사진의 임시 주소 — 없으면 글자 아바타 */
  avatarUrl: string | null;
  today: string;
};

/**
 * 아이폰 앱(native/src/app/profile.tsx)의 내 정보 — 웹 내 정보 창(components/profile-panel.tsx)이 레이아웃에서 받는 것과 같은 값.
 * /api/rpc/profile.loadAppProfile 로 부른다.
 */
export async function loadAppProfile(): Promise<({ ok: true } & AppProfile) | { ok: false; to: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  return {
    ok: true,
    email: user.email,
    nickname: user.nickname,
    birthDate: user.birthDate ? toDateInputValue(user.birthDate) : '',
    sex: isSex(user.sex) ? user.sex : null,
    heightCm: user.heightCm,
    weightKg: user.weightKg,
    isAdmin: user.role === 'ADMIN',
    avatarUrl: await createAvatarUrl(user.avatarPath),
    today: toDateKey(appNow()),
  };
}

/** 앱의 내 정보 저장 — 웹 폼(updateProfile)과 같은 칸 · 같은 검사. 앱은 FormData 를 못 보내 칸을 글자로 받아 폼으로 바꾼다(키 cm · 몸무게 kg) */
export async function updateAppProfile(fields: Record<string, unknown>): Promise<ProfileState> {
  const form = new FormData();
  for (const k of ['nickname', 'birthDate', 'sex', 'heightCm', 'weightKg']) form.set(k, String(fields?.[k] ?? ''));
  return tryUpdateProfile(form);
}
