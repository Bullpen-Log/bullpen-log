import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { surfaceOf } from '@/lib/app-env';
import { benchDate, meetupTagEn } from '@/lib/sinker-dugout-feed';
import { MeetupTicket } from '@/components/community/meetup-ticket';
import { Check, Eye, EyeOff, UserMinus } from '@/components/icon';
import { RoundChat, RoundEyeOff, RoundHeart, RoundPencil, RoundTrash } from '@/components/round-icon';
import { getCurrentUser } from '@/lib/dal';
import { loadCommunityPost, loadCommunityRoom } from '@/lib/community-load';
import {
  COACH_BADGE_NOTE,
  INJURY_NOTE,
  JOIN_STATUSES,
  MEET_AGES,
  MEET_LEVELS,
  STAFF_BADGE_NOTE,
  gatherStateLabel,
  headcountText,
  joinStatusLabel,
  postCategoryLabel,
  postTagLabel,
} from '@/lib/community';
import {
  acceptComment,
  deleteComment,
  deletePost,
  setBlocked,
  setClosed,
  setHidden,
  setJoinStatus,
  setOutcome,
} from '@/app/actions/community';
import { BackLink, Badge, Button, ButtonLink } from '@/components/ui';
import { DugoutPageHeader, SectionHead } from '@/components/dugout/ui';
import { ConfirmDeleteForm } from '@/components/confirm-delete';
import { SafeForm } from '@/components/safe-form';
import { CommunityLikeButton } from '@/components/community/community-like-button';
import { CommunityReportForm } from '@/components/community/community-report-form';
import { CommunityCommentForm } from '@/components/community/community-comment-form';
import { CommunityRecordCard } from '@/components/community/community-record-card';
import { CommunityJoinButton } from '@/components/community/community-join-button';
import { CommunityRoom } from '@/components/community/community-room';
import {
  ClearDraftOnArrival,
  CommunityAppealForm,
  CommunitySaveButton,
  CommunityShareButton,
} from '@/components/community/community-post-actions';
import Link from 'next/link';
import {
  categoryBadgeClass,
  formatDateTime,
  meetAtText,
  relativeTime,
} from '@/components/community/community-format';

const DELETE_BUTTON =
  'inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted transition-colors hover:text-danger';
const SMALL_PILL = 'inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold';
const COACH_BADGE = 'min-h-0 border-sky-soft/60 bg-sky-tint px-2 py-0.5 text-sky-strong desk:bg-transparent';

/** 운영자의 가리기 · 되살리기 — 가릴 때는 까닭 한 줄(글쓴이에게 보인다 · 운영 기록에 남는다) */
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
    <SafeForm action={setHidden} className="flex items-center gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="hidden" value={hidden ? '0' : '1'} />
      {!hidden && (
        <input
          name="reason"
          maxLength={200}
          placeholder="가린 까닭"
          aria-label="가린 까닭(글쓴이에게 보여요)"
          className="h-9 w-28 rounded-full border border-line bg-surface px-3 text-xs"
        />
      )}
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
      detail={
        <p className="text-muted">
          이 사람의 글 · 댓글이 내 화면에서 안 보이고, 서로의 글에 댓글 · 참가 · 둘만의 대화를 못 해요. 번개 단체방에서는 그 사람의 말만 접혀요. 상대는
          몰라요. 커뮤니티 목록 맨 밑에서 풀 수 있어요.
        </p>
      }
      confirmLabel="차단"
      className={DELETE_BUTTON}
    >
      <UserMinus aria-hidden className="h-4 w-4" />
      {compact ? <span className="sr-only">차단</span> : '차단'}
    </ConfirmDeleteForm>
  );
}

/** 코치 배지 — 조직 역할 표시일 뿐 자격 인증이 아니다(눌러 보거나 올려 두면 뜻이 뜬다, 댓글 위에도 한 줄) */
function CoachBadge() {
  return (
    <span title={COACH_BADGE_NOTE}>
      <Badge className={COACH_BADGE}>코치</Badge>
    </span>
  );
}

/** 양식 한 줄 — 비어 있으면 안 그린다 */
function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-20 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{value}</dd>
    </div>
  );
}

const STATE_BADGE: Record<string, string> = {
  open: 'border-ok/40 bg-ok/10 text-ok desk:bg-transparent',
  full: 'border-line-strong text-muted',
  closed: 'border-line-strong text-muted',
  cancelled: 'border-danger-line bg-danger-bg text-danger desk:bg-transparent',
  past: 'border-line-strong text-muted',
  held: 'border-sky-soft/60 bg-sky-tint text-sky-strong desk:bg-transparent',
};

