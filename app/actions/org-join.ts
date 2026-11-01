'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { ORG_COOKIE } from '@/lib/org/access';
import { consentFromForm } from '@/lib/org/rules';
import { joinWithCode } from '@/lib/org/join';
import { isJoinBase } from '@/components/org/join-view';

/**
 * 초대 코드로 조직(팀 · 레슨장)에 들어간다 — 참여 화면(components/org/join-view.tsx, 덕아웃 /teams/join · 싱커 옛 /join). 선수 코드면 공유 범위
 * 체크박스(scope-*)를 함께 저장하고(기본값 lib/org/rules.ts consentDefaults), 코치 코드면 동의 없이 코치로 들어간다(2차 검토 G01) — 판정은 lib/org/join.ts 트랜잭션.
 * 코치로 들어가면 덕아웃 관리의 '지금 조직' 쿠키를 그 조직으로 두어 '관리로 가기'가 바로 그 조직을 연다.
 */
export async function joinOrg(formData: FormData) {
  const user = await requireUser();
  /* 되돌아갈 곳 — 덕아웃(/teams/join, 2026-11-01)과 싱커 옛 주소(/join) 둘뿐. 폼이 보낸 값은 목록에 있을 때만 믿는다 */
  const back = formData.get('back');
  const base = isJoinBase(back) ? back : '/join';
  const res = await joinWithCode(user, formData.get('code'), consentFromForm((name) => formData.get(name)));
  if (!res.ok) redirect(`${base}?error=${res.error}`);
  if (res.role !== 'PLAYER') (await cookies()).set(ORG_COOKIE, res.orgId, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  revalidatePath('/join');
  revalidatePath('/teams/join');
  revalidatePath('/manage', 'layout');
  redirect(`${base}?joined=${res.orgId}&as=${res.role === 'PLAYER' ? 'player' : res.outcome === 'already' ? 'already' : 'staff'}`);
}
