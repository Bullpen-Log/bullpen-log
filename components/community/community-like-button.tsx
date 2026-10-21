'use client';

import { useOptimistic } from 'react';
import { toggleLike } from '@/app/actions/community';
import { RoundIcon } from '@/components/round-icon';
import { orOffline } from '@/lib/action-offline';
import { haptic } from '@/lib/haptics';

/**
 * 좋아요 단추 — 누르는 순간 하트가 차고 수가 바뀐다(useOptimistic). 서버가 답하면 그 값으로 맞춰진다.
 * 신호가 끊기면 조용히 원래 값으로 돌아간다(orOffline — 오류 화면으로 넘어가지 않는다).
 */
export function CommunityLikeButton({
  postId,
  liked,
  count,
}: {
  postId: string;
  liked: boolean;
  count: number;
}) {
  const [shown, setShown] = useOptimistic({ liked, count });

  return (
    <form
      action={async (formData) => {
        haptic('light');
        setShown({ liked: !shown.liked, count: shown.count + (shown.liked ? -1 : 1) });
        await orOffline(toggleLike(formData), undefined);
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <button
        type="submit"
        aria-pressed={shown.liked}
        aria-label={shown.liked ? '좋아요 취소' : '좋아요'}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold tabular-nums transition-[background-color,color,transform] active:scale-95 ${
          shown.liked
            ? 'bg-danger-bg text-danger desk:border desk:border-danger-line'
            : 'bg-ink/6 text-ink hover:text-danger desk:border desk:border-line-strong desk:bg-surface-2'
        }`}
      >
        <RoundIcon
          name="heart"
          aria-hidden
          filled={shown.liked}
          outline={!shown.liked}
          className={`h-4 w-4 transition-transform duration-200 ${shown.liked ? 'scale-110' : ''}`}
        />
        {shown.count}
      </button>
    </form>
  );
}
