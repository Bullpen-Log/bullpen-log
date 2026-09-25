'use client';

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';
import Link, { useLinkStatus } from 'next/link';
import { X } from 'lucide-react';
import { NAV_ICONS } from '@/components/nav-icons';
import { usePathname } from 'next/navigation';
import type { NavGroup, NavItem } from '@/lib/nav';
import { DESK_MEDIA, MORE_HREF } from '@/lib/nav';
import { BaseballMark } from '@/components/logo';
import { Modal } from '@/components/modal';
import { ProfilePanel, type ProfileData } from '@/components/profile-panel';
import { SettingsPanel, type SettingsData } from '@/components/settings-panel';
import {
  isPlainClick,
  thumbStyle,
  useSlidingThumb,
} from '@/components/use-sliding-thumb';

/**
 * 현재 위치 판정. 하위 경로도 같은 메뉴로 본다.
 * 단 '/'로 시작하는 다른 메뉴를 잘못 물지 않게 정확히 비교한다.
 */
function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/*
 * 도크(아이콘만 모인 작은 판)가 뜨고 지는 시간.
 *
 * 격자에 커서를 대면 뜬다. 0.1초는 '대자마자'로 느껴지면서도, 막대를 가로질러
 * 지나가는 커서(40px 짜리 격자를 0.05초 남짓에 지난다)에는 걸리지 않는 길이다.
 * 지나가다 걸리면 가려던 아이콘이 눈앞에서 도크로 날아가 버린다.
 *
 * 떠날 때는 0.22초를 기다린다. 격자에서 그 밑의 도크로 커서를 옮기는 동안 잠깐
 * 둘 다에서 벗어나는데, 그 틈에 닫히면 도크에 닿을 수가 없다.
 */
const DOCK_OPEN_MS = 100;
const DOCK_CLOSE_MS = 220;

/**
 * 격자·도크 위에 커서를 이만큼 두면 판(이름까지 있는 전체 메뉴)이 저절로 열린다.
 *
 * 아이콘만 있는 도크에서 무엇인지 몰라 머뭇거리는 시간이다. 그보다 짧으면 도크를
 * 훑어보는 도중에 열려 버리고, 그보다 길면 기다리다 그냥 누른다.
 */
const DOCK_HOVER_MS = 5000;

/**
 * 메뉴가 놓이는 세 자리.
 *
 *   bar    오른쪽 위 한 줄. 평소.
 *   dock   격자 바로 밑에 뜨는 반투명 상자. 막대의 아이콘들이 모여 앉고, 막대에
 *          없는 것까지 전부 4칸씩 줄지어 있다. 이름은 커서를 올려야 보인다.
 *   sheet  이름과 설명까지 있는 전체 메뉴. 화면을 덮는다.
 */
type Place = 'bar' | 'dock' | 'sheet';

/** 두 자리 사이를 오가는 연출 — '출발-도착'. 움직임은 app/globals.css 에 있다. */
type Choreo = 'bar-dock' | 'dock-bar' | 'dock-sheet' | 'bar-sheet' | 'sheet-bar';

/** 날아가는 것(양쪽에 다 있다)과 제자리에서 돋아나거나 잦아드는 것(한쪽에만 있다) */
type FlyKind = 'fly' | 'pop';

type Anchor = { top: number; right: number };

type TimerName = 'open' | 'close' | 'dwell';

/**
 * 연출에서 움직이는 것에 다는 이름표 — 옛·새 모습을 짝짓는 이름과, 어떻게
 * 움직일지 정하는 딱지. 차례 딱지(dN)는 전체 메뉴에서의 순서다.
 */
function flyStyle(name: string, index: number, kind: FlyKind): CSSProperties {
  return {
    viewTransitionName: name,
    viewTransitionClass: `nav-${kind} d${index}`,
  } as CSSProperties;
}

/**
 * 판에만 자리가 있는 아이콘(라이브러리·자료실·관리자)의 이름표 — 날아오지 않고
 * 판의 제자리에서 돋아난다. 차례 딱지(gN)는 그것들끼리의 순서라, 날아오는
 * 넷(dN)과 따로 센다 — 판이 거의 다 들어온 뒤에 하나씩 돋게 하려고.
 */
function growStyle(name: string, order: number): CSSProperties {
  return {
    viewTransitionName: name,
    viewTransitionClass: `nav-grow g${order}`,
  } as CSSProperties;
}

/**
 * 연출이 없을 때 '지금 여기' 동그라미의 이름표.
 *
 * 화면을 옮기는 전환이 이 동그라미를 옛 칸에서 새 칸으로 직접 옮기게 한다.
 * 전환이 도는 동안에는 찍어 둔 그림만 보여서, CSS 로 미끄러지던 동그라미가 도중에
 * 멈춰 있다가 끝나고 툭 건너뛰었다(globals.css 의 nav-thumb).
 */
const REST_THUMB = { viewTransitionName: 'nav-thumb' } as CSSProperties;

/** 격자 단추를 못 잰 경우의 도크 자리 — 지금 막대 크기로 셈한 값 */
const DOCK_FALLBACK: Anchor = { top: 66, right: 120 };

/**
 * 점(x, y)이 요소의 네모 안에 있는가.
 *
 * 연출(View Transition)이 도는 동안에는 '커서가 무엇 위에 있나', '무엇을 눌렀나'를
 * 브라우저에게 물을 수 없다. 크롬은 그동안 화면 전체를 <html> 하나로 친다 — 연출
 * 위에 pointer-events: none 을 걸어도 같았다(재 보니 어디를 짚어도 <html> 이다).
 * 그럴 때는 요소의 자리를 재어 직접 가린다.
 */
