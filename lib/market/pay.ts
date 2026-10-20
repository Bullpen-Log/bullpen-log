/**
 * 결제 · 정산의 순수 규칙(4판 껍데기, 2026-10-21) — 수수료율과 셈만. 실제 결제는 계약 뒤(docs/designs/baseball-hub.md 6절 "숫자는 회의에서").
 * 아래 비율은 가정이다 — 회의에서 정하면 여기 한 줄만 바꾼다.
 */

/** 중고 안전결제 — 사는 사람이 더 내는 수수료 */
export const ESCROW_FEE_RATE = 0.035;
/** 레슨비 — 코치가 받는 금액에서 빠지는 수수료 */
export const LESSON_FEE_RATE = 0.1;
/** 장소 이용료 — 장소가 받는 금액에서 빠지는 수수료 */
export const VENUE_FEE_RATE = 0.08;

/** 100원 단위로 올림 */
export function escrowFee(price: number): number {
  return Math.ceil((price * ESCROW_FEE_RATE) / 100) * 100;
}
export function platformFee(amount: number, rate: number): number {
  return Math.floor((amount * rate) / 100) * 100;
}
/** 공급자(코치 · 장소)가 받는 몫 */
export function payout(amount: number, rate: number): number {
  return amount - platformFee(amount, rate);
}

/** 'YYYY-MM' — 정산은 달마다 */
export function monthKeyOf(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  })
    .format(d)
    .slice(0, 7);
}
