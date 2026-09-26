'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
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
   *
   * 'page' 는 한 화면만 한 창 — 투구 기록 팝업처럼 페이지를 통째로 띄울 때. 폭과 높이를
   * 화면만큼 써서(높이 94%) 안의 내용을 두 칸으로 나눠 놓고 굴리지 않고 보게 한다.
   */
  size?: 'default' | 'wide' | 'page';
  /**
   * 이 창을 연 버튼의 한가운데 (화면 기준 px).
   *
   * 주면 그 자리에서 작게 시작해 가운데로 날아오며 커진다. 어느 버튼을 눌러
   * 뜬 창인지 눈으로 이어진다 — 오른쪽 위를 눌렀는데 화면 한복판에 불쑥
   * 나타나면 시선이 한 번 끊긴다.
   *
   * 자리는 누르는 순간 부르는 쪽이 잰다(누른 버튼이 곧 이벤트의 currentTarget
   * 이다). 창은 늘 화면 한가운데에 서므로, 열린 창의 가운데에서 그 자리까지의
   * 거리를 재서 거기서 출발시킨다(아래 useLayoutEffect).
   */
  origin?: { x: number; y: number } | null;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  /*
   * showModal() 은 DOM 을 직접 건드리는 일이라 effect 에서 부른다.
   * 이미 열려 있는 창에 다시 부르면 오류가 나므로 상태를 먼저 본다.
   *
   * 누른 자리에서 날아오는 움직임은 여기서 직접 건다(el.animate).
   *
   * 예전에는 출발점을 CSS 변수(--pop-x·--pop-y)로 넘기고 CSS 애니메이션이 그 변수를
   * 읽게 했다. 그런데 애니메이션 안에서 변수를 읽는 방식은 브라우저마다 다르게
   * 돈다 — 사파리 계열은 변수 값을 한 번 읽고 묵혀 두어서, 설정을 연 뒤 내 정보를
   * 열면 내 정보가 설정 버튼 자리에서 날아왔다. 숫자를 그 자리에서 계산해 그대로
   * 넣으면 어느 브라우저에서나 같다.
   *
   * 출발점은 화면 가운데가 아니라 '창의 실제 가운데'에서 잰다. 휴대폰은 주소창이
   * 들어가고 나오면서 화면 높이가 바뀌어, 화면 가운데로 잡으면 위아래로 어긋난다.
   *
   * 변수는 그래도 적어 둔다. 닫을 때 버튼 쪽으로 줄어드는 것은 CSS transition 이
   * 하는데, 일반 속성 안의 변수는 어느 브라우저에서나 제대로 읽힌다.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (origin) {
        const box = el.getBoundingClientRect();
        const dx = Math.round(origin.x - (box.left + box.width / 2));
        const dy = Math.round(origin.y - (box.top + box.height / 2));
        el.style.setProperty('--pop-x', `${dx}px`);
        el.style.setProperty('--pop-y', `${dy}px`);

        if (!reduce) {
          /* 옅어지는 것과 날아오는 것은 시간이 달라서 둘로 나눈다 */
          el.animate(
            [
              { transform: `translate(${dx}px, ${dy}px) scale(0.18)` },
              { transform: 'translate(0, 0) scale(1)' },
            ],
            { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
          );
          el.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 180,
            easing: 'ease-out',
          });
        }
      } else {
        el.style.removeProperty('--pop-x');
        el.style.removeProperty('--pop-y');
      }
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
       * 창에 높이를 걸고(max-h) 넘치는 것을 자른 뒤(overflow-clip), 세로로
       * 쌓아 머리글은 고정하고 본문만 남은 높이를 채우게 한다.
       */
      className={`m-auto flex flex-col overflow-clip ${
        size === 'page'
          ? 'max-h-[94dvh] w-[min(76rem,calc(100vw-1.5rem))]'
          : size === 'wide'
            ? 'max-h-[min(85dvh,48rem)] w-[min(62rem,calc(100vw-1.5rem))]'
            : 'max-h-[min(85dvh,48rem)] w-[min(38rem,calc(100vw-1.5rem))]'
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

        높이를 따로 적지 않고 제 내용만큼 차지하되, 창이 모자라면 줄어들어
        굴러간다(flex-auto + min-h-0). 창이 이미 높이를 들고 있어서, 여기까지
        숫자를 적으면 둘이 어긋나 또 두 겹이 된다.

        flex-1 이 아니다. flex-1 은 '0 에서 시작해 남는 자리를 채운다'인데,
        창 높이가 내용으로 정해지는 자리에서는 그 '0'을 브라우저마다 다르게
        읽는다. 크롬은 내용 높이로 읽지만 아이폰 사파리는 정말 0 으로 읽어서,
        본문이 접히고 제목 줄만 남은 납작한 창이 떴다. flex-auto 는 내용
        높이에서 시작하므로 어느 브라우저에서나 같다.

        relative 가 꼭 있어야 한다. 칩 속에 숨긴 라디오(sr-only)는 위치를 잡는 기준이
        가장 가까운 '자리 잡힌' 조상인데, 이것이 없으면 창 전체가 기준이 된다. 그러면
        아래쪽 라디오들이 창 자체의 스크롤 길이를 늘리고, 거기로 초점이 가는 순간 창이
        통째로 위로 밀려 제목이 사라진다. 창은 overflow-clip 이라 아예 굴러가지 않게도
        막아 두었다 — hidden 은 사람이 못 굴릴 뿐 브라우저는 굴린다.

        막대는 감춘다(no-scrollbar). 창은 화면의 일부를 덮는 물건이라 그 안에
        또 막대가 서면 테두리가 두 줄로 보인다. 굴리는 것은 그대로 된다 —
        휠·손가락·키보드 모두 평소와 같다.
      */}
      <div className="no-scrollbar relative min-h-0 flex-auto overflow-y-auto px-5 py-5">
        {children}
      </div>
    </dialog>
  );
}
