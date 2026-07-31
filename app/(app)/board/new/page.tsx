import { requireUser } from '@/lib/dal';
import { PageHeading } from '@/components/ui';
import { ArticleForm } from './article-form';

export default async function NewArticlePage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeading
        eyebrow="Library"
        title="자료 등록"
        description="참고한 자료나 분석글을 정리해 공유해주세요."
      />
      <ArticleForm />
    </div>
  );
}
