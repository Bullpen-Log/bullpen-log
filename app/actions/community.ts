'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { appNow } from '@/lib/clock';
import { loadCommunityList, loadCommunityPost } from '@/lib/community-load';
import { formatDateTime, relativeTime } from '@/components/community/community-format';
import { withInput, type FormValues } from '@/lib/form-values';
import {
  REPORT_DETAIL_MAX,
  COMMENT_BODY_MAX,
  POST_BODY_MAX,
  POST_TITLE_MAX,
  isPostCategory,
  isReportReason,
} from '@/lib/community';

/**
 * 커뮤니티 동작(2026-10-17 1판 — 틀) — 글 · 댓글 · 좋아요 · 신고 · 가리기.
 * 권한은 여기서 한 번 더 본다(화면이 단추를 숨겨도 주소로 부를 수 있다): 지우기는 글쓴이 · 관리자,
 * 가리기 · 신고 처리는 관리자만. 가린 글(hiddenAt)은 관리자 아니면 없는 글로 친다.
 */
export type CommunityState = { error?: string; values?: FormValues } | undefined;
/** 신고 폼은 끝난 뒤 '접수했어요'로 바뀌어야 해서 done 을 함께 돌려준다 */
export type ReportState =
  { error?: string; values?: FormValues; done?: boolean } | undefined;

type Me = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const LOGIN_NEEDED = '로그인이 필요해요.';
const field = (formData: FormData, name: string) =>
  String(formData.get(name) ?? '').trim();

/** 글 화면 · 목록 · 신고 관리가 함께 바뀌는 동작이 많아 한 줄로 */
function revalidatePost(postId: string) {
  revalidatePath('/community');
  revalidatePath(`/community/${postId}`);
  revalidatePath('/admin/community');
}

// ── 글 ────────────────────────────────────────────────────────────────────

export async function createPost(
  _prev: CommunityState,
  formData: FormData
): Promise<CommunityState> {
  const made = await tryCreatePost(await getCurrentUser(), formData);
  if ('id' in made) redirect(`/community/${made.id}`);
  /* 오류로 끝나면 쓰던 글을 돌려준다 — 길게 쓴 내용이 날아가면 안 된다 */
  return withInput(made, formData);
}

