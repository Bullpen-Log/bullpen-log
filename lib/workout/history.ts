import type { DoneAmount } from '@/lib/exercise-meta';
import { summarizeSets } from '@/lib/workout/summarize';
import type { LoadMode, MassBasis, RecordingContract } from '@/lib/workout/load/contract';
import type { SetLoadViewStatus } from '@/lib/workout/load/gate';
import type { BandPart, MassPiece, SetupRef } from '@/lib/workout/load/recorded';

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

/**
 * EX-LOAD01 — 읽기 관문(lib/workout/load/gate.ts)을 지난 줄이면 이 칸들이 붙는다. weightKg 는 그때 '보일 무게'(displayKg —
 * 확인 전 · 맞지 않음이면 null), metricKg 는 최고 · 총량에, e1rmKg 는 추정 1RM 에 넣을 값. 관문을 안 지난 줄(옛 시험)은 예전처럼
 * weightKg 를 모두에 쓴다.
 */
export type GatedLoad = {
  metricKg?: number | null;
  e1rmKg?: number | null;
  loadStatus?: SetLoadViewStatus;
  /** 계산에서 뺀 원래 kg(자세히 보기에서만) */
  rawKg?: number | null;
  band?: BandPart | null;
  /**
   * 견줌 열쇠(관문의 key) — 같은 열쇠끼리만 최고 · 1RM · 양을 견준다. 같은 케이블 운동이라도 다른 기구(A짐 1번 · B짐 2번)의
   * 설정값은 같은 힘이 아니다(GPT 서브1 사전 점검 — 기구가 다른 100kg 과 20kg 이 한 최고 기록으로 합쳐지던 것).
   */
  key?: string | null;
  /** 그 세트를 한 기구 이름 · 서로 다른 무게 도구 — 보이기만(견줌은 key) */
  setup?: SetupRef | null;
  parts?: MassPiece[] | null;
};

export type HistorySetRow = GatedLoad & {
  /** 'YYYY-MM-DD' */
  date: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
};

export type HistoryLogRow = DoneAmount &
  GatedLoad & {
    /** 'YYYY-MM-DD' */
    date: string;
  };

/** 무엇으로 재는 운동인가 — 무게(kg) · 횟수(맨몸) · 버틴 시간 */
export type HistoryKind = 'weight' | 'reps' | 'hold';

