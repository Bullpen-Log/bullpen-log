'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link, { useLinkStatus } from 'next/link';
import { X } from 'lucide-react';
import { NAV_ICONS } from '@/components/nav-icons';
import { usePathname } from 'next/navigation';
import type { NavGroup, NavItem } from '@/lib/nav';
import { MORE_HREF } from '@/lib/nav';
import { BaseballMark } from '@/components/logo';
import { Modal } from '@/components/modal';
import { ProfilePanel, type ProfileData } from '@/components/profile-panel';
import { SettingsPanel, type SettingsData } from '@/components/settings-panel';

/**
 * 현재 위치 판정. 하위 경로도 같은 메뉴로 본다.
 * 단 '/'로 시작하는 다른 메뉴를 잘못 물지 않게 정확히 비교한다.
 */
function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * PC 화면의 틀 — 왼쪽 위 로고, 오른쪽 위 한 줄, 그리고 덮어서 펴는 상세 메뉴.
 *
 * 메뉴가 세 번 옮겨 다녔고 그때마다 이유가 있었다.
 *
 * 처음에는 왼쪽에 이름까지 붙은 세로 메뉴가 늘 펼쳐져 있었다. 그 폭(13rem)만큼
 * 본문 자리가 한쪽으로 밀려서, 가운데 정렬한 본문이 화면 한가운데가 아니라
 * 한쪽으로 치우쳐 보였다.
 *
 * 다음에는 아이콘만 남긴 좁은 세로 막대로 줄였다. 치우침은 좌우를 같은 폭으로
 * 비워 없앴지만, 화면 오른쪽을 위에서 아래까지 차지하고도 든 것은 아이콘
 * 대여섯 개뿐이라 아래쪽 대부분이 빈 띠로 남았다.
 *
 * 지금은 그 막대를 접어 오른쪽 위 한 줄로 눕혔다. 로고와 마주 보는 자리이고,
 * 본문은 좌우 어느 쪽도 내주지 않는다.
 *
 * 이름과 설명이 필요한 전체 메뉴는 격자를 눌렀을 때만 덮어서 편다.
 */
