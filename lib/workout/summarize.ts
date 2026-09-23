import 'server-only';

/**
 * 세트들을 운동별 요약 한 줄로 접는다.
 *
 * 기존 UserExerciseLog 를 그대로 두고 여기서 만든 값으로 채운다. 부하 지수·
 * 부위별 세트 수·'최근에 한 운동'·달력의 개수까지 그 표를 읽는 코드가 전부
 * 그대로 돌게 하기 위해서다. 세트가 진실이고, 요약은 거기서 다시 계산한다.
 */

export type SetRow = {
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
};

export type ExerciseSummary = {
  exerciseId: string;
  setsDone: number;
  repsDone: number | null;
  holdSecondsDone: number | null;
  weightKg: number | null;
};

/**
 * 가장 자주 나온 값. 같으면 큰 쪽.
 *
 * 평균을 쓰지 않는다. 8·8·7 을 했으면 '7.7회'가 아니라 '8회씩 했다'가 사람이
 * 기억하는 숫자이고, 다음에 얼마를 할지 정하는 것도 그 숫자다. 세트당 값이라
 * 더할 수도 없다.
 */
function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const count = new Map<number, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);

  let best = values[0];
  let bestN = 0;
  for (const [v, n] of count) {
    if (n > bestN || (n === bestN && v > best)) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/**
 * 운동별로 접는다.
 *
 * 세트 수는 더하고, 무게는 가장 무거웠던 세트로 못박고, 횟수와 버티기 초는
 * 가장 자주 나온 값으로 둔다. 무게를 '가장 무거웠던 것'으로 두는 이유는
 * 세트마다 올리는 사람이 대부분이라(40 → 50 → 60) 하나만 남긴다면 그것이
 * 사람이 기억하는 숫자이기 때문이다.
 */
export function summarizeSets(rows: readonly SetRow[]): ExerciseSummary[] {
  const byExercise = new Map<string, SetRow[]>();
  for (const r of rows) {
    const list = byExercise.get(r.exerciseId);
    if (list) list.push(r);
    else byExercise.set(r.exerciseId, [r]);
  }

  return [...byExercise].map(([exerciseId, list]) => {
    const weights = list
      .map((r) => r.weightKg)
      .filter((w): w is number => w != null && w > 0);

    return {
      exerciseId,
      setsDone: list.length,
      repsDone: mode(list.map((r) => r.reps).filter((v): v is number => v != null)),
      holdSecondsDone: mode(
        list.map((r) => r.holdSeconds).filter((v): v is number => v != null)
      ),
      weightKg: weights.length ? Math.max(...weights) : null,
    };
  });
}

/**
 * 오늘 든 무게를 다 더한 값(kg).
 *
 * 무게 × 횟수를 세트마다 더한다. 맨몸 운동과 버티기는 들어가지 않는다 —
 * 무게가 없으니 더할 것이 없다. 이 숫자는 종료 요약에만 쓰고 부하 계산에는
 * 쓰지 않는다.
 */
export function totalVolumeKg(rows: readonly SetRow[]): number {
  return Math.round(
    rows.reduce(
      (sum, r) =>
        sum + (r.weightKg != null && r.reps != null ? r.weightKg * r.reps : 0),
      0
    )
  );
}
