'use server';

import { revalidatePath } from 'next/cache';
import { canWriteIn, dugoutOf, OTHER_DUGOUT, YOUNG_ABROAD, youngAbroad } from '@/lib/community-country';
import { hasKoreaDugout } from '@/lib/country';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { appNow } from '@/lib/clock';
import { loadCommunityList, loadCommunityPost, loadRoomOlder } from '@/lib/community-load';
import { copyVideoTo, isOwnedBy } from '@/lib/storage';
import { isPhoneVideoPath } from '@/lib/phone-video-path';
import { isGalleryPath } from '@/lib/my-videos';
import { deleteUnreferenced } from '@/lib/video-refs';
import { buildCard } from '@/lib/community-cards';
import { ageFromBirthDate } from '@/lib/profile';
import { withJosa } from '@/lib/korean';
import { formatDateTime, relativeTime } from '@/components/community/community-format';
import { withInput, type FormValues } from '@/lib/form-values';
import { notify, notifyMany, type NotifyInput } from '@/lib/notify';
import {
  addRoomMessage,
  joinPost,
  leavePost,
  logModeration,
  maybeAutoHide,
  recentCount,
  refreshAnswerState,
  setTargetHidden,
  type ModKind,
} from '@/lib/community-ops';
import {
  APPEAL_MAX,
  HIDE_REASON_MAX,
  REPORT_DETAIL_MAX,
  COMMENT_BODY_MAX,
  POST_BODY_MAX,
  POST_TITLE_MAX,
  MEDIA_MAX,
  ROOM_MESSAGE_MAX,
  ROOM_OPEN_MS,
  changedFacts,
  isJoinStatus,
  isMediaPath,
  joinStatusLabel,
  parseMeetup,
  parseTeam,
  rateLimitError,
  readMeetupForm,
  isPostCategory,
  isPostTag,
  isReportReason,
  maskContacts,
  normalizeCategory,
  teamHasGame,
  teamKindOf,
  type PostCategory,
  type RateKind,
} from '@/lib/community';

/**
 * 커뮤니티 동작(2026-10-17 1판 — 틀) — 글 · 댓글 · 좋아요 · 신고 · 가리기.
 * 권한은 여기서 한 번 더 본다(화면이 단추를 숨겨도 주소로 부를 수 있다): 지우기는 글쓴이 · 관리자, 고치기는 글쓴이,
 * 가리기 · 신고 처리는 관리자만. 가린 글(hiddenAt)은 관리자 · 글쓴이 아니면 없는 글로 친다.
 * 2026-10-26: 참가는 정원 잠금(lib/community-ops.ts joinPost), 고치기 · 결과 · 신청 진행 · 저장 · 이의 제기 · 운영 기록 · 도배 막기.
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
  revalidatePath('/me/community');
}

/** 도배 막기 — 최근 수가 넘으면 그 말. 창은 DB 시각(실제)과 견준다 */
async function tooFast(kind: RateKind, userId: string) {
  return rateLimitError(kind, await recentCount(prisma, kind, userId, new Date()));
}

/** 둘 사이에 차단이 있나(어느 쪽이 막았든) — 댓글 · 참가 · 대화를 막을 때. 화면에는 누가 막았는지 드러내지 않는다 */
async function blockedBetween(a: string, b: string) {
  if (a === b) return false;
  return (
    (await prisma.communityBlock.count({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    })) > 0
  );
}

/** 같은 글 · 같은 말의 알림이 아직 안 읽힌 채 있으면 또 안 보낸다(댓글 · 대화가 잦아도 알림은 하나) */
async function notifyOnce(userIds: string[], input: NotifyInput) {
  for (const id of new Set(userIds)) {
    const waiting = await prisma.notification.findFirst({
      where: { userId: id, link: input.link ?? null, title: input.title, readAt: null },
      select: { id: true },
    });
    if (!waiting) await notify(id, input);
  }
}

// ── 글 ────────────────────────────────────────────────────────────────────

type PostDraft = {
  category: PostCategory;
  tag: string | null;
  title: string;
  body: string;
  media: string[];
  form: object | null;
  region: string | null;
  district: string | null;
  meetAt: Date | null;
  byStaff: boolean;
};

/**
 * 글 폼 읽기 — 쓰기 · 고치기가 같이 쓴다. before 는 고칠 글(날짜를 안 바꿨으면 지난 시각이어도 그대로 둔다 · 운영자 표시를 지킨다).
 */
