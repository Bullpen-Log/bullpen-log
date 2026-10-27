/**
 * 팀 3단계(2026-10-26, docs/designs/sinker-team-lesson-contract.md 4절) — 일정 대상 · 등판 계획 · 다시 쓰기의 순수 규칙.
 * 훈련 활동 · 실제 확인 · 선수 한 명의 실제는 lib/org/team-session.ts(11절). 저장은 app/actions/app-team.ts.
 *
 * - 참석 응답 · 참석 확인은 2026-10-27 걷었다 — 안 온 선수는 실제 확인의 '빠짐' 예외로.
 * - 등판 계획은 '확정'만 선수의 다음 등판 재료가 된다(엔진은 달력 일정처럼 한 출처로 — 체크인 답이 먼저라 덮지 않는다).
 */

export const OUTING_ROLES = ['starter', 'relief', 'standby'] as const;
export type OutingRole = (typeof OUTING_ROLES)[number];
export const OUTING_ROLE_LABEL: Record<OutingRole, string> = { starter: '선발', relief: '불펜', standby: '대기' };
export const isOutingRole = (v: unknown): v is OutingRole => OUTING_ROLES.includes(v as OutingRole);
export const OUTING_STATUS_LABEL = { draft: '짜는 중', confirmed: '확정', canceled: '취소' } as const;
/** 다음 등판 재료가 되는 역할 — 대기는 던질지 몰라 안 넣는다 */
export const PITCHING_ROLES: readonly OutingRole[] = ['starter', 'relief'];
export const PITCH_LIMIT_MAX = 200;
/** 엔진이 달력 일정처럼 읽는 이름 — '등판' 이 들어가야 등판으로 읽힌다(lib/calendar-event.ts isOutingTitle) */
export const OUTING_CALENDAR_TITLE = '팀 등판(확정)';

export const PLAN_TITLE_MAX = 30;

/** 일정의 대상 회원 — 팀 일정(memberId 없음)은 활동 중인 선수 모두, 회원 일정(레슨)은 그 회원 */
export function eventMemberIds(event: { memberId: string | null }, active: readonly string[]): string[] {
  return event.memberId ? active.filter((id) => id === event.memberId) : [...active];
}

/** 메뉴의 대상 — 명단이 비면 그 일정의 모두, 있으면 그 가운데 아직 일정 대상인 사람만(알림 받는 사람) */
export function planMemberIds(memberIds: readonly string[], eventMembers: readonly string[]): string[] {
  return memberIds.length ? eventMembers.filter((id) => memberIds.includes(id)) : [...eventMembers];
}

/* ── 다시 쓰기(계약 10-4 ②) — 지난 일정의 활동 가져오기 · 한 주 복사. 복사본은 새 계획이다(실제 · 예외 · 등판 · 결과는 안 옮김) ── */

/** 복사한 메뉴의 대상 — 새 일정의 선수로 좁힌다. 고른 선수가 아무도 안 남으면 null(그 메뉴는 버림 — 빈 명단은 '모두'라서) */
export function copyPlanTargets(memberIds: readonly string[], eventMembers: readonly string[]): string[] | null {
  if (memberIds.length === 0) return [];
  const kept = memberIds.filter((id) => eventMembers.includes(id));
  return kept.length ? kept : null;
}

/** 한 주 복사의 같은 일정 — 날짜 · 시각 · 제목이 같으면 이미 있는 것(다시 눌러도 한 번) */
export const weekCopyKey = (e: { date: string; time: string | null; title: string }) => `${e.date}|${e.time ?? ''}|${e.title}`;
