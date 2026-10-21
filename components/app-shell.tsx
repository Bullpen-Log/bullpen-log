'use client';

import {
  Suspense,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { quietRefresh } from '@/lib/quiet-refresh';
import { forgetPage, rememberPage } from '@/lib/last-page';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import type { NavGroup, NavItem, SportKey } from '@/lib/nav';
import { DESK_MEDIA } from '@/lib/nav';
import { ChevronLeft } from '@/components/icon';
import { Wordmark } from '@/components/logo';
import { MorphLink } from '@/components/shell-morph';
import { Modal } from '@/components/modal';
import { ProfilePanel, type ProfileData } from '@/components/profile-panel';
import { SettingsPanel } from '@/components/settings-panel';
import { CLOSE_SETTINGS_EVENT } from '@/components/settings-info';
import { CheckinFlow } from '@/components/checkin-flow/flow';
import type { CheckinFlowContext } from '@/components/checkin-flow/types';
import {
  NoticeBellButton,
  NoticePanel,
  OPEN_CHECKIN_EVENT,
  type NoticeState,
} from '@/components/notice-bell';
import { useTodayKey } from '@/components/use-today-key';
import { isPlainClick } from '@/components/use-sliding-thumb';
import {
  useIsActive,
  DOCK_HOVER_MS,
  FlyKind,
  Anchor,
  flyStyle,
} from './app-shell/shared';
import { QuickBar, MenuSquares, DockGrid } from './app-shell/dock';
import { SettingsCog, Avatar } from './app-shell/glyphs';
import { DetailMenu } from './app-shell/detail-menu';
import { MobileTopBar } from './app-shell/mobile-top-bar';
import { SportAwareTabs } from './app-shell/sport-tabs';
import { ExpoTabBridge } from './app-shell/expo-tabs';

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

type TimerName = 'open' | 'close' | 'dwell';

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
  back = null,
  sportBars,
  nickname,
  avatarUrl,
  isAdmin,
  profile,
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
  /** 덕아웃으로 돌아가는 원형 뒤로가기(웹만, 2026-10-21) — 홈 아이콘 왼쪽. 앱은 null(탭의 '덕아웃'이 그 길) */
  back?: { href: string; label: string } | null;
  /** 종목 하단바 둘(잠금 입힘)과 그냥 /training 의 종목 — 투구 · 타격 화면이면 하단바가 이것으로 바뀐다(2026-10-20, sport-tabs.tsx) */
  sportBars: Record<SportKey, NavItem[]>;
  nickname: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** '내 정보' 창에서 고칠 값들 */
  profile: ProfileData;
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
   * 설정 · 내 정보를 PC 더보기 팝업에서 열었나 — 그 창을 닫으면 팝업으로 돌아간다(2026-10-15 사용자 "메뉴에 들어간 뒤 눌러 들어가니,
   * 나갈 때 원래 메뉴로"). 휴대폰은 폴더를 닫지 않고 그 위에 창을 띄우므로(DetailMenu) 돌아갈 일이 없다 — 닫았다 다시 띄우면 폴더가
   * 새로 부풀어 떠 부자연스러웠다(같은 날 김민).
   */
  const backToMenu = useRef(false);
  const closeToMenu = (show: (on: boolean) => void) => {
    show(false);
    if (!backToMenu.current) return;
    backToMenu.current = false;
    /*
     * 창이 내려가기 시작한 뒤 폴더가 부풀어 뜬다. 그 사이에 다른 것을 눌렀으면(링크 등) 띄우지 않는다 — 새 화면에서 메뉴가
     * 불쑥 열렸다(2026-10-16).
     */
    let touched = false;
    const mark = () => {
      touched = true;
    };
    window.addEventListener('pointerdown', mark, { capture: true, once: true });
    window.setTimeout(() => {
      window.removeEventListener('pointerdown', mark, { capture: true });
      if (!touched) go('sheet');
    }, 120);
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
        {/* 덕아웃으로 돌아가는 원(2026-10-21) — 알약과 같은 유리, 알약 왼쪽에 따로 선다. 누르면 변형하며 덕아웃으로(components/shell-morph.tsx) */}
        {back && (
          <MorphLink
            href={back.href}
            dir="to-dugout"
            aria-label={`${back.label}으로`}
            title={back.label}
            className="relative z-10 mr-2 grid h-11 w-11 place-items-center rounded-full border border-line/70 bg-surface/75 text-ink shadow-sm backdrop-blur-md transition-transform hover:scale-105 motion-safe:active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </MorphLink>
        )}
        <span
          aria-hidden
          style={{ viewTransitionName: framed ? 'nav-pill' : 'shell-pill' }}
          className={`absolute inset-0 rounded-full border border-line/70 bg-surface/75 shadow-sm backdrop-blur-md ${back ? 'left-[3.25rem]' : ''}`}
        />
        <div
          style={{ viewTransitionName: choreo ? 'none' : 'shell-topnav' }}
          data-morph-chrome
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
        <SettingsPanel />
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

      <SportAwareTabs
        tabs={tabs}
        back={back}
        sportBars={sportBars}
        menuOpen={open}
        onMenu={() => go('sheet')}
      />
      <Suspense fallback={null}>
        <ExpoTabBridge
          tabs={tabs}
          sportBars={sportBars}
          onMenu={() => go('sheet')}
          groups={groups}
          nickname={nickname}
          avatarUrl={avatarUrl}
          isAdmin={isAdmin}
          settingsOpen={settingsOpen || profileOpen}
          onSettings={() => setSettingsOpen(true)}
          onProfile={() => setProfileOpen(true)}
        />
      </Suspense>

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
          /* 휴대폰은 폴더를 닫지 않고 그 위에 창을 띄운다(아래) — 닫으면 폴더가 그대로 있다. PC 는 팝업을 거두고 닫을 때 다시 연다 */
          backToMenu.current = window.matchMedia(DESK_MEDIA).matches;
          openFrom(el, setProfileOpen);
        }}
        onSettings={(el) => {
          backToMenu.current = window.matchMedia(DESK_MEDIA).matches;
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
