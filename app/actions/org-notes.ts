'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notify';
import {
  INTENSITY_MAX,
  INTENSITY_MIN,
  PITCH_COUNT_MAX,
  parseExercises,
  readBounded,
} from '@/lib/org/lesson-work';
import { requireMaster } from '@/lib/dal';
import { requireOrg } from '@/lib/org/access';
import {
  GUARDIAN_DAYS,
  HOMEWORK_MAX,
  NOTE_MAX,
  PASS_TOTAL_MAX,
  isDateKey,
  makeGuardianCode,
} from '@/lib/org/rules';
import { dbDate } from '@/lib/nutrition/days';
import { isFutureDateKey } from '@/lib/pitch-stats';
import { Prisma } from '@prisma/client';
import { appNow, appNowMs } from '@/lib/clock';
import { memberScope } from '@/lib/org/rules';
import { noteKey, planNotePitch, type NotePitchPlan } from '@/lib/org/lesson-pitch';
import { isOrgVideoPath } from '@/lib/org/comments';
import { deleteVideos } from '@/lib/storage';
import { DEFAULT_SESSION_TYPE, isRestSession, validateSessionType } from '@/lib/session-type';
import { effortFields, scaleToEffortPct } from '@/lib/pitch-effort';

/**
 * 레슨 노트 · 숙제 · 수강권 · 보호자 리포트(4단계) — 모두 requireMaster → 그 구성원의 조직(requireOrg).
 * 노트는 가입 전 자리(userId null)에도 쓴다. 노트 저장은 수강권을 바꾸지 않는다 — 차감은 덕아웃 예약 끝남(app/actions/lessons.ts finishBooking)이
 * 한다(2026-10-25 0단계 계약 2-1, 싱커는 지도 · 기록, 덕아웃은 예약 · 수강권).
 */

export type OrgActionState = { error?: string; success?: string } | undefined;

async function memberOf(
  user: Awaited<ReturnType<typeof requireMaster>>,
  memberId: string
) {
  const member = await prisma.orgMember.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      orgId: true,
      nickname: true,
      userId: true,
      consent: { select: { pitch: true, training: true, checkin: true, video: true, nutrition: true, weight: true } },
    },
  });
  if (!member) return null;
  await requireOrg(user, member.orgId);
  return member;
}

type Member = NonNullable<Awaited<ReturnType<typeof memberOf>>>;
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** 같은 코치가 2분 안에 같은 회원 · 같은 날 · 같은 글로 또 보내면 새 일지를 안 만든다(답을 못 받아 다시 누른 것) */
const NOTE_DUPLICATE_MS = 2 * 60 * 1000;

/**
 * 일지의 지도 활동(2단계) — 그날 그 회원의 취소 안 된 레슨 활동이 있으면 그것을 '실시'로, 없으면 '실시' 레슨 활동을 새로 만든다.
 * 활동은 지도가 있었다는 확인일 뿐 수강권과 무관하다(차감은 덕아웃 예약 끝남).
 */