export type HistorySet = Pick<HistorySetRow, 'weightKg' | 'reps' | 'holdSeconds'> & {
  /** EX-LOAD01 — 관문을 지난 기록만. 옛 화면은 모르는 칸이라 지나친다 */
  loadStatus?: SetLoadViewStatus;
  rawKg?: number | null;
  band?: BandPart | null;
  /** 기구 이름(그때 붙인 것) · 서로 다른 무게 도구(왼 · 오른) — 견줌이 아니라 보이기 */
  setupLabel?: string | null;
  parts?: MassPiece[] | null;
};

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
  /**
   * EX-LOAD01 — 이 운동의 기록 계약(지금 장비)에서 온 칸. 옛 화면은 모르는 칸이라 지나친다(kind 는 예전 셋 그대로).
   * loadMode: 무게 · 맨몸 · 밴드 … / basis: 무게의 뜻 / e1rmEligible: 1RM 을 보이는가 / excludedKgDays: 확인 전 · 맞지 않는 kg 이 있어
   * 계산에서 뺀 날 수.
   */
  loadMode?: LoadMode;
  basis?: MassBasis | null;
  e1rmEligible?: boolean;
  excludedKgDays?: number;
  /**
   * 최고 · 1RM · 하루 양을 셈한 견줌의 범위 — 가장 최근에 무게를 견줄 수 있게 남긴 기구(열쇠) 하나. 다른 기구로 한 날은 견주지 않는다
   * (otherSetupDays). setupLabel 은 그 기구 이름(사용자가 붙인 것, 없으면 null).
   */
  comparison?: { setupLabel: string | null; otherSetupDays: number } | null;
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
  todayKey: string,
  /**
   * EX-LOAD01 — 이 운동의 기록 계약. 주면 '무엇으로 재는 운동인가'를 지난 kg 이 아니라 계약이 정하고, 최고 · 총량 · 1RM 은 관문을 지난
   * 값(metricKg · e1rmKg)으로만 셈한다. 안 주면 예전 그대로(옛 시험).
   */
  contract?: RecordingContract
): ExerciseHistory {
  const gated = contract !== undefined;
  /* 계산에 쓸 kg — 관문을 지났으면 metric/e1rm 만, 아니면 예전처럼 weightKg */
  /*
   * 견줌 열쇠 — 관문을 지났으면 가장 최근에 계산에 넣을 kg 이 있는 줄의 열쇠 하나로만 견준다. 다른 열쇠(다른 기구 · 다른 뜻)의 kg 은
   * 그 세트 · 그날에 보이되 최고 · 1RM · 양에 넣지 않는다. 관문 없는 옛 시험은 예전처럼 모두.
   */
  const keyed = [...sets, ...logs].filter((r) => r.metricKg != null && r.metricKg > 0);
  const compareRow = gated ? [...keyed].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : ('setNo' in b ? (b as HistorySetRow).setNo : 0) - ('setNo' in a ? (a as HistorySetRow).setNo : 0)))[0] : undefined;
  const compareKey = compareRow?.key ?? null;
  const sameKey = (r: GatedLoad) => !gated || compareKey == null || (r.key ?? null) === compareKey;
  const metricOf = (r: { weightKg: number | null } & GatedLoad) => (gated ? (sameKey(r) ? (r.metricKg ?? null) : null) : r.weightKg);
  const e1rmOf = (r: { weightKg: number | null } & GatedLoad) => (gated ? (sameKey(r) ? (r.e1rmKg ?? null) : null) : r.weightKg);
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
   * EX-LOAD01 — 무게 운동인지는 계약이 정한다(지난 kg 한 줄이 맨몸 운동을 무게 운동으로 바꾸던 것 — 포고 홉). 계약이 없을 때만
   * 예전처럼 '무게가 한 번이라도 적혀 있으면'.
   */
  const massKind =
    contract !== undefined
      ? contract.mode === 'externalMass' || contract.mode === 'indicatedLoad' || contract.mode === 'implementMass' || contract.mode === 'combined'
      : hasWeight;
  const kind: HistoryKind =
    hasHold && !hasReps ? 'hold' : massKind ? 'weight' : 'reps';

  const dates = [...new Set([...setsByDate.keys(), ...logByDate.keys()])]
    .sort()
    .reverse();

  const days: HistoryDay[] = dates.map((date) => {
    const daySets = (setsByDate.get(date) ?? []).sort((a, b) => a.setNo - b.setNo);
    if (daySets.length > 0) {
      const [sum] = summarizeSets(daySets.map((s) => ({ ...s, exerciseId: '' })));
      const volume =
        kind === 'weight'
          ? daySets.reduce((t, s) => t + (metricOf(s) ?? 0) * (s.reps ?? 0), 0)
          : kind === 'reps'
            ? daySets.reduce((t, s) => t + (s.reps ?? 0), 0)
            : daySets.reduce((t, s) => t + (s.holdSeconds ?? 0), 0);
      const e1rms = daySets
        .map((s) => {
          const kg = e1rmOf(s);
          return kg != null && s.reps != null ? estimate1RM(kg, s.reps) : null;
        })
        .filter((v): v is number => v != null);
      return {
        date,
        sets: daySets.map(({ weightKg, reps, holdSeconds, loadStatus, rawKg, band, setup, parts }) => ({
          weightKg,
          reps,
          holdSeconds,
          ...(gated
            ? { loadStatus, rawKg: rawKg ?? null, ...(band ? { band } : {}), ...(setup ? { setupLabel: setup.label } : {}), ...(parts ? { parts } : {}) }
            : {}),
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
    const logMetric = metricOf(log);
    const logE1rm = e1rmOf(log);
    const volume =
      n == null
        ? null
        : kind === 'weight'
          ? logMetric != null && log.repsDone != null
            ? n * log.repsDone * logMetric
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
        kind === 'weight' && logE1rm != null && log.repsDone != null
          ? estimate1RM(logE1rm, log.repsDone)
          : null,
    };
  });

  /*
   * 최고 기록은 날짜가 이른 것부터 훑어 처음 닿은 날로 적는다 — '언제 처음
   * 그 무게를 들었나'가 사람이 기억하는 날이다.
   */
  const oldestFirst = [...days].reverse();
  /* 최고 기록은 관문을 지난 값으로만(관문 없는 옛 시험은 weightKg) — 세트 줄 · 요약 줄 각각의 원래 칸에서 */
  const setRowsByDate = new Map<string, HistorySetRow[]>();
  for (const s of sets) setRowsByDate.set(s.date, [...(setRowsByDate.get(s.date) ?? []), s]);
  const flat = oldestFirst.flatMap((d) => {
    const rows = setRowsByDate.get(d.date);
    if (d.sets && rows) {
      return [...rows]
        .sort((a, b) => a.setNo - b.setNo)
        .map((s) => ({ date: d.date, metric: metricOf(s), e1: e1rmOf(s), reps: s.reps, holdSeconds: s.holdSeconds }));
    }
    const log = logByDate.get(d.date);
    return [
      {
        date: d.date,
        metric: log ? metricOf(log) : d.weightKg,
        e1: log ? e1rmOf(log) : d.weightKg,
        reps: d.repsDone,
        holdSeconds: d.holdSecondsDone,
      },
    ];
  });

  const heaviest = bestOf(flat, (s) => (s.metric != null && s.metric > 0 ? s.metric : null));
  const strongest =
    kind === 'weight'
      ? bestOf(flat, (s) => (s.e1 != null && s.reps != null ? estimate1RM(s.e1, s.reps) : null))
      : null;
  const mostReps = bestOf(flat, (s) => s.reps);
  const longest = bestOf(flat, (s) => s.holdSeconds);

  const since = daysBefore(todayKey, 27);

  return {
    kind,
    days,
    bestWeight:
      heaviest?.metric != null
        ? { kg: heaviest.metric, date: heaviest.date }
        : null,
    bestSet:
      strongest?.e1 != null && strongest.reps != null
        ? {
            weightKg: strongest.e1,
            reps: strongest.reps,
            e1rm: estimate1RM(strongest.e1, strongest.reps)!,
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
    ...(contract !== undefined
      ? {
          loadMode: contract.mode,
          basis: contract.massBasis,
          e1rmEligible: contract.e1rmEligible,
          excludedKgDays: new Set(
            [...sets, ...logs].filter((r) => r.rawKg != null && r.rawKg > 0 && (r.metricKg ?? null) == null && r.weightKg == null).map((r) => r.date)
          ).size,
          comparison:
            compareKey == null
              ? null
              : {
                  setupLabel: compareRow?.setup?.label ?? null,
                  otherSetupDays: new Set(keyed.filter((r) => (r.key ?? null) !== compareKey).map((r) => r.date)).size,
                },
        }
      : {}),
  };
}
