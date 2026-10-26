/**
 * 싱커 앱 안의 덕아웃(2026-10-24 김민: "싱커와 연관 있는 기능만 · 싱커 안에 덕아웃 앱이 있는 느낌 말고 자연스럽게 공존") —
 * 커뮤니티 · 레슨 · 연습장 · 채팅(+ 그 흐름에 딸린 예약 · 프로필 · 알림)만 연다. 장터 · 장비 추천 · 경기 일정 · 뉴스 · 통합검색 · 결제 내역은
 * 싱커 앱에서만 뺀다 — 웹 · 덕아웃 앱은 그대로. 막는 곳은 덕아웃 틀(components/dugout/dugout-shell.tsx) 한 곳.
 */
/*
 * '/me/community'(내 글 · 댓글 · 저장 · 참가 · 신청, 2026-10-27)는 커뮤니티 흐름이라 연다 — 커뮤니티 목록 · 마이의 '내 활동'이 가리키는데 막혀
 * '이 화면은 덕아웃에서 볼 수 있어요'가 떴다. /me 아래를 통째로 열지는 않는다(/me/payments 는 장터 결제라 뺀 그대로).
 */
const PREFIX = ['/community', '/lessons', '/venues', '/chat', '/notifications', '/u', '/pay/lesson', '/pay/venue', '/link', '/me/community'];
/** '/' 는 탭 첫 화면(?dugout=1, 장터 · 경기를 뺀 덕아웃 홈). '/me' 는 레슨 · 연습장 예약만 보인다(/me/payments 는 뺌) */
const EXACT = ['/', '/me'];

export function inSinkerDugout(path: string): boolean {
  return EXACT.includes(path) || PREFIX.some((r) => path === r || path.startsWith(`${r}/`));
}

