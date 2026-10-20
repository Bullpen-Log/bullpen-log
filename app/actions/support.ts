'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { withInput, type FormValues } from '@/lib/form-values';
import {
  INQUIRY_BODY_MAX,
  INQUIRY_TITLE_MAX,
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  REPLY_BODY_MAX,
  isInquiryCategory,
} from '@/lib/support';
import {
  loadInquiries,
  loadInquiry,
  loadNotice,
  loadNotices,
  loadSupportHome,
} from '@/lib/support-load';
import { CONTACT } from '@/components/site-footer';
import {
  formatSupportDate,
  formatSupportDateTime,
} from '@/components/support/support-format';

/**
 * 고객센터 동작 — 1:1 문의 · 답글 · 상태 · 공지(2026-10-17 1판 — 틀). 글 · 한도는 lib/support.ts.
 * 권한은 여기서 다시 본다 — 화면이 단추를 숨겨도 주소로 바로 보낼 수 있다.
 */
export type SupportState = { error?: string; values?: FormValues } | undefined;

type Me = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const LOGIN_NEEDED = '로그인이 필요해요.';
const ADMIN_ONLY = '관리자만 할 수 있어요.';

/* 문의 쪽 화면을 모두 새로 그린다 — 목록 · 고객센터 첫 화면 · 관리자 */
function revalidateInquiries(id?: string) {
  revalidatePath('/support');
  revalidatePath('/support/inquiries');
  revalidatePath('/admin/support');
  if (id) revalidatePath(`/support/inquiries/${id}`);
}

function revalidateNotices(id?: string) {
  revalidatePath('/support');
  revalidatePath('/support/notices');
  revalidatePath('/admin/support');
  if (id) revalidatePath(`/support/notices/${id}`);
}

/** 문의를 볼 · 만질 수 있는 사람 — 쓴 사람 본인이거나 관리자 */
function canTouchInquiry(
  user: { id: string; role: string },
  inquiry: { userId: string }
) {
  return inquiry.userId === user.id || user.role === 'ADMIN';
}

// ── 1:1 문의 ────────────────────────────────────────────────────────────────

export async function createInquiry(
  _prev: SupportState,
  formData: FormData
): Promise<SupportState> {
  const made = await tryCreateInquiry(await getCurrentUser(), formData);
  if ('id' in made) redirect(`/support/inquiries/${made.id}`);
  // 오류로 끝나면 쓰던 글을 돌려준다. 길게 쓴 내용이 날아가면 안 된다.
  return withInput(made, formData);
}

