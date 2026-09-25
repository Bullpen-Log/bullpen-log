import type { Food } from '@/lib/nutrition/meta';

/**
 * 식약처 식품영양성분DB 응답 읽기 — 받은 JSON 을 앱의 음식 모양으로 바꾼다.
 *
 * 부르는 쪽(mfds.ts)과 나눠 둔 까닭: 그쪽은 인증키를 다뤄서 서버에서만 돈다
 * ('server-only'). 이 부분은 순수한 변환이라, 자가 시험(scripts/nutrition-selftest.mts)
 * 이 실제 응답 모양을 넣어 보고 숫자가 맞게 나오는지 확인한다.
 */

export type MfdsItem = Record<string, unknown>;

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number.parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** '100g' · '100mL' · '210 g' → 양과 단위 */
function qty(v: unknown): { amount: number; unit: 'g' | 'ml' } | null {
  if (typeof v !== 'string') return null;
  const m = v.replace(/\s/g, '').match(/^([\d.]+)(g|ml)$/i);
  if (!m) return null;
  const amount = Number(m[1]);
  if (!(amount > 0)) return null;
  return { amount, unit: m[2].toLowerCase() === 'g' ? 'g' : 'ml' };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * 포털의 JSON 은 API 마다 두 모양이 섞여 있다.
 *   { header, body: { items: [...] } }
 *   { response: { body: { items: { item: [...] } } } }
 */
export function itemsOf(json: unknown): MfdsItem[] {
  const root = json as {
    body?: { items?: unknown };
    response?: { body?: { items?: unknown } };
  };
  const items = (root?.body ?? root?.response?.body)?.items as
    MfdsItem[] | { item?: MfdsItem[] | MfdsItem } | undefined;
  if (Array.isArray(items)) return items;
  const inner = items?.item;
  if (Array.isArray(inner)) return inner;
  return inner ? [inner] : [];
}

/**
 * 한 줄 → 앱의 음식 모양.
 *
 * 영양소는 '영양성분함량기준량'(보통 100g) 당 값으로 온다. 1인분은 '식품중량'
 * (Z10500, 한 번에 먹는 양)이 있으면 그것으로, 없으면 기준량 그대로 둔다.
 *
 *   AMT_NUM1 에너지(kcal) · AMT_NUM3 단백질 · AMT_NUM4 지방 · AMT_NUM6 탄수화물
 *   (포털의 '출력메세지_식품영양성분DB정보' 문서의 순서)
 */
export function toFood(it: MfdsItem): Food | null {
  const id = String(it.FOOD_CD ?? '').trim();
  const name = String(it.FOOD_NM_KR ?? '').trim();
  const perBase = num(it.AMT_NUM1);
  if (!id || !name || perBase === null) return null;

  const base = qty(it.SERVING_SIZE) ?? { amount: 100, unit: 'g' as const };
  const weight = qty(it.Z10500);
  const serving = weight && weight.unit === base.unit ? weight : base;
  const factor = serving.amount / base.amount;
  const scaled = (v: unknown) => {
    const n = num(v);
    return n === null ? null : Math.round(n * factor * 10) / 10;
  };

  const maker = typeof it.MAKER_NM === 'string' ? it.MAKER_NM.trim() : '';
  const group = typeof it.DB_GRP_NM === 'string' ? it.DB_GRP_NM.trim() : '';

  return {
    source: 'mfds',
    id,
    name,
    servingLabel:
      serving === base
        ? `${fmt(base.amount)}${base.unit}`
        : `1회(${fmt(serving.amount)}${serving.unit})`,
    /* 마시는 것은 ml 로 오는데, 물과 비슷하게 1ml ≈ 1g 으로 친다 */
    servingGrams: serving.amount,
    kcal: Math.round(perBase * factor),
    carbs: scaled(it.AMT_NUM6),
    protein: scaled(it.AMT_NUM3),
    fat: scaled(it.AMT_NUM4),
    note: maker && maker !== '해당없음' ? maker : group || undefined,
  };
}
