import { notFound } from 'next/navigation';
import { Eye, EyeOff, Heart, MessageCircle, Trash2 } from '@/components/icon';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { postCategoryLabel } from '@/lib/community';
import { deleteComment, deletePost, setHidden } from '@/app/actions/community';
import { BackLink, Badge, Button } from '@/components/ui';
import { ConfirmDeleteForm } from '@/components/confirm-delete';
import { SafeForm } from '@/components/safe-form';
import { CommunityLikeButton } from '@/components/community/community-like-button';
import { CommunityReportForm } from '@/components/community/community-report-form';
import { CommunityCommentForm } from '@/components/community/community-comment-form';
import {
  categoryBadgeClass,
  formatDateTime,
  relativeTime,
} from '@/components/community/community-format';

const DELETE_BUTTON =
  'inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted transition-colors hover:text-danger';

/** 관리자의 가리기 · 되살리기 — 서버 폼 하나(지우지 않고 가린다, app/actions/community.ts setHidden) */
function HideToggle({
  kind,
  id,
  hidden,
}: {
  kind: 'post' | 'comment';
  id: string;
  hidden: boolean;
}) {
  return (
    <SafeForm action={setHidden}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="hidden" value={hidden ? '0' : '1'} />
      <Button type="submit" variant="ghost" size="sm" className="gap-1.5 px-3">
        {hidden ? (
          <Eye aria-hidden className="h-4 w-4" />
        ) : (
          <EyeOff aria-hidden className="h-4 w-4" />
        )}
        {hidden ? '되살리기' : '가리기'}
      </Button>
    </SafeForm>
  );
}

/**
 * 글 하나(2026-10-17 1판 — 틀) — 본문 · 좋아요 · 신고 · 댓글. 가린 글 · 댓글은 관리자에게만 흐리게 보인다.
 */