/** 글 만들기 — 웹(createPost)은 만든 글로 redirect, 앱(createAppPost)은 번호를 받아 그 글 화면을 연다 */
async function tryCreatePost(
  user: Me | null,
  formData: FormData
): Promise<{ error: string } | { id: string }> {
  if (!user) return { error: LOGIN_NEEDED };

  const category = field(formData, 'category');
  const title = field(formData, 'title');
  const body = field(formData, 'body');

  if (!isPostCategory(category)) return { error: '글 구분을 골라 주세요.' };
  if (!title || !body) return { error: '제목과 내용을 적어 주세요.' };
  if (title.length > POST_TITLE_MAX)
    return { error: `제목은 ${POST_TITLE_MAX}자까지 적을 수 있어요.` };
  if (body.length > POST_BODY_MAX)
    return { error: `내용은 ${POST_BODY_MAX}자까지 적을 수 있어요.` };

  /*
   * 1분 안 같은 글이면 새로 안 만든다 — 저장은 됐는데 응답이 끊겨(앱 '신호가 약해 보내지 못했어요') 다시 누르면 같은 글이 둘 생겼다.
   * createdAt 은 DB 의 실제 시각이라 Date.now 와 견준다.
   */
  const same = await prisma.communityPost.findFirst({
    where: { userId: user.id, category, title, body, createdAt: { gte: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (same) return { id: same.id };

  const post = await prisma.communityPost.create({
    data: { userId: user.id, category, title, body },
    select: { id: true },
  });

  revalidatePath('/community');
  return { id: post.id };
}

export async function deletePost(formData: FormData) {
  const user = await getCurrentUser();
  if (user && (await removePost(user, field(formData, 'id')))) redirect('/community');
}

/** 지웠으면 true — 웹(deletePost)은 목록으로 redirect, 앱(deleteAppPost)은 화면을 닫는다 */
async function removePost(user: Me, id: string) {
  if (!id) return false;
  const post = await prisma.communityPost.findUnique({
    where: { id },
    select: { userId: true },
  });
  /* 글쓴이 본인이거나 관리자만 — 댓글 · 좋아요 · 신고는 Prisma 가 이어서 지운다(relationMode prisma) */
  if (!post || (post.userId !== user.id && user.role !== 'ADMIN')) return false;

  await prisma.communityPost.delete({ where: { id } });
  revalidatePost(id);
  return true;
}

// ── 좋아요 ────────────────────────────────────────────────────────────────

/** 한 번 누르면 켜고 다시 누르면 끈다 — 한 사람이 한 글에 한 번(복합 키 postId_userId) */
export async function toggleLike(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const postId = field(formData, 'postId');
  if (!postId) return;

  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { hiddenAt: true },
  });
  /* 가린 글은 관리자만 보이므로 좋아요도 관리자만 — 주소로 바로 부르는 것을 막는다 */
  if (!post || (post.hiddenAt && user.role !== 'ADMIN')) return;

  /*
   * 읽고 쓰기가 아니라 '지우고, 없었으면 만들기' — 두 번 빠르게 누르면 둘째가 P2002(이미 있음) · P2025(이미 없음)로 던져
   * 하트가 엉뚱한 상태에 멈췄다. 지우기는 deleteMany(없어도 조용), 만들기는 이미 있음을 삼킨다.
   */
  const { count } = await prisma.communityLike.deleteMany({
    where: { postId, userId: user.id },
  });
  if (count === 0) {
    try {
      await prisma.communityLike.create({ data: { postId, userId: user.id } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'))
        throw e;
    }
  }

  revalidatePath('/community');
  revalidatePath(`/community/${postId}`);
}

// ── 댓글 ──────────────────────────────────────────────────────────────────

export async function addComment(
  _prev: CommunityState,
  formData: FormData
): Promise<CommunityState> {
  return withInput(await tryAddComment(formData), formData);
}

async function tryAddComment(formData: FormData): Promise<CommunityState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGIN_NEEDED };

  const postId = field(formData, 'postId');
  const body = field(formData, 'body');
  if (!postId) return { error: '글을 찾지 못했어요.' };
  if (!body) return { error: '댓글을 적어 주세요.' };
  if (body.length > COMMENT_BODY_MAX)
    return { error: `댓글은 ${COMMENT_BODY_MAX}자까지 적을 수 있어요.` };

  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { hiddenAt: true },
  });
  if (!post || (post.hiddenAt && user.role !== 'ADMIN'))
    return { error: '글을 찾지 못했어요.' };

  /* 1분 안 같은 댓글이면 새로 안 만든다(끊긴 응답에 다시 보냄 — 글 만들기와 같은 까닭) */
  const same = await prisma.communityComment.findFirst({
    where: { postId, userId: user.id, body, createdAt: { gte: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (!same) await prisma.communityComment.create({ data: { postId, userId: user.id, body } });
  revalidatePath('/community');
  revalidatePath(`/community/${postId}`);
  return undefined;
}

export async function deleteComment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const id = field(formData, 'id');
  if (!id) return;

  const comment = await prisma.communityComment.findUnique({
    where: { id },
    select: { userId: true, postId: true },
  });
  if (!comment || (comment.userId !== user.id && user.role !== 'ADMIN')) return;

  await prisma.communityComment.delete({ where: { id } });
  revalidatePost(comment.postId);
}

// ── 신고 ──────────────────────────────────────────────────────────────────

export async function reportTarget(
  _prev: ReportState,
  formData: FormData
): Promise<ReportState> {
  return withInput(await tryReport(formData), formData);
}

async function tryReport(formData: FormData): Promise<ReportState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGIN_NEEDED };

  const postId = field(formData, 'postId');
  const commentId = field(formData, 'commentId');
  const reason = field(formData, 'reason');
  const detail = field(formData, 'detail');
  if (detail.length > REPORT_DETAIL_MAX)
    return { error: `신고 내용은 ${REPORT_DETAIL_MAX}자까지 적을 수 있어요.` };

  if (!isReportReason(reason)) return { error: '신고 이유를 골라 주세요.' };
  /* 글 또는 댓글 하나 — 둘 다거나 둘 다 아니면 잘못 온 요청 */
  if (Boolean(postId) === Boolean(commentId))
    return { error: '신고할 글을 찾지 못했어요.' };

  const target = commentId
    ? await prisma.communityComment.findUnique({
        where: { id: commentId },
        select: { userId: true, postId: true },
      })
    : await prisma.communityPost.findUnique({
        where: { id: postId },
        select: { userId: true },
      });
  if (!target) return { error: '신고할 글을 찾지 못했어요.' };
  if (target.userId === user.id) return { error: '내가 쓴 글은 신고할 수 없어요.' };

  /* 같은 사람이 같은 글을 두 번 신고해도 한 건 — 표의 unique([reporterId, postId|commentId])가 막고, 이미 있으면 접수된 것으로 친다 */
  try {
    await prisma.communityReport.create({
      data: {
        reporterId: user.id,
        postId: commentId ? null : postId,
        commentId: commentId || null,
        reason,
        detail: detail || null,
      },
    });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'))
      throw e;
  }

  revalidatePath('/admin/community');
  return { done: true };
}

// ── 관리자 — 가리기 · 신고 처리 ───────────────────────────────────────────

/**
 * 글 · 댓글 가리기와 되살리기 하나로 — kind('post' | 'comment') · id · hidden('1' | '0').
 * 지우지 않고 가린다 — 신고가 잘못됐을 때 되살릴 수 있어야 하고, 글쓴이의 다른 글 · 댓글은 그대로 둬야 한다.
 */
export async function setHidden(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') return;

  const kind = field(formData, 'kind');
  const id = field(formData, 'id');
  const hiddenAt = field(formData, 'hidden') === '1' ? appNow() : null;
  if (!id) return;

  if (kind === 'post') {
    const post = await prisma.communityPost.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!post) return;
    await prisma.communityPost.update({ where: { id }, data: { hiddenAt } });
    revalidatePost(id);
  } else if (kind === 'comment') {
    const comment = await prisma.communityComment.findUnique({
      where: { id },
      select: { postId: true },
    });
    if (!comment) return;
    await prisma.communityComment.update({ where: { id }, data: { hiddenAt } });
    revalidatePost(comment.postId);
  }
}

