'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Lock } from '@/components/icon';
import { NAV_ICONS } from '@/components/nav-icons';
import { isRoundIcon, RoundMenu } from '@/components/round-icon';
import type { NavItem } from '@/lib/nav';
import { isPlainClick } from '@/components/use-sliding-thumb';

/* 앱 틀의 작은 그림 부품 — 메뉴 아이콘(잠금 표시) · 위 막대 아이콘 단추 · 말풍선 · 네모 넷 · 톱니 · 내 사진. 2026-10-16 에 app-shell.tsx 에서 옮겼다(내용 그대로). */

/**
 * 위쪽 줄에 들어가는 동그란 아이콘 하나.
 *
 * 이름은 붙이지 않고 마우스를 올렸을 때만 알려준다(title). 다섯 칸에 글자를
 * 모두 적으면 줄이 화면 절반을 차지해, 로고와 부딪힌다.
 *
 * 지금 보고 있는 곳의 배경은 여기서 그리지 않는다. 그 동그라미는 넷이 같이
 * 쓰는 하나라(QuickBar), 여기서는 색만 켠다.
 *
 * 올렸을 때의 배경은 반투명한 잉크색이다. 알약이 비치는 바탕이라, 불투명한
 * surface-2 를 얹으면 밝은 테마에서 알약과 거의 같은 색이 되어 안 보였다.
 *
 * 누르는 칸은 48px — 오른쪽의 알림 · 설정 · 내 정보(32~40px)보다 크다. 옮겨 다니는 단추라
 * 가장 자주 누르는데, 40px 일 때는 작아서 옆 단추를 잘못 누르곤 했다. 그림은 22px 로 원래
 * (20px)보다 조금만 키웠다 — 24px 로 칸과 같이 키우니 그림이 막대에서 너무 도드라졌다.
 * 도크의 아이콘도 같은 크기로 맞춰, 막대에서 도크로 날아갈 때 크기가 튀지 않는다. 메뉴(격자)
 * 그림만은 1.4rem 으로 조금 더 크게 둔다 — 줄의 맨 끝에서 '전부 보기'를 맡는 단추라 눈에 띄게.
 */
/**
 * 메뉴 아이콘 한 칸 — 잠긴 탭(첫 설정 전, lib/nav.ts applyLocks)이면 흐리게 + 오른쪽 아래 귀퉁이에 자물쇠.
 * 막대(TopIcon) · 도크 · 판 · 휴대폰 탭이 같이 쓴다.
 *
 * 흐림 · 자물쇠 · 연출 이름표(style 의 viewTransitionName)를 모두 아이콘을 감싼 이 칸에 단다 — 링크가 아니라.
 * 막대 · 도크 · 판 사이를 날아가는 연출은 이름표를 단 것과 그 안만 찍고, 조상(링크)의 흐림은 찍지 않는다. 예전에는
 * 링크를 흐리고 이름표는 아이콘에, 자물쇠는 링크에 따로 달아서 잠긴 아이콘이 날아가는 동안만 짙었다가 내려앉으며
 * 흐려졌고, 자물쇠는 같이 날지 못하고 옛 자리에서 사라졌다 새 자리에서 생겼다. 도크의 이름 풍선(Tip)도 링크와 함께
 * 흐려져 뒤가 비쳤다. 자리도 링크 크기가 아니라 아이콘을 기준으로 잡아, 칸마다 크기가 달라도 같은 귀퉁이에 앉는다.
 */
export function NavGlyph({
  Icon,
  locked = false,
  dim = locked,
  className,
  style,
  filled = false,
}: {
  Icon: (typeof NAV_ICONS)[keyof typeof NAV_ICONS];
  /** 채움형으로 — 둥근 아이콘만(지금 고른 하단 탭, 2026-10-21) */
  filled?: boolean;
  locked?: boolean;
  /** 흐리게 — 기본은 잠겼으면. 판의 '지금 여기'(파란 줄) · 휴대폰 탭(탭이 통째로 흐리다)은 끈다 */
  dim?: boolean;
  /** 아이콘 크기 */
  className: string;
  /** 연출 이름표(flyStyle · growStyle) */
  style?: CSSProperties;
}) {
  return (
    <span className={`relative flex shrink-0 ${dim ? 'opacity-55' : ''}`} style={style}>
      <Icon aria-hidden className={className} {...(filled && isRoundIcon(Icon) ? ({ filled: true } as object) : {})} />
      {locked && <Lock aria-hidden className="absolute -bottom-1 -right-1 h-3 w-3" />}
    </span>
  );
}

