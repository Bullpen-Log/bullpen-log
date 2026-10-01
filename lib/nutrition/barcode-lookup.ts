import 'server-only';
import { prisma } from '@/lib/prisma';
import { OFF_FIELDS, parseOffProduct } from '@/lib/nutrition/barcode';
import type { Food } from '@/lib/nutrition/meta';

/**
 * 바코드 → 음식(서버). 그 사람이 적어 둔 것 → Open Food Facts → 없음 차례(barcode.ts 설명).
 * 바깥에는 바코드 숫자만 보낸다(누가 찾는지는 안 보낸다). 같은 바코드는 일주일 동안 다시 묻지 않는다(fetch 캐시).
 */

export type BarcodeLookup =
  | { ok: true; food: Food; from: 'mine' | 'off' }
  | { ok: true; food: null; name: string | null }
  | { ok: false; error: string };

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
/* Open Food Facts 는 쓰는 앱 이름을 User-Agent 로 밝혀 달라고 한다 */
const USER_AGENT = 'BullpenLog/1.0 (https://bullpen-log.vercel.app)';
const WEEK = 60 * 60 * 24 * 7;
const FAILED = '바코드 자료에 닿지 못했어요. 잠시 뒤에 다시 해 주세요.';

export async function lookupBarcode(
  userId: string,
  code: string
): Promise<BarcodeLookup> {
  const saved = await prisma.userFood.findFirst({
    where: { userId, source: 'barcode', sourceId: code },
    orderBy: { updatedAt: 'desc' },
  });
  if (saved) {
    return {
      ok: true,
      from: 'mine',
      food: {
        source: 'barcode',
        id: code,
        name: saved.name,
        servingLabel: saved.servingLabel,
        servingGrams: saved.servingGrams,
        kcal: saved.kcal,
        carbs: saved.carbs,
        protein: saved.protein,
        fat: saved.fat,
      },
    };
  }

  try {
    const res = await fetch(`${OFF_URL}/${code}.json?fields=${OFF_FIELDS}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: WEEK },
    });
    /* 없는 제품은 404 와 status 0 둘 다 온다 */
    if (res.status === 404) return { ok: true, food: null, name: null };
    if (!res.ok) return { ok: false, error: FAILED };
    const parsed = parseOffProduct(code, await res.json());
    return parsed.food
      ? { ok: true, from: 'off', food: parsed.food }
      : { ok: true, food: null, name: parsed.name };
  } catch {
    return { ok: false, error: FAILED };
  }
}
