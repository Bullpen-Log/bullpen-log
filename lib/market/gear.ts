/**
 * 장비 고르기 안내(5판, 2026-10-21) — 초보 · 학부모가 '뭘 사야 하나'에 답한다. 포지션 · 나이대 · 던지는 손으로 권하는 규격과 바깥 구매 검색 링크.
 * 제휴(쿠팡 파트너스 등)는 계약 뒤 NEXT_PUBLIC_SHOP_SEARCH 로 바꾼다 — 지금은 네이버 쇼핑 검색.
 */

export const AGE_GROUPS = [
  {
    key: 'u10',
    label: '초등 저학년',
    glove: '10~11인치',
    bat: '26~28인치 · 가벼운 것',
    shoe: '고무 징',
  },
  {
    key: 'u13',
    label: '초등 고학년',
    glove: '11~11.5인치',
    bat: '28~30인치',
    shoe: '고무 징',
  },
  {
    key: 'u16',
    label: '중학생',
    glove: '11.5~12인치',
    bat: '30~32인치',
    shoe: '고무 · 금속 징(리그 규정)',
  },
  {
    key: 'u19',
    label: '고등학생',
    glove: '11.5~12.5인치',
    bat: '32~34인치 나무',
    shoe: '금속 징',
  },
  {
    key: 'adult',
    label: '성인 · 사회인',
    glove: '11.5~12.75인치',
    bat: '32~34인치(리그 규정 확인)',
    shoe: '금속 · 고무 징(구장 규정)',
  },
] as const;
export type AgeKey = (typeof AGE_GROUPS)[number]['key'];
export function isAgeKey(v: unknown): v is AgeKey {
  return AGE_GROUPS.some((a) => a.key === v);
}

export const POSITIONS = [
  { key: 'pitcher', label: '투수', glove: '투수용(닫힌 웹) 11.5~12인치' },
  { key: 'infield', label: '내야', glove: '내야용(얕은 포켓) 11~11.75인치' },
  { key: 'outfield', label: '외야', glove: '외야용(깊은 포켓) 12~12.75인치' },
  { key: 'catcher', label: '포수', glove: '포수 미트 + 보호구 세트' },
  { key: 'first', label: '1루', glove: '1루 미트 12~13인치' },
] as const;
export type PositionKey = (typeof POSITIONS)[number]['key'];
export function isPositionKey(v: unknown): v is PositionKey {
  return POSITIONS.some((p) => p.key === v);
}

export type GearPick = { item: string; spec: string; why: string; query: string };

/** 권하는 장비 다섯 — 규격 · 까닭 · 검색어 */
export function recommend(
  age: AgeKey,
  position: PositionKey,
  hand: 'R' | 'L'
): GearPick[] {
  const a = AGE_GROUPS.find((x) => x.key === age)!;
  const p = POSITIONS.find((x) => x.key === position)!;
  const handWord = hand === 'L' ? '좌투(오른손 착용)' : '우투(왼손 착용)';
  return [
    {
      item: '글러브',
      spec: `${p.glove} · ${a.glove} · ${handWord}`,
      why: '포지션마다 포켓 깊이가 다르고, 손에 맞는 크기여야 공을 잡는다',
      query: `야구 글러브 ${p.label} ${hand === 'L' ? '좌투' : '우투'}`,
    },
    {
      item: '배트',
      spec: a.bat,
      why: '길고 무거운 배트는 스윙이 늦는다. 가볍게 시작해서 늘린다',
      query: `야구 배트 ${a.label}`,
    },
    {
      item: '스파이크',
      spec: a.shoe,
      why: '징 종류는 리그 · 구장 규정을 따른다',
      query: `야구 스파이크 ${a.shoe.split(' ')[0]}`,
    },
    {
      item: '배팅 장갑 · 보호구',
      spec:
        position === 'catcher'
          ? '포수 보호구 세트 · 미트'
          : '배팅 장갑, 타격 시 암가드',
      why: '손 물집과 타구 맞음을 막는다',
      query: position === 'catcher' ? '포수 장비 세트' : '야구 배팅 장갑',
    },
    {
      item: '공 · 가방',
      spec: '연습구 6개 이상 · 장비 가방',
      why: '캐치볼 · 티배팅은 공이 여러 개 있어야 끊기지 않는다',
      query: '야구 연습구',
    },
  ];
}

/** 바깥 구매 검색 주소 — 제휴 계약 뒤 바꾼다 */
export function shopSearchUrl(query: string): string {
  const base =
    process.env.NEXT_PUBLIC_SHOP_SEARCH ??
    'https://search.shopping.naver.com/search/all?query=';
  return `${base}${encodeURIComponent(query)}`;
}
