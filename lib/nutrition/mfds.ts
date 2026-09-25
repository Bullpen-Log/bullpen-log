import 'server-only';
import type { Food } from '@/lib/nutrition/meta';
import { itemsOf, toFood } from '@/lib/nutrition/mfds-parse';

/**
 * 식약처 식품영양성분DB — 공공데이터포털 오픈 API.
 *
 * 음식(찌개·국밥 같은 요리), 가공식품(편의점 도시락·단백질 음료 같은 제품),
 * 원재료(닭가슴살·바나나 같은 재료)를 모두 이름으로 찾는다. 앱의 기본 목록
 * (foods.ts)은 100여 가지뿐이라, 여기서 나머지를 채운다.
 *
 * 인증키가 있어야 한다. 공공데이터포털(data.go.kr)에서 '식품의약품안전처_
 * 식품영양성분DB정보'를 활용신청하면 바로 나온다. 받은 '일반 인증키(Decoding)'를
 * 환경변수 FOOD_API_KEY 에 넣는다(.env 와 Vercel 둘 다). 키가 없으면 이 파일은
 * 빈 목록을 돌려주고, 화면은 기본 목록과 내 음식만으로 돈다.
 *
 * 공공누리 자료라 출처를 밝힌다 — 화면의 검색 결과 밑에 적는다.
 */

const ENDPOINT =
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

function apiKey() {
  const raw = process.env.FOOD_API_KEY?.trim();
  if (!raw) return null;
  /*
   * 포털은 같은 키를 두 모양으로 준다 — 그대로(Decoding)와 주소용으로 바꾼 것(Encoding).
   * 주소에 넣을 때 한 번 더 바꾸므로, 바꾼 것을 넣었으면 되돌려 둔다. 두 번 바뀐
   * 키는 '등록되지 않은 키'로 거절된다.
   */
  try {
    return raw.includes('%') ? decodeURIComponent(raw) : raw;
  } catch {
    return raw;
  }
}

export function mfdsEnabled() {
  return apiKey() !== null;
}

/**
 * 이름으로 찾기. 실패하면(키가 없거나, 포털이 느리거나, 모양이 다르면) 빈 목록.
 *
 * 같은 낱말은 하루 동안 다시 묻지 않는다(Next 의 fetch 저장). 개발용 키는 하루
 * 호출 수가 정해져 있고, 포털은 한 번에 0.3~1초씩 걸린다.
 */
export async function searchMfds(query: string, limit = 25): Promise<Food[]> {
  const key = apiKey();
  const q = query.trim();
  if (!key || !q) return [];

  const url = new URL(ENDPOINT);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', String(limit));
  url.searchParams.set('type', 'json');
  url.searchParams.set('FOOD_NM_KR', q);

  try {
    const res = await fetch(url, {
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.warn(`[mfds] ${res.status} ${res.statusText}`);
      return [];
    }
    const text = await res.text();
    /* 키가 틀리면 json 을 달라고 해도 XML 오류문이 온다 */
    if (!text.trimStart().startsWith('{')) {
      console.warn(`[mfds] JSON 이 아닌 응답: ${text.slice(0, 160)}`);
      return [];
    }
    return itemsOf(JSON.parse(text))
      .map(toFood)
      .filter((f): f is Food => f !== null);
  } catch (e) {
    console.warn('[mfds] 검색 실패', e instanceof Error ? e.message : e);
    return [];
  }
}
