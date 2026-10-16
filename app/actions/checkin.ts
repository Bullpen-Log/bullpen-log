'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import {
  CHECKIN_NOTE_MAX,
  CHECKIN_PARTS,
  SLEEP_QUALITY_LEVELS,
  parseArmPain,
  pickCheckinParts,
  sleepLevelFromQuality,
  validateCheckin,
  validateCheckinDate,
} from '@/lib/checkin';
import { parseBodySpots, partsFromSpots } from '@/lib/body-spots';
import { withInput, type FormValues } from '@/lib/form-values';

export type CheckinState =
  | {
      error?: string;
      success?: string;
      /** 저장한 날짜(YYYY-MM-DD). 체크인 관문이 이것을 보고 닫힌다. */
      savedDate?: string;
      values?: FormValues;
    }
  | undefined;

/**
 * 오늘의 몸상태 체크인을 저장한다. 이미 있으면 덮어쓴다.
 *
 * 3판(2026-10-13)부터 받는 것은 신호 셋과 메모만(components/checkin-flow/flow.tsx):
 *   condition      1~10
 *   sleepQuality   1~5(없으면 옛 느낌 칸 sleep 만 — '보통')
 *   bodySpots      몸 그림에서 고른 근육(JSON) — 다섯 부위 칸은 여기서 만든다(partsFromSpots)
 *   armPainSpots · armPainLevel   어깨 · 팔꿈치 '통증'일 때 자리 · 정도
 *   note           메모(CHECKIN_NOTE_MAX)
 * 운동 종류 · 부위 · 끼니 · 식욕 · 던지는 일정 · 몸무게 · 팔 피로 · 근육통 · 잔 시간은 더 받지 않는다 — 탭 카드(app/actions/day-cards.ts)로
 * 갔거나 3판에서 뺐다. 옛 화면이 그 칸을 보내도 조용히 무시한다(열은 남아 있어 옛 기록은 읽힌다).
 */
export async function saveCheckin(
  _prev: CheckinState,
  formData: FormData
): Promise<CheckinState> {
  // 오류로 끝나면 고른 것들을 돌려준다.
  return withInput(await trySaveCheckin(formData), formData);
}

async function trySaveCheckin(formData: FormData): Promise<CheckinState> {
  const user = await getCurrentUser();
  if (!user) return { error: '로그인이 필요해요.' };

  // 날짜는 사용자 시간대 기준의 오늘을 폼에서 받는다.
  // 서버(UTC) 기준 자정 근처에 한국은 이미 다음 날이기 때문이다.
  const dateKey = String(formData.get('date') ?? '');
  if (!validateCheckinDate(dateKey)) {
    return { error: '체크인 날짜가 올바르지 않아요. 새로고침한 뒤 다시 해 주세요.' };
  }

  /*
   * 불편한 곳 — 몸 그림에서 고른 근육이 원본(2026-10-12, lib/body-spots.ts). 다섯 부위 칸은 그 부위 근육 가운데 가장 센 값.
   * 화면이 부위 칸도 보내면(흐름은 같은 함수로 계산해 보낸다) 근육이 말하는 것보다 높을 때만 그쪽을 쓴다 — 통증 관문
   * (hasPain)이 어느 쪽으로 골랐든 놓치지 않게. 아무것도 안 보낸 부위는 '정상'.
   */
  const spotsRaw = formData.get('bodySpots');
  const bodySpots = spotsRaw == null ? {} : parseBodySpots(String(spotsRaw));
  const fromSpots = partsFromSpots(bodySpots);
  const RANK: Record<string, number> = { 정상: 0, 뻐근: 1, 통증: 2 };
  const parts = Object.fromEntries(
    CHECKIN_PARTS.map((p) => {
      const sent = String(formData.get(p.key) ?? '').trim() || '정상';
      const spot = fromSpots[p.key];
      return [p.key, (RANK[spot] ?? 0) > (RANK[sent] ?? -1) ? spot : sent];
    })
  );

  const checked = validateCheckin(
    {
      ...parts,
      condition: String(formData.get('condition') ?? ''),
      sleep: String(formData.get('sleep') ?? ''),
    },
    /* 하고 싶은 부위는 3판부터 체크인이 묻지 않는다(트레이닝 탭 카드) — 늘 빈 목록 */
    { raw: [], available: [] }
  );
  if ('error' in checked) return checked;

  /*
   * 수면의 질 1~5 — 화면이 보내면 저장하고, 비울 수 없는 옛 느낌 칸(sleep)은 거기서 맞춘다(sleepLevelFromQuality).
   * 안 보내면 느낌 칸만('보통'). 범위 밖은 화면으로는 못 만든다 — 막는다.
   */
  const sleepQualityRaw = String(formData.get('sleepQuality') ?? '').trim();
  const sleepQuality = sleepQualityRaw === '' ? null : Number(sleepQualityRaw);
  if (
    sleepQuality != null &&
    !(
      Number.isInteger(sleepQuality) &&
      sleepQuality >= 1 &&
      sleepQuality <= SLEEP_QUALITY_LEVELS.length
    )
  ) {
    return { error: '수면의 질을 골라주세요.' };
  }

  /* 팔 통증 자리 · 정도 — 어깨 · 팔꿈치가 '통증'이 아니면 [] · null 이라 지난 값이 남지 않는다(lib/checkin.ts parseArmPain) */
  const armPain = parseArmPain(
    (name) => formData.getAll(name).map(String),
    checked.value
  );

  const note = String(formData.get('note') ?? '').trim();
  if (note.length > CHECKIN_NOTE_MAX) {
    return { error: `메모는 ${CHECKIN_NOTE_MAX}자까지 적을 수 있어요.` };
  }

  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const saved = {
    ...pickCheckinParts(checked.value),
    condition: checked.value.condition,
    sleep:
      sleepQuality != null ? sleepLevelFromQuality(sleepQuality) : checked.value.sleep,
    sleepQuality,
    ...armPain,
    bodySpots,
    note: note || null,
    /*
     * 3판이 묻지 않는 옛 칸 — 같은 날 2판으로 적은 값이 남으면 엔진이 그 값을 오늘 것으로 읽는다(근육통 · 팔 피로가 3판 어림보다
     * 먼저라서, 2026-10-16 통합 검토). 비워 두면 gather.ts 가 몸 그림 · 팔 통증에서 어림한다.
     */
    soreness: null,
    sleepHours: null,
    armFatigue: null,
  };

  await prisma.dailyCheckin.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: saved,
    create: { userId: user.id, date, preferredParts: [], ...saved },
  });

  // 통증·뻐근함 · 수면 · 컨디션은 오늘의 운동 후보 · 암케어 · 영양 조언을 바꾼다.
  revalidatePath('/today');
  revalidatePath('/training');
  revalidatePath('/nutrition');
  /* 체크인 관문은 모든 화면의 틀(레이아웃)에 있다. 거기도 오늘 체크인을 알아야 한다. */
  revalidatePath('/', 'layout');
  return { success: '오늘 체크인을 저장했어요.', savedDate: dateKey };
}