function readPostForm(
  user: Me,
  formData: FormData,
  before?: { meetAt: Date | null; byStaff: boolean }
): { error: string } | { draft: PostDraft } {
  const category = normalizeCategory(field(formData, 'category'));
  /* 전화번호 · 카톡 아이디는 올릴 때 가린다(lib/community.ts maskContacts — 1:1 쪽지가 없는 곳, 미성년 보호) */
  const title = maskContacts(field(formData, 'title'));
  const body = maskContacts(field(formData, 'body'));

  if (!category) return { error: '게시판을 골라 주세요.' };
  const rawTag = field(formData, 'tag');
  if (rawTag && !isPostTag(category, rawTag)) return { error: '말머리를 다시 골라 주세요.' };
  const tag = rawTag || null;
  /* 사진 · 영상은 내 폴더에 올린 것만(남의 경로를 걸어 두면 그 사람 파일을 글과 함께 지울 수 있다) */
  const media = [...new Set(formData.getAll('media').map(String).filter(Boolean))];
  if (media.length > MEDIA_MAX) return { error: `사진 · 영상은 ${MEDIA_MAX}개까지 올릴 수 있어요.` };
  if (media.some((m) => !isOwnedBy(m, user.id) || !isMediaPath(m)))
    return { error: '사진 · 영상을 다시 올려 주세요.' };
  if (!title || !body) return { error: '제목과 내용을 적어 주세요.' };
  /* 번개 · 팀 홍보 · 선수 모집 양식 — 우리 동네 · 날짜로 거르는 칸은 따로(region · district · meetAt) */
  const get = (name: string) => field(formData, name);
  const getAll = (name: string) => formData.getAll(name).map(String);
  const extra =
    category === 'meetup'
      ? parseMeetup(get, appNow(), before?.meetAt)
      : category === 'team'
        ? parseTeam(get, getAll, tag, appNow(), before?.meetAt)
        : null;
  if (extra && 'error' in extra) return { error: extra.error };
  if (title.length > POST_TITLE_MAX)
    return { error: `제목은 ${POST_TITLE_MAX}자까지 적을 수 있어요.` };
  if (body.length > POST_BODY_MAX)
    return { error: `내용은 ${POST_BODY_MAX}자까지 적을 수 있어요.` };
  return {
    draft: {
      category,
      tag,
      title,
      body,
      media,
      form: extra?.form ?? null,
      region: extra?.region ?? null,
      district: extra?.district ?? null,
      meetAt: extra?.meetAt ?? null,
      /* 운영자 글 표시는 관리자만 켜고 끈다 */
      byStaff: user.role === 'ADMIN' ? field(formData, 'byStaff') === '1' : (before?.byStaff ?? false),
    },
  };
}

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
  const read = readPostForm(user, formData);
  if ('error' in read) return read;
  const d = read.draft;
  /* 쓴 사람의 나라 덕아웃에 박는다 — 고치기는 안 바꾼다(lib/community-country.ts). 번개 · 팀은 한국 지역 게시판이라 한국만 */
  const country = dugoutOf(user);
  if ((d.category === 'meetup' || d.category === 'team') && !hasKoreaDugout(country))
    return { error: '이 게시판은 한국 덕아웃에만 있어요.' };
  if (youngAbroad(country, user.birthDate ? ageFromBirthDate(user.birthDate) : null)) return { error: YOUNG_ABROAD };

  /*
   * 1분 안 같은 글이면 새로 안 만든다 — 저장은 됐는데 응답이 끊겨(앱 '신호가 약해 보내지 못했어요') 다시 누르면 같은 글이 둘 생겼다.
   * createdAt 은 DB 의 실제 시각이라 Date.now 와 견준다. 도배 막기보다 먼저(다시 보내기를 도배로 세지 않게).
   */
  const same = await prisma.communityPost.findFirst({
    where: {
      userId: user.id,
      category: d.category,
      title: d.title,
      body: d.body,
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
    select: { id: true },
  });
  if (same) return { id: same.id };
  const fast = await tooFast('post', user.id);
  if (fast) return { error: fast };

  /* 싱커 기록 카드 — 화면은 ref 만 보내고, 카드는 내 기록에서 다시 만든다(남의 기록 · 고친 숫자를 못 붙이게) */
  const cardRef = field(formData, 'card');
  const card = cardRef ? await buildCard(user.id, cardRef, field(formData, 'cardHide') === '1') : null;
  if (cardRef && !card) return { error: '붙인 기록을 찾지 못했어요. 다시 골라 주세요.' };

  const post = await prisma.communityPost.create({
    data: {
      userId: user.id,
      country,
      category: d.category,
      tag: d.tag,
      title: d.title,
      body: d.body,
      media: d.media,
      byStaff: d.byStaff,
      ...(card ? { card: card as unknown as Prisma.InputJsonValue } : {}),
      ...(d.form
        ? { form: d.form as Prisma.InputJsonValue, region: d.region, district: d.district, meetAt: d.meetAt }
        : {}),
    },
    select: { id: true },
  });

  revalidatePath('/community');
  revalidatePath('/me/community');
  return { id: post.id };
}

/**
 * 글 고치기(2026-10-26) — 글쓴이만. 게시판은 참가 · 신청 · 대화가 없을 때만, 팀 말머리는 신청이 없을 때만 바꾼다(흐름이 깨지지 않게).
 * 번개 인원은 이미 참가한 수보다 줄이지 못한다. 날짜 · 장소 · 비용 · 인원이 바뀌면 참가자 · 신청자에게 한 번씩 알린다.
 */
export async function updatePost(_prev: CommunityState, formData: FormData): Promise<CommunityState> {
  const done = await tryUpdatePost(await getCurrentUser(), formData);
  if ('id' in done) redirect(`/community/${done.id}`);
  return withInput(done, formData);
}

