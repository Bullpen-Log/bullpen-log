'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from '@/components/icon';
import { photoLabel } from '@/lib/market/detail';

/**
 * 물건 사진 보기(2026-10-25, Phase 1 — docs/designs/dugout-market-commerce-plan.md 4절 '상품 상세').
 * 사진 앱처럼: 큰 사진은 잘라내지 않고 통째로(object-contain — 흠집이 잘리면 안 된다), 썸네일은 진짜 단추(누르면 큰 사진이 바뀌고 고른 표시),
 * ‹ › · 키보드 ← → · 큰 사진을 누르면 전체 화면(<dialog>) — 거기서도 ‹ › · Esc · 한 번 더 누르면 2배 확대(누른 자리 기준).
 * 큰 칸은 4:3 으로 높이를 미리 잡아 사진이 늦게 와도 화면이 안 튄다. 서명 주소가 죽어 사진을 못 받으면 그 칸만 '사진을 불러오지 못했어요'.
 * 움직임은 짧게(motion-safe) — 움직임 줄이기면 바로 바뀐다.
 */
export function ListingGallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const total = images.length;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (d: number) => {
      if (total < 2) return;
      setIndex((i) => (i + d + total) % total);
    },
    [total]
  );

  /* 전체 화면은 <dialog> 가 맡는다 — 초점 · Esc · 뒤 화면 잠금(globals.css html:has(dialog:modal)) */
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  /* 고른 썸네일이 보이게 */
  useEffect(() => {
    const el = thumbsRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index]);

  if (total === 0) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-surface-2 text-sm text-muted" aria-label="사진 없음">
        사진이 없어요
      </div>
    );
  }

  /* 전체 화면이 열려 있으면 거기(Lightbox)가 ← → 를 받는다 — 둘이 같이 받으면 두 장씩 넘어갔다 */
  const onKey = (e: React.KeyboardEvent) => {
    if (open) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  };

  return (
    <div className="space-y-3" onKeyDown={onKey}>
      {/* 큰 사진 — 4:3 상자에 통째로. 누르면 전체 화면 */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-2">
        {broken[index] ? (
          <div className="grid h-full w-full place-items-center px-6 text-center text-sm text-muted">
            사진을 불러오지 못했어요. 새로 고치면 다시 받아요.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`${photoLabel(index, total)} 크게 보기`}
            className="block h-full w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소 */}
            <img
              key={images[index]}
              src={images[index]}
              alt={`${title} ${photoLabel(index, total)}`}
              className="h-full w-full object-contain motion-safe:animate-fade-in"
              onError={() => setBroken((b) => ({ ...b, [index]: true }))}
            />
          </button>
        )}
        {total > 1 && (
          <>
            <NavButton side="left" onClick={() => go(-1)} />
            <NavButton side="right" onClick={() => go(1)} />
            <span
              aria-live="polite"
              className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white"
            >
              {index + 1} / {total}
            </span>
          </>
        )}
      </div>

      {/* 썸네일 — 진짜 단추(탭 · 키보드), 고른 것은 초록 테두리 */}
      {total > 1 && (
        <div ref={thumbsRef} role="group" aria-label="사진 고르기" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              data-i={i}
              aria-label={photoLabel(i, total)}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => setIndex(i)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2 transition-[box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky ${
                i === index ? 'ring-2 ring-sky ring-offset-2 ring-offset-surface' : 'opacity-80 hover:opacity-100'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소 */}
              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {/* 전체 화면 — 검은 바탕 위 통째 사진. ‹ › · 닫기 · 한 번 더 누르면 2배 */}
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        aria-label={`${title} 사진 크게 보기`}
        className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black/90"
      >
        {open && (
          <Lightbox
            images={images}
            index={index}
            title={title}
            onIndex={setIndex}
            onClose={() => setOpen(false)}
          />
        )}
      </dialog>
    </div>
  );
}

function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? '이전 사진' : '다음 사진'}
      className={`absolute top-1/2 ${side === 'left' ? 'left-2' : 'right-2'} grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-white`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function Lightbox({
  images,
  index,
  title,
  onIndex,
  onClose,
}: {
  images: string[];
  index: number;
  title: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const total = images.length;
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const go = (d: number) => {
    setZoom(null);
    onIndex((index + d + total) % total);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- index · total 만 본다
  }, [index, total]);

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <span className="text-sm font-semibold">{photoLabel(index, total)}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          autoFocus
          className="grid h-11 w-11 place-items-center rounded-full bg-white/12 focus-visible:outline-2 focus-visible:outline-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <button
          type="button"
          onClick={(e) => {
            if (zoom) return setZoom(null);
            const r = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          aria-label={zoom ? '원래 크기로' : '2배로 확대'}
          className={`block h-full w-full ${zoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소 */}
          <img
            src={images[index]}
            alt={`${title} ${photoLabel(index, total)}`}
            style={zoom ? { transform: 'scale(2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            className="h-full w-full object-contain motion-safe:transition-transform motion-safe:duration-150"
          />
        </button>
        {total > 1 && (
          <>
            <NavButton side="left" onClick={() => go(-1)} />
            <NavButton side="right" onClick={() => go(1)} />
          </>
        )}
      </div>
      <div className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-white/70">
        사진을 누르면 2배로 커져요 · ← → 로 넘겨요
      </div>
    </div>
  );
}
