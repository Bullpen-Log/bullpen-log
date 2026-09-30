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

/** '100g' · '100mL' · '210 g' · '1,000.000g' → 양과 단위 */
function qty(v: unknown): { amount: number; unit: 'g' | 'ml' } | null {
  if (typeof v !== 'string') return null;
  /* 천 단위 쉼표를 뗀다 — 못 읽으면 해장국(1,000g) 한 그릇이 100g 값으로 나온다 */
  const m = v.replace(/[\s,]/g, '').match(/^([\d.]+)(g|ml)$/i);
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
 * 응답 한 쪽 → 전체 수와 줄들. 정상 응답이 아니면 null.
 *
 * 포털은 오류도 200 으로 주는 일이 있다(쪽 크기 초과 · 하루 한도 초과 — header.resultCode 가 '00' 이 아니다).
 * 결과가 0건이거나 쪽을 넘기면 items 칸이 아예 없다(오류가 아니다). totalCount 는 그 말 · 그 거름의 전체 수라
 * 검색 순서(lib/nutrition/mfds-rank.ts)가 다음에 무엇을 부를지 정하는 데 쓴다.
 */
export function pageOf(json: unknown): { total: number; items: MfdsItem[] } | null {
  const root = json as {
    header?: { resultCode?: unknown };
    body?: { totalCount?: unknown };
    response?: { header?: { resultCode?: unknown }; body?: { totalCount?: unknown } };
  } | null;
  if (!root || typeof root !== 'object') return null;
  const header = root.header ?? root.response?.header;
  const body = root.body ?? root.response?.body;
  if (!body || String(header?.resultCode ?? '') !== '00') return null;
  const total = num(body.totalCount);
  if (total === null || total < 0) return null;
  return { total, items: itemsOf(json) };
}

/**
 * 한 줄 → 앱의 음식 모양.
 *
 * 영양소는 '영양성분함량기준량'(보통 100g) 당 값으로 온다. 1인분은 '식품중량'
 * (Z10500, 한 번에 먹는 양)이 있으면 그것으로, 없으면 기준량 그대로 둔다.
 *
 * 가공식품(P)의 식품중량은 한 번 먹는 양이 아니라 **포장 전체**일 때가 많다(프로틴바 720g 상자 ·
 * 900g 업소용). 그대로 '1회'라 적으면 한 번에 1,500kcal 를 담게 된다. 한 번에 먹기 어려운
 * 크기(고체 500g 초과 · 음료 1L 이상 — mfds-rank.ts 가 '포장 전체'로 보는 선과 같다)면
 * 기준량(100g)으로 둔다. 음식(D)의 900g 국밥은 진짜 한 그릇이라 그대로 둔다.
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
  const pack =
    id.startsWith('P') &&
    weight !== null &&
    (weight.unit === 'ml' ? weight.amount >= 1000 : weight.amount > 500);
  /* 중량이 기준량과 같으면(쌀밥 100g) '1회(100g)' 이 아니라 그냥 '100g' */
  const serving =
    weight && weight.unit === base.unit && weight.amount !== base.amount && !pack
      ? weight
      : base;
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