/**
 * 글 하나(2026-10-17 1판 — 틀) — 본문 · 좋아요 · 신고 · 댓글. 가린 글 · 댓글은 관리자에게만 흐리게 보인다.
 * 2026-10-26: 고치기 · 저장 · 공유, 채택된 답을 위로, 번개 · 경기 결과(모였어요 · 취소), 팀 신청 진행, 가린 까닭 · 이의 제기, 대화 최근 장.
 */
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
  const sinkerApp = surfaceOf((await headers()).get('user-agent')) === 'sinker-app';

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
  const loginHref = (back: string) => `/login?next=${encodeURIComponent(back)}`;
  /* 글에 묶인 대화 — 글쓴이 · 참가자(번개) · 신청자(팀)만 */
  const room = post.joinable
    ? await loadCommunityRoom(user, post, typeof threadParam === 'string' ? threadParam : undefined)
    : null;
  const accepted = post.comments.find((c) => c.id === post.acceptedCommentId) ?? null;
  const anyCoach = post.coach || post.comments.some((c) => c.coach);
  const flow = post.teamFlow;
  const stateLabel = post.state ? gatherStateLabel(post.state, post.category, post.tag) : null;
  const canCloseToggle = post.isOwner && !post.outcome && (post.state === 'open' || post.state === 'closed' || post.state === 'full');

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
      <ClearDraftOnArrival />
      <BackLink href="/community">커뮤니티</BackLink>

      <article className={`selectable space-y-6 ${postHidden ? 'opacity-70' : ''}`}>
        <header className="space-y-4 border-b border-line pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={categoryBadgeClass(post.category)}>
              {postCategoryLabel(post.category)}
            </Badge>
            {tagLabel && <span className="text-xs font-semibold text-muted">{tagLabel}</span>}
            {post.byStaff && (
              <span title={STAFF_BADGE_NOTE}>
                <Badge className="border-ink/20 text-ink">운영</Badge>
              </span>
            )}
            {post.category === 'question' &&
              (post.acceptedCommentId || post.acceptedFromBlocked ? (
                <Badge className="border-ok/40 bg-ok/10 text-ok desk:bg-transparent">해결됨</Badge>
              ) : visibleComments === 0 ? (
                <Badge className="border-warn-line bg-warn-bg text-warn desk:bg-transparent">답변 기다림</Badge>
              ) : null)}
            {stateLabel && post.state && <Badge className={STATE_BADGE[post.state]}>{stateLabel}</Badge>}
            {postHidden && (
              <Badge className="gap-1 border-danger-line bg-danger-bg text-danger desk:bg-transparent">
                <RoundEyeOff aria-hidden className="h-3 w-3" />
                {isAdmin
                  ? '가림 — 관리자에게만 보여요'
                  : '운영자가 가렸어요 — 다른 사람에게는 보이지 않아요'}
              </Badge>
            )}
          </div>
          <DugoutPageHeader title={post.title} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="font-medium text-ink">{post.nickname}</span>
            {post.coach && <CoachBadge />}
            <time dateTime={post.createdAt.toISOString()}>
              {formatDateTime(post.createdAt)}
            </time>
            {post.editedAt && (
              <span title={formatDateTime(post.editedAt)}>· 고침 {relativeTime(post.editedAt)}</span>
            )}
          </div>
        </header>

        {/* 가린 까닭 · 이의 제기 — 글쓴이(와 관리자)에게만. 신고한 사람은 드러내지 않는다 */}
        {postHidden && post.moderation && (
          <div className="space-y-2 rounded-2xl border border-danger-line bg-danger-bg/40 px-(--block-pad) py-3 text-sm">
            <p className="text-ink">
              {post.moderation.auto ? '신고가 여러 건 들어와 운영자가 볼 때까지 잠시 가렸어요.' : '운영자가 이 글을 가렸어요.'}
              {post.moderation.reason && !post.moderation.auto && <> 까닭: {post.moderation.reason}</>}
            </p>
            {post.isOwner && (
              <>
                <p className="text-xs text-muted">
                  고쳐서 다시 보여 주고 싶으면 글을 고친 뒤 이의 제기를 보내 주세요.{' '}
                  <Link href="/community/guide" className="font-semibold text-sky">
                    운영 원칙
                  </Link>
                </p>
                <CommunityAppealForm kind="post" id={post.id} pending={post.moderation.appealPending} />
              </>
            )}
          </div>
        )}

        {post.tag === 'injury' && (
          <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn">{INJURY_NOTE}</p>
        )}

        <div className="whitespace-pre-wrap text-subhead leading-[1.9] text-ink/90">
          {post.body}
        </div>

        {/* 싱커 앱 안 — 참가한 번개의 내 티켓(서버가 참가를 읽은 뒤에만 선다, 참가 단추를 누른 순간이 아니다) */}
        {sinkerApp && post.meetup && post.joined && post.meetAt && user && (
          <MeetupTicket
            title={post.title}
            date={benchDate(post.meetAt)}
            tagEn={meetupTagEn(post.tag)}
            nickname={user.nickname}
            place={[post.district ?? post.region, post.meetup.place].filter(Boolean).join(' · ')}
            tone={
              post.state === 'cancelled' ? 'cancelled' : post.state === 'held' ? 'held' : post.state === 'past' ? 'past' : post.state === 'closed' ? 'closed' : 'joined'
            }
            gear={post.meetup.gear || null}
            cost={post.meetup.cost || null}
            roomHref={room ? '#room' : null}
          />
        )}

        {(post.meetup || post.team) && (
          <section aria-label={post.meetup ? '번개 정보' : '팀 정보'} className="space-y-4 rounded-2xl bg-surface-2 p-(--block-pad)">
            <dl className="space-y-2">
              {post.meetup && (
                <>
                  <InfoRow label="언제" value={post.meetAt ? meetAtText(post.meetAt) : null} />
                  <InfoRow label="어디서" value={[post.region, post.district, post.meetup.place].filter(Boolean).join(' · ')} />
                  <InfoRow label="인원" value={headcountText(post.joinCount, post.meetup.capacity)} />
                  <InfoRow label="실력" value={MEET_LEVELS.find((l) => l.key === post.meetup?.level)?.label} />
                  <InfoRow label="누가" value={MEET_AGES.find((a) => a.key === post.meetup?.age)?.label} />
                  <InfoRow label="준비물" value={post.meetup.gear} />
                  <InfoRow label="비용" value={post.meetup.cost} />
                </>
              )}
              {post.team && (
                <>
                  <InfoRow label="팀" value={post.team.team} />
                  <InfoRow label="지역" value={[post.region, post.district].filter(Boolean).join(' · ')} />
                  <InfoRow label="경기" value={post.meetAt ? meetAtText(post.meetAt) : null} />
                  <InfoRow label="구장" value={post.team.venue} />
                  <InfoRow
                    label="구장 확보"
                    value={post.team.venueReady === 'yes' ? '구장 있어요' : post.team.venueReady === 'no' ? '같이 찾아요' : null}
                  />
                  <InfoRow label={post.teamKind === 'seek' ? '포지션' : '모집 포지션'} value={post.team.positions.join(' · ')} />
                  <InfoRow label="몇 명" value={post.team.count ? `${post.team.count}명` : null} />
                  <InfoRow label={post.teamKind === 'seek' ? '경력' : '경력 조건'} value={post.team.career} />
                  <InfoRow label={post.teamKind === 'scrim' ? '팀 수준' : '실력'} value={post.team.level} />
                  <InfoRow label="리그" value={post.team.league} />
                  <InfoRow
                    label={post.teamKind === 'seek' ? '가능 요일' : '활동 요일'}
                    value={post.team.days.length ? `${post.team.days.join(' · ')}요일` : null}
                  />
                  <InfoRow label="일정" value={post.team.schedule} />
                  <InfoRow label="다닐 곳" value={post.team.areas} />
                  <InfoRow label={post.teamKind === 'scrim' ? '비용 분담' : '비용'} value={post.team.cost} />
                  <InfoRow label="회비" value={post.team.fee} />
                  <InfoRow label="연령대" value={post.team.ages} />
                  <InfoRow label={flow?.who ?? '신청'} value={`${post.joinCount}명`} />
                </>
              )}
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              {!user && post.state !== 'cancelled' && (
                <ButtonLink href={loginHref(`/community/${post.id}`)} size="sm">
                  로그인하고 {post.meetup ? '참가하기' : (flow?.apply ?? '신청하기')}
                </ButtonLink>
              )}
              {user && !post.isOwner && (post.joined || !post.joinBlock) && (
                <CommunityJoinButton
                  postId={post.id}
                  joined={post.joined}
                  applyLabel={post.meetup ? '참가하기' : (flow?.apply ?? '신청하기')}
                  cancelLabel={post.meetup ? '참가 취소' : (flow?.cancel ?? '신청 취소')}
                />
              )}
              {user && !post.isOwner && !post.joined && post.joinBlock && (
                <p className="text-sm text-muted">{post.joinBlock}</p>
              )}
              {post.team && post.joined && post.myJoinStatus && (
                <p className="text-sm text-ink">
                  {flow?.applied} · 진행: <strong>{joinStatusLabel(post.myJoinStatus)}</strong>
                </p>
              )}
              {canCloseToggle && (
                <SafeForm action={setClosed}>
                  <input type="hidden" name="id" value={post.id} />
                  <input type="hidden" name="closed" value={post.closed ? '0' : '1'} />
                  <Button type="submit" variant="secondary" size="sm">
                    {post.closed ? '다시 열기' : '마감하기'}
                  </Button>
                </SafeForm>
              )}
              {/* 결과 — 시각이 지나면 '모였어요 · 취소됐어요', 그 전에는 '취소'. 참가 신청만으로 성사로 세지 않는다 */}
              {post.isOwner && post.gathers && !post.outcome && post.state === 'past' && (
                <>
                  <SafeForm action={setOutcome}>
                    <input type="hidden" name="id" value={post.id} />
                    <input type="hidden" name="outcome" value="held" />
                    <Button type="submit" size="sm">
                      {post.meetup ? '모였어요' : '경기했어요'}
                    </Button>
                  </SafeForm>
                  <SafeForm action={setOutcome}>
                    <input type="hidden" name="id" value={post.id} />
                    <input type="hidden" name="outcome" value="cancelled" />
                    <Button type="submit" variant="secondary" size="sm">
                      못 했어요
                    </Button>
                  </SafeForm>
                </>
              )}
              {post.isOwner && post.gathers && !post.outcome && post.state !== 'past' && (
                <ConfirmDeleteForm
                  action={setOutcome}
                  hidden={{ id: post.id, outcome: 'cancelled' }}
                  ariaLabel="모임 취소"
                  title={post.meetup ? '이 번개를 취소할까요?' : '이 경기를 취소할까요?'}
                  detail={<p className="text-muted">참가 · 신청한 분들께 알림이 가고 대화방이 닫혀요.</p>}
                  confirmLabel="취소하기"
                  className={`${SMALL_PILL} bg-ink/6 text-ink`}
                >
                  {post.meetup ? '번개 취소' : '경기 취소'}
                </ConfirmDeleteForm>
              )}
              {post.isOwner && post.outcome && (
                <SafeForm action={setOutcome}>
                  <input type="hidden" name="id" value={post.id} />
                  <input type="hidden" name="outcome" value="" />
                  <Button type="submit" variant="ghost" size="sm">
                    결과 되돌리기
                  </Button>
                </SafeForm>
              )}
            </div>
            {post.state === 'past' && !post.isOwner && (
              <p className="text-xs text-muted">시각이 지났어요. 글쓴이가 결과를 남기면 여기 보여요.</p>
            )}
            {post.joiners.length > 0 && post.meetup && (
              <p className="text-xs text-muted">참가: {post.joiners.map((j) => j.nickname).join(' · ')}</p>
            )}
            {/* 팀 — 글쓴이가 신청마다 진행을 남긴다(신청자는 '마이 › 커뮤니티 활동'에서 다시 본다) */}
            {post.team && post.isOwner && post.joiners.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {post.joiners.map((j) => (
                  <li key={j.userId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <Link href={`/community/${post.id}?thread=${j.userId}`} scroll={false} data-nav="none" className="font-semibold text-ink">
                      {j.nickname}
                    </Link>
                    <span className="text-xs text-muted">{joinStatusLabel(j.status)}</span>
                    <span className="ml-auto flex flex-wrap gap-1">
                      {JOIN_STATUSES.filter((s) => s.key !== 'applied' && s.key !== j.status).map((s) => (
                        <SafeForm key={s.key} action={setJoinStatus}>
                          <input type="hidden" name="postId" value={post.id} />
                          <input type="hidden" name="userId" value={j.userId} />
                          <input type="hidden" name="status" value={s.key} />
                          <button type="submit" className={`${SMALL_PILL} bg-ink/6 text-ink hover:bg-ink/10`}>
                            {s.label}
                          </button>
                        </SafeForm>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
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

        {/* 동작 줄 — 좋아요 · 댓글 수 · 저장 · 공유 왼쪽, 고치기 · 차단 · 가리기 · 지우기 오른쪽 */}
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
          {post.canSave && <CommunitySaveButton postId={post.id} saved={post.saved} />}
          {post.shareable && <CommunityShareButton title={post.title} path={`/community/${post.id}`} />}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {post.canEdit && (
              <Link href={`/community/${post.id}/edit`} className={`${DELETE_BUTTON} hover:text-ink`}>
                <RoundPencil aria-hidden className="h-4 w-4" />
                고치기
              </Link>
            )}
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
                      댓글 · 좋아요 · 참가 · 대화도 함께 사라져요. 되돌릴 수 없어요.
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
        <section id="room" className="scroll-mt-20 space-y-4" aria-label="대화">
          <SectionHead
            title={post.meetup ? '참가자 대화방' : post.isOwner ? (flow?.ownerRoom ?? '신청자와 대화') : (flow?.joinerRoom ?? '팀과 대화')}
          />
          {post.team && post.isOwner && post.joiners.length > 1 && (
            <nav aria-label={flow?.who ?? '신청자'} className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {post.joiners.map((j) => (
                <Link
                  key={j.userId}
                  href={`/community/${post.id}?thread=${j.userId}`}
                  scroll={false}
                  data-nav="none"
                  aria-current={room.thread === j.userId ? 'page' : undefined}
                  className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold ${
                    room.thread === j.userId ? 'bg-ink text-page' : 'bg-ink/6 text-ink'
                  }`}
                >
                  {j.nickname}
                </Link>
              ))}
            </nav>
          )}
          <CommunityRoom
            /* 신청자를 바꾸면 새 방 — 쌓아 둔 말을 버린다 */
            key={room.thread ?? 'meetup'}
            postId={post.id}
            thread={post.team && post.isOwner ? room.thread : null}
            hasOlder={room.hasOlder}
            canWrite={room.canWrite}
            closedNote={room.closedNote}
            empty={post.meetup ? '참가한 사람끼리 이야기하는 곳이에요. 모일 곳 · 시각을 맞춰 보세요.' : '궁금한 것을 물어보세요.'}
            messages={room.messages}
          />
        </section>
      )}

      {/* 채택된 답 — 질문 바로 밑에서 먼저 보이게(댓글 목록에도 그대로 있다) */}
      {accepted && (
        <section aria-label="채택된 답" className="space-y-2 rounded-2xl border border-ok/40 bg-ok/5 px-(--block-pad) py-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ok">
            <Check aria-hidden className="h-3.5 w-3.5" />
            채택된 답 · {accepted.nickname}
            {accepted.coach && <CoachBadge />}
          </p>
          <p className="selectable whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{accepted.body}</p>
          <a href={`#c-${accepted.id}`} className="text-xs text-muted">
            댓글에서 보기
          </a>
        </section>
      )}
      {post.acceptedFromBlocked && (
        <p className="rounded-2xl bg-surface-2 px-(--block-pad) py-3 text-sm text-muted">채택된 답은 내가 차단한 사람의 답이라 안 보여요.</p>
      )}

      {/* 댓글 */}
      <section id="comments" className="scroll-mt-20 space-y-4" aria-label="댓글">
        <SectionHead title={post.category === 'question' ? '답변 · 댓글' : '댓글'} count={visibleComments} />
        {anyCoach && <p className="text-xs text-muted">코치 표시: {COACH_BADGE_NOTE}</p>}

        {post.comments.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {post.comments.map((c, i) => {
              const hidden = c.hidden;
              const mine = c.mine;
              return (
                <li
                  key={c.id}
                  id={`c-${c.id}`}
                  style={{ '--row': i } as React.CSSProperties}
                  className={`selectable scroll-mt-24 space-y-2 px-(--block-pad) py-4 motion-safe:animate-row-in ${hidden ? 'opacity-55' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span className="font-medium text-ink">{c.nickname}</span>
                    {c.coach && <CoachBadge />}
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
                        detail={<p className="text-muted">{c.accepted ? '채택된 답이라 지우면 질문이 다시 미해결이 돼요. ' : ''}되돌릴 수 없어요.</p>}
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
            {post.category === 'question'
              ? '아직 답이 없어요. 아는 만큼 먼저 답해 주세요.'
              : '아직 댓글이 없어요. 첫 댓글을 남겨 보세요.'}
          </p>
        )}

        {/* 가린 글에는 글쓴이도 댓글을 못 단다 — 아무도 못 보는 글이다 */}
        {post.canComment && <CommunityCommentForm postId={post.id} />}
        {user && !post.canComment && !postHidden && (
          <p className="text-sm text-muted">이 글에는 댓글을 달 수 없어요.</p>
        )}
        {!user && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-(--block-pad) py-4">
            <p className="text-sm text-muted">로그인하면 댓글 · 좋아요 · 저장을 할 수 있어요.</p>
            <ButtonLink href={loginHref(`/community/${post.id}`)} size="sm">
              로그인
            </ButtonLink>
          </div>
        )}
      </section>
    </div>
  );
}
