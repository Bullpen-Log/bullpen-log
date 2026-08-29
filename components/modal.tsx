'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * 가운데에 뜨는 작은 창.
 *
 * 브라우저가 원래 가진 <dialog> 를 쓴다. 직접 만들면 다음을 전부 손으로 해야
 * 하는데, 하나라도 빠지면 키보드나 화면 낭독기를 쓰는 사람이 갇힌다.
 *   ESC 로 닫기 · 창 밖으로 초점이 새지 않게 가두기 · 뒤 배경 가리기
 *   다른 요소 위에 확실히 뜨기(z-index 싸움이 없다)
 *
 * 열고 닫는 것은 부모가 정한다. 창 스스로 닫히는 경우(ESC·배경 클릭)에는
 * onClose 로 알려, 부모가 가진 값과 어긋나지 않게 한다.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'default',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 제목 밑 한 줄 설명. 없으면 안 그린다. */
  description?: string;
  /**
   * 창 너비.
   *
   * 'wide' 는 영상과 폼 분석처럼 좁으면 못 보는 것을 담을 때 쓴다. 기본 너비에
   * 영상을 넣으면 재생 화면이 손바닥만 해져서 볼 이유가 없어진다.
   */
  size?: 'default' | 'wide';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  /*
   * showModal() 은 DOM 을 직접 건드리는 일이라 effect 에서 부른다.
   * 이미 열려 있는 창에 다시 부르면 오류가 나므로 상태를 먼저 본다.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // ESC 를 눌러 브라우저가 스스로 닫은 경우에도 부모에게 알린다.
      onClose={onClose}
      /*
       * ESC 를 직접 받아 닫는다.
       *
       * <dialog> 는 원래 ESC 로 닫히지만, 크롬은 그것을 '사용자가 직접 눌렀는가'와
       * 묶어 두었다. 그래서 상황에 따라 안 닫힐 수 있고, 실제로 시험용 브라우저에서
       * 아무 내용 없는 dialog 조차 안 닫히는 것을 봤다.
       *
       * 브라우저가 스스로 닫는 경우와 겹칠 수 있는데, 둘 다 같은 값을 넣으므로
       * 두 번 불려도 달라지는 것이 없다.
       */
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      /*
       * 배경을 눌러도 닫는다. 배경 클릭은 dialog 자기 자신을 목표로 삼으므로,
       * 안쪽 상자를 눌렀을 때와 이렇게 구분된다.
       */
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      /*
       * m-auto 가 창을 화면 가운데로 보낸다.
       *
       * 브라우저는 원래 <dialog> 에 margin:auto 를 줘서 가운데로 보내는데,
       * Tailwind 가 모든 요소의 여백을 0 으로 초기화하면서 그 규칙까지 지웠다.
       * 그래서 앱의 창이 전부 화면 왼쪽 위 구석(0,0)에 붙어 있었다.
       */
      className={`m-auto ${
        size === 'wide'
          ? 'w-[min(62rem,calc(100vw-1.5rem))]'
          : 'w-[min(38rem,calc(100vw-1.5rem))]'
      } rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50`}
    >
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/*
        내용이 길면 창 안에서만 굴러간다. 창째로 늘어나면 화면 밖으로 나가
        저장 버튼을 누를 수 없게 된다.
      */}
      <div
        className={`overflow-y-auto px-5 py-5 ${
          size === 'wide' ? 'max-h-[80vh]' : 'max-h-[70vh]'
        }`}
      >
        {children}
      </div>
    </dialog>
  );
}
