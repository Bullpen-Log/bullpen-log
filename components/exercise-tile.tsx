'use client';

import { Play } from 'lucide-react';

/**
 * 목록에서 쓰는 작은 카드. 미리보기 사진과 이름만 보여준다.
 *
 * 영상이 수십 개로 늘어나도 한 화면에 여러 개가 들어오도록 최소한만 담고,
 * 자세한 내용은 눌러서 펼쳤을 때 보여준다.
 */
export function LibraryTile({
  title,
  thumbUrl,
  onSelect,
}: {
  title: string;
  thumbUrl: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition-colors hover:border-sky"
    >
      <span className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-surface-2">
        {thumbUrl && (
          <>
            {/* 서명된 임시 주소라 이미지 최적화 대상이 아니다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute inset-0 bg-shade/35 transition-colors group-hover:bg-shade/15" />
          </>
        )}
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-sky/90 text-white transition-transform group-hover:scale-110">
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </span>
      </span>

      <span className="line-clamp-2 px-3 py-2.5 text-sm font-medium leading-snug text-ink transition-colors group-hover:text-sky">
        {title}
      </span>
    </button>
  );
}
