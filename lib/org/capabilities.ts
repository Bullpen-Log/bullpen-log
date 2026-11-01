/**
 * 조직 업무 권한(2026-11-01, 싱커 × 덕아웃 팀 · 레슨 통합 1단계 — docs/designs/sinker-dugout-team-lesson-platform-plan.md 4절).
 * 순수 규칙 — 서버 · 화면 · 시험(scripts/org-selftest.mts)이 같이 쓴다. DB 는 없다.
 *
 * 네 층을 가른다: 전역 서비스 역할(lib/permissions.ts, ADMIN · MANAGER · USER) → **조직 소속 · 업무 권한(이 파일)** → 보호자 관계(후속) → 기록 공유 동의(rules.ts memberScope).
 * 지금은 조직 역할(OrgRole: MASTER 소유자 · STAFF 코치 · PLAYER)마다 기본 묶음만 있고, 개별 위임(총무에게 일정 · 공지만)은 grants 로 덧붙인다.
 * grants 는 아직 저장할 표가 없다(마이그레이션 M-A 제안 — 같은 문서 11절). 그 전까지는 빈 배열이라 기본 묶음과 같다.
 *
 * 원칙: 업무 권한은 기록을 열지 않는다 — 훈련 · 영상 · 몸 상태는 여기 더해 선수의 공유 동의(memberScope)가 켜져야 보인다. 조직 소유자도 동의를 우회하지 않는다.
 */

export type OrgRole = 'MASTER' | 'STAFF' | 'PLAYER';

/** 업무 권한 — 이름은 제안 명칭(브리프 4절)을 그대로 */
export const ORG_CAPABILITIES = [
  /** 조직 자체의 설정(이름 · 지역 · 코치 프로필 공개) — 소유자만 */
  'org.manage',
  'roster.read',
  'roster.manage',
  'schedule.read',
  'schedule.manage',
  'training.assign',
  'training.read',
  'training.recordForAthlete',
  'lesson.manage',
  'booking.manage',
  'notice.publish',
  'chat.moderate',
  'finance.manage',
  'permission.manage',
  'export.data',
] as const;
export type OrgCapability = (typeof ORG_CAPABILITIES)[number];

/** 범위 — 어느 선수까지(self 본인 · linked_children 연결된 자녀 · assigned_players 배정 선수 · explicit_group 묶음 · organization 조직 전체) */
export const ORG_SCOPES = ['self', 'linked_children', 'assigned_players', 'explicit_group', 'organization'] as const;
export type OrgScope = (typeof ORG_SCOPES)[number];

/** 기록을 여는 권한 — 이것은 공유 동의와 교집합으로만 쓴다(업무 위임으로는 안 열림) */
export const RECORD_CAPABILITIES: ReadonlySet<OrgCapability> = new Set(['training.read', 'training.recordForAthlete', 'export.data']);

/** 역할마다 기본 묶음 — 소유자는 전부, 코치는 운영 · 훈련 · 명단(선수 초대는 지금도 코치가 한다 — 코치 초대만 소유자, app-org.ts canInviteCoach), 선수는 보기만(자기 범위) */
const PRESET: Record<OrgRole, readonly OrgCapability[]> = {
  MASTER: ORG_CAPABILITIES,
  STAFF: ['roster.read', 'roster.manage', 'schedule.read', 'schedule.manage', 'training.assign', 'training.read', 'training.recordForAthlete', 'lesson.manage', 'booking.manage', 'notice.publish', 'chat.moderate'],
  PLAYER: ['schedule.read'],
};

/** 역할마다 기본 범위 — 코치는 배정 선수(지금 구현은 조직 전체 선수가 배정과 같다 — 배정 표가 생기면 좁힌다), 선수는 본인 */
const PRESET_SCOPE: Record<OrgRole, OrgScope> = { MASTER: 'organization', STAFF: 'organization', PLAYER: 'self' };

/** 개별 위임 한 줄 — 총무에게 schedule.manage · notice.publish 만, 학부모 코치에게 training.read 를 explicit_group 으로 */
export type OrgGrant = { capability: OrgCapability; scope: OrgScope };

export type OrgSubject = {
  role: OrgRole;
  status?: 'ACTIVE' | 'LEFT' | string;
  grants?: readonly OrgGrant[];
};

/** 이 회원이 이 업무를 할 수 있나 — 떠난 회원은 아무것도 못 한다. 기본 묶음 또는 위임 */
export function hasCapability(subject: OrgSubject | null | undefined, cap: OrgCapability): boolean {
  if (!subject || (subject.status && subject.status !== 'ACTIVE')) return false;
  if (PRESET[subject.role]?.includes(cap)) return true;
  return (subject.grants ?? []).some((g) => g.capability === cap);
}

/** 이 업무의 범위 — 위임이 있으면 그 범위, 아니면 역할 기본. 못 하면 null */
export function capabilityScope(subject: OrgSubject | null | undefined, cap: OrgCapability): OrgScope | null {
  if (!hasCapability(subject, cap)) return null;
  const g = (subject!.grants ?? []).find((x) => x.capability === cap);
  if (g) return g.scope;
  return PRESET_SCOPE[subject!.role];
}

/**
 * 위임할 수 있나 — permission.manage 가 있는 사람만, 제 범위 밖(조직 전체가 아닌데 organization 범위)으로는 못 주고, permission.manage 자체는 소유자만 준다.
 * 전역 서비스 역할(ADMIN · MANAGER)은 여기서 못 만든다 — 조직 권한은 조직 안의 일이다.
 */
export function canGrant(by: OrgSubject | null | undefined, grant: OrgGrant): boolean {
  if (!hasCapability(by, 'permission.manage')) return false;
  if (grant.capability === 'permission.manage' && by!.role !== 'MASTER') return false;
  const mine = capabilityScope(by, 'permission.manage');
  if (mine !== 'organization' && grant.scope === 'organization') return false;
  return true;
}

/** 역할 이름(화면) */
export const ORG_ROLE_LABEL: Record<OrgRole, string> = { MASTER: '감독 · 소유자', STAFF: '코치', PLAYER: '선수' };
export const ORG_CAPABILITY_LABEL: Record<OrgCapability, string> = {
  'org.manage': '조직 설정',
  'roster.read': '명단 보기',
  'roster.manage': '명단 관리',
  'schedule.read': '일정 보기',
  'schedule.manage': '일정 관리',
  'training.assign': '훈련 배정',
  'training.read': '훈련 기록 보기',
  'training.recordForAthlete': '선수 대신 기록',
  'lesson.manage': '레슨 운영',
  'booking.manage': '예약 관리',
  'notice.publish': '공지 올리기',
  'chat.moderate': '대화방 관리',
  'finance.manage': '회계',
  'permission.manage': '권한 관리',
  'export.data': '자료 내보내기',
};
