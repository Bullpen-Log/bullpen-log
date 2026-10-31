import { formatPrescription } from '@/lib/exercise-meta';
import type { WarmupRoutineView } from '@/lib/library-load';

/**
 * 워밍업 루틴 목록 · 상세가 같이 쓰는 셈(2026-10-31 워밍업 시안 01 · 02) — 화면 없이 셈만. 시험: scripts/native-library-selftest.mts.
 *
 * - 공통(COMMON): 공통 루틴에 담긴 차례대로 한 번씩.
 * - 목적별 추가: 그 루틴에 담긴 것에서 공통에 있는 운동을 빼고(같은 운동은 한 번), 담긴 차례대로. 공통 + 추가가 이 화면의 '전체'다.
 *   공통에도 있는 운동(overlap)은 지우지 않고 따로 남긴다 — 그 루틴 안내가 공통 안내와 다르면 공통 줄에 같이 보인다.
 *   (운동 화면의 워밍업은 공통 카드 · 그날 카드를 따로 그려 같은 운동이 두 번 나올 수 있다 — 열람 셈 때문에 실행을 바꾸지 않는다.)
 * - 안내: 그 루틴에 적은 안내(note) → 운동의 기본 수행량(formatPrescription) → 없음. 개인 메모(exercise.note)와 섞지 않는다.
 * - 볼 수 없는 운동: 서버가 숨김이라 알린 것(hidden)과, 볼 수 있다는데 받은 운동 목록에 없는 것(missing — 잠깐 어긋남 · 다시 받기)을 가른다.
 *   둘 다 자리 번호는 지키고 제목 · 안내 · 미리보기는 채우지 않는다.
 */
export const COMMON_KIND = 'COMMON';

/** 운동 목록의 한 줄 — 기본 수행량 셈(formatPrescription)에 실행 화면과 같은 칸을 넘긴다(분류 · 쉬는 시간까지) */
export type WarmupExercise = Parameters<typeof formatPrescription>[0] & { id: string; title: string; thumbUrl: string | null };

export type WarmupRow<E extends WarmupExercise = WarmupExercise> = {
  exerciseId: string;
  /** 구간 안 차례(1부터) — 수행 차례이지 완료 표시가 아니다 */
  order: number;
  state: 'ok' | 'hidden' | 'missing';
  exercise: E | null;
  /** 이 루틴에서 보여 줄 수행 안내 — 루틴 안내 → 기본 수행량 → null */
  guide: string | null;
  /** 이 루틴에만 적은 안내(비었으면 null) — 운동 상세가 출처를 가른다 */
  routineNote: string | null;
  /** (목적별 상세의 공통 줄) 이 목적별 루틴에도 담겨 있고 안내를 따로 적어 둔 경우 그 안내 */
  alsoNote: string | null;
};

export type WarmupRoutineModel<E extends WarmupExercise = WarmupExercise> = {
  kind: string;
  name: string;
  description: string;
  common: boolean;
  /** 공통이면 공통 줄, 목적별이면 그 루틴의 추가 줄 */
  rows: WarmupRow<E>[];
  /** 목적별 루틴에 담겼지만 공통에도 있는 운동(지우지 않고 남긴 원래 관계) */
  overlap: { exerciseId: string; note: string | null }[];
};

export type WarmupModel<E extends WarmupExercise = WarmupExercise> = {
  /** 등록된 공통 루틴 — 없으면 null(만들어 채우지 않는다) */
  common: WarmupRoutineModel<E> | null;
  /** 등록된 목적별 루틴 — 정렬 차례대로. 추가가 비면 '구성 준비 중' */
  purposes: WarmupRoutineModel<E>[];
};

const clean = (note: string | null | undefined) => note?.trim() || null;

export function guideOf(note: string | null | undefined, ex: Parameters<typeof formatPrescription>[0] | null) {
  return clean(note) ?? (ex ? formatPrescription(ex) : null) ?? null;
}

function rowsOf<E extends WarmupExercise>(items: WarmupRoutineView['items'], byId: ReadonlyMap<string, E>): WarmupRow<E>[] {
  const seen = new Set<string>();
  const out: WarmupRow<E>[] = [];
  for (const it of items) {
    if (seen.has(it.exerciseId)) continue;
    seen.add(it.exerciseId);
    const ex = it.available ? (byId.get(it.exerciseId) ?? null) : null;
    out.push({
      exerciseId: it.exerciseId,
      order: out.length + 1,
      state: !it.available ? 'hidden' : ex ? 'ok' : 'missing',
      exercise: ex,
      guide: ex ? guideOf(it.note, ex) : null,
      routineNote: ex ? clean(it.note) : null,
      alsoNote: null,
    });
  }
  return out;
}

export function buildWarmup<E extends WarmupExercise>(routines: readonly WarmupRoutineView[], exercises: readonly E[]): WarmupModel<E> {
  const byId = new Map(exercises.map((ex) => [ex.id, ex]));
  const sorted = [...routines].sort((a, b) => a.sortOrder - b.sortOrder);
  const commonRaw = sorted.find((r) => r.kind === COMMON_KIND) ?? null;
  const commonIds = new Set(commonRaw?.items.map((i) => i.exerciseId) ?? []);
  const common: WarmupRoutineModel<E> | null = commonRaw
    ? { kind: commonRaw.kind, name: commonRaw.name, description: commonRaw.description, common: true, rows: rowsOf(commonRaw.items, byId), overlap: [] }
    : null;
  const purposes = sorted
    .filter((r) => r.kind !== COMMON_KIND)
    .map<WarmupRoutineModel<E>>((r) => ({
      kind: r.kind,
      name: r.name,
      description: r.description,
      common: false,
      rows: rowsOf(
        r.items.filter((i) => !commonIds.has(i.exerciseId)),
        byId
      ),
      overlap: r.items.filter((i) => commonIds.has(i.exerciseId)).map((i) => ({ exerciseId: i.exerciseId, note: i.available ? clean(i.note) : null })),
    }));
  return { common, purposes };
}

/** 목적별 상세의 공통 줄 — 이 루틴에도 담겼고 안내가 다르면 그 안내를 곁에(공통 안내를 덮지 않는다) */
export function commonRowsFor<E extends WarmupExercise>(common: WarmupRoutineModel<E> | null, purpose: WarmupRoutineModel<E> | null): WarmupRow<E>[] {
  if (!common) return [];
  if (!purpose) return common.rows;
  const own = new Map(purpose.overlap.map((o) => [o.exerciseId, o.note]));
  return common.rows.map((r) => {
    const note = own.get(r.exerciseId) ?? null;
    return note && note !== r.routineNote && note !== r.guide ? { ...r, alsoNote: note } : r;
  });
}

/** 셀 수 — 목록 카드 · 상세 요약 · 실제 줄이 같은 기준. unsure 는 자리는 있지만 볼 수 없는 운동 수 */
export function countsOf(rows: readonly WarmupRow[]) {
  return { total: rows.length, unsure: rows.filter((r) => r.state !== 'ok').length };
}

/** 주소의 루틴 종류 — 영문 대문자 · 숫자 · _ 만(이름이 바뀌어도 링크가 깨지지 않게 kind 로 연다) */
export const validKind = (kind: string | undefined | null) => (kind && /^[A-Z][A-Z0-9_]{0,31}$/.test(kind) ? kind : null);