function within(el: Element | null | undefined, x: number, y: number) {
  const r = el?.getBoundingClientRect();
  return (
    r != null &&
    r.width > 0 &&
    x >= r.left &&
    x < r.right &&
    y >= r.top &&
    y < r.bottom
  );
}

/**
 * PC 화면의 틀 — 왼쪽 위 로고, 오른쪽 위 한 줄, 그리고 거기서 펼쳐지는 도크와 판.
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
 * 전체 메뉴로 가는 길은 격자 하나다. 커서를 대면 아이콘들이 격자 밑의 작은
 * 상자(도크)로 모이고, 누르거나 5초 머무르면 이름과 설명까지 있는 판이 열린다.
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
  /** 도크와 판에 펼칠 전체 목록 */
  groups: NavGroup[];
  /** 막대에 늘 보일 항목들 */
  quick: NavItem[];
  /**
   * 휴대폰 하단 탭.
   *
   * 예전에는 레이아웃이 따로 그렸다. 그런데 '더보기'가 판을 열려면 그
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
  const pathname = usePathname();

  /*
   * 판·도크가 떠 있는가. 둘이 한꺼번에 뜨는 일은 없다(land 가 같이 정한다).
   *
   * 판은 화면을 옮기면 저절로 닫힌다 — 판 안의 링크가 누를 때 직접 닫는다.
   * 도크는 화면을 옮겨도 닫히지 않는다. 화면을 가리지 않는 작은 상자라, 커서가
   * 머무는 동안 이것저것 눌러 보는 것이 곧 이 상자의 쓸모다.
   */
  const [open, setOpen] = useState(false);
  const [dock, setDock] = useState(false);
  /* 지금 돌고 있는 연출 — 이름표를 어디에 달지 정한다 */
  const [choreo, setChoreo] = useState<Choreo | null>(null);
  /* 연출로 떴다 — 제 등장 애니메이션을 끈다(연출이 대신했다) */
  const [dockBuilt, setDockBuilt] = useState(false);
  const [sheetBuilt, setSheetBuilt] = useState(false);
  /* 도크가 설 자리 — 격자 단추 바로 밑. 뜰 때 잰다. */
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /*
   * 지금 있는 자리와, 돌고 있는 연출, 그 연출이 끝나면 가야 할 곳.
   *
   * 타이머와 연출이 끝난 뒤의 콜백에서 읽으므로 상태가 아니라 ref 로 든다 — 거기서
   * 상태를 읽으면 콜백을 만든 때의 옛 값을 본다.
   */
  const place = useRef<Place>('bar');
  const running = useRef<ViewTransition | null>(null);
  const queued = useRef<Place | null>(null);

  const navRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  /* 커서가 격자나 도크 위에 있는가 */
  const inside = useRef(false);
  /*
   * 도크에서 하나를 골랐다. 커서가 격자·도크를 완전히 떠날 때까지 5초를 다시 재지
   * 않는다 — 고른 뒤 격자 쪽으로 커서를 옮겼다고 판이 불쑥 열리면 안 된다.
   */
  const chose = useRef(false);
  const timers = useRef<Partial<Record<TimerName, number>>>({});
  /* 마지막으로 본 커서 자리 */
  const last = useRef<{ x: number; y: number } | null>(null);
  /* 커서를 지켜보는 동안 문서에 걸어 둔 리스너들 — 그만 볼 때 한 번에 뗀다 */
  const watcher = useRef<AbortController | null>(null);

  /*
   * 도크와 판에 늘어놓을 전체 목록. 아이콘 이름표의 번호는 이 차례다 — 막대의
   * 넷(홈·영상·트레이닝·분석)이 이 목록의 맨 앞 넷이라, 막대·도크·판 어디에
   * 있든 같은 아이콘은 같은 번호를 단다.
   */
  const flat = groups.flatMap((g) => g.items);
  const flyIndex = (href: string) => flat.findIndex((i) => i.href === href);
  const quickHrefs = quick.map((q) => q.href);

  /*
   * 누른 곳 — 화면이 바뀌기 전에 표시가 먼저 간다.
   *
   * 화면이 실제로 바뀌는 것은 서버가 새 화면을 보내 준 뒤다. 그동안 아무 표시가
   * 없으면 '눌렸나?' 하고 한 번 더 누르게 된다 — 느리다는 느낌의 큰 몫이 이
   * 침묵이었다. 누르는 순간 동그라미가 그리로 미끄러지고, 화면이 바뀌면 그
   * 자리가 곧 진짜 자리가 된다.
   *
   * 주소가 바뀌면 잊는다. 그리는 도중에 앞 주소와 견주어 지운다(값이 바뀌면 상태를
   * 맞추는, 리액트가 권하는 방법). 예전에는 '어느 화면에서 눌렀는지'를 함께 적어
   * 그 화면을 벗어나면 무효로 쳤는데, 뒤로 가기로 그 화면에 돌아오면 되살아나
   * 동그라미가 엉뚱한 아이콘에 앉았다.
   */
  const [pick, setPick] = useState<string | null>(null);
  const [pickedOn, setPickedOn] = useState(pathname);
  if (pickedOn !== pathname) {
    setPickedOn(pathname);
    setPick(null);
  }
  const activeHref = pick ?? flat.find((i) => isActive(i.href))?.href ?? null;
  /*
   * 누르지 않았는데 자리가 바뀌었다 — 뒤로 가기나 판의 링크처럼 주소가 먼저 바뀐
   * 경우다. 그때는 동그라미가 CSS 로 미끄러지지 않고, 화면 전환이 옮긴다.
   */
  const routeDriven = pick == null;

  /* ── 자리 옮기기 ─────────────────────────────────────────────── */

  const land = (to: Place) => {
    /*
     * 도크 안에 초점이 있는 채로 도크가 사라지면 초점이 문서 밖(body)으로
     * 떨어진다. 다음 Tab 이 엉뚱한 데서 시작하므로 격자 단추로 돌려 둔다.
     */
    if (to !== 'dock' && dockRef.current?.contains(document.activeElement)) {
      gridRef.current?.focus({ preventScroll: true });
    }
    place.current = to;
    setOpen(to === 'sheet');
    setDock(to === 'dock');
  };

  /*
   * 도크가 설 자리 — 격자 단추 한가운데 밑, 막대의 바닥에서 조금 띄워서.
   * 오른쪽 끝에서 잰다. 막대가 오른쪽에 붙어 있어서, 창 폭이 바뀌어도 이 값은
   * 그대로 맞다.
   */
  const measureAnchor = (): Anchor | null => {
    const btn = gridRef.current?.getBoundingClientRect();
    const bar = navRef.current?.getBoundingClientRect();
    if (!btn || !bar || btn.width === 0) return null;
    return {
      top: Math.round(bar.bottom + 6),
      right: Math.round(
        document.documentElement.clientWidth - (btn.left + btn.width / 2)
      ),
    };
  };

  /*
   * 판·도크에 남아 있는 움직임을 먼저 끝낸다.
   *
   * 닫자마자 다시 열면 판이 아직 미끄러져 나가는 중이다. 그 모습이 연출의 '옛
   * 모습'에 같이 찍혀서, 반쯤 남은 판 위로 새 판이 펼쳐진다.
   */
  const settle = () => {
    document.querySelectorAll('dialog[data-drawer], [data-dock]').forEach((d) => {
      document.getAnimations().forEach((a) => {
        if ((a.effect as KeyframeEffect | null)?.target === d) a.finish();
      });
    });
  };

  /*
   * 연출을 돌 수 있는가 — PC 틀이 보이는 화면(1024px 이상이거나, 마우스로 쓰는
   * 576px 이상), 움직임을 줄이지 않았고, 브라우저가 View Transition 을 안다. 아니면
   * 연출 없이 곧장 옮긴다(도크는 제자리에서 떠오르고, 판은 옆에서 밀려 나온다).
   *
   * 조건은 CSS 의 desk: 와 같은 DESK_MEDIA 로 잰다. 막대가 보이는데 연출이 안 돌면
   * 화면을 반으로 나눈 PC 창에서만 아이콘이 날아오지 않고 판도 그냥 밀려 나와, 넓은
   * 창과 다르게 열린다.
   */
  const canChoreo = () =>
    window.matchMedia(DESK_MEDIA).matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    typeof document.startViewTransition === 'function';

  const run = (kind: Choreo) => {
    const to = kind.slice(kind.indexOf('-') + 1) as Place;
    const root = document.documentElement;
    settle();
    root.setAttribute('data-nav-choreo', kind);
    /* 옛 모습: 출발하는 쪽에 이름표를 단다. 브라우저가 이 모습을 찍은 뒤에 옮긴다. */
    flushSync(() => {
      setChoreo(kind);
      if (to === 'dock') setAnchor(measureAnchor());
    });

    const vt = document.startViewTransition(() => {
      /* 그사이 이 연출이 거둬졌으면(판의 링크를 눌렀다든지) 옮기지 않는다 */
      if (running.current !== vt) return;
      /* 새 모습: 도착한 쪽으로 옮긴다. 이름표도 그리로 따라간다. */
      flushSync(() => {
        if (to === 'dock') setDockBuilt(true);
        if (to === 'sheet') setSheetBuilt(true);
        land(to);
      });
    });
    running.current = vt;
    /*
     * 연출이 건너뛰어졌다 — 창이 가려져 있었거나 다른 전환이 끼어들었다. 이미
     * 옮겨 가 있으니, 도착한 것이 제 힘으로라도 나타나게 되돌린다(도크는
     * 제자리에서 떠오르고, 판은 옆에서 밀려 나온다).
     *
     * 우리가 스스로 거둔 것(halt)은 되돌리지 않는다. 곧바로 다음 연출이 이어지는데,
     * 여기서 도크의 등장 애니메이션을 켜면 그 첫 장면(투명한 도크)이 다음 연출의
     * 옛 모습으로 찍혀 도크가 사라진 채로 시작한다.
     */
    vt.ready.catch(() => {
      if (running.current !== vt) return;
      if (to === 'dock') setDockBuilt(false);
      if (to === 'sheet') setSheetBuilt(false);
    });
    vt.finished.finally(() => {
      if (running.current !== vt) return;
      running.current = null;
      root.removeAttribute('data-nav-choreo');
      setChoreo(null);
      if (to === 'bar') setSheetBuilt(false);
      /* 도는 동안 새로 가야 할 곳이 생겼으면 이제 간다 */
      const next = queued.current;
      queued.current = null;
      if (next) go(next);
    });
  };

  /*
   * 돌고 있는 연출을 그 자리에서 거둔다. 이미 옮겨 간 자리는 그대로 둔다 —
   * 옮기기 전에 거둬졌으면 옮기지 않는다(run 의 update 콜백이 running 을 본다).
   */
  const halt = () => {
    const vt = running.current;
    running.current = null;
    queued.current = null;
    vt?.skipTransition();
    document.documentElement.removeAttribute('data-nav-choreo');
  };

  /*
   * 가고 싶은 곳을 말하면 거기로 간다.
   *
   * 커서로 여닫는 도크는 연출이 도는 중이면 끝난 뒤에 간다. 들락날락이 잦아서,
   * 도중에 끊고 새로 시작하면 날아가던 아이콘이 사라졌다가 엉뚱한 데서 다시
   * 나타난다. 줄을 세워 두면 늘 커서가 있는 쪽으로 맞춰진다.
   *
   * 판은 기다리지 않는다(now). 격자를 누른 것은 분명히 판을 보겠다는 뜻이라,
   * 도크가 아직 모이는 중이어도 그 연출을 거두고 곧장 판을 오른쪽에서 내민다.
   * 예전에는 도크가 다 모인 뒤에야 판으로 이어져서, 누르고도 한참 작은 상자만
   * 보였다.
   */
  const go = (to: Place, now = false) => {
    if (running.current) {
      if (!now) {
        queued.current = to;
        return;
      }
      halt();
    }
    const from = place.current;
    if (from === to) return;
    if (!canChoreo()) {
      if (to === 'dock') setAnchor(measureAnchor());
      setChoreo(null);
      setDockBuilt(false);
      setSheetBuilt(false);
      land(to);
      return;
    }
    /* 판에서는 막대로만 돌아간다 — X 는 '다 닫는다'라서 작은 상자가 남으면 안 된다 */
    run(from === 'sheet' ? 'sheet-bar' : (`${from}-${to}` as Choreo));
  };

  /*
   * 연출 없이 곧장 막대로 — 판의 링크를 눌러 화면을 옮길 때, 설정·내 정보 창을
   * 열 때.
   *
   * 화면이 바뀌는 전환이나 창이 튀어나오는 움직임이 따로 도는데, 브라우저는 전환을
   * 한 번에 하나만 하고, 전환이 도는 동안에는 찍어 둔 그림만 보여준다. 연출을
   * 겹치면 둘 중 하나가 통째로 가려진다.
   */
  const drop = () => {
    halt();
    setChoreo(null);
    setDockBuilt(false);
    setSheetBuilt(false);
    land('bar');
  };

  /* ── 커서로 여닫기 ───────────────────────────────────────────── */

  const clearTimer = (name: TimerName) => {
    const id = timers.current[name];
    if (id != null) window.clearTimeout(id);
    timers.current[name] = undefined;
  };
  const unwatch = () => {
    watcher.current?.abort();
    watcher.current = null;
  };
  /* 타이머를 모두 거둔다. 커서가 이미 떠나 있으면 지켜보는 것도 그만둔다. */
  const clearTimers = () => {
    clearTimer('open');
    clearTimer('close');
    clearTimer('dwell');
    if (!inside.current) unwatch();
  };
  const later = (name: TimerName, ms: number, fn: () => void) => {
    if (timers.current[name] != null) return;
    timers.current[name] = window.setTimeout(() => {
      timers.current[name] = undefined;
      fn();
    }, ms);
  };

  /* 가려는 곳 — 연출 뒤에 줄 선 것이 있으면 그것, 아니면 지금 자리 */
  const heading = (): Place => queued.current ?? place.current;

  /* 판을 연다 — 격자를 눌렀거나 5초 머물렀다. 무엇이 돌고 있든 기다리지 않는다. */
  const openSheet = () => {
    inside.current = false;
    chose.current = false;
    clearTimers();
    go('sheet', true);
  };

  /*
   * 커서가 격자·도크 위에 있는가 — 브라우저의 '들어왔다·나갔다'가 아니라 자리로 잰다.
   *
   * 도크를 여닫는 것 자체가 연출이고, 연출이 도는 0.4초 남짓 동안 크롬은 화면
   * 전체를 <html> 하나로 친다(within). 그래서 커서가 격자 위에 가만히 있어도 격자를
   * '떠났다'는 소식이 오고, 연출이 끝나면 '들어왔다'가 다시 왔다. 그 소식대로
   * 여닫았더니 격자에 커서를 대고 있는 내내 도크가 열리자마자 닫히고 다시 열리기를
   * 4초마다 되풀이했다.
   *
   * 들어온 것만 격자·도크의 pointerenter 로 듣고, 그 뒤로는 커서가 움직일 때마다
   * 문서 전체에서 자리를 잰다. 연출 중에도 움직임은 좌표를 들고 온다.
   */
  const overZone = (x: number, y: number) =>
    within(gridRef.current, x, y) || within(dockRef.current, x, y);

  /*
   * 커서가 들어왔다.
   *
   * 5초는 처음 들어온 때부터 잰다. 격자에서 도크로 옮겨 가는 것은 같은 곳 안에서
   * 움직인 것이라 처음부터 다시 재지 않는다.
   */
  const arrive = () => {
    inside.current = true;
    clearTimer('close');
    /* 떠나서 닫히기로 줄 서 있던 것을 거둔다 — 도로 들어왔다 */
    if (queued.current === 'bar' && place.current === 'dock') queued.current = null;
    const now = heading();
    if (now === 'sheet') return;
    if (now === 'bar') {
      later('open', DOCK_OPEN_MS, () => {
        if (inside.current) go('dock');
      });
    }
    if (!chose.current) {
      later('dwell', DOCK_HOVER_MS, () => {
        if (inside.current) openSheet();
      });
    }
  };

  /* 커서가 떠났다 — 잠깐 기다렸다 닫는다. 그사이 돌아오면 거둔다(arrive). */
  const depart = () => {
    inside.current = false;
    clearTimer('open');
    later('close', DOCK_CLOSE_MS, () => {
      if (inside.current) return;
      /* 커서는 가만히 있는데 도크가 그 밑으로 펼쳐졌다 — 떠난 것이 아니다 */
      const at = last.current;
      if (at && overZone(at.x, at.y)) {
        arrive();
        return;
      }
      clearTimer('dwell');
      chose.current = false;
      unwatch();
      if (heading() === 'dock') go('bar');
    });
  };

  /* 도크에서 하나를 골랐다 — 5초 뒤에 판이 불쑥 열리지 않게, 머무름을 더 재지 않는다 */
  const choose = () => {
    chose.current = true;
    clearTimer('dwell');
  };

  /* 커서를 지켜보기 시작한다 — 격자·도크를 떠나 도크가 닫힐 때까지 */
  const watch = () => {
    if (watcher.current) return;
    const ac = new AbortController();
    watcher.current = ac;
    const opts = { capture: true, signal: ac.signal };
    document.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        last.current = { x: e.clientX, y: e.clientY };
        const over = overZone(e.clientX, e.clientY);
        if (over && !inside.current) arrive();
        if (!over && inside.current) depart();
      },
      { ...opts, passive: true }
    );
    /* 창 밖으로 나갔다 — 그 뒤로는 움직임이 오지 않으니 여기서 떠난 것으로 친다 */
    document.addEventListener(
      'pointerout',
      (e) => {
        if (e.pointerType !== 'mouse' || e.relatedTarget != null) return;
        last.current = null;
        if (inside.current) depart();
      },
      { ...opts, passive: true }
    );
    /*
     * 연출 중에 누른 것도 <html> 을 누른 것으로 온다. 격자에 커서를 대자마자 누르면
     * 도크가 펼쳐지는 중이라, 판이 안 열리고 한 번 더 눌러야 했다. 누른 자리에 있는
     * 단추(격자·도크의 아이콘)를 찾아 대신 누른다.
     */
    document.addEventListener(
      'click',
      (e) => {
        if (e.target !== document.documentElement || !isPlainClick(e)) return;
        const hit = [
          gridRef.current,
          ...(dockRef.current?.querySelectorAll('a') ?? []),
        ].find((el) => within(el, e.clientX, e.clientY));
        if (!hit) return;
        if (hit !== gridRef.current) choose();
        hit.click();
      },
      opts
    );
  };

  /*
   * 격자나 도크에 커서가 들어왔다 — 여기서부터 커서를 지켜본다.
   *
   * 마우스만 받는다. 손가락은 '올려 두기'가 없어서, 누르는 순간 들어옴과 누름이
   * 한꺼번에 와 도크가 떴다가 곧장 판이 된다. 손가락으로는 누르면 판이 바로 열린다.
   */
  const enterZone = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    last.current = { x: e.clientX, y: e.clientY };
    watch();
    if (!inside.current) arrive();
  };

  const pickInDock = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') choose();
  };

  /*
   * 도크는 Esc 나 바깥을 눌러도 닫힌다.
   *
   * 판처럼 <dialog> 로 만들지 않았다. 판은 화면을 덮으니 바깥을 못 누르게 막는
   * 것이 맞지만, 도크는 떠 있는 채로 본문을 써도 되는 물건이라 막으면 안 된다.
   * 그 대신 '바깥'을 직접 가린다 — 도크와 막대(격자·톱니·내 정보) 안은 바깥이
   * 아니다. 설정·내 정보 창이 떠 있을 때는 그 창의 배경을 눌러도 도크를
   * 건드리지 않는다.
   *
   * 문서에 거는 리스너는 도크가 뜰 때 한 번만 걸고, 그 안에서는 늘 최신 값을
   * 본다(useEffectEvent). 값이 바뀔 때마다 다시 걸면 창을 열고 닫을 때마다
   * 리스너가 갈린다.
   */
  const modalOpen = settingsOpen || profileOpen;
  const onOutside = useEffectEvent((e: PointerEvent) => {
    if (modalOpen) return;
    const t = e.target as Node;
    if (dockRef.current?.contains(t) || navRef.current?.contains(t)) return;
    /* 연출 중에는 어디를 눌러도 <html> 로 온다 — 막대·도크 자리면 바깥이 아니다 */
    if (
      within(navRef.current, e.clientX, e.clientY) ||
      within(dockRef.current, e.clientX, e.clientY)
    ) {
      return;
    }
    clearTimers();
    go('bar');
  });
  const onEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape' || modalOpen) return;
    clearTimers();
    go('bar');
  });
  useEffect(() => {
    if (!dock) return;
    const down = (e: PointerEvent) => onOutside(e);
    const key = (e: KeyboardEvent) => onEscape(e);
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [dock]);

  /*
   * 화면을 떠날 때 걸어 둔 타이머와 커서 지켜보기를 거둔다 — 떠난 뒤에 도크를 열려고
   * 하지 않게
   */
  const stopWatching = useEffectEvent(() => unwatch());
  useEffect(() => {
    const t = timers.current;
    return () => {
      Object.values(t).forEach((id) => {
        if (id != null) window.clearTimeout(id);
      });
      stopWatching();
    };
  }, []);

  /* ── 이름표 — 연출의 옛·새 모습에서 무엇이 무엇으로 이어지는가 ── */

  /*
   * 연출의 두 끝 가운데 지금 어느 쪽을 그리고 있는가. 옛 모습은 출발한 자리,
   * 새 모습은 도착한 자리다.
   */
  const at: Place = open ? 'sheet' : dock ? 'dock' : 'bar';
  /* 도크와 오가는 연출 — 뒤가 어두워지지 않는다 */
  const hoverChoreo = choreo === 'bar-dock' || choreo === 'dock-bar';
  /* 막대가 한쪽 끝인 연출에서 막대 쪽을 그리는 중 — 막대의 넷이 날아간다 */
  const barFlies = choreo != null && at === 'bar';
  /*
   * 판에서 날아가는 아이콘 — 막대에 자리가 있는 것(자주 가는 곳)만 날아온다.
   * 도크에서 판이 될 때도 같다.
   *
   * 예전에는 도크에서 판이 될 때 도크의 아이콘 아홉이 전부 판으로 날아와 앉았다.
   * 한꺼번에 아홉이 날면 어지럽다는 말을 들었다. 이제 나머지(라이브러리·자료실·
   * 관리자)는 판이 거의 다 들어온 뒤 판의 제자리에서 돋아난다(growStyle).
   *
   * 판이 닫힐 때는 돋아났던 것들이 판에 실린 채 함께 밀려 나간다 — 갈 곳이 없는데
   * 따로 떠 있으면 판은 나가는데 아이콘만 남아 흩어진다.
   */
  const sheetIcons: 'none' | 'quick' =
    choreo == null || at !== 'sheet' ? 'none' : 'quick';
  const sheetGrows =
    at === 'sheet' && (choreo === 'dock-sheet' || choreo === 'bar-sheet');
  /*
   * 도크에서 날아가는 아이콘 — 막대와 오갈 때는 넷만 날고 나머지는 돋아난다.
   * 판이 될 때는 넷만 날고, 나머지는 이름표 없이 도크 상자와 함께 옅어진다.
   */
  const dockIcons: 'none' | 'hover' | 'quick' =
    choreo == null ? 'none' : choreo === 'dock-sheet' ? 'quick' : 'hover';
  /*
   * '지금 여기' 동그라미 — 도크와 오갈 때는 제 아이콘과 같은 딱지를 달고 같이
   * 날아간다(막대에 없는 곳이면 같이 돋아난다). 판과 오갈 때는 이름표 없이 판의
   * 어두운 막 밑에서 같이 어두워진다.
   */
  const activeIdx = activeHref != null ? flyIndex(activeHref) : -1;
  const activeKind: FlyKind =
    activeHref != null && quickHrefs.includes(activeHref) ? 'fly' : 'pop';
  const thumbName =
    choreo == null
      ? REST_THUMB
      : hoverChoreo && activeIdx >= 0
        ? flyStyle('nav-thumb', activeIdx, activeKind)
        : undefined;

  /*
   * 저장하고 나면 서버가 어딘가로 보내는데, 그 '어딘가'를 지금 보던 화면으로
   * 둔다. 창은 어느 화면 위에서나 열리므로, 고정해 두면 설정 하나 바꿨다고
   * 엉뚱한 화면으로 끌려간다.
   */
  const here = pathname;

  /*
   * 창이 어디서 튀어나올지 — 방금 누른 버튼의 한가운데.
   *
   * 누른 버튼은 이벤트가 알려준다(currentTarget). PC 와 모바일에 같은 버튼이
   * 한 벌씩 있지만, 눌린 쪽이 곧 보이는 쪽이라 따로 가려낼 것이 없다.
   */
  const [popFrom, setPopFrom] = useState<{ x: number; y: number } | null>(null);

  const openFrom = (el: HTMLElement | null, show: (on: boolean) => void) => {
    /* 도크가 떠 있거나 연출이 도는 중이면 곧장 거둔다 — 창이 뜨는 움직임이 가려진다 */
    if (running.current || place.current === 'dock' || queued.current === 'dock') {
      clearTimers();
      drop();
    }
    const r = el?.getBoundingClientRect();
    setPopFrom(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    show(true);
  };

  return (
    <>
      {/*
        로고 — 왼쪽 위.

        본문 위쪽 여백(desk:pt-16)이 이 높이만큼 비워져 있어 글과 겹치지 않는다.
      */}
      <Link
        href="/today"
        /*
         * 연출 중에는 이름표를 뗀다. 이름표가 붙은 것은 연출하는 동안 뒤 어두운
         * 막 위로 따로 그려져서, 다 끝날 때까지 안 어두워졌다가 마지막에 툭
         * 어두워진다.
         */
        style={{ viewTransitionName: choreo ? 'none' : 'shell-logo' }}
        className="fixed left-6 top-5 z-40 hidden items-center gap-2 desk:flex"
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
      */}
      <nav
        ref={navRef}
        aria-label="간편 이동"
        className="fixed right-4 top-3 z-40 hidden items-center desk:flex"
      >
        {/*
          살짝 비치는 알약.

          처음에는 배경 없이 본문 위에 얹어 두었는데, 본문의 카드나 그래프 위로
          굴러 올라오면 아이콘이 그 속에 묻혔다. 뒤를 흐리고 반쯤 덮으면 무엇이
          지나가든 아이콘은 늘 읽힌다.

          막대와 따로 떼어 둔 판이다. 도크가 뜨고 질 때 알약만 따로 줄이고 펴야
          하는데(globals.css 의 nav-pill), 알약이 막대 자체면 안의 단추까지 같이
          늘었다 줄었다 한다. 뒤를 흐리는 것도 이 판이 한다 — 이름표를 단
          요소(shell-topnav) 안에 두면 그 요소 밖의 본문을 흐리지 못한다.
        */}
        <span
          aria-hidden
          style={{
            viewTransitionName: hoverChoreo
              ? 'nav-pill'
              : choreo
                ? 'none'
                : 'shell-pill',
          }}
          className="absolute inset-0 rounded-full border border-line/70 bg-surface/75 shadow-sm backdrop-blur-md"
        />
        <div
          style={{ viewTransitionName: choreo ? 'none' : 'shell-topnav' }}
          className="relative flex items-center p-1"
        >
          <QuickBar
            quick={quick}
            isActive={isActive}
            activeHref={at === 'bar' ? activeHref : null}
            routeDriven={routeDriven}
            onPick={setPick}
            collapsed={at !== 'bar'}
            instant={choreo != null}
            flyIndex={flyIndex}
            iconsNamed={barFlies}
            thumbName={thumbName}
          />

          {/*
            격자·톱니·내 정보. 알약이 줄고 펴는 동안 제자리를 지키도록, 도크와
            오가는 연출에서는 따로 이름표를 단다(nav-tail).
          */}
          <div
            style={{ viewTransitionName: hoverChoreo ? 'nav-tail' : 'none' }}
            className="flex items-center gap-0.5"
          >
            <MenuSquares
              buttonRef={gridRef}
              lit={at !== 'bar'}
              expanded={open}
              onOpen={openSheet}
              onPointerEnter={enterZone}
            />

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
          </div>
        </div>
      </nav>

      {dock && (
        <DockGrid
          ref={dockRef}
          anchor={anchor ?? DOCK_FALLBACK}
          items={flat}
          isActive={isActive}
          activeHref={activeHref}
          routeDriven={routeDriven}
          onPick={setPick}
          onPointerEnter={enterZone}
          onPointerDown={pickInDock}
          name={choreo == null ? 'shell-dock' : 'nav-dock'}
          icons={dockIcons}
          quickHrefs={quickHrefs}
          flyIndex={flyIndex}
          thumbName={thumbName}
          built={dockBuilt}
        />
      )}

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

      <MobileTabs tabs={tabs} menuOpen={open} onMenu={() => go('sheet')} />

      <DetailMenu
        groups={groups}
        nickname={nickname}
        avatarUrl={avatarUrl}
        isAdmin={isAdmin}
        isActive={isActive}
        open={open}
        onClose={() => go('bar')}
        onNavigate={drop}
        onDismissed={() => {
          if (place.current !== 'sheet') return;
          setSheetBuilt(false);
          land('bar');
        }}
        onProfile={(el) => openFrom(el, setProfileOpen)}
        flyIndex={flyIndex}
        flyNames={sheetIcons}
        grows={sheetGrows}
        quickHrefs={quickHrefs}
        built={sheetBuilt}
        quiet={choreo === 'sheet-bar'}
      />
    </>
  );
}

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
function QuickBar({
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
  /* 펼친 폭 — 아이콘(40px)과 그 뒤 틈(2px)마다 42px, 선 1px 과 그 양옆 여백(6 + 8px) */
  const full = quick.length * 42 + 15;

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
      <span aria-hidden className="ml-1.5 mr-2 h-6 w-px shrink-0 bg-line" />
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
function MenuSquares({
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
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-75 ${
        lit ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-ink/6 hover:text-ink'
      }`}
    >
      <Squares spinning={spinning} onDone={() => setSpinning(false)} />
    </button>
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
function Squares({ spinning, onDone }: { spinning: boolean; onDone: () => void }) {
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
          style={{ '--sq': i } as CSSProperties}
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
        open ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-ink/6 hover:text-ink'
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
 * 지금 보고 있는 곳의 배경은 여기서 그리지 않는다. 그 동그라미는 넷이 같이
 * 쓰는 하나라(QuickBar), 여기서는 색만 켠다.
 *
 * 올렸을 때의 배경은 반투명한 잉크색이다. 알약이 비치는 바탕이라, 불투명한
 * surface-2 를 얹으면 밝은 테마에서 알약과 거의 같은 색이 되어 안 보였다.
 */
function TopIcon({
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
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={current ? 'page' : undefined}
      data-thumb-key={item.href}
      onClick={(e) => {
        if (isPlainClick(e)) onPick();
      }}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
        hidden
          ? 'opacity-0 [transition:none]'
          : instant
            ? 'opacity-100 [transition:none]'
            : 'opacity-100 [transition:color_75ms,background-color_75ms,opacity_240ms_ease-out]'
      } ${lit ? 'text-sky' : 'text-muted hover:bg-ink/6 hover:text-ink'}`}
    >
      <Icon
        aria-hidden
        className="relative h-5 w-5"
        strokeWidth={lit ? 2.4 : 1.9}
        style={flyName}
      />
    </Link>
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
function DockGrid({
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
  name: 'shell-dock' | 'nav-dock';
  /**
   * 연출에서 아이콘에 다는 이름표 — 막대와 오갈 때(hover)는 넷만 날고 나머지는
   * 돋아난다. 판이 될 때(quick)는 넷만 날고 나머지는 이름표 없이 상자와 함께 옅어진다.
   */
  icons: 'none' | 'hover' | 'quick';
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
      className="fixed z-40 hidden translate-x-1/2 rounded-2xl border border-line/70 bg-surface/70 p-1.5 shadow-lg backdrop-blur-xl desk:block"
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
          const named = icons === 'hover' || (icons === 'quick' && quick);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive(item.href) ? 'page' : undefined}
              data-thumb-key={item.href}
              onClick={(e) => {
                if (isPlainClick(e)) onPick(item.href);
              }}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-75 ${
                lit ? 'text-sky' : 'text-muted hover:bg-ink/6 hover:text-ink'
              }`}
            >
              <Icon
                aria-hidden
                className="h-5 w-5"
                strokeWidth={lit ? 2.4 : 1.9}
                style={named ? flyStyle(`nav-fly-${i}`, i, kind) : undefined}
              />
              <Tip>{item.label}</Tip>
            </Link>
          );
        })}
      </nav>
    </div>
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
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 -translate-y-0.5 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium leading-none text-page opacity-0 shadow-md transition-[opacity,translate] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
    >
      {children}
    </span>
  );
}

/**
 * 격자를 누르거나 도크에 오래 머물면 펴는 상세 메뉴(판). 휴대폰은 '더보기'로 편다.
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
 * 한 화면에 다 들어가게 줄였다. 예전에는 항목마다 여백이 넉넉해서 노트북
 * 화면에서는 관리자 줄이 잘려 굴려야 했다. 메뉴는 훑어보는 것이라 한눈에 다
 * 보여야 하고, 굴리는 순간 '더 있나?' 하고 두 번 보게 된다.
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
  /** 아이콘의 이름표 번호 — 도크·막대와 같은 번호를 쓴다 */
  flyIndex: (href: string) => number;
  /** 연출에서 날아오는 아이콘에 이름표를 다는가: 막대의 넷만 · 없음(연출 아님) */
  flyNames: 'none' | 'quick';
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
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-drawer
      data-built={built ? '' : undefined}
      data-quiet={quiet ? '' : undefined}
      style={flyNames !== 'none' ? { viewTransitionName: 'nav-sheet' } : undefined}
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
      /* 배경을 눌러도 닫는다. 배경 클릭은 dialog 자기 자신을 목표로 삼는다. */
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      /*
       * 살짝 비친다(bg-surface/92). 유리처럼 뒤가 어렴풋이 보이되, 글자가 뒤와
       * 섞일 만큼은 아니다. 뒤를 흐리는 것은 PC 에서만 — 아이폰 사파리는 흐린
       * 면 위로 무언가 움직일 때마다 다시 계산하다 깜빡인다(MobileTopBar 참고).
       * 왼쪽 모서리의 곡선은 globals.css 의 dialog[data-drawer] 가 준다.
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
      className="h-full w-64 border-l border-line/80 bg-surface/92 p-0 text-ink shadow-2xl backdrop:bg-shade/50 desk:backdrop-blur-xl"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="text-heading text-sm text-ink">메뉴</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-ink/6 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5">
          {groups.map((group, gi) => (
            <div
              key={group.title ?? `g${gi}`}
              /*
               * 제목 없는 묶음(홈·영상·트레이닝·분석)은 한 줄씩이라 붙여 두고,
               * 제목 있는 묶음 앞에서만 선을 긋고 띈다. 묶음마다 같은 간격을
               * 주면 위 넷 사이가 제목 자리처럼 비어 보였다.
               */
              className={
                group.title
                  ? 'mt-2.5 space-y-0.5 border-t border-line/70 pt-2.5'
                  : 'space-y-0.5'
              }
            >
              {group.title && (
                <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-normal text-ink/65">
                  {group.title}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active = isActive(item.href);
                const i = flyIndex(item.href);
                const quick = quickHrefs.includes(item.href);
                const fly = flyNames === 'quick' && quick;
                const grow = grows && !quick;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                    className={`flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-75 ${
                      active
                        ? 'bg-sky text-white'
                        : 'text-ink hover:bg-ink/6 active:bg-ink/6'
                    }`}
                  >
                    <Icon
                      aria-hidden
                      className="mt-0.5 h-4 w-4 shrink-0"
                      strokeWidth={active ? 2.4 : 1.9}
                      style={
                        fly
                          ? flyStyle(`nav-fly-${i}`, i, 'fly')
                          : grow
                            ? growStyle(`nav-grow-${i}`, growOrder.get(item.href) ?? 0)
                            : undefined
                      }
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-[13px] leading-5 ${active ? 'font-semibold' : 'font-medium'}`}
                      >
                        {item.label}
                      </span>
                      {/* 골라져 있을 때는 흰 글자 위라 설명을 조금 눕혀 둔다 */}
                      {item.desc && (
                        <span
                          className={`block text-[11px] leading-4 break-keep ${
                            active ? 'text-white/75' : 'text-ink/65'
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
          className="flex w-full shrink-0 items-center gap-3 border-t border-line px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-left transition-colors duration-75 hover:bg-ink/6"
        >
          <Avatar nickname={nickname} avatarUrl={avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">
              {nickname}
            </span>
            <span className="block text-xs text-ink/65">
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
 * 휴대폰 틀(desk 가 아닌 화면 — 손가락으로 쓰는 1024px 밑이거나, 576px 밑)에는
 * 오른쪽 위 아이콘 줄이 없다. 그렇다고 설정과 내 정보를 갈 곳
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
      className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-surface px-4 desk:hidden"
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
 * 하단 탭의 얼굴 — 누르는 즉시 하늘색이 된다.
 *
 * 화면이 실제로 바뀌는 것은 서버가 새 화면을 보내 준 뒤다. 그동안 아무 표시가
 * 없으면 '눌렸나?' 하고 한 번 더 누르게 된다. 링크가 움직이기 시작한
 * 순간(useLinkStatus 의 pending)부터 켜진 색으로 바꿔, 누른 곳이 바로 대답하게 한다.
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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] desk:hidden"
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