async function tryUpdatePost(user: Me | null, formData: FormData): Promise<{ error: string } | { id: string }> {
  if (!user) return { error: LOGIN_NEEDED };
  const id = field(formData, 'id');
  const post = await prisma.communityPost.findUnique({
    where: { id },
    select: {
      userId: true,
      category: true,
      tag: true,
      title: true,
      media: true,
      form: true,
      region: true,
      district: true,
      meetAt: true,
      byStaff: true,
      joins: { select: { userId: true } },
      _count: { select: { messages: true } },
    },
  });
  if (!post || post.userId !== user.id) return { error: '고칠 수 있는 글이 아니에요.' };
  const read = readPostForm(user, formData, post);
  if ('error' in read) return read;
  const d = read.draft;
  const joins = post.joins.length;

  if ((joins > 0 || post._count.messages > 0) && d.category !== post.category)
    return { error: '참가 · 신청한 사람이 있어 게시판은 바꿀 수 없어요.' };
  if (joins > 0 && post.category === 'team' && teamKindOf(d.tag) !== teamKindOf(post.tag))
    return { error: '신청한 사람이 있어 말머리는 바꿀 수 없어요.' };
  const capacity = d.category === 'meetup' ? readMeetupForm(d.form)?.capacity ?? 0 : null;
  if (capacity !== null && capacity < joins)
    return { error: `이미 ${joins}명이 참가해 모집 인원을 ${joins}명보다 적게 줄일 수 없어요.` };

  await prisma.communityPost.update({
    where: { id },
    data: {
      category: d.category,
      tag: d.tag,
      title: d.title,
      body: d.body,
      media: d.media,
      byStaff: d.byStaff,
      form: (d.form ?? Prisma.DbNull) as Prisma.InputJsonValue,
      region: d.region,
      district: d.district,
      meetAt: d.meetAt,
      editedAt: appNow(),
    },
  });
  /* 뺀 사진 · 영상 파일 — 글이 바뀐 뒤에, 다른 기록 · 글이 안 쓰는 것만(lib/video-refs.ts, 실패해도 고치기는 막지 않는다) */
  await deleteUnreferenced(post.media.filter((m) => !d.media.includes(m) && isOwnedBy(m, user.id)));

  const changed = changedFacts(
    { meetAt: post.meetAt, region: post.region, district: post.district, form: post.form as never },
    { meetAt: d.meetAt, region: d.region, district: d.district, form: d.form as never }
  );
  if (joins > 0 && changed.length > 0) {
    const last = changed[changed.length - 1];
    const what = [...changed.slice(0, -1), withJosa(last, '이/가')].join(' · ');
    await notifyMany(
      post.joins.map((j) => j.userId),
      {
        kind: 'community',
        title: `${post.category === 'meetup' ? '참가한 번개' : '신청한 글'}의 ${what} 바뀌었어요`,
        body: d.title,
        link: `/community/${id}`,
      }
    );
  }
  revalidatePost(id);
  return { id };
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
    select: { userId: true, category: true, title: true, media: true, meetAt: true, joins: { select: { userId: true } } },
  });
  /* 글쓴이 본인이거나 관리자만 — 댓글 · 좋아요 · 신고 · 참가 · 대화 · 저장은 Prisma 가 이어서 지운다(relationMode prisma) */
  if (!post || (post.userId !== user.id && user.role !== 'ADMIN')) return false;

  await prisma.communityPost.delete({ where: { id } });
  /* 사진 · 영상 파일도 — 글이 지워진 뒤에, 내 영상 · 기록 · 다른 글이 안 쓰는 것만(lib/video-refs.ts, 실패해도 글 지우기는 막지 않는다) */
  await deleteUnreferenced(post.media.filter((m) => isOwnedBy(m, post.userId)));
  /* 다가오는 모임이 사라지면 참가자는 알아야 한다(지난 모임은 조용히) */
  const upcoming = !post.meetAt || post.meetAt.getTime() > appNow().getTime();
  if (upcoming && post.joins.length > 0)
    await notifyMany(
      post.joins.map((j) => j.userId),
      { kind: 'community', title: post.category === 'meetup' ? '참가한 번개 글이 지워졌어요' : '신청한 글이 지워졌어요', body: post.title }
    );
  revalidatePost(id);
  return true;
}

// ── 좋아요 · 저장 ─────────────────────────────────────────────────────────

/** 한 번 누르면 켜고 다시 누르면 끈다 — 한 사람이 한 글에 한 번(복합 키 postId_userId) */
export async function toggleLike(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const postId = field(formData, 'postId');
  if (!postId) return;

  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { hiddenAt: true, country: true, userId: true },
  });
  /* 가린 글은 관리자만 보이므로 좋아요도 관리자만 — 주소로 바로 부르는 것을 막는다. 다른 나라 덕아웃 글은 읽기만(lib/community-country.ts) */
  if (!post || (post.hiddenAt && user.role !== 'ADMIN') || !canWriteIn(post, user)) return;

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

/**
 * 저장 · 저장 풀기(2026-10-26, 좋아요와 따로 — 나만 보는 모음). 바라는 상태(saved '1' | '0')로 받아 두 번 눌러도 결과가 같다.
 */
