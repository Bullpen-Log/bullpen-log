import type { DoneAmount } from '@/lib/exercise-meta';
import { summarizeSets } from '@/lib/workout/summarize';

/**
 * 운동 하나의 지난 기록을 읽기 좋게 모은다 — 운동별 기록 화면
 * (components/exercise-history.tsx)이 그리는 것.
 *
 * 기록은 두 가지로 쌓인다.
 *   세트 — 실시간 운동에서 한 세트씩 남긴 것(UserExerciseSet). 무게·횟수가 세트마다 있다.
 *   요약 — 하루 한 줄(UserExerciseLog). 체크로 남긴 날은 이것뿐이고, 운동을 마친
 *          날은 세트에서 접어 채운다(lib/workout/summarize.ts).
 * 세트가 있는 날은 세트를 믿고, 없는 날만 요약을 쓴다.
 *
 * DB 도 서버도 부르지 않는다. (시험: scripts/training-selftest.mts)
 */

export type HistorySetRow = {
  /** 'YYYY-MM-DD' */
  date: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
};

export type HistoryLogRow = DoneAmount & {
  /** 'YYYY-MM-DD' */
  date: string;
};

/** 무엇으로 재는 운동인가 — 무게(kg) · 횟수(맨몸) · 버틴 시간 */
export type HistoryKind = 'weight' | 'reps' | 'hold';

export type HistorySet = Pick<HistorySetRow, 'weightKg' | 'reps' | 'holdSeconds'>;

/** 하루치. 요약 칸(DoneAmount)은 세트가 있으면 세트에서 다시 접은 것이다. */
export type HistoryDay = DoneAmount & {
  date: string;
  /** 세트별로 남긴 날이면 그 세트들(순서대로), 요약만 있는 날은 null */
  sets: HistorySet[] | null;
  /**
   * 그날 한 양. 무게 운동은 무게 × 횟수의 합(kg), 맨몸은 횟수의 합, 버티기는
   * 버틴 초의 합. 셀 수 없으면 null.
   */
  volume: number | null;
  /**
   * 세트가 아니라 요약으로 어림한 양인가 — 세트 수 × 가장 자주 한 횟수 ×
   * 가장 무거운 무게. 세트마다 무게를 올린 날은 실제보다 조금 크게 나온다.
   */
  approx: boolean;
  /** 그날 가장 좋았던 세트의 추정 1RM(kg). 무게 운동이 아니면 null */
  e1rm: number | null;
};

export type ExerciseHistory = {
  kind: HistoryKind;
  /** 최근 것부터 */
  days: HistoryDay[];
  /** 가장 무거웠던 무게 — 처음 그 무게를 든 날 */
  bestWeight: { kg: number; date: string } | null;
  /** 추정 1RM 이 가장 컸던 세트 — 처음 그 세트를 한 날 */
  bestSet: { weightKg: number; reps: number; e1rm: number; date: string } | null;
  /** 한 세트에 가장 많이 한 횟수 */
  bestReps: { reps: number; date: string } | null;
  /** 가장 오래 버틴 시간(초) */
  bestHold: { seconds: number; date: string } | null;
  /** 모두 며칠 했나 */
  total: number;
  /** 최근 4주(오늘 포함 28일) 동안 며칠 했나 */
  last28: number;
};

/** 추정 1RM 을 내는 가장 많은 횟수. 이보다 많으면 어림이 크게 빗나간다. */
export const MAX_E1RM_REPS = 12;

/**
 * 추정 1RM — 한 번에 들 수 있는 최대 무게를 무게와 횟수로 어림한다(Epley 공식).
 *
 *   1RM = 무게 × (1 + 횟수 / 30)
 *
 * 1회면 그 무게가 곧 1RM 이고, 12회를 넘으면 내지 않는다(null). 최대 무게를
 * 실제로 들어 보지 않고도 '같은 무게로 더 많이 했다'와 '더 무겁게 했다'를 한
 * 숫자로 견줄 수 있어서, 최고 세트를 가르는 잣대로 쓴다.
 */
