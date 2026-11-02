import { CONSENT_MIN_AGE, ageOn } from '@/lib/analysis-consent';

/**
 * 만 14세 미만의 보호자 동의(docs/designs/ai-coach.md U19~U22, 개인정보 보호법 제22조의2) — 보호자 이메일 동의 링크 뒤에만 쓴다.
 * 동의 전에는 대기 화면만, 7일 안에 동의가 없으면 계정을 지운다. 이미 동의 없이 가입한 14세 미만도 같은 규칙 — 7일은 보호자 동의 줄을
 * 처음 만든 때(가입 · 다음 로그인)부터 센다(U22 — 가입일부터 세면 옛 계정이 곧바로 지워진다).
 */
export const GUARDIAN_WAIT_DAYS = 7;

/** 'none' 만 14세 이상 · 생년월일 모름 · 'needed' 아직 보호자 주소 없음 · 'pending' 보냄 · 'verified' 동의 · 'expired' 7일 지남 */
export type GuardianState = 'none' | 'needed' | 'pending' | 'verified' | 'expired';

export type GuardianRow = { expiresAt: Date; agreedAt: Date | null; revokedAt: Date | null } | null;

export function guardianStateOf(birthDate: Date | null | undefined, row: GuardianRow, now: Date): GuardianState {
  const age = ageOn(birthDate, now);
  if (age == null || age >= CONSENT_MIN_AGE) return 'none';
  if (!row) return 'needed';
  if (row.agreedAt && !row.revokedAt) return 'verified';
  return now > row.expiresAt ? 'expired' : 'pending';
}

/** 보호자 줄을 처음 만들 때의 끝(지금 + 7일) */
export const guardianExpiry = (now: Date) => new Date(now.getTime() + GUARDIAN_WAIT_DAYS * 86_400_000);
