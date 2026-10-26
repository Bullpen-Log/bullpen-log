import { headers } from 'next/headers';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import Link from 'next/link';
import { Check, ChevronRight, Eye, EyeOff, Flag } from '@/components/icon';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/dal';
import { AUTO_HIDE, FIRST_ANSWER_TARGET_HOURS, reportReasonLabel } from '@/lib/community';
import { communityMetrics } from '@/lib/community-ops';
import { resolveReport, reviewAppeal, setHidden } from '@/app/actions/community';
import { setListingHidden } from '@/app/actions/market';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  PageHeading,
} from '@/components/ui';
import { formatDateTime } from '@/components/community/community-format';
import { SafeForm } from '@/components/safe-form';

type Search = { [key: string]: string | string[] | undefined };

/** 미리보기 한 줄 — 댓글은 길어서 자른다 */
const preview = (s: string, max = 80) => (s.length > max ? `${s.slice(0, max)}…` : s);

const VIEWS = [
  { key: 'reports', label: '신고' },
  { key: 'appeals', label: '이의 제기' },
  { key: 'log', label: '운영 기록' },
  { key: 'stats', label: '지표' },
] as const;
type View = (typeof VIEWS)[number]['key'];

const ACTION_LABEL: Record<string, string> = {
  hide: '가림',
  unhide: '되살림',
  autohide: '자동 임시 가림',
  resolve: '처리',
  appeal: '이의 제기',
};
const KIND_LABEL: Record<string, string> = { post: '글', comment: '댓글', message: '대화' };

/**
 * 커뮤니티 운영(관리자, 2026-10-17 1판 — 신고). 2026-10-26: 이의 제기 · 운영 기록(누가 · 언제 · 왜) · 지표.
 * 글 · 댓글 · 대화의 말은 지우지 않고 가린다(되살릴 수 있다). 신고한 사람은 여기서만 보인다(글쓴이에게는 안 보인다).
 * 1:1 문의 · 공지는 /admin/support(다른 쪽이 만든다).
 */
export default async function CommunityAdminPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireAdmin();
  if (expoLevel((await headers()).get('user-agent')) >= 8)
    return <OpenNative path="/admin/community" cover={false} />;
  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.key === sp.view) ? (sp.view as View) : 'reports';
  const openCount = await prisma.communityReport.count({ where: { resolvedAt: null } });

  const tab = (href: string, active: boolean, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
        active
          ? 'bg-sky text-white'
          : 'bg-ink/6 text-ink hover:text-sky desk:bg-surface-2'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="stack-page">
      <PageHeading
        title="커뮤니티 운영"
        description="신고된 글 · 댓글 · 대화를 보고 가리거나 그대로 둬요. 가릴 때 남긴 까닭은 글쓴이에게 보여요."
        action={
          <ButtonLink href="/admin/support" variant="secondary" className="gap-1">
            문의 · 공지 관리
            <ChevronRight aria-hidden className="h-4 w-4" />
          </ButtonLink>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) =>
          tab(v.key === 'reports' ? '/admin/community' : `/admin/community?view=${v.key}`, view === v.key, v.key === 'reports' ? `신고 · 처리 전 ${openCount}` : v.label)
        )}
      </div>

      {view === 'reports' && <Reports all={sp.all === '1'} />}
      {view === 'appeals' && <Appeals />}
      {view === 'log' && <ModerationLog />}
      {view === 'stats' && <Stats />}
    </div>
  );
}