export function estimate1RM(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !Number.isInteger(reps) || reps < 1 || reps > MAX_E1RM_REPS) {
    return null;
  }
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/** 'YYYY-MM-DD' 에서 n일 전 */
function daysBefore(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 가장 큰 것 — 같으면 먼저(날짜가 이른 것) */
function bestOf<T>(items: readonly T[], score: (t: T) => number | null): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s != null && s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

export function buildExerciseHistory(
  sets: readonly HistorySetRow[],
  logs: readonly HistoryLogRow[],
  /** 오늘 'YYYY-MM-DD' — '최근 4주'를 세는 기준 */
  todayKey: string
): ExerciseHistory {
  const setsByDate = new Map<string, HistorySetRow[]>();
  for (const s of sets) {
    const list = setsByDate.get(s.date);
    if (list) list.push(s);
    else setsByDate.set(s.date, [s]);
  }
  const logByDate = new Map(logs.map((l) => [l.date, l]));

  const hasReps =
    sets.some((s) => s.reps != null) || logs.some((l) => l.repsDone != null);
  const hasHold =
    sets.some((s) => s.holdSeconds != null) ||
    logs.some((l) => l.holdSecondsDone != null);
  const hasWeight =
    sets.some((s) => (s.weightKg ?? 0) > 0) || logs.some((l) => (l.weightKg ?? 0) > 0);
  /*
   * 버틴 시간만 있으면 버티기다 — 조끼를 입고 버텨도 재는 것은 시간이다.
   * 무게가 한 번이라도 적혀 있으면 무게 운동, 아니면 맨몸 횟수다.
   */
  const kind: HistoryKind =
    hasHold && !hasReps ? 'hold' : hasWeight ? 'weight' : 'reps';

  const dates = [...new Set([...setsByDate.keys(), ...logByDate.keys()])]
    .sort()
    .reverse();

  const days: HistoryDay[] = dates.map((date) => {
    const daySets = (setsByDate.get(date) ?? []).sort((a, b) => a.setNo - b.setNo);
    if (daySets.length > 0) {
      const [sum] = summarizeSets(daySets.map((s) => ({ ...s, exerciseId: '' })));
      const volume =
        kind === 'weight'
          ? daySets.reduce((t, s) => t + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
          : kind === 'reps'
            ? daySets.reduce((t, s) => t + (s.reps ?? 0), 0)
            : daySets.reduce((t, s) => t + (s.holdSeconds ?? 0), 0);
      const e1rms = daySets
        .map((s) =>
          s.weightKg != null && s.reps != null ? estimate1RM(s.weightKg, s.reps) : null
        )
        .filter((v): v is number => v != null);
      return {
        date,
        sets: daySets.map(({ weightKg, reps, holdSeconds }) => ({
          weightKg,
          reps,
          holdSeconds,
        })),
        setsDone: sum.setsDone,
        repsDone: sum.repsDone,
        holdSecondsDone: sum.holdSecondsDone,
        weightKg: sum.weightKg,
        volume: volume > 0 ? Math.round(volume * 100) / 100 : null,
        approx: false,
        e1rm: kind === 'weight' && e1rms.length > 0 ? Math.max(...e1rms) : null,
      };
    }

    const log = logByDate.get(date)!;
    const n = log.setsDone;
    const volume =
      n == null
        ? null
        : kind === 'weight'
          ? log.weightKg != null && log.repsDone != null
            ? n * log.repsDone * log.weightKg
            : null
          : kind === 'reps'
            ? log.repsDone != null
              ? n * log.repsDone
              : null
            : log.holdSecondsDone != null
              ? n * log.holdSecondsDone
              : null;
    return {
      date,
      sets: null,
      setsDone: log.setsDone,
      repsDone: log.repsDone,
      holdSecondsDone: log.holdSecondsDone,
      weightKg: log.weightKg,
      volume: volume != null && volume > 0 ? Math.round(volume * 100) / 100 : null,
      approx: volume != null && volume > 0,
      e1rm:
        kind === 'weight' && log.weightKg != null && log.repsDone != null
          ? estimate1RM(log.weightKg, log.repsDone)
          : null,
    };
  });

  /*
   * 최고 기록은 날짜가 이른 것부터 훑어 처음 닿은 날로 적는다 — '언제 처음
   * 그 무게를 들었나'가 사람이 기억하는 날이다.
   */
  const oldestFirst = [...days].reverse();
  const flat = oldestFirst.flatMap((d) =>
    d.sets
      ? d.sets.map((s) => ({ date: d.date, ...s }))
      : [
          {
            date: d.date,
            weightKg: d.weightKg,
            reps: d.repsDone,
            holdSeconds: d.holdSecondsDone,
          },
        ]
  );

  const heaviest = bestOf(flat, (s) =>
    s.weightKg != null && s.weightKg > 0 ? s.weightKg : null
  );
  const strongest =
    kind === 'weight'
      ? bestOf(flat, (s) =>
          s.weightKg != null && s.reps != null ? estimate1RM(s.weightKg, s.reps) : null
        )
      : null;
  const mostReps = bestOf(flat, (s) => s.reps);
  const longest = bestOf(flat, (s) => s.holdSeconds);

  const since = daysBefore(todayKey, 27);

  return {
    kind,
    days,
    bestWeight:
      heaviest?.weightKg != null
        ? { kg: heaviest.weightKg, date: heaviest.date }
        : null,
    bestSet:
      strongest?.weightKg != null && strongest.reps != null
        ? {
            weightKg: strongest.weightKg,
            reps: strongest.reps,
            e1rm: estimate1RM(strongest.weightKg, strongest.reps)!,
            date: strongest.date,
          }
        : null,
    bestReps:
      mostReps?.reps != null ? { reps: mostReps.reps, date: mostReps.date } : null,
    bestHold:
      longest?.holdSeconds != null
        ? { seconds: longest.holdSeconds, date: longest.date }
        : null,
    total: days.length,
    last28: days.filter((d) => d.date >= since && d.date <= todayKey).length,
  };
}
