import { formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, round1, toWeight, type WeightUnit } from '@/lib/units';

/**
 * 세트들을 운동별 요약 한 줄로 접는다.
 *
 * 기존 UserExerciseLog 를 그대로 두고 여기서 만든 값으로 채운다. 부하 지수·
 * 부위별 세트 수·'최근에 한 운동'·달력의 개수까지 그 표를 읽는 코드가 전부
 * 그대로 돌게 하기 위해서다. 세트가 진실이고, 요약은 거기서 다시 계산한다.
 *
 * server-only 를 달지 않는다. 종료 요약 화면이 저장하기 전에 같은 함수로
 * 미리 접어 보여주기 때문이다 — 규칙이 둘로 갈리면 화면에는 60kg 이라고
 * 떠 놓고 기록에는 다른 숫자가 들어간다.
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
 * 운동별 요약 한 줄 — '4세트 · 10회 · 25kg'.
 *
 * 종료 요약과 트레이닝 화면의 완료 카드가 같은 줄을 보여준다. 둘이 따로
 * 만들면 한쪽만 '25kg'이고 다른 쪽은 '25 kg'가 되는 식으로 어긋난다.
 *
 * 무게는 고른 단위(kg·lb)로 적는다. 단위는 브라우저에만 있어서 화면 쪽이
 * 넘겨준다(components/use-units.ts). 안 넘기면 kg 이다.
 */
export function formatSummary(s: ExerciseSummary, unit: WeightUnit = 'kg'): string {
  const parts: string[] = [`${s.setsDone}세트`];
  if (s.repsDone != null) parts.push(`${s.repsDone}회`);
  if (s.holdSecondsDone != null) parts.push(formatSeconds(s.holdSecondsDone));
  const weight = formatWeight(s.weightKg, unit);
  if (weight) parts.push(weight);
  return parts.join(' · ');
}

/**
 * 오늘 든 무게를 다 더한 값(kg).
 *
 * 무게 × 횟수를 세트마다 더한다. 맨몸 운동과 버티기는 들어가지 않는다 —
 * 무게가 없으니 더할 것이 없다. 이 숫자는 종료 요약과 완료 카드에만 쓰고
 * 부하 계산에는 쓰지 않는다.
 *
 * 소수 한 자리까지 둔다. 처음에는 정수로 반올림했는데, 2.5kg 한 번을 들면
 * 아래 줄에는 '2.5kg'이라 적어 놓고 위에는 '3kg'이 떴다. 원판이 0.5kg
 * 단위라 합도 늘 0.5 의 배수이고, 한 자리면 넉넉하다. (0.1 + 0.2 같은
 * 자리 오차도 여기서 걷힌다.)
 */
export function totalVolumeKg(rows: readonly SetRow[]): number {
  const sum = rows.reduce(
    (acc, r) => acc + (r.weightKg != null && r.reps != null ? r.weightKg * r.reps : 0),
    0
  );
  return Math.round(sum * 10) / 10;
}

/**
 * 총 볼륨을 고른 단위로 — 숫자만. 소수 한 자리까지, .0 은 뗀다.
 *
 * 종료 요약과 완료 카드가 '총 볼륨' 칸에 쓴다. 단위 글자는 칸이 따로 붙인다.
 */
export function volumeIn(kg: number, unit: WeightUnit): number {
  return round1(toWeight(kg, unit));
}
