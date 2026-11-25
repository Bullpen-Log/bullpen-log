import { WikiPage } from '@/components/wiki/wiki-page';
import { requireUser } from '@/lib/dal';

export default async function TrainingWikiArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  return <WikiPage key={slug} ownerId={user.id} slug={slug} />;
}
