'use client';

import { useEffect, useRef, useState } from 'react';
import { FileVideo } from '@/components/icon';
import { Modal } from '@/components/modal';
import { GUIDE_CHAPTERS, PICK_LABEL } from '@/components/intake/file-picker';

/**
 * 원본 저장 안내(INTAKE-FILE-GUIDE-R08) — 네 장, 한 번에 한 장 · 영상 하나만 붙인다.
 * 영상은 GPT05 가 가린 파일만(public/intake-guides/original-file-v1). 저절로 틀지 않고 미리 받지 않는다(preload none · poster).
 * 장을 바꾸거나 창을 닫거나 페이지가 가려지면 멈춘다. 영상을 못 틀어도 글만으로 따라 할 수 있다 — 끝까지 볼 필요도 없다.
 * 창이 닫혀 있으면 아무것도 그리지 않는다(Modal 은 닫힌 dialog 안의 내용도 그리므로 여기서 막는다).
 */
export function OriginalFileGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="원본 저장 방법">
      {open && <GuideBody onClose={onClose} />}
    </Modal>
  );
}

export function GuideBody({ onClose, initial = 0 }: { onClose: () => void; initial?: number }) {
  const [at, setAt] = useState(initial);
  const chapter = GUIDE_CHAPTERS[at];
  const last = at === GUIDE_CHAPTERS.length - 1;
  const tall = chapter.shape === 'tall';
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  /* 페이지가 가려지면 멈춘다(앱 전환 · 탭 바꿈) */
  useEffect(() => {
    const pause = () => video.current?.pause();
    const onVis = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', pause);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', pause);
      pause();
    };
  }, []);

  const go = (i: number) => {
    video.current?.pause();
    setAt(i);
  };

  return (
    <div className="space-y-4 pb-2">
      <p className="text-footnote leading-5 break-keep text-muted">
        이미 파일 앱에 원본을 저장했다면 창을 닫고 ‘{PICK_LABEL}’을 누르면 됩니다.
      </p>
      <nav aria-label="안내 단계">
        <ol className="grid grid-cols-4 gap-1.5">
          {GUIDE_CHAPTERS.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === at ? 'step' : undefined}
                aria-label={`${i + 1}. ${c.title}`}
                className={`text-numeric flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold focus-visible:outline-2 focus-visible:outline-sky ${
                  i === at ? 'bg-sky text-white' : 'bg-ink/5 text-ink'
                }`}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section aria-labelledby={`guide-${chapter.id}`} className="space-y-3">
        <h3 id={`guide-${chapter.id}`} className="text-base font-bold break-keep text-ink">
          {at + 1}. {chapter.title}
        </h3>
        <div className={tall ? 'flex items-start gap-3' : 'space-y-3'}>
          {failed === chapter.id ? (
            <div
              className={`flex items-center gap-2 rounded-2xl bg-ink/5 px-3 py-4 text-footnote leading-5 text-muted ${tall ? 'w-[42%] shrink-0' : ''}`}
            >
              <FileVideo aria-hidden className="h-5 w-5 shrink-0" />
              <p className="break-keep">안내 영상을 불러오지 못했습니다. 글을 따라 하면 됩니다.</p>
            </div>
          ) : (
            <video
              key={chapter.id}
              ref={video}
              src={chapter.video}
              poster={chapter.poster}
              controls
              muted
              playsInline
              preload="none"
              aria-label={`${chapter.title} 안내 영상`}
              onError={() => setFailed(chapter.id)}
              /* 세로 영상은 글 옆에 세워 높이를 쓰고, 가로 영상은 폭을 다 쓴다 — 375×667 에서도 단추까지 한 화면 */
              className={
                tall
                  ? 'aspect-[590/1278] h-[min(44dvh,24rem)] w-auto shrink-0 rounded-2xl bg-black object-contain'
                  : 'aspect-[590/328] w-full rounded-2xl bg-black object-contain'
              }
            />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm leading-relaxed break-keep text-ink">{chapter.body}</p>
            {chapter.note && <p className="text-footnote leading-5 break-keep text-muted">{chapter.note}</p>}
          </div>
        </div>
      </section>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => go(at - 1)}
          disabled={at === 0}
          className="h-12 flex-1 rounded-full bg-ink/5 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-sky disabled:opacity-40"
        >
          이전
        </button>
        <button
          type="button"
          onClick={() => (last ? onClose() : go(at + 1))}
          className="h-12 flex-1 rounded-full bg-sky text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-sky"
        >
          {last ? '닫기' : '다음'}
        </button>
      </div>
    </div>
  );
}
