'use client';

import { useOptimistic } from 'react';
import { toggleFavorite } from '@/app/actions/market';
import { Heart } from '@/components/icon';
import { orOffline } from '@/lib/action-offline';
import { haptic } from '@/lib/haptics';

/** 찜 — 누르는 순간 하트가 차고(useOptimistic), 서버 답으로 맞춰진다. 로그인 안 했으면 로그인으로(폼 대신 링크) */
export function FavoriteButton({
  listingId,
  favorite,
  count,
  loggedIn,
}: {
  listingId: string;
  favorite: boolean;
  count: number;
  loggedIn: boolean;
}) {
  const [shown, setShown] = useOptimistic({ favorite, count });
  if (!loggedIn) {
    return (
      <a
        href={`/login?next=/dugout/market/${listingId}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-semibold text-ink"
      >
        <Heart className="h-4 w-4" /> 찜 {count}
      </a>
    );
  }
  return (
    <form
      action={async (formData) => {
        haptic('light');
        setShown({
          favorite: !shown.favorite,
          count: shown.count + (shown.favorite ? -1 : 1),
        });
        await orOffline(toggleFavorite(formData), undefined);
      }}
    >
      <input type="hidden" name="id" value={listingId} />
      <button
        type="submit"
        aria-pressed={shown.favorite}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold transition-colors ${
          shown.favorite
            ? 'border-danger/40 bg-danger/10 text-danger'
            : 'border-line text-ink hover:border-sky-soft'
        }`}
      >
        <Heart className={`h-4 w-4 ${shown.favorite ? 'fill-current' : ''}`} /> 찜{' '}
        {shown.count}
      </button>
    </form>
  );
}
