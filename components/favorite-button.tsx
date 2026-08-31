'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';

/**
 * 즐겨찾기 별.
 *
 * 두 가지 모양으로 쓴다.
 *   icon  — 목록 한 줄에 붙는 별 하나. 오늘 운동 목록처럼 자리가 좁은 곳.
 *   full  — 글자가 붙은 단추. 상세 화면처럼 자리가 있는 곳.
 *
 * 누르면 화면이 먼저 바뀌고 저장은 뒤따른다. 서버를 기다렸다가 칠하면 폰에서는
 * 안 눌린 줄 알고 한 번 더 누르게 되고, 그러면 방금 단 별이 도로 지워진다.
 * 실패하면 원래대로 되돌리고 까닭을 말한다.
 */
export function FavoriteButton({
  favorite: initial,
  onToggle,
  label,
  variant = 'icon',
  className = '',
}: {
  favorite: boolean;
  /** 켠 뒤의 상태를 돌려주거나, 왜 안 됐는지 말해준다 */
  onToggle: () => Promise<{ favorite: boolean } | { error: string }>;
  /** 무엇의 즐겨찾기인지 — 화면에 안 보이고 읽어주는 데 쓴다 */
  label: string;
  variant?: 'icon' | 'full';
  className?: string;
}) {
  const [favorite, setFavorite] = useState(initial);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const toggle = () => {
    const before = favorite;
    setFavorite(!before);
    setError(undefined);
    startTransition(async () => {
      const res = await onToggle();
      if ('error' in res) {
        setFavorite(before);
        setError(res.error);
        return;
      }
      // 서버가 최종 상태를 알려준다 — 빠르게 두 번 누른 경우를 여기서 맞춘다.
      setFavorite(res.favorite);
    });
  };

  const star = (
    <Star
      className={variant === 'full' ? 'h-4 w-4' : 'h-[1.15rem] w-[1.15rem]'}
      // 채운 별과 빈 별로 가른다. 색만 다르면 흑백 화면에서 구별이 안 된다.
      fill={favorite ? 'currentColor' : 'none'}
      strokeWidth={favorite ? 1.5 : 1.9}
    />
  );

  if (variant === 'full') {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={favorite}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors sm:w-auto ${
            favorite
              ? 'border-warn-line bg-warn-bg font-medium text-warn'
              : 'border-line-strong bg-surface-2 text-muted hover:border-warn-line hover:text-warn'
          }`}
        >
          {star}
          {favorite ? '즐겨찾기 해제' : '즐겨찾기에 담기'}
        </button>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={favorite}
      aria-label={`${label} 즐겨찾기`}
      title={error ?? (favorite ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기')}
      className={`flex items-center justify-center transition-colors ${
        favorite ? 'text-warn' : 'text-muted/50 hover:text-warn'
      } ${className}`}
    >
      {star}
    </button>
  );
}
