import { REVIEW_TAGS, SPECIALTIES, type SpecialtyKey } from '@/lib/market/lessons';
import type { VenueHours } from '@/lib/market/venues';

/**
 * 더미 코치(2026-10-22 금윤호: "더미 코치도 넣어볼 수 있게") — 관리자가 화면을 채워 보려고 넣는 가짜 코치. 순수 생성(씨앗으로 같은 결과)이라 시험이 본다.
 * 서버(app/actions/admin-coaches.ts)가 이 모양대로 Org(dummy: true) + 끝난 예약 · 후기를 만든다. 지울 때는 dummy 인 Org 를 통째로(딸린 것은 Cascade).
 */
export type DummyCoach = {
  name: string;
  coachName: string;
  region: string;
  intro: string;
  career: string;
  specialties: SpecialtyKey[];
  priceFrom: number;
  trialPrice: number | null;
  priceNote: string | null;
  slotMin: number;
  sinkerReview: boolean;
  slots: VenueHours;
  reviews: { rating: number; body: string; tags: string[]; daysAgo: number; confirmHours: number }[];
};

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const GIVEN = ['민수', '지훈', '성민', '태호', '동현', '준서', '현우', '재원', '승호', '도윤', '하준', '시우', '유진', '서연', '지아'];
const STUDIOS = ['베이스볼랩', '피치업 아카데미', '원샷 야구교실', '스윙팩토리', '마운드 클럽', '다이아몬드 레슨장', '홈런타운', '퍼펙트게임', '빅리그 아카데미', '그라운드제로'];
const REGIONS = ['서울 강남', '서울 송파', '서울 마포', '경기 성남', '경기 수원', '경기 고양', '인천 연수', '부산 해운대', '대구 수성', '대전 유성'];
const INTROS = [
  '기본기부터 차근차근. 영상으로 폼을 같이 보고, 매 레슨 끝에 다음에 할 것을 정해 드려요.',
  '구속보다 제구가 먼저예요. 하체 쓰는 법부터 잡으면 공이 알아서 빨라져요.',
  '유소년은 재미가 1순위. 지루한 반복 대신 게임처럼 익히게 짜요.',
  '사회인 야구 10년, 지도 6년. 한 번에 한 가지만 고쳐요. 욕심내면 다 망가져요.',
  '싱커 기록을 같이 보면서 레슨해요. 던진 공 수 · 부하를 보고 그날 강도를 정해요.',
  '타격은 타이밍이 전부예요. 배트 스피드보다 컨택 포인트부터 맞춰요.',
  '재활 복귀 전문. 어깨 · 팔꿈치 아팠던 선수의 복귀 투구 프로그램을 같이 짜요.',
  '포수 전문. 블로킹 · 프레이밍 · 송구까지 한 세트로 봐요.',
];
const CAREERS = ['선수 8년 · 지도 5년', '프로 2군 출신 · 지도 7년', '대학 선수 · 지도 3년', '사회인 15년 · 지도 6년', '고교 코치 4년', '트레이너 자격 · 지도 10년'];
const REVIEW_BODIES = [
  '설명이 쉬워서 아이가 바로 알아들었어요. 다음 레슨도 잡았습니다.',
  '폼 영상을 찍어서 같이 보니까 뭐가 문제인지 확실히 알겠더라고요.',
  '시간 약속 잘 지키시고, 레슨 끝나고 숙제도 챙겨 주세요.',
  '구속 2~3km 올랐어요. 하체 쓰는 법이 핵심이었네요.',
  '친절하고 꼼꼼해요. 질문 많이 해도 다 받아 주심.',
  '첫 레슨이라 긴장했는데 편하게 해 주셨어요. 시설도 깨끗.',
  '기록 보면서 레슨해 주는 게 좋았어요. 던진 공 수까지 챙겨 주심.',
  '한 번에 많이 안 고치고 하나씩. 그게 오히려 빨리 늘어요.',
];

/** 씨앗 난수 — 같은 씨앗이면 같은 코치(시험용) */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}
const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
const some = <T,>(r: () => number, arr: readonly T[], n: number): T[] => {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
};

export function makeDummyCoach(seed: number): DummyCoach {
  const r = rng(seed * 2654435761 + 7);
  const specialties = some(r, SPECIALTIES.map((s) => s.key), 1 + Math.floor(r() * 3));
  const priceFrom = (3 + Math.floor(r() * 8)) * 10_000;
  const trial = r() < 0.5 ? Math.max(10_000, priceFrom - (1 + Math.floor(r() * 3)) * 10_000) : null;
  const evening = r() < 0.6;
  const slots: VenueHours = {};
  for (let d = 0; d < 7; d++) {
    const weekend = d === 0 || d === 6;
    if (r() < 0.2) slots[d] = null;
    else if (weekend) slots[d] = { open: '09:00', close: r() < 0.5 ? '13:00' : '18:00' };
    else slots[d] = evening ? { open: '17:00', close: '22:00' } : { open: '10:00', close: '20:00' };
  }
  const n = Math.floor(r() * 9);
  const reviews = Array.from({ length: n }, (_, i) => ({
    rating: r() < 0.7 ? 5 : r() < 0.7 ? 4 : 3,
    body: pick(r, REVIEW_BODIES),
    tags: some(r, REVIEW_TAGS.map((t) => t.key), Math.floor(r() * 3)),
    daysAgo: 2 + i * 6 + Math.floor(r() * 5),
    confirmHours: r() < 0.6 ? 1 + Math.floor(r() * 20) : 30 + Math.floor(r() * 60),
  }));
  return {
    name: pick(r, STUDIOS),
    coachName: `${pick(r, SURNAMES)}${pick(r, GIVEN)}`,
    region: pick(r, REGIONS),
    intro: pick(r, INTROS),
    career: pick(r, CAREERS),
    specialties,
    priceFrom,
    trialPrice: trial,
    priceNote: r() < 0.5 ? '10회권 10% 할인' : null,
    slotMin: pick(r, [60, 60, 90, 30]),
    sinkerReview: r() < 0.45,
    slots,
    reviews,
  };
}

export const DUMMY_MAX_AT_ONCE = 10;
/** 더미 코치에 딸린 가짜 예약의 메모 — 이것으로 알아보고 '내 것'에서 뺀다 */
export const DUMMY_BOOKING_NOTE = '더미 예약';
