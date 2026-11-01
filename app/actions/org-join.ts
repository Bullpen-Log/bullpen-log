'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { consentFromForm } from '@/lib/org/rules';
import { joinWithCode } from '@/lib/org/join';
import { isJoinBase } from '@/components/org/join-view';

/**
 * 선수가 초대 코드로 조직(팀 · 레슨장)에 참여한다 — 선수 화면 app/(app)/join. 마스터 계정은 여기로 못 온다((app) 틀이 /manage 로 보낸다).
 * 공유 범위는 참여 화면의 체크박스(scope-*)에서 — 기본값은 lib/org/rules.ts consentDefaults.
 */
export async function joinOrg(formData: FormData) {
  const user = await requireUser();
  /* 되돌아갈 곳 — 덕아웃(/teams/join, 2026-11-01)과 싱커 옛 주소(/join) 둘뿐. 폼이 보낸 값은 목록에 있을 때만 믿는다 */
  const back = formData.get('back');
  const base = isJoinBase(back) ? back : '/join';
  const res = await joinWithCode(user, formData.get('code'), consentFromForm((name) => formData.get(name)));
  if (!res.ok) redirect(`${base}?error=${res.error}`);
  revalidatePath('/join');
  revalidatePath('/teams/join');
  revalidatePath('/manage', 'layout');
  redirect(`${base}?joined=${res.orgId}`);
}
