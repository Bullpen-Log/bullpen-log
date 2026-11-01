import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isMasterUser, requireMaster, requireUser } from '@/lib/dal';
import type { OrgKind } from '@/lib/org/rules';
import { hasCapability, type OrgCapability, type OrgRole } from '@/lib/org/capabilities';
export { memberScope } from '@/lib/org/rules';

/**
 * 팀 · 레슨장 마스터 화면(app/(master))의 접근 — 누가 어느 조직을 보나.
 *
 * 관리자(role ADMIN)는 모든 조직을 본다. 마스터 계정은 제가 만든 조직과 스태프로 초대받은 조직만. 선수 계정은 여기 오기 전에
 * requireMaster(lib/dal.ts)가 /today 로 돌려보낸다 — 이 파일의 함수는 모두 그 뒤에 불린다.
 *
 * 지금 보는 조직은 쿠키 bp-org 에 둔다(app/actions/org.ts chooseOrg). 쿠키의 조직을 볼 권한이 없으면(스태프에서 빠짐 · 관리자가 아닌 계정이
 * 남의 조직 id 를 넣음) 첫 조직으로 돌아간다.
 */

export const ORG_COOKIE = 'bp-org';

export type MasterUser = Awaited<ReturnType<typeof requireMaster>>;

/** 조직 운영자인가 — 관리자 · 마스터 계정, 또는 어느 조직의 소유자 · 활동 중인 소유자/스태프 회원 */
const OPERATOR_WHERE = (userId: string): Prisma.OrgWhereInput => ({ OR: [{ ownerId: userId }, { members: { some: { userId, role: { in: ['MASTER', 'STAFF'] }, status: 'ACTIVE' } } }] });

/**
 * 조직 운영자 관문(2026-11-01 교정 F03) — 팀 · 레슨장 관리 화면(app/(master)) · 관리 동작의 입구. 지나는 사람: 관리자 · 마스터 계정(예전 requireMaster) +
 * **일반 계정이라도 어느 조직의 소유자 · 활동 중인 소유자/스태프 회원**. 어느 조직을 다룰지는 그 뒤 requireOrg · requireOrgCan(업무 권한)이 다시 본다.
 * 조직 관계가 하나도 없는 선수 · 학부모는 예전처럼 /today 로. 개인 운동(내 싱커) 사용 여부는 여기서 안 바뀐다(계정 종류 그대로).
 */
export async function requireOperator(): Promise<MasterUser> {
  const user = await requireUser();
  if (isMasterUser(user)) return user;
  if ((await prisma.org.count({ where: OPERATOR_WHERE(user.id) })) === 0) redirect('/today');
  return user;
}

/** 이 사람이 조직 운영자인가(관리 입구를 보일지 — 위 막대 '관리') */
export async function isOperator(user: { id: string; role: string; accountType: string }): Promise<boolean> {
  if (user.role === 'ADMIN' || user.accountType === 'MASTER') return true;
  return (await prisma.org.count({ where: OPERATOR_WHERE(user.id) })) > 0;
}

export type OrgRow = {
  id: string;
  kind: OrgKind;
  name: string;
  region: string | null;
  note: string | null;
  ownerId: string;
  createdAt: Date;
};

const ORG_SELECT = {
  id: true,
  kind: true,
  name: true,
  region: true,
  note: true,
  ownerId: true,
  createdAt: true,
} as const;

/** 이 사람이 볼 수 있는 조직 — 관리자는 전부, 마스터는 제 것 · 스태프로 든 것 */
export async function orgsFor(user: MasterUser): Promise<OrgRow[]> {
  if (user.role === 'ADMIN') {
    return prisma.org.findMany({ select: ORG_SELECT, orderBy: { createdAt: 'desc' } });
  }
  return prisma.org.findMany({
    where: {
      OR: [
        { ownerId: user.id },
        {
          members: {
            some: {
              userId: user.id,
              role: { in: ['MASTER', 'STAFF'] },
              status: 'ACTIVE',
            },
          },
        },
      ],
    },
    select: ORG_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

/** 이 조직을 볼 권한이 있나 — 없으면 없는 화면(notFound) */
export async function requireOrg(user: MasterUser, orgId: string): Promise<OrgRow> {
  const list = await orgsFor(user);
  const org = list.find((o) => o.id === orgId);
  if (!org) notFound();
  return org;
}

/**
 * 이 조직에서 이 업무를 할 권한이 있나(2026-11-01 팀 · 레슨 통합 2단계) — requireOrg + 조직 역할의 업무 권한(lib/org/capabilities.ts). 없으면 notFound.
 * 역할: 관리자 · 소유자 = MASTER, 그 밖은 회원 줄의 role(STAFF). 앱 동작은 같은 판정의 lib/org/app-access.ts coachOrgCan.
 * 기록을 여는 업무(training.read 등)는 이것에 더해 선수의 공유 동의(memberScope)를 동작이 그대로 본다.
 */
export async function requireOrgCan(user: MasterUser, orgId: string, cap: OrgCapability): Promise<OrgRow & { role: OrgRole }> {
  const org = await requireOrg(user, orgId);
  const role = await orgRoleOf(user, org);
  if (!role || !hasCapability({ role }, cap)) notFound();
  return { ...org, role };
}

/** 조직 안 역할 — 회원 줄이 없거나 선수면 null(교정 F05: 없는 소속을 STAFF 로 짐작하지 않는다) */
async function orgRoleOf(user: { id: string; role: string }, org: { id: string; ownerId: string }): Promise<OrgRole | null> {
  if (user.role === 'ADMIN' || org.ownerId === user.id) return 'MASTER';
  const m = await prisma.orgMember.findFirst({ where: { orgId: org.id, userId: user.id, status: 'ACTIVE', role: { in: ['MASTER', 'STAFF'] } }, select: { role: true } });
  return m ? (m.role as OrgRole) : null;
}

/** 지금 보는 조직 — 쿠키의 것, 권한이 없으면 첫 조직, 하나도 없으면 null(관리자가 조직이 없을 때) */
export async function currentOrg(
  user: MasterUser
): Promise<{ org: OrgRow | null; orgs: OrgRow[] }> {
  const orgs = await orgsFor(user);
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const org = orgs.find((o) => o.id === wanted) ?? orgs[0] ?? null;
  return { org, orgs };
}

/** 조직이 없으면 그릴 것이 없다 — 관리자는 조직 목록으로 */
export async function requireCurrentOrg(
  user: MasterUser
): Promise<{ org: OrgRow; orgs: OrgRow[] }> {
  const { org, orgs } = await currentOrg(user);
  if (!org) notFound();
  return { org, orgs };
}

