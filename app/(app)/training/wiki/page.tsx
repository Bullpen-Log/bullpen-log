import { WikiPage } from '@/components/wiki/wiki-page';
import { requireUser } from '@/lib/dal';
import { WIKI_CATEGORIES, type WikiCategoryId } from '@/lib/wiki';


export default async function TrainingWikiHomePage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; cat?: string | string[] }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 80) : '';
  const cat = typeof sp.cat === 'string' && WIKI_CATEGORIES.some((c) => c.id === sp.cat) ? (sp.cat as WikiCategoryId) : null;
  return <WikiPage ownerId={user.id} query={q} category={cat} />;
}
