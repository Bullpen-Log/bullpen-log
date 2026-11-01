import 'server-only';
import { coachOrgCan } from '@/lib/org/app-access';
import { capabilityTarget, hasCapability, type OrgCapability, type OrgGrant, type OrgRole } from '@/lib/org/capabilities';
import { lensOf, type ScopeLens } from '@/lib/org/dto-scope';

/**
 * 조직 조회의 권한 문맥(2026-11-01 교정 F05) — 한 번 판정해 조회 · DTO 만들기가 같이 쓴다.
 * 누가(user) · 어느 조직(org) · 어떤 역할(role) · 위임(grants — 아직 저장 표가 없어 빈 배열) → `can(업무)` · `lens`(가릴 종류 · 허용 대상 회원).
 * 조직 입구 권한(base)이 없으면 null — 부르는 쪽이 NO_ACCESS. 기록을 여는 업무는 lens 에 더해 선수의 공유 동의(memberScope)를 조회가 그대로 본다.
 */
export type OrgAuthz = NonNullable<Awaited<ReturnType<typeof coachOrgCan>>> & {
  grants: readonly OrgGrant[];
  can: (cap: OrgCapability) => boolean;
  lens: ScopeLens;
};

export async function orgAuthz(orgId: string, base: OrgCapability): Promise<OrgAuthz | null> {
  const c = await coachOrgCan(orgId, base);
  if (!c) return null;
  /* 위임 줄은 M-A(저장 표) 뒤에 여기서 읽는다 — 지금은 역할 기본 묶음만 */
  const grants: readonly OrgGrant[] = [];
  const subject = { role: c.role as OrgRole, grants };
  const can = (cap: OrgCapability) => hasCapability(subject, cap);
  /* self 범위는 보는 사람의 실제 회원 줄로(G05) */
  return { ...c, grants, can, lens: lensOf((cap) => capabilityTarget(subject, cap), c.memberId) };
}