export function AppNav({
  groups,
  quick,
  tabs,
  nickname,
  avatarUrl,
  isAdmin,
  profile,
  settings,
  today,
}: {
  /** 상세 메뉴에 펼칠 전체 목록 */
  groups: NavGroup[];
  /** 막대에 늘 보일 항목들 */
  quick: NavItem[];
  /**
   * 휴대폰 하단 탭.
   *
   * 예전에는 레이아웃이 따로 그렸다. 그런데 '더보기'가 사이드바를 열려면 그
   * 여닫이(open)를 쥔 이곳과 이어져 있어야 한다. 상단 바도 이미 여기서 그린다.
   */
  tabs: NavItem[];
  nickname: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** '내 정보' 창에서 고칠 값들 */
  profile: ProfileData;
  /** '설정' 창에서 고칠 값들 */
  settings: SettingsData;
  /** 오늘 날짜(YYYY-MM-DD) — 생년월일에서 앞날을 못 고르게 막는 데 쓴다 */
  today: string;
}) {
  const isActive = useIsActive();
  /*
   * 상세 메뉴를 펴 두었는가.
   *
   * 화면을 옮기면 저절로 닫힌다 — 메뉴 안의 링크가 누를 때 직접 닫는다.
   * 주소가 바뀌는 것을 지켜보다 닫는 방법도 있지만, 그러면 화면이 한 번 그려진
   * 뒤에 또 그려진다. 누른 그 자리에서 닫는 편이 맞다.
   */
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /*
   * 사이드바가 '만들어지는' 연출 (PC).
   *
   * 네모 버튼을 누르면 사이드바가 그 버튼 자리에서 펼쳐지고, 오른쪽 위의 아이콘
   * 넷(홈·영상·트레이닝·분석)이 차례로 사이드바의 제자리로 날아 들어간다.
   * 사이드바 맨 위 네 줄이 바로 그 넷이라, 막대에 있던 것이 판으로 옮겨 가며
   * 판이 되는 것처럼 보인다.
   *
   * 브라우저의 View Transition 으로 한다. 옛 모습(막대)과 새 모습(판)에서 같은
   * 이름표를 단 것끼리 브라우저가 이어서 움직여 준다. 이름표는 연출하는 동안만
   * 단다 — 늘 달아 두면 화면을 옮길 때의 전환에도 끼어들어 아이콘이 엉뚱하게 난다.
   *
   * 순서는 아이콘이 먼저다. 네 아이콘이 차례로 판의 제자리에 날아가 앉은 뒤에
   * 판이 버튼 자리에서 펼쳐져 그 밑을 채운다. 판이 먼저 생기면 판은 다 있는데
   * 아이콘만 막대에 남아 있는 순간이 생겨, 둘이 따로 노는 것처럼 보였다.
   * 닫을 때는 정확히 거꾸로 — 판이 먼저 버튼으로 말려 들어가고, 남은 아이콘이
   * 막대의 제자리로 돌아간다.
   *
   *   idle       평소
   *   building   여는 연출 중. 옛 모습(닫힘)에서는 막대 쪽, 새 모습(열림)에서는 판
   *              쪽에 이름표가 있다.
   *   built      열려 있음(연출이 끝남). 판의 여는 애니메이션을 계속 꺼 둔다 —
   *              여기서 켜면 다 열린 판이 오른쪽에서 한 번 더 밀려 들어온다.
   *   unbuilding 닫는 연출 중. 이름표 규칙은 building 과 같다(열림이면 판, 닫힘이면
   *              막대). 판이 제 닫는 움직임(미끄러져 나감)을 하지 않게 멈춰 둔다.
   */
  const [sheet, setSheet] = useState<'idle' | 'building' | 'built' | 'unbuilding'>(
    'idle'
  );
  const sheetTransition = useRef<ViewTransition | null>(null);

  /*
   * 판에 남아 있는 움직임을 먼저 끝낸다.
   *
   * 닫자마자(0.22초 안에) 다시 누르면 판이 아직 미끄러져 나가는 중이다. 그
   * 모습이 연출의 '옛 모습'에 같이 찍혀서, 반쯤 남은 판 위로 새 판이 펼쳐진다.
   * 닫을 때도 같다 — 옆에서 밀려 들어오는 중이던 판이 반쯤 찍힌다.
   */
  const settleDrawer = () => {
    document.querySelectorAll('dialog[data-drawer]').forEach((d) => {
      document.getAnimations().forEach((a) => {
        if ((a.effect as KeyframeEffect | null)?.target === d) a.finish();
      });
    });
  };

  const openBuilt = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* 이 기능이 없는 브라우저나 움직임을 줄인 사람에게는 예전처럼 옆에서 밀려 나온다 */
    if (typeof document.startViewTransition !== 'function' || reduce) {
      setOpen(true);
      return;
    }

    settleDrawer();

    const root = document.documentElement;
    root.setAttribute('data-sheet-building', '');
    /* 옛 모습: 막대 쪽에 이름표를 단다. 브라우저가 이 모습을 찍은 뒤에 연다. */
    flushSync(() => setSheet('building'));

    const vt = document.startViewTransition(() => {
      /* 새 모습: 판을 연다. 이름표는 판 쪽으로 옮겨 간다. */
      flushSync(() => setOpen(true));
    });
    sheetTransition.current = vt;
    /*
     * 연출이 건너뛰어진 경우 — 창이 가려져 있었거나, 다른 전환이 끼어들었거나.
     * 그러면 판이 아무 움직임 없이 툭 열려 있으니, 평소처럼 옆에서 밀려 나오게
     * 되돌린다(idle 이 되면 판의 여는 애니메이션이 다시 켜져 그 자리에서 돈다).
     */
    vt.ready.catch(() => {
      setSheet((now) => (now === 'building' ? 'idle' : now));
    });
    vt.finished.finally(() => {
      root.removeAttribute('data-sheet-building');
      sheetTransition.current = null;
      setSheet((now) => (now === 'building' ? 'built' : now));
    });
  };

  /* 그냥 닫기 — 판이 옆으로 미끄러져 나간다. 메뉴를 눌러 화면을 옮길 때 쓴다. */
  const closeMenu = () => {
    /* 연출 도중에 닫으면 연출을 끝까지 기다리지 않고 바로 거둔다 */
    sheetTransition.current?.skipTransition();
    setOpen(false);
    setSheet('idle');
  };

  /*
   * 거꾸로 닫기 (PC) — X · 배경 · Esc 로 닫을 때.
   *
   * 메뉴를 눌러 다른 화면으로 갈 때는 이것을 쓰지 않는다. 화면이 바뀌는 전환이
   * 따로 돌고, 브라우저는 전환을 한 번에 하나만 한다 — 둘을 겹치면 뒤에 온
   * 것이 앞의 것을 끊어서 아이콘이 날아가다 사라진다.
   */
  const closeBuilt = () => {
    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      !desktop ||
      reduce ||
      typeof document.startViewTransition !== 'function' ||
      sheetTransition.current
    ) {
      closeMenu();
      return;
    }

    settleDrawer();

    const root = document.documentElement;
    root.setAttribute('data-sheet-closing', '');
    /* 옛 모습: 열린 판 쪽에 이름표. 판이 제 닫는 움직임을 하지 않게 멈춘다. */
    flushSync(() => setSheet('unbuilding'));

    const vt = document.startViewTransition(() => {
      /* 새 모습: 판을 닫는다. 이름표는 막대 쪽으로 돌아간다. */
      flushSync(() => setOpen(false));
    });
    sheetTransition.current = vt;
    /* 건너뛰어져도 판은 이미 닫혀 있다 — 따로 할 일이 없다 */
    vt.ready.catch(() => {});
    vt.finished.finally(() => {
      root.removeAttribute('data-sheet-closing');
      sheetTransition.current = null;
      setSheet('idle');
    });
  };

  /* 연출 중 — 여는 것이든 닫는 것이든 */
  const choreo = sheet === 'building' || sheet === 'unbuilding';
  /* 옛·새 모습 가운데 닫힌 쪽이면 막대에, 열린 쪽이면 판에 이름표 */
  const namesOnBar = choreo && !open;
  const namesOnSheet = choreo && open;

  /*
   * 저장하고 나면 서버가 어딘가로 보내는데, 그 '어딘가'를 지금 보던 화면으로
   * 둔다. 창은 어느 화면 위에서나 열리므로, 고정해 두면 설정 하나 바꿨다고
   * 엉뚱한 화면으로 끌려간다.
   */
  const here = usePathname();

  /*
   * 창이 어디서 튀어나올지 — 방금 누른 버튼의 한가운데.
   *
   * 누른 버튼은 이벤트가 알려준다(currentTarget). PC 와 모바일에 같은 버튼이
   * 한 벌씩 있지만, 눌린 쪽이 곧 보이는 쪽이라 따로 가려낼 것이 없다.
   */
  const [popFrom, setPopFrom] = useState<{ x: number; y: number } | null>(null);

  const openFrom = (el: HTMLElement | null, show: (on: boolean) => void) => {
    const r = el?.getBoundingClientRect();
    setPopFrom(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    show(true);
  };

  return (
    <>
      {/*
        로고 — 왼쪽 위.

        본문 위쪽 여백(lg:pt-16)이 이 높이만큼 비워져 있어 글과 겹치지 않는다.
      */}
      <Link
        href="/today"
        /*
         * 연출 중에는 이름표를 뗀다. 이름표가 붙은 것은 연출하는 동안 뒤 어두운
         * 막 위로 따로 그려져서, 다 끝날 때까지 안 어두워졌다가 마지막에 툭
         * 어두워진다.
         */
        style={{ viewTransitionName: choreo ? 'none' : 'shell-logo' }}
        className="fixed left-6 top-5 z-40 hidden items-center gap-2 lg:flex"
      >
        <BaseballMark className="h-8 w-8" />
        <span className="text-display text-base leading-none text-ink">
          BULLPEN LOG
        </span>
      </Link>

      {/*
        오른쪽 위 한 줄 — 옮겨 다니는 것과 내 것.

        세로 막대를 접어 가로로 눕혔다. 막대는 화면 오른쪽을 세로로 통째로
        차지하는데, 정작 들어 있는 것은 아이콘 대여섯 개뿐이라 아래쪽 대부분이
        빈 띠로 남았다. 한 줄로 두면 그 폭이 전부 본문으로 돌아온다.

        구글 첫 화면과 같은 차례다 — 자주 가는 곳들, 칸을 나누는 선, 전체
        메뉴(격자), 그리고 맨 끝에 내 것. 늘 같은 자리에 같은 순서로 있으면
        찾지 않고 손이 간다.

        배경을 깔지 않는다. 띠를 두르면 화면이 위아래로 잘려 보이는데, 여기
        있는 것은 '지금 보는 것'이 아니라 '옮겨 갈 곳'이라 본문 위에 얹혀
        있는 편이 맞다.
      */}
      <nav
        style={{ viewTransitionName: choreo ? 'none' : 'shell-topnav' }}
        aria-label="간편 이동"
        className="fixed right-4 top-3 z-40 hidden items-center gap-0.5 lg:flex"
      >
        {quick.map((item, i) => (
          <TopIcon
            key={item.href}
            item={item}
            active={isActive(item.href)}
            flyName={namesOnBar ? `nav-fly-${i}` : undefined}
            /* 판이 열려 있는 동안 막대에서는 빠진다 — 판으로 옮겨 간 것이다 */
            hidden={open}
            instant={choreo}
          />
        ))}

        <span aria-hidden className="mx-1.5 h-6 w-px bg-line" />

        <MenuSquares open={open} named={namesOnBar} onOpen={openBuilt} />

        <SettingsCog
          open={settingsOpen}
          onOpen={(el) => openFrom(el, setSettingsOpen)}
        />

        {/*
          내 정보는 넘어가지 않고 창으로 연다. 닉네임이나 목표 구속 하나
          고치자고 화면을 통째로 옮겼다가 다시 돌아오는 것은 품이 크다.
          문진처럼 길게 고칠 것은 창 안의 '자세히'로 간다.
        */}
        <button
          type="button"
          onClick={(e) => openFrom(e.currentTarget, setProfileOpen)}
          aria-haspopup="dialog"
          aria-expanded={profileOpen}
          aria-label="내 정보"
          title={`${nickname} — 내 정보`}
          className="ml-1 rounded-full ring-offset-2 ring-offset-page transition-[opacity,box-shadow] duration-75 hover:opacity-80 hover:ring-2 hover:ring-line-strong"
        >
          <Avatar nickname={nickname} avatarUrl={avatarUrl} />
        </button>
      </nav>

      <MobileTopBar
        nickname={nickname}
        avatarUrl={avatarUrl}
        settingsOpen={settingsOpen}
        onSettings={(el) => openFrom(el, setSettingsOpen)}
        profileOpen={profileOpen}
        onProfile={(el) => openFrom(el, setProfileOpen)}
      />

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="설정"
        description="어쩌다 한 번 고치는 것들입니다."
        origin={popFrom}
      >
        <SettingsPanel data={settings} returnTo={here} />
      </Modal>

      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="내 정보"
        description="사진과 몸 정보, 계정까지 여기서 다 고칩니다."
        origin={popFrom}
      >
        <ProfilePanel data={profile} avatarUrl={avatarUrl} today={today} />
      </Modal>

      <MobileTabs tabs={tabs} menuOpen={open} onMenu={() => setOpen(true)} />

      <DetailMenu
        groups={groups}
        nickname={nickname}
        avatarUrl={avatarUrl}
        isAdmin={isAdmin}
        isActive={isActive}
        open={open}
        onClose={closeBuilt}
        onNavigate={closeMenu}
        onDismissed={() => setOpen(false)}
        onProfile={(el) => openFrom(el, setProfileOpen)}
        flyHrefs={quick.map((q) => q.href)}
        named={namesOnSheet}
        built={sheet !== 'idle'}
        quiet={sheet === 'unbuilding'}
      />
    </>
  );
}