export default async function CommunityPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';

  const post = await prisma.communityPost.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, nickname: true } },
      /* 내가 눌렀는지만 — 전체 수는 _count 로 */
      likes: { where: { userId: user.id }, select: { userId: true } },
      _count: { select: { likes: true } },
      comments: {
        where: isAdmin ? {} : { hiddenAt: null },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { nickname: true } } },
      },
    },
  });
  /* 가린 글은 관리자와 글쓴이만 — 글쓴이는 왜 안 보이는지 알아야 한다(아래 배지). 남은 notFound */
  if (!post || (post.hiddenAt && !isAdmin && post.userId !== user.id)) notFound();

  const isOwner = post.userId === user.id;
  const postHidden = post.hiddenAt !== null;
  /* 댓글 수는 가린 댓글을 빼고 — 목록의 수와 같아야 한다 */
  const visibleComments = post.comments.filter((c) => c.hiddenAt === null).length;

  return (
    <div className="stack-page mx-auto max-w-3xl">
      <BackLink href="/community">커뮤니티</BackLink>

      <article className={`selectable space-y-6 ${postHidden ? 'opacity-70' : ''}`}>
        <header className="space-y-4 border-b border-line pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={categoryBadgeClass(post.category)}>
              {postCategoryLabel(post.category)}
            </Badge>
            {postHidden && (
              <Badge className="gap-1 border-danger-line bg-danger-bg text-danger desk:bg-transparent">
                <EyeOff aria-hidden className="h-3 w-3" />
                {isAdmin
                  ? '가림 — 관리자에게만 보여요'
                  : '운영자가 가렸어요 — 다른 사람에게는 보이지 않아요'}
              </Badge>
            )}
          </div>
          <h1 className="text-heading page-title text-ink">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="font-medium text-ink">{post.user.nickname}</span>
            <time dateTime={post.createdAt.toISOString()}>
              {formatDateTime(post.createdAt)}
            </time>
          </div>
        </header>

        <div className="whitespace-pre-wrap text-subhead leading-[1.9] text-ink/90">
          {post.body}
        </div>

        {/* 동작 줄 — 좋아요 · 댓글 수 왼쪽, 신고 · 가리기 · 지우기 오른쪽 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          {/* 가린 글은 글쓴이도 좋아요를 못 누른다(서버 toggleLike 가 거절) — 단추 대신 수만(댓글 폼과 같은 조건) */}
          {postHidden && !isAdmin ? (
            <span className="inline-flex min-h-10 items-center gap-1.5 px-3 text-sm text-muted tabular-nums">
              <Heart aria-hidden className="h-4 w-4" />
              <span className="sr-only">좋아요 </span>
              {post._count.likes}
            </span>
          ) : (
            <CommunityLikeButton
              postId={post.id}
              liked={post.likes.length > 0}
              count={post._count.likes}
            />
          )}
          <span className="inline-flex min-h-10 items-center gap-1.5 px-3 text-sm text-muted tabular-nums">
            <MessageCircle aria-hidden className="h-4 w-4" />
            <span className="sr-only">댓글 </span>
            {visibleComments}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {isAdmin && <HideToggle kind="post" id={post.id} hidden={postHidden} />}
            {(isOwner || isAdmin) && (
              <ConfirmDeleteForm
                action={deletePost}
                hidden={{ id: post.id }}
                ariaLabel={`${post.title} 삭제`}
                title="이 글을 지울까요?"
                detail={
                  <div className="space-y-2">
                    <p>
                      <strong className="text-ink">{post.title}</strong>
                    </p>
                    <p className="text-muted">
                      댓글 · 좋아요도 함께 사라져요. 되돌릴 수 없어요.
                    </p>
                  </div>
                }
                className={DELETE_BUTTON}
              >
                <Trash2 aria-hidden className="h-4 w-4" />
                지우기
              </ConfirmDeleteForm>
            )}
          </div>
        </div>
        {/* 신고 폼은 펼치면 폭을 다 쓰므로 동작 줄 밑에 따로 — 내 글은 신고하지 않는다 */}
        {!isOwner && !postHidden && <CommunityReportForm postId={post.id} />}
      </article>

      {/* 댓글 */}
      <section className="space-y-4" aria-labelledby="comments-heading">
        <h2 id="comments-heading" className="text-base font-semibold text-ink">
          댓글 <span className="text-muted tabular-nums">{visibleComments}</span>
        </h2>

        {post.comments.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {post.comments.map((c, i) => {
              const hidden = c.hiddenAt !== null;
              const mine = c.userId === user.id;
              return (
                <li
                  key={c.id}
                  style={{ '--row': i } as React.CSSProperties}
                  className={`selectable space-y-2 px-(--block-pad) py-4 motion-safe:animate-row-in ${hidden ? 'opacity-55' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span className="font-medium text-ink">{c.user.nickname}</span>
                    {mine && <Badge className="min-h-0 px-2 py-0.5">나</Badge>}
                    {hidden && (
                      <Badge className="min-h-0 gap-1 border-danger-line bg-danger-bg px-2 py-0.5 text-danger desk:bg-transparent">
                        <EyeOff aria-hidden className="h-3 w-3" />
                        가림
                      </Badge>
                    )}
                    <time
                      dateTime={c.createdAt.toISOString()}
                      title={formatDateTime(c.createdAt)}
                    >
                      {relativeTime(c.createdAt)}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                    {c.body}
                  </p>
                  <div className="-mb-2 flex flex-wrap items-center justify-end gap-1">
                    {isAdmin && <HideToggle kind="comment" id={c.id} hidden={hidden} />}
                    {!mine && <CommunityReportForm commentId={c.id} compact />}
                    {(mine || isAdmin) && (
                      <ConfirmDeleteForm
                        action={deleteComment}
                        hidden={{ id: c.id }}
                        ariaLabel="댓글 삭제"
                        title="이 댓글을 지울까요?"
                        detail={<p className="text-muted">되돌릴 수 없어요.</p>}
                        className={DELETE_BUTTON}
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                        <span className="sr-only">지우기</span>
                      </ConfirmDeleteForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {post.comments.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line px-(--block-pad) py-6 text-center text-sm text-muted">
            아직 댓글이 없어요. 첫 댓글을 남겨 보세요.
          </p>
        )}

        {/* 가린 글에는 글쓴이도 댓글을 못 단다 — 아무도 못 보는 글이다 */}
        {!(postHidden && !isAdmin) && <CommunityCommentForm postId={post.id} />}
      </section>
    </div>
  );
}