export async function resolveReport(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') return;
  const id = field(formData, 'id');
  if (!id) return;

  const report = await prisma.communityReport.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!report) return;
  await prisma.communityReport.update({
    where: { id },
    data: { resolvedAt: appNow() },
  });
  revalidatePath('/admin/community');
}

// ── 아이폰 앱(native/src/app/community) ─────────────────────────────────────

/*
 * 앱은 FormData 서버 동작을 못 부른다(JSON rpc) — 같은 검사 · 같은 쓰기를 부르는 JSON 입구. 읽기는 웹 화면과 같은 곳
 * (lib/community-load.ts)에서 하고, 때는 웹과 같은 글(방금 · N분 전 · 날짜 시각)로 바꿔 보낸다.
 */
const TO_LOGIN = { ok: false, to: '/login' } as const;
const fail = (e: CommunityState | ReportState) => ({
  ok: false as const,
  error: e?.error ?? '처리하지 못했어요.',
});

/** 목록 — pages 는 앱이 더 보기로 이어 붙인 장 수(돌아오면 그만큼 다시 읽는다) */
export async function loadAppCommunity(
  category: unknown,
  sort: unknown,
  pages: unknown
) {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  const list = await loadCommunityList(user, {
    category: isPostCategory(category) ? category : undefined,
    sort: sort === 'hot' ? 'hot' : 'new',
    page: 1,
    pages: Math.floor(Number(pages)) || 1,
  });
  return {
    ok: true as const,
    hasMore: list.hasMore,
    posts: list.posts.map(({ createdAt, ...p }) => ({
      ...p,
      ago: relativeTime(createdAt),
    })),
  };
}

/** 글 하나 — 없거나 볼 수 없으면 post: null */
export async function loadAppCommunityPost(id: unknown) {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  const post = await loadCommunityPost(user, String(id ?? ''));
  if (!post) return { ok: true as const, post: null };
  const { createdAt, comments, ...rest } = post;
  return {
    ok: true as const,
    post: {
      ...rest,
      at: formatDateTime(createdAt),
      comments: comments.map(({ createdAt: at, ...c }) => ({
        ...c,
        ago: relativeTime(at),
      })),
    },
  };
}