export async function setSaved(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const postId = field(formData, 'postId');
  const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { hiddenAt: true, userId: true, country: true } });
  if (!post || (post.hiddenAt && user.role !== 'ADMIN' && post.userId !== user.id) || !canWriteIn(post, user)) return;
  if (field(formData, 'saved') === '1') {
    try {
      await prisma.communitySave.create({ data: { postId, userId: user.id } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
  } else {
    await prisma.communitySave.deleteMany({ where: { postId, userId: user.id } });
  }
  revalidatePath(`/community/${postId}`);
  revalidatePath('/me/community');
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
  const body = maskContacts(field(formData, 'body'));
  if (!postId) return { error: '글을 찾지 못했어요.' };
  if (!body) return { error: '댓글을 적어 주세요.' };
  if (body.length > COMMENT_BODY_MAX)
    return { error: `댓글은 ${COMMENT_BODY_MAX}자까지 적을 수 있어요.` };

  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { hiddenAt: true, userId: true, category: true, title: true, country: true },
  });
  if (!post || (post.hiddenAt && user.role !== 'ADMIN'))
    return { error: '글을 찾지 못했어요.' };
  if (!canWriteIn(post, user)) return { error: OTHER_DUGOUT };
  if (youngAbroad(dugoutOf(user), user.birthDate ? ageFromBirthDate(user.birthDate) : null)) return { error: YOUNG_ABROAD };
  if (await blockedBetween(user.id, post.userId)) return { error: '이 글에는 댓글을 달 수 없어요.' };

  /* 1분 안 같은 댓글이면 새로 안 만든다(끊긴 응답에 다시 보냄 — 글 만들기와 같은 까닭) */
  const same = await prisma.communityComment.findFirst({
    where: {
      postId,
      userId: user.id,
      body,
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
    select: { id: true },
  });
  if (!same) {
    const fast = await tooFast('comment', user.id);
    if (fast) return { error: fast };
    await prisma.communityComment.create({ data: { postId, userId: user.id, body } });
    if (post.category === 'question') await refreshAnswerState(prisma, postId);
    /* 글쓴이에게 알림(내 글에 내가 단 댓글은 빼고) — 질문이면 '답이 달렸어요'. 안 읽은 같은 알림이 있으면 또 안 보낸다 */
    if (post.userId !== user.id)
      await notifyOnce([post.userId], {
        kind: 'community',
        title: post.category === 'question' ? '내 질문에 답이 달렸어요' : '내 글에 댓글이 달렸어요',
        body: post.title,
        link: `/community/${postId}`,
      });
  }
  revalidatePath('/community');
  revalidatePath(`/community/${postId}`);
  revalidatePath('/me/community');
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
  /* 채택한 답이었으면 채택이 풀리고, 첫 답이었으면 답 상태가 다시 셈 된다 */
  await refreshAnswerState(prisma, comment.postId);
  revalidatePost(comment.postId);
}

// ── 질문 채택 ──────────────────────────────────────────────────────────────

/** 질문 글쓴이가 남의 답(댓글)을 채택한다 — 다시 누르면 풀린다. 채택되면 목록 · 글에 '해결됨' */
export async function acceptComment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const id = field(formData, 'id');
  if (!id) return;
  const comment = await prisma.communityComment.findUnique({
    where: { id },
    select: {
      userId: true,
      hiddenAt: true,
      post: { select: { id: true, userId: true, category: true, hiddenAt: true, acceptedCommentId: true } },
    },
  });
  const post = comment?.post;
  if (!comment || !post || post.category !== 'question' || post.userId !== user.id) return;
  if (comment.userId === user.id || comment.hiddenAt || post.hiddenAt) return;

  const accepting = post.acceptedCommentId !== id;
  await prisma.communityPost.update({
    where: { id: post.id },
    data: { acceptedCommentId: accepting ? id : null },
  });
  if (accepting)
    await notifyOnce([comment.userId], {
      kind: 'community',
      title: '내 답변이 채택됐어요',
      link: `/community/${post.id}`,
    });
  revalidatePost(post.id);
}

// ── 차단 ──────────────────────────────────────────────────────────────────

/** 사용자 차단 · 풀기 — 막은 사람의 글 · 댓글이 내 화면에서 안 보인다(상대는 모른다). userId · block('1' | '0') · back(돌아갈 주소) */
export async function setBlocked(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const target = field(formData, 'userId');
  if (!target || target === user.id) return;
  if (field(formData, 'block') === '1') {
    const exists = await prisma.user.findUnique({ where: { id: target }, select: { id: true } });
    if (!exists) return;
    await prisma.communityBlock.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: target } },
      create: { blockerId: user.id, blockedId: target },
      update: {},
    });
  } else {
    await prisma.communityBlock.deleteMany({ where: { blockerId: user.id, blockedId: target } });
  }
  revalidatePath('/community', 'layout');
  revalidatePath('/search');
}

// ── 번개 참가 · 팀 신청 · 마감 · 결과 · 글에 묶인 대화 ─────────────────────

/**
 * 참가(번개) · 신청(팀)과 그 취소 — 바라는 상태(want 'join' | 'leave')로 받는다. 예전 한 단추 뒤집기는 두 번 누르면 참가 → 취소가 됐다.
 * 정원 확인과 넣기는 한 묶음(lib/community-ops.ts joinPost — 글 줄 잠금). 알림은 실제로 새로 들어왔을 때만.
 */
export async function setJoin(_prev: CommunityState, formData: FormData): Promise<CommunityState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGIN_NEEDED };
  const postId = field(formData, 'postId');
  const now = appNow();
  if (field(formData, 'want') === 'leave') {
    const r = await leavePost(prisma, postId, user.id, now);
    if ('error' in r) return r;
    revalidatePost(postId);
    return undefined;
  }
  /* 다른 나라 덕아웃 글(한국 번개 · 팀)에는 참여하지 않는다 — 읽기만(lib/community-country.ts) */
  const target = await prisma.communityPost.findUnique({ where: { id: postId }, select: { country: true, userId: true } });
  if (target && !canWriteIn(target, user)) return { error: OTHER_DUGOUT };
  const r = await joinPost(
    prisma,
    postId,
    { id: user.id, age: user.birthDate ? ageFromBirthDate(user.birthDate) : null },
    now
  );
  if ('error' in r) return r;
  if (r.joined)
    await notify(r.post.userId, {
      kind: 'community',
      title:
        r.post.category === 'meetup' ? `${user.nickname} 님이 번개에 참가했어요` : `${user.nickname} 님이 신청했어요`,
      body: r.post.title,
      link: r.post.category === 'team' ? `/community/${postId}?thread=${user.id}` : `/community/${postId}`,
    });
  revalidatePost(postId);
  return undefined;
}