/**
 * 사이드바를 여는 네모 넷.
 *
 * lucide 의 LayoutGrid 를 직접 그린 것으로 바꿨다. 그림 하나로 오는 아이콘은
 * 통째로만 움직일 수 있는데, 여기서는 네 조각이 따로 돌아야 한다.
 *
 * 누르면 네모가 각자 제자리에서 반 바퀴 돈다. 차례로 조금씩 늦게 돌기
 * 시작한다 — 넷이 한꺼번에 돌면 그냥 아이콘 하나가 떠는 것처럼 보이고,
 * 어긋나게 돌아야 '네 조각짜리'라는 것이 읽힌다. 오른쪽에서 밀려 들어오는
 * 사이드바와 같은 시간 동안 돌아서, 둘이 한 동작으로 묶인다.
 *
 * 도는 것을 끝내는 일은 onAnimationEnd 가 맡는다. 마지막 네모가 끝날 때
 * 한 번만 끄면 되므로 넷째 것에만 건다 — 넷 다 걸면 첫째가 끝나는 순간
 * 나머지가 도는 중에 꺼진다.
 */
function MenuSquares({
  open,
  named,
  onOpen,
}: {
  open: boolean;
  /** 사이드바가 만들어지는 연출에서 이 버튼이 판이 된다 — 그 이름표를 단다 */
  named?: boolean;
  onOpen: () => void;
}) {
  const [spinning, setSpinning] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setSpinning(true);
        onOpen();
      }}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="전체 메뉴"
      title="전체 메뉴"
      style={named ? { viewTransitionName: 'nav-sheet' } : undefined}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-75 ${
        open ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <Squares spinning={spinning} named={named} onDone={() => setSpinning(false)} />
    </button>
  );
}

