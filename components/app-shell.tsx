'use client';

import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { ChevronLeft, Lock } from '@/components/icon';
import { goBack } from '@/components/back-link';
import { TAB_CHOSEN_EVENT, useTabLens } from '@/components/tab-lens';
import {
  barSnapshot,
  currentUrl,
  sameScreen,
  serverBarSnapshot,
  setNavDirection,
  subscribeBar,
} from '@/lib/nav-state';
import { NAV_ICONS, NAV_TINT } from '@/components/nav-icons';
import { slideToTab } from '@/components/tab-pager';
import { onAnyScroll, scrollToTop, scrollTopNow } from '@/lib/scroller';
import { AppIcon } from '@/components/app-icon';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { quietRefresh } from '@/lib/quiet-refresh';
import { forgetPage, rememberPage } from '@/lib/last-page';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import type { NavGroup, NavItem } from '@/lib/nav';
import { DESK_MEDIA, MORE_HREF, NAV_ALSO, NAV_GROUPS, isLockSideHref } from '@/lib/nav';
import { Wordmark } from '@/components/logo';
import { Modal } from '@/components/modal';
import { ProfilePanel, type ProfileData } from '@/components/profile-panel';
import { SettingsPanel, type SettingsData } from '@/components/settings-panel';
import { CLOSE_SETTINGS_EVENT } from '@/components/settings-info';
import { CheckinFlow } from '@/components/checkin-flow/flow';
import type { CheckinFlowContext } from '@/components/checkin-flow/types';
import { haptic } from '@/lib/haptics';
import type { NavDirection } from '@/lib/nav-state';
import {
  NoticeBellButton,
  NoticePanel,
  OPEN_CHECKIN_EVENT,
  type NoticeState,
} from '@/components/notice-bell';
import { useTodayKey } from '@/components/use-today-key';
import {
  isPlainClick,
  thumbStyle,
  useSlidingThumb,
} from '@/components/use-sliding-thumb';

/** 메뉴 주소 전부(경로만) — 더 자세한 메뉴가 있는지 볼 때 쓴다 */
const MENU_PATHS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href.split('?')[0]));

/**
 * 현재 위치 판정. 하위 경로도 같은 메뉴로 본다.
 * 단 '/'로 시작하는 다른 메뉴를 잘못 물지 않게 정확히 비교한다.
 *
 * 하위 경로에 더 자세한 메뉴가 따로 있으면 그 메뉴만 켜진다 — 구속 측정 관리자(/admin/velocity)
 * 에서 관리자(/admin)까지 같이 켜져, 사이드바에 불이 두세 개 들어와 있었다.
 */
function useIsActive() {
  const pathname = usePathname();
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  /*
   * 메뉴 주소에 ?칸이 붙을 수 있다(트레이닝 — lib/training-part.ts) — 경로만 본다.
   * 그 탭에 속하는 다른 주소도 본다(투구 기록 ← 날짜 화면 · 구속 측정 관리자, lib/nav.ts 의 NAV_ALSO).
   * 잠긴 곁 항목(구속 측정 → 투구 기록 설정, lib/nav.ts isLockSideHref)은 켜지 않는다 — 같은 설정 화면은 탭 항목
   * (투구 기록)이 맡는다. 경로만 보면 둘이 같이 켜졌다.
   */
  return (href: string) => {
    if (isLockSideHref(href)) return false;
    const path = href.split('?')[0];
    if ((NAV_ALSO[path] ?? []).some(under)) return true;
    if (!under(path)) return false;
    return !MENU_PATHS.some((p) => p !== path && p.startsWith(`${path}/`) && under(p));
  };
}

/*
 * 도크(아이콘만 모인 작은 판)가 뜨고 지는 시간.
 *
 * 격자에 커서를 대면 뜬다. 0.1초는 '대자마자'로 느껴지면서도, 막대를 가로질러
 * 지나가는 커서(40px 짜리 격자를 0.05초 남짓에 지난다)에는 걸리지 않는 길이다.
 * 지나가다 걸리면 가려던 아이콘이 눈앞에서 도크로 날아가 버린다.
 *
 * 떠날 때는 0.14초를 기다린다. 격자에서 그 밑의 도크로 커서를 옮기는 동안 잠깐
 * 둘 다에서 벗어나는데(6px 틈), 그 틈에 닫히면 도크에 닿을 수가 없다. 예전에는
 * 0.22초였는데 닫는 것이 굼뜨다는 말을 들었다(2026-09-26) — 틈을 지나는 데는
 * 0.1초면 넉넉하다. 닫는 연출 자체도 빨라졌다(globals.css 의 dock-bar).
 */
const DOCK_OPEN_MS = 100;
const DOCK_CLOSE_MS = 140;

/**
 * 격자·도크 위에 커서를 이만큼 두면 판(이름까지 있는 전체 메뉴)이 저절로 열린다.
 *
 * 아이콘만 있는 도크에서 무엇인지 몰라 머뭇거리는 시간이다. 그보다 짧으면 도크를
 * 훑어보는 도중에 열려 버리고, 그보다 길면 기다리다 그냥 누른다.
 */
const DOCK_HOVER_MS = 5000;

/**
 * 도크로 가는 연출을 빨리 감는 배속 — 도크가 다 모이기 전에 판을 열 때.
 *
 * 막대 → 도크는 아이콘이 차례로 출발해 0.4초 남짓 걸린다. 4배면 남은 것이 0.1초 안에
 * 끝나, 누르고 나서 판이 늦게 온다는 느낌 없이 도크를 거쳐 판으로 이어진다.
 */
const HURRY_RATE = 4;

/**
 * 메뉴가 놓이는 세 자리.
 *
 *   bar    오른쪽 위 한 줄. 평소.
 *   dock   격자 바로 밑에 뜨는 반투명 상자. 막대의 아이콘들이 모여 앉고, 막대에
 *          없는 것까지 전부 4칸씩 줄지어 있다. 이름은 커서를 올려야 보인다.
 *   sheet  이름까지 있는 전체 메뉴 — PC 는 도크가 그 자리에서 부풀어 된 팝업(2026-10-09, 예전에는 화면
 *          오른쪽 끝에서 밀려 나오는 세로 판이었다 — "화면을 너무 많이 가린다"), 휴대폰은 아래 시트.
 */
type Place = 'bar' | 'dock' | 'sheet';

/** 두 자리 사이를 오가는 연출 — '출발-도착'. 움직임은 app/globals.css 에 있다. */
type Choreo = 'bar-dock' | 'dock-bar' | 'dock-sheet' | 'bar-sheet' | 'sheet-bar';

/** 날아가는 것(양쪽에 다 있다)과 제자리에서 돋아나거나 잦아드는 것(한쪽에만 있다) */
type FlyKind = 'fly' | 'pop';

/**
 * 도크 · 팝업이 설 자리 — 위에서 잰 거리와, 화면 오른쪽 끝에서 잰 거리.
 *   right  격자 단추 한가운데까지(도크는 여기에 가운데를 맞춘다)
 *   edge   막대의 오른쪽 끝까지 = 화면 끝에서 조금 띄운 자리(팝업은 여기에 오른쪽 끝을 맞춘다 — 2026-10-09 사용자:
 *          "오른쪽 끝에 조금 띄운 상태로 붙여줘"). 도크는 격자 밑 가운데라 팝업으로 자라며 오른쪽으로 조금 옮겨 앉는다
 */
type Anchor = { top: number; right: number; edge: number };

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

/**
 * 격자 단추를 못 잰 경우의 도크 자리 — 지금 막대 크기로 셈한 값.
 * 격자 오른쪽에 종(32px)이 들어서며 격자 한가운데가 오른쪽 끝에서 34px 멀어졌다.
 */
