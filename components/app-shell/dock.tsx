'use client';

import {
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import Link from 'next/link';
import { NAV_ICONS } from '@/components/nav-icons';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/nav';
import { isPlainClick, thumbStyle, useSlidingThumb } from '@/components/use-sliding-thumb';
import { FlyKind, Anchor, flyStyle } from './shared';
import { Squares, NavGlyph, TopIcon, Tip } from './glyphs';

/* 앱 틀의 PC 위 막대 빠른 줄 · 메뉴 네모 단추 · 미니 사이드바(도크). 2026-10-16 에 app-shell.tsx 에서 옮겼다(내용 그대로). */

/**
 * 막대의 아이콘 넷과, 그 밑을 미끄러지는 동그라미.
 *
 * 지금 보고 있는 곳의 표시(옅은 하늘색 동그라미)는 하나뿐이고, 다른 곳을 누르면
 * 그리로 미끄러진다. 예전에는 아이콘마다 배경을 켜고 껐다 — 옛것이 꺼지고
 * 새것이 켜지는 두 번의 '뚝'이라 어디에서 어디로 갔는지가 눈에 안 남았다.
 * 자리는 재서 옮긴다(useSlidingThumb).
 *
 * 넷이 도크나 판으로 옮겨 가 있는 동안에는 이 칸을 접는다(collapsed). 칸을 나누는
 * 선도 이 안에 있어 같이 접힌다 — 따로 두었더니 아이콘이 빠진 알약 왼쪽 끝에
 * 아무것도 가르지 않는 선만 홀로 서 있었다.
 *
 * 접고 펴는 것은 곧장이다. 도크와 오갈 때는 연출이 알약을 따로 줄이고 펴 주고
 * (globals.css 의 nav-pill), 판과 오갈 때는 판이 이 자리를 덮는다.
 */
export function QuickBar({
  quick,
  isActive,
  activeHref,
  routeDriven,
  onPick,
  collapsed,
  instant,
  flyIndex,
  iconsNamed,
  thumbName,
}: {
  quick: NavItem[];
  isActive: (href: string) => boolean;
  /** 동그라미를 둘 곳. 없으면 숨긴다(옮겨 가 있는 동안, 막대에 없는 화면). */
  activeHref: string | null;
  /** 주소가 먼저 바뀌어 옮겨 가는 중 — 동그라미를 화면 전환이 옮긴다 */
  routeDriven: boolean;
  onPick: (href: string) => void;
  collapsed: boolean;
  /** 연출 중 — 아이콘이 옅어지고 짙어지는 것 없이 바로 바뀐다 */
  instant: boolean;
  flyIndex: (href: string) => number;
  /** 연출에서 아이콘이 날아간다 — 이름표를 단다 */
  iconsNamed: boolean;
  /** 동그라미의 이름표. 보일 때만 단다 — 숨은 것이 이름을 쥐고 있으면 전환이 깨진다. */
  thumbName?: CSSProperties;
}) {
  const pathname = usePathname();
  const { containerRef, thumbRef, box, visible, animate } =
    useSlidingThumb<HTMLDivElement>(activeHref, {
      instant: routeDriven,
      settleKey: pathname,
    });
  /* 펼친 폭 — 아이콘(48px)과 그 뒤 틈(2px)마다 50px, 선 1px 과 그 양옆 여백(6 + 8px) */
  const full = quick.length * 50 + 15;

  return (
    <div
      ref={containerRef}
      style={{ maxWidth: collapsed ? 0 : full }}
      className={`relative flex shrink-0 items-center gap-0.5 overflow-hidden ${
        collapsed ? 'invisible' : ''
      }`}
    >
      <span
        ref={thumbRef}
        data-thumb
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 rounded-full bg-sky/15"
        style={{
          ...thumbStyle({ box, visible, animate }),
          ...(visible && activeHref != null ? thumbName : undefined),
        }}
      />
      {quick.map((item) => {
        const i = flyIndex(item.href);
        return (
          <TopIcon
            key={item.href}
            item={item}
            current={isActive(item.href)}
            lit={item.href === activeHref}
            onPick={() => onPick(item.href)}
            flyName={iconsNamed ? flyStyle(`nav-fly-${i}`, i, 'fly') : undefined}
            hidden={collapsed}
            instant={instant}
          />
        );
      })}
      <span aria-hidden className="ml-1.5 mr-2 h-7 w-px shrink-0 bg-line" />
    </div>
  );
}

/**
 * 메뉴 단추(네모 넷, 격자) — 커서를 대면 도크가 뜨고, 누르면 판이 열린다.
 *
 * 화면에는 '메뉴'라는 이름으로 나간다. 사용자도 이 단추를 '메뉴'라고 부른다 —
 * 예전 이름은 '전체 메뉴'였다.
 *
 * lucide 의 LayoutGrid 를 직접 그린 것으로 바꿨다. 그림 하나로 오는 아이콘은
 * 통째로만 움직일 수 있는데, 여기서는 네 조각이 따로 돌아야 한다.
 *
 * 누르면 네모가 각자 제자리에서 반 바퀴 돈다. 차례로 조금씩 늦게 돌기
 * 시작한다 — 넷이 한꺼번에 돌면 그냥 아이콘 하나가 떠는 것처럼 보이고,
 * 어긋나게 돌아야 '네 조각짜리'라는 것이 읽힌다.
 *
 * 예전에는 한 번 누르면 도크, 한 번 더 누르면 판이었다. 판을 보려고 두 번 눌러야
 * 했다. 이제 도크는 커서를 대는 것만으로 뜨니, 누르는 것은 곧장 판이다.
 *
 * 판은 이 단추에서 부풀어 나오지 않고 화면 오른쪽 끝에서 밀려 들어온다. 단추에서
 * 커지면 판이 아니라 작은 상자가 커진 것처럼 보였다.
 *
 * 브라우저 이름표(title)는 달지 않는다. 커서를 대면 바로 밑에 도크가 뜨는데,
 * 조금 뒤에 그 위로 '전체 메뉴' 글자가 겹쳐 떠서 도크의 아이콘을 가렸다.
 */
export function MenuSquares({
  buttonRef,
  lit,
  expanded,
  onOpen,
  onPointerEnter,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  /** 도크나 판이 떠 있다 — 켜진 색으로 둔다 */
  lit: boolean;
  /** 판이 열려 있다 — 화면 낭독기에 알린다 */
  expanded: boolean;
  onOpen: () => void;
  /** 커서가 들어왔다. 나간 것은 AppNav 가 커서 자리로 잰다(overZone). */
  onPointerEnter: (e: ReactPointerEvent) => void;
}) {
  const [spinning, setSpinning] = useState(false);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        setSpinning(true);
        onOpen();
      }}
      onPointerEnter={onPointerEnter}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label="메뉴"
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-75 ${
        lit ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-ink/6 hover:text-ink'
      }`}
    >
      <Squares size="lg" spinning={spinning} onDone={() => setSpinning(false)} />
    </button>
  );
}

/**
 * 도크 — 격자에 커서를 대면 그 바로 밑에 뜨는, 아이콘만 모인 반투명 상자 (PC).
 *
 * 막대와 판의 중간이다. 막대는 자주 가는 넷뿐이고 판은 화면을 덮는다. 라이브러리나
 * 자료실처럼 가끔 가는 곳을 판을 열지 않고 가려면, 전부가 있으면서 화면은 가리지
 * 않는 것이 하나 필요했다.
 *
 * 4칸씩 줄지어 둔다. 처음에는 오른쪽 가장자리에 세로 한 줄이었는데, 여덟 개가
 * 한 줄로 서니 길쭉하게 화면 아래로 늘어졌고 격자 단추와도 떨어져 있었다. 격자
 * 밑에 네모지게 모아 두면 '격자를 펼친 것'으로 읽히고, 첫 줄이 곧 막대의 넷이라
 * 막대에서 날아온 아이콘이 그대로 첫 줄에 앉는다.
 *
 * 이름은 커서를 올렸을 때만 작게 뜬다(Tip). 늘 적어 두면 판과 다를 것이 없고,
 * 그러면 둘을 나눈 이유가 사라진다. 오래 머무르면(DOCK_HOVER_MS) 이름이 궁금한
 * 것으로 보고 판을 열어 준다.
 *
 * 화면을 옮길 때의 전환에서는 막대와 같은 규칙으로 빠진다(shell-dock). 연출 중에는
 * 상자 이름표(nav-dock)를 단다 — 막대와 오갈 때는 격자 밑에서 펴지고 접히며, 판이
 * 될 때는 아이콘을 판으로 날려 보내고 제자리에서 옅어진다. 상자가 커져서 판이 되면
 * 오른쪽에서 나오는 큰 메뉴가 아니라 작은 상자가 부푼 것으로 보여서다.
 */
export function DockGrid({
  ref,
  anchor,
  items,
  isActive,
  activeHref,
  routeDriven,
  onPick,
  onPointerEnter,
  onPointerDown,
  name,
  icons,
  quickHrefs,
  flyIndex,
  thumbName,
  built,
}: {
  ref: RefObject<HTMLDivElement | null>;
  /** 격자 단추 한가운데 밑 — 화면 오른쪽 끝에서 잰 거리와 위에서 잰 거리 */
  anchor: Anchor;
  items: NavItem[];
  isActive: (href: string) => boolean;
  activeHref: string | null;
  routeDriven: boolean;
  onPick: (href: string) => void;
  /** 커서가 들어왔다. 나간 것은 AppNav 가 커서 자리로 잰다(overZone). */
  onPointerEnter: (e: ReactPointerEvent) => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  /** nav-sheet — 팝업이 될 때(상자가 팝업으로 자란다) */
  name: 'shell-dock' | 'nav-dock' | 'nav-sheet';
  /**
   * 연출에서 아이콘에 다는 이름표 — 막대와 오갈 때(hover)는 넷만 날고 나머지는
   * 돋아난다. 팝업이 될 때(all)는 여덟이 다 팝업의 제 줄로 난다.
   */
  icons: 'none' | 'hover' | 'all';
  quickHrefs: string[];
  flyIndex: (href: string) => number;
  thumbName?: CSSProperties;
  /** 연출로 떴다 — 제 등장 애니메이션을 끈다 */
  built: boolean;
}) {
  const pathname = usePathname();
  const { containerRef, thumbRef, box, visible, animate } =
    useSlidingThumb<HTMLElement>(activeHref, {
      instant: routeDriven,
      settleKey: pathname,
    });

  return (
    <div
      ref={ref}
      data-dock
      data-built={built ? '' : undefined}
      style={{ viewTransitionName: name, top: anchor.top, right: anchor.right }}
      onPointerEnter={onPointerEnter}
      onPointerDown={onPointerDown}
      /* right 는 격자 한가운데까지의 거리라, 제 폭의 절반만큼 오른쪽으로 밀어 가운데를 맞춘다 */
      className="ui-chrome fixed z-40 hidden translate-x-1/2 rounded-2xl border border-line/70 bg-surface/70 p-1.5 shadow-lg backdrop-blur-xl desk:block"
    >
      <nav
        ref={containerRef}
        aria-label="모든 메뉴"
        className="relative grid grid-cols-4 gap-0.5"
      >
        <span
          ref={thumbRef}
          data-thumb
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 rounded-full bg-sky/15"
          style={{
            ...thumbStyle({ box, visible, animate }),
            ...(visible && activeHref != null ? thumbName : undefined),
          }}
        />
        {items.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const lit = item.href === activeHref;
          const i = flyIndex(item.href);
          const quick = quickHrefs.includes(item.href);
          const kind: FlyKind = icons === 'hover' && !quick ? 'pop' : 'fly';
          const named = icons !== 'none';
          /* 잠긴 탭(첫 설정 전, lib/nav.ts applyLocks)은 흐리게 + 자물쇠 — 막대(TopIcon)와 같은 NavGlyph */
          const name = item.locked ? `${item.label}(설정 전)` : item.label;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={name}
              aria-current={isActive(item.href) ? 'page' : undefined}
              data-thumb-key={item.href}
              data-locked={item.locked ? '' : undefined}
              onClick={(e) => {
                if (isPlainClick(e)) onPick(item.href);
              }}
              className={`group relative flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-75 ${
                lit ? 'text-sky' : 'text-muted hover:bg-ink/6 hover:text-ink'
              }`}
            >
              <NavGlyph
                Icon={Icon}
                locked={item.locked}
                className="h-[1.375rem] w-[1.375rem]"
                style={named ? flyStyle(`nav-fly-${i}`, i, kind) : undefined}
              />
              <Tip>{name}</Tip>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