/**
 * 네모 넷 그림. spinning 이 켜지면 각자 제자리에서 반 바퀴 돈다.
 *
 * PC 막대의 버튼과 휴대폰 하단 탭의 '더보기'가 같이 쓴다. 둘이 여는 것이 같은
 * 사이드바라서, 여는 몸짓도 같아야 한다 — 화면 폭이 바뀌었다고 같은 메뉴가
 * 다르게 열리면 다른 메뉴인 줄 안다.
 *
 * 도는 것을 끝내는 일은 마지막 네모의 onAnimationEnd 가 맡는다(onDone).
 */
function Squares({
  spinning,
  named,
  onDone,
}: {
  spinning: boolean;
  /** 사이드바가 만들어지는 연출에서 네모마다 이름표를 달아 제자리에서 돌며 사라지게 한다 */
  named?: boolean;
  onDone: () => void;
}) {
  /* 왼위 → 오른위 → 왼아래 → 오른아래. 글 읽는 차례와 같게 돈다. */
  const corners = [
    'left-0 top-0',
    'right-0 top-0',
    'left-0 bottom-0',
    'right-0 bottom-0',
  ];

  return (
    <span aria-hidden className="relative block h-[1.15rem] w-[1.15rem]">
      {corners.map((at, i) => (
        <span
          key={at}
          className={`absolute h-[0.45rem] w-[0.45rem] rounded-[2px] border-[1.9px] border-current ${at} ${
            spinning ? 'motion-safe:animate-square-spin' : ''
          }`}
          style={
            {
              '--sq': i,
              ...(named ? { viewTransitionName: `nav-sq-${i}` } : {}),
            } as React.CSSProperties
          }
          onAnimationEnd={i === 3 ? onDone : undefined}
        />
      ))}
    </span>
  );
}

