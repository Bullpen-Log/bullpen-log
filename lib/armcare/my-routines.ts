/**
 * 내 암케어 루틴 — 사용자가 운동을 직접 골라 이름을 붙여 둔 루틴.
 *
 * 2026-09-26 사용자분이 원한 두 가지 중 하나다. 앱이 몸 상태를 보고 짜 주는 맞춤
 * 루틴(lib/armcare/routine.ts)과 따로, "본인에게 필요한 부분을 골라서" 쓰는 것.
 * 암케어는 운동 일정과 상관없이 언제든 한다는 기준이라, 날짜에 매이지 않고 여러 개를
 * 두고 아무 때나 연다. 저장은 UserArmcareRoutine 표.
 *
 * 여기에는 모양과 규칙만 둔다 — 서버(저장)와 화면(만들기)이 같은 규칙을 쓰게. 규칙이
 * 두 벌이면 화면은 담기게 해 놓고 저장에서 튕기는 일이 생긴다.
 */

/** 루틴에 담긴 운동 하나 — 담은 차례대로 한다 */
export type MyRoutineItem = { exerciseId: string; sets: number };

export type MyRoutine = {
  id: string;
  name: string;
  items: MyRoutineItem[];
};

/** 한 사람이 둘 수 있는 루틴 수 — 목록이 한 화면을 넘으면 고르기 어렵다 */
export const MY_ROUTINE_MAX = 10;
/** 한 루틴에 담을 수 있는 운동 수 — 암케어로 30분을 넘기지 않을 만큼 */
export const MY_ROUTINE_MAX_ITEMS = 15;
/** 이름 길이 — 카드 한 줄에 들어가게 */
export const MY_ROUTINE_NAME_MAX = 20;
export const MY_ROUTINE_SETS_MIN = 1;
export const MY_ROUTINE_SETS_MAX = 5;

const clampSets = (n: unknown) =>
  Math.min(
    MY_ROUTINE_SETS_MAX,
    Math.max(MY_ROUTINE_SETS_MIN, Math.round(Number.isFinite(n) ? (n as number) : 2))
  );

/**
 * DB 에서 읽은 items — 모양이 어긋난 줄은 버린다.
 *
 * Json 칸이라 무엇이든 들어 있을 수 있다. 하나가 이상하다고 루틴 전체를 못 열면
 * 안 되니, 쓸 수 있는 줄만 남긴다.
 */
export function readRoutineItems(raw: unknown): MyRoutineItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: MyRoutineItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const { exerciseId, sets } = row as { exerciseId?: unknown; sets?: unknown };
    if (typeof exerciseId !== 'string' || !exerciseId || seen.has(exerciseId)) continue;
    seen.add(exerciseId);
    items.push({ exerciseId, sets: clampSets(sets) });
  }
  return items;
}

/**
 * 저장하기 전에 다듬는다 — 이름은 앞뒤 공백을 떼고, 같은 운동은 한 번만, 세트는
 * 1~5 로. 다듬고 나서도 쓸 수 없으면 까닭을 돌려준다(화면에 그대로 나간다).
 *
 * 운동이 실제로 있는 암케어 운동인지는 여기서 모른다 — 저장하는 쪽이 라이브러리와
 * 맞춰 본다(app/actions/armcare.ts).
 */
export function normalizeRoutineInput(input: {
  name: unknown;
  items: unknown;
}): { ok: true; name: string; items: MyRoutineItem[] } | { ok: false; error: string } {
  const name =
    typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) return { ok: false, error: '루틴 이름을 적어 주세요.' };
  if (name.length > MY_ROUTINE_NAME_MAX) {
    return { ok: false, error: `루틴 이름은 ${MY_ROUTINE_NAME_MAX}자까지입니다.` };
  }
  const items = readRoutineItems(input.items);
  if (items.length === 0) return { ok: false, error: '운동을 하나 이상 담아 주세요.' };
  if (items.length > MY_ROUTINE_MAX_ITEMS) {
    return {
      ok: false,
      error: `한 루틴에는 운동을 ${MY_ROUTINE_MAX_ITEMS}개까지 담을 수 있습니다.`,
    };
  }
  return { ok: true, name, items };
}
