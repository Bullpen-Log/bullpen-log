/**
 * 덕아웃 공개 프로필(/u/<닉네임>)에 보일 싱커 항목(2026-10-21 개편 3단계 3-6) — 기본은 전부 숨김, 내 것에서 항목별로 켠다. 순수.
 */
export const PUBLIC_SINKER_OPTIONS = [
  { key: 'position', label: '포지션 · 던지는 손' },
  { key: 'velocity', label: '최고 구속' },
  { key: 'days', label: '기록한 투구 횟수' },
] as const;

export type PublicSinkerKey = (typeof PUBLIC_SINKER_OPTIONS)[number]['key'];

export function readPublicKeys(raw: string[]): PublicSinkerKey[] {
  const ok = new Set<string>(PUBLIC_SINKER_OPTIONS.map((o) => o.key));
  return [...new Set(raw.filter((k): k is PublicSinkerKey => ok.has(k)))];
}

/** 닉네임 주소 — 공백 · 슬래시는 못 쓴다(닉네임 규칙은 lib/signup-check.ts 가 이미 막는다) */
export function profileHref(nickname: string): string {
  return `/u/${encodeURIComponent(nickname)}`;
}

export const ACCOUNT_LABEL: Record<string, string> = {
  PLAYER: '선수',
  MEMBER: '덕아웃 회원',
  MASTER: '팀 · 레슨장',
};
