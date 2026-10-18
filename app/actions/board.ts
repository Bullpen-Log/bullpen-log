'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { withInput, type FormValues } from '@/lib/form-values';

export type BoardState = { error?: string; values?: FormValues } | undefined;

export async function createArticle(
  _prev: BoardState,
  formData: FormData
): Promise<BoardState> {
  // 오류로 끝나면 쓰던 글을 돌려준다. 길게 쓴 내용이 날아가면 안 된다.
  return withInput(await tryCreateArticle(formData), formData);
}

async function tryCreateArticle(formData: FormData): Promise<BoardState> {
  const user = await getCurrentUser();
  const saved = await saveArticle(user, {
    title: formData.get('title'),
    content: formData.get('content'),
    attachmentUrl: formData.get('attachmentUrl'),
    tags: formData.get('tags'),
  });
  if ('error' in saved) return { error: saved.error };
  revalidatePath('/board');
  redirect(`/board/${saved.id}`);
}

/** 글 올리기 — 웹 폼(createArticle)과 앱(createAppArticle)이 같은 거름을 쓴다 */
async function saveArticle(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  input: { title?: unknown; content?: unknown; attachmentUrl?: unknown; tags?: unknown }
): Promise<{ id: string } | { error: string }> {
  if (!user) return { error: '로그인이 필요해요.' };
  /*
   * 자료실은 운영자가 투구 역학·트레이닝 자료를 올리는 곳이다. 누구나 쓸 수
   * 있게 열어두면 신고·차단 같은 것이 곧 필요해지는데, 지금 그것을 감당할
   * 준비가 안 되어 있다. 커뮤니티가 필요해지면 그때 연다.
   */
  if (user.role !== 'ADMIN') {
    return { error: '자료실 글은 관리자만 올릴 수 있어요.' };
  }

  const title = String(input.title ?? '').trim();
  const content = String(input.content ?? '').trim();
  const attachmentUrl = String(input.attachmentUrl ?? '').trim();
  const tags = String(input.tags ?? '')
    .split(',')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 5);

  if (!title || !content) {
    return { error: '제목과 내용을 입력해 주세요.' };
  }
  if (title.length > 150) {
    return { error: '제목은 150자 이내로 입력해 주세요.' };
  }
  if (attachmentUrl && !/^https?:\/\//i.test(attachmentUrl)) {
    return { error: '자료 링크는 http:// 또는 https:// 로 시작해야 해요.' };
  }

  const article = await prisma.article.create({
    data: {
      userId: user.id,
      title,
      content,
      tags,
      attachmentUrl: attachmentUrl || null,
    },
    select: { id: true },
  });
  return { id: article.id };
}

export async function deleteArticle(formData: FormData) {
  const user = await getCurrentUser();
  if (!(await removeArticle(user, String(formData.get('id') ?? '')))) return;
  revalidatePath('/board');
  redirect('/board');
}

/** 작성자 본인이거나 관리자만 지운다 — 지웠으면 true */
async function removeArticle(user: Awaited<ReturnType<typeof getCurrentUser>>, id: string): Promise<boolean> {
  if (!user || !id) return false;
  const article = await prisma.article.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!article || (article.userId !== user.id && user.role !== 'ADMIN')) return false;
  await prisma.article.delete({ where: { id } });
  return true;
}

/* ------------------------------ 아이폰 앱(native/src/app/board) ------------------------------ */

const TO_LOGIN = { ok: false as const, to: '/login' };
/** 화면 날짜 — 서버(Vercel)는 UTC 로 돌아 시간대를 꼭 준다(웹 페이지와 같은 모양) */
const dateText = (d: Date, withTime = false) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);

/** 자료실 목록 — 웹 /board 와 같은 줄(새 글부터), 내용은 앞 200자만 */
export async function loadAppBoard() {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { nickname: true } } },
  });
  return {
    ok: true as const,
    canWrite: user.role === 'ADMIN',
    articles: articles.map((a) => ({
      id: a.id,
      title: a.title,
      preview: a.content.slice(0, 200),
      tags: a.tags,
      hasLink: a.attachmentUrl != null,
      nickname: a.user.nickname,
      date: dateText(a.createdAt),
      views: a.views,
    })),
  };
}

/** 글 하나 — 웹처럼 열 때 조회수를 올린다. 없으면 article: null */
export async function loadAppArticle(id: unknown) {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  const key = String(id ?? '');
  const exists = key ? await prisma.article.findUnique({ where: { id: key }, select: { id: true } }) : null;
  if (!exists) return { ok: true as const, article: null };
  const a = await prisma.article.update({
    where: { id: key },
    data: { views: { increment: 1 } },
    include: { user: { select: { nickname: true } } },
  });
  return {
    ok: true as const,
    article: {
      id: a.id,
      title: a.title,
      content: a.content,
      tags: a.tags,
      attachmentUrl: a.attachmentUrl,
      nickname: a.user.nickname,
      date: dateText(a.createdAt, true),
      views: a.views,
      canDelete: a.userId === user.id || user.role === 'ADMIN',
    },
  };
}

/** 앱에서 글 올리기(관리자) — 웹 createArticle 과 같은 거름. 신호가 끊겨도 던지지 않게 { ok: false, error } 로 */
export async function createAppArticle(input: { title?: unknown; content?: unknown; attachmentUrl?: unknown; tags?: unknown }) {
  const user = await getCurrentUser();
  const saved = await saveArticle(user, input ?? {});
  if ('error' in saved) return { ok: false as const, error: saved.error };
  revalidatePath('/board');
  return { ok: true as const, id: saved.id };
}

export async function deleteAppArticle(id: unknown) {
  const user = await getCurrentUser();
  if (!(await removeArticle(user, String(id ?? '')))) return { ok: false as const, error: '지우지 못했어요.' };
  revalidatePath('/board');
  return { ok: true as const };
}