/** 마감 · 다시 열기 — 글쓴이만, 결과(모였어요 · 취소)를 남긴 글은 그대로 */
export async function setClosed(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const id = field(formData, 'id');
  const post = await prisma.communityPost.findUnique({ where: { id }, select: { userId: true, outcome: true } });
  if (!post || post.userId !== user.id || post.outcome) return;
  await prisma.communityPost.update({
    where: { id },
    data: { closedAt: field(formData, 'closed') === '1' ? appNow() : null },
  });
  revalidatePost(id);
}

/**
 * 모임 · 경기의 실제 결과(2026-10-26) — 글쓴이만. held(모였어요 · 경기했어요)는 시각이 지난 뒤, cancelled(취소)는 언제나. '' 는 되돌리기.
 * 참가 신청만으로 '성사'로 세지 않는다(운영 지표). 취소하면 참가자 · 신청자에게 알린다.
 */
export async function setOutcome(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const id = field(formData, 'id');
  const outcome = field(formData, 'outcome');
  if (outcome !== 'held' && outcome !== 'cancelled' && outcome !== '') return;
  const post = await prisma.communityPost.findUnique({
    where: { id },
    select: { userId: true, category: true, tag: true, title: true, meetAt: true, outcome: true, joins: { select: { userId: true } } },
  });
  if (!post || post.userId !== user.id) return;
  const gathers = post.category === 'meetup' || (post.category === 'team' && teamHasGame(teamKindOf(post.tag)));
  if (!gathers) return;
  const now = appNow();
  if (outcome === 'held' && (!post.meetAt || post.meetAt.getTime() > now.getTime())) return;
  await prisma.communityPost.update({
    where: { id },
    data: { outcome: outcome || null, outcomeAt: outcome ? now : null },
  });
  if (outcome === 'cancelled' && post.outcome !== 'cancelled' && post.joins.length > 0)
    await notifyMany(
      post.joins.map((j) => j.userId),
      {
        kind: 'community',
        title: post.category === 'meetup' ? '참가한 번개가 취소됐어요' : '신청한 경기가 취소됐어요',
        body: post.title,
        link: `/community/${id}`,
      }
    );
  revalidatePost(id);
}

/** 팀 신청 진행 — 글쓴이가 신청마다(접수 · 함께해요 · 이번엔 어려워요 · 진행 완료). 신청자에게 알린다 */
export async function setJoinStatus(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const postId = field(formData, 'postId');
  const target = field(formData, 'userId');
  const status = field(formData, 'status');
  if (!isJoinStatus(status)) return;
  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { userId: true, category: true, title: true },
  });
  if (!post || post.userId !== user.id || post.category !== 'team') return;
  const { count } = await prisma.communityJoin.updateMany({
    where: { postId, userId: target, status: { not: status } },
    data: { status, statusAt: appNow() },
  });
  if (count > 0)
    await notify(target, {
      kind: 'community',
      title: `신청 진행: ${joinStatusLabel(status)}`,
      body: post.title,
      link: `/community/${postId}`,
    });
  revalidatePost(postId);
}

/**
 * 글에 묶인 대화에 말하기 — 번개는 글쓴이 + 참가자 한 방(모임 다음 날 · 취소하면 닫힘), 팀은 신청자마다 글쓴이와 둘만(thread = 신청자).
 * 이 방은 연락을 나누는 곳이라 연락처를 가리지 않는다. clientId 로 다시 보내기를 하나로(응답이 끊겨도 말이 둘 생기지 않게).
 * 번개 방에서 누군가를 차단했다고 방을 막지 않는다(다른 참가자의 대화까지 막게 된다) — 막은 사람의 말만 내 화면에서 접는다.
 * 팀 둘만의 방은 둘 사이에 차단이 있으면 더 못 보낸다.
 */
