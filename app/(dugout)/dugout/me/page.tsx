import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Heart, Plus, Tag } from '@/components/icon';
import { Card, EmptyState } from '@/components/ui';
import { ListingCard } from '@/components/dugout/listing-card';
import { getCurrentUser } from '@/lib/dal';
import { loadFavorites, loadMyListings } from '@/lib/market/load';

/** 내 것 — 내가 올린 물건 · 찜. 불펜로그 안(/today)으로 가는 길도 여기 */
export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dugout/me');
  const [mine, favorites] = await Promise.all([loadMyListings(user.id), loadFavorites(user.id)]);
  const now = new Date();
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">{user.nickname}</h1>
          <p className="text-sm text-muted">덕아웃에서 올린 물건과 찜</p>
        </div>
        <Link href="/today" className="inline-flex min-h-10 items-center rounded-xl bg-sky px-4 text-sm font-semibold text-white">
          내 불펜로그
        </Link>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-1.5 text-lg font-bold text-ink">
            <Tag className="h-4 w-4" /> 내 물건 {mine.length}
          </h2>
          <Link href="/dugout/market/new" className="inline-flex items-center gap-1 text-sm font-semibold text-sky">
            <Plus className="h-4 w-4" /> 올리기
          </Link>
        </div>
        {mine.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">아직 올린 물건이 없어요. 안 쓰는 글러브 하나부터.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {mine.map((item) => (
              <ListingCard key={item.id} item={item} now={now} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="inline-flex items-center gap-1.5 text-lg font-bold text-ink">
          <Heart className="h-4 w-4" /> 찜 {favorites.length}
        </h2>
        {favorites.length === 0 ? (
          <EmptyState icon={<Heart />} title="찜한 물건이 없어요" description="장터에서 하트를 누르면 여기 모여요." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {favorites.map((item) => (
              <ListingCard key={item.id} item={item} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