async function lessonEventOf(tx: Tx, member: Member, date: string, byId: string): Promise<string> {
  const found = await tx.orgEvent.findFirst({
    where: { orgId: member.orgId, memberId: member.id, date: dbDate(date), kind: 'lesson', status: { not: 'canceled' } },
    orderBy: [{ time: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, status: true },
  });
  if (found) {
    if (found.status !== 'done')
      await tx.orgEvent.update({ where: { id: found.id }, data: { status: 'done', doneAt: appNow() } });
    return found.id;
  }
  const org = await tx.org.findUnique({ where: { id: member.orgId }, select: { kind: true } });
  const ev = await tx.orgEvent.create({
    data: {
      orgId: member.orgId,
      memberId: member.id,
      date: dbDate(date),
      kind: 'lesson',
      title: `${member.nickname} ${org?.kind === 'TEAM' ? '개인 지도' : '레슨'}`.slice(0, 40),
      status: 'done',
      doneAt: appNow(),
      createdById: byId,
    },
    select: { id: true },
  });
  return ev.id;
}

/** 일지 폼 읽기 — 만들기 · 고치기 공통 */
async function readNoteForm(formData: FormData, member: Member) {
  const date = String(formData.get('date') ?? '');
  if (!isDateKey(date)) return { error: '날짜를 골라 주세요.' } as const;
  if (isFutureDateKey(date)) return { error: '아직 오지 않은 날에는 쓸 수 없어요.' } as const;
  const body = String(formData.get('body') ?? '')
    .trim()
    .slice(0, NOTE_MAX);
  const homework =
    String(formData.get('homework') ?? '')
      .trim()
      .slice(0, HOMEWORK_MAX) || null;
  if (!body && !homework) return { error: '노트나 숙제를 적어 주세요.' } as const;
  /* 한 일 · 공 수 · 강도(2026-10-21 개편 3단계) — 선수 쪽 레슨 줄(lib/org/lesson-feed.ts)이 읽는다 */
  const exercises = parseExercises(String(formData.get('exercises') ?? ''));
  const pitchCount = readBounded(formData.get('pitchCount'), 0, PITCH_COUNT_MAX) || null;
  const intensity = readBounded(formData.get('intensity'), INTENSITY_MIN, INTENSITY_MAX);
  const rawType = String(formData.get('sessionType') ?? '').trim();
  const type = validateSessionType(rawType || DEFAULT_SESSION_TYPE);
  if ('error' in type) return { error: type.error } as const;
  if (isRestSession(type.value)) return { error: '던진 공의 종류를 골라 주세요.' } as const;
  const canWrite = !!member.userId && memberScope(member.consent, true).pitch;
  if (canWrite && pitchCount && intensity == null) return { error: '던진 공이 있으면 강도를 골라 주세요.' } as const;
  return {
    date,
    body,
    homework,
    exercises,
    pitchCount,
    intensity,
    sessionType: type.value,
    canWrite,
    link: String(formData.get('link') ?? '').trim(),
  } as const;
}

type NoteForm = Exclude<Awaited<ReturnType<typeof readNoteForm>>, { error: string }>;

/** 선수가 그날 직접 남긴 투구 기록(코치가 적은 줄 · 쉰 날 빼고) */
async function selfLogIdsOf(userId: string | null, date: string): Promise<string[]> {
  if (!userId) return [];
  const logs = await prisma.pitchLog.findMany({
    where: { userId, date: dbDate(date), enteredById: null, pitchCount: { gt: 0 } },
    select: { id: true },
  });
  return logs.map((l) => l.id);
}

/**
 * 일지 하나의 선수 투구 기록을 계획대로 맞춘다 — 코치 줄(clientKey = 일지)은 만들거나 고치거나 지우고, 이은 선수 줄은 활동을 잇거나 푼다.
 * 이은 줄은 그 일지의 활동(eventId)으로 찾는다. 같은 활동에 다른 일지가 남아 있으면 연결을 안 푼다.
 */
async function syncNotePitch(
  tx: Tx,
  a: { noteId: string; eventId: string; oldEventId: string | null; member: Member; form: NoteForm; plan: NotePitchPlan; orgId: string; byId: string }
) {
  const userId = a.member.userId;
  if (!userId) return;
  const key = noteKey(a.noteId);
  const own = await tx.pitchLog.findUnique({ where: { userId_clientKey: { userId, clientKey: key } }, select: { id: true } });
  /* 예전에 이은 선수 줄 — 다른 일지가 같은 활동을 쓰면 그대로 둔다 */
  for (const ev of new Set([a.oldEventId, a.eventId].filter((x): x is string => !!x))) {
    const others = await tx.lessonNote.count({ where: { eventId: ev, id: { not: a.noteId } } });
    if (others > 0) continue;
    await tx.pitchLog.updateMany({
      where: { userId, orgEventId: ev, enteredById: null, ...(a.plan.kind === 'link' ? { id: { not: a.plan.logId } } : {}) },
      data: { orgEventId: null },
    });
  }
  if (a.plan.kind !== 'own' && own) await tx.pitchLog.delete({ where: { id: own.id } });
  if (a.plan.kind === 'link') {
    await tx.pitchLog.updateMany({ where: { id: a.plan.logId, userId, enteredById: null }, data: { orgEventId: a.eventId } });
  } else if (a.plan.kind === 'own') {
    const data = {
      date: dbDate(a.form.date),
      sessionType: a.form.sessionType,
      pitchCount: a.form.pitchCount!,
      ...effortFields(scaleToEffortPct(a.form.intensity!)),
      orgEventId: a.eventId,
    };
    if (own) await tx.pitchLog.update({ where: { id: own.id }, data });
    else
      await tx.pitchLog.create({
        data: { ...data, userId, enteredById: a.byId, orgId: a.orgId, clientKey: key, memo: '레슨 일지에서 코치가 남긴 공' },
      });
  }
}

function revalidateNote(memberId: string) {
  revalidatePath(`/manage/players/${memberId}`);
  revalidatePath('/manage');
  revalidatePath('/');
  revalidatePath('/me');
}

export async function createLessonNote(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const user = await requireMaster();
  const member = await memberOf(user, String(formData.get('memberId') ?? ''));
  if (!member) return { error: '구성원을 찾을 수 없어요.' };
  const form = await readNoteForm(formData, member);
  if ('error' in form) return { error: form.error };
  const plan = planNotePitch({ pitchCount: form.pitchCount, canWrite: form.canWrite, selfLogIds: await selfLogIdsOf(member.userId, form.date), link: form.link });
  if ('error' in plan) return { error: plan.error };

  const dup = await prisma.lessonNote.findFirst({
    where: {
      memberId: member.id,
      date: dbDate(form.date),
      authorId: user.id,
      body: form.body || '(숙제만)',
      createdAt: { gte: new Date(appNowMs() - NOTE_DUPLICATE_MS) },
    },
    select: { id: true },
  });
  if (dup) return { success: '남겼어요.' };

  await prisma.$transaction(async (tx) => {
    const eventId = await lessonEventOf(tx, member, form.date, user.id);
    const note = await tx.lessonNote.create({
      data: {
        memberId: member.id,
        date: dbDate(form.date),
        body: form.body || '(숙제만)',
        homework: form.homework,
        authorId: user.id,
        exercises: form.exercises.length ? form.exercises : undefined,
        pitchCount: form.pitchCount,
        intensity: form.intensity,
        eventId,
      },
      select: { id: true },
    });
    await syncNotePitch(tx, { noteId: note.id, eventId, oldEventId: null, member, form, plan, orgId: member.orgId, byId: user.id });
    /* 덕아웃 회원의 첫 레슨 기록 — 이 순간 싱커를 쓰기 시작한다(결정 3) */
    if (member.userId)
      await tx.user.updateMany({
        where: { id: member.userId, sinkerStartedAt: null },
        data: { sinkerStartedAt: new Date() },
      });
  });
  if (member.userId)
    await notify(member.userId, {
      kind: 'lesson',
      title: '코치가 레슨 기록을 남겼어요',
      body: form.body.slice(0, 60),
      link: '/me#lessons',
    });
  revalidateNote(member.id);
  return { success: '남겼어요.' };
}

/** 일지 고치기(2단계) — 같은 조직의 코치면 누구나(고친 사람을 남긴다). 날짜가 바뀌면 그날 활동으로 옮기고 투구 기록도 따라간다 */
export async function updateLessonNote(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const user = await requireMaster();
  const note = await prisma.lessonNote.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, memberId: true, eventId: true, date: true },
  });
  if (!note) return { error: '일지를 찾을 수 없어요.' };
  const member = await memberOf(user, note.memberId);
  if (!member) return { error: '구성원을 찾을 수 없어요.' };
  const form = await readNoteForm(formData, member);
  if ('error' in form) return { error: form.error };
  const plan = planNotePitch({ pitchCount: form.pitchCount, canWrite: form.canWrite, selfLogIds: await selfLogIdsOf(member.userId, form.date), link: form.link });
  if ('error' in plan) return { error: plan.error };

  await prisma.$transaction(async (tx) => {
    const sameDay = note.date.toISOString().slice(0, 10) === form.date;
    const eventId = sameDay && note.eventId ? note.eventId : await lessonEventOf(tx, member, form.date, user.id);
    await tx.lessonNote.update({
      where: { id: note.id },
      data: {
        date: dbDate(form.date),
        body: form.body || '(숙제만)',
        homework: form.homework,
        exercises: form.exercises.length ? form.exercises : Prisma.DbNull,
        pitchCount: form.pitchCount,
        intensity: form.intensity,
        eventId,
        editedById: user.id,
      },
    });
    await syncNotePitch(tx, { noteId: note.id, eventId, oldEventId: note.eventId, member, form, plan, orgId: member.orgId, byId: user.id });
  });
  revalidateNote(member.id);
  return { success: '고쳤어요.' };
}