export async function sendRoomMessage(_prev: CommunityState, formData: FormData): Promise<CommunityState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGIN_NEEDED };
  const postId = field(formData, 'postId');
  const body = field(formData, 'body');
  const clientId = field(formData, 'clientId').slice(0, 64) || null;
  if (!body) return { error: '말을 적어 주세요.' };
  if (body.length > ROOM_MESSAGE_MAX) return { error: `${ROOM_MESSAGE_MAX}자까지 적을 수 있어요.` };
  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: {
      userId: true,
      category: true,
      title: true,
      meetAt: true,
      outcome: true,
      hiddenAt: true,
      joins: { select: { userId: true } },
    },
  });
  if (!post || post.hiddenAt) return { error: '글을 찾지 못했어요.' };
  const joined = post.joins.map((j) => j.userId);
  const isAuthor = post.userId === user.id;
  const link = `/community/${postId}`;
  let thread: string | null = null;

  if (post.category === 'meetup') {
    if (!isAuthor && !joined.includes(user.id)) return { error: '참가한 사람만 말할 수 있어요.' };
    if (post.outcome === 'cancelled') return { error: '취소된 번개라 대화방이 닫혔어요.' };
    if (post.meetAt && appNow().getTime() > post.meetAt.getTime() + ROOM_OPEN_MS)
      return { error: '대화방이 닫혔어요.' };
  } else if (post.category === 'team') {
    thread = isAuthor ? field(formData, 'thread') : user.id;
    if (!joined.includes(thread)) return { error: isAuthor ? '신청한 사람을 찾지 못했어요.' : '먼저 신청해 주세요.' };
    if (await blockedBetween(post.userId, thread)) return { error: '이 대화는 더 이어갈 수 없어요.' };
  } else {
    return { error: '대화가 없는 글이에요.' };
  }
  /* 같은 번호의 다시 보내기는 도배로 세지 않는다 — 새 말에만 제한 */
  const known = clientId
    ? await prisma.communityMessage.findUnique({
        where: { senderId_clientId: { senderId: user.id, clientId } },
        select: { id: true },
      })
    : null;
  if (!known) {
    const fast = await tooFast('message', user.id);
    if (fast) return { error: fast };
  }
  const { created } = await addRoomMessage(prisma, { postId, thread, senderId: user.id, body, clientId });
  if (created) {
    if (post.category === 'meetup')
      await notifyOnce(
        [post.userId, ...joined].filter((id) => id !== user.id),
        { kind: 'community', title: '번개 대화방에 새 말이 있어요', body: post.title, link }
      );
    else
      await notifyOnce([isAuthor ? thread! : post.userId], {
        kind: 'community',
        title: isAuthor ? '팀에서 답이 왔어요' : `${user.nickname} 님이 말을 보냈어요`,
        body: post.title,
        link: isAuthor ? link : `${link}?thread=${user.id}`,
      });
  }
  revalidatePath(`/community/${postId}`);
  return undefined;
}

/** 대화의 이전 장 — 화면이 '이전 대화 보기'로 부른다. 볼 수 없으면 빈 장 */
export async function loadOlderRoomMessages(postId: unknown, thread: unknown, before: unknown) {
  const user = await getCurrentUser();
  if (!user || typeof postId !== 'string' || typeof before !== 'string') return { messages: [], hasOlder: false };
  return loadRoomOlder(user, postId, typeof thread === 'string' ? thread : undefined, before);
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
  const messageId = field(formData, 'messageId');
  const reason = field(formData, 'reason');
  const detail = field(formData, 'detail');
  if (detail.length > REPORT_DETAIL_MAX)
    return { error: `신고 내용은 ${REPORT_DETAIL_MAX}자까지 적을 수 있어요.` };

  if (!isReportReason(reason)) return { error: '신고 이유를 골라 주세요.' };
  /* 글 · 댓글 · 대화의 말 가운데 하나만 */
  if ([postId, commentId, messageId].filter(Boolean).length !== 1)
    return { error: '신고할 글을 찾지 못했어요.' };

  let kind: ModKind;
  let target: { userId: string } | null;
  if (messageId) {
    kind = 'message';
    /* 그 대화를 볼 수 있는 사람만(글쓴이 · 참가자 · 그 신청자) — 남의 방 말 번호로 신고하지 못하게 */
    const m = await prisma.communityMessage.findUnique({
      where: { id: messageId },
      select: { senderId: true, threadUserId: true, post: { select: { userId: true, joins: { select: { userId: true } } } } },
    });
    const member =
      m &&
      (m.post.userId === user.id ||
        (m.threadUserId ? m.threadUserId === user.id : m.post.joins.some((j) => j.userId === user.id)));
    target = m && member ? { userId: m.senderId } : null;
  } else if (commentId) {
    kind = 'comment';
    target = await prisma.communityComment.findUnique({ where: { id: commentId }, select: { userId: true } });
  } else {
    kind = 'post';
    target = await prisma.communityPost.findUnique({ where: { id: postId }, select: { userId: true } });
  }
  if (!target) return { error: '신고할 글을 찾지 못했어요.' };
  if (target.userId === user.id) return { error: '내가 쓴 글은 신고할 수 없어요.' };

  /* 같은 사람이 같은 것을 두 번 신고해도 한 건 — 표의 unique 가 막고, 이미 있으면 접수된 것으로 친다(도배 막기 전에) */
  const exists = await prisma.communityReport.findFirst({
    where: { reporterId: user.id, postId: kind === 'post' ? postId : undefined, commentId: kind === 'comment' ? commentId : undefined, messageId: kind === 'message' ? messageId : undefined },
    select: { id: true },
  });
  if (exists) return { done: true };
  const fast = await tooFast('report', user.id);
  if (fast) return { error: fast };
  try {
    await prisma.communityReport.create({
      data: {
        reporterId: user.id,
        postId: kind === 'post' ? postId : null,
        commentId: kind === 'comment' ? commentId : null,
        messageId: kind === 'message' ? messageId : null,
        reason,
        detail: detail || null,
      },
    });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'))
      throw e;
  }
  /* 기준을 넘으면 운영자가 보기 전 잠시 가린다(lib/community.ts AUTO_HIDE) */
  const id = kind === 'post' ? postId : kind === 'comment' ? commentId : messageId;
  if (await maybeAutoHide(prisma, kind, id, appNow())) {
    if (kind === 'comment') {
      const c = await prisma.communityComment.findUnique({ where: { id }, select: { postId: true } });
      if (c) {
        await refreshAnswerState(prisma, c.postId);
        revalidatePost(c.postId);
      }
    } else if (kind === 'post') revalidatePost(id);
  }

  revalidatePath('/admin/community');
  return { done: true };
}

