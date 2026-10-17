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

/**
 * 고객센터 동작 — 1:1 문의 · 답글 · 상태 · 공지(2026-10-17 1판 — 틀). 글 · 한도는 lib/support.ts.
 * 권한은 여기서 다시 본다 — 화면이 단추를 숨겨도 주소로 바로 보낼 수 있다.
 */
export type SupportState = { error?: string; values?: FormValues } | undefined;

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
  // 오류로 끝나면 쓰던 글을 돌려준다. 길게 쓴 내용이 날아가면 안 된다.
  return withInput(await tryCreateInquiry(formData), formData);
}

async function tryCreateInquiry(formData: FormData): Promise<SupportState> {
  const user = await getCurrentUser();
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
  redirect(`/support/inquiries/${inquiry.id}`);
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
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
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
  const user = await getCurrentUser();
  if (!user) return { error: LOGIN_NEEDED };
  if (user.role !== 'ADMIN') return { error: ADMIN_ONLY };

  const read = readNotice(formData);
  if ('error' in read) return { error: read.error };

  const notice = await prisma.supportNotice.create({
    data: { authorId: user.id, ...read.data },
    select: { id: true },
  });

  revalidateNotices();
  redirect(`/support/notices/${notice.id}`);
}

export async function updateNotice(
  _prev: SupportState,
  formData: FormData
): Promise<SupportState> {
  return withInput(await tryUpdateNotice(formData), formData);
}

async function tryUpdateNotice(formData: FormData): Promise<SupportState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGIN_NEEDED };
  if (user.role !== 'ADMIN') return { error: ADMIN_ONLY };

  const id = String(formData.get('id') ?? '');
  const read = readNotice(formData);
  if ('error' in read) return { error: read.error };

  const exists = await prisma.supportNotice.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return { error: '공지를 찾을 수 없어요.' };

  await prisma.supportNotice.update({ where: { id }, data: read.data });

  revalidateNotices(id);
  redirect(`/support/notices/${id}`);
}

export async function deleteNotice(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') return;

  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const exists = await prisma.supportNotice.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return;

  await prisma.supportNotice.delete({ where: { id } });
  revalidateNotices(id);
  /* 지운 자리(공지 상세)에서 왔으니 공지 목록으로 — 관리 화면으로 튕기면 보던 목록을 잃는다 */
  redirect('/support/notices');
}
