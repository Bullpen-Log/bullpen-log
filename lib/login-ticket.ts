/**
 * 코드 · QR 로그인의 순수 규칙(2026-10-21 개편 7단계 7-3, docs/designs/sinker-dugout.md 8절 E).
 * PC 가 코드를 띄우고, 로그인된 폰(싱커 앱 · 웹)이 /link/<code> 에서 승인하면 PC 가 세션을 받는다. 2분 · 한 번 · 헷갈리는 글자(0 O 1 I) 없음.
 */
export const TICKET_TTL_MS = 2 * 60 * 1000;
export const TICKET_LEN = 8;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeTicketCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < TICKET_LEN; i++) out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return out;
}

export function isTicketCode(raw: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${TICKET_LEN}}$`).test(raw);
}

/** 사람이 읽기 좋게 — ABCD-EFGH */
export function formatTicketCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** 폼 · 주소에서 온 것 — 대문자로, 하이픈 · 공백은 뺀다 */
export function normalizeTicketCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type TicketState = 'waiting' | 'approved' | 'expired' | 'used';

export function ticketStateOf(t: { userId: string | null; expiresAt: Date; claimedAt: Date | null }, now: Date): TicketState {
  if (t.claimedAt) return 'used';
  if (t.expiresAt.getTime() <= now.getTime()) return 'expired';
  return t.userId ? 'approved' : 'waiting';
}

/** 폰이 열 주소 — 싱커 앱 웹뷰 · 휴대폰 브라우저 둘 다 되는 사이트 주소. 앱 전용 주소(sinker://)는 도메인 · 앱이 받을 때(김민) */
export function linkPathOf(code: string): string {
  return `/link/${code}`;
}