// ── 운영자 — 가리기 · 신고 처리 ───────────────────────────────────────────

/**
 * 글 · 댓글 · 대화의 말 가리기와 되살리기 하나로 — kind('post' | 'comment' | 'message') · id · hidden('1' | '0') · reason(선택).
 * 지우지 않고 가린다 — 신고가 잘못됐을 때 되살릴 수 있어야 하고, 글쓴이의 다른 글 · 댓글은 그대로 둬야 한다. 누가 · 언제 · 왜는 운영 기록에.
 */
export async function setHidden(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') return;

  const kind = field(formData, 'kind');
  const id = field(formData, 'id');
  const hidden = field(formData, 'hidden') === '1';
  const reason = field(formData, 'reason').slice(0, HIDE_REASON_MAX);
  if (!id || (kind !== 'post' && kind !== 'comment' && kind !== 'message')) return;

  await setTargetHidden(prisma, { kind, id, hidden, reason, actorId: user.id }, appNow());
  if (kind === 'post') revalidatePost(id);
  else {
    const row =
      kind === 'comment'
        ? await prisma.communityComment.findUnique({ where: { id }, select: { postId: true } })
        : await prisma.communityMessage.findUnique({ where: { id }, select: { postId: true } });
    if (!row) return;
    if (kind === 'comment') await refreshAnswerState(prisma, row.postId);
    revalidatePost(row.postId);
  }
}

/** 신고 처리 — 대상이 가려져 있으면 '가림'(actioned), 아니면 '문제 없음'(dismissed). 문제없는 신고를 되풀이하는 사람은 자동 가림에서 덜 센다 */
export async function resolveReport(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') return;
  const id = field(formData, 'id');
  if (!id) return;

  const report = await prisma.communityReport.findUnique({
    where: { id },
    select: {
      postId: true,
      commentId: true,
      messageId: true,
      listingId: true,
      post: { select: { hiddenAt: true } },
      comment: { select: { hiddenAt: true } },
      message: { select: { hiddenAt: true } },
      listing: { select: { hiddenAt: true } },
    },
  });
  if (!report) return;
  const target = report.post ?? report.comment ?? report.message ?? report.listing;
  await prisma.communityReport.update({
    where: { id },
    data: { resolvedAt: appNow(), outcome: target?.hiddenAt ? 'actioned' : 'dismissed' },
  });
  const kind: ModKind | null = report.postId ? 'post' : report.commentId ? 'comment' : report.messageId ? 'message' : null;
  const targetId = report.postId ?? report.commentId ?? report.messageId;
  if (kind && targetId)
    await logModeration(prisma, {
      kind,
      targetId,
      action: 'resolve',
      reason: target?.hiddenAt ? '가린 채 처리' : '문제 없음으로 처리',
      actorId: user.id,
    });
  revalidatePath('/admin/community');
}

/**
 * 이의 제기(2026-10-26) — 운영자가 가린 내 글 · 댓글에 한 번. 운영자가 다시 보기 전에는 또 못 낸다. 운영자에게 알림.
 */
export async function appealHidden(_prev: ReportState, formData: FormData): Promise<ReportState> {
  const user = await getCurrentUser();
  if (!user) return { error: LOGIN_NEEDED };
  const kind = field(formData, 'kind');
  const id = field(formData, 'id');
  const reason = field(formData, 'reason');
  if (kind !== 'post' && kind !== 'comment') return { error: '이의를 낼 글을 찾지 못했어요.' };
  if (!reason) return { error: '왜 다시 봐야 하는지 적어 주세요.' };
  if (reason.length > APPEAL_MAX) return { error: `${APPEAL_MAX}자까지 적을 수 있어요.` };
  const target =
    kind === 'post'
      ? await prisma.communityPost.findUnique({ where: { id }, select: { userId: true, hiddenAt: true, id: true } })
      : await prisma.communityComment.findUnique({ where: { id }, select: { userId: true, hiddenAt: true, postId: true } });
  if (!target || target.userId !== user.id || !target.hiddenAt) return { error: '이의를 낼 수 있는 글이 아니에요.' };
  const last = await prisma.communityModeration.findFirst({
    where: { kind, targetId: id },
    orderBy: { createdAt: 'desc' },
    select: { action: true },
  });
  if (last?.action === 'appeal') return { done: true };
  await logModeration(prisma, { kind, targetId: id, action: 'appeal', reason, actorId: user.id });
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await notifyOnce(
    admins.map((a) => a.id),
    { kind: 'community', title: '커뮤니티 이의 제기가 들어왔어요', link: '/admin/community?view=appeals' }
  );
  revalidatePath('/admin/community');
  revalidatePath(`/community/${'postId' in target ? target.postId : target.id}`);
  return { done: true };
}

/**
 * 이의 제기 처리 — 운영자가 다시 보고 되살리거나(restore) 그대로 둔다(keep). 글쓴이에게 결과를 알린다. 기록은 운영 기록에.
 */
