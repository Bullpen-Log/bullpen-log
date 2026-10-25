'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { consentFromForm } from '@/lib/org/rules';
import { joinWithCode } from '@/lib/org/join';

/**
 * 선수가 초대 코드로 조직(팀 · 레슨장)에 참여한다 — 선수 화면 app/(app)/join. 마스터 계정은 여기로 못 온다((app) 틀이 /manage 로 보낸다).
 * 공유 범위는 참여 화면의 체크박스(scope-*)에서 — 기본값은 lib/org/rules.ts consentDefaults.
 */
export async function joinOrg(formData: FormData) {
  const user = await requireUser();
  const res = await joinWithCode(user, formData.get('code'), consentFromForm((name) => formData.get(name)));
  if (!res.ok) redirect(`/join?error=${res.error}`);
  revalidatePath('/join');
  revalidatePath('/manage', 'layout');
  redirect(`/join?joined=${res.orgId}`);
}
