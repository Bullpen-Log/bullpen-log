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
  origin,
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
  /**
   * 이 창을 연 버튼의 한가운데 (화면 기준 px).
   *
   * 주면 그 자리에서 작게 시작해 가운데로 날아오며 커진다. 어느 버튼을 눌러
   * 뜬 창인지 눈으로 이어진다 — 오른쪽 위를 눌렀는데 화면 한복판에 불쑥
   * 나타나면 시선이 한 번 끊긴다.
   *
   * 자리는 누르는 순간 부르는 쪽이 잰다(누른 버튼이 곧 이벤트의 currentTarget
   * 이다). 창은 늘 화면 한가운데에 서므로, 여기서는 화면 중심에서 그 자리까지의
   * 거리를 '출발점'으로 적어 둔다(--pop-x, --pop-y).
   */
  origin?: { x: number; y: number } | null;
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
    if (open && !el.open) {
      /* 화면 한가운데에서 그 버튼까지의 거리 — 창이 거기서 출발한다 */
      if (origin) {
        el.style.setProperty('--pop-x', `${Math.round(origin.x - window.innerWidth / 2)}px`);
        el.style.setProperty('--pop-y', `${Math.round(origin.y - window.innerHeight / 2)}px`);
      } else {
        el.style.removeProperty('--pop-x');
        el.style.removeProperty('--pop-y');
      }
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open, origin]);

  return (
    <dialog
      ref={ref}
      /* 출발점이 있는 창만 날아온다. 없으면 제자리에서 떠오른다. */
      data-pop={origin ? '' : undefined}
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
          /*
           * 위로 올려보내지 않는다.
           *
           * 창 안에 창이 뜨는 자리가 있다 — 설정 창 안의 '비밀번호 바꾸기'가
           * 그렇다. 그대로 두면 ESC 한 번에 안쪽 창과 바깥 창이 같이 닫혀서,
           * 비밀번호 창을 물리려다 설정까지 사라진다.
           */
          e.stopPropagation();
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
      /*
       * 굴러가는 곳을 하나로 못박는다.
       *
       * 예전에는 안쪽 칸에만 높이를 걸어 두었다(70vh). 거기에 머리글 높이가
       * 더해지면 창 전체가 브라우저 기본 최대 높이를 넘어서, 창도 같이 굴러갔다
       * — 스크롤 막대가 두 개 보이고 둘 중 어느 것을 잡아야 할지 알 수 없었다.
       *
       * 창에 높이를 걸고(max-h) 넘치는 것을 자른 뒤(overflow-hidden), 세로로
       * 쌓아 머리글은 고정하고 본문만 남은 높이를 채우게 한다.
       */
      className={`m-auto flex max-h-[min(85dvh,48rem)] flex-col overflow-hidden ${
        size === 'wide'
          ? 'w-[min(62rem,calc(100vw-1.5rem))]'
          : 'w-[min(38rem,calc(100vw-1.5rem))]'
      } rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50`}
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
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
        내용이 길면 여기서만 굴러간다.

        높이를 따로 적지 않고 남은 자리를 채운다(flex-1). 창이 이미 높이를
        들고 있어서, 여기까지 숫자를 적으면 둘이 어긋나 또 두 겹이 된다.

        막대는 감춘다(no-scrollbar). 창은 화면의 일부를 덮는 물건이라 그 안에
        또 막대가 서면 테두리가 두 줄로 보인다. 굴리는 것은 그대로 된다 —
        휠·손가락·키보드 모두 평소와 같다.
      */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </dialog>
  );
}
