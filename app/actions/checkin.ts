'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import {
  CHECKIN_PARTS,
  parseCheckinDetail,
  pickCheckinParts,
  pickWorkoutKind,
  validateCheckin,
  validateCheckinDate,
} from '@/lib/checkin';
import { availableParts } from '@/lib/report/today-pick';
import { withInput, type FormValues } from '@/lib/form-values';
import { visibleExercises } from '@/lib/library-cache';

export type CheckinState =
  | {
      error?: string;
      success?: string;
      /** 저장한 날짜(YYYY-MM-DD). 체크인 관문이 이것을 보고 닫힌다. */
      savedDate?: string;
      values?: FormValues;
    }
  | undefined;

/** 오늘의 몸상태 체크인을 저장한다. 이미 있으면 덮어쓴다. */
export async function saveCheckin(
  _prev: CheckinState,
  formData: FormData
): Promise<CheckinState> {
  // 오류로 끝나면 고른 것들을 돌려준다. 부위마다 다시 고르게 할 수 없다.
  return withInput(await trySaveCheckin(formData), formData);
}

async function trySaveCheckin(formData: FormData): Promise<CheckinState> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 날짜는 사용자 시간대 기준의 오늘을 폼에서 받는다.
  // 서버(UTC) 기준 자정 근처에 한국은 이미 다음 날이기 때문이다.
  const dateKey = String(formData.get('date') ?? '');
  if (!validateCheckinDate(dateKey)) {
    return { error: '체크인 날짜가 올바르지 않습니다. 새로고침 후 다시 시도해주세요.' };
  }

  const parts = Object.fromEntries(
    CHECKIN_PARTS.map((p) => [p.key, String(formData.get(p.key) ?? '')])
  );
  /*
   * 고를 수 있는 부위는 라이브러리에서 그때그때 뽑는다.
   * 화면이 보여준 목록과 저장할 때 인정하는 목록이 같아야 하고,
   * 운동을 새로 올리면 코드를 고치지 않아도 따라온다.
   */
  /* 누가 보든 같은 목록이라 캐시에서 꺼낸다 (lib/library-cache.ts) */
  const library = await visibleExercises();

  const checked = validateCheckin(
    {
      ...parts,
      condition: String(formData.get('condition') ?? ''),
      sleep: String(formData.get('sleep') ?? ''),
    },
    {
      raw: formData.getAll('preferredParts').map(String),
      available: availableParts(library),
    }
  );
  if ('error' in checked) return checked;

  const date = new Date(`${dateKey}T00:00:00.000Z`);

  /* 간편 체크인이 받는 것 — 몸 상태·컨디션·수면. 늘 저장한다. */
  const quick = {
    ...pickCheckinParts(checked.value),
    condition: checked.value.condition,
    sleep: checked.value.sleep,
  };

  /*
   * 상세 쪽(운동 선호 · 상세 기록)은 폼이 담아 보냈을 때만(detail=1) 바꾼다.
   *
   * 간편 체크인에는 그 칸들이 아예 없다. 그때도 값을 쓰면, 아침에 상세로 적어
   * 둔 몸무게·메모가 저녁에 간편으로 고치는 순간 빈 값으로 덮인다.
   */
  let detail = {};
  if (formData.get('detail') === '1') {
    const parsed = parseCheckinDetail((name) => String(formData.get(name) ?? ''));
    if ('error' in parsed) return parsed;
    detail = {
      ...parsed.value,
      preferredParts: checked.value.preferredParts,
      /*
       * 운동 종류는 검사에 넣지 않고 여기서 거른다. 목록에 없는 값이 오면
       * 안 고른 것으로 보면 되지, 저장 전체를 막을 일이 아니다.
       */
      preferredWorkout: pickWorkoutKind(formData.get('preferredWorkout')),
    };
  }

  await prisma.dailyCheckin.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: { ...quick, ...detail },
    create: { userId: user.id, date, preferredParts: [], ...quick, ...detail },
  });

  // 통증·뻐근함은 오늘의 운동 후보를 바꾼다.
  revalidatePath('/today');
  revalidatePath('/training');
  /* 체크인 관문은 모든 화면의 틀(레이아웃)에 있다. 거기도 오늘 체크인을 알아야 한다. */
  revalidatePath('/', 'layout');
  return { success: '오늘 체크인을 저장했습니다.', savedDate: dateKey };
}
