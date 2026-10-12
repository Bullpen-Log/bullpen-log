import { HEAVY_CATEGORIES } from '@/lib/engine/exercise-class';
import { goalPrescription } from '@/lib/report/goal-prescription';

/**
 * 그날 일정의 양 조절(세트 조절)과 처방 한 길 — 트레이닝 추천 2판 P5(2026-10-12, docs/designs/training-recommendation-engine.md).
 *
 * 왜 두는가. 2판 P5 는 컨디션이 평소보다 낮은 날 · 최근 운동이 힘들었던 날 · 잠이 모자라거나 근육통이 '많이'인 날에 본운동을
 * 한 세트씩 줄인다. 그런데 세트 · 횟수는 일정을 만들 때 저장하지 않고, 보일 때마다 목표(goal-prescription.ts)로 다시 센다 —
 * 일정을 짤 때 · 트레이닝 화면 목록 · '운동 추가' 목록 · 홈의 운동 시간 · 운동 시작 때 얼리기 · 운동 중 바꿔 넣기 · 기록의 '계획'이
 * 모두 그렇다(2026-10-12 아홉 자리). 한 자리라도 줄인 세트를 모르면 목록에는 3세트인데 운동 화면에는 4세트가 나온다. 그래서 일정
 * (DailyPlan)과 세션 판(FrozenPlan)에 줄인 것을 volume 칸으로 싣고, 아홉 자리가 모두 planPrescription 하나로 센다.
 *
 * 순수 파일이다 — DB · server-only · 날짜 함수가 없고, exercise-class(잎) · goal-prescription 만 부른다. theme · prescription ·
 * daily-plan 을 값으로 부르지 않는다(그쪽이 이 파일을 부를 수 있게 — theme → prescription → 여기 → theme 순환을 막는다).
 *
 * 처음 커밋(P5-b)은 길만 놓는다 — volume 을 만드는 쪽이 아직 없어 늘 없고, 그러면 planPrescription 은 goalPrescription 과 같은
 * 값이다(동작 변화 0). 언제 줄이는지(decideVolume)는 다음 커밋들이 이 파일에 더한다.
 */

/** 세트를 줄여도 이만큼은 남긴다 — 3세트 이상인 운동만 한 세트 줄인다(두 세트 운동을 한 세트로 만들면 운동 자체가 흐려진다) */
export const VOLUME_MIN_SETS = 2;

/**
 * 그날 일정의 양 조절. 일정(DailyPlan.volume)과 그 일정으로 연 세션 판(FrozenPlan.volume)에 같은 모양으로 실린다.
 * 줄인 것이 없는 날은 칸 자체가 없다(옛 줄과 같은 모양 — 그래서 DailyPlan.version 은 그대로).
 */
export type PlanVolume = {
  /** 본운동(무게 드는 카테고리) 세트를 몇 개 줄였나 — 지금은 한 세트(−1)만 있다 */
  setDelta: -1 | 0;
  /**
   * 그날 가장 센 운동을 뺐나(−1). 처방 숫자로는 못 내린다 — 라이브러리 강도가 운동마다 하나라, 빼는 일은 안전 거르기
   * (lib/report/prescription.ts 의 강도 상한)가 한다. 여기는 그 사실을 적어 두는 칸이다(무게를 올리지 않는 판단 등이 읽는다).
   */
  intensityStep: -1 | 0;
  /** 화면에 보일 까닭 한 줄(해요체, 줄표 없음) */
  why: string;
};

/** 판정에 필요한 칸 — 라이브러리 줄 · 캐시 · 목표 처방을 거친 운동이 모두 넘길 수 있게 좁게 둔다(goal-prescription 의 Prescribed 와 같은 칸) */
type Prescribed = {
  category: string;
  intensity: string;
  sets?: number | null;
  reps?: number | null;
};

