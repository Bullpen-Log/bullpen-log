import Link from 'next/link';
import { Eye, Paperclip } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { Badge, ButtonLink, EmptyState, PageHeading } from '@/components/ui';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default async function BoardPage() {
  await requireUser();

  const articles = await prisma.article.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { nickname: true } } },
  });

  return (
    <div className="space-y-10">
      <PageHeading
        eyebrow="Library"
        title="자료실"
        description="투구 역학과 트레이닝에 관한 분석글을 공유하는 게시판입니다."
        action={<ButtonLink href="/board/new">글쓰기</ButtonLink>}
      />

      {articles.length === 0 ? (
        <EmptyState
          title="아직 등록된 글이 없습니다"
          description="첫 번째 자료를 공유해보세요. 참고한 링크와 함께 요약을 남기면 좋습니다."
          action={
            <ButtonLink href="/board/new" variant="secondary" className="mt-2">
              첫 글 쓰기
            </ButtonLink>
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={`/board/${article.id}`}
                className="group flex flex-col gap-3 px-6 py-5 transition-colors hover:bg-surface-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-semibold text-ink transition-colors group-hover:text-sky">
                    {article.title}
                  </h2>
                  {article.attachmentUrl && (
                    <Paperclip className="mt-1 h-4 w-4 shrink-0 text-muted" />
                  )}
                </div>

                <p className="line-clamp-2 text-sm leading-relaxed text-muted">
                  {article.content}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {article.tags.map((tag) => (
                        <Badge key={tag} className="border-sky-soft/40 text-sky">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <span className="ml-auto flex items-center gap-3 text-xs text-muted">
                    <span>{article.user.nickname}</span>
                    <span>{formatDate(article.createdAt)}</span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {article.views}
                    </span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
