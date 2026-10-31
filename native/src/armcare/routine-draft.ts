import { ARMCARE_AREAS, areasOf, findArmcareArea, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { MY_ROUTINE_MAX_ITEMS, type MyRoutineItem } from '@/lib/armcare/my-routines';
import type { BuilderExercise } from '@/app/(app)/training/routine/[id]/routine-builder';

/**
 * 암케어 루틴 만들기(01) · 운동 추가(02)가 같이 쓰는 규칙(2026-10-31 시안) — 화면 없이 셀 수 있는 것만 둔다(scripts/native-routine-builder-selftest.mts).
 *
 * 초안의 주인은 01 한 화면이다. 02 는 들어올 때 01 이 넘긴 구성(original — 운동 id 와 초안 판 번호)을 읽기만 하고, 이번에 고른 것(pending)은
 * 02 안에만 둔다. [N개 담기]에서만 01 에 한 번 넘기고(deliverPicks), 01 이 돌아와 판 번호 · 계정이 같을 때 한 번 받아 뒤에 붙인다(takePicks).
 * 취소 · 뒤로는 아무것도 넘기지 않아 01 이 그대로다. 서버에는 아무것도 쓰지 않는다 — 저장은 01 의 [루틴 저장]뿐이다.
 */

/* ── 검색 · 부위 · 장비 ─────────────────────────────────────────────── */

export type CatalogQuery = { q: string; area: ArmcareAreaKey | null; gear: string | null };

const norm = (s: string) => s.normalize('NFC').toLowerCase().trim();
/** 등록된 장비 그대로(앞뒤 공백만 뗀다) — 비어 있으면 '미등록'이다. 맨몸으로 치지 않는다 */
export const gearOf = (e: BuilderExercise) => e.view.equipment.map((g) => g.trim()).filter(Boolean);
export const areaLabel = (key: string | null) => findArmcareArea(key)?.label ?? null;

/** 찾는 글 — 이름 · 등록 근육 · 장비 · 관련 부위(주 부위만이 아니다) */
function haystack(e: BuilderExercise): string {
  return norm([e.view.title, ...e.view.targetMuscles, ...gearOf(e), ...areasOf(e.view.targetMuscles).map((a) => a.label)].join(' '));
}

/**
 * 검색어(띄어 쓴 낱말마다 모두 들어 있어야 — AND) · 부위(관련 부위 하나라도) · 장비(등록 배열에 그 이름) 를 모두 만족하는 것.
 * 전체 목록을 센다 — 화면에 그린 줄 수가 아니다. 줄 차례는 받은 차례 그대로.
 */
export function filterCatalog(list: readonly BuilderExercise[], query: CatalogQuery): BuilderExercise[] {
  const words = norm(query.q).split(/\s+/).filter(Boolean);
  const gear = query.gear ? norm(query.gear) : null;
  return list.filter(
    (e) =>
      (!query.area || areasOf(e.view.targetMuscles).some((a) => a.key === query.area)) &&
      (!gear || gearOf(e).some((g) => norm(g) === gear)) &&
      (words.length === 0 || ((h) => words.every((w) => h.includes(w)))(haystack(e)))
  );
}

/** 고를 수 있는 부위 — 관절(어깨 · 팔꿈치)로 묶고, 목록에 그 부위 운동이 있는 것만(수는 관련 부위 기준) */
export function areaGroups(list: readonly BuilderExercise[]) {
  const count = new Map<string, number>();
  for (const e of list) for (const a of areasOf(e.view.targetMuscles)) count.set(a.key, (count.get(a.key) ?? 0) + 1);
  return (['어깨', '팔꿈치'] as const)
    .map((joint) => ({
      joint,
      areas: ARMCARE_AREAS.filter((a) => a.joint === joint && count.has(a.key)).map((a) => ({ key: a.key, label: a.label, n: count.get(a.key)! })),
    }))
    .filter((g) => g.areas.length > 0);
}

/** 고를 수 있는 장비 — 실제 등록된 이름만, 많은 차례(같으면 가나다) */
export function gearOptions(list: readonly BuilderExercise[]) {
  const count = new Map<string, number>();
  for (const e of list) for (const g of new Set(gearOf(e))) count.set(g, (count.get(g) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).map(([name, n]) => ({ name, n }));
}

/* ── 이번 선택 ─────────────────────────────────────────────────────── */

/** 이번에 더 담을 수 있는 자리 — 15 − 이미 담은 운동 수 */
export const slotsLeft = (originalCount: number) => Math.max(0, MY_ROUTINE_MAX_ITEMS - originalCount);

/**
 * 선택 하나 누름 — 이미 담은 운동은 바꾸지 않는다(그 화면에서 빼는 곳이 아니다). 고른 것은 빼고, 새 것은 자리가 남을 때만 맨 뒤에.
 * 막혔으면 같은 배열을 돌려준다(화면이 막힘을 안다).
 */
export function togglePending(pending: readonly string[], id: string, original: ReadonlySet<string>, slots: number): readonly string[] {
  if (original.has(id)) return pending;
  if (pending.includes(id)) return pending.filter((x) => x !== id);
  return pending.length >= slots ? pending : [...pending, id];
}

/**
 * 고른 운동을 초안 뒤에 붙인다 — 이미 담긴 것 · 같은 것 두 번은 건너뛰고, 15개에서 멈춘다. 앞의 이름 · 세트 · 차례는 그대로.
 * 새 운동의 세트는 그 운동의 기본 세트(picks 에 담아 온 값).
 */
export function appendPicks(items: readonly MyRoutineItem[], picks: readonly MyRoutineItem[], max = MY_ROUTINE_MAX_ITEMS): MyRoutineItem[] {
  const next = [...items];
  const seen = new Set(items.map((it) => it.exerciseId));
  for (const p of picks) {
    if (next.length >= max) break;
    if (seen.has(p.exerciseId)) continue;
    seen.add(p.exerciseId);
    next.push({ exerciseId: p.exerciseId, sets: p.sets });
  }
  return next;
}

/** 이름 · 구성이 같은가(차례까지) — 나가기 묻기 · 저장된 결과 견주기 */
export function sameDraft(a: { name: string; items: readonly MyRoutineItem[] }, b: { name: string; items: readonly MyRoutineItem[] }) {
  return a.name === b.name && a.items.length === b.items.length && a.items.every((it, i) => it.exerciseId === b.items[i].exerciseId && it.sets === b.items[i].sets);
}

/* ── 01 → 02 → 01 넘겨주기(이 앱 안 메모리 — 저장소에 남기지 않는다) ─────────────── */

type Source = { epoch: number; version: number; ids: string[] };
type Delivery = { epoch: number; version: number; picks: MyRoutineItem[]; exercises: BuilderExercise[] };
const sources = new Map<string, Source>();
const deliveries = new Map<string, Delivery>();

/** 01 이 운동 추가를 열 때 — 지금 구성과 판 번호를 둔다(같은 초안을 다시 열면 덮는다) */
export function openPicker(draftId: string, src: Source) {
  sources.set(draftId, { ...src, ids: [...src.ids] });
  deliveries.delete(draftId);
}
/** 02 가 들어올 때 — 다른 계정 · 없는 초안이면 null */
export function pickerSource(draftId: string, epoch: number): Source | null {
  const s = sources.get(draftId);
  return s && s.epoch === epoch ? s : null;
}
/**
 * [N개 담기] — 이 초안에 한 번만(연타 · 다시 들어와 또 누름 막기: 받기 전까지 두 번째는 false). 열 때의 판이 아니면 넘기지 않는다.
 */
export function deliverPicks(draftId: string, d: Delivery): boolean {
  const s = sources.get(draftId);
  if (!s || s.epoch !== d.epoch || s.version !== d.version || deliveries.has(draftId)) return false;
  deliveries.set(draftId, { ...d, picks: d.picks.map((p) => ({ ...p })) });
  sources.delete(draftId);
  return true;
}
/** 01 이 돌아올 때 한 번 — 받으면 지운다. 다른 계정의 것은 버린다 */
export function takePicks(draftId: string, epoch: number): Delivery | null {
  const d = deliveries.get(draftId) ?? null;
  deliveries.delete(draftId);
  return d && d.epoch === epoch ? d : null;
}

/* ── 저장 결과 가르기 ──────────────────────────────────────────────── */

/**
 * 서버가 부르기 전에 막은 것(앱 판 · 없는 동작 · 몸 깨짐 · 권한 · 베타 잠금) — 쓰지 않은 것이 확정이다. 나머지(신호 끊김 'offline' · 서버 오류
 * 'server' · 기다림 넘김 'timeout' · 모르는 것)는 서버에서 끝까지 됐을 수도 있어 '확인 필요'로 둔다. 오류 글이 아니라 코드로 가른다.
 */
const BEFORE_RUN = new Set(['update', 'unknown-action', 'bad-body', 'http', 'FEATURE_LOCKED_BETA', 'PERMISSION_DENIED']);
export type SaveFailure = { kind: 'refused' | 'uncertain' | 'login'; code: string };
export function classifySaveFailure(code: string | null | undefined): SaveFailure {
  const c = code ?? 'unknown';
  if (c === 'redirect') return { kind: 'login', code: c };
  return { kind: BEFORE_RUN.has(c) ? 'refused' : 'uncertain', code: c };
}

/** 새 루틴 key(UUID v4 모양 — 서버 isRoutineId). 앱에는 crypto.randomUUID 가 없다(~/lab/use-lab-upload 와 같은 방법) */
export const newRoutineKey = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });
