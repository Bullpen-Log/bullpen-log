import { BASIC_FOODS, basicAliases } from '@/lib/nutrition/foods';
import { AMOUNT_MAX, type Food } from '@/lib/nutrition/meta';

/**
 * 사진 기록(영양 로드맵 7번) — AI 가 사진에서 찾은 음식을 앱의 음식 값에 맞춘다(순수 계산).
 *
 * AI 는 음식 이름과 보이는 양(g)은 잘 짐작하지만 영양 값은 흔들린다. 그래서 값은 되도록 앱이 가진 것으로 쓴다:
 *   1. 기본 음식(foods.ts) — 이름이 같거나(다른 이름 포함) 한쪽이 다른 쪽을 거의 다 품을 때
 *   2. 식약처 품목대표 — 이름이 같거나 '김치찌개_돼지고기'처럼 그 이름으로 시작하는 것(서버가 찾아 넘긴다)
 *   3. 둘 다 없으면 AI 가 적은 값 그대로(직접 입력 음식으로 — 'AI 짐작'이라고 보인다)
 * 양(인분)은 AI 가 짐작한 g ÷ 그 음식의 1인분 g 을 ¼ 단위로(¼~5인분).
 */

export type PhotoFood = {
  name: string;
  grams: number;
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  confidence: 'high' | 'medium' | 'low';
};

export type PhotoCandidate = {
  key: string;
  /** 담을 음식(1인분 값) */
  food: Food;
  /** 담을 양(인분) */
  amount: number;
  /** AI 가 짐작한 무게(g) */
  grams: number;
  confidence: PhotoFood['confidence'];
  /** 영양 값이 어디서 왔나 */
  from: 'basic' | 'mfds' | 'ai';
  /** AI 가 부른 이름 — 맞춘 음식 이름과 다를 수 있다 */
  aiName: string;
};

/** 괄호 · 띄어쓰기를 걷어 이름을 견준다 — '달걀(삶은 것)' 과 '삶은 달걀' 을 같게 보지는 않는다 */
export function normalizeFoodName(name: string) {
  return name
    .normalize('NFC')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s_,·]/g, '')
    .trim();
}

/** 기본 음식에서 같은 음식 — 이름 · 다른 이름이 같거나, 한쪽이 다른 쪽을 품고 길이가 6할 넘게 겹칠 때 */
export function matchBasicFood(
  name: string,
  foods: readonly Food[] = BASIC_FOODS
): Food | null {
  const n = normalizeFoodName(name);
  if (n.length < 1) return null;
  let best: { food: Food; score: number } | null = null;
  for (const f of foods) {
    const names = [f.name, ...(f.id ? basicAliases(f.id) : [])];
    for (const raw of names) {
      const m = normalizeFoodName(raw);
      if (!m) continue;
      let score = 0;
      if (m === n) score = 1;
      else if (m.includes(n) || n.includes(m)) {
        const ratio = Math.min(m.length, n.length) / Math.max(m.length, n.length);
        if (Math.min(m.length, n.length) >= 2 && ratio >= 0.6) score = ratio * 0.9;
      }
      if (score > (best?.score ?? 0)) best = { food: f, score };
    }
  }
  return best?.food ?? null;
}

const roundQuarter = (n: number) => Math.round(n * 4) / 4;

/** 짐작한 무게 → 인분(¼ 단위, ¼~5). 1인분 무게를 모르면 1 */
export function amountForGrams(food: Food, grams: number) {
  if (!food.servingGrams || !(grams > 0)) return 1;
  return Math.min(
    5,
    AMOUNT_MAX,
    Math.max(0.25, roundQuarter(grams / food.servingGrams))
  );
}

/**
 * AI 의 결과 → 담을 후보. findMfds 는 서버가 넘기는 식약처 품목대표 찾기(이름 → 음식, 없으면 null).
 * 이상한 값(음수 · 엄청 큰 무게)은 걸러 낸다 — AI 가 틀려도 한 끼에 10kg 을 담지 않게.
 */
export function matchPhotoFoods(
  foods: readonly PhotoFood[],
  findMfds: (name: string) => Food | null
): PhotoCandidate[] {
  const out: PhotoCandidate[] = [];
  foods.slice(0, 12).forEach((p, i) => {
    const name = p.name.trim().slice(0, 40);
    if (!name) return;
    const grams = Number.isFinite(p.grams) ? Math.min(2000, Math.max(5, p.grams)) : 100;
    const basic = matchBasicFood(name);
    const mfds = basic ? null : findMfds(name);
    const matched = basic ?? mfds;
    let food: Food;
    let from: PhotoCandidate['from'];
    if (matched) {
      food = matched;
      from = basic ? 'basic' : 'mfds';
    } else {
      const val = (v: number) =>
        Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null;
      food = {
        source: 'free',
        id: null,
        name,
        servingLabel: `${Math.round(grams)}g(사진 짐작)`,
        servingGrams: Math.round(grams),
        kcal: Math.max(
          0,
          Math.round(Number.isFinite(p.kcal) ? Math.min(p.kcal, 3000) : 0)
        ),
        carbs: val(p.carbs),
        protein: val(p.protein),
        fat: val(p.fat),
      };
      from = 'ai';
    }
    out.push({
      key: `${i}-${name}`,
      food,
      amount: from === 'ai' ? 1 : amountForGrams(food, grams),
      grams: Math.round(grams),
      confidence: p.confidence,
      from,
      aiName: name,
    });
  });
  return out;
}

/** 식약처 품목대표 줄 가운데 이 이름과 맞는 것 — 이름이 같거나 '이름_' · '이름,' 으로 시작하는 것 중 가장 짧은 것(일반 음식 D1 먼저) */
export function pickMfdsRep<T extends { FOOD_CD?: unknown; FOOD_NM_KR?: unknown }>(
  name: string,
  rows: readonly T[]
): T | null {
  const n = normalizeFoodName(name);
  if (!n) return null;
  const fits = rows.filter((r) => {
    const raw = String(r.FOOD_NM_KR ?? '');
    const m = normalizeFoodName(raw);
    return m === n || raw.startsWith(`${name}_`) || raw.startsWith(`${name},`);
  });
  const rank = (r: T) => {
    const code = String(r.FOOD_CD ?? '');
    return code[0] === 'D' ? (code[1] === '1' ? 0 : 1) : code[0] === 'P' ? 2 : 3;
  };
  fits.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      String(a.FOOD_NM_KR).length - String(b.FOOD_NM_KR).length ||
      String(a.FOOD_CD).localeCompare(String(b.FOOD_CD))
  );
  return fits[0] ?? null;
}