/**
 * 설정을 여는 톱니 — 글자 없이 그림만.
 *
 * 이름을 안 붙였다. 톱니는 설명이 필요 없을 만큼 뜻이 굳은 그림이고, 줄에
 * 늘어선 다른 아이콘과 모양이 같아야 한 덩이로 읽힌다.
 *
 * 화면으로 넘어가지 않고 창을 연다. 내 정보와 같은 방식이다 — 테마 하나
 * 바꾸자고 보던 화면을 떠났다가 돌아오는 것은 품이 크고, 돌아오면 어디를
 * 보고 있었는지 다시 찾아야 한다.
 *
 * 누르면 한 바퀴 돈다. 창이 자라나는 동안 이 자리에서 무슨 일이 일어나는지
 * 알려주는 몫이다. 돌기를 끝내는 것은 onAnimationEnd 가 맡는다 — 시간을 재서
 * 끄면 CSS 에 적은 길이와 어긋나기 쉽다.
 */
function SettingsCog({
  open,
  onOpen,
}: {
  open: boolean;
  onOpen: (el: HTMLElement) => void;
}) {
  const [spinning, setSpinning] = useState(false);
  const Icon = NAV_ICONS.settings;

  return (
    <button
      type="button"
      title="설정"
      aria-label="설정"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(e) => {
        setSpinning(true);
        onOpen(e.currentTarget);
      }}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-75 ${
        open ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <Icon
        aria-hidden
        className={spinning ? 'h-5 w-5 motion-safe:animate-cog' : 'h-5 w-5'}
        strokeWidth={open ? 2.4 : 1.9}
        onAnimationEnd={() => setSpinning(false)}
      />
    </button>
  );
}

/**
 * 위쪽 줄에 들어가는 동그란 아이콘 하나.
 *
 * 이름은 붙이지 않고 마우스를 올렸을 때만 알려준다(title). 다섯 칸에 글자를
 * 모두 적으면 줄이 화면 절반을 차지해, 로고와 부딪힌다.
 *
 * 지금 보고 있는 곳은 옅은 바탕으로만 표시한다. 다른 곳처럼 파랗게 채우면
 * 본문 위에 얹힌 줄에서 그것만 너무 튀어, 눈이 자꾸 그리로 간다.
 */
function TopIcon({
  item,
  active,
  flyName,
  hidden,
  instant,
}: {
  item: NavItem;
  active: boolean;
  /** 사이드바가 만들어지는 연출에서 이 아이콘이 판으로 날아간다 — 그 이름표 */
  flyName?: string;
  /**
   * 사이드바가 열려 있는 동안 막대에서 빠진다.
   *
   * 빠질 때는 즉시, 돌아올 때는 천천히다. 빠질 때 천천히 옅어지면 판으로
   * 날아가는 아이콘과 제자리에서 옅어지는 아이콘이 한동안 둘로 보인다.
   * 돌아올 때(판을 닫을 때)는 판이 미끄러져 나가는 동안 제자리에 떠오른다.
   */
  hidden?: boolean;
  /**
   * 연출 중에는 옅어지고 짙어지는 것 없이 바로 바뀐다. 연출이 이 아이콘을 날려
   * 보내는 동안 제자리에서 따로 떠오르면 한 아이콘이 둘로 보인다.
   */
  instant?: boolean;
}) {
  const Icon = NAV_ICONS[item.icon];
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full ${
        hidden
          ? 'opacity-0 [transition:none]'
          : instant
            ? 'opacity-100 [transition:none]'
            : 'opacity-100 [transition:color_75ms,background-color_75ms,opacity_240ms_ease-out]'
      } ${active ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
    >
      <TopIconFace Icon={Icon} active={active} flyName={flyName} />
    </Link>
  );
}

