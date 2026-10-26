/**
 * 팀 3단계(2026-10-26, docs/designs/sinker-team-lesson-contract.md 4절) — 참석 · 훈련 메뉴 · 수행일지 · 등판 계획 · 공지 읽음의 순수 규칙.
 * 저장은 app/actions/app-team.ts, 코치 운동을 선수 하루 운동 판에 넣는 일은 lib/org/team-work-store.ts.
 *
 * - 참석은 부하 · 수강권과 무관하다(응답 · 확인만).
 * - 훈련 메뉴는 계획일 뿐 부하에 안 든다 — 끝나고 코치가 선수별로 '메뉴대로 했어요' · 고친 기록을 남길 때만 그 선수의 운동 판에 세트로 붙는다.
 * - 등판 계획은 '확정'만 선수의 다음 등판 재료가 된다(엔진은 달력 일정처럼 한 출처로 — 체크인 답이 먼저라 덮지 않는다).
 */
import type { HomeworkItem } from '@/lib/org/homework';
import type { OrgSet, OrgWorkItem } from '@/lib/org/team-work';

export const ATTEND_REPLIES = ['yes', 'no', 'maybe'] as const;
export type AttendReply = (typeof ATTEND_REPLIES)[number];
export const ATTEND_LABEL: Record<AttendReply, string> = { yes: '가요', no: '못 가요', maybe: '아직 몰라요' };
export const isAttendReply = (v: unknown): v is AttendReply => ATTEND_REPLIES.includes(v as AttendReply);
export const ATTEND_NOTE_MAX = 80;

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

/** 메뉴의 대상 — 명단이 비면 그 일정의 모두, 있으면 그 가운데 아직 일정 대상인 사람만 */
export function planMemberIds(memberIds: readonly string[], eventMembers: readonly string[]): string[] {
  return memberIds.length ? eventMembers.filter((id) => memberIds.includes(id)) : [...eventMembers];
}

/** 메뉴 대상 명단 거르기 — 그 일정 대상인 사람만, 모두 고르면 빈 명단(=모두) */
export function cleanPlanMembers(raw: unknown, eventMembers: readonly string[]): string[] {
  const ids = Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === 'string' && eventMembers.includes(x)))] : [];
  return ids.length === eventMembers.length ? [] : ids;
}

/**
 * '메뉴대로 했어요' — 그 선수가 대상인 메뉴들의 운동을 처방대로 세트로. 드릴은 세트가 아니라 뺀다(운동 판은 운동 목록만 가리킨다).
 * 세트 수 · 횟수 · 버틴 초는 메뉴에 적은 값, 없으면 라이브러리 기본값, 세트 수도 없으면 1세트. 같은 운동이 두 메뉴에 있으면 한 번만(앞 메뉴).
 */
export function planWork(
  plans: readonly { items: readonly HomeworkItem[] }[],
  defaults: ReadonlyMap<string, { sets: number | null; reps: number | null; holdSeconds: number | null }>
): OrgWorkItem[] {
  const out = new Map<string, OrgSet[]>();
  for (const p of plans)
    for (const it of p.items) {
      if (!it.exerciseId || out.has(it.exerciseId)) continue;
      const d = defaults.get(it.exerciseId);
      if (!d) continue;
      const n = Math.max(1, Math.min(10, it.sets ?? d.sets ?? 1));
      const set: OrgSet = { weightKg: null, reps: it.reps ?? (it.holdSec ? null : d.reps), holdSeconds: it.holdSec ?? (it.reps ? null : d.holdSeconds) };
      out.set(it.exerciseId, Array.from({ length: n }, () => ({ ...set })));
    }
  return [...out].map(([exerciseId, sets]) => ({ exerciseId, sets }));
}

/** 참석 응답 수 — 오늘 · 일정 줄에 '가요 8 · 못 가요 2' */
export function replyCounts(replies: readonly (string | null)[]): Record<AttendReply, number> {
  return {
    yes: replies.filter((r) => r === 'yes').length,
    no: replies.filter((r) => r === 'no').length,
    maybe: replies.filter((r) => r === 'maybe').length,
  };
}

/* ── 다시 쓰기(계약 10-4 ②) — 지난 일정의 메뉴 가져오기 · 한 주 복사. 복사본은 새 계획이다(참석 · 등판 · 수행은 안 옮김) ── */

/** 복사한 메뉴의 대상 — 새 일정의 선수로 좁힌다. 고른 선수가 아무도 안 남으면 null(그 메뉴는 버림 — 빈 명단은 '모두'라서) */
export function copyPlanTargets(memberIds: readonly string[], eventMembers: readonly string[]): string[] | null {
  if (memberIds.length === 0) return [];
  const kept = memberIds.filter((id) => eventMembers.includes(id));
  return kept.length ? kept : null;
}

/** 여러 메뉴의 대상을 합친 알림 명단 — 하나라도 '모두'면 모두([]) */
export function unionPlanMembers(lists: readonly (readonly string[])[]): string[] {
  return lists.some((l) => l.length === 0) ? [] : [...new Set(lists.flat())];
}

/** 한 주 복사의 같은 일정 — 날짜 · 시각 · 제목이 같으면 이미 있는 것(다시 눌러도 한 번) */
export const weekCopyKey = (e: { date: string; time: string | null; title: string }) => `${e.date}|${e.time ?? ''}|${e.title}`;
