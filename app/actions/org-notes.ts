'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/dal';
import { requireOrg } from '@/lib/org/access';
import {
  GUARDIAN_DAYS,
  HOMEWORK_MAX,
  NOTE_MAX,
  PASS_TOTAL_MAX,
  isDateKey,
  makeGuardianCode,
  passUsable,
} from '@/lib/org/rules';
import { dbDate } from '@/lib/nutrition/days';
import { isFutureDateKey } from '@/lib/pitch-stats';

/**
 * 레슨 노트 · 숙제 · 수강권 · 보호자 리포트(4단계) — 모두 requireMaster → 그 구성원의 조직(requireOrg).
 * 노트는 가입 전 자리(userId null)에도 쓴다. 수강권은 레슨 날에 노트를 쓰면(countPass) 한 회 준다 — 쓸 수 있는 것 가운데 기한이 가까운 것부터.
 */

export type OrgActionState = { error?: string; success?: string } | undefined;

async function memberOf(user: Awaited<ReturnType<typeof requireMaster>>, memberId: string) {
  const member = await prisma.orgMember.findUnique({
    where: { id: memberId },
    select: { id: true, orgId: true, nickname: true },
  });
  if (!member) return null;
  await requireOrg(user, member.orgId);
  return member;
}

export async function createLessonNote(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const user = await requireMaster();
  const member = await memberOf(user, String(formData.get('memberId') ?? ''));
  if (!member) return { error: '구성원을 찾을 수 없어요.' };
  const date = String(formData.get('date') ?? '');
  if (!isDateKey(date)) return { error: '날짜를 골라 주세요.' };
  if (isFutureDateKey(date)) return { error: '아직 오지 않은 날에는 쓸 수 없어요.' };
  const body = String(formData.get('body') ?? '').trim().slice(0, NOTE_MAX);
  const homework = String(formData.get('homework') ?? '').trim().slice(0, HOMEWORK_MAX) || null;
  if (!body && !homework) return { error: '노트나 숙제를 적어 주세요.' };
  const countPass = formData.get('countPass') === 'on';

  await prisma.$transaction(async (tx) => {
    await tx.lessonNote.create({
      data: { memberId: member.id, date: dbDate(date), body: body || '(숙제만)', homework, authorId: user.id },
    });
    if (countPass) {
      const passes = await tx.lessonPass.findMany({
        where: { memberId: member.id },
        orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, total: true, used: true, expiresAt: true },
      });
      const pick = passes.find((p) => passUsable(p, date));
      if (pick) await tx.lessonPass.update({ where: { id: pick.id }, data: { used: { increment: 1 } } });
    }
  });
  revalidatePath(`/manage/players/${member.id}`);
  revalidatePath('/manage');
  return { success: '남겼어요.' };
}

export async function deleteLessonNote(formData: FormData) {
  const user = await requireMaster();
  const note = await prisma.lessonNote.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, memberId: true, member: { select: { orgId: true } } },
  });
  if (!note) return;
  await requireOrg(user, note.member.orgId);
  await prisma.lessonNote.delete({ where: { id: note.id } });
  revalidatePath(`/manage/players/${note.memberId}`);
  revalidatePath('/manage');
}

/* ── 수강권 ── */

export async function addPass(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const user = await requireMaster();
  const member = await memberOf(user, String(formData.get('memberId') ?? ''));
  if (!member) return { error: '구성원을 찾을 수 없어요.' };
  const total = Number.parseInt(String(formData.get('total') ?? ''), 10);
  if (!Number.isInteger(total) || total < 1 || total > PASS_TOTAL_MAX) return { error: `횟수는 1~${PASS_TOTAL_MAX}회로 적어 주세요.` };
  const rawExp = String(formData.get('expiresAt') ?? '').trim();
  if (rawExp && !isDateKey(rawExp)) return { error: '기한 날짜가 올바르지 않아요.' };
  const memo = String(formData.get('memo') ?? '').trim().slice(0, 80) || null;
  await prisma.lessonPass.create({
    data: { memberId: member.id, total, expiresAt: rawExp ? dbDate(rawExp) : null, memo },
  });
  revalidatePath(`/manage/players/${member.id}`);
  revalidatePath('/manage');
  return { success: '수강권을 더했어요.' };
}

/** 쓴 회수 손으로 맞추기(+1 · −1) — 노트 없이 한 레슨, 잘못 센 것 */
export async function adjustPass(formData: FormData) {
  const user = await requireMaster();
  const pass = await prisma.lessonPass.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, used: true, total: true, memberId: true, member: { select: { orgId: true } } },
  });
  if (!pass) return;
  await requireOrg(user, pass.member.orgId);
  const delta = formData.get('delta') === '-1' ? -1 : 1;
  const used = Math.max(0, Math.min(pass.total, pass.used + delta));
  await prisma.lessonPass.update({ where: { id: pass.id }, data: { used } });
  revalidatePath(`/manage/players/${pass.memberId}`);
  revalidatePath('/manage');
}

export async function deletePass(formData: FormData) {
  const user = await requireMaster();
  const pass = await prisma.lessonPass.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, memberId: true, member: { select: { orgId: true } } },
  });
  if (!pass) return;
  await requireOrg(user, pass.member.orgId);
  await prisma.lessonPass.delete({ where: { id: pass.id } });
  revalidatePath(`/manage/players/${pass.memberId}`);
  revalidatePath('/manage');
}

/* ── 보호자 리포트 링크 ── */

/** 링크 + 네 자리 코드를 만든다 — 코드는 한 번만 돌려준다(해시로만 저장). 30일 */
export async function createGuardianLink(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const user = await requireMaster();
  const member = await memberOf(user, String(formData.get('memberId') ?? ''));
  if (!member) return { error: '구성원을 찾을 수 없어요.' };
  const code = makeGuardianCode();
  const token = randomUUID().replace(/-/g, '');
  await prisma.guardianReport.create({
    data: {
      token,
      memberId: member.id,
      codeHash: await bcrypt.hash(code, 8),
      expiresAt: new Date(Date.now() + GUARDIAN_DAYS * 86_400_000),
      createdById: user.id,
    },
  });
  revalidatePath(`/manage/players/${member.id}`);
  /* 코드는 이 답에만 — 화면이 한 번 보여 주고 보호자에게 따로 알린다(주소와 다른 길로) */
  return { success: `${token}:${code}` };
}

export async function revokeGuardianLink(formData: FormData) {
  const user = await requireMaster();
  const r = await prisma.guardianReport.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, memberId: true, member: { select: { orgId: true } } },
  });
  if (!r) return;
  await requireOrg(user, r.member.orgId);
  await prisma.guardianReport.delete({ where: { id: r.id } });
  revalidatePath(`/manage/players/${r.memberId}`);
}

