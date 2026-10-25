/**
 * 물건 상세 · 구매 요약의 순수 규칙(2026-10-25, docs/designs/dugout-market-commerce-plan.md 4절 · Phase 1).
 * 화면(app/(dugout)/market/[id]) · 결제 미리보기 · 시험이 같이 쓴다. DB 는 그대로 — 지금 표에 없는 것(배송비 · 발송 약속 · 본인 확인 · 완료 거래)은
 * 지어내지 않고 '없음 · 확인 필요'로 돌려준다. 확정 전 가정(수수료율)은 라벨에 '가정'을 단다.
 */
import { ESCROW_FEE_RATE, escrowFee } from '@/lib/market/pay';
import { conditionLabel, specLines } from '@/lib/market/specs';

/** 수수료율을 소수 자리 그대로('3.5%') — 반올림해 4% 로 적던 것을 막는다 */
export function feeRateLabel(rate: number = ESCROW_FEE_RATE): string {
  const pct = Math.round(rate * 1000) / 10;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct}%`;
}

export type BuyerQuote = {
  /** 물건값 */
  price: number;
  /** 구매자가 더 내는 수수료(가정 요율, 100원 올림) — 나눔은 0 */
  fee: number;
  feeLabel: string;
  /** 배송비 — 표에 칸이 없어 null(판매자에게 확인) */
  shipping: number | null;
  /** 지금 알 수 있는 합계(배송비 제외) */
  total: number;
  /** 나눔(0원)은 결제 주문이 아니다 */
  giveaway: boolean;
};

/** 구매자 쪽 금액 — 서버가 셈한 값이 늘 기준. 배송비는 아직 없는 칸이라 더하지 않고 null 로 둔다 */
export function buyerQuote(price: number): BuyerQuote {
  const giveaway = price <= 0;
  const fee = giveaway ? 0 : escrowFee(price);
  return {
    price: Math.max(0, price),
    fee,
    feeLabel: `안전결제 수수료 ${feeRateLabel()} (가정)`,
    shipping: null,
    total: Math.max(0, price) + fee,
    giveaway,
  };
}

/** 판매자 정산 예상 — 판매자 수수료는 아직 정해지지 않아 물건값 그대로(가정). 라벨이 그렇게 말한다 */
export function sellerNet(price: number): { net: number; note: string } {
  return {
    net: Math.max(0, price),
    note: '판매자 수수료는 아직 정해지지 않았어요. 지금은 물건값 그대로 셈해요.',
  };
}

/** 상태 한 줄 — 상태 칸(새 상품 · 거의 새것 · 사용감 있음 · 많이 씀)을 사실대로. 하자 유무는 단정하지 않는다 */
export function conditionStatement(condition: string): string {
  switch (condition) {
    case 'new':
      return '새 상품이에요. 포장 · 택 상태는 사진과 설명으로 확인해 주세요.';
    case 'like-new':
      return '거의 새것이에요. 사용 흔적이 거의 없다는 뜻이고, 자세한 건 사진을 봐 주세요.';
    case 'used':
      return '사용감이 있어요. 흠집 · 변색 같은 흔적은 사진과 설명에서 확인해 주세요.';
    case 'worn':
      return '많이 쓴 물건이에요. 사진을 꼭 확대해서 보고 궁금한 건 판매자에게 물어보세요.';
    default:
      return conditionLabel(condition);
  }
}

/**
 * 알려진 하자 — 표에 하자 칸이 없어(Phase 2 에서 더한다) 판매자 글에서 흔적을 찾아 보여 준다.
 * 못 찾으면 '적은 하자 없음'이 아니라 '판매자가 따로 적지 않았어요'로 — 하자 없음을 저절로 매기지 않는다.
 */
const DEFECT_WORDS = ['흠집', '찢', '해짐', '변색', '얼룩', '찍힘', '갈라', '늘어', '수선', '수리', '교체', '끈', '파손', '금', '바랜', '닳'];
export function knownDefects(body: string): string[] {
  const lines = body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.filter((l) => DEFECT_WORDS.some((w) => l.includes(w))).slice(0, 4);
}

/** 구매 요약에 보일 규격 — 품목의 꼭 적는 칸 위주로 셋까지 */
export function keySpecs(category: string, specs: unknown): { label: string; value: string }[] {
  return specLines(category, specs).slice(0, 3);
}

export type SellerFact = { label: string; value: string; ok: boolean };

/**
 * 판매자 확인 사실 — 서버가 아는 것만. 본인 확인 · 정산 계좌 확인은 아직 없는 기능이라 '아직 안 됨'으로 정직하게 보인다.
 * 투구 기록 · 운동 기록은 거래 신뢰의 근거가 아니라 넣지 않는다(규칙 7).
 */
export function sellerFacts(seller: { since: Date; listings: number; verified?: boolean; payoutVerified?: boolean; completed?: number }, now: Date): SellerFact[] {
  const days = Math.max(0, Math.floor((now.getTime() - seller.since.getTime()) / 86_400_000));
  return [
    { label: '본인 확인', value: seller.verified ? '확인됨' : '아직 안 됨', ok: !!seller.verified },
    { label: '정산 계좌 확인', value: seller.payoutVerified ? '확인됨' : '아직 안 됨', ok: !!seller.payoutVerified },
    { label: '완료한 거래', value: seller.completed != null ? `${seller.completed}건` : '0건 (거래 기능 준비 중)', ok: (seller.completed ?? 0) > 0 },
    { label: '가입', value: days < 30 ? `${days}일 전` : days < 365 ? `${Math.floor(days / 30)}개월 전` : `${Math.floor(days / 365)}년 전`, ok: true },
    { label: '올린 물건', value: `${seller.listings}개`, ok: true },
  ];
}

/** 거래 방법 한 줄 — 지역 칸으로 안다. 택배비 · 발송 약속 칸은 없어 '판매자에게 확인' */
export function fulfillmentOf(region: string): { method: string; shipping: string; dispatch: string } {
  const parcelOnly = region === '전국(택배)';
  return {
    method: parcelOnly ? '택배' : `택배 또는 ${region} 직거래`,
    shipping: '배송비 · 포함 여부는 판매자에게 확인',
    dispatch: '발송 약속은 판매자에게 확인',
  };
}

/** 사진 이름표 — 캡션 칸이 없어 차례만('사진 2 / 3') */
export function photoLabel(i: number, total: number): string {
  return `사진 ${i + 1} / ${total}`;
}