/** 문의 만들기 — 웹(createInquiry)은 그 문의로 redirect, 앱(createAppInquiry)은 번호를 받아 그 문의 화면을 연다 */
async function tryCreateInquiry(
  user: Me | null,
  formData: FormData
): Promise<{ error: string } | { id: string }> {
  if (!user) return { error: LOGIN_NEEDED };

  const category = String(formData.get('category') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();

  if (!isInquiryCategory(category)) return { error: '문의 종류를 골라 주세요.' };
  if (!title || !body) return { error: '제목과 내용을 적어 주세요.' };
  if (title.length > INQUIRY_TITLE_MAX) {
    return { error: `제목은 ${INQUIRY_TITLE_MAX}자 안으로 적어 주세요.` };
  }
  if (body.length > INQUIRY_BODY_MAX) {
    return { error: `내용은 ${INQUIRY_BODY_MAX}자 안으로 적어 주세요.` };
  }

  /* 1분 안 같은 문의면 그것을 돌려준다 — 끊긴 응답에 다시 보내면 같은 문의가 둘 생기고 10분 다섯 건 한도도 먹었다 */
  const same = await prisma.supportInquiry.findFirst({
    where: { userId: user.id, category, title, body, createdAt: { gte: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (same) return { id: same.id };

  /* 한 사람이 10분에 다섯 건 넘게는 못 보낸다 — 실수로 여러 번 누르거나 돌려서 쌓는 것을 막는다 */
  const recent = await prisma.supportInquiry.count({
    where: {
      userId: user.id,
      /* createdAt 은 DB 의 실제 시각 — 시뮬레이션 날짜(appNow)와 견주면 시험 계정이 영원히 막혔다(lib/clock.ts) */
      createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
    },
  });
  if (recent >= 5)
    return { error: '문의를 너무 자주 보냈어요. 잠시 뒤 다시 보내 주세요.' };

  const inquiry = await prisma.supportInquiry.create({
    data: { userId: user.id, category, title, body },
    select: { id: true },
  });

  revalidateInquiries();
  return { id: inquiry.id };
}

export async function replyInquiry(
  _prev: SupportState,
  formData: FormData
): Promise<SupportState> {
  return withInput(await tryReplyInquiry(formData), formData);
}

async function tryReplyInquiry(formData: FormData): Promise<SupportState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGIN_NEEDED };

  const id = String(formData.get('id') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: '내용을 적어 주세요.' };
  if (body.length > REPLY_BODY_MAX) {
    return { error: `답글은 ${REPLY_BODY_MAX}자 안으로 적어 주세요.` };
  }

  const inquiry = await prisma.supportInquiry.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });
  if (!inquiry || !canTouchInquiry(user, inquiry)) {
    return { error: '문의를 찾을 수 없어요.' };
  }
  if (inquiry.status === 'CLOSED') {
    return { error: '종료된 문의예요. 다시 열고 적어 주세요.' };
  }

  /*
   * 쓴 사람 본인의 글은 늘 '물음'이다 — 관리자가 자기 문의에 덧붙여도 운영자 답이 아니다. 운영자 답이면 답변 완료,
   * 물음이면 다시 접수됨으로 돌아가 관리자 목록(기본 OPEN)에 다시 뜬다.
   */
  const fromStaff = user.role === 'ADMIN' && inquiry.userId !== user.id;
  /* 1분 안 같은 답글이면 새로 안 만든다(끊긴 응답에 다시 보냄 — 문의 만들기와 같은 까닭) */
  const same = await prisma.supportReply.findFirst({
    where: { inquiryId: id, authorId: user.id, body, createdAt: { gte: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (same) return undefined;

  await prisma.$transaction([
    prisma.supportReply.create({
      data: { inquiryId: id, authorId: user.id, fromStaff, body },
    }),
    prisma.supportInquiry.update({
      where: { id },
      data: { status: fromStaff ? 'ANSWERED' : 'OPEN' },
    }),
  ]);

  revalidateInquiries(id);
  return undefined;
}

/** 쓴 사람 · 관리자가 문의를 닫는다 — 닫힌 문의에는 답글을 못 쓴다(다시 열 수 있다) */
/* 로그인 확인은 내보내는 함수 안에서 — 통합 시험(scripts/integration-selftest.mts)이 export 함수마다 그 줄을 본다 */
export async function closeInquiry(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  await setInquiryStatus(user, formData, 'CLOSED');
}

export async function reopenInquiry(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  await setInquiryStatus(user, formData, 'OPEN');
}

async function setInquiryStatus(
  user: Me,
  formData: FormData,
  status: 'OPEN' | 'CLOSED'
) {
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const inquiry = await prisma.supportInquiry.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!inquiry || !canTouchInquiry(user, inquiry)) return;

  await prisma.supportInquiry.update({ where: { id }, data: { status } });
  revalidateInquiries(id);
}

// ── 공지(관리자) ─────────────────────────────────────────────────────────────

/** 공지 폼의 값 — 만들기 · 고치기가 같은 검사를 쓴다 */
function readNotice(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const pinned = formData.get('pinned') === 'on';

  if (!title || !body) return { error: '제목과 내용을 적어 주세요.' } as const;
  if (title.length > NOTICE_TITLE_MAX) {
    return { error: `제목은 ${NOTICE_TITLE_MAX}자 안으로 적어 주세요.` } as const;
  }
  if (body.length > NOTICE_BODY_MAX) {
    return { error: `내용은 ${NOTICE_BODY_MAX}자 안으로 적어 주세요.` } as const;
  }
  return { data: { title, body, pinned } } as const;
}

export async function createNotice(
  _prev: SupportState,
  formData: FormData
): Promise<SupportState> {
  return withInput(await tryCreateNotice(formData), formData);
}

async function tryCreateNotice(formData: FormData): Promise<SupportState> {
  const r = await writeNotice(formData, null);
  if ('error' in r) return { error: r.error };
  redirect(`/support/notices/${r.id}`);
}

/**
 * 공지 만들기(id null) · 고치기 — 웹 폼(tryCreateNotice · tryUpdateNotice, 끝나면 그 공지로 redirect)과 앱(saveAppNotice, 번호를 돌려줌)이 같이 쓴다.
 * 관리자만, 같은 검사(readNotice).
 */
async function writeNotice(formData: FormData, id: string | null): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGIN_NEEDED };
  if (user.role !== 'ADMIN') return { error: ADMIN_ONLY };

  const read = readNotice(formData);
  if ('error' in read) return { error: read.error ?? '처리하지 못했어요.' };

  if (id == null) {
    /* 1분 안 같은 공지면 그것을 돌려준다(끊긴 응답에 다시 보냄 — 문의 만들기와 같은 까닭) */
    const same = await prisma.supportNotice.findFirst({
      where: {
        authorId: user.id,
        title: read.data.title,
        body: read.data.body,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
      select: { id: true },
    });
    if (same) return { id: same.id };

    const notice = await prisma.supportNotice.create({
      data: { authorId: user.id, ...read.data },
      select: { id: true },
    });
    revalidateNotices();
    return { id: notice.id };
  }

  const exists = await prisma.supportNotice.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return { error: '공지를 찾을 수 없어요.' };

  await prisma.supportNotice.update({ where: { id }, data: read.data });
  revalidateNotices(id);
  return { id };
}

export async function updateNotice(
  _prev: SupportState,
  formData: FormData
): Promise<SupportState> {
  return withInput(await tryUpdateNotice(formData), formData);
}

async function tryUpdateNotice(formData: FormData): Promise<SupportState> {
  const r = await writeNotice(formData, String(formData.get('id') ?? ''));
  if ('error' in r) return { error: r.error };
  redirect(`/support/notices/${r.id}`);
}

export async function deleteNotice(formData: FormData) {
  const user = await getCurrentUser();
  /* 지운 자리(공지 상세)에서 왔으니 공지 목록으로 — 관리 화면으로 튕기면 보던 목록을 잃는다 */
  if (user && (await removeNotice(user, String(formData.get('id') ?? ''))))
    redirect('/support/notices');
}

/** 지웠으면 true — 관리자만. 웹(deleteNotice)은 공지 목록으로 redirect, 앱(deleteAppNotice)은 화면을 닫는다 */
async function removeNotice(user: Me, id: string) {
  if (user.role !== 'ADMIN' || !id) return false;
  const exists = await prisma.supportNotice.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return false;

  await prisma.supportNotice.delete({ where: { id } });
  revalidateNotices(id);
  return true;
}

// ── 아이폰 앱(native/src/app/support) ───────────────────────────────────────

/*
 * 앱은 FormData 서버 동작을 못 부른다(JSON rpc) — 같은 검사 · 같은 쓰기를 부르는 JSON 입구. 읽기는 웹 화면과 같은 곳
 * (lib/support-load.ts)에서 하고, 날짜는 웹과 같은 글(한국 시간)로 바꿔 보낸다.
 */
const TO_LOGIN = { ok: false, to: '/login' } as const;
const fail = (error: string | undefined) => ({
  ok: false as const,
  error: error ?? '처리하지 못했어요.',
});
const dated = <T extends { createdAt: Date }>({ createdAt, ...row }: T) => ({
  ...row,
  date: formatSupportDate(createdAt),
});

/** 고객센터 첫 화면 — 공지 3 · 내 문의 5 · 문의 수 · 메일 주소(로그인이 안 될 때 닿는 길) */
export async function loadAppSupport() {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  const home = await loadSupportHome(user);
  return {
    ok: true as const,
    notices: home.notices.map(dated),
    inquiries: home.inquiries.map(dated),
    inquiryCount: home.inquiryCount,
    contact: CONTACT,
    isAdmin: user.role === 'ADMIN',
  };
}

export async function loadAppNotices() {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  return {
    ok: true as const,
    notices: (await loadNotices()).map(dated),
    isAdmin: user.role === 'ADMIN',
  };
}

/** 공지 한 편 — 없으면 notice: null */
export async function loadAppNotice(id: unknown) {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  const notice = await loadNotice(String(id ?? ''));
  if (!notice) return { ok: true as const, notice: null, isAdmin: false };
  const { createdAt, ...rest } = notice;
  return {
    ok: true as const,
    notice: { ...rest, at: formatSupportDateTime(createdAt) },
    isAdmin: user.role === 'ADMIN',
  };
}

export async function loadAppInquiries() {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  return { ok: true as const, inquiries: (await loadInquiries(user)).map(dated) };
}

/** 문의 한 건 — 쓴 사람 · 관리자만(아니면 inquiry: null) */
export async function loadAppInquiry(id: unknown) {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  const inquiry = await loadInquiry(user, String(id ?? ''));
  if (!inquiry) return { ok: true as const, inquiry: null };
  const { createdAt, replies, ...rest } = inquiry;
  return {
    ok: true as const,
    inquiry: {
      ...rest,
      at: formatSupportDateTime(createdAt),
      replies: replies.map(({ createdAt: at, ...r }) => ({
        ...r,
        at: formatSupportDateTime(at),
      })),
    },
  };
}

export async function createAppInquiry(input: {
  category?: unknown;
  title?: unknown;
  body?: unknown;
}) {
  const user = await getCurrentUser();
  const fd = new FormData();
  fd.set('category', String(input?.category ?? ''));
  fd.set('title', String(input?.title ?? ''));
  fd.set('body', String(input?.body ?? ''));
  const made = await tryCreateInquiry(user, fd);
  return 'id' in made ? { ok: true as const, id: made.id } : fail(made.error);
}

export async function replyAppInquiry(id: unknown, body: unknown) {
  const user = await getCurrentUser();
  if (!user) return fail(LOGIN_NEEDED);
  const fd = new FormData();
  fd.set('id', String(id ?? ''));
  fd.set('body', String(body ?? ''));
  const r = await tryReplyInquiry(fd);
  return r?.error ? fail(r.error) : { ok: true as const };
}

/** 문의 종료(open false) · 다시 열기(open true) — 쓴 사람 · 관리자만(setInquiryStatus 가 본다) */
export async function setAppInquiryOpen(id: unknown, open: unknown) {
  const user = await getCurrentUser();
  if (!user) return fail(LOGIN_NEEDED);
  const fd = new FormData();
  fd.set('id', String(id ?? ''));
  await setInquiryStatus(user, fd, open === true ? 'OPEN' : 'CLOSED');
  return { ok: true as const };
}

export async function deleteAppNotice(id: unknown) {
  const user = await getCurrentUser();
  if (!user) return fail(LOGIN_NEEDED);
  return (await removeNotice(user, String(id ?? '')))
    ? { ok: true as const }
    : fail('지우지 못했어요.');
}

/** 공지 쓰기 · 고치기(관리자, 앱 native/src/app/admin/notice.tsx) — id 가 있으면 고친다. 같은 검사 · 같은 쓰기(writeNotice) */
export async function saveAppNotice(input: { id?: unknown; title?: unknown; body?: unknown; pinned?: unknown }) {
  const fd = new FormData();
  fd.set('title', String(input?.title ?? ''));
  fd.set('body', String(input?.body ?? ''));
  if (input?.pinned === true) fd.set('pinned', 'on');
  const r = await writeNotice(fd, input?.id ? String(input.id) : null);
  return 'error' in r ? fail(r.error) : { ok: true as const, id: r.id };
}
