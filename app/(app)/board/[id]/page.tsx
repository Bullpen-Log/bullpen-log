import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Eye, Trash2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { deleteArticle } from '@/app/actions/board';
import { Badge, Button } from '@/components/ui';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
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

  const exists = await prisma.article.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();

  // 조회수를 올리면서 갱신된 글을 함께 가져온다.
  const article = await prisma.article.update({
    where: { id },
    data: { views: { increment: 1 } },
    include: { user: { select: { id: true, nickname: true } } },
  });

  const canDelete = article.userId === user.id || user.role === 'ADMIN';

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <Link
        href="/board"
        className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-gold"
      >
        <ArrowLeft className="h-4 w-4" />
        자료실로 돌아가기
      </Link>

      <header className="space-y-5 border-b border-line pb-8">
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <Badge key={tag} className="border-gold-dim/40 text-gold">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        <h1 className="text-3xl font-bold leading-tight tracking-tight text-cream">
          {article.title}
        </h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <span className="text-cream">{article.user.nickname}</span>
          <span>{formatDate(article.createdAt)}</span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {article.views}
          </span>

          {canDelete && (
            <form action={deleteArticle} className="ml-auto">
              <input type="hidden" name="id" value={article.id} />
              <Button
                type="submit"
                variant="danger"
                className="px-3 py-2 text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                삭제
              </Button>
            </form>
          )}
        </div>
      </header>

      {article.attachmentUrl && (
        <a
          href={article.attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-sm transition-colors hover:border-gold"
        >
          <ExternalLink className="h-4 w-4 shrink-0 text-gold" />
          <span className="min-w-0 flex-1 truncate text-muted">
            {article.attachmentUrl}
          </span>
          <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-gold">
            원문 보기
          </span>
        </a>
      )}

      <div className="whitespace-pre-wrap text-[15px] leading-[1.9] text-cream/90">
        {article.content}
      </div>
    </article>
  );
}