/** 일지 지우기 — 그 일지가 만든 코치 줄만 지우고, 이은 선수 줄은 연결만 푼다(다른 일지가 같은 활동을 쓰면 그대로). 활동은 남긴다(지도는 있었다) */
export async function deleteLessonNote(formData: FormData) {
  const user = await requireMaster();
  const note = await prisma.lessonNote.findUnique({
    where: { id: String(formData.get('id') ?? '') },
    select: { id: true, memberId: true, eventId: true, videoPaths: true, member: { select: { orgId: true, userId: true } } },
  });
  if (!note) return;
  await requireOrg(user, note.member.orgId);
  const userId = note.member.userId;
  await prisma.$transaction(async (tx) => {
    if (userId) {
      await tx.pitchLog.deleteMany({ where: { userId, clientKey: noteKey(note.id) } });
      if (note.eventId && (await tx.lessonNote.count({ where: { eventId: note.eventId, id: { not: note.id } } })) === 0)
        await tx.pitchLog.updateMany({ where: { userId, orgEventId: note.eventId, enteredById: null }, data: { orgEventId: null } });
    }
    await tx.lessonNote.delete({ where: { id: note.id } });
  });
  /* 일지에 붙인 조직 영상(org- 파일)만 저장소에서 지운다 — 투구 영상 · 사진은 그 앞말이 아니다 */
  await deleteVideos(note.videoPaths.filter(isOrgVideoPath));
  revalidateNote(note.memberId);
}

/* ── 수강권 ── */

export async function addPass(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const user = await requireMaster();
  const member = await memberOf(user, String(formData.get('memberId') ?? ''));
  if (!member) return { error: '구성원을 찾을 수 없어요.' };
  const total = Number.parseInt(String(formData.get('total') ?? ''), 10);
  if (!Number.isInteger(total) || total < 1 || total > PASS_TOTAL_MAX)
    return { error: `횟수는 1~${PASS_TOTAL_MAX}회로 적어 주세요.` };
  const rawExp = String(formData.get('expiresAt') ?? '').trim();
  if (rawExp && !isDateKey(rawExp)) return { error: '기한 날짜가 올바르지 않아요.' };
  const memo =
    String(formData.get('memo') ?? '')
      .trim()
      .slice(0, 80) || null;
  await prisma.lessonPass.create({
    data: {
      memberId: member.id,
      total,
      expiresAt: rawExp ? dbDate(rawExp) : null,
      memo,
    },
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
    select: {
      id: true,
      used: true,
      total: true,
      memberId: true,
      member: { select: { orgId: true } },
    },
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
export async function createGuardianLink(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
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