export async function reviewAppeal(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') return;
  const kind = field(formData, 'kind');
  const id = field(formData, 'id');
  const decision = field(formData, 'decision');
  if ((kind !== 'post' && kind !== 'comment') || (decision !== 'restore' && decision !== 'keep')) return;
  const target =
    kind === 'post'
      ? await prisma.communityPost.findUnique({ where: { id }, select: { userId: true, id: true } })
      : await prisma.communityComment.findUnique({ where: { id }, select: { userId: true, postId: true } });
  if (!target) return;
  const postId = 'postId' in target ? target.postId : target.id;
  const now = appNow();
  if (decision === 'restore') {
    await setTargetHidden(prisma, { kind, id, hidden: false, reason: '이의 제기를 받아 되살림', actorId: user.id }, now);
    if (kind === 'comment') await refreshAnswerState(prisma, postId);
  } else {
    await logModeration(prisma, { kind, targetId: id, action: 'resolve', reason: '이의 제기 확인 · 가림 유지', actorId: user.id });
  }
  await notify(target.userId, {
    kind: 'community',
    title: decision === 'restore' ? '이의 제기를 받아 다시 보이게 했어요' : '이의 제기를 확인했어요. 가림은 그대로예요',
    link: `/community/${postId}`,
  });
  revalidatePost(postId);
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
    /* 앱 입구 모양은 예전 그대로(scripts/native-api-shapes.json) — 새 칸(말머리 · 사진 …)은 웹 화면만 쓴다 */
    posts: list.posts.map((p) => ({
      id: p.id,
      category: p.category,
      title: p.title,
      preview: p.preview,
      hidden: p.hidden,
      nickname: p.nickname,
      likes: p.likes,
      comments: p.comments,
      ago: relativeTime(p.createdAt),
    })),
  };
}

/** 글 하나 — 없거나 볼 수 없으면 post: null */
export async function loadAppCommunityPost(id: unknown) {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  const post = await loadCommunityPost(user, String(id ?? ''));
  if (!post) return { ok: true as const, post: null };
  /* 앱 입구 모양은 예전 그대로(목록과 같은 까닭) */
  return {
    ok: true as const,
    post: {
      id: post.id,
      category: post.category,
      title: post.title,
      body: post.body,
      nickname: post.nickname,
      hidden: post.hidden,
      isAdmin: post.isAdmin,
      liked: post.liked,
      likes: post.likes,
      commentCount: post.commentCount,
      canLike: post.canLike,
      canComment: post.canComment,
      canDelete: post.canDelete,
      canReport: post.canReport,
      at: formatDateTime(post.createdAt),
      comments: post.comments.map((c) => ({
        id: c.id,
        body: c.body,
        nickname: c.nickname,
        hidden: c.hidden,
        mine: c.mine,
        canDelete: c.canDelete,
        canReport: c.canReport,
        ago: relativeTime(c.createdAt),
      })),
    },
  };
}

export async function createAppPost(input: {
  category?: unknown;
  title?: unknown;
  body?: unknown;
  /** 아래는 내 영상의 '덕아웃에 올리기'(2026-10-28) — 말머리 · 올린 공유용 사본 · 붙일 기록(pitch:<id>) · 숫자 숨기기 */
  tag?: unknown;
  media?: unknown;
  card?: unknown;
  cardHide?: unknown;
}) {
  const user = await getCurrentUser();
  const fd = new FormData();
  fd.set('category', String(input?.category ?? ''));
  fd.set('title', String(input?.title ?? ''));
  fd.set('body', String(input?.body ?? ''));
  if (typeof input?.tag === 'string') fd.set('tag', input.tag);
  if (Array.isArray(input?.media)) for (const m of input.media) if (typeof m === 'string') fd.append('media', m);
  if (typeof input?.card === 'string' && input.card) fd.set('card', input.card);
  if (input?.cardHide === true) fd.set('cardHide', '1');
  const made = await tryCreatePost(user, fd);
  return 'id' in made ? { ok: true as const, id: made.id } : fail(made);
}

/**
 * 서버에 있는 내 영상(관리자 · 서버 저장)을 덕아웃 공유용 사본으로 — 저장소 안 복사, 다시 안 올린다. 폰에만 있는 영상은 앱이 그 파일을 바로 올린다
 * (app/api/community/upload-url). 글은 개인 원본을 가리키지 않아, 내 영상을 지워도 글이 안 깨지고 글을 지워도 내 영상이 안 지워진다(설계 5-6).
 */
export async function copyShareVideo(path: unknown) {
  const user = await getCurrentUser();
  if (!user) return fail({ error: LOGIN_NEEDED });
  if (typeof path !== 'string' || !isOwnedBy(path, user.id) || isPhoneVideoPath(path) || !isGalleryPath(path))
    return fail({ error: '이 영상은 올릴 수 없어요.' });
  try {
    return { ok: true as const, path: await copyVideoTo(user.id, path) };
  } catch {
    return fail({ error: '영상을 준비하지 못했어요. 다시 해 주세요.' });
  }
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
  if (typeof postId !== 'string' || !postId || typeof liked !== 'boolean')
    return fail({ error: '다시 해 주세요.' });
  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: { hiddenAt: true, country: true, userId: true },
  });
  /* 가린 글은 관리자만 보이므로 좋아요도 관리자만(웹 toggleLike 와 같다) */
  if (!post || (post.hiddenAt && user.role !== 'ADMIN'))
    return fail({ error: '글을 찾을 수 없어요.' });
  if (!canWriteIn(post, user)) return fail({ error: OTHER_DUGOUT });
  if (liked) {
    try {
      await prisma.communityLike.create({ data: { postId, userId: user.id } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'))
        throw e;
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
