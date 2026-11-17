import 'server-only';
import { logViewReader } from '@/lib/workout/load/server';
import { compatibleLoadRows } from '@/lib/workout/summary-core';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { buildTrainingLoad, type TrainingLoad } from '@/lib/training-load';
import { estimateTrainingDailyLoad } from '@/lib/baseline';
import { toDateKey } from '@/lib/pitch-stats';
import { ARM_CARE_CATEGORY } from '@/lib/training-volume';
import { isRehabCheck } from '@/lib/armcare/rehab';
import { loadRehabPeriods } from '@/lib/armcare/rehab-store';

/**
 * 운동 부하 지수.
 *
 * 투구 지수와 같은 계산기(computeAcwr)를 쓰되 재료가 다르다 —
 * 투구는 '투구수 × 강도', 운동은 '시간(분) × 강도'.
 *
 * 두 지수를 합치지 않는다. 합치려면 투구수를 분으로 바꿔야 하는데 구당 몇
 * 초인지를 재본 적이 없다. 재보지 않은 숫자로 섞으면 나온 값이 무엇을 뜻하는지
 * 아무도 설명할 수 없다. 지수는 '평소 대비 몇 배'라 단위가 없으므로, 둘을
 * 나란히 두고 읽으면 된다.
 *
 * 시작 기준선은 가입 문진의 '평소 웨이트 빈도'에서 나온다. 투구와 같은 방식이라,
 * 답한 사람은 첫날부터 지수를 본다. 안 답했으면 28일이 쌓여야 나온다.
 */

/** 부하 계산에 필요한 기간. 4주 만성 부하에 여유를 둔다. */
const LOOKBACK_DAYS = 45;

/**
 * 이 함수가 실제로 들여다보는 회원 항목만 적는다.
 *
 * 예전에는 id 만 받고 나머지를 DB 에서 다시 읽었다. 그런데 부르는 쪽은
 * 하나같이 바로 위에서 requireUser() 로 회원을 받아 든 참이었고, 그 안에
 * 이 두 값이 이미 들어 있었다 (lib/dal.ts). 화면마다 쓸데없는 왕복이
 * 한 번씩 더 생기고 있었다.
 */
type UserForTrainingLoad = {
  id: string;
  baselineWorkoutFreq: string | null;
  dailyWorkoutMinutes: number | null;
};

/** 화면·리포트가 부르는 입구. 읽어서 buildTrainingLoad 에 넘긴다. */
/**
 * EX-LOAD01 R1 — 무게 배수의 근거. compared: 같은 견줌 열쇠로 배수에 넣은 요약 줄 수, withheld: kg 이 적혀 있었지만 견줄 문맥이 없어(기구 설정값 ·
 * 맨몸의 옛 kg · 판이 없는 날 · 섞인 무게) 배수 1 로 둔 줄 수. 선택 칸 — 읽는 쪽은 없어도 된다.
 */
export type TrainingLoadWithBasis = TrainingLoad & { weightBasis: { compared: number; withheld: number } };

export async function trainingLoad(
  user: UserForTrainingLoad,
  today = appNow()
): Promise<TrainingLoadWithBasis> {
  const userId = user.id;
  const since = new Date(today);
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  const [all, notes, rehab] = await Promise.all([
    prisma.userExerciseLog.findMany({
      where: { userId, completed: true, date: { gte: since } },
      select: {
        date: true,
        setsDone: true,
        weightKg: true,
        exerciseId: true,
        exercise: {
          select: {
            title: true,
            category: true,
            intensity: true,
            bodyParts: true,
            sets: true,
            reps: true,
            holdSeconds: true,
            restSeconds: true,
            perSide: true,
          },
        },
      },
    }),
    prisma.dailyTrainingNote.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, intensity: true },
    }),
    loadRehabPeriods(userId, toDateKey(since)),
  ]);
  /*
   * 재활(재활 2편)에서 한 체크 중 암케어가 아닌 것(모빌리티 스트레칭 · 파워 메디신볼 던지기 · 상체 스트렝스 컬)은 뺀다 —
   * 암케어를 부하에서 빼는 것과 같은 까닭(lib/training-load.ts). 재활의 암케어 운동은 그대로 두어 암케어 세트로 센다.
   */
  /*
   * EX-LOAD01 — 무게 배수(평소보다 무겁게 들었나)는 견줄 수 있는 무게만으로(lib/workout/load/server.ts logViewReader). 맨몸 운동에
   * 옛 앱이 보낸 kg · 판이 없는 날의 확인 전 kg · 기구 정체 없는 케이블 설정값은 배수에 안 들어간다(세트 수는 그대로 센다).
   */
  const viewOf = await logViewReader(userId, all);
  /*
   * EX-LOAD01 R1 — 실제 입력: 하루 요약 줄(UserExerciseLog, 세트마다의 기구 열쇠 · 스냅샷이 없다)을 그날 판의 얼린 계약으로 본다.
   * 그래서 기구 설정값(케이블 · 머신)은 요약 단계에서 늘 '기구 모름'이라 배수에 안 든다(metricKg null) — 같은 기구를 증명할 수 없어서다.
   * '평소 무게'(referenceWeights)는 운동 번호만이 아니라 **견줌 열쇠(계약 열쇠 — 뜻 · 장비 묶음)가 같은 날끼리만** 견준다: 같은 운동이라도
   * 장비를 바꾼 앞뒤 판(덤벨 한 손 ↔ 바벨 합계)의 kg 을 한 평균에 섞지 않는다. 견줄 수 없는 줄은 세트 수 · 시간 · 강도로만 센다(배수 1).
   */
  /* 열쇠가 다른 줄은 다른 '운동'으로 본다 — buildTrainingLoad 는 exerciseId 를 평소 무게 묶음 열쇠로만 쓴다(부위 · 세트는 exercise 칸) */
  const { rows: logs, compared, withheld } = compatibleLoadRows(
    all.filter(
      (l) =>
        l.exercise.category === ARM_CARE_CATEGORY ||
        !isRehabCheck(l.exercise.title, toDateKey(l.date), rehab)
    ),
    viewOf
  );

  /*
   * 가입 문진으로 평소 운동량을 추정해 첫날부터 지수를 낸다.
   * 안 답했으면 null 이고, 그때는 28일이 쌓여야 나온다.
   */
  const seed = estimateTrainingDailyLoad({
    baselineWorkoutFreq: user.baselineWorkoutFreq,
    dailyWorkoutMinutes: user.dailyWorkoutMinutes,
  });

  /* 견줄 수 없어 배수에서 뺀 무게 줄 수를 함께 싣는다(화면이 '무게 없이 셈'을 말할 수 있게) — 지수 계산 자체는 그대로 */
  return { ...buildTrainingLoad(logs, notes, today, seed), weightBasis: { compared, withheld } };
}
