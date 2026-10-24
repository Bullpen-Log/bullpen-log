import type { RoundIconName } from '@/lib/round-icons';

/**
 * 싱커 앱 안의 덕아웃(2026-10-24 김민: "싱커와 연관 있는 기능만 · 싱커 안에 덕아웃 앱이 있는 느낌 말고 자연스럽게 공존") —
 * 커뮤니티 · 레슨 · 연습장 · 채팅(+ 그 흐름에 딸린 예약 · 프로필 · 알림)만 연다. 장터 · 장비 추천 · 경기 일정 · 뉴스 · 통합검색 · 결제 내역은
 * 싱커 앱에서만 뺀다 — 웹 · 덕아웃 앱은 그대로. 막는 곳은 덕아웃 틀(components/dugout/dugout-shell.tsx) 한 곳.
 */
const PREFIX = ['/community', '/lessons', '/venues', '/chat', '/notifications', '/u', '/pay/lesson', '/pay/venue', '/link'];
/** '/' 는 탭 첫 화면(?dugout=1) — 페이지가 /community 로 보낸다. '/me' 는 레슨 · 연습장 예약만 보인다(/me/payments 는 뺌) */
const EXACT = ['/', '/me'];

export function inSinkerDugout(path: string): boolean {
  return EXACT.includes(path) || PREFIX.some((r) => path === r || path.startsWith(`${r}/`));
}

/** 커뮤니티 머리의 바로가기 줄 */
export const SINKER_DUGOUT_SHORTCUTS: { href: string; label: string; icon: RoundIconName }[] = [
  { href: '/lessons', label: '레슨', icon: 'lesson' },
  { href: '/venues', label: '연습장', icon: 'venue' },
  { href: '/chat', label: '채팅', icon: 'chat' },
  { href: '/me#bookings', label: '내 예약', icon: 'user' },
];
