'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { NAV_ICONS } from '@/components/nav-icons';
import { usePathname } from 'next/navigation';
import type { NavGroup, NavItem } from '@/lib/nav';
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
        style={{ viewTransitionName: 'shell-logo' }}
        className="fixed left-6 top-5 z-40 hidden items-center gap-2 lg:flex"
      >
        <BaseballMark className="h-8 w-8" />
        <span className="text-display text-base leading-none text-ink">BULLPEN LOG</span>
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
        style={{ viewTransitionName: 'shell-topnav' }}
        aria-label="간편 이동"
        className="fixed right-4 top-3 z-40 hidden items-center gap-0.5 lg:flex"
      >
        {quick.map((item) => (
          <TopIcon key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <span aria-hidden className="mx-1.5 h-6 w-px bg-line" />

        <MenuSquares open={open} onOpen={() => setOpen(true)} />

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

      <DetailMenu
        groups={groups}
        nickname={nickname}
        avatarUrl={avatarUrl}
        isAdmin={isAdmin}
        isActive={isActive}
        open={open}
        onClose={() => setOpen(false)}
        onProfile={(el) => openFrom(el, setProfileOpen)}
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
function MenuSquares({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const [spinning, setSpinning] = useState(false);

  /* 왼위 → 오른위 → 왼아래 → 오른아래. 글 읽는 차례와 같게 돈다. */
  const corners = ['left-0 top-0', 'right-0 top-0', 'left-0 bottom-0', 'right-0 bottom-0'];

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
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-75 ${
        open ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <span aria-hidden className="relative block h-[1.15rem] w-[1.15rem]">
        {corners.map((at, i) => (
          <span
            key={at}
            className={`absolute h-[0.45rem] w-[0.45rem] rounded-[2px] border-[1.9px] border-current ${at} ${
              spinning ? 'motion-safe:animate-square-spin' : ''
            }`}
            style={{ '--sq': i } as React.CSSProperties}
            onAnimationEnd={i === 3 ? () => setSpinning(false) : undefined}
          />
        ))}
      </span>
    </button>
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
function TopIcon({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = NAV_ICONS[item.icon];
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-75 ${
        active ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <Icon aria-hidden className="h-5 w-5" strokeWidth={active ? 2.4 : 1.9} />
    </Link>
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
  onProfile,
}: {
  groups: NavGroup[];
  nickname: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isActive: (href: string) => boolean;
  open: boolean;
  onClose: () => void;
  /** 메뉴 맨 아래 내 정보를 눌렀을 때. 누른 버튼을 함께 준다. */
  onProfile: (el: HTMLElement) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  /* showModal() 은 DOM 을 직접 건드리는 일이라 effect 에서 부른다. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-drawer
      aria-label="전체 메뉴"
      onClose={onClose}
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
                    onClick={onClose}
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
            onClose();
            onProfile(e.currentTarget);
          }}
          className="flex w-full shrink-0 items-center gap-3 border-t border-line px-4 py-4 text-left transition-colors duration-75 hover:bg-surface-2"
        >
          <Avatar nickname={nickname} avatarUrl={avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{nickname}</span>
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

  return (
    <header
      /* 본문이 바뀌는 동안 상단 바는 움직이지 않는다. */
      style={{ viewTransitionName: 'shell-topbar' }}
      className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur-xl lg:hidden"
    >
      <Link href="/today" className="flex items-center gap-2">
        <BaseballMark className="h-8 w-8" />
        <span className="text-display text-base leading-none text-ink">
          BULLPEN LOG
        </span>
      </Link>

      <button
        type="button"
        onClick={(e) => onSettings(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={settingsOpen}
        aria-label="설정"
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors duration-75 active:bg-surface-2 active:text-ink"
      >
        <Cog aria-hidden className="h-5 w-5" strokeWidth={1.9} />
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

/** 모바일 하단 탭바 */
export function MobileTabs({ tabs }: { tabs: NavItem[] }) {
  const isActive = useIsActive();

  return (
    <nav
      /* 본문이 바뀌는 동안 탭바는 움직이지 않는다. */
      style={{ viewTransitionName: 'shell-tabbar' }}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="flex">
        {tabs.map((tab) => {
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
              <Icon aria-hidden className="h-5 w-5" strokeWidth={active ? 2.4 : 1.9} />
              {tab.short ?? tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
