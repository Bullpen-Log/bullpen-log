'use client';

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { Lock } from '@/components/icon';
import { NAV_ICONS, NAV_TINT } from '@/components/nav-icons';
import { AppIcon } from '@/components/app-icon';
import type { NavGroup, NavItem } from '@/lib/nav';
import { DESK_MEDIA, MOBILE_TABS } from '@/lib/nav';
import { Anchor, flyStyle, growStyle } from './shared';
import { NavGlyph, Avatar } from './glyphs';

/* 앱 틀의 큰 메뉴 — PC 는 도크가 부풀어 뜨는 팝업, 휴대폰은 앱 폴더. 2026-10-16 에 app-shell.tsx 에서 옮겼다(내용 그대로). */

/**
 * 격자를 누르거나 도크에 오래 머물면 펴는 상세 메뉴. 휴대폰은 '더보기'로 편다.
 *
 * PC 는 도크 자리에서 부풀어 뜨는 팝업(w-72 · 내용만큼 — globals.css 의 dialog[data-drawer])이다.
 * 예전에는 화면 오른쪽 끝에서 밀려 나오는 세로 판이었는데 뒤를 어둡게 하고 한 귀퉁이를 위아래로 다 덮어
 * "화면을 너무 많이 가린다"(2026-10-09 사용자). 막대를 그 자리에서 넓히는 방법도 있었지만, 그러면
 * 열고 닫을 때마다 본문 폭이 바뀌어 글이 다시 흐른다 — 읽던 줄을 놓친다. 휴대폰은 아래 시트 그대로.
 *
 * 브라우저가 원래 가진 <dialog> 를 쓴다. 직접 만들었더니 다음을 전부 손으로
 * 해야 했다 — ESC 로 닫기, 초점이 뒤로 새지 않게 가두기, 뒤 배경 가리기,
 * 다른 요소 위에 확실히 뜨기. 무엇보다 열고 닫을 때 부드럽게 미끄러지려면
 * 없어지는 순간을 붙잡아야 하는데, <dialog> 는 그것을 브라우저가 해 준다
 * (app/globals.css 의 dialog[data-drawer]).
 *
 * 그래서 이 컴포넌트는 늘 붙어 있고 open 만 오간다. 닫힐 때 화면에서 지워
 * 버리면 나가는 애니메이션을 보여줄 것이 남지 않는다.
 *
 * 한 화면에 다 들어가게 줄였다. 예전에는 항목마다 여백이 넉넉해서 노트북
 * 화면에서는 관리자 줄이 잘려 굴려야 했다. 메뉴는 훑어보는 것이라 한눈에 다
 * 보여야 하고, 굴리는 순간 '더 있나?' 하고 두 번 보게 된다.
 *
 * 테마 고르기는 여기 두지 않았다. 하루에 한 번 누를까 말까 한 것이 메뉴를 열
 * 때마다 눈에 들어올 이유가 없다. 설정 화면에 있다.
 */
/** 하단 탭에도 있는 메뉴 항목 — 휴대폰 더보기 폴더에서 뺀다 */
const inTabBar = (item: NavItem) =>
  MOBILE_TABS.some((t) => t.label === item.label && t.icon === item.icon);