/**
 * 막대 아이콘의 얼굴 — 누르는 즉시 켜진 모습이 된다.
 *
 * 화면이 실제로 바뀌는 것은 서버가 새 화면을 보내 준 뒤다. 그동안 아무 표시가
 * 없으면 '눌렸나?' 하고 한 번 더 누르게 된다 — 느리다는 느낌의 큰 몫이 이
 * 침묵이었다. 링크가 움직이기 시작한 순간(useLinkStatus 의 pending)부터 켜진
 * 색으로 바꿔, 누른 곳이 바로 대답하게 한다.
 */
function TopIconFace({
  Icon,
  active,
  flyName,
}: {
  Icon: (typeof NAV_ICONS)[keyof typeof NAV_ICONS];
  active: boolean;
  flyName?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending && !active && (
        <span
          aria-hidden
          className="motion-safe:animate-fade-in absolute inset-0 rounded-full bg-sky/15"
        />
      )}
      <Icon
        aria-hidden
        className={`relative h-5 w-5 ${pending ? 'text-sky' : ''}`}
        strokeWidth={active || pending ? 2.4 : 1.9}
        style={flyName ? { viewTransitionName: flyName } : undefined}
      />
    </>
  );
}

/**
 * '더보기'로 펴는 상세 메뉴.
 *
 * 화면을 덮는 판으로 둔다. 막대를 그 자리에서 넓히는 방법도 있었지만, 그러면
 * 열고 닫을 때마다 본문 폭이 바뀌어 글이 다시 흐른다 — 읽던 줄을 놓친다.
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
 * 테마 고르기는 여기 두지 않았다. 하루에 한 번 누를까 말까 한 것이 메뉴를 열
 * 때마다 눈에 들어올 이유가 없다. 설정 화면에 있다.
 */
