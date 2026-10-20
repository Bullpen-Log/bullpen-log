import 'server-only';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/dal';
import { consentAll, type Consent, type OrgKind } from '@/lib/org/rules';

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

/** 구성원의 공유 동의 — 동의 줄이 없으면(코치가 대신 만든 자리) 모두 보인다 */
export function memberScope(consent: Consent | null | undefined): Consent {
  return consent ?? consentAll();
}
