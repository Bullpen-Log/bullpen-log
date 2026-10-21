/**
 * 알림을 어느 앱으로 보낼지(2026-10-21 개편 5단계, docs/designs/sinker-dugout.md 8절 D) — 순수 규칙.
 * 사람 · 거래(채팅 · 장터 · 예약 · 댓글)는 덕아웃 앱, 기록 · 트레이닝 · 팀 과제 · 레슨 노트는 싱커. 덕아웃 앱이 없는 사람은 싱커가 대신 받는다(선수는 싱커 하나면 된다 — 결정 1).
 */
export type NotifyKind =
  'chat' | 'listing' | 'booking' | 'venue' | 'community' | 'lesson' | 'team' | 'record';
export type AppName = 'sinker' | 'dugout';

export const KIND_LABEL: Record<NotifyKind, string> = {
  chat: '채팅',
  listing: '장터',
  booking: '레슨 예약',
  venue: '연습장 예약',
  community: '커뮤니티',
  lesson: '레슨 기록',
  team: '팀',
  record: '기록',
};

const DUGOUT_FIRST: ReadonlySet<NotifyKind> = new Set([
  'chat',
  'listing',
  'booking',
  'venue',
  'community',
]);

/** 이 사람이 가진 앱 중 어느 앱에 보낼지 — 하나만 고른다(두 앱에 같은 알림이 두 번 울리지 않게) */
export function appsFor(
  kind: NotifyKind,
  has: ReadonlySet<AppName> | AppName[]
): AppName[] {
  const set = has instanceof Set ? has : new Set(has);
  if (set.size === 0) return [];
  const first: AppName = DUGOUT_FIRST.has(kind) ? 'dugout' : 'sinker';
  const second: AppName = first === 'dugout' ? 'sinker' : 'dugout';
  return set.has(first) ? [first] : set.has(second) ? [second] : [];
}

/** Expo 푸시 토큰 모양 — ExponentPushToken[xxx] · ExpoPushToken[xxx] */
export function isExpoToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[\w-]+\]$/.test(token);
}

export const NOTIFY_PAGE_SIZE = 50;
