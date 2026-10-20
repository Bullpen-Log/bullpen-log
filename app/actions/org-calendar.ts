'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/dal';
import { requireOrg } from '@/lib/org/access';
import { EVENT_MEMO_MAX, EVENT_TITLE_MAX, isDateKey, isEventKind, timeOk } from '@/lib/org/rules';
import { dbDate } from '@/lib/nutrition/days';

/**
 * 조직 일정(OrgEvent, 5단계 팀 달력 · 4단계 레슨 시간표) — 선수 개인의 CalendarEvent 와 다른 표. 모두 requireMaster → requireOrg.
 * 레슨은 회원(memberId)에 붙는다 — 레슨장 홈의 '오늘 레슨'이 그 회원 카드로 간다.
 */

export type OrgActionState = { error?: string; success?: string } | undefined;

export async function saveOrgEvent(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const user = await requireMaster();
  const org = await requireOrg(user, String(formData.get('orgId') ?? ''));
  const id = String(formData.get('id') ?? '').trim();
  const date = String(formData.get('date') ?? '');
  if (!isDateKey(date)) return { error: '날짜를 골라 주세요.' };
  const time = String(formData.get('time') ?? '').trim();
  if (time && !timeOk(time)) return { error: '시각은 HH:MM 꼴로 적어 주세요.' };
  const kind = String(formData.get('kind') ?? '');
  if (!isEventKind(kind)) return { error: '종류를 골라 주세요.' };
  const memberId = String(formData.get('memberId') ?? '').trim() || null;
  let title = String(formData.get('title') ?? '').trim().slice(0, EVENT_TITLE_MAX);
  const memo = String(formData.get('memo') ?? '').trim().slice(0, EVENT_MEMO_MAX) || null;

  if (memberId) {
    const m = await prisma.orgMember.findFirst({
      where: { id: memberId, orgId: org.id, status: 'ACTIVE' },
      select: { nickname: true },
    });
    if (!m) return { error: '회원을 찾을 수 없어요.' };
    if (!title) title = `${m.nickname} 레슨`;
  }
  if (!title) return { error: '제목을 적어 주세요.' };

  const data = { date: dbDate(date), time: time || null, kind, title, memo, memberId };
  if (id) {
    const found = await prisma.orgEvent.findFirst({ where: { id, orgId: org.id }, select: { id: true } });
    if (!found) return { error: '일정을 찾을 수 없어요.' };
    await prisma.orgEvent.update({ where: { id }, data });
  } else {
    await prisma.orgEvent.create({ data: { ...data, orgId: org.id, createdById: user.id } });
  }
  revalidatePath('/master/calendar');
  revalidatePath('/master');
  return { success: id ? '고쳤어요.' : '더했어요.' };
}

export async function deleteOrgEvent(formData: FormData) {
  const user = await requireMaster();
  const ev = await prisma.orgEvent.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, orgId: true },
  });
  if (!ev) return;
  await requireOrg(user, ev.orgId);
  await prisma.orgEvent.delete({ where: { id: ev.id } });
  revalidatePath('/master/calendar');
  revalidatePath('/master');
}