export async function createAppPost(input: {
  category?: unknown;
  title?: unknown;
  body?: unknown;
}) {
  const user = await getCurrentUser();
  const fd = new FormData();
  fd.set('category', String(input?.category ?? ''));
  fd.set('title', String(input?.title ?? ''));
  fd.set('body', String(input?.body ?? ''));
  const made = await tryCreatePost(user, fd);
  return 'id' in made ? { ok: true as const, id: made.id } : fail(made);
}

export async function deleteAppPost(id: unknown) {
  const user = await getCurrentUser();
  if (!user) return fail({ error: LOGIN_NEEDED });
  return (await removePost(user, String(id ?? '')))
    ? { ok: true as const }
    : fail({ error: '지우지 못했어요.' });
}

/**
 * 앱 좋아요 — 켜기 · 끄기를 바라는 상태(liked)로 받고, 실제로 남은 상태 · 수를 돌려준다. 웹처럼 뒤집기로 하면 응답이 끊겼을 때 앱이 되돌린
 * 하트와 서버가 어긋났고, 가린 · 없는 글이면 웹 동작이 말없이 끝나 앱은 바뀐 줄 알았다. 같은 값을 두 번 보내도 결과는 같다.
 */
export async function setAppLike(postId: unknown, liked: unknown) {
  const user = await getCurrentUser();
  if (!user) return fail({ error: LOGIN_NEEDED });
  if (typeof postId !== 'string' || !postId || typeof liked !== 'boolean') return fail({ error: '다시 해 주세요.' });
  const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { hiddenAt: true } });
  /* 가린 글은 관리자만 보이므로 좋아요도 관리자만(웹 toggleLike 와 같다) */
  if (!post || (post.hiddenAt && user.role !== 'ADMIN')) return fail({ error: '글을 찾을 수 없어요.' });
  if (liked) {
    try {
      await prisma.communityLike.create({ data: { postId, userId: user.id } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
  } else {
    await prisma.communityLike.deleteMany({ where: { postId, userId: user.id } });
  }
  const likes = await prisma.communityLike.count({ where: { postId } });
  revalidatePath('/community');
  revalidatePath(`/community/${postId}`);
  return { ok: true as const, liked, likes };
}

export async function addAppComment(postId: unknown, body: unknown) {
  const user = await getCurrentUser();
  if (!user) return fail({ error: LOGIN_NEEDED });
  const fd = new FormData();
  fd.set('postId', String(postId ?? ''));
  fd.set('body', String(body ?? ''));
  const r = await tryAddComment(fd);
  return r?.error ? fail(r) : { ok: true as const };
}

export async function deleteAppComment(id: unknown) {
  const user = await getCurrentUser();
  if (!user) return fail({ error: LOGIN_NEEDED });
  const fd = new FormData();
  fd.set('id', String(id ?? ''));
  await deleteComment(fd);
  return { ok: true as const };
}

/** 신고 — 글(postId) 또는 댓글(commentId) 하나 */
export async function reportApp(input: {
  postId?: unknown;
  commentId?: unknown;
  reason?: unknown;
  detail?: unknown;
}) {
  const user = await getCurrentUser();
  if (!user) return fail({ error: LOGIN_NEEDED });
  const fd = new FormData();
  if (input?.postId) fd.set('postId', String(input.postId));
  if (input?.commentId) fd.set('commentId', String(input.commentId));
  fd.set('reason', String(input?.reason ?? ''));
  fd.set('detail', String(input?.detail ?? ''));
  const r = await tryReport(fd);
  return r?.done ? { ok: true as const } : fail(r);
}

/** 관리자의 가리기 · 되살리기(setHidden 이 관리자인지 다시 본다) */
export async function setAppHidden(kind: unknown, id: unknown, hidden: unknown) {
  const user = await getCurrentUser();
  if (!user) return fail({ error: LOGIN_NEEDED });
  const fd = new FormData();
  fd.set('kind', String(kind ?? ''));
  fd.set('id', String(id ?? ''));
  fd.set('hidden', hidden === true ? '1' : '0');
  await setHidden(fd);
  return { ok: true as const };
}