/**
 * 저장된 칸을 읽는다. 모양이 아니면 null — 줄이지 않는다(옛 줄 · 깨진 값 · 남이 고쳐 보낸 값).
 *
 * 새 객체로 돌려준다(모르는 칸은 버린다). intensityStep 이 없는 것은 0 으로 읽는다. 둘 다 0 이면 줄인 것이 없으니 null —
 * '칸이 있으면 무언가 줄였다'가 늘 참이게 한다. 일정은 JSON 으로 저장돼(DailyTrainingSetup.plan · TrainingSession.plan) 읽을 때마다
 * 여기를 거친다 — planPrescription 이 이것만 믿는다.
 */
export function readPlanVolume(value: unknown): PlanVolume | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const setDelta = v.setDelta;
  const intensityStep = v.intensityStep === undefined ? 0 : v.intensityStep;
  if (setDelta !== -1 && setDelta !== 0) return null;
  if (intensityStep !== -1 && intensityStep !== 0) return null;
  if (typeof v.why !== 'string' || v.why.trim() === '') return null;
  if (setDelta === 0 && intensityStep === 0) return null;
  return { setDelta, intensityStep, why: v.why };
}

/**
 * 양 조절을 운동 하나에 댄다. 바꿀 것이 없으면 받은 그대로(같은 객체).
 *
 *   줄이는 것  무게 드는 카테고리(하체 · 상체 스트렝스 · 파워 — lib/engine/exercise-class.ts HEAVY_CATEGORIES)의 세트를 setDelta 만큼,
 *             단 VOLUME_MIN_SETS 밑으로는 안 내린다(3세트 이상만 줄어든다)
 *   그대로     코어 · 회복 및 보강 · 가동성 · 암케어 · 유산소(몸에 남는 쪽이 아니다), 세트를 안 채운 운동, 횟수 · 시간 · 휴식
 *
 * 목표 처방(goalPrescription) 다음에 댄다 — 근력 향상이 무거운 운동을 4세트로 정한 뒤 그 4를 줄여야 한다(앞에 대면 목표가 덮는다).
 */
export function applyVolume<T extends Prescribed>(
  ex: T,
  volume: PlanVolume | null | undefined
): T {
  if (!volume || volume.setDelta === 0) return ex;
  if (!HEAVY_CATEGORIES.includes(ex.category)) return ex;
  if (ex.sets == null) return ex;
  const sets = ex.sets + volume.setDelta;
  if (sets < VOLUME_MIN_SETS) return ex;
  return { ...ex, sets };
}

/**
 * 처방 한 길 — 그날 목표에 맞춘 세트 · 횟수(goalPrescription) 위에 그날 양 조절(volume)을 댄 것.
 *
 * 세트 · 횟수를 세는 모든 자리가 이것을 부른다(2026-10-12 아홉 자리 — 일정을 짤 때 · 트레이닝 화면 목록 · '운동 추가' 목록 · 홈의
 * 운동 시간 · 운동 시작 때 얼리기 · 운동 중 [교체] 목록 · 바꿔 넣기 · 기록의 '계획' 둘, 기준선 도구의 세트 어댑터도). 한 곳이라도
 * goalPrescription 을 바로 부르면 그 자리만 줄인 세트를 모른다.
 *
 * plan 은 저장된 일정(DailyPlan) · 세션 판(FrozenPlan) · 그 둘에서 고른 칸({ goal, volume }) 무엇이든 된다 — goal 과 volume 만 본다.
 * volume 은 저장된 값이라 여기서 readPlanVolume 으로 다시 읽는다(깨진 값은 안 줄임). 프로그램 날(근력 · 파워 프로그램)의 운동은
 * 이 길을 안 거친다 — 프로그램 처방(lib/program/program.ts)이 따로 있다(D6).
 */
export function planPrescription<T extends Prescribed>(
  ex: T,
  plan: { goal?: string | null; volume?: unknown } | null | undefined
): T {
  return applyVolume(goalPrescription(ex, plan?.goal), readPlanVolume(plan?.volume));
}
