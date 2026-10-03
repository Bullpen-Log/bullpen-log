import { intensityLevel } from '@/lib/exercise-meta';
import { TRAINING_GOAL_NAMES } from '@/lib/report/personalize';

/**
 * 목표에 맞춘 횟수 — 2026-10-03 사용자 결정("목표별로 그에 맞는 걸 달성하기 위한 적당한 횟수", 화면에는 숫자 하나).
 *
 * 라이브러리의 세트 · 횟수는 운동마다 하나다. 처음 채울 때 파워는 5회, 나머지는 모두 10회로 넣었다
 * (scripts/prescription-rules.mjs) — 강도가 '매우 높음'인 운동도 10회라, 근력 향상을 골라도 근육 키우는
 * 쪽 횟수가 나왔다. 그래서 일정에 담을 때 목표를 보고 바꾼다. 라이브러리 값은 그대로 둔다.
 *
 * 근거는 흔히 쓰는 저항 훈련 지침(NSCA)이다 — 근력 2~6회, 근비대 6~12회, 근지구력 12회 이상, 파워 1~5회.
 *
 *   근력 향상  무거운 운동(강도 '높음' 이상) 4세트 × 5회, '중간'은 8회
 *   파워 향상  무거운 운동 3세트 × 4회 — 파워 운동에 힘을 남긴다. '중간'은 6회. 파워 운동은 그대로(3세트 × 5회)
 *   컨디셔닝   무게 드는 운동이 안 나오는 날이다. 코어 · 보강(횟수로 하는 것)을 15회
 *
 * 강도 '낮음' 이하의 근력 운동, 버티기(초로 하는 운동), 아직 세트 · 횟수를 안 채운 운동은 그대로다.
 * 가벼운 운동을 5회만 하는 것은 뜻이 없다. 암케어 · 가동성도 그대로다.
 */

const STRENGTH_CATEGORIES = ['하체 스트렝스', '상체 스트렝스'];
const SUPPORT_CATEGORIES = ['코어', '회복 및 보강'];

type GoalReps = {
  /** 강도 '높음' 이상인 근력 운동 */
  heavy?: { sets: number; reps: number };
  /** 강도 '중간'인 근력 운동 — 세트는 그대로 */
  moderate?: { reps: number };
  /** 코어 · 회복 및 보강 — 세트는 그대로 */
  support?: { reps: number };
};

const GOAL_REPS: Record<string, GoalReps> = {
  '근력 향상': { heavy: { sets: 4, reps: 5 }, moderate: { reps: 8 } },
  '파워 향상': { heavy: { sets: 3, reps: 4 }, moderate: { reps: 6 } },
  컨디셔닝: { support: { reps: 15 } },
};

/* 목표 이름이 바뀌면 여기 표가 조용히 안 걸린다. 그 자리에서 막는다. */
for (const name of Object.keys(GOAL_REPS)) {
  if (!TRAINING_GOAL_NAMES.includes(name)) {
    throw new Error(`목표별 횟수 표에 없는 목표가 있다: ${name}`);
  }
}

/* 세트 · 횟수가 없는 모양(일정을 짤 때 거르는 후보)도 받는다 — 그때는 그대로 돌려준다 */
type Prescribed = {
  category: string;
  intensity: string;
  sets?: number | null;
  reps?: number | null;
};

/**
 * 목표를 보고 세트 · 횟수를 바꾼 운동을 돌려준다. 바꿀 것이 없으면 받은 그대로.
 *
 * 일정을 짤 때(daily-plan.ts — 시간 계산이 이 값으로 맞아야 한다), 화면에 보일 때(training/page.tsx),
 * 운동을 시작해 찍어 둘 때와 운동 중에 바꿔 넣을 때(app/actions/workout.ts) 모두 이것을 거친다.
 * 한 곳이라도 빠지면 목록에는 5회인데 운동 화면에는 10회가 나온다.
 */
export function goalPrescription<T extends Prescribed>(
  ex: T,
  goalName: string | null | undefined
): T {
  const spec = goalName ? GOAL_REPS[goalName] : undefined;
  if (!spec || ex.reps == null) return ex;

  if (STRENGTH_CATEGORIES.includes(ex.category)) {
    const level = intensityLevel(ex.intensity);
    if (level >= 4 && spec.heavy) {
      return { ...ex, sets: spec.heavy.sets, reps: spec.heavy.reps };
    }
    if (level === 3 && spec.moderate) return { ...ex, reps: spec.moderate.reps };
    return ex;
  }
  if (SUPPORT_CATEGORIES.includes(ex.category) && spec.support) {
    return { ...ex, reps: spec.support.reps };
  }
  return ex;
}
