/**
 * 관리자 역할 · 권한 표(2026-10-20 금윤호) — 대표관리자(ADMIN)는 모든 관리자 기능, 준관리자(MANAGER)는 아래 표가 연 것만.
 * 화면(메뉴 · 단추)과 서버 동작이 같은 표를 본다 — 화면만 숨기면 주소를 쳐서 들어온다. 순수 정의라 앱(native)도 같이 쓴다.
 *
 * 준관리자에게 기능을 더 열려면 MANAGER_PERMISSIONS 에 한 줄. 나머지 관리자 검사(회원 · 패치노트 · 공지 · 문의 · 커뮤니티 · 운동/드릴 고치기 ·
 * 카메라 진단 · 관리자 도구)는 예전처럼 `role === 'ADMIN'` 그대로라 대표관리자만 쓴다.
 */
export type Role = 'USER' | 'ADMIN' | 'MANAGER';

export type Permission =
  /** 관리자 첫 화면(/admin) — 준관리자는 연 기능 칸만 보인다(회원 목록은 대표만) */
  | 'adminHome'
  /** 영상 촬영 관리(/admin/shoot · 촬영 모드 · 찍은 영상 올리기) */
  | 'shoot'
  /** 구속 측정 관리자(/admin/velocity — 공 · 영상 · 스피드건 · 보정 재측정) */
  | 'velocityAdmin'
  /** 세션 · 엔진 녹화(측정 중 녹화 켜기 · 녹화 편집기 · 공 라벨) */
  | 'recording'
  /** ABS 판정 모드 */
  | 'abs';

const MANAGER_PERMISSIONS: readonly Permission[] = ['adminHome', 'shoot', 'velocityAdmin', 'recording', 'abs'];

export const ROLE_LABEL: Record<Role, string> = { USER: '일반', MANAGER: '준관리자', ADMIN: '대표관리자' };

/** 대표관리자인가 — 모든 관리자 기능 · 역할 바꾸기 */
export const isOwner = (role: string | null | undefined) => role === 'ADMIN';

/** 관리자(대표 · 준)인가 */
export const isStaff = (role: string | null | undefined) => role === 'ADMIN' || role === 'MANAGER';

/** 이 역할이 이 기능을 쓸 수 있나 */
export function can(role: string | null | undefined, perm: Permission): boolean {
  if (role === 'ADMIN') return true;
  if (role === 'MANAGER') return MANAGER_PERMISSIONS.includes(perm);
  return false;
}

/** 역할 이름 → 알려진 역할(모르면 USER) */
export const parseRole = (v: unknown): Role => (v === 'ADMIN' || v === 'MANAGER' ? v : 'USER');
