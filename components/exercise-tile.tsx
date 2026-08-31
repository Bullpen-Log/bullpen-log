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
  isReference = false,
  onSelect,
}: {
  title: string;
  thumbUrl: string | null;
  /**
   * 아직 촬영하지 않아 유튜브 참고 영상으로 대신하고 있는 운동인가.
   * 직접 찍은 것과 섞이면 무엇이 남았는지 알 수 없으므로 눈에 띄게 표시한다.
   */
  isReference?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      /*
        299개가 한 화면에 깔린다. 참고 영상이라고 테두리를 노랗게 칠했더니
        격자 전체가 노란 상자 밭이 됐다 — 표시는 모서리 딱지 하나로 충분하다.
        대신 올려놨을 때 살짝 떠오르게 해서 누를 수 있는 것으로 보이게 한다.
      */
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-sky hover:shadow-lg hover:shadow-sky/10"
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

        {isReference && (
          <span className="absolute left-2 top-2 rounded-md bg-shade/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            참고 영상
          </span>
        )}
      </span>

      <span className="line-clamp-2 px-3 py-2.5 text-sm font-semibold leading-snug break-keep text-ink transition-colors group-hover:text-sky">
        {title}
      </span>
    </button>
  );
}
