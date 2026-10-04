import { notFound } from 'next/navigation';
import { ChevronRight, ExternalLink, Eye, Trash2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { deleteArticle } from '@/app/actions/board';
import { BackLink, Badge } from '@/components/ui';
import { ConfirmDeleteForm } from '@/components/confirm-delete';

function formatDate(date: Date) {
  /* 서버(Vercel)는 UTC 로 돈다 — 시간대를 안 주면 한국 0~9시에 쓴 글이 전날로, 시각은 9시간 이르게 찍혔다 */
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const exists = await prisma.article.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) notFound();

  // 조회수를 올리면서 갱신된 글을 함께 가져온다.
  const article = await prisma.article.update({
    where: { id },
    data: { views: { increment: 1 } },
    include: { user: { select: { id: true, nickname: true } } },
  });

  const canDelete = article.userId === user.id || user.role === 'ADMIN';

  return (
    <article className="selectable mx-auto max-w-3xl space-y-8">
      <BackLink href="/board">자료실</BackLink>

      <header className="space-y-5 border-b border-line pb-8">
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <Badge key={tag} className="border-sky-soft/40 text-sky">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        <h1 className="text-heading page-title text-ink">{article.title}</h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <span className="text-ink">{article.user.nickname}</span>
          <span>{formatDate(article.createdAt)}</span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {article.views}
          </span>

          {canDelete && (
            <div className="ml-auto">
              <ConfirmDeleteForm
                action={deleteArticle}
                hidden={{ id: article.id }}
                ariaLabel={`${article.title} 삭제`}
                title="이 글을 지울까요?"
                detail={
                  <div className="space-y-2">
                    <p>
                      <strong className="text-ink">{article.title}</strong>
                    </p>
                    <p className="text-muted">되돌릴 수 없어요.</p>
                  </div>
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-danger-line bg-danger-bg px-3 py-2 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg/70"
              >
                <Trash2 className="h-3.5 w-3.5" />
                삭제
              </ConfirmDeleteForm>
            </div>
          )}
        </div>
      </header>

      {/*
        원문 — 주소 전체 대신 '원문 보기'와 사이트 이름만(2026-10-04 '앱 안에 머물기'). 긴 주소 한 줄이 웹페이지 같았다.
        주소는 길게 눌러 복사할 수 있다(링크 그대로).
      */}
      {article.attachmentUrl && (
        <a
          href={article.attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition-colors hover:border-sky active:bg-ink/6 desk:px-5"
        >
          <ExternalLink className="h-4 w-4 shrink-0 text-sky" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">원문 보기</span>
            <span className="block truncate text-xs text-muted">
              {hostOf(article.attachmentUrl)}
            </span>
          </span>
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted/70" />
        </a>
      )}

      <div className="whitespace-pre-wrap text-[15px] leading-[1.9] text-ink/90">
        {article.content}
      </div>
    </article>
  );
}

/** 원문 주소의 사이트 이름(www. 뺌) — 못 읽는 주소면 그대로 */
function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
