import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  isMealKey,
  scaleMacros,
  sumMacros,
  type EntrySource,
  type Food,
  type Macros,
  type MealEntryView,
  type MealKey,
} from '@/lib/nutrition/meta';

/**
 * 자주 먹는 조합(영양 로드맵 6번) — 여러 음식을 한 묶음으로 저장해 두고 한 번에 담는다.
 *
 * '어제와 같이 담기'는 어제 그 끼니만 되살린다. 매일 같은 아침을 먹는 선수는 이틀만 걸러도 다시 하나씩 찾아야
 * 했다. 조합은 날짜와 상관없이 남는다.
 *
 *   저장   음식 창 위의 '이 아침을 조합으로 저장' — 그 끼니에 두 가지 이상 담겨 있을 때. 같은 음식이 두 줄이면
 *          양을 더해 한 줄로 묶는다. 이미 같은 조합이 있으면 저장 줄을 띄우지 않는다.
 *   담기   음식 창 맨 위에 조합 세 개(이 끼니에 저장한 것 먼저, 그다음 자주 담은 것). 나머지는 '내 음식' 탭.
 *   값     음식 값은 담을 때처럼 찍어 둔다(MealEntry 와 같은 까닭 — 원래 음식이 바뀌어도 조합은 그대로).
 *
 * 순수 계산만 둔다 — 저장은 app/actions/nutrition.ts, 읽기는 lib/nutrition/load.ts.
 */

/** 한 사람이 둘 수 있는 조합 수 */
export const COMBO_MAX = 50;
/** 한 조합의 음식 수 — 한 번에 담을 수 있는 수(40)보다 작게 */
export const COMBO_ITEMS_MAX = 20;
export const COMBO_NAME_MAX = 30;
/** 음식 창 맨 위에 바로 보이는 조합 수 */
export const COMBO_TOP = 3;

/** 조합 속 음식 한 줄 — DB(MealCombo.items)에 이 모양으로 들어간다 */
export type ComboItem = {
  source: EntrySource;
  sourceId: string | null;
  name: string;
  servingLabel: string | null;
  servingGrams: number | null;
  /** 1인분 값 */
  kcal: number;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
  /** 담을 양(인분) */
  amount: number;
};

export type MealComboView = {
  id: string;
  name: string;
  /** 저장한 끼니. 모르면 null */
  meal: MealKey | null;
  items: ComboItem[];
  useCount: number;
};

/* 같은 음식인지 — 출처 · 열쇠 · 이름 · 1인분 · kcal 이 모두 같으면 같은 음식(직접 입력은 열쇠가 없다) */
const foodKey = (i: Omit<ComboItem, 'amount'>) =>
  [i.source, i.sourceId ?? '', i.name, i.servingLabel ?? '', i.kcal].join('|');

const roundAmount = (a: number) =>
  Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, Math.round(a * 20) / 20));

/** 끼니의 기록 → 조합 줄. 같은 음식은 양을 더해 한 줄로, 처음 담은 차례대로. */
export function itemsFromEntries(entries: MealEntryView[]): ComboItem[] {
  const out = new Map<string, ComboItem>();
  for (const e of entries) {
    const item: ComboItem = {
      source: e.source,
      sourceId: e.sourceId,
      name: e.name,
      servingLabel: e.servingLabel,
      servingGrams: e.servingGrams,
      kcal: e.kcal,
      carbs: e.carbs,
      protein: e.protein,
      fat: e.fat,
      amount: e.amount,
    };
    const key = foodKey(item);
    const same = out.get(key);
    if (same) same.amount = roundAmount(same.amount + item.amount);
    else out.set(key, { ...item, amount: roundAmount(item.amount) });
  }
  return [...out.values()].slice(0, COMBO_ITEMS_MAX);
}

/** 조합의 지문 — 음식과 양이 같으면 담은 차례가 달라도 같다 */
export function comboSignature(items: ComboItem[]) {
  return items
    .map((i) => `${foodKey(i)}×${roundAmount(i.amount)}`)
    .sort()
    .join('\n');
}

