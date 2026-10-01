import { KCAL_MAX, MACRO_MAX, FOOD_NAME_MAX, type Food } from '@/lib/nutrition/meta';

/**
 * 바코드로 담기(영양 로드맵 8번) — 숫자 검사와 공개 자료(Open Food Facts)를 앱의 음식 모양으로 바꾸는 일(순수 계산).
 *
 * 식약처 영양성분 DB 에는 바코드가 없다(바코드 → 제품은 식품안전나라의 다른 키가 필요하다). 그래서
 *   1. 그 사람이 전에 적어 둔 같은 바코드(내 음식, source 'barcode')
 *   2. Open Food Facts — 키 없이 쓰는 세계 공개 자료. 한국 제품은 큰 회사 것 위주로 있고 이름이 영어일 때가 많다
 *   3. 없으면 포장지의 영양 정보를 한 번 적게 한다 — 저장하면 다음부터 1번에서 바로 나온다
 * 서버 쪽(내 음식 찾기 · 바깥 호출)은 barcode-lookup.ts, 여기는 시험이 그대로 부르는 계산만.
 */

/** GTIN 끝자리(검사 숫자) — 오른쪽부터 3 · 1 을 번갈아 곱한 합으로 */
export function gtinValid(digits: string) {
  if (!/^\d+$/.test(digits)) return false;
  const nums = [...digits].map(Number);
  const check = nums.pop()!;
  let sum = 0;
  nums.reverse().forEach((n, i) => {
    sum += n * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * UPC-E(8자리 줄인 UPC — 작은 캔 · 과자) → UPC-A 12자리. 첫 자리(번호 체계)가 0 · 1 이 아니거나 펼친 값의 검사 숫자가
 * 맞지 않으면 null. 여섯째 자리가 0~2 · 3 · 4 · 5~9 일 때 회사 · 제품 번호를 펴는 자리가 다르다.
 */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [ns, a, b, c, d, e, f, check] = [...code];
  let body: string;
  if (f === '0' || f === '1' || f === '2') body = `${a}${b}${f}0000${c}${d}${e}`;
  else if (f === '3') body = `${a}${b}${c}00000${d}${e}`;
  else if (f === '4') body = `${a}${b}${c}${d}00000${e}`;
  else body = `${a}${b}${c}${d}${e}0000${f}`;
  const upcA = `${ns}${body}${check}`;
  return gtinValid(upcA) ? upcA : null;
}

/**
 * 적거나 읽은 바코드 → 숫자만(EAN-13 · EAN-8 · UPC-A 12 · GTIN-14, 검사 숫자가 맞을 때). 아니면 null.
 * 8자리가 EAN-8 로 맞지 않으면 UPC-E 로 보고 12자리로 편다(자료는 UPC-A 로 찾는다).
 */
export function cleanBarcode(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  if (gtinValid(digits)) return digits;
  return digits.length === 8 ? expandUpcE(digits) : null;
}

type OffProduct = {
  product_name?: unknown;
  product_name_ko?: unknown;
  product_name_en?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  product_quantity?: unknown;
  serving_size?: unknown;
  serving_quantity?: unknown;
  nutriments?: Record<string, unknown>;
};

/** Open Food Facts 에 물을 칸 — 필요한 것만 받아 응답을 작게 */
export const OFF_FIELDS = [
  'product_name',
  'product_name_ko',
  'product_name_en',
  'generic_name',
  'brands',
  'product_quantity',
  'serving_size',
  'serving_quantity',
  'nutriments',
].join(',');

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 제품 이름 — 한국어 이름 먼저, 회사 이름이 빠져 있으면 앞에 붙인다(영어 이름만 있는 제품이 많다) */
export function offProductName(p: OffProduct): string | null {
  const base =
    text(p.product_name_ko) ||
    text(p.product_name) ||
    text(p.product_name_en) ||
    text(p.generic_name);
  if (!base) return null;
  const brand = text(p.brands).split(',')[0]?.trim() ?? '';
  const name =
    brand && !base.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} ${base}`
      : base;
  return name.slice(0, FOOD_NAME_MAX);
}

export type BarcodeParse = {
  /** 담을 수 있는 음식 — 칼로리를 모르면 null */
  food: Food | null;
  /** 찾은 이름(칼로리가 없어도) — 적는 칸에 미리 넣는다 */
  name: string | null;
};

/**
 * Open Food Facts 응답 → 음식. 1회 양이 있으면 1회, 없고 포장이 작으면(500g 이하) 한 개, 아니면 100g.
 * 값이 상한을 넘으면(오타 · 단위 잘못) 담지 않는다.
 */
export function parseOffProduct(code: string, json: unknown): BarcodeParse {
  const body = json as { status?: unknown; product?: OffProduct } | null;
  const p = body?.product;
  if (!p || body?.status !== 1) return { food: null, name: null };
  const name = offProductName(p);
  const n = p.nutriments ?? {};
  const kj = (k: string) => {
    const v = num(n[k]);
    return v === null ? null : v / 4.184;
  };
  const kcal100 =
    num(n['energy-kcal_100g']) ?? kj('energy-kj_100g') ?? kj('energy_100g');
  const kcalServing =
    num(n['energy-kcal_serving']) ?? kj('energy-kj_serving') ?? kj('energy_serving');
  const per = (key: string, scale: number | null, serving: boolean) => {
    const direct = serving ? num(n[`${key}_serving`]) : null;
    if (direct !== null) return round1(direct);
    const v100 = num(n[`${key}_100g`]);
    return v100 === null || scale === null ? null : round1((v100 * scale) / 100);
  };
  if (!name) return { food: null, name: null };

  const sq = num(p.serving_quantity);
  const pq = num(p.product_quantity);
  let label: string;
  let grams: number;
  let kcal: number | null;
  let serving = false;
  if (sq && sq <= 2000 && (kcalServing !== null || kcal100 !== null)) {
    serving = true;
    grams = sq;
    const size = text(p.serving_size);
    label = `1회(${size && size.length <= 20 ? size : `${round1(sq)}g`})`;
    kcal = kcalServing ?? (kcal100 !== null ? (kcal100 * sq) / 100 : null);
  } else if (kcal100 !== null && pq && pq <= 500) {
    grams = pq;
    label = `1개(${round1(pq)}g)`;
    kcal = (kcal100 * pq) / 100;
  } else if (kcal100 !== null) {
    grams = 100;
    label = '100g';
    kcal = kcal100;
  } else {
    return { food: null, name };
  }
  if (kcal === null || kcal > KCAL_MAX) return { food: null, name };
  const macro = (key: string) => {
    const v = per(key, grams, serving);
    return v !== null && v <= MACRO_MAX ? v : null;
  };
  return {
    name,
    food: {
      source: 'barcode',
      id: code,
      name,
      servingLabel: label,
      servingGrams: round1(grams),
      kcal: round1(kcal),
      carbs: macro('carbohydrates'),
      protein: macro('proteins'),
      fat: macro('fat'),
    },
  };
}
