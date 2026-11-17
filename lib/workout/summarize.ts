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
  /**
   * EX-LOAD01 R1 — 읽기 관문(lib/workout/load/gate.ts viewSetLoad)이 본 그 세트의 무게 문맥. 있으면(gateRows · forSummary · forTonnage 가 붙인 줄)
   * 요약 · 총량이 같은 문맥끼리만 접는다. 없으면(옛 부르는 쪽 · 운동 화면의 미리 접기) 예전 그대로.
   */
  view?: SummaryLoadView | null;
};

/** 요약 · 총량이 보는 무게 문맥 — SetLoadView 의 일부(구조가 같아 gateRows 의 view 를 그대로 받는다) */
export type SummaryLoadView = {
  /** 견줌 열쇠(계약 열쇠 · 기구 열쇠까지). 없으면 견주지 않는 값 */
  key: string | null;
  /** 사용자가 붙인 기구 열쇠 — 기구 설정값(stackSetting)에만 있다 */
  setup: { key: string; label: string } | null;
  /** 총량 · 최고에 넣어도 되는 값 */
  metricKg: number | null;
  /** 보일 값(기구 설정값 · 도구 무게 포함) */
  displayKg: number | null;
};

export type ExerciseSummary = {
  exerciseId: string;
  setsDone: number;
  repsDone: number | null;
  holdSecondsDone: number | null;
  weightKg: number | null;
  /**
   * EX-LOAD01 R1 — 무게가 있는 세트들이 서로 다른 문맥(기구 A · 기구 B · 기구 모름)이라 한 숫자로 접지 않았다. 이때 weightKg 는 null 이다
   * (기구 설정값을 기구끼리 섞어 '가장 무거운 무게'로 만들지 않는다). 없으면(false · undefined) 예전 뜻.
   */
  weightWithheld?: boolean;
};

/** 같은 문맥끼리만 접는 열쇠 — 기구 설정값은 기구 열쇠, 그 밖은 견줌 열쇠(없으면 '보이기만'으로 한 묶음) */
function summaryContextOf(v: SummaryLoadView): string {
  if (v.setup) return `setup:${v.setup.key}`;
  return v.key ? `key:${v.key}` : 'display';
}

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
    const weighted = list.filter((r): r is SetRow & { weightKg: number } => r.weightKg != null && r.weightKg > 0);
    const weights = weighted.map((r) => r.weightKg);
    /*
     * EX-LOAD01 R1 — 관문을 지난 줄(view 있음)이면 무게 문맥이 하나일 때만 '가장 무거운 무게'로 접는다. 기구 A 100 · 기구 B 20 처럼 문맥이
     * 갈리면 한 숫자로 만들지 않고 비운다(weightWithheld). 세트 수 · 횟수 · 시간은 그대로다.
     */
    const contexts = new Set(weighted.filter((r) => r.view).map((r) => summaryContextOf(r.view!)));
    const mixed = contexts.size > 1 || (contexts.size === 1 && weighted.some((r) => !r.view));

    return {
      exerciseId,
      setsDone: list.length,
      repsDone: mode(list.map((r) => r.reps).filter((v): v is number => v != null)),
      holdSecondsDone: mode(
        list.map((r) => r.holdSeconds).filter((v): v is number => v != null)
      ),
      weightKg: weights.length && !mixed ? Math.max(...weights) : null,
      ...(mixed ? { weightWithheld: true } : {}),
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
  /* EX-LOAD01 R1 — 기구마다 다른 설정값을 한 숫자로 합치지 않았다 */
  else if (s.weightWithheld) parts.push('무게는 기구마다 따로');
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
    (acc, r) => acc + (r.weightKg != null && r.reps != null && countsInTotal(r) ? r.weightKg * r.reps : 0),
    0
  );
  return Math.round(sum * 10) / 10;
}

/**
 * EX-LOAD01 R1 — 총 볼륨(kg)에 넣는 줄인가. 관문을 지난 줄(view 있음)이면 **잰 무게(자유 중량 · 더한 무게)만** — 기구 설정값(stackSetting)은
 * 잰 힘이 아니라 기구마다 뜻이 달라, 같은 기구 열쇠가 있어도 kg 총량에 더하지 않는다(기구별 총량은 volumeOf 의 stacks 가 따로 낸다). 밴드 · 맨몸 ·
 * 섞인 무게 · 도구 무게는 metricKg 가 없어 원래 안 들어온다. view 가 없는 줄은 예전 그대로.
 */
function countsInTotal(r: SetRow): boolean {
  if (!r.view) return true;
  return r.view.metricKg != null && !r.view.setup;
}

/** 기구 하나(사용자가 붙인 기구 열쇠)의 설정값 총량 — 기구끼리 합치지 않는다 */
export type StackVolume = { setupKey: string; label: string; exerciseId: string; settingTotal: number; sets: number };

/**
 * EX-LOAD01 R1 — 총량을 나눠 본다(관문을 지난 줄 — forTonnage(gateRows(...)) 를 넘긴다).
 *   - measuredKg: 잰 무게 × 횟수 합(totalVolumeKg 와 같은 값)
 *   - stacks: 같은 운동 · 같은 기구 열쇠끼리만의 설정값 × 횟수 합(kg 로 말하지 않는다 — '기구 설정값 합')
 *   - withheldSets: 무게가 보였지만 견줄 문맥이 없어 어느 총량에도 넣지 않은 세트 수(기구 모르는 설정값 · 섞인 무게 · 확인 전 무게)
 * 밴드 · 맨몸은 kg 이 없어 어디에도 안 든다(withheld 로도 세지 않는다). 횟수 · 시간 · 세트 수는 이 함수와 상관없이 그대로다.
 */
export function volumeOf(rows: readonly SetRow[]): { measuredKg: number; stacks: StackVolume[]; withheldSets: number } {
  const stacks = new Map<string, StackVolume>();
  let withheldSets = 0;
  for (const r of rows) {
    const v = r.view;
    if (!v) continue;
    if (v.metricKg != null && v.setup) {
      if (r.reps == null) continue;
      const id = `${r.exerciseId}\u0000${v.setup.key}`;
      const s = stacks.get(id) ?? { setupKey: v.setup.key, label: v.setup.label, exerciseId: r.exerciseId, settingTotal: 0, sets: 0 };
      s.settingTotal = Math.round((s.settingTotal + v.metricKg * r.reps) * 10) / 10;
      s.sets += 1;
      stacks.set(id, s);
      continue;
    }
    if (v.metricKg == null && v.displayKg != null) withheldSets += 1;
  }
  return { measuredKg: totalVolumeKg(rows), stacks: [...stacks.values()], withheldSets };
}

/**
 * 총 볼륨을 고른 단위로 — 숫자만. 소수 한 자리까지, .0 은 뗀다.
 *
 * 종료 요약과 완료 카드가 '총 볼륨' 칸에 쓴다. 단위 글자는 칸이 따로 붙인다.
 */
export function volumeIn(kg: number, unit: WeightUnit): number {
  return round1(toWeight(kg, unit));
}
