import { summarizeSets, totalVolumeKg, type SummaryLoadView } from '@/lib/workout/summarize';

export type RecordSet = {
  setNo: number;
  /** EX-LOAD01 — 보일 무게(읽기 관문 displayKg). 확인 전 · 맞지 않는 kg 은 null */
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
  rir: number | null;
  /** EX-LOAD01 — 총량에 넣을 무게(관문 metricKg). 없으면(옛 화면 · 시험) weightKg 를 쓴다 */
  metricKg?: number | null;
  /** EX-LOAD01 — 관문 상태 · 계산에서 뺀 원래 kg(자세히 보기용) */
  loadStatus?: string;
  rawKg?: number | null;
  /**
   * EX-LOAD01 R1-03 — 그 세트를 본 읽기 관문의 문맥(견줌 열쇠 · 기구 열쇠 · metricKg · displayKg, recordLoadView 로 만든다). 있으면 요약 · 총량이
   * 같은 문맥끼리만 접는다(기구 설정값은 kg 총량에 섞지 않는다). metricKg 는 있는데 이것이 없으면(문맥을 모르는 관문 줄) 총량에서 빼고 따로 센다.
   */
  loadView?: SummaryLoadView | null;
};

/** 관문이 본 값 → 기록 화면 세트의 문맥(무거운 밴드 · 양손 무게 같은 칸은 싣지 않는다 — 접을 때 필요한 것만) */
export function recordLoadView(v: SummaryLoadView): SummaryLoadView {
  return { key: v.key, setup: v.setup ? { key: v.setup.key, label: v.setup.label } : null, metricKg: v.metricKg, displayKg: v.displayKg };
}
export type RecordMeta = { perHand: boolean; perSide: boolean; inMinutes: boolean };
export type RecordExercise = {
  id: string;
  title: string;
  category: string;
  planned: string | null;
  done: boolean;
  setsDone: number | null;
  repsDone: number | null;
  holdSecondsDone: number | null;
  weightKg: number | null;
  sets: RecordSet[] | null;
  meta: RecordMeta;
  method: 'exercise' | 'drill';
  canToggle: boolean;
};
export type RecordNote = { intensity: number; memo: string | null; version: string };
export const recordNoteMatches = (
  n: RecordNote | null,
  p: { intensity: number; memo: string }
) => n != null && n.intensity === p.intensity && (n.memo ?? '') === p.memo.trim();
export type WorkoutRecord = {
  date: string;
  today: string;
  kind: 'training' | 'armcare' | 'drill';
  editable: boolean;
  title: string;
  programLabel: string | null;
  session: { id: string; status: string } | null;
  minutes: number | null;
  setCount: number | null;
  volumeKg: number | null;
  /** EX-LOAD01 R1-03 — 무게가 보였지만 견줄 문맥이 없어 kg 총량에 넣지 않은 세트 수(기구 설정값 · 문맥 모름). 0 이면 칸이 없다 */
  volumeWithheldSets?: number;
  exercises: RecordExercise[];
  note: RecordNote | null;
  setsKnown: boolean;
  noteKnown: boolean;
};
export function validRecordDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function recordEditable(date: string, today: string): boolean {
  if (!validRecordDate(date) || !validRecordDate(today) || date > today) return false;
  return (Date.parse(today) - Date.parse(date)) / 86400000 <= 7;
}
/** The raw rows are authoritative; maxima and representative repetitions are never multiplied to invent volume. */
export function applyRecordSets(
  ex: Omit<RecordExercise, 'sets' | 'canToggle'>,
  sets: RecordSet[] | null,
  editable: boolean,
  active: boolean
): RecordExercise {
  const summary = sets?.length
    ? summarizeSets(sets.map((s) => ({ ...s, exerciseId: ex.id, view: s.loadView ?? null })))[0]
    : null;
  return {
    ...ex,
    ...(summary ?? {}),
    done: Boolean(sets?.length) || ex.done,
    sets,
    canToggle: editable && !active && sets != null && sets.length === 0,
  };
}
export function recordTotals(exercises: RecordExercise[], known: boolean) {
  if (!known) return { setCount: null, volumeKg: null };
  const sets = exercises.flatMap((e) => e.sets ?? []);
  /*
   * EX-LOAD01 R1-03 — 관문을 지난 줄(metricKg 있음)은 문맥(loadView)이 있을 때만 총량에 — 잰 무게만, 기구 설정값은 기구 열쇠가 있어도 kg 총량에
   * 섞지 않는다(lib/workout/summarize.ts totalVolumeKg). 문맥 없는 관문 줄은 기구 설정값인지 가릴 수 없어 넣지 않고 따로 센다. 관문 칸이 없는
   * 옛 줄(시험 · 옛 화면)은 예전 그대로다.
   */
  let withheld = 0;
  const rows = sets.flatMap((s) => {
    if (s.metricKg === undefined) return [{ ...s, exerciseId: '' }];
    if (!s.loadView) {
      if (s.metricKg != null || (s.weightKg != null && s.weightKg > 0)) withheld += 1;
      return [{ ...s, weightKg: null, exerciseId: '' }];
    }
    if (s.loadView.metricKg == null && s.loadView.displayKg != null) withheld += 1;
    if (s.loadView.metricKg != null && s.loadView.setup) withheld += 1;
    return [{ ...s, weightKg: s.metricKg, view: s.loadView, exerciseId: '' }];
  });
  return {
    setCount: sets.length,
    volumeKg: sets.length ? totalVolumeKg(rows) : null,
    ...(withheld ? { volumeWithheldSets: withheld } : {}),
  };
}
