import { notFound } from 'next/navigation';
import { Check, Eye, EyeOff, UserMinus } from '@/components/icon';
import { RoundChat, RoundEyeOff, RoundHeart, RoundTrash } from '@/components/round-icon';
import { getCurrentUser } from '@/lib/dal';
import { loadCommunityPost, loadCommunityRoom } from '@/lib/community-load';
import { INJURY_NOTE, MEET_AGES, MEET_LEVELS, postCategoryLabel, postTagLabel } from '@/lib/community';
import {
  acceptComment,
  deleteComment,
  deletePost,
  setBlocked,
  setClosed,
  setHidden,
} from '@/app/actions/community';
import { BackLink, Badge, Button, ButtonLink } from '@/components/ui';
import { ConfirmDeleteForm } from '@/components/confirm-delete';
import { SafeForm } from '@/components/safe-form';
import { CommunityLikeButton } from '@/components/community/community-like-button';
import { CommunityReportForm } from '@/components/community/community-report-form';
import { CommunityCommentForm } from '@/components/community/community-comment-form';
import { CommunityRecordCard } from '@/components/community/community-record-card';
import { CommunityJoinButton } from '@/components/community/community-join-button';
import { CommunityRoom } from '@/components/community/community-room';
import Link from 'next/link';
import {
  categoryBadgeClass,
  formatDateTime,
  meetAtText,
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

/** 사용자 차단 — 묻고 막는다. 막으면 그 사람 글 · 댓글이 내 화면에서 안 보인다(상대는 모른다) */
function BlockButton({ userId, nickname, compact }: { userId: string; nickname: string; compact?: boolean }) {
  return (
    <ConfirmDeleteForm
      action={setBlocked}
      hidden={{ userId, block: '1' }}
      ariaLabel={`${nickname} 차단`}
      title={`${nickname} 님을 차단할까요?`}
      detail={<p className="text-muted">이 사람의 글 · 댓글이 내 화면에서 안 보여요. 상대는 몰라요. 커뮤니티 목록 맨 밑에서 풀 수 있어요.</p>}
      confirmLabel="차단"
      className={DELETE_BUTTON}
    >
      <UserMinus aria-hidden className="h-4 w-4" />
      {compact ? <span className="sr-only">차단</span> : '차단'}
    </ConfirmDeleteForm>
  );
}

/**
 * 글 하나(2026-10-17 1판 — 틀) — 본문 · 좋아요 · 신고 · 댓글. 가린 글 · 댓글은 관리자에게만 흐리게 보인다.
 */
/** 양식 한 줄 — 비어 있으면 안 그린다 */
function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{value}</dd>
    </div>
  );
}

const timeText = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });

export default async function CommunityPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ thread?: string | string[] }>;
}) {
  const { id } = await params;
  const { thread: threadParam } = await searchParams;
  /*
   * 보기는 로그인 없이(2026-10-24 김민 — 휴대폰 브라우저로 온 사람도 읽는다). 앱 웹뷰도 이 화면 그대로 — 앱 화면으로 넘기던
   * OpenNative 를 걷었다(커뮤니티는 웹 하나로).
   */
  const user = await getCurrentUser();

  /*
   * 읽기 · 누가 무엇을 누를 수 있나는 앱 화면과 같은 곳(lib/community-load.ts). 가린 글은 관리자와 글쓴이만 — 글쓴이는 왜 안 보이는지
   * 알아야 한다(아래 배지). 남은 notFound
   */
  const post = await loadCommunityPost(user, id);
  if (!post) notFound();

  const isAdmin = post.isAdmin;
  const postHidden = post.hidden;
  const visibleComments = post.commentCount;
  const tagLabel = postTagLabel(post.category, post.tag);
  /* 글에 묶인 대화 — 글쓴이 · 참가자(번개) · 신청자(팀)만 */
  const room = post.joinable
    ? await loadCommunityRoom(user, post, typeof threadParam === 'string' ? threadParam : undefined)
    : null;

  if (post.authorBlocked) {
    return (
      <div className="stack-page mx-auto max-w-3xl">
        <BackLink href="/community">커뮤니티</BackLink>
        <div className="space-y-4 rounded-2xl bg-surface-2 px-(--block-pad) py-8 text-center">
          <p className="text-sm text-muted">차단한 사람의 글이에요.</p>
          <SafeForm action={setBlocked}>
            <input type="hidden" name="userId" value={post.userId} />
            <input type="hidden" name="block" value="0" />
            <Button type="submit" variant="secondary" size="sm">
              차단 풀고 보기
            </Button>
          </SafeForm>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-page mx-auto max-w-3xl">
      <BackLink href="/community">커뮤니티</BackLink>

      <article className={`selectable space-y-6 ${postHidden ? 'opacity-70' : ''}`}>
        <header className="space-y-4 border-b border-line pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={categoryBadgeClass(post.category)}>
              {postCategoryLabel(post.category)}
            </Badge>
            {tagLabel && <span className="text-xs font-semibold text-muted">{tagLabel}</span>}
            {post.acceptedCommentId && (
              <Badge className="border-ok/40 bg-ok/10 text-ok desk:bg-transparent">해결됨</Badge>
            )}
            {postHidden && (
              <Badge className="gap-1 border-danger-line bg-danger-bg text-danger desk:bg-transparent">
                <RoundEyeOff aria-hidden className="h-3 w-3" />
                {isAdmin
                  ? '가림 — 관리자에게만 보여요'
                  : '운영자가 가렸어요 — 다른 사람에게는 보이지 않아요'}
              </Badge>
            )}
          </div>
          <h1 className="text-heading page-title text-ink">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="font-medium text-ink">{post.nickname}</span>
            {post.coach && <Badge className="min-h-0 border-sky-soft/60 bg-sky-tint px-2 py-0.5 text-sky-strong desk:bg-transparent">코치</Badge>}
            <time dateTime={post.createdAt.toISOString()}>
              {formatDateTime(post.createdAt)}
            </time>
          </div>
        </header>

        {post.tag === 'injury' && (
          <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn">{INJURY_NOTE}</p>
        )}

        <div className="whitespace-pre-wrap text-subhead leading-[1.9] text-ink/90">
          {post.body}
        </div>

        {(post.meetup || post.team) && (
          <section aria-label={post.meetup ? '번개 정보' : '팀 정보'} className="space-y-4 rounded-2xl bg-surface-2 p-(--block-pad)">
            <dl className="space-y-2">
              {post.meetup && (
                <>
                  <InfoRow label="언제" value={post.meetAt ? meetAtText(post.meetAt) : null} />
                  <InfoRow label="어디서" value={`${post.region ?? ''} · ${post.meetup.place}`} />
                  <InfoRow label="인원" value={`${post.joinCount} / ${post.meetup.capacity}명 참가`} />
                  <InfoRow label="실력" value={MEET_LEVELS.find((l) => l.key === post.meetup?.level)?.label} />
                  <InfoRow label="누가" value={MEET_AGES.find((a) => a.key === post.meetup?.age)?.label} />
                  <InfoRow label="준비물" value={post.meetup.gear} />
                  <InfoRow label="비용" value={post.meetup.cost} />
                </>
              )}
              {post.team && (
                <>
                  <InfoRow label="팀" value={post.team.team} />
                  <InfoRow label="지역" value={post.region} />
                  <InfoRow label="리그" value={post.team.league} />
                  <InfoRow label="연습" value={post.team.days.length ? `${post.team.days.join(' · ')}요일` : null} />
                  <InfoRow label="회비" value={post.team.fee} />
                  <InfoRow label="연령대" value={post.team.ages} />
                  <InfoRow label="신청" value={`${post.joinCount}명`} />
                </>
              )}
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              {(post.past || post.closed || post.full) && (
                <Badge className="border-line-strong text-muted">{post.past ? '지난 번개' : '마감'}</Badge>
              )}
              {!user && (
                <ButtonLink href={`/login?next=${encodeURIComponent(`/community/${post.id}`)}`} size="sm">
                  로그인하고 {post.meetup ? '참가하기' : '신청하기'}
                </ButtonLink>
              )}
              {user && !post.isOwner && (post.joined || !post.joinBlock) && (
                <CommunityJoinButton postId={post.id} meetup={post.meetup !== null} joined={post.joined} />
              )}
              {user && !post.isOwner && !post.joined && post.joinBlock && (
                <p className="text-sm text-muted">{post.joinBlock}</p>
              )}
              {post.isOwner && !post.past && (
                <SafeForm action={setClosed}>
                  <input type="hidden" name="id" value={post.id} />
                  <input type="hidden" name="closed" value={post.closed ? '0' : '1'} />
                  <Button type="submit" variant="secondary" size="sm">
                    {post.closed ? '다시 열기' : '마감하기'}
                  </Button>
                </SafeForm>
              )}
            </div>
            {post.joiners.length > 0 && post.meetup && (
              <p className="text-xs text-muted">참가: {post.joiners.map((j) => j.nickname).join(' · ')}</p>
            )}
          </section>
        )}

        {post.card && <CommunityRecordCard card={post.card} videoUrl={post.cardVideoUrl} />}

        {post.media.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {post.media.map((m) =>
              m.video ? (
                <video
                  key={m.url}
                  src={`${m.url}#t=0.001`}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-xl bg-black"
                />
              ) : (
                <a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소 */}
                  <img src={m.url} alt="" loading="lazy" className="w-full object-cover" />
                </a>
              )
            )}
          </div>
        )}

        {/* 동작 줄 — 좋아요 · 댓글 수 왼쪽, 신고 · 가리기 · 지우기 오른쪽 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          {/* 가린 글은 글쓴이도 좋아요를 못 누른다(서버 toggleLike 가 거절) — 단추 대신 수만(댓글 폼과 같은 조건) */}
          {!post.canLike ? (
            <span className="inline-flex min-h-10 items-center gap-1.5 px-3 text-sm text-muted tabular-nums">
              <RoundHeart aria-hidden className="h-4 w-4" />
              <span className="sr-only">좋아요 </span>
              {post.likes}
            </span>
          ) : (
            <CommunityLikeButton
              postId={post.id}
              liked={post.liked}
              count={post.likes}
            />
          )}
          <span className="inline-flex min-h-10 items-center gap-1.5 px-3 text-sm text-muted tabular-nums">
            <RoundChat aria-hidden className="h-4 w-4" />
            <span className="sr-only">댓글 </span>
            {visibleComments}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {post.canBlock && <BlockButton userId={post.userId} nickname={post.nickname} />}
            {isAdmin && <HideToggle kind="post" id={post.id} hidden={postHidden} />}
            {post.canDelete && (
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
                <RoundTrash aria-hidden className="h-4 w-4" />
                지우기
              </ConfirmDeleteForm>
            )}
          </div>
        </div>
        {/* 신고 폼은 펼치면 폭을 다 쓰므로 동작 줄 밑에 따로 — 내 글은 신고하지 않는다 */}
        {post.canReport && <CommunityReportForm postId={post.id} />}
      </article>

      {room && (
        <section className="space-y-3" aria-labelledby="room-heading">
          <h2 id="room-heading" className="text-base font-semibold text-ink">
            {post.meetup ? '참가자 대화방' : post.isOwner ? '신청자와 대화' : '팀과 대화'}
          </h2>
          {post.team && post.isOwner && post.joiners.length > 1 && (
            <nav aria-label="신청자" className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {post.joiners.map((j) => (
                <Link
                  key={j.userId}
                  href={`/community/${post.id}?thread=${j.userId}`}
                  scroll={false}
                  data-nav="none"
                  aria-current={room.thread === j.userId ? 'page' : undefined}
                  className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold ${
                    room.thread === j.userId ? 'bg-sky text-white' : 'bg-ink/6 text-ink'
                  }`}
                >
                  {j.nickname}
                </Link>
              ))}
            </nav>
          )}
          <CommunityRoom
            postId={post.id}
            thread={post.team && post.isOwner ? room.thread : null}
            open={post.meetup ? post.roomOpen : true}
            empty={post.meetup ? '참가한 사람끼리 이야기하는 곳이에요. 모일 곳 · 시각을 맞춰 보세요.' : '궁금한 것을 물어보세요.'}
            messages={room.messages.map((m) => ({
              id: m.id,
              mine: m.mine,
              nickname: m.nickname,
              body: m.body,
              time: timeText.format(m.createdAt),
            }))}
          />
        </section>
      )}

      {/* 댓글 */}
      <section className="space-y-4" aria-labelledby="comments-heading">
        <h2 id="comments-heading" className="text-base font-semibold text-ink">
          댓글 <span className="text-muted tabular-nums">{visibleComments}</span>
        </h2>

        {post.comments.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {post.comments.map((c, i) => {
              const hidden = c.hidden;
              const mine = c.mine;
              return (
                <li
                  key={c.id}
                  style={{ '--row': i } as React.CSSProperties}
                  className={`selectable space-y-2 px-(--block-pad) py-4 motion-safe:animate-row-in ${hidden ? 'opacity-55' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span className="font-medium text-ink">{c.nickname}</span>
                    {c.coach && <Badge className="min-h-0 border-sky-soft/60 bg-sky-tint px-2 py-0.5 text-sky-strong desk:bg-transparent">코치</Badge>}
                    {mine && <Badge className="min-h-0 px-2 py-0.5">나</Badge>}
                    {c.accepted && (
                      <Badge className="min-h-0 gap-1 border-ok/40 bg-ok/10 px-2 py-0.5 text-ok desk:bg-transparent">
                        <Check aria-hidden className="h-3 w-3" />
                        채택
                      </Badge>
                    )}
                    {hidden && (
                      <Badge className="min-h-0 gap-1 border-danger-line bg-danger-bg px-2 py-0.5 text-danger desk:bg-transparent">
                        <RoundEyeOff aria-hidden className="h-3 w-3" />
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
                    {c.canAccept && (
                      <SafeForm action={acceptComment}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="ghost" size="sm" className="gap-1.5 px-3">
                          <Check aria-hidden className="h-4 w-4" />
                          {c.accepted ? '채택 풀기' : '채택하기'}
                        </Button>
                      </SafeForm>
                    )}
                    {c.canBlock && <BlockButton userId={c.userId} nickname={c.nickname} compact />}
                    {isAdmin && <HideToggle kind="comment" id={c.id} hidden={hidden} />}
                    {c.canReport && <CommunityReportForm commentId={c.id} compact />}
                    {c.canDelete && (
                      <ConfirmDeleteForm
                        action={deleteComment}
                        hidden={{ id: c.id }}
                        ariaLabel="댓글 삭제"
                        title="이 댓글을 지울까요?"
                        detail={<p className="text-muted">되돌릴 수 없어요.</p>}
                        className={DELETE_BUTTON}
                      >
                        <RoundTrash aria-hidden className="h-4 w-4" />
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
        {post.canComment && <CommunityCommentForm postId={post.id} />}
        {!user && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-(--block-pad) py-4">
            <p className="text-sm text-muted">로그인하면 댓글 · 좋아요를 남길 수 있어요.</p>
            <ButtonLink href={`/login?next=/community/${encodeURIComponent(post.id)}`} size="sm">
              로그인
            </ButtonLink>
          </div>
        )}
      </section>
    </div>
  );
}
