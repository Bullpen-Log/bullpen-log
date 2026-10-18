import 'server-only';
import { prisma } from '@/lib/prisma';
import type { getCurrentUser } from '@/lib/dal';

/**
 * 고객센터 읽기 — 공지 · 내 1:1 문의 · 문의 대화. 웹 화면(app/(app)/support)과 아이폰 앱 화면(app/actions/support.ts loadApp… →
 * native/src/app/support)이 같이 쓴다. 남의 문의는 관리자만 연다(쓴 사람 본인 아니면 null — 없는 것처럼).
 * 'use server' 파일에 두지 않는다 — user 를 받는 함수가 거기 있으면 누구나 부를 수 있는 입구가 된다.
 */
type SupportUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const NOTICE_ROW = { id: true, title: true, pinned: true, createdAt: true } as const;
const INQUIRY_ROW = {
  id: true,
  title: true,
  category: true,
  status: true,
  createdAt: true,
  _count: { select: { replies: true } },
} as const;

/** 고정 공지가 먼저, 그다음 새 글 순 — take 를 주면 그만큼만(첫 화면 3개) */
export function loadNotices(take?: number) {
  return prisma.supportNotice.findMany({
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take,
    select: NOTICE_ROW,
  });
}

export function loadNotice(id: string) {
  return prisma.supportNotice.findUnique({
    where: { id },
    select: { id: true, title: true, body: true, pinned: true, createdAt: true },
  });
}

/** 내 1:1 문의 — 새 것부터. take 를 주면 그만큼만(첫 화면 5개) */
export async function loadInquiries(user: SupportUser, take?: number) {
  const rows = await prisma.supportInquiry.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take,
    select: INQUIRY_ROW,
  });
  return rows.map(({ _count, ...q }) => ({ ...q, replyCount: _count.replies }));
}

/** 고객센터 첫 화면 — 공지 3 · 내 문의 5 · 내 문의 수 */
export async function loadSupportHome(user: SupportUser) {
  const [notices, inquiries, inquiryCount] = await Promise.all([
    loadNotices(3),
    loadInquiries(user, 5),
    prisma.supportInquiry.count({ where: { userId: user.id } }),
  ]);
  return { notices, inquiries, inquiryCount };
}

/**
 * 문의 한 건의 대화 — 쓴 사람과 관리자만(아니면 null). staff = 관리자가 남의 문의를 연 것(답글이 운영자 답이 된다,
 * app/actions/support.ts replyInquiry 와 같은 조건).
 */
export async function loadInquiry(user: SupportUser, id: string) {
  const isAdmin = user.role === 'ADMIN';
  const inquiry = await prisma.supportInquiry.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      category: true,
      title: true,
      body: true,
      status: true,
      createdAt: true,
      user: { select: { nickname: true } },
      replies: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          fromStaff: true,
          body: true,
          createdAt: true,
          author: { select: { nickname: true } },
        },
      },
    },
  });
  if (!inquiry || (inquiry.userId !== user.id && !isAdmin)) return null;
  const { userId, user: asker, replies, ...rest } = inquiry;
  return {
    ...rest,
    nickname: asker.nickname,
    staff: isAdmin && userId !== user.id,
    replies: replies.map(({ author, ...r }) => ({
      ...r,
      name: author?.nickname ?? (r.fromStaff ? '운영자' : '탈퇴한 회원'),
    })),
  };
}
