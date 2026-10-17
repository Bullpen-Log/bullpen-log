import Link from 'next/link';
import { ChevronRight, Flag, Megaphone, MessagesSquare } from '@/components/icon';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/dal';
import { INQUIRY_STATUS, type InquiryStatusKey } from '@/lib/support';
import { ButtonLink, Card, PageHeading } from '@/components/ui';
import { SupportInquiryRows } from '@/components/support/support-inquiry-rows';
import { SupportNoticeRows } from '@/components/support/support-notice-rows';
import { SupportSectionHead } from '@/components/support/support-section';

type Filter = InquiryStatusKey | 'all';
const FILTERS: Filter[] = ['OPEN', 'ANSWERED', 'CLOSED', 'all'];

function readFilter(raw: string | string[] | undefined): Filter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return FILTERS.includes(v as Filter) ? (v as Filter) : 'OPEN';
}

/**
 * 소통 관리(관리자) — 1:1 문의 답하기 · 공지 쓰기 · 커뮤니티 신고 처리로 가는 길.
 * 문의는 기본으로 '접수됨'만 — 답을 기다리는 것부터 보인다. 다른 상태는 ?status= 로 바꾼다.
 */
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const filter = readFilter((await searchParams).status);

  const [inquiries, counts, notices] = await Promise.all([
    prisma.supportInquiry.findMany({
      where: filter === 'all' ? undefined : { status: filter },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        createdAt: true,
        user: { select: { nickname: true } },
        _count: { select: { replies: true } },
      },
    }),
    prisma.supportInquiry.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.supportNotice.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, title: true, pinned: true, createdAt: true },
    }),
  ]);

  const countOf = (f: Filter) =>
    f === 'all'
      ? counts.reduce((sum, c) => sum + c._count._all, 0)
      : (counts.find((c) => c.status === f)?._count._all ?? 0);
  /* 목록은 100건까지 — 그보다 많으면 처리한 만큼 다음 것이 올라온다고 알린다(쪽 나누기는 아직) */
  const capped = countOf(filter) > inquiries.length;

  return (
    <div className="stack-page">
      <PageHeading title="소통 관리" />

      {/* 문의 */}
      <section className="space-y-3">
        <SupportSectionHead icon={MessagesSquare} title="1:1 문의" />

        {/* 상태 거름 — 주소로 나뉜다(새로 고쳐도 · 링크로 보내도 같은 목록) */}
        <nav aria-label="문의 상태" className="chip-grid flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Link
                key={f}
                href={f === 'OPEN' ? '/admin/support' : `/admin/support?status=${f}`}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-footnote transition-colors desk:rounded-lg desk:text-xs ${
                  active
                    ? 'border-sky bg-sky/10 font-semibold text-sky'
                    : 'border-transparent bg-ink/6 text-ink/80 desk:border-line desk:bg-surface-2 desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink'
                }`}
              >
                {f === 'all' ? '전체' : INQUIRY_STATUS[f].label}
                <span className="text-numeric opacity-70">{countOf(f)}</span>
              </Link>
            );
          })}
        </nav>

        {inquiries.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-muted">
              {filter === 'OPEN'
                ? '답을 기다리는 문의가 없어요.'
                : '이 상태의 문의가 없어요.'}
            </p>
          </Card>
        ) : (
          <SupportInquiryRows
            rows={inquiries.map((q) => ({
              ...q,
              nickname: q.user.nickname,
              replyCount: q._count.replies,
            }))}
          />
        )}
        {capped && (
          <p className="px-1 text-xs text-muted">
            100건만 보여요 — 처리하면 다음 것이 올라와요.
          </p>
        )}
      </section>

      {/* 공지 관리 */}
      <section className="space-y-3">
        <SupportSectionHead
          icon={Megaphone}
          title="공지 관리"
          action={
            <ButtonLink href="/admin/support/notices/new" size="sm">
              공지 쓰기
            </ButtonLink>
          }
        />
        {notices.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-muted">
              아직 올린 공지가 없어요.
            </p>
          </Card>
        ) : (
          <SupportNoticeRows rows={notices} editable />
        )}
      </section>

      {/* 커뮤니티 신고 — 화면은 커뮤니티 쪽(app/(app)/admin/community)이 쥔다. 여기서는 길만 */}
      <Link
        href="/admin/community"
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3 text-sm transition-colors active:bg-ink/6 desk:hover:border-sky"
      >
        <Flag aria-hidden className="h-4.5 w-4.5 shrink-0 text-sky" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">커뮤니티 신고 처리</span>
          <span className="block text-xs text-muted">
            신고된 글 · 댓글을 보고 가리거나 풀어요.
          </span>
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted/70" />
      </Link>
    </div>
  );
}