function DetailMenu({
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
  flyHrefs,
  named,
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
  /** 막대에서 날아오는 아이콘들의 주소. 이 차례가 곧 이름표 번호다. */
  flyHrefs: string[];
  /** 연출의 새 모습 — 판과 아이콘에 이름표를 단다 */
  named: boolean;
  /** 연출로 열렸다 — 판의 여는 애니메이션을 끈다(연출이 대신했다) */
  built: boolean;
  /** 거꾸로 닫는 연출 중 — 판의 닫는 움직임을 끈다(연출이 대신한다) */
  quiet: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  /*
   * showModal() 은 DOM 을 직접 건드리는 일이라 effect 에서 부른다.
   *
   * useLayoutEffect 다. 사이드바가 만들어지는 연출은 '판이 열린 새 모습'을
   * 브라우저가 찍기 전에 판이 이미 열려 있어야 한다. 화면을 그린 뒤에 도는
   * useEffect 로는 그 순서가 보장되지 않는다.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-drawer
      data-built={built ? '' : undefined}
      data-quiet={quiet ? '' : undefined}
      style={named ? { viewTransitionName: 'nav-sheet' } : undefined}
      aria-label="전체 메뉴"
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
      /* 배경을 눌러도 닫는다. 배경 클릭은 dialog 자기 자신을 목표로 삼는다. */
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="h-full w-72 border-l border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-shade/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="text-heading text-sm text-ink">전체 메뉴</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {groups.map((group, gi) => (
            <div key={group.title ?? `g${gi}`} className="space-y-1">
              {group.title && (
                <p className="px-3 pb-1 text-[11px] font-semibold tracking-normal text-muted">
                  {group.title}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-75 ${
                      active
                        ? 'bg-sky text-white'
                        : 'text-ink hover:bg-surface-2 active:bg-surface-2'
                    }`}
                  >
                    <Icon
                      aria-hidden
                      className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0"
                      strokeWidth={active ? 2.4 : 1.9}
                      style={
                        named && flyHrefs.includes(item.href)
                          ? {
                              viewTransitionName: `nav-fly-${flyHrefs.indexOf(item.href)}`,
                            }
                          : undefined
                      }
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-sm ${active ? 'font-semibold' : 'font-medium'}`}
                      >
                        {item.label}
                      </span>
                      {/* 골라져 있을 때는 흰 글자 위라 설명을 조금 눕혀 둔다 */}
                      {item.desc && (
                        <span
                          className={`mt-0.5 block text-[11px] leading-relaxed break-keep ${
                            active ? 'text-white/75' : 'text-muted'
                          }`}
                        >
                          {item.desc}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/*
          메뉴를 닫고 내 정보 창을 연다.
          내 정보가 화면이 아니라 창이 되면서 여기도 링크가 아니라 버튼이다.
        */}
        <button
          type="button"
          onClick={(e) => {
            onNavigate();
            onProfile(e.currentTarget);
          }}
          className="flex w-full shrink-0 items-center gap-3 border-t border-line px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-left transition-colors duration-75 hover:bg-surface-2"
        >
          <Avatar nickname={nickname} avatarUrl={avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">
              {nickname}
            </span>
            <span className="block text-xs text-muted">
              {isAdmin ? '관리자' : '내 정보'}
            </span>
          </span>
        </button>
      </div>
    </dialog>
  );
}

/**
 * 동그란 아바타 — 올린 사진이 있으면 사진, 없으면 이름 첫 글자.
 *
 * 사진 주소는 서명된 임시 주소라 한 시간쯤 살아 있다. next/image 를 쓰지 않는
 * 이유가 여기 있다 — 도메인을 미리 적어 둘 수 없고, 값이 계속 바뀌어 최적화한
 * 것을 돌려쓰지도 못한다.
 */
function Avatar({
  nickname,
  avatarUrl,
  size = 'md',
}: {
  nickname: string;
  avatarUrl?: string | null;
  size?: 'md' | 'lg';
}) {
  const box = size === 'lg' ? 'h-14 w-14 text-xl' : 'h-9 w-9 text-sm';

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        aria-hidden
        className={`shrink-0 rounded-full object-cover ring-1 ring-line ${box}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-sky font-bold text-white ${box}`}
    >
      {nickname.slice(0, 1)}
    </span>
  );
}

/**
 * 모바일 상단 바 — 로고와, 설정·내 정보를 여는 두 버튼.
 *
 * 좁은 화면에는 오른쪽 위 아이콘 줄이 없다. 그렇다고 설정과 내 정보를 갈 곳
 * 없이 두면 안 되므로, PC 의 그 두 버튼을 여기로 옮겨 놓는다. 누르면 같은
 * 창이 뜬다 — 기기가 달라도 하는 일과 보이는 것이 같아야 한다.
 */
function MobileTopBar({
  nickname,
  avatarUrl,
  settingsOpen,
  onSettings,
  profileOpen,
  onProfile,
}: {
  nickname: string;
  avatarUrl: string | null;
  settingsOpen: boolean;
  onSettings: (el: HTMLElement) => void;
  profileOpen: boolean;
  onProfile: (el: HTMLElement) => void;
}) {
  const Cog = NAV_ICONS.settings;
  /*
   * 톱니가 한 바퀴 돈다 — PC 막대의 톱니와 같다(SettingsCog).
   * 화면 폭이 바뀌었다고 같은 버튼이 다르게 대답하면 다른 버튼인 줄 안다.
   */
  const [spinning, setSpinning] = useState(false);

  return (
    <header
      /*
       * 본문이 바뀌는 동안 상단 바는 움직이지 않는다.
       *
       * 뒤 흐림(backdrop-blur)은 뺐다. 바탕이 95% 불투명이라 흐림은 거의 안
       * 보이는데, 아이폰 사파리는 그 위로 무언가 움직일 때마다 흐림을 매번 다시
       * 계산하다 깜빡인다. 설정·내 정보 창이 바로 이 바에서 튀어나오므로 창을
       * 열 때마다 바가 깜빡였다. 하단 탭도 같은 이유로 뺐다.
       */
      style={{ viewTransitionName: 'shell-topbar' }}
      className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-surface px-4 lg:hidden"
    >
      <Link href="/today" className="flex items-center gap-2">
        <BaseballMark className="h-8 w-8" />
        <span className="text-display text-base leading-none text-ink">
          BULLPEN LOG
        </span>
      </Link>

      <button
        type="button"
        onClick={(e) => {
          setSpinning(true);
          onSettings(e.currentTarget);
        }}
        aria-haspopup="dialog"
        aria-expanded={settingsOpen}
        aria-label="설정"
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors duration-75 active:bg-surface-2 active:text-ink"
      >
        <Cog
          aria-hidden
          className={spinning ? 'h-5 w-5 motion-safe:animate-cog' : 'h-5 w-5'}
          strokeWidth={1.9}
          onAnimationEnd={() => setSpinning(false)}
        />
      </button>

      <button
        type="button"
        onClick={(e) => onProfile(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={profileOpen}
        aria-label="내 정보"
        className="rounded-full transition-opacity duration-75 active:opacity-70"
      >
        <Avatar nickname={nickname} avatarUrl={avatarUrl} />
      </button>
    </header>
  );
}

/**
 * 하단 탭의 얼굴 — 누르는 즉시 하늘색이 된다(막대 아이콘의 TopIconFace 와 같은 까닭).
 *
 * 위의 짧은 막대는 여기서 켜지 않는다. 그 막대는 이름표(tab-indicator)가 하나라
 * 화면이 바뀔 때 옛 탭에서 새 탭으로 미끄러지는데, 누르자마자 새 탭에 따로 막대를
 * 그리면 막대가 둘이 된다. 색만 먼저 바꾼다.
 */
function TabFace({
  Icon,
  active,
  label,
}: {
  Icon: (typeof NAV_ICONS)[keyof typeof NAV_ICONS];
  active: boolean;
  label: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`flex flex-col items-center gap-0.5 transition-colors duration-75 ${
        pending ? 'font-semibold text-sky' : ''
      }`}
    >
      <Icon
        aria-hidden
        className="h-5 w-5"
        strokeWidth={active || pending ? 2.4 : 1.9}
      />
      {label}
    </span>
  );
}

/** 모바일 하단 탭바 */
function MobileTabs({
  tabs,
  menuOpen,
  onMenu,
}: {
  tabs: NavItem[];
  /** 사이드바가 열려 있는가 — '더보기'를 켜진 색으로 둔다 */
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const isActive = useIsActive();
  const [spinning, setSpinning] = useState(false);

  return (
    <nav
      /* 본문이 바뀌는 동안 탭바는 움직이지 않는다. */
      style={{ viewTransitionName: 'shell-tabbar' }}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="flex">
        {tabs.map((tab) => {
          /*
           * '더보기'는 화면으로 넘어가지 않고 옆에서 사이드바를 연다.
           *
           * 예전에는 /more 라는 화면 하나로 넘어갔다. 그러면 넓은 화면에서는
           * 옆에서 미끄러져 나오던 같은 메뉴가 좁은 화면에서만 화면 전환이 되어,
           * 창 폭 하나로 메뉴가 전혀 다르게 열렸다. 이제 폭과 상관없이 같은
           * 사이드바가 같은 몸짓(네모가 돌며 오른쪽에서 밀려 들어옴)으로 열린다.
           *
           * 켜진 표시(위의 짧은 막대)는 달지 않는다. 그 막대는 이름이 하나라
           * 화면에 둘이 있으면 탭을 옮길 때 미끄러지는 효과가 통째로 깨진다.
           * 색만 바꾼다.
           */
          if (tab.href === MORE_HREF) {
            return (
              <button
                key={tab.href}
                type="button"
                onClick={() => {
                  setSpinning(true);
                  onMenu();
                }}
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-[color,transform] duration-75 motion-safe:active:scale-90 ${
                  menuOpen ? 'font-semibold text-sky' : 'text-muted active:text-sky'
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  <Squares spinning={spinning} onDone={() => setSpinning(false)} />
                </span>
                {tab.short ?? tab.label}
              </button>
            );
          }

          const active = isActive(tab.href);
          const Icon = NAV_ICONS[tab.icon];
          return (
            <Link
              key={tab.href}
              href={tab.href}
              /*
               * 휴대폰에서 가장 많이 눌리는 자리다. 눌렀을 때 살짝 작아지고
               * 색이 바뀌게 해서, 화면이 바뀌기 전에 먼저 대답하게 한다.
               * 움직임을 줄여 쓰는 사람에게는 크기 변화 없이 색만 바뀐다.
               */
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-[color,transform] duration-75 motion-safe:active:scale-90 ${
                active ? 'font-semibold text-sky' : 'text-muted active:text-sky'
              }`}
            >
              {/*
               * 지금 어느 탭인지 알려주는 짧은 막대.
               *
               * 화면에 한 번에 하나만 있고 이름이 같아서, 탭을 옮기면 브라우저가
               * 사라졌다 나타나는 대신 옛 자리에서 새 자리로 미끄러뜨린다.
               * 색만 바뀌던 때보다 '옮겨갔다'는 것이 훨씬 분명해진다.
               *
               * 색은 이미 글자와 아이콘이 알려주므로 이 막대는 장식이다.
               * 읽어 줄 필요가 없어 aria-hidden 을 단다.
               */}
              {active && (
                <span
                  aria-hidden
                  style={{ viewTransitionName: 'tab-indicator' }}
                  className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-sky"
                />
              )}
              <TabFace Icon={Icon} active={active} label={tab.short ?? tab.label} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