export function TopIcon({
  item,
  current,
  lit,
  onPick,
  flyName,
  hidden,
  instant,
}: {
  item: NavItem;
  /** 정말로 지금 보고 있는 곳 — 화면 낭독기에 알린다 */
  current: boolean;
  /** 켜진 색으로 그린다 — 보고 있는 곳이거나, 방금 눌러 가는 중인 곳 */
  lit: boolean;
  onPick: () => void;
  /** 연출에서 이 아이콘이 날아간다 — 그 이름표 */
  flyName?: CSSProperties;
  /**
   * 도크나 판이 떠 있는 동안 막대에서 빠진다.
   *
   * 빠질 때는 즉시, 돌아올 때는 천천히다. 빠질 때 천천히 옅어지면 날아가는
   * 아이콘과 제자리에서 옅어지는 아이콘이 한동안 둘로 보인다. 돌아올 때는
   * 제자리에 떠오른다.
   */
  hidden?: boolean;
  /**
   * 연출 중에는 옅어지고 짙어지는 것 없이 바로 바뀐다. 연출이 이 아이콘을 날려
   * 보내는 동안 제자리에서 따로 떠오르면 한 아이콘이 둘로 보인다.
   */
  instant?: boolean;
}) {
  const Icon = NAV_ICONS[item.icon];
  /* 잠긴 탭(첫 설정 전, lib/nav.ts applyLocks)은 흐리게 + 아이콘 오른쪽 아래 자물쇠(NavGlyph). 링크는 산다 — 누르면 설정 화면 */
  const name = item.locked ? `${item.label}(설정 전)` : item.label;
  return (
    <Link
      href={item.href}
      title={name}
      aria-label={name}
      aria-current={current ? 'page' : undefined}
      data-thumb-key={item.href}
      data-locked={item.locked ? '' : undefined}
      onClick={(e) => {
        if (isPlainClick(e)) onPick();
      }}
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
        hidden
          ? 'opacity-0 [transition:none]'
          : instant
            ? 'opacity-100 [transition:none]'
            : 'opacity-100 [transition:color_75ms,background-color_75ms,opacity_240ms_ease-out]'
      } ${lit ? 'text-sky' : 'text-muted hover:bg-ink/6 hover:text-ink'}`}
    >
      <NavGlyph
        Icon={Icon}
        locked={item.locked}
        className="h-[1.375rem] w-[1.375rem]"
        style={flyName}
      />
    </Link>
  );
}

/**
 * 도크 아이콘 밑에 뜨는 작은 이름표.
 *
 * 브라우저의 title 은 한참 있다가 뜨고 생김새를 정할 수 없다. 여기 것은
 * 올리자마자 위에서 살짝 내려앉는다. 글자색과 바탕색을 뒤집어(ink 위에
 * page) 어느 테마에서나 뒤와 갈린다.
 *
 * 옆이 아니라 밑에 둔다. 네 칸이 나란한 줄이라 옆에 띄우면 이웃 아이콘을 통째로
 * 덮는다. 밑에 띄우면 둘째 줄 아이콘의 윗부분만 잠깐 덮고, 둘째 줄은 상자 밖으로
 * 나간다.
 *
 * 읽어 주지 않는다(aria-hidden). 이름은 링크의 aria-label 이 이미 들고 있다.
 */
export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 -translate-y-0.5 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-caption font-medium leading-none text-page opacity-0 shadow-md transition-[opacity,translate] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
    >
      {children}
    </span>
  );
}

/**
 * 네모 넷 그림. spinning 이 켜지면 각자 제자리에서 반 바퀴 돈다.
 *
 * PC 막대의 격자와 휴대폰 하단 탭의 '더보기'가 같이 쓴다. 둘이 여는 것이 같은
 * 판이라서, 여는 몸짓도 같아야 한다 — 화면 폭이 바뀌었다고 같은 메뉴가
 * 다르게 열리면 다른 메뉴인 줄 안다.
 *
 * 도는 것을 끝내는 일은 마지막 네모의 onAnimationEnd 가 맡는다(onDone).
 * 넷 다 걸면 첫째가 끝나는 순간 나머지가 도는 중에 꺼진다.
 */
export function Squares({
  spinning,
  onDone,
  size = 'md',
}: {
  spinning: boolean;
  onDone: () => void;
  /** lg — PC 막대의 메뉴 단추(1.4rem, 옆 아이콘보다 조금 크게). md — 휴대폰 하단 탭 */
  size?: 'md' | 'lg';
}) {
  /* 2026-10-21: 네모 넷 → 둥근 메뉴 아이콘(lib/round-icons.ts). 돌던 연출은 없어 누르면 곧바로 끝을 알린다 */
  useEffect(() => {
    if (spinning) onDone();
  }, [spinning, onDone]);
  return (
    <RoundMenu aria-hidden className={size === 'lg' ? 'h-[1.4rem] w-[1.4rem]' : 'h-[1.15rem] w-[1.15rem]'} />
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
export function SettingsCog({
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
        open ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-ink/6 hover:text-ink'
      }`}
    >
      <Icon
        aria-hidden
        className={spinning ? 'h-5 w-5 motion-safe:animate-cog' : 'h-5 w-5'}
        onAnimationEnd={() => setSpinning(false)}
      />
    </button>
  );
}

/**
 * 동그란 아바타 — 올린 사진이 있으면 사진, 없으면 이름 첫 글자.
 *
 * 사진 주소는 서명된 임시 주소라 한 시간쯤 살아 있다. next/image 를 쓰지 않는
 * 이유가 여기 있다 — 도메인을 미리 적어 둘 수 없고, 값이 계속 바뀌어 최적화한
 * 것을 돌려쓰지도 못한다.
 */
export function Avatar({
  nickname,
  avatarUrl,
}: {
  nickname: string;
  avatarUrl?: string | null;
}) {
  const box = 'h-9 w-9 text-sm';

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
