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

/** 역할의 기본 묶음(읽기용) — 참여 화면이 '코치 업무'를 적을 때 */
export const roleCapabilities = (role: OrgRole): readonly OrgCapability[] => PRESET[role];

/** 역할마다 기본 범위 — 코치는 배정 선수(지금 구현은 조직 전체 선수가 배정과 같다 — 배정 표가 생기면 좁힌다), 선수는 본인 */
const PRESET_SCOPE: Record<OrgRole, OrgScope> = { MASTER: 'organization', STAFF: 'organization', PLAYER: 'self' };

/**
 * 개별 위임 한 줄 — 총무에게 schedule.manage · notice.publish 만, 학부모 코치에게 training.read 를 explicit_group 으로.
 * targets: 범위가 사람 · 묶음을 가리키면(linked_children · assigned_players · explicit_group) 그 회원 id 들 — 범위 이름만으로는 대상을 모른다(교정 F04).
 * deny: 역할 기본 묶음에서 빼는 줄(코치인데 training.recordForAthlete 는 못 하게) — 더하기만으로는 줄이기를 못 적는다.
 */
export type OrgGrant = { capability: OrgCapability; scope: OrgScope; targets?: readonly string[]; deny?: true };

/** 위임할 수 있는 업무 — 조직 설정 · 권한 관리 · 회계 · 내보내기는 소유자 몫이라 위임 밖(소유권 이전은 별도 업무) */
export const DELEGABLE: ReadonlySet<OrgCapability> = new Set(
  ORG_CAPABILITIES.filter((c) => !['org.manage', 'permission.manage', 'finance.manage', 'export.data'].includes(c))
);

export type OrgSubject = {
  role: OrgRole;
  status?: 'ACTIVE' | 'LEFT' | string;
  grants?: readonly OrgGrant[];
};

/** 이 회원이 이 업무를 할 수 있나 — 떠난 회원 · 모르는 역할은 아무것도 못 한다. deny 줄이 있으면 기본 묶음에서도 뺀다. 기본 묶음 또는 위임 */
export function hasCapability(subject: OrgSubject | null | undefined, cap: OrgCapability): boolean {
  if (!subject || (subject.status && subject.status !== 'ACTIVE')) return false;
  if (!(subject.role in PRESET)) return false;
  const grants = subject.grants ?? [];
  if (grants.some((g) => g.capability === cap && g.deny)) return false;
  if (PRESET[subject.role].includes(cap)) return true;
  return grants.some((g) => g.capability === cap && !g.deny);
}

/** 이 업무의 범위 — 위임(allow)이 있으면 그 범위 · 대상, 아니면 역할 기본. 못 하면 null */
export function capabilityScope(subject: OrgSubject | null | undefined, cap: OrgCapability): OrgScope | null {
  return capabilityTarget(subject, cap)?.scope ?? null;
}
export function capabilityTarget(subject: OrgSubject | null | undefined, cap: OrgCapability): { scope: OrgScope; targets?: readonly string[] } | null {
  if (!hasCapability(subject, cap)) return null;
  const g = (subject!.grants ?? []).find((x) => x.capability === cap && !x.deny);
  if (g) return { scope: g.scope, targets: g.targets };
  return { scope: PRESET_SCOPE[subject!.role] };
}

/**
 * a 가 b 를 품나 — organization 은 전부. 그 밖은 같은 범위이면서 대상 집합이 부분집합일 때만(self · linked_children · assigned_players · explicit_group 은
 * 크기 순서가 아니다 — 자녀 범위가 배정 선수 범위를 품지 않는다). 사람을 가리키는 범위에 대상이 비어 있으면 품지 않는다(교정 F04).
 */
export function scopeCovers(a: { scope: OrgScope; targets?: readonly string[] }, b: { scope: OrgScope; targets?: readonly string[] }): boolean {
  if (a.scope === 'organization') return true;
  if (a.scope !== b.scope) return false;
  if (a.scope === 'self') return true;
  const mine = new Set(a.targets ?? []);
  const theirs = b.targets ?? [];
  return theirs.length > 0 && theirs.every((t) => mine.has(t));
}

/**
 * 위임할 수 있나(교정 F04) — 지금은 **소유자(MASTER 역할, 활동 중)만**. 위임하는 업무는 DELEGABLE 안이고 위임자 자신도 그 업무를 할 수 있어야 하며,
 * 대상은 위임자의 대상 안(scopeCovers). permission.manage 는 못 넘긴다(위임의 위임 없음). 전역 서비스 역할(ADMIN · MANAGER)은 여기서 못 만든다.
 * 저장 표(M-A)가 생기면 감사(누가 · 누구에게 · 무엇 · 대상 · 언제) · 마지막 소유자 보호는 그 동작이 맡는다 — 이 함수는 규칙만.
 */
export function canGrant(by: OrgSubject | null | undefined, grant: OrgGrant): boolean {
  if (!by || by.role !== 'MASTER' || (by.status && by.status !== 'ACTIVE')) return false;
  if (!hasCapability(by, 'permission.manage')) return false;
  if (!DELEGABLE.has(grant.capability)) return false;
  if (!hasCapability(by, grant.capability)) return false;
  const mine = capabilityTarget(by, grant.capability);
  if (!mine) return false;
  if (grant.scope !== 'organization' && grant.scope !== 'self' && !(grant.targets?.length)) return false;
  return scopeCovers(mine, grant);
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