export function DetailMenu({
  groups,
  nickname,
  avatarUrl,
  isAdmin,
  isActive,
  open,
  onClose,
  onNavigate,
  onDismissed,
  onProfile,
  onSettings,
  anchor,
  flyIndex,
  flyNames,
  grows,
  quickHrefs,
  built,
  quiet,
}: {
  groups: NavGroup[];
  nickname: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isActive: (href: string) => boolean;
  open: boolean;
  /** X · 배경 · Esc 로 닫을 때 — PC 에서는 거꾸로 닫는 연출이 돈다 */
  onClose: () => void;
  /** 메뉴를 눌러 다른 화면으로 갈 때 — 그냥 미끄러져 닫힌다 */
  onNavigate: () => void;
  /** 판이 이미 닫혔다고 브라우저가 알려 올 때. 값만 맞춘다. */
  onDismissed: () => void;
  /** 메뉴 맨 아래 내 정보를 눌렀을 때. 누른 버튼을 함께 준다. */
  onProfile: (el: HTMLElement) => void;
  /** 휴대폰 폴더의 '설정' 타일 — 위 막대의 톱니가 폴더로 들어왔다(2026-10-14 사용자) */
  onSettings: (el: HTMLElement) => void;
  /** PC 팝업이 설 자리 — 도크와 같은 위, 막대와 같은 오른쪽 끝(휴대폰 시트는 안 쓴다) */
  anchor: Anchor;
  /** 아이콘의 이름표 번호 — 도크·막대와 같은 번호를 쓴다 */
  flyIndex: (href: string) => number;
  /** 연출에서 날아오는 아이콘에 이름표를 다는가: 막대의 넷만 · 여덟 다 · 없음(연출 아님) */
  flyNames: 'none' | 'quick' | 'all';
  /** 판이 열리는 연출 — 막대에 없는 아이콘이 판의 제자리에서 돋아난다 */
  grows: boolean;
  quickHrefs: string[];
  /** 연출로 열렸다 — 판의 여는 애니메이션을 끈다(연출이 대신했다) */
  built: boolean;
  /** 거꾸로 닫는 연출 중 — 판의 닫는 움직임을 끈다(연출이 대신한다) */
  quiet: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  /* 돋아나는 차례 — 막대에 없는 것들만 위에서부터 센다 */
  const growOrder = new Map(
    groups
      .flatMap((g) => g.items)
      .filter((item) => !quickHrefs.includes(item.href))
      .map((item, k) => [item.href, k])
  );

  const folder = useRef<HTMLDivElement>(null);
  /*
   * 휴대폰 폴더는 절대 굴리지 않는다(2026-10-14 사용자 — 아이폰 앱에서 관리자 14개가 넘쳐 굴렀다). 타일 크기는 CSS(--tile)가 화면 높이로
   * 어림하고, 열 때 실제로 재서 넘치면 넘친 만큼을 줄 수로 나눠 타일을 줄인다(최소 30px). 글자 크기 · 기기마다 다른 여백까지 맞는다.
   * 그리고 처음 초점을 폴더 자체로 — <dialog> 가 첫 타일에 초점을 줘 파란 테두리가 떴다.
   */
  const fitFolder = () => {
    const f = folder.current;
    if (!f || window.matchMedia(DESK_MEDIA).matches) return;
    f.focus({ preventScroll: true });
    const nav = f.querySelector('nav');
    if (!nav) return;
    f.style.removeProperty('--tile');
    for (let n = 0; n < 4; n++) {
      const over = nav.scrollHeight - nav.clientHeight;
      if (over <= 0) return;
      const icons = [...nav.querySelectorAll<HTMLElement>('.tile-icon')].filter(
        (el) => el.offsetWidth > 0
      );
      if (!icons.length) return;
      const rows = new Set(
        icons.map(
          (el) => (el.closest('[data-tile]') as HTMLElement | null)?.offsetTop ?? 0
        )
      ).size;
      const now = icons[0].offsetWidth;
      const next = Math.max(30, now - Math.ceil(over / Math.max(1, rows)));
      if (next >= now) return;
      f.style.setProperty('--tile', `${next}px`);
    }
  };
  /*
   * showModal() 은 DOM 을 직접 건드리는 일이라 effect 에서 부른다.
   *
   * useLayoutEffect 다. 판이 만들어지는 연출은 '판이 열린 새 모습'을
   * 브라우저가 찍기 전에 판이 이미 열려 있어야 한다. 화면을 그린 뒤에 도는
   * useEffect 로는 그 순서가 보장되지 않는다.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      /* 지난번 끌어내려 닫은 흔적(data-dismiss · 폴더의 인라인 자리)은 지우고 연다 — 남으면 폴더가 아래에 뜬다 */
      el.removeAttribute('data-dismiss');
      folder.current?.style.removeProperty('transform');
      el.showModal();
      fitFolder();
    }
    if (!open && el.open) {
      /* 끌어내리다 놓아 닫을 때 — 인라인 자리를 닫는 것과 같은 순간에 지워야 내려가는 움직임이 거기서 이어진다 */
      el.style.transform = '';
      folder.current?.style.removeProperty('transform');
      el.close();
    }
  }, [open]);

  /* 열려 있는 동안 화면이 돌거나 크기가 바뀌면 다시 맞춘다 */
  useEffect(() => {
    if (!open) return;
    const on = () => fitFolder();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [open]);

  /*
   * 휴대폰 — 화면 어디서든 누른 채 아래로 끌면 폴더가 따라 내려오고, 충분히(100px) 내리거나 빠르게 튕기면 아래로 미끄러져
   * 닫힌다(2026-10-14 사용자: "화면 어디든 누른 상태로 아래로 이동하는 제스처면 아래로 내려가며 사라지게"). 덜 내리면 제자리로.
   *
   * 2026-10-14 고침(사용자 "갑자기 메뉴가 밑으로 사라진다 · 밖을 눌러도 안 닫힌다"):
   * - 끌기는 세로로 12px 넘게, 가로보다 세로로 더 움직였을 때만 — 타일을 누르다 손가락이 조금 떨려도 끌기가 되지 않는다.
   *   닫힘 문턱도 올렸다(100px, 또는 48px 넘게 빠르게). 예전(8px · 24px 빠르게)에는 흔들린 누름이 폴더를 내렸다.
   * - 끌어 닫은 뒤 폴더에 남던 인라인 transform 을 닫는 순간 · 여는 순간 지운다 — 남아 있으면 다음에 열 때 폴더가 그만큼 아래에 떴다.
   * - 밖 누르기는 click 이 아니라 손을 뗄 때(pointerup) 정한다 — 누른 곳과 뗀 곳이 둘 다 폴더 밖이면 닫는다. 폴더 옆 빈 곳은
   *   폭 전체의 감싸개가 받아 data-scrim 이 아니었고, 아이폰은 맨 div 에 click 을 잘 안 보낸다.
   * PC 팝업은 끌지 않는다(바깥 누르기는 아래 onClick).
   */
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    t: number;
    dy: number;
    on: boolean;
    outside: boolean;
  } | null>(null);
  const swiped = useRef(false);
  /* 손가락 자리는 장면마다 한 번만 그린다(포인터 알림이 한 장면에 여러 번 와도) */
  const dragFrame = useRef(0);
  const inFolder = (t: EventTarget | null) =>
    t instanceof Element && t.closest('[data-folder]') != null;
  const startDrag = (e: React.PointerEvent<HTMLDialogElement>) => {
    if (window.matchMedia(DESK_MEDIA).matches) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    /*
     * 끄는 중에 둘째 손가락이 닿으면 무시한다 — 덮어쓰면 첫 손가락을 뗄 때 아무도 안 받아 폴더가 내려간 채 남았다(2026-10-16).
     * 끄는 손가락은 붙들어(setPointerCapture) 떼거나 취소될 때 꼭 끝 알림이 온다.
     */
    if (drag.current?.on) return;
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: e.timeStamp,
      dy: 0,
      on: false,
      outside: !inFolder(e.target),
    };
    swiped.current = false;
  };
  const moveDrag = (e: React.PointerEvent<HTMLDialogElement>) => {
    const d = drag.current;
    const f = folder.current;
    if (!d || !f || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y;
    if (!d.on) {
      const dx = Math.abs(e.clientX - d.x);
      if (dy < 12 || dy < dx) {
        /* 위로 · 옆으로 많이 움직였으면 끌기도 누르기도 아니다 */
        if (dx > 12 || dy < -12) d.outside = false;
        return;
      }
      d.on = true;
      swiped.current = true;
      /* 끄는 동안 폴더 흐림을 끈다(globals.css [data-dragging]) — 흐린 폴더를 움직이면 아이폰이 장면마다 흐림을 다시 셈해 10장면/초쯤으로 버벅였다 */
      ref.current?.setAttribute('data-dragging', '');
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 붙들 수 없는 포인터 — 따라오기는 그대로 */
      }
    }
    d.dy = Math.max(0, dy);
    if (!dragFrame.current)
      dragFrame.current = requestAnimationFrame(() => {
        dragFrame.current = 0;
        if (drag.current) f.style.setProperty('transform', `translate3d(0, ${drag.current.dy}px, 0)`);
      });
  };
  const endDrag = (e: React.PointerEvent<HTMLDialogElement>) => {
    const d = drag.current;
    const f = folder.current;
    if (!d || !f || e.pointerId !== d.id) return;
    drag.current = null;
    cancelAnimationFrame(dragFrame.current);
    dragFrame.current = 0;
    ref.current?.removeAttribute('data-dragging');
    if (!d.on) {
      /* 그냥 누름 — 누른 곳도 뗀 곳도 폴더 밖이면 닫는다(아이폰 폴더처럼) */
      if (e.type === 'pointerup' && d.outside && !inFolder(e.target)) onClose();
      return;
    }
    if (e.type === 'pointercancel') {
      f.style.removeProperty('transform');
      return;
    }
    const speed = d.dy / Math.max(1, e.timeStamp - d.t);
    if (d.dy > 100 || (d.dy > 48 && speed > 0.7)) {
      /* 아래로 미끄러져 닫힌다 — globals.css 의 [data-dismiss='down']. 인라인 자리는 닫는 순간(useLayoutEffect) 지운다 */
      ref.current?.setAttribute('data-dismiss', 'down');
      onClose();
      return;
    }
    f.style.removeProperty('transform');
    if (d.dy > 0)
      f.animate(
        [{ transform: `translateY(${d.dy}px)` }, { transform: 'translateY(0)' }],
        {
          duration: 220,
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        }
      );
  };

  return (
    <dialog
      ref={ref}
      data-drawer
      data-built={built ? '' : undefined}
      data-quiet={quiet ? '' : undefined}
      style={
        {
          viewTransitionName: flyNames !== 'none' ? 'nav-sheet' : undefined,
          /* PC 팝업의 자리 · 높이 한도 — globals.css 의 dialog[data-drawer] 가 읽는다(휴대폰 시트는 안 읽는다) */
          '--pop-top': `${anchor.top}px`,
          '--pop-right': `${anchor.edge}px`,
          '--pop-max': `calc(100dvh - ${anchor.top}px - 1rem)`,
        } as CSSProperties
      }
      aria-label="메뉴"
      /*
       * 브라우저가 판을 닫았다고 알려 올 때는 값만 맞춘다. 여기서 연출을 부르면
       * 안 된다 — 거꾸로 닫는 연출이 판을 닫는 순간에도 이 알림이 오기 때문에,
       * 연출이 스스로를 끊게 된다.
       */
      onClose={onDismissed}
      /*
       * ESC 를 직접 받아 닫는다. <dialog> 는 원래 ESC 로 닫히지만 크롬이
       * 그것을 '사용자가 직접 눌렀는가'와 묶어 두어 안 닫힐 때가 있다
       * (components/modal.tsx 에 같은 이야기가 적혀 있다).
       */
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      /* 배경을 눌러도 닫는다 — PC 만. 휴대폰은 손을 뗄 때(endDrag) 정한다 — 두 번 닫지 않게 여기선 건너뛴다 */
      onClick={(e) => {
        if (!window.matchMedia(DESK_MEDIA).matches) return;
        if (e.target === ref.current) onClose();
      }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(e) => {
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      }}
      /*
       * 살짝 비친다(bg-surface/85). 유리처럼 뒤가 어렴풋이 보이되, 글자가 뒤와
       * 섞일 만큼은 아니다. 뒤를 흐리는 것은 PC 에서만 — 아이폰 사파리는 흐린
       * 면 위로 무언가 움직일 때마다 다시 계산하다 깜빡인다(MobileTopBar 참고).
       * 모서리 · 자리 · 크기는 globals.css 의 dialog[data-drawer] 가 준다. 뒤 배경(backdrop)은 PC 에서
       * 투명 — 팝업은 뒤를 가리지 않는다(그래도 모달이라 바깥을 누르면 닫힌다).
       *
       * 안의 것을 올렸을 때의 배경은 반투명한 잉크색(bg-ink/6)이다. 비치는 판 위에
       * 불투명한 surface-2 를 얹으면 밝은 테마에서 판과 거의 같은 색이 되어, 무엇에
       * 올려 두었는지 안 보였다. 잉크는 테마마다 뒤집히므로 어두운 테마에서는
       * 밝은 쪽으로 옅게 뜬다.
       *
       * 흐린 글자(묶음 제목·설명·'내 정보')도 muted 대신 잉크 65% 로 둔다. 판이
       * 비치면 밝은 테마의 바탕이 흰색보다 한 단계 어두워져, 11px 짜리 muted 글자의
       * 대비가 4.4:1 로 기준(4.5:1) 밑으로 내려갔다. 잉크 65% 는 5.5:1 쯤이다.
       */
      /*
       * 휴대폰은 아래 시트(폭 전체 · 불투명 — globals.css 의 '휴대폰의 더보기'), PC 는 도크와 같은 유리
       * 팝업(w-72 · 비침 · 테두리 · 그림자).
       */
      className="ui-chrome w-full border-0 bg-transparent p-0 text-ink shadow-none backdrop:bg-transparent desk:w-72 desk:border desk:border-line/70 desk:bg-surface/85 desk:shadow-xl desk:backdrop:bg-transparent desk:backdrop-blur-xl"
    >
      {/*
        휴대폰(2026-10-14 2판) — 아이폰 앱 폴더처럼. dialog 는 화면 전체의 흐린 막(globals.css 의 휴대폰 dialog[data-drawer])이고,
        그 가운데에 반투명 유리 폴더([data-folder])와 그 위 흰 '메뉴' 글자. 뒤(본문)가 흐려진 채 비친다. 막을 누르면 닫힌다.
        PC 팝업은 그대로 — 이 바깥 div 는 desk:contents 로 사라지고, 높이 한도(--pop-max)를 창에서 물려받아 안의 목록만 굴린다.
      */}
      <div data-scrim className="grid h-full w-full place-items-center desk:contents">
        <div className="flex w-full max-w-full flex-col items-center gap-2.5 desk:contents">
          {/* 판 위 '메뉴' 글자는 뺐다(2026-10-15 사용자) — 이름은 dialog 의 aria-label 이 맡는다 */}
          <div
            ref={folder}
            data-folder
            tabIndex={-1}
            className="relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-6.25rem)] flex-col outline-none desk:max-h-[inherit]"
          >
            {/* 휴대폰 폴더엔 닫기 단추가 없다(아이폰처럼) — 막 누르기 · 아래로 끌기 · Esc 로 닫는다. PC 팝업도 Esc · 바깥으로 */}

            <nav className="min-h-0 flex-1 overflow-hidden px-0 py-0 desk:overflow-x-hidden desk:overflow-y-auto desk:overscroll-contain desk:p-2">
              {/*
            휴대폰은 아이폰 앱 폴더처럼 — 둥근 네모 아이콘 + 밑 이름, 한 줄에 넷(2026-10-13 김민). 제목 없는 묶음(홈 · 투구 · …)은
            한 판으로 이어 붙인다(묶음마다 한 줄이면 칸이 비었다). PC 팝업은 예전 목록 그대로(desk:).
          */}
              {groups
                .reduce<NavGroup[]>((out, g) => {
                  const last = out[out.length - 1];
                  if (!g.title && last && !last.title)
                    out[out.length - 1] = { items: [...last.items, ...g.items] };
                  else out.push(g);
                  return out;
                }, [])
                .map((group, gi) => (
                  <div
                    key={group.title ?? `g${gi}`}
                    /*
                     * 제목 없는 묶음(홈·영상·트레이닝·분석)은 한 줄씩이라 붙여 두고,
                     * 제목 있는 묶음 앞에서만 선을 긋고 띈다. 묶음마다 같은 간격을
                     * 주면 위 넷 사이가 제목 자리처럼 비어 보였다.
                     */
                    className={
                      group.title
                        ? 'mt-3 grid grid-cols-[repeat(3,minmax(0,5.25rem))] justify-center gap-x-4 gap-y-3 pad:grid-cols-[repeat(4,minmax(0,6.5rem))] pad:gap-x-6 pad:gap-y-5 desk:mt-2 desk:block desk:space-y-0.5 desk:border-t desk:border-line/70 desk:pt-2'
                        : 'grid grid-cols-[repeat(3,minmax(0,5.25rem))] justify-center gap-x-4 gap-y-3 pad:grid-cols-[repeat(4,minmax(0,6.5rem))] pad:gap-x-6 pad:gap-y-5 desk:block desk:space-y-0.5 desk:pt-0'
                    }
                  >
                    {group.title && (
                      <p className="col-span-3 -mb-1 px-1 text-[11px] pad:col-span-4 pad:text-xs font-semibold tracking-normal text-(--folder-fg)/60 desk:col-span-1 desk:mb-0 desk:px-3 desk:pb-1 desk:text-xs desk:text-ink/65">
                        {group.title}
                      </p>
                    )}
                    {group.items.map((item) => {
                      const Icon = NAV_ICONS[item.icon];
                      const active = isActive(item.href);
                      const i = flyIndex(item.href);
                      const quick = quickHrefs.includes(item.href);
                      const fly = flyNames === 'all' || (flyNames === 'quick' && quick);
                      const grow = grows && !quick;
                      /*
                       * 잠긴 탭(첫 설정 전, lib/nav.ts applyLocks)은 흐리게 + 아이콘 오른쪽 아래 자물쇠 — 막대와 같은 NavGlyph.
                       * 흐림은 아이콘 · 이름에 따로 단다(링크에 달면 날아가는 아이콘에 안 실린다 — NavGlyph). 지금 그 설정 화면에
                       * 있으면(파란 줄) 흐리지 않는다 — 파란 바탕 위 흰 글자를 흐리면 읽히지 않는다.
                       */
                      const dim = item.locked && !active;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          aria-label={
                            item.locked ? `${item.label}(설정 전)` : undefined
                          }
                          data-locked={item.locked ? '' : undefined}
                          data-tile
                          onClick={onNavigate}
                          /*
                      누르는 칸은 44px 이상 — 예전에는 32px 남짓이라 옆 항목을 잘못 누르곤 했다.
                    */
                          /*
                           * 휴대폰 폴더에는 하단 탭에 있는 넷(홈 · 투구 · 트레이닝 · 영양)이 없다(2026-10-14 홈, 2026-10-16 나머지 셋 — 같은 길이 두 번).
                           * 잠긴 탭은 주소가 설정 화면으로 바뀌어 이름 · 그림으로 견준다. PC 팝업에는 그대로
                           */
                          className={`${inTabBar(item) ? 'hidden desk:flex' : 'flex'} min-w-0 flex-col items-center gap-1.5 rounded-2xl px-0.5 py-0.5 text-center text-(--folder-fg) transition-[colors,transform] duration-75 motion-safe:active:scale-95 desk:min-h-10 desk:flex-row desk:gap-3 desk:rounded-lg desk:px-3 desk:py-1.5 desk:text-left desk:text-ink desk:active:scale-100 ${
                            active
                              ? 'desk:bg-sky desk:text-white'
                              : 'desk:hover:bg-ink/6 desk:active:bg-ink/6'
                          }`}
                        >
                          {/*
                      휴대폰 — 아이폰 앱 아이콘(유리 반사 · 입체 그림, components/app-icon.tsx, 2026-10-13 김민 "3D · 글라스"). 지금 화면은 파란 테두리,
                      잠긴 탭은 흐리게 + 자물쇠. PC 팝업은 예전 아이콘(NavGlyph — 날아가는 연출 이름표가 여기 붙는다).
                    */}
                          <span
                            className={`relative desk:hidden ${dim ? 'opacity-50' : ''}`}
                          >
                            <AppIcon
                              Icon={Icon}
                              tint={NAV_TINT[item.icon]}
                              look="clear"
                              active={active}
                              size="var(--tile)"
                              className="tile-icon"
                            />
                            {item.locked && (
                              <span className="absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-(--folder-fg)/20 text-(--folder-fg) backdrop-blur">
                                <Lock aria-hidden className="h-3 w-3" />
                              </span>
                            )}
                          </span>
                          <span className="hidden desk:contents">
                            <NavGlyph
                              Icon={Icon}
                              locked={item.locked}
                              dim={dim}
                              className="h-5 w-5"
                              style={
                                fly
                                  ? flyStyle(`nav-fly-${i}`, i, 'fly')
                                  : grow
                                    ? growStyle(
                                        `nav-grow-${i}`,
                                        growOrder.get(item.href) ?? 0
                                      )
                                    : undefined
                              }
                            />
                          </span>
                          <span
                            className={`min-w-0 max-w-full truncate text-[12px] leading-4 pad:text-footnote pad:leading-5 text-(--folder-fg)/92 desk:text-sm desk:leading-5 desk:text-inherit ${active ? 'font-semibold' : 'font-medium'} ${dim ? 'opacity-55' : ''}`}
                          >
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              {/* 설정 — 위 막대의 톱니가 폴더로 들어왔다(휴대폰만, 2026-10-14 사용자 "홈 우상단엔 알림만"). 창이라 링크가 아니라 단추 */}
              <div className="mt-3 grid grid-cols-[repeat(3,minmax(0,5.25rem))] justify-center gap-x-4 gap-y-3 pad:grid-cols-[repeat(4,minmax(0,6.5rem))] pad:gap-x-6 pad:gap-y-5 desk:hidden">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  data-tile
                  onClick={(e) => {
                    /*
                     * 휴대폰은 폴더를 닫지 않는다 — 설정 창이 그 위에 뜨고, 닫으면 폴더가 그대로 있다(2026-10-15 김민 "설정 · 내 정보에서 나올 때
                     * 더보기가 새로 뜨듯 다시 나와 부자연스럽다"). 설정 단추는 휴대폰에만 있다.
                     */
                    onSettings(e.currentTarget);
                  }}
                  className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-0.5 py-0.5 text-center text-(--folder-fg) transition-[colors,transform] duration-75 motion-safe:active:scale-95"
                >
                  <AppIcon
                    Icon={NAV_ICONS.settings}
                    tint={NAV_TINT.settings}
                    look="clear"
                    size="var(--tile)"
                    className="tile-icon"
                  />
                  <span className="min-w-0 max-w-full truncate text-[12px] leading-4 pad:text-footnote pad:leading-5 font-medium text-(--folder-fg)/92">
                    설정
                  </span>
                </button>
              </div>
            </nav>

            {/*
                메뉴를 닫고 내 정보 창을 연다.
          내 정보가 화면이 아니라 창이 되면서 여기도 링크가 아니라 버튼이다.
        */}
            <button
              type="button"
              onClick={(e) => {
                /* 휴대폰은 폴더를 그대로 두고 그 위에 내 정보 창(설정과 같다), PC 는 팝업을 거둔다 */
                if (window.matchMedia(DESK_MEDIA).matches) onNavigate();
                onProfile(e.currentTarget);
              }}
              className="mt-4 flex w-full shrink-0 items-center gap-3 rounded-2xl border-t border-(--folder-fg)/20 px-1 pt-3 pb-0 text-left transition-colors duration-75 hover:bg-(--folder-fg)/10 desk:mt-0 desk:rounded-none desk:rounded-b-2xl desk:border-line desk:px-3 desk:py-2 desk:pb-2 desk:hover:bg-ink/6"
            >
              <Avatar nickname={nickname} avatarUrl={avatarUrl} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-(--folder-fg) desk:text-ink">
                  {nickname}
                </span>
                <span className="block text-xs text-(--folder-fg)/65 desk:text-ink/65">
                  {isAdmin ? '관리자' : '내 정보'}
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
