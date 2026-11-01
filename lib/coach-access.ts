import { isOwner } from '@/lib/permissions';

/**
 * 코치 탭을 쓸 수 있나(유료 요금제 — docs/designs/ai-coach.md U2 · U10 · U14). 웹 화면 · 서버 동작 · 앱(loadAppMe 의 coachPaid)이 이것 하나만 본다.
 * ponytail: 권한 표(Entitlement, 설계 3단계 C2)가 생기기 전 임시로 대표관리자만 — 표가 생기면 이 함수 하나만 바꾼다.
 */
export const coachPaid = (user: { role: string | null | undefined }) => isOwner(user.role);
