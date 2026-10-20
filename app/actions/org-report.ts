'use server';

import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { BLOCKED_TEXT, blockedMinutes, clearFails, noteFail } from '@/lib/rate-limit';
import { REPORT_TOKEN_RE, isGuardianCode } from '@/lib/org/rules';

/**
 * 보호자 리포트(app/(report)/report/[token]) — 로그인 없이 토큰 주소 + 네 자리 코드로 연다(4단계).
 * 코드가 맞으면 그 리포트만 여는 쿠키를 하루 둔다(path 를 그 주소로 좁힌다). 여러 번 틀리면 로그인과 같은 잠금(lib/rate-limit.ts).
 */
export async function verifyGuardianCode(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const code = String(formData.get('code') ?? '').trim();
  if (!REPORT_TOKEN_RE.test(token)) redirect('/');
  const key = `report:${token}`;
  const blocked = await blockedMinutes(key);
  if (blocked) redirect(`/report/${token}?error=${encodeURIComponent(BLOCKED_TEXT(blocked))}`);
  const r = await prisma.guardianReport.findUnique({
    where: { token },
    select: { id: true, codeHash: true, expiresAt: true },
  });
  if (!r || r.expiresAt.getTime() < Date.now()) redirect(`/report/${token}`);
  if (!isGuardianCode(code) || !(await bcrypt.compare(code, r.codeHash))) {
    await noteFail(key);
    redirect(`/report/${token}?error=${encodeURIComponent('코드가 맞지 않아요. 네 자리 숫자를 다시 확인해 주세요.')}`);
  }
  await clearFails(key);
  await prisma.guardianReport.update({ where: { id: r.id }, data: { lastOpenedAt: new Date() } });
  (await cookies()).set(`bp-report-${token.slice(0, 8)}`, token, {
    path: `/report/${token}`,
    maxAge: 60 * 60 * 24,
    sameSite: 'lax',
    httpOnly: true,
  });
  redirect(`/report/${token}`);
}
