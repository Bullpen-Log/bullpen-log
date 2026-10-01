/**
 * 새 최고 기록 — 오늘 세트가 지금까지의 모든 기록보다 나은가.
 *
 * 운동 화면은 세트를 남기는 순간 그 줄에 '새 최고'를 띄우고(가볍게 두 번 떤다), 마친 뒤
 * 축하 화면(app/(session)/workout/done)은 오늘 새로 넘은 운동을 따로 모아 보여준다.
 * 둘이 같은 함수로 가른다 — 운동 중에 본 배지가 끝 화면에서 사라지면 어느 쪽을 믿을지
 * 모른다(2026-10-01 사용자 '애플처럼 감성있게').
 *
 * 잣대는 운동마다 하나다. 버티기는 버틴 시간, 무게를 든 세트는 무게, 맨몸은 한 세트 횟수.
 * 같은 무게로 횟수만 늘린 것은 세지 않는다 — '더 무겁게 들었다'가 사람이 기억하는 최고다.
 * 처음 하는 운동은 넘을 기록이 없어 배지를 안 띄운다 — 첫 세트마다 '최고'가 뜨면 뜻이 없다.
 *
 * DB 도 서버도 부르지 않는다 — 운동 화면(브라우저)과 끝 화면(서버)이 같이 쓴다.
 */

/** 오늘 앞의 모든 기록에서 가장 좋았던 값 — 세트와 하루 요약을 다 본다(lib/workout/prior-bests.ts) */
export type PriorBest = {
  /** 가장 무거웠던 무게(kg) */
  weightKg: number | null;
  /** 한 세트에 가장 많이 한 횟수 */
  reps: number | null;
  /** 가장 오래 버틴 시간(초) */
  holdSeconds: number | null;
};

/** 무엇을 넘었나 — 무게 · 횟수 · 버틴 시간 */
export type RecordKind = 'weight' | 'reps' | 'hold';

export type NewRecord = {
  kind: RecordKind;
  /** 넘은 값 — 무게는 kg, 버티기는 초 */
  value: number;
  /** 그 값을 낸 세트 — 같은 값이면 먼저 한 세트 */
  setNo: number;
};

type SetLike = {
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
};

/** 오늘 세트 중 지난 최고를 넘은 가장 좋은 세트 — 없으면 null */
function beat(
  sets: readonly SetLike[],
  kind: RecordKind,
  score: (s: SetLike) => number | null,
  prior: number | null
): NewRecord | null {
  if (prior == null || !(prior > 0)) return null;
  let best: NewRecord | null = null;
  for (const s of [...sets].sort((a, b) => a.setNo - b.setNo)) {
    const v = score(s);
    if (v != null && v > prior && (best == null || v > best.value)) {
      best = { kind, value: v, setNo: s.setNo };
    }
  }
  return best;
}

export function newRecord(
  exercise: { isHold: boolean; needsWeight: boolean },
  sets: readonly SetLike[],
  prior: PriorBest | null
): NewRecord | null {
  if (!prior || sets.length === 0) return null;
  if (exercise.isHold)
    return beat(sets, 'hold', (s) => s.holdSeconds, prior.holdSeconds);

  const heavier = beat(
    sets,
    'weight',
    (s) => (s.weightKg != null && s.weightKg > 0 ? s.weightKg : null),
    prior.weightKg
  );
  if (heavier || exercise.needsWeight) return heavier;

  /* 맨몸 — 무게 없이 한 세트끼리만 횟수로 견준다(조끼를 입은 세트는 무게가 달라 견줄 수 없다) */
  return beat(
    sets,
    'reps',
    (s) => (s.weightKg == null || s.weightKg === 0 ? s.reps : null),
    prior.reps
  );
}