/** 대상의 마지막 운영 기록(자동 가림인지 · 이의 제기가 와 있는지) */
async function lastActions(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await prisma.communityModeration.findMany({
    where: { targetId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    select: { targetId: true, action: true },
  });
  const map = new Map<string, string>();
  for (const r of rows) if (!map.has(r.targetId)) map.set(r.targetId, r.action);
  return map;
}

async function Reports({ all }: { all: boolean }) {
  const reports = await prisma.communityReport.findMany({
    where: all ? {} : { resolvedAt: null },
    /* 처리 전(null)이 위로, 그 안에서는 새 신고가 위로 */
    orderBy: [{ resolvedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
    take: 200,
    include: {
      reporter: { select: { nickname: true } },
      post: { select: { id: true, title: true, hiddenAt: true, user: { select: { nickname: true } } } },
      listing: { select: { id: true, title: true, hiddenAt: true, user: { select: { nickname: true } } } },
      comment: { select: { id: true, body: true, hiddenAt: true, postId: true, user: { select: { nickname: true } } } },
      message: { select: { id: true, body: true, hiddenAt: true, postId: true, sender: { select: { nickname: true } } } },
    },
  });
  const last = await lastActions(
    reports.map((r) => r.postId ?? r.commentId ?? r.messageId).filter((x): x is string => Boolean(x))
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/admin/community" className={all ? 'text-muted' : 'font-semibold text-ink'}>
          처리 전
        </Link>
        <span className="text-line-strong">|</span>
        <Link href="/admin/community?all=1" className={all ? 'font-semibold text-ink' : 'text-muted'}>
          전체
        </Link>
        <span className="ml-auto text-xs text-muted">
          자동 임시 가림: 하루 안 {AUTO_HIDE.reporters}명 이상(가입 {AUTO_HIDE.minAccountAgeMs / 86_400_000}일 넘은 · 문제없는 신고 되풀이 안 한 계정)
        </span>
      </div>
      {reports.length === 0 ? (
        <EmptyState
          icon={<Flag />}
          title={all ? '아직 신고가 없어요' : '처리할 신고가 없어요'}
          description={all ? '신고가 들어오면 여기에 쌓여요.' : '모두 처리했어요. 전체에서 지난 신고를 볼 수 있어요.'}
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((r, i) => {
            const kind = r.comment ? 'comment' : r.message ? 'message' : r.listing ? 'listing' : r.post ? 'post' : null;
            const target = r.comment ?? r.message ?? r.listing ?? r.post;
            /* 대상이 이미 지워졌으면 — 처리 완료만 남긴다 */
            const gone = !target;
            const postId = r.comment?.postId ?? r.message?.postId ?? r.post?.id;
            const hidden = target?.hiddenAt != null;
            const resolved = r.resolvedAt !== null;
            const targetId = r.postId ?? r.commentId ?? r.messageId;
            const auto = targetId ? last.get(targetId) === 'autohide' : false;
            const author = r.message?.sender.nickname ?? (target && 'user' in target ? target.user.nickname : '');
            const text = r.comment?.body ?? r.message?.body ?? r.listing?.title ?? r.post?.title ?? '';

            return (
              <li key={r.id} style={{ '--row': i } as React.CSSProperties} className="motion-safe:animate-row-in">
                <Card className={`space-y-3 ${resolved ? 'opacity-70' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge className={kind === 'post' ? 'border-sky-soft/60 text-sky' : ''}>
                      {gone ? '지워짐' : kind === 'comment' ? '댓글' : kind === 'message' ? '대화' : kind === 'listing' ? '물건' : '글'}
                    </Badge>
                    <Badge className="border-danger-line bg-danger-bg text-danger desk:bg-transparent">{reportReasonLabel(r.reason)}</Badge>
                    {hidden && (
                      <Badge className="gap-1">
                        <EyeOff aria-hidden className="h-3 w-3" />
                        {auto ? '자동 임시 가림' : '가려짐'}
                      </Badge>
                    )}
                    {resolved && (
                      <Badge className="gap-1 text-ok">
                        <Check aria-hidden className="h-3 w-3" />
                        {r.outcome === 'actioned' ? '가림으로 처리' : r.outcome === 'dismissed' ? '문제 없음' : '처리'} {formatDateTime(r.resolvedAt!)}
                      </Badge>
                    )}
                    <span className="ml-auto">
                      {r.reporter.nickname} 신고 · {formatDateTime(r.createdAt)}
                    </span>
                  </div>

                  {gone ? (
                    <p className="text-sm text-muted">신고된 것이 이미 지워졌어요.</p>
                  ) : (
                    <Link
                      href={kind === 'listing' ? `/market/${r.listing!.id}` : `/community/${postId}`}
                      className="group block rounded-xl bg-surface-2 px-4 py-3 transition-colors hover:bg-ink/6"
                    >
                      <p className="text-sm font-medium leading-snug text-ink group-hover:text-sky">{preview(text)}</p>
                      <p className="mt-1 text-xs text-muted">
                        {author} · {kind === 'listing' ? '물건 보기' : kind === 'message' ? '글 보기(대화는 참가자만 보여요)' : '글 보기'}
                        <ChevronRight aria-hidden className="ml-0.5 inline h-3 w-3" />
                      </p>
                    </Link>
                  )}

                  {r.detail && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                      <span className="text-muted">신고 내용 — </span>
                      {r.detail}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {/* SafeForm — 신호가 끊겨 보내기가 던지면 목록이 통째로 오류 화면이 됐다(2026-10-17) */}
                    {!gone && target && (
                      <SafeForm action={kind === 'listing' ? setListingHidden : setHidden} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="kind" value={kind ?? 'post'} />
                        <input type="hidden" name="id" value={target.id} />
                        <input type="hidden" name="hidden" value={hidden ? '0' : '1'} />
                        {!hidden && kind !== 'listing' && (
                          <input
                            name="reason"
                            maxLength={200}
                            defaultValue={reportReasonLabel(r.reason)}
                            aria-label="가린 까닭(글쓴이에게 보여요)"
                            className="h-9 w-44 rounded-full border border-line bg-surface px-3 text-xs"
                          />
                        )}
                        <Button type="submit" variant={hidden ? 'secondary' : 'danger'} size="sm" className="gap-1.5">
                          {hidden ? <Eye aria-hidden className="h-4 w-4" /> : <EyeOff aria-hidden className="h-4 w-4" />}
                          {hidden ? '되살리기' : '가리기'}
                        </Button>
                      </SafeForm>
                    )}
                    {!resolved && (
                      <SafeForm action={resolveReport}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" size="sm" className="gap-1.5">
                          <Check aria-hidden className="h-4 w-4" />
                          {hidden ? '가린 채 처리' : '문제 없음으로 처리'}
                        </Button>
                      </SafeForm>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

async function Appeals() {
  const appeals = await prisma.communityModeration.findMany({
    where: { action: 'appeal' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, kind: true, targetId: true, reason: true, createdAt: true, actor: { select: { nickname: true } } },
  });
  const last = await lastActions(appeals.map((a) => a.targetId));
  const [posts, comments] = await Promise.all([
    prisma.communityPost.findMany({
      where: { id: { in: appeals.filter((a) => a.kind === 'post').map((a) => a.targetId) } },
      select: { id: true, title: true, hiddenAt: true },
    }),
    prisma.communityComment.findMany({
      where: { id: { in: appeals.filter((a) => a.kind === 'comment').map((a) => a.targetId) } },
      select: { id: true, body: true, hiddenAt: true, postId: true },
    }),
  ]);
  const byId = new Map<string, { text: string; hidden: boolean; postId: string }>([
    ...posts.map((p) => [p.id, { text: p.title, hidden: p.hiddenAt !== null, postId: p.id }] as const),
    ...comments.map((c) => [c.id, { text: c.body, hidden: c.hiddenAt !== null, postId: c.postId }] as const),
  ]);
  if (appeals.length === 0)
    return <EmptyState icon={<Flag />} title="이의 제기가 없어요" description="가려진 글의 글쓴이가 이의를 내면 여기 쌓여요." />;
  return (
    <ul className="space-y-3">
      {appeals.map((a) => {
        const t = byId.get(a.targetId);
        const waiting = last.get(a.targetId) === 'appeal';
        return (
          <li key={a.id}>
            <Card className={`space-y-3 ${waiting ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge>{KIND_LABEL[a.kind] ?? a.kind}</Badge>
                {waiting ? <Badge className="border-warn-line bg-warn-bg text-warn desk:bg-transparent">처리 전</Badge> : <Badge className="text-ok">처리함</Badge>}
                <span className="ml-auto">
                  {a.actor?.nickname ?? '(탈퇴)'} · {formatDateTime(a.createdAt)}
                </span>
              </div>
              {t ? (
                <Link href={`/community/${t.postId}`} className="block rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink hover:bg-ink/6">
                  {preview(t.text)}
                </Link>
              ) : (
                <p className="text-sm text-muted">이미 지워졌어요.</p>
              )}
              <p className="whitespace-pre-wrap text-sm text-ink/80">
                <span className="text-muted">이의: </span>
                {a.reason}
              </p>
              {waiting && t && (
                <div className="flex flex-wrap justify-end gap-2">
                  {t.hidden && (
                    <SafeForm action={reviewAppeal}>
                      <input type="hidden" name="kind" value={a.kind} />
                      <input type="hidden" name="id" value={a.targetId} />
                      <input type="hidden" name="decision" value="restore" />
                      <Button type="submit" size="sm" variant="secondary">
                        되살리기
                      </Button>
                    </SafeForm>
                  )}
                  <SafeForm action={reviewAppeal}>
                    <input type="hidden" name="kind" value={a.kind} />
                    <input type="hidden" name="id" value={a.targetId} />
                    <input type="hidden" name="decision" value="keep" />
                    <Button type="submit" size="sm">
                      가림 유지
                    </Button>
                  </SafeForm>
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

async function ModerationLog() {
  const rows = await prisma.communityModeration.findMany({
    orderBy: { createdAt: 'desc' },
    take: 150,
    select: { id: true, kind: true, targetId: true, action: true, reason: true, createdAt: true, actor: { select: { nickname: true } } },
  });
  if (rows.length === 0) return <EmptyState icon={<Flag />} title="운영 기록이 없어요" description="가리기 · 되살리기 · 처리 · 이의 제기가 여기 남아요." />;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-(--block-pad) py-3 text-sm">
          <span className="w-36 shrink-0 text-xs text-muted">{formatDateTime(r.createdAt)}</span>
          <Badge>{KIND_LABEL[r.kind] ?? r.kind}</Badge>
          <span className="font-semibold text-ink">{ACTION_LABEL[r.action] ?? r.action}</span>
          <span className="text-xs text-muted">{r.actor ? r.actor.nickname : r.action === 'autohide' ? '자동' : '(탈퇴)'}</span>
          {r.reason && <span className="min-w-0 flex-1 truncate text-xs text-ink/80">{r.reason}</span>}
        </li>
      ))}
    </ul>
  );
}

const pct = (v: number | null) => (v === null ? '집계 전' : `${Math.round(v * 100)}%`);
const hours = (v: number | null) => (v === null ? '집계 전' : v < 1 ? `${Math.round(v * 60)}분` : `${Math.round(v * 10) / 10}시간`);

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="space-y-1 rounded-2xl border border-line bg-surface p-(--block-pad)">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-bold text-ink tabular-nums">{value}</p>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}

async function Stats() {
  const m = await communityMetrics(prisma, new Date());
  const w = m.weeks[0];
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">
        실제 줄로 센 값이에요. 운영자(대표 · 준관리자)와 운영자 글은 빼요. 페이지 조회는 세지 않아요. 분모가 0 이면 ‘집계 전’.
      </p>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">주간 작성(최근 7일씩, 운영자 빼고)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="이번 7일 글 수" value={String(w.posts)} note="지금부터 7일 전까지 새 글" />
          <Metric label="이번 7일 작성자 수" value={String(w.writers)} note="그 글을 쓴 서로 다른 사람" />
        </div>
        <p className="text-xs text-muted">
          지난 4주(새 → 옛): 글 {m.weeks.map((x) => x.posts).join(' · ')} / 작성자 {m.weeks.map((x) => x.writers).join(' · ')}
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">질문 · 답변(최근 30일 질문)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="답변율" value={pct(m.questions.rate)} note={`답이 하나라도 달린 질문 ÷ 질문 ${m.questions.total}개`} />
          <Metric label="첫 답까지(가운데 값)" value={hours(m.questions.medianFirstAnswerHours)} note="답이 달린 질문만 · 글쓴이 댓글 빼고" />
          <Metric
            label={`${FIRST_ANSWER_TARGET_HOURS}시간 안 첫 답`}
            value={pct(m.questions.within24h)}
            note={`운영 목표(화면에 약속하지 않음) · 분모 질문 ${m.questions.total}개`}
          />
          <Metric label="지금 답 없는 질문" value={String(m.unanswered)} note="가리지 않은 질문 전체 중" />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">번개 · 팀(최근 30일)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="번개 참가 신청" value={String(m.meetups.joins)} note="취소한 신청은 빠져요" />
          <Metric label="번개 진행 완료" value={String(m.meetups.held)} note={`글쓴이가 ‘모였어요’를 남긴 것 · 결과 안 남김 ${m.meetups.pending}개`} />
          <Metric label="팀 신청" value={String(m.team.joins)} note="문의 · 지원 · 경기 신청 · 제안" />
          <Metric label="팀 진행 완료" value={String(m.team.done)} note="글쓴이가 ‘진행 완료’로 바꾼 신청" />
        </div>
        <p className="text-xs text-muted">진행 완료는 2026-10-26 판부터 기록해요. 그 전 모임은 결과가 없어요.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">재참여 · 신고</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="첫 참여 7일 안 재참여"
            value={pct(m.retention.rate)}
            note={`첫 글 · 댓글 · 신청이 7~37일 전인 ${m.retention.cohort}명 중, 그 뒤 24시간~7일 안에 다시 남긴 ${m.retention.returned}명`}
          />
          <Metric label="처리 전 신고" value={String(m.reports.open)} note={m.reports.oldestOpenHours === null ? '없음' : `가장 오래된 것 ${hours(m.reports.oldestOpenHours)} 지남`} />
          <Metric label="신고 처리 시간(가운데 값)" value={hours(m.reports.medianResolveHours)} note={`최근 30일 처리한 ${m.reports.resolved}건`} />
        </div>
        <p className="text-xs text-muted">지운 글 · 댓글 · 취소한 신청은 기록이 없어 재참여에서 빠져요.</p>
      </section>
    </div>
  );
}
