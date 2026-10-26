/**
 * 코치 '오늘'의 살필 선수(2026-10-26 계약 9-6 ①-1) — 순수 규칙만(앱도 같이 읽어 엔진 파일을 안 끌고 오게 import 없음).
 * 판정(주의 · 위험 · 정보 부족)은 서버가 lib/org/arm-view.ts coachArmStatusOf 로 셈하고, 여기서는 묶음만 가른다.
 */
/* ── 코치 '오늘'의 살필 선수(2026-10-26 계약 9-6 ①-1) — 정보 부족을 '주의 · 위험 없음'으로 덮지 않는다 ── */

/** 주의 · 위험(읽은 기록으로 뜬 신호) · 정보 부족(못 읽은 것이 있어 안전이라 못 함) · 투구 비공개 · 공유 동의 대기 · 앱 연결 대기 */
export const WATCH_KINDS = ['attention', 'insufficient', 'hidden', 'pending', 'unlinked'] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];
export const WATCH_LABEL: Record<WatchKind, string> = {
  attention: '주의 · 위험',
  insufficient: '정보 부족',
  hidden: '투구 기록 비공개',
  pending: '공유 동의 대기',
  unlinked: '앱 연결 대기',
};
export const WATCH_LINE: Record<Exclude<WatchKind, 'attention' | 'insufficient'>, string> = {
  hidden: '투구 기록을 보여 주지 않아 팔 상태를 몰라요',
  pending: '보여 줄 기록을 아직 안 골랐어요',
  unlinked: '싱커 앱에 아직 연결하지 않았어요 — 카드에서 초대 코드를 보내요',
};

/** 선수 하나의 살필 묶음 — 살필 것이 없으면(공유 · 기록이 있고 안전) null. status 는 투구를 공유한 선수만 있다 */
export function watchKindOf(m: { hasUser: boolean; consent: { pitch: boolean } | null }, status: { level: string; missing: readonly unknown[] } | null): WatchKind | null {
  if (!m.hasUser) return 'unlinked';
  if (!m.consent) return 'pending';
  if (!m.consent.pitch || !status) return 'hidden';
  if (status.level !== 'safe') return 'attention';
  if (status.missing.length) return 'insufficient';
  return null;
}