const DOCK_FALLBACK: Anchor = { top: 74, right: 158, edge: 16 };

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
    r != null && r.width > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom
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
  todo,
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
  /**
   * 알림(종)에 쓸 것 — 최근 며칠 동안 체크인한 날·투구를 남긴 날(YYYY-MM-DD), 그리고
   * 종에서 여는 체크인 창이 오늘 것을 채울 최근 체크인과 고를 수 있는 운동 부위.
   * 체크인 관문에 주는 것과 같은 재료라 레이아웃이 더 묻지 않는다.
   */
  todo: {
    checkinDays: string[];
    pitchDays: string[];
    /** 종에서 여는 체크인 흐름(3판)의 둘레 — 관문과 같은 재료(components/checkin-flow/types.ts) */
    flow: CheckinFlowContext;
    /** 투구 기록이 잠겨 있다(첫 설정 전, lib/feature-locks.ts) — 종의 투구 할 일이 설정으로 가는 단추가 된다 */
    pitchLocked: boolean;
  };
}) {
  const isActive = useIsActive();
  const pathname = usePathname();

  /* 팝업(날짜 화면)이 뜨기 전의 화면을 적어 둔다 — 팝업의 '돌아가기'가 쓴다(lib/last-page.ts) */
  useEffect(() => {
    rememberPage(pathname);
  }, [pathname]);
  /*
   * 뒤로 · 앞으로 가기와 이 틀을 떠날 때는 잊는다 — 브라우저가 되살린 팝업은 적어 둔 화면 위에 뜬다는 보장이 없다.
   * 팝업에서 '투구 기록'으로 옮긴 뒤 뒤로 가면 팝업이 홈 위에 다시 떴는데 '← 투구 기록'이라고 해, 누르면 닫히기만
   * 했다. 모르면 두 단추가 그냥 링크가 된다(lib/last-page.ts).
   */
  useEffect(() => {
    window.addEventListener('popstate', forgetPage);
    return () => {
      window.removeEventListener('popstate', forgetPage);
      forgetPage();
    };
  }, []);

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
   * 설정 · 내 정보를 더보기 폴더에서 열었나 — 그 창을 닫으면(막 누름 · 끌어내림 · Esc) 폴더로 돌아간다(2026-10-15 사용자
   * "메뉴에 들어간 뒤 눌러 들어가니, 나갈 때 원래 메뉴로"). 위 막대 · PC 에서 연 것은 그냥 닫힌다.
   */
  const backToMenu = useRef(false);
  const closeToMenu = (show: (on: boolean) => void) => {
    show(false);
    if (!backToMenu.current) return;
    backToMenu.current = false;
    /* 창이 내려가기 시작한 뒤 폴더가 부풀어 뜬다 */
    window.setTimeout(() => go('sheet'), 120);
  };
  /* 알림(종)의 작은 창, 그리고 거기서 여는 오늘 체크인 창 */
  const [bellOpen, setBellOpen] = useState(false);
  /*
   * 휴대폰 종은 아래 시트로 연다(2026-10-04 '앱 느낌' 4단계) — 위 막대 밑에 붙는 작은 창은 웹사이트의 드롭다운 같았다.
   * 열고 닫는 것은 bellOpen 하나 그대로, 어느 종으로 열었는지만 여기 적는다(PC 종은 예전처럼 작은 창).
   */
  const [bellSheet, setBellSheet] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  /* 종 단추 — PC 막대와 휴대폰 위 막대에 한 벌씩 */
  const bellPcRef = useRef<HTMLButtonElement>(null);
  const bellPhoneRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  /*
   * 지금 있는 자리와, 돌고 있는 연출, 그 연출이 끝나면 가야 할 곳.
   *
   * 타이머와 연출이 끝난 뒤의 콜백에서 읽으므로 상태가 아니라 ref 로 든다 — 거기서
   * 상태를 읽으면 콜백을 만든 때의 옛 값을 본다.
   */
  const place = useRef<Place>('bar');
  const running = useRef<ViewTransition | null>(null);
  /* 돌고 있는 연출이 어디서 어디로 가는 것인가 */
  const runningKind = useRef<Choreo | null>(null);
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
    /* 메뉴가 막대를 떠나면 알림 창은 닫는다 — 도크·판이 그 자리를 덮는다 */
    if (to !== 'bar') setBellOpen(false);
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
    const width = document.documentElement.clientWidth;
    const right = Math.round(width - (btn.left + btn.width / 2));
    /* 팝업의 오른쪽 끝 — 막대의 오른쪽 끝(right-4, 화면 끝에서 16px) */
    const edge = Math.round(width - bar.right);
    return { top: Math.round(bar.bottom + 6), right, edge };
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
      /* 도크 · 팝업이 설 자리 — 팝업은 도크의 자리를 이어받는다(도크가 떠 있는 동안 잰다) */
      if (to !== 'bar') setAnchor(measureAnchor());
      /* 알림 창은 옛 모습이 찍히기 전에 닫는다 — 찍히면 연출 내내 막대에 매달려 있다 */
      if (to !== 'bar') setBellOpen(false);
    });

    /*
     * 옮기기도 전에 건너뛰어졌다(아래 ready.catch) — 다른 전환이 끼어들면 브라우저는 그 거절을
     * 먼저 알리고 옮기는 일(update)은 뒤에 부른다. 그때는 연출로 뜬 것으로 치지 않는다. 쳤더니
     * 판이 제 여는 움직임 없이 툭 나타났다.
     */
    let skipped = false;
    const vt = document.startViewTransition(() => {
      /* 그사이 이 연출이 거둬졌으면(판의 링크를 눌렀다든지) 옮기지 않는다 */
      if (running.current !== vt) return;
      /* 새 모습: 도착한 쪽으로 옮긴다. 이름표도 그리로 따라간다. */
      flushSync(() => {
        if (to === 'dock') setDockBuilt(!skipped);
        if (to === 'sheet') setSheetBuilt(!skipped);
        land(to);
      });
    });
    running.current = vt;
    runningKind.current = kind;
    /*
     * 연출 중에는 크롬이 무엇을 눌러도 <html> 로 준다. 도크가 펼쳐지거나 접히는 짧은
     * 사이에 종·톱니·사진을 누르면 아무 일도 없어 한 번 더 눌러야 했다. 누른 자리에
     * 있는 막대의 단추·링크(열려 있으면 알림 창 안의 것까지)를 찾아 대신 누른다.
     *
     * 격자는 커서를 지켜보는 중(watch)이면 거기서 대신 누르므로 뺀다 — 둘 다 누르면
     * 판이 열렸다 곧장 닫힌다. 도크의 아이콘도 거기서 누른다.
     *
     * 판이 열리는 중에는 넘기지 않는다 — 그때 막대는 판의 어두운 바탕 밑이라, 그 자리를
     * 누른 것은 막대의 단추가 아니라 바탕이다.
     */
    const forward = new AbortController();
    document.addEventListener(
      'click',
      (e) => {
        if (to === 'sheet') return;
        if (e.target !== document.documentElement || !isPlainClick(e)) return;
        const hit = [
          ...(navRef.current?.querySelectorAll<HTMLElement>('button, a') ?? []),
        ]
          .filter((el) => !(watcher.current && el === gridRef.current))
          .find((el) => within(el, e.clientX, e.clientY));
        hit?.click();
      },
      { capture: true, signal: forward.signal }
    );
    vt.finished.finally(() => forward.abort());
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
      skipped = true;
      if (to === 'dock') setDockBuilt(false);
      if (to === 'sheet') setSheetBuilt(false);
    });
    vt.finished.finally(() => {
      if (running.current !== vt) return;
      running.current = null;
      runningKind.current = null;
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
    runningKind.current = null;
    queued.current = null;
    vt?.skipTransition();
    document.documentElement.removeAttribute('data-nav-choreo');
  };

  /*
   * 돌고 있는 연출을 빨리 감는다 — 끊지 않는다.
   *
   * 도크가 모이는 중에 격자를 누르면 예전에는 그 연출을 그 자리에서 끊고(halt) 판으로
   * 갔다. 끊는 순간 날아가던 아이콘이 도크 자리로 툭 옮겨 앉았다가 거기서 다시 판으로
   * 날아가, 커서를 대고 기다렸다 누를 때와 달리 부자연스러웠다. 이제 남은 움직임을
   * HURRY_RATE 배로 감아 도크에 마저 앉히고, 끝나는 대로 판으로 잇는다(queued).
   *
   * 연출의 움직임은 전부 ::view-transition 가상 요소의 CSS 애니메이션이라 문서에서
   * 찾아 배속만 바꾼다(지금 자리에서 이어서 빨라진다 — 튀지 않는다). 막 시작해 아직
   * 움직임이 만들어지기 전이면 만들어지는 대로(ready) 바꾼다.
   */
  const hurry = () => {
    const speed = () =>
      document.getAnimations().forEach((a) => {
        const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? '';
        if (pseudo.startsWith('::view-transition')) a.updatePlaybackRate(HURRY_RATE);
      });
    speed();
    running.current?.ready.then(speed, () => {});
  };

  /*
   * 가고 싶은 곳을 말하면 거기로 간다.
   *
   * 커서로 여닫는 도크는 연출이 도는 중이면 끝난 뒤에 간다. 들락날락이 잦아서,
   * 도중에 끊고 새로 시작하면 날아가던 아이콘이 사라졌다가 엉뚱한 데서 다시
   * 나타난다. 줄을 세워 두면 늘 커서가 있는 쪽으로 맞춰진다.
   *
   * 판은 기다리지 않는다(now). 격자를 누른 것은 분명히 판을 보겠다는 뜻이다. 예전에는
   * 도크가 다 모인 뒤에야 판으로 이어져서 누르고도 한참 작은 상자만 보였고, 그다음에는
   * 모이던 연출을 끊고 곧장 판으로 갔는데 끊는 순간 아이콘이 툭 튀었다. 이제 모이던
   * 연출을 빨리 감아(hurry) 마저 모이게 하고 곧바로 판으로 잇는다.
   *
   * 막대에서 판으로 갈 때도 도크를 거친다(빨리 감아서). 도크가 뜨기 전에 누르든, 다
   * 뜬 뒤에 누르든 아이콘이 같은 길(막대 → 격자 밑 → 판)로 가야 한 가지 움직임으로
   * 읽힌다. 막대에서 판으로 곧장 날리면 알약이 줄어드는 것과 판이 들어오는 것이 한꺼번에
   * 겹쳐 흐릿하게 섞였다.
   */
  const go = (to: Place, now = false) => {
    if (running.current) {
      if (!now) {
        queued.current = to;
        return;
      }
      /* 이미 판으로 가는 중이면 그대로 둔다 */
      if (runningKind.current?.endsWith('-sheet')) {
        queued.current = null;
        return;
      }
      if (to === 'sheet' && canChoreo()) {
        queued.current = 'sheet';
        hurry();
        return;
      }
      halt();
    }
    const from = place.current;
    if (from === to) return;
    if (!canChoreo()) {
      if (to !== 'bar') setAnchor(measureAnchor());
      setChoreo(null);
      setDockBuilt(false);
      setSheetBuilt(false);
      land(to);
      return;
    }
    if (from === 'bar' && to === 'sheet') {
      queued.current = 'sheet';
      run('bar-dock');
      hurry();
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
  const modalOpen = settingsOpen || profileOpen || checkinOpen;
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
  /* 도크와 오가는 연출 — '지금 여기' 동그라미가 아이콘과 같이 난다(팝업과 오갈 때는 팝업의 줄이 대신 켜진다) */
  const hoverChoreo = choreo === 'bar-dock' || choreo === 'dock-bar';
  /* 어느 연출이든 알약 · 격자 쪽은 이름표를 달고 제자리를 지킨다 — 뒤를 어둡게 하는 연출이 없어졌다 */
  const framed = choreo != null;
  /* 막대가 한쪽 끝인 연출에서 막대 쪽을 그리는 중 — 막대의 넷이 날아간다 */
  const barFlies = choreo != null && at === 'bar';
  /*
   * 팝업에서 나는 아이콘.
   *
   * 도크가 팝업이 될 때(dock-sheet)는 막대에도 있는 주 아이콘 넷만 도크에서 팝업의 제 줄로 난다. 나머지는
   * 도크에서 작아지며 사라지고(nav-pop), 팝업의 제자리에서 작은 것이 커지며 돋는다(growStyle) — 2026-10-09
   * 사용자: "메인으로 주로 쓰는 아이콘들만 날아오고 나머지는 작아지면서 사라졌다가 메뉴가 생기는 곳에서 커지게".
   *
   * 팝업이 닫힐 때(sheet-bar)는 막대에 자리가 있는 넷만 돌아가고, 나머지는 이름표 없이 팝업에 실린 채
   * 같이 줄어든다 — 갈 곳이 없는데 따로 떠 있으면 팝업은 줄어드는데 아이콘만 남아 흩어진다.
   */
  const sheetIcons: 'none' | 'quick' | 'all' =
    choreo == null || at !== 'sheet' ? 'none' : 'quick';
  const sheetGrows =
    at === 'sheet' && (choreo === 'bar-sheet' || choreo === 'dock-sheet');
  /*
   * 도크에서 나는 아이콘 — 막대 · 팝업 어느 쪽과 오가든 넷만 날고 나머지는 돋거나 잦아든다.
   */
  const dockIcons: 'none' | 'hover' | 'all' = choreo == null ? 'none' : 'hover';
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
   * 엉뚱한 화면으로 끌려간다. 주소의 ?뒤(보기 · 날짜)까지 — 경로만 넘겼더니 암케어 보기 · 목록 보기 · 고른 날에서
   * 저장하면 기본 보기 · 오늘로 돌아갔다.
   */
  const search = useSearchParams().toString();
  const here = search ? `${pathname}?${search}` : pathname;

  /*
   * 창이 어디서 튀어나올지 — 방금 누른 버튼의 한가운데.
   *
   * 누른 버튼은 이벤트가 알려준다(currentTarget). PC 와 모바일에 같은 버튼이
   * 한 벌씩 있지만, 눌린 쪽이 곧 보이는 쪽이라 따로 가려낼 것이 없다.
   */
  const [popFrom, setPopFrom] = useState<{ x: number; y: number } | null>(null);

  const openFrom = (el: HTMLElement | null, show: (on: boolean) => void) => {
    /*
     * 알림 창은 닫는다 — 그 위로 다른 창이 뜬다. 휴대폰에서는 톱니·사진이 알림 창과 같은
     * 위 막대 안이라 '바깥 누름'으로 안 닫혀, 설정 창 밑에 알림 창이 깔려 있었다.
     */
    setBellOpen(false);
    /* 도크가 떠 있거나 연출이 도는 중이면 곧장 거둔다 — 창이 뜨는 움직임이 가려진다 */
    if (running.current || place.current === 'dock' || queued.current === 'dock') {
      clearTimers();
      drop();
    }
    const r = el?.getBoundingClientRect();
    setPopFrom(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    show(true);
  };

  /* ── 알림(종) — 오늘 아직 안 한 것 ─────────────────────────────── */

  /*
   * 오늘이 무슨 날인지는 브라우저가 정한다(1분마다·앱을 다시 볼 때마다). 레이아웃은
   * 최근 며칠의 '한 날' 목록만 준다 — 밤새 켜 둔 탭도 자정이 지나면 서버를 부르지 않고
   * 새날의 할 일을 켠다. 처음 그릴 때는 서버의 오늘로 그려 점이 뒤늦게 튀지 않는다.
   */
  const day = useTodayKey(today);
  /*
   * 이 화면에서 방금 한 것 — 서버가 새 목록을 주기 전에도 점이 바로 꺼지게.
   *
   * 그때 받아 있던 서버 목록(basis)과 함께 적어 두고, 그 목록이 그대로일 때만 믿는다.
   * 새 목록이 오면 서버를 믿는다 — 예전에는 한 번 켜면 끝까지 남아서, '오늘 안
   * 던졌어요'를 누른 뒤 그 기록을 지워도 종은 '알림이 없어요'라고 했다.
   */
  const [restedHere, setRestedHere] = useState<{ day: string; basis: string[] } | null>(
    null
  );
  const notice: NoticeState = {
    day,
    /* 체크인은 저장하면 틀을 새로 그리므로(app/actions/checkin.ts revalidatePath layout) 목록이 곧바로 새로워진다 */
    checkinDone: todo.checkinDays.includes(day),
    pitchDone:
      todo.pitchDays.includes(day) ||
      (restedHere?.day === day && restedHere.basis === todo.pitchDays),
    pitchLocked: todo.pitchLocked,
  };

  /* 종과 그 밑의 창을 함께 감싼 자리 — PC·휴대폰 한 벌씩(하나는 늘 숨어 있다) */
  const bellPcBox = useRef<HTMLDivElement>(null);
  const bellPhoneBox = useRef<HTMLElement>(null);
  /* 창은 PC·휴대폰에 한 벌씩이라 이름(id)도 따로 둔다 — 같은 이름이 둘이면 휴대폰의 종이 숨은 PC 창을 가리킨다 */
  const bellPanelId = useId();
  const panelPcId = `${bellPanelId}-pc`;
  const panelPhoneId = `${bellPanelId}-phone`;

  /* 화면을 옮기면 닫는다 — 그리는 도중에 앞 주소와 견준다(위 pickedOn 과 같은 방법) */
  const [bellFor, setBellFor] = useState(pathname);
  if (bellFor !== pathname) {
    setBellFor(pathname);
    setBellOpen(false);
  }

  const toggleBell = (sheet: boolean) => {
    /* 도크가 떠 있으면 거둔다 — 도크가 종 밑을 덮는 자리라 둘이 겹친다 */
    if (running.current || place.current === 'dock' || queued.current === 'dock') {
      clearTimers();
      drop();
    }
    const opening = !bellOpen;
    setBellOpen(opening);
    if (opening) setBellSheet(sheet);
    /* 지난번 '오늘 안 던졌어요' 실패 알림은 새로 열 때 지운다 — 다음 날 열어도 남아 있었다 */
    if (opening) setRestError(undefined);
    /*
     * 열 때 새로 받는다. 틀(레이아웃)은 화면을 옮겨도 다시 그리지 않아서, 다른 기기에서
     * 남긴 기록을 모른 채 '아직 없어요'를 띄우고 '오늘 안 던졌어요'까지 누르게 할 수
     * 있다. 새로 받는 동안에도 창은 열린 채로 있고, 새 목록이 오면 바뀐다.
     *
     * 조용히 받는다(quietRefresh) — 그냥 router.refresh 로 받으면 본문 전체가 페이드해
     * 종을 누를 때마다 화면이 깜빡였다.
     */
    if (opening) quietRefresh(router);
  };

  /* 보이는 쪽 종으로 초점을 돌린다 — 창을 Esc 로 닫았을 때 초점이 문서 밖으로 떨어지지 않게 */
  const focusBell = () => {
    const visible = [bellPcRef.current, bellPhoneRef.current].find(
      (b) => b && b.offsetParent !== null
    );
    visible?.focus({ preventScroll: true });
  };

  /*
   * 창 바깥을 누르거나 Esc 를 누르면 닫는다.
   *
   * 종이 PC·휴대폰에 한 벌씩 있어서 리스너를 여기 하나만 건다. 종마다 걸면 숨은 쪽
   * 종의 리스너가 '내 바깥을 눌렀다'며 보이는 쪽 창을 닫아 버린다.
   *
   * 화면이 바뀌는 연출 중에는 크롬이 무엇을 눌러도 <html> 로 준다 — 그때는 자리로
   * 종·창 안인지 가린다(within). 안 그러면 창 안의 단추를 누르는 순간 창이 닫힌다.
   */
  const onBellOutside = useEffectEvent((e: PointerEvent) => {
    /* 시트는 창(Modal)이 스스로 닫는다 — 시트 안을 누를 때마다 닫히면 안 된다 */
    if (bellSheet) return;
    const t = e.target as Node;
    if (bellPcBox.current?.contains(t) || bellPhoneBox.current?.contains(t)) return;
    if (t === document.documentElement) {
      const spots = [
        bellPcRef.current,
        bellPhoneRef.current,
        document.getElementById(panelPcId),
        document.getElementById(panelPhoneId),
      ];
      if (spots.some((el) => within(el, e.clientX, e.clientY))) return;
    }
    setBellOpen(false);
  });
  const onBellEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    setBellOpen(false);
    focusBell();
  });
  useEffect(() => {
    if (!bellOpen) return;
    const down = (e: PointerEvent) => onBellOutside(e);
    const key = (e: KeyboardEvent) => onBellEscape(e);
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [bellOpen]);

  /*
   * 창에서 '체크인하기' — PC 는 체크인 흐름(3판)을 누른 단추에서 창으로 띄우고(알림 창은 openFrom 이 닫는다),
   * 휴대폰은 전체 화면 흐름(app/(session)/checkin)으로 간다 — 관문과 같은 기준(DESK_MEDIA).
   */
  const openCheckin = (el: HTMLElement | null) => {
    if (window.matchMedia(DESK_MEDIA).matches) {
      openFrom(el, setCheckinOpen);
      return;
    }
    setBellOpen(false);
    router.push('/checkin');
  };

  /*
   * 다른 화면의 '오늘 체크인'(OpenCheckinButton)도 이 창을 연다 — 창은 여기
   * 하나라 신호로 받는다. 리스너는 한 번만 걸고 그 안에서 최신 값을 본다.
   */
  const onOpenCheckinSignal = useEffectEvent((e: Event) => {
    const el = (e as CustomEvent<HTMLElement | null>).detail ?? null;
    openCheckin(el);
  });
  useEffect(() => {
    const handler = (e: Event) => onOpenCheckinSignal(e);
    window.addEventListener(OPEN_CHECKIN_EVENT, handler);
    return () => window.removeEventListener(OPEN_CHECKIN_EVENT, handler);
  }, []);

  /*
   * 설정 › 정보의 '사용 안내 다시 보기'(components/settings-info.tsx)가 설정 창을 닫으라고 보내는 신호. 다시 뜨는 투어는
   * 본문 안의 창이라 맨 위 칸(top layer)의 설정 창 밑에 깔리고, 설정 창이 떠 있는 동안은 눌리지도 않는다. 설정 창은
   * 여기 하나라 신호로 받는다(위 체크인 신호와 같은 길).
   */
  useEffect(() => {
    const close = () => {
      backToMenu.current = false;
      setSettingsOpen(false);
    };
    window.addEventListener(CLOSE_SETTINGS_EVENT, close);
    return () => window.removeEventListener(CLOSE_SETTINGS_EVENT, close);
  }, []);

  /*
   * '오늘 안 던졌어요' — 여기 하나에서 남긴다.
   *
   * 창 안에서 하면 창을 닫았다 다시 열거나 PC·휴대폰 틀이 바뀔 때 '남기는 중'을 잊어,
   * 느린 폰에서 두 번 눌러 쉬는 날 기록이 둘 생길 수 있었다(서버는 같은 날 기록을 여럿
   * 받는다). 저장 중인지는 ref 로도 막는다 — 한 번 그리기 전에 두 번 눌리는 것까지.
   */
  const [restSaving, setRestSaving] = useState(false);
  const [restError, setRestError] = useState<string>();
  const restBusy = useRef(false);
  const markRested = async (): Promise<boolean> => {
    if (restBusy.current) return false;
    restBusy.current = true;
    setRestSaving(true);
    setRestError(undefined);
    const basis = todo.pitchDays;
    try {
      const res = await fetch('/api/pitch-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: day,
          sessionType: REST_SESSION_TYPE,
          videoPaths: [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRestError(data.error ?? '저장하지 못했어요. 다시 눌러 주세요.');
        return false;
      }
      setRestedHere({ day, basis });
      /* 종에 넘겨주는 목록(레이아웃)과 보고 있던 화면을 새로 받는다 */
      quietRefresh(router);
      return true;
    } catch {
      setRestError('인터넷 연결을 확인한 뒤 다시 눌러 주세요.');
      return false;
    } finally {
      restBusy.current = false;
      setRestSaving(false);
    }
  };

  const noticePanel = (id: string, className: string, variant?: 'sheet') => (
    <NoticePanel
      id={id}
      variant={variant}
      state={notice}
      /*
       * 초점을 먼저 종으로 옮긴다 — 창이 닫히며 누른 단추가 사라지기 전에. 그래야
       * 체크인 창이 닫힐 때 초점이 종으로 돌아온다(문서 맨 위로 떨어지지 않는다).
       */
      onCheckin={(el) => {
        focusBell();
        openCheckin(el);
      }}
      onRest={markRested}
      resting={restSaving}
      restError={restError}
      onNavigate={() => setBellOpen(false)}
      className={className}
    />
  );

  return (
    <>
      {/*
        로고 — 왼쪽 위.

        본문 위쪽 여백(desk:pt-16)이 이 높이만큼 비워져 있어 글과 겹치지 않는다.
      */}
      {/*
        PC 위 막(2026-10-15) — 로고 · 오른쪽 위 줄 밑을 바탕색으로 덮고 밑에서 옅어진다. 1366px 보다 좁은 PC 창에서는 본문 칸이 로고 자리까지
        와서, 굴리면 카드 · 글이 로고 '불펜로그' 글자 밑으로 지나가며 겹쳤다(휴대폰 위 막대와 같은 문제 — 사용자 "다른 곳도 봐줘").
        globals.css 'desk-veil'. 로고 · 줄(z-40)보다 밑, 본문보다 위.
      */}
      <div
        aria-hidden
        data-desk-veil
        className="pointer-events-none fixed inset-x-0 top-0 z-39 hidden desk:block"
      />
      <Link
        href="/today"
        /*
         * 연출 중에는 이름표를 뗀다. 이름표가 붙은 것은 연출하는 동안 뒤 어두운
         * 막 위로 따로 그려져서, 다 끝날 때까지 안 어두워졌다가 마지막에 툭
         * 어두워진다.
         */
        style={{ viewTransitionName: choreo ? 'none' : 'shell-logo' }}
        /* ui-chrome — PC 의 작아진 크기 기준(globals.css)에서 빠져 원래 크기를 지킨다(사용자 요청) */
        className="ui-chrome fixed left-6 top-6 z-40 hidden items-center gap-2 desk:flex"
      >
        <Wordmark className="text-2xl text-ink" />
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
        /* 오른쪽 위 한 줄(알림 창 포함)은 원래 크기 그대로 — ui-chrome(globals.css) */
        className="ui-chrome fixed right-4 top-3 z-40 hidden items-center desk:flex"
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
          style={{ viewTransitionName: framed ? 'nav-pill' : 'shell-pill' }}
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
            격자·종·톱니·내 정보. 알약이 줄고 펴는 동안 제자리를 지키도록, 도크와
            오가는 연출에서는 따로 이름표를 단다(nav-tail).
          */}
          <div
            style={{ viewTransitionName: framed ? 'nav-tail' : 'none' }}
            className="flex items-center gap-0.5"
          >
            <MenuSquares
              buttonRef={gridRef}
              lit={at !== 'bar'}
              expanded={open}
              onOpen={openSheet}
              onPointerEnter={enterZone}
            />

            {/*
              알림(종) — 메뉴의 식구가 아니라 설정 왼쪽에 조금 작게 따로 선다.
              이름표를 따로 달지 않는다. 막대 조각(nav-tail)에 실려 제자리를 지키고,
              판이 열릴 때는 막대와 같이 어두워진다(globals.css 의 연출 설명).
            */}
            <div ref={bellPcBox} className="relative mx-0.5">
              <NoticeBellButton
                state={notice}
                open={bellOpen}
                onToggle={() => toggleBell(false)}
                buttonRef={bellPcRef}
                panelId={panelPcId}
              />
              {bellOpen &&
                !bellSheet &&
                noticePanel(
                  panelPcId,
                  'absolute right-0 top-full mt-3 w-72 max-h-[calc(100dvh-5rem)] overflow-x-hidden overflow-y-auto overscroll-contain'
                )}
            </div>

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
              title={`${nickname} · 내 정보`}
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
          /* 팝업이 될 때는 팝업과 같은 이름표 — 상자가 그 자리에서 팝업으로 자란다(globals.css '팝업') */
          name={
            choreo === 'dock-sheet'
              ? 'nav-sheet'
              : choreo == null
                ? 'shell-dock'
                : 'nav-dock'
          }
          icons={dockIcons}
          quickHrefs={quickHrefs}
          flyIndex={flyIndex}
          thumbName={thumbName}
          built={dockBuilt}
        />
      )}

      <MobileTopBar
        headerRef={bellPhoneBox}
        bell={
          <NoticeBellButton
            state={notice}
            open={bellOpen}
            onToggle={() => toggleBell(true)}
            buttonRef={bellPhoneRef}
            panelId={panelPhoneId}
            touch
          />
        }
        /* 휴대폰 알림은 위 막대 밑이 아니라 아래 시트로 뜬다(밑의 Modal) */
        panel={null}
      />

      {/*
        휴대폰 알림 — 아래 시트(아이폰 앱의 '오늘' 시트처럼). 내용은 PC 작은 창과 같은 NoticePanel 을 시트 모양으로.
        늘 그려 둔다 — 닫히는 움직임 동안 빈 시트가 내려가지 않게.
      */}
      <Modal
        open={bellOpen && bellSheet}
        onClose={() => setBellOpen(false)}
        title="오늘 할 일"
      >
        {noticePanel(panelPhoneId, '', 'sheet')}
      </Modal>

      {/*
        오늘 체크인 — 알림(종)에서 연다. 홈의 체크인 상자가 하던 일을 여기서 한다:
        안 했으면 하고, 했으면 고친다(잘못 누른 '통증' 하나가 오늘 운동을 막는다).
        창이 열릴 때만 폼을 그린다 — 열 때마다 오늘 것을 새로 채운다.
      */}
      <Modal
        open={checkinOpen}
        onClose={() => setCheckinOpen(false)}
        title="오늘 체크인"
        origin={popFrom}
        bigClose
      >
        {checkinOpen && (
          <CheckinFlow
            variant="popup"
            ctx={todo.flow}
            onDone={() => setCheckinOpen(false)}
            onSkip={() => setCheckinOpen(false)}
          />
        )}
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => closeToMenu(setSettingsOpen)}
        title="설정"
        origin={popFrom}
        look="folder"
      >
        <SettingsPanel data={settings} returnTo={here} />
      </Modal>

      <Modal
        open={profileOpen}
        onClose={() => closeToMenu(setProfileOpen)}
        title="내 정보"
        origin={popFrom}
        look="folder"
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
        onProfile={(el) => {
          backToMenu.current = true;
          openFrom(el, setProfileOpen);
        }}
        onSettings={(el) => {
          backToMenu.current = true;
          openFrom(el, setSettingsOpen);
        }}
        anchor={anchor ?? DOCK_FALLBACK}
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
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-75 ${
        lit ? 'bg-sky/15 text-sky' : 'text-muted hover:bg-ink/6 hover:text-ink'
      }`}
    >
      <Squares size="lg" spinning={spinning} onDone={() => setSpinning(false)} />
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
function Squares({
  spinning,
  onDone,
  size = 'md',
}: {
  spinning: boolean;
  onDone: () => void;
  /** lg — PC 막대의 메뉴 단추(1.4rem, 옆 아이콘보다 조금 크게). md — 휴대폰 하단 탭 */
  size?: 'md' | 'lg';
}) {
  /* 왼위 → 오른위 → 왼아래 → 오른아래. 글 읽는 차례와 같게 돈다. */
  const corners = [
    'left-0 top-0',
    'right-0 top-0',
    'left-0 bottom-0',
    'right-0 bottom-0',
  ];

  return (
    <span
      aria-hidden
      className={`relative block ${size === 'lg' ? 'h-[1.4rem] w-[1.4rem]' : 'h-[1.15rem] w-[1.15rem]'}`}
    >
      {corners.map((at, i) => (
        <span
          key={at}
          className={`absolute rounded-[2px] border-current ${
            size === 'lg'
              ? 'h-[0.56rem] w-[0.56rem] border-[2.1px]'
              : 'h-[0.45rem] w-[0.45rem] border-[1.9px]'
          } ${at} ${spinning ? 'motion-safe:animate-square-spin' : ''}`}
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
function NavGlyph({
  Icon,
  locked = false,
  dim = locked,
  className,
  style,
}: {
  Icon: (typeof NAV_ICONS)[keyof typeof NAV_ICONS];
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
      <Icon aria-hidden className={className} />
      {locked && <Lock aria-hidden className="absolute -bottom-1 -right-1 h-3 w-3" />}
    </span>
  );
}

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
      className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 -translate-y-0.5 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-caption font-medium leading-none text-page opacity-0 shadow-md transition-[opacity,translate] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
    >
      {children}
    </span>
  );
}

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
  const inFolder = (t: EventTarget | null) =>
    t instanceof Element && t.closest('[data-folder]') != null;
  const startDrag = (e: React.PointerEvent<HTMLDialogElement>) => {
    if (window.matchMedia(DESK_MEDIA).matches) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 붙들 수 없는 포인터 — 따라오기는 그대로 */
      }
    }
    d.dy = Math.max(0, dy);
    f.style.setProperty('transform', `translateY(${d.dy}px)`);
  };
  const endDrag = (e: React.PointerEvent<HTMLDialogElement>) => {
    const d = drag.current;
    const f = folder.current;
    if (!d || !f || e.pointerId !== d.id) return;
    drag.current = null;
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
                        ? 'mt-3 grid grid-cols-[repeat(3,minmax(0,5.25rem))] justify-center gap-x-4 gap-y-3 desk:mt-2 desk:block desk:space-y-0.5 desk:border-t desk:border-line/70 desk:pt-2'
                        : 'grid grid-cols-[repeat(3,minmax(0,5.25rem))] justify-center gap-x-4 gap-y-3 desk:block desk:space-y-0.5 desk:pt-0'
                    }
                  >
                    {group.title && (
                      <p className="col-span-3 -mb-1 px-1 text-[11px] font-semibold tracking-normal text-(--folder-fg)/60 desk:col-span-1 desk:mb-0 desk:px-3 desk:pb-1 desk:text-xs desk:text-ink/65">
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
                          /* 휴대폰 폴더에는 홈이 없다(2026-10-14 사용자 — 홈은 하단 탭에 있다). PC 팝업에는 그대로 */
                          className={`${item.href === '/today' ? 'hidden desk:flex' : 'flex'} min-w-0 flex-col items-center gap-1.5 rounded-2xl px-0.5 py-0.5 text-center text-(--folder-fg) transition-[colors,transform] duration-75 motion-safe:active:scale-95 desk:min-h-10 desk:flex-row desk:gap-3 desk:rounded-lg desk:px-3 desk:py-1.5 desk:text-left desk:text-ink desk:active:scale-100 ${
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
                            className={`min-w-0 max-w-full truncate text-[12px] leading-4 text-(--folder-fg)/92 desk:text-sm desk:leading-5 desk:text-inherit ${active ? 'font-semibold' : 'font-medium'} ${dim ? 'opacity-55' : ''}`}
                          >
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              {/* 설정 — 위 막대의 톱니가 폴더로 들어왔다(휴대폰만, 2026-10-14 사용자 "홈 우상단엔 알림만"). 창이라 링크가 아니라 단추 */}
              <div className="mt-3 grid grid-cols-[repeat(3,minmax(0,5.25rem))] justify-center gap-x-4 gap-y-3 desk:hidden">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  data-tile
                  onClick={(e) => {
                    onNavigate();
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
                  <span className="min-w-0 max-w-full truncate text-[12px] leading-4 font-medium text-(--folder-fg)/92">
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
                onNavigate();
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

/**
 * 모바일 상단 바 — 로고와, 알림(종)·설정·내 정보.
 *
 * 휴대폰 틀(desk 가 아닌 화면 — 손가락으로 쓰는 1024px 밑이거나, 576px 밑)에는
 * 오른쪽 위 아이콘 줄이 없다. 그렇다고 설정과 내 정보를 갈 곳
 * 없이 두면 안 되므로, PC 의 그 버튼들을 여기로 옮겨 놓는다. 누르면 같은
 * 창이 뜬다 — 기기가 달라도 하는 일과 보이는 것이 같아야 한다.
 */
function MobileTopBar({
  headerRef,
  bell,
  panel,
}: {
  /** 알림 창의 '바깥'을 가릴 때 쓴다 — 종과 창이 모두 이 막대 안에 있다 */
  headerRef: RefObject<HTMLElement | null>;
  /** 알림(종) 단추 */
  bell: React.ReactNode;
  /** 알림 창. 닫혀 있으면 null */
  panel: React.ReactNode;
}) {
  const router = useRouter();
  /*
   * 이 화면의 제목 · '‹ 뒤로' — 화면의 큰 제목(PageHeading → components/nav-title.tsx)과 '‹ 뒤로'(components/back-link.tsx)가
   * 적어 둔 것(lib/nav-state.ts). 큰 제목이 막대 밑으로 가려지면 가운데에 작은 제목이 나온다.
   */
  const bar = useSyncExternalStore(subscribeBar, barSnapshot, serverBarSnapshot);
  const back = bar.back;
  /* 홈은 앱 이름을 막대 왼쪽에 — 큰 제목 자리에 두면 날짜 위로 한 줄을 통째로 차지했다(2026-10-13 김민) */
  const pathname = usePathname();
  const home = pathname === '/today';
  /*
   * 기록 · 트레이닝 · 영양 탭 첫 화면은 막대를 안 그린다(같은 날 김민: "앱 이름 · 프로필 설정 줄은 홈에만") — 그 탭의 큰 제목이 맨 위.
   * 하위 화면('‹ 뒤로'가 있는 곳)은 그대로. 시계 자리 칠과 그만큼의 빈칸은 남긴다.
   */
  /*
   * 2026-10-15 판 넘기기(components/tab-pager.tsx): 막대는 네 탭 모두에 — 예전엔 투구 · 트레이닝 · 영양에서 막대를 안 그려(bare)
   * 탭마다 제목 높이가 달랐다(사용자 "각 탭의 메인 제목 높이가 안 맞는다"). 가운데는 홈이면 로고, 아니면 작은 제목.
   */
  /* 숨기기는 첫 화면들만 — '‹ 뒤로'가 있는 화면은 돌아갈 길을 늘 보인다. 알림 창이 열려 있으면 안 숨긴다 */
  const hidden = useBarHidden(!back && panel == null);

  return (
    <>
      {/*
        시계 · 배터리 자리를 막대 색으로 채운다 — 높이는 env(safe-area-inset-top)이라 아이폰 앱에서만
        생긴다(사파리 세로 화면은 0). 예전에는 이 자리가 비어 스크롤하면 그 틈으로 내용이 지나가
        막대만 떠 있어 보였다(2026-09-30 사용자 "매우 부자연스럽다").
        data-safe-area — 이 틀이 시계 · 홈 막대 여백을 스스로 비운다는 표시(globals.css '아이폰 앱 안').
      */}
      {/*
        2026-10-14 2판(사용자 "인스타 홈처럼") — 시계 자리는 반투명 유리(바탕색 75% + 뒤 흐림). 막대가 숨어 본문이 시계 밑으로
        지나갈 때 그 부분이 자연스럽게 비쳐 흐려진다. 막대도 같은 유리라 둘이 한 면으로 보인다.
      */}
      {/*
        2026-10-15 3판(사용자: 예시 둘 — Claude · 인스타 앱 — "중간에 선이 그어져 있고 퀄리티가 떨어진다, 선 없애고 저렇게") —
        시계 자리와 막대 밑에 딱 끊기는 선(92% 판의 끝 · 막대의 밑줄)이 생겼었다. 이제 막(top-veil) 한 장이 시계 자리 + 막대(보일 때)를
        덮고, 그 밑 1.5rem 동안 흐림과 바탕색이 함께 옅어진다 — 본문이 위로 지나가며 흐려지고 선이 없다(globals.css 'top-veil').
        막대가 숨으면 막이 시계 자리까지 줄어든다. 막대 · 단추는 막 위(z-40)에 그대로 또렷하다.
        data-safe-area 는 높이를 재는 표시로만 남긴다(당겨서 새로고침 돌개 자리 · globals.css '아이폰 앱 안').
      */}
      <div
        aria-hidden
        data-top-veil
        data-short={hidden ? '' : undefined}
        className="pointer-events-none fixed inset-x-0 top-0 z-39 desk:hidden pad:left-(--rail)"
      >
        {/* 흐림 세 겹 — 위로 갈수록 겹이 늘어 점점 흐려진다(globals.css 'top-veil' — 한 선을 넘는 순간 확 흐려지지 않게) */}
        <i />
        <i />
        <i />
      </div>
      <div
        data-safe-area
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[env(safe-area-inset-top)] desk:hidden pad:left-(--rail)"
      />
      {/* 막대는 화면에 붙어(fixed) 있으니 그만큼 비운다 — 시계 자리 + 막대. 판 넘기기(tabs)에서는 판이 스스로 비워 이건 숨는다 */}
      <div
        aria-hidden
        data-bar-spacer
        className="h-[calc(env(safe-area-inset-top)+3.5rem)] shrink-0 desk:hidden"
      />
      {
        <header
          /*
           * 아이폰 앱의 내비게이션 막대(2026-10-04 '앱 틀을 네이티브처럼') — 왼쪽 '‹ 뒤로', 가운데 화면 제목(큰 제목이 가려졌을
           * 때만), 오른쪽 종 · 설정 · 내 정보. 늘 그 자리에 있다.
           *
           * 예전에는 왼쪽에 로고가 있는 웹사이트 머리였고, 스크롤을 내리면 막대가 통째로 위로 숨었다 — 화면 중간에서는 지금
           * 어느 화면인지, 어디로 돌아가는지가 보이지 않았다(점검: "가장 웹사이트 같은 곳"). 로고는 뺐다 — 홈은 아래 탭에 있다.
           *
           * 본문이 바뀌는 동안 막대는 움직이지 않는다(이름표 shell-topbar). 뒤 흐림(backdrop-blur)은 뺐다 — 바탕이 거의
           * 불투명이라 흐림은 안 보이는데, 아이폰 사파리는 그 위로 무언가 움직일 때마다 흐림을 다시 계산하다 깜빡인다.
           *
           * 양옆 여백은 노치 자리와 견줘 큰 쪽 — 가로로 돌린 사파리에서 단추가 노치 밑에 들어갔다(2026-10-03).
           */
          ref={headerRef}
          data-mobile-topbar
          data-hidden={hidden ? '' : undefined}
          style={{ viewTransitionName: 'shell-topbar' }}
          /*
           * 2026-10-14 2판 — 화면에 붙은(fixed) 반투명 유리 막대. 아래로 굴리면 위로 미끄러져 숨고(globals.css 의
           * [data-mobile-topbar][data-hidden]) 위로 굴리면 돌아온다 — 본문이 화면 전체를 쓴다.
           * (2026-10-15) 뒤 흐림은 다시 뺐다 — 바탕이 85~92% 라 흐림은 거의 안 보이는데 굴릴 때 장면마다 다시 셈했다(시계 자리도 같이).
           * 아이패드는 왼쪽 탭 막대(--rail)만큼 비킨다 — 막대 밑에 깔려 '‹ 뒤로'를 누르면 홈 탭이 눌렸다.
           */
          /* 바탕 · 밑줄 없이 — 뒤의 막(top-veil)이 흐림과 옅어짐을 맡는다(2026-10-15 3판) */
          className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-40 flex h-14 items-center gap-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pad:left-(--rail) desk:hidden"
        >
          <div className="flex min-w-0 flex-1 items-center">
            {back && (
              <button
                type="button"
                onClick={() => goBack(router, back.href)}
                className="inline-flex min-h-11 max-w-[34vw] items-center gap-0.5 text-base text-sky transition-opacity active:opacity-60"
              >
                <ChevronLeft aria-hidden className="h-6 w-6 shrink-0" />
                <span className="truncate">{back.label || '뒤로'}</span>
              </button>
            )}
          </div>

          {/* 홈은 로고가 가운데(2026-10-14 사용자 "인스타처럼 로고를 가운데로"). 그 밖은 큰 제목이 막대 밑으로 가려졌을 때만 작은 제목 */}
          {!back && home ? (
            <Wordmark className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-ink" />
          ) : (
            <p
              aria-hidden
              className={`pointer-events-none absolute top-1/2 left-1/2 max-w-[44%] -translate-x-1/2 -translate-y-1/2 truncate text-base font-semibold text-ink transition-opacity duration-200 ${
                bar.title && bar.collapsed ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {bar.title}
            </p>
          )}

          {/* 오른쪽은 종만 — 설정 · 내 정보는 더보기 폴더 안으로 갔다(2026-10-14 사용자 "앱 홈 우상단에는 알림 아이콘만") */}
          <div className="flex shrink-0 items-center gap-2">
            {bell}
            {/* 창은 종 바로 뒤에 둔다 — 키보드로 종을 열면 Tab 한 번에 창 안으로 들어간다. 자리는 막대에 붙여 잡는다(absolute). */}
            {panel}
          </div>
        </header>
      }
    </>
  );
}

/**
 * 위 막대 숨기기 — 아래로 굴리면 막대가 위로 미끄러져 사라지고(본문이 시계 자리까지 올라간다), 위로 굴리면 다시 내려온다
 * (2026-10-14 사용자 "인스타 홈처럼"). 맨 위 근처(8px)에서는 늘 보인다. 작은 떨림(4px 안)은 무시. 알림 창이 열려 있으면 안 숨긴다
 * (창이 막대 안에 있다). enabled 가 아니면(‹ 뒤로 가 있는 하위 화면) 늘 보인다.
 */
function useBarHidden(enabled: boolean) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    /* 창이 아니라 판이 굴러갈 수도 있다(판 넘기기, lib/scroller.ts) — 어느 쪽이든 같은 길 */
    let last = scrollTopNow();
    const read = () => {
      frame = 0;
      const y = scrollTopNow();
      const dy = y - last;
      last = y;
      if (y < 8) setHidden(false);
      else if (dy > 4 && y > 64) setHidden(true);
      else if (dy < -4) setHidden(false);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const off = onAnyScroll(onScroll);
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  }, [enabled]);
  /* 꺼지면 값과 상관없이 보인다 — 다시 켜질 때 지난 값이 남지 않게 effect 가 아니라 여기서 */
  return enabled && hidden;
}

/**
 * 하단 탭의 얼굴 — 아이콘 위, 이름 아래.
 *
 * 누르면 렌즈(유리 캡슐, components/tab-lens.ts)가 곧바로 이 칸으로 미끄러져 와 누른 곳이 먼저 대답한다. 이름도 그 순간
 * 굵어진다 — 렌즈가 설 칸(selected)을 따르고 화면(주소)을 기다리지 않는다. 예전에는 링크의 pending(useLinkStatus)을 봤는데,
 * 탭을 누르면 본문을 밀며 링크 대신 직접 push 해서(tab-pager.tsx slideToTab) pending 이 안 켜져 이름이 0.3초 뒤에야 굵어졌다
 * (2026-10-15 사용자 "선택되고 0.3초 뒤에 아이콘이 좀 움직여"). 2026-10-14 사용자가 고른 참고 영상(iOS 26 탭 막대)은 색 없이
 * 흰 아이콘 · 흰 글자에 캡슐만 움직인다.
 * pt-[2px] — 이름 글자의 아래 여백(줄 높이) 때문에 아이콘 + 이름이 렌즈 가운데보다 0.7px 위에 보였다. 화면은 1px 단위로
 * 그려져 1.5px 는 효과가 없었다 — 픽셀로 재 보니 2px 에서 위아래 차가 0.3px 안(패드는 0).
 */
function TabFace({
  Icon,
  selected,
  label,
  locked = false,
}: {
  Icon: (typeof NAV_ICONS)[keyof typeof NAV_ICONS];
  /** 렌즈가 선 칸 — 누른 순간부터(화면이 오기 전에도) */
  selected: boolean;
  label: string;
  /** 잠긴 탭 — 아이콘 귀퉁이에 자물쇠. 흐림은 탭(링크)이 통째로 맡는다(이 탭은 날아가는 연출이 없다) */
  locked?: boolean;
}) {
  return (
    <span
      data-tab-face
      className={`relative flex flex-col items-center gap-0.5 pt-[2px] ${
        selected ? 'font-semibold' : ''
      }`}
    >
      <NavGlyph Icon={Icon} locked={locked} dim={false} className="h-[26px] w-[26px]" />
      {label}
    </span>
  );
}

/** 누른 탭으로 옮긴 렌즈가 화면이 끝내 안 바뀌면(신호 끊김 · 막힘) 이만큼 뒤 지금 화면의 탭으로 돌아간다 */
const CHOSEN_TIMEOUT_MS = 8000;

/**
 * 모바일 하단 탭바 — 바닥에서 살짝 떠 있는 둥근 알약.
 *
 * 2026-10-01 사용자 "애플 앱스토어의 하단 바처럼 전체적으로 동글동글하게" — 양옆 20px · 밑으로 --tab-bar-gap(globals.css)
 * 떨어져 뜬 알약. 칸 높이 52px, 아이콘 26px, 이름 10px, 알약 62px. 알약 윗변까지의 높이(--tab-bar-top)를 본문 끝 여백과
 * 그 위에 띄우는 것들이 같이 쓴다.
 *
 * 2026-10-14 사용자가 참고 영상(iOS 26 탭 막대)을 주며 "그와 최대한 같게": 휴대폰은 어두운 유리 알약(반투명 짙은 회색 +
 * 뒤 흐림 + 얇은 흰 테두리)에 흰 아이콘 · 흰 이름, 지금 탭 뒤에는 회색 캡슐 하나(렌즈)가 있고 탭을 옮기면 그 캡슐이
 * 유리 렌즈로 부풀며 탄성 있게 미끄러진다(components/tab-lens.ts). 예전에는 탭마다 배경을 두고 화면 전환
 * (view-transition 'tab-indicator')이 옮겼다 — 누른 뒤 서버가 답할 때까지 안 움직였고 탄성도 없었다.
 * 패드의 왼쪽 세로 막대는 밝은 모양 그대로 두고(요청은 하단 바) 렌즈 움직임만 같다.
 */
function MobileTabs({
  tabs,
  menuOpen,
  onMenu,
}: {
  tabs: NavItem[];
  /** 사이드바가 열려 있는가 — 렌즈를 '더보기'에 둔다 */
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const isActive = useIsActive();
  const pathname = usePathname();
  const [spinning, setSpinning] = useState(false);
  const router = useRouter();
  const bar = useRef<HTMLDivElement>(null);
  const lensEl = useRef<HTMLSpanElement>(null);

  /*
   * 렌즈가 설 칸 — 사이드바가 열렸으면 '더보기', 방금 누른 탭이 있으면 그 탭(화면이 오기 전에 먼저 옮긴다), 아니면 지금
   * 화면의 탭. 주소가 바뀌면 누른 탭 기억을 지운다 — 그때부터는 지금 화면이 정한다(뒤로 가기 · 잠긴 탭이 설정 화면으로
   * 보낸 경우도 지금 화면과 맞는다). 화면이 끝내 안 오면 CHOSEN_TIMEOUT_MS 뒤 지금 화면의 탭으로 돌아간다.
   */
  const activeHref =
    tabs.find((t) => t.href !== MORE_HREF && isActive(t.href))?.href ?? null;
  const [chosen, setChosen] = useState<{ href: string; from: string } | null>(null);
  const liveChosen = chosen && chosen.from === pathname ? chosen.href : null;
  const selectedHref = menuOpen ? MORE_HREF : (liveChosen ?? activeHref);
  const selectedIndex = selectedHref
    ? tabs.findIndex((t) => t.href === selectedHref)
    : -1;
  /*
   * 탭을 옮기면 본문이 그 방향으로 밀린다 — 오른쪽 탭이면 새 화면이 오른쪽에서, 왼쪽 탭이면 왼쪽에서(쓸기와 같은 몸짓,
   * globals.css 'swipe-next · swipe-prev'). 2026-10-15 사용자 "전환 애니메이션이 필요 — 너무 딱딱해": 예전엔 0.1초 옅어지기뿐이었다.
   * 지금 탭을 모르면(하위 화면이 아닌 다른 곳) 예전처럼 옅어지기.
   */
  const activeIndex = activeHref ? tabs.findIndex((t) => t.href === activeHref) : -1;
  /* 판 넘기기(components/tab-pager.tsx)가 못 받는 곳(하위 화면)에서 탭을 누르면 — 옆으로 나란한 곳이라 옅어지며 바뀐다 */
  const slideTo = (i: number): NavDirection | undefined =>
    activeIndex < 0 || i === activeIndex ? undefined : 'fade';
  useEffect(() => {
    if (!chosen) return;
    const timer = window.setTimeout(() => setChosen(null), CHOSEN_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [chosen]);
  /* 본문 쓸기(components/tab-pager.tsx)로 탭을 옮길 때도 누른 탭처럼 — 렌즈가 곧바로 그 칸으로 */
  useEffect(() => {
    const onChosen = (e: Event) => {
      const href = (e as CustomEvent<unknown>).detail;
      if (typeof href === 'string') setChosen({ href, from: pathname });
    };
    window.addEventListener(TAB_CHOSEN_EVENT, onChosen);
    return () => window.removeEventListener(TAB_CHOSEN_EVENT, onChosen);
  }, [pathname]);

  /* 첫 그림의 렌즈 자리 — 서버가 그린 HTML 에 그대로 실린다(이후로는 tab-lens.ts 가 CSS 변수를 직접 쓴다) */
  const [firstIndex] = useState(selectedIndex);
  const lens = useTabLens(bar, lensEl, firstIndex);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) lens.to(selectedIndex);
  }, [lens, selectedIndex]);

  /*
   * 길게 눌러 끌기(2026-10-13 사용자: "메뉴 바도 길게 눌러서 스와이프하면 동그란 원이 터치된 부분을 따라서 움직이게").
   * 알약 안에서 손가락을 떼지 않고 0.28초 넘게 누르면 렌즈가 부푼 채 손가락을 따라오고, 놓은 자리의 탭으로 간다.
   * 짧게 누르면 예전처럼 그 칸으로.
   */
  const hold = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  const dragged = useRef(false);
  const under = useRef<string | null>(null);
  /** 칸 가운데들 — 끌기를 시작할 때 한 번 잰다(손가락 자리 → 칸 번호) */
  const centers = useRef<{ href: string; c: number }[]>([]);
  const vertical = () => {
    const el = bar.current;
    return !!el && el.clientHeight > el.clientWidth;
  };
  const measure = () => {
    const el = bar.current;
    if (!el) return;
    const v = vertical();
    centers.current = Array.from(
      el.querySelectorAll<HTMLElement>('[data-tab-href]')
    ).map((node) => {
      const r = node.getBoundingClientRect();
      return {
        href: node.dataset.tabHref ?? '',
        c: v ? r.top + r.height / 2 : r.left + r.width / 2,
      };
    });
  };
  /** 손가락 자리 → 칸 번호(소수, 첫 칸 0 ~ 끝 칸) */
  const indexAt = (x: number, y: number) => {
    const cs = centers.current;
    if (cs.length < 2) return 0;
    const at = vertical() ? y : x;
    const p = (at - cs[0].c) / ((cs[cs.length - 1].c - cs[0].c) / (cs.length - 1));
    return Math.max(0, Math.min(cs.length - 1, p));
  };
  const startHold = (e: ReactPointerEvent<HTMLDivElement>) => {
    lens.press(true);
    if (e.pointerType === 'mouse') return;
    stopHold();
    const { pointerId: id, clientX: x, clientY: y } = e;
    const target = e.currentTarget;
    const timer = window.setTimeout(() => {
      measure();
      if (centers.current.length === 0) return;
      dragged.current = true;
      dragging.current = true;
      try {
        target.setPointerCapture(id);
      } catch {
        /* 이미 뗀 포인터면 붙들 수 없다 — 그래도 끌기는 시작한다 */
      }
      haptic('medium');
      const p = indexAt(x, y);
      under.current = centers.current[Math.round(p)]?.href ?? null;
      lens.follow(p);
    }, 280);
    hold.current = { id, x, y, timer };
  };
  const stopHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  };
  const moveHold = (e: ReactPointerEvent<HTMLDivElement>) => {
    const h = hold.current;
    if (!h || h.id !== e.pointerId) return;
    if (!dragged.current) {
      /* 길게 누르기 전에 8px 넘게 움직였으면 끌기가 아니라 화면 굴리기 · 짧은 누름이다 */
      if (Math.abs(e.clientX - h.x) > 8 || Math.abs(e.clientY - h.y) > 8) {
        stopHold();
        lens.press(false);
      }
      return;
    }
    const p = indexAt(e.clientX, e.clientY);
    const href = centers.current[Math.round(p)]?.href ?? null;
    if (href && href !== under.current) haptic('selection');
    under.current = href;
    lens.follow(p);
  };
  const endHold = (e: ReactPointerEvent<HTMLDivElement>) => {
    lens.press(false);
    const h = hold.current;
    if (!h || h.id !== e.pointerId) return;
    stopHold();
    if (!dragged.current) return;
    const cancelled = e.type === 'pointercancel';
    const href = cancelled
      ? null
      : centers.current[Math.round(indexAt(e.clientX, e.clientY))]?.href;
    dragging.current = false;
    /* click 이 뒤따라 오면 막는다(아래 onClickCapture) — 다음 그림에서 푼다 */
    window.setTimeout(() => {
      dragged.current = false;
    }, 0);
    const tab = href ? tabs.find((t) => t.href === href) : undefined;
    if (!tab) {
      lens.release(selectedIndex);
      return;
    }
    if (tab.href === MORE_HREF) {
      lens.release(tabs.indexOf(tab));
      setSpinning(true);
      onMenu();
      return;
    }
    if (isActive(tab.href)) {
      lens.release(selectedIndex);
      return;
    }
    lens.release(tabs.indexOf(tab));
    setChosen({ href: tab.href, from: pathname });
    haptic('light');
    if (slideToTab(tab.href)) return;
    const dir = slideTo(tabs.indexOf(tab));
    if (dir) setNavDirection(dir);
    router.push(tab.href);
  };

  return (
    <nav
      /* 본문이 바뀌는 동안 탭바는 움직이지 않는다. */
      style={{ viewTransitionName: 'shell-tabbar' }}
      data-mobile-tabs
      /*
       * 패드(아이패드 · 큰 태블릿 — globals.css 의 pad)에서는 같은 탭이 왼쪽 세로 막대가 된다(2026-10-12 사용자 "아이패드
       * 전용 인터페이스"). 넓은 화면 바닥 한가운데의 알약은 엄지가 멀고, 아이패드 앱은 탭을 왼쪽 막대에 둔다. 폭(--rail)은
       * 본문 · 위 막대가 같이 비킨다(app/(app)/layout.tsx). 칸은 64px — 손가락으로 넉넉하다.
       */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-(--tab-bar-gap) pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] desk:hidden pad:top-0 pad:right-auto pad:w-(--rail) pad:p-0"
    >
      {/*
        알약만 누를 수 있다 — 양옆 빈 곳을 누르면 밑의 본문으로 간다. 양옆 여백(nav)은 노치 자리와 견줘 큰 쪽 — 가로로 돌린
        사파리에서 알약 끝이 노치 밑에 들어갔다(2026-10-03).
        휴대폰은 어두운 유리(2026-10-14 참고 영상) — 짙은 회색 72% + 뒤 흐림 · 채도, 얇은 흰 테두리, 위 1px 빛, 밑 그림자.
        글자 · 아이콘은 흰색(currentColor). 패드 막대는 예전의 밝은 유리 그대로.
      */}
      <div
        ref={bar}
        data-tabbar
        onPointerDown={startHold}
        onPointerMove={moveHold}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onPointerLeave={() => {
          if (!dragged.current) lens.press(false);
        }}
        onClickCapture={(e) => {
          if (dragged.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onContextMenu={(e) => {
          /* 길게 누르면 iOS 가 링크 미리보기 · 복사 메뉴를 띄운다 — 끌기와 겹치니 막는다 */
          if (hold.current || dragging.current) e.preventDefault();
        }}
        style={{ '--tab-count': tabs.length } as CSSProperties}
        data-tab-bar
        /* 가로 알약의 유리(바탕 · 테두리 · 빛 · 그림자)는 globals.css '하단 탭의 유리 알약' — 가만히 있을 때도 유리로 보이게 */
        className="pointer-events-auto relative mx-auto flex max-w-md touch-none rounded-full p-1 text-(--tab-fg) pad:h-full pad:max-w-none pad:flex-col pad:gap-1 pad:rounded-none pad:pt-[calc(env(safe-area-inset-top)+0.75rem)] pad:pr-2 pad:pl-[calc(env(safe-area-inset-left)+0.5rem)] pad:text-ink"
      >
        {/*
          렌즈 — 지금 탭 뒤의 캡슐 하나(components/tab-lens.ts 가 옮긴다, 모양은 globals.css '하단 탭의 유리 렌즈').
          --p 는 칸 번호 — 칸 폭이 같아 CSS 만으로 자리를 셈하므로 서버가 그린 첫 그림부터 맞는 자리에 있다.
          장식이라 읽어 주지 않는다(지금 탭은 글자 굵기 · aria-current 가 알린다).
        */}
        <span
          ref={lensEl}
          aria-hidden
          data-tab-lens
          style={
            {
              '--p': Math.max(0, firstIndex),
              '--show': firstIndex >= 0 ? 1 : 0,
            } as CSSProperties
          }
        >
          <span data-lens-fill />
          <span data-lens-glass />
          <span data-lens-rim />
        </span>
        {tabs.map((tab) => {
          /*
           * '더보기'는 화면으로 넘어가지 않고 옆에서 사이드바를 연다.
           *
           * 예전에는 /more 라는 화면 하나로 넘어갔다. 그러면 넓은 화면에서는
           * 옆에서 미끄러져 나오던 같은 메뉴가 좁은 화면에서만 화면 전환이 되어,
           * 창 폭 하나로 메뉴가 전혀 다르게 열렸다. 이제 폭과 상관없이 같은
           * 사이드바가 같은 몸짓(네모가 돌며 오른쪽에서 밀려 들어옴)으로 열린다.
           * 열려 있는 동안 렌즈가 이 칸에 선다.
           */
          if (tab.href === MORE_HREF) {
            return (
              <button
                key={tab.href}
                type="button"
                data-tab-href={tab.href}
                onClick={() => {
                  lens.to(tabs.indexOf(tab));
                  setSpinning(true);
                  onMenu();
                }}
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                className="relative z-10 flex h-[52px] flex-1 flex-col items-center justify-center rounded-full text-[10px] font-medium transition-transform duration-100 motion-safe:active:scale-[0.94] pad:h-16 pad:flex-none pad:rounded-2xl pad:text-xs"
              >
                <span
                  data-tab-face
                  className={`flex flex-col items-center gap-0.5 pt-[2px] ${menuOpen ? 'font-semibold' : ''}`}
                >
                  <span className="flex h-[26px] w-[26px] items-center justify-center">
                    <Squares
                      spinning={spinning}
                      onDone={() => setSpinning(false)}
                      size="lg"
                    />
                  </span>
                  {tab.short ?? tab.label}
                </span>
              </button>
            );
          }

          const active = isActive(tab.href);
          const Icon = NAV_ICONS[tab.icon];
          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-tab-href={tab.href}
              draggable={false}
              data-nav={slideTo(tabs.indexOf(tab))}
              aria-current={active ? 'page' : undefined}
              /* 잠긴 탭(첫 설정 전, lib/nav.ts applyLocks)은 흐리게 + 아이콘 오른쪽 아래 자물쇠. 링크는 산다 — 누르면 설정 화면 */
              aria-label={tab.locked ? `${tab.label}(설정 전)` : undefined}
              data-locked={tab.locked ? '' : undefined}
              /*
               * 누르면 렌즈가 곧바로 이 칸으로 간다(화면이 오기 전에). 지금 탭을 한 번 더 누르면 — 그 탭의 첫 화면이면
               * 맨 위로 올라가고, 하위 화면이면 첫 화면으로 간다(아이폰 탭 바처럼, 2026-10-04).
               */
              onClick={(e) => {
                if (!active || !sameScreen(currentUrl(), tab.href)) {
                  if (!active) {
                    /* 렌즈는 화면을 다시 그리기 전에 곧바로 — effect 를 기다리면 한두 장면 늦게 출발했다 */
                    lens.to(tabs.indexOf(tab));
                    setChosen({ href: tab.href, from: pathname });
                    /* 탭 첫 화면이면 쓸기처럼 누르는 순간 본문이 밀리기 시작한다(components/tab-pager.tsx slideToTab) — 링크는 안 따른다 */
                    if (slideToTab(tab.href)) e.preventDefault();
                  }
                  return;
                }
                e.preventDefault();
                const reduce = window.matchMedia(
                  '(prefers-reduced-motion: reduce)'
                ).matches;
                scrollToTop(!reduce);
              }}
              /*
               * 휴대폰에서 가장 많이 눌리는 자리다. 눌렀을 때 살짝 작아져 먼저 대답한다(렌즈도 부푼다).
               * 움직임을 줄여 쓰는 사람에게는 크기 변화가 없다.
               */
              className={`relative z-10 flex h-[52px] flex-1 flex-col items-center justify-center rounded-full text-[10px] font-medium transition-transform duration-100 motion-safe:active:scale-[0.94] pad:h-16 pad:flex-none pad:rounded-2xl pad:text-xs ${
                tab.locked ? 'opacity-55' : ''
              }`}
            >
              <TabFace
                Icon={Icon}
                selected={tab.href === selectedHref}
                label={tab.short ?? tab.label}
                locked={tab.locked}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