/** 같은 조합이 이미 있나 */
export function findCombo(list: MealComboView[], items: ComboItem[]) {
  if (items.length === 0) return null;
  const sig = comboSignature(items);
  return list.find((c) => comboSignature(c.items) === sig) ?? null;
}

/* '달걀(삶은 것)' → '달걀' — 이름 칸이 짧다 */
const shortName = (name: string) =>
  name.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || name;

/** 조합 이름의 기본값 — '달걀 · 쌀밥 외 2가지' */
export function defaultComboName(items: ComboItem[]) {
  const names = items.map((i) => shortName(i.name));
  const head = names.slice(0, 2).join(' · ');
  const rest = names.length - 2;
  const name = rest > 0 ? `${head} 외 ${rest}가지` : head;
  return name.length > COMBO_NAME_MAX ? `${name.slice(0, COMBO_NAME_MAX - 1)}…` : name;
}

/** 조합 전체의 칼로리 · 탄단지 */
export function comboMacros(items: ComboItem[]): Macros {
  return sumMacros(items.map((i) => scaleMacros(i, i.amount)));
}

/** 담기 창의 음식 모양으로 — 담을 때는 다른 음식과 같은 길(addMealEntries)로 간다 */
export function comboFood(item: ComboItem): Food {
  return {
    source: item.source,
    id: item.sourceId,
    name: item.name,
    servingLabel: item.servingLabel ?? '1인분',
    servingGrams: item.servingGrams,
    kcal: item.kcal,
    carbs: item.carbs,
    protein: item.protein,
    fat: item.fat,
  };
}

/** 보이는 차례 — 이 끼니에 저장한 것 먼저, 그 안에서는 자주 담은 것(같으면 원래 차례) */
export function orderCombos(list: MealComboView[], meal: MealKey) {
  return list
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        Number(b.c.meal === meal) - Number(a.c.meal === meal) ||
        b.c.useCount - a.c.useCount ||
        a.i - b.i
    )
    .map(({ c }) => c);
}

const SOURCES: EntrySource[] = ['basic', 'mfds', 'mine', 'free'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * DB 의 items(Json)를 하나씩 다시 본다 — 모양이 틀린 줄은 버린다. 저장할 때 이미 거른 값이지만, 읽는 쪽이
 * 그 약속에 기대면 손으로 고친 줄 하나가 영양 화면을 통째로 넘어뜨린다.
 */
export function parseComboItems(raw: unknown): ComboItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ComboItem[] = [];
  for (const r of raw.slice(0, COMBO_ITEMS_MAX)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const source = SOURCES.find((s) => s === o.source);
    const name = str(o.name);
    const kcal = num(o.kcal);
    const amount = num(o.amount);
    if (!source || !name || kcal === null || kcal < 0 || amount === null || amount <= 0)
      continue;
    const macro = (v: unknown) => {
      const n = num(v);
      return n !== null && n >= 0 ? n : null;
    };
    out.push({
      source,
      sourceId: source === 'free' ? null : str(o.sourceId),
      name,
      servingLabel: str(o.servingLabel),
      servingGrams: macro(o.servingGrams),
      kcal,
      carbs: macro(o.carbs),
      protein: macro(o.protein),
      fat: macro(o.fat),
      amount: roundAmount(amount),
    });
  }
  return out;
}

/** DB 의 줄 → 화면의 조합. 음식이 하나도 안 남으면 null(화면에 안 보인다) */
export function comboView(row: {
  id: string;
  name: string;
  meal: string | null;
  items: unknown;
  useCount: number;
}): MealComboView | null {
  const items = parseComboItems(row.items);
  if (items.length === 0) return null;
  return {
    id: row.id,
    name: row.name,
    meal: isMealKey(row.meal) ? row.meal : null,
    items,
    useCount: row.useCount,
  };
}
