import Link from 'next/link';
import { Check, ChevronRight, Eye, EyeOff, Flag } from '@/components/icon';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/dal';
import { reportReasonLabel } from '@/lib/community';
import { resolveReport, setHidden } from '@/app/actions/community';
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

/**
 * 커뮤니티 신고 관리(관리자, 2026-10-17 1판 — 틀). 처리 전 신고가 먼저, ?all=1 이면 처리한 것까지.
 * 글 · 댓글은 지우지 않고 가린다(되살릴 수 있다). 1:1 문의 · 공지는 /admin/support(다른 쪽이 만든다).
 */
export default async function CommunityAdminPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const all = sp.all === '1';

  const reports = await prisma.communityReport.findMany({
    where: all ? {} : { resolvedAt: null },
    /* 처리 전(null)이 위로, 그 안에서는 새 신고가 위로 */
    orderBy: [{ resolvedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
    take: 200,
    include: {
      reporter: { select: { nickname: true } },
      post: {
        select: {
          id: true,
          title: true,
          hiddenAt: true,
          user: { select: { nickname: true } },
        },
      },
      comment: {
        select: {
          id: true,
          body: true,
          hiddenAt: true,
          postId: true,
          user: { select: { nickname: true } },
        },
      },
    },
  });
  /* 보이는 200건이 아니라 전체 — ?all=1 로 지난 것까지 볼 때 수가 어긋나지 않게 */
  const openCount = await prisma.communityReport.count({ where: { resolvedAt: null } });

  const tab = (href: string, active: boolean, label: string) => (
    <Link
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
        title="커뮤니티 신고"
        description="신고된 글 · 댓글을 보고 가리거나 그대로 둬요. 처리하면 목록에서 내려가요."
        action={
          <ButtonLink href="/admin/support" variant="secondary" className="gap-1">
            문의 · 공지 관리
            <ChevronRight aria-hidden className="h-4 w-4" />
          </ButtonLink>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {tab('/admin/community', !all, `처리 전 ${openCount}`)}
        {tab('/admin/community?all=1', all, '전체')}
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={<Flag />}
          title={all ? '아직 신고가 없어요' : '처리할 신고가 없어요'}
          description={
            all
              ? '신고가 들어오면 여기에 쌓여요.'
              : '모두 처리했어요. 전체에서 지난 신고를 볼 수 있어요.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((r, i) => {
            const isComment = r.comment !== null;
            const target = isComment ? r.comment : r.post;
            /* 글 · 댓글이 이미 지워졌으면 대상이 없다 — 처리 완료만 남긴다 */
            const gone = !target;
            const postId = r.comment?.postId ?? r.post?.id;
            const hidden = target?.hiddenAt != null;
            const resolved = r.resolvedAt !== null;

            return (
              <li
                key={r.id}
                style={{ '--row': i } as React.CSSProperties}
                className="motion-safe:animate-row-in"
              >
                <Card className={`space-y-3 ${resolved ? 'opacity-70' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {/* 대상이 지워졌으면 종류를 모른다(글 · 댓글 둘 다 SetNull) — '글'로 단정하지 않는다 */}
                    <Badge className={isComment || gone ? '' : 'border-sky-soft/60 text-sky'}>
                      {gone ? '지워짐' : isComment ? '댓글' : '글'}
                    </Badge>
                    <Badge className="border-danger-line bg-danger-bg text-danger desk:bg-transparent">
                      {reportReasonLabel(r.reason)}
                    </Badge>
                    {hidden && (
                      <Badge className="gap-1">
                        <EyeOff aria-hidden className="h-3 w-3" />
                        가려짐
                      </Badge>
                    )}
                    {resolved && (
                      <Badge className="gap-1 text-ok">
                        <Check aria-hidden className="h-3 w-3" />
                        처리 {formatDateTime(r.resolvedAt!)}
                      </Badge>
                    )}
                    <span className="ml-auto">
                      {r.reporter.nickname} 신고 · {formatDateTime(r.createdAt)}
                    </span>
                  </div>

                  {gone ? (
                    <p className="text-sm text-muted">
                      신고된 글 · 댓글이 이미 지워졌어요.
                    </p>
                  ) : (
                    <Link
                      href={`/community/${postId}`}
                      className="group block rounded-xl bg-surface-2 px-4 py-3 transition-colors hover:bg-ink/6"
                    >
                      <p className="text-sm font-medium leading-snug text-ink group-hover:text-sky">
                        {isComment ? preview(r.comment!.body) : r.post!.title}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {target.user.nickname} · 글 보기
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
                    {!gone && (
                      <SafeForm action={setHidden}>
                        <input
                          type="hidden"
                          name="kind"
                          value={isComment ? 'comment' : 'post'}
                        />
                        <input type="hidden" name="id" value={target.id} />
                        <input type="hidden" name="hidden" value={hidden ? '0' : '1'} />
                        <Button
                          type="submit"
                          variant={hidden ? 'secondary' : 'danger'}
                          size="sm"
                          className="gap-1.5"
                        >
                          {hidden ? (
                            <Eye aria-hidden className="h-4 w-4" />
                          ) : (
                            <EyeOff aria-hidden className="h-4 w-4" />
                          )}
                          {hidden ? '되살리기' : '가리기'}
                        </Button>
                      </SafeForm>
                    )}
                    {!resolved && (
                      <SafeForm action={resolveReport}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" size="sm" className="gap-1.5">
                          <Check aria-hidden className="h-4 w-4" />
                          처리 완료
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
    </div>
  );
}
