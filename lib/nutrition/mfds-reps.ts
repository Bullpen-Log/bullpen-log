import type { MfdsItem } from '@/lib/nutrition/mfds-parse';
import data from './mfds-reps.json' with { type: 'json' };

/**
 * 식약처 '품목대표' 8,800줄 — 앱에 넣어 둔 것에서 이름으로 찾는다(포털을 부르지 않는다).
 *
 * 품목대표는 품목마다 하나씩 정해 둔 표준값이다(쌀밥 · 달걀_삶은것 · 바나나, 생것). 검색 맨 위에 올 것이 대개
 * 여기 있는데, 포털에 '품목대표만' 달라고 하면 결과가 100줄이 안 될 때 DB 전체를 훑느라 4초가 걸린다. 한 번 검색에
 * 그런 호출이 두세 번 필요해서, 통째로 받아 넣어 두었다(scripts/fetch-mfds-reps.mjs — npm run nutrition:reps).
 * 상품(30만 줄)은 그대로 포털에 묻는다(lib/nutrition/mfds.ts).
 *
 * 0.8MB 라 서버에서만 쓴다 — 화면(클라이언트) 파일에서 불러오면 그만큼이 폰으로 내려간다.
 */

const GROUP_NAME: Record<string, string> = { D: '음식', P: '가공식품', R: '원재료성' };

/** 포털 응답의 한 줄과 같은 칸 이름으로 편다 — 검색 순서(mfds-rank.ts)와 음식 변환(mfds-parse.ts)이 그대로 읽는다 */
const REPS: MfdsItem[] = (data.rows as string[][]).map(
  ([cd, name, servingSize, weight, kcal, carbs, protein, fat]) => ({
    FOOD_CD: cd,
    FOOD_NM_KR: name,
    DB_GRP_CM: cd[0],
    DB_GRP_NM: GROUP_NAME[cd[0]] ?? '',
    DB_CLASS_NM: '품목대표',
    SERVING_SIZE: servingSize,
    Z10500: weight,
    AMT_NUM1: kcal,
    AMT_NUM6: carbs,
    AMT_NUM3: protein,
    AMT_NUM4: fat,
    MAKER_NM: null,
  })
);

/** 넣어 둔 품목대표 전부 — 음식 창의 둘러보기가 분류별로 나눈다(lib/nutrition/mfds-browse.ts) */
export function allMfdsReps(): readonly MfdsItem[] {
  return REPS;
}

/** 넣어 둔 자료를 받은 날(YYYY-MM-DD) — 검색 결과 저장의 열쇠에도 들어간다(자료를 다시 받으면 옛 결과를 안 쓴다) */
export const MFDS_REPS_DATE: string = data.fetchedAt;

/** 넣어 둔 줄 수 */
export const MFDS_REPS_COUNT = REPS.length;

/**
 * 이름에 그 말이 든 품목대표를 모두(식품코드 순 = 포털의 DB 순서).
 * 포털의 이름 검색과 같게 맞춘다 — 글자 그대로의 포함 검색이고 쉼표 · 공백도 글자다('소고기,' 는 원재료 이름만 건다).
 */
export function findMfdsReps(term: string): MfdsItem[] {
  const t = term.normalize('NFC');
  if (!t.trim()) return [];
  return REPS.filter((it) => (it.FOOD_NM_KR as string).includes(t));
}
