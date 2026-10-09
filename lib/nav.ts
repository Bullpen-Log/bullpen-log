/**
 * 앱 내비게이션 구성.
 *
 * PC는 오른쪽 위 막대와 옆에서 나오는 사이드바로, 모바일은 아래 탭 5개로
 * 같은 목록을 나눠 보여준다. 모바일의 "더보기"도 PC 와 같은 사이드바를 연다.
 * 한 곳에서 정의해 두 화면이 어긋나지 않게 한다.
 */

import { TRAINING_HOME_HREF } from '@/lib/training-part';
import {
  FEATURE_HOME,
  SETUP_PATH,
  type FeatureKey,
  type FeatureLocks,
} from '@/lib/feature-locks';

/** 쓸 수 있는 아이콘 이름. 그림은 components/nav-icons.tsx 에 있다. */
export type NavIconName =
  | 'home'
  /* 투구 기록 — 야구공(components/baseball-icon.tsx) */
  | 'baseball'
  | 'dumbbell'
  | 'film'
  /* 영양 — 숟가락·포크. 끼니를 적는 곳이라는 것이 한눈에 보인다 */
  | 'utensils'
  | 'target'
  | 'book'
  | 'settings'
  /* 관리자 — 설정(톱니)과 헷갈리지 않게 방패를 쓴다 */
  | 'shield'
  /* 구속 측정 관리자 — 계기판 */
  | 'gauge'
  /* 트레이닝 영상 촬영 관리자 — 슬레이트(촬영 시작 판) */
  | 'clapper'
  /* 구속 측정 — 스피드건(레이더 건)처럼 곧장 잰다. 계기판(관리자)과 가르려고 다른 그림 */
  | 'radar'
  | 'menu';

export type NavItem = {
  href: string;
  label: string;
  /**
   * 아이콘 이름.
   *
   * 예전에는 이모지 문자를 썼다. 캐주얼하게 보이려던 것인데, 이모지는 기기마다
   * 다른 그림이 나오고 저마다 알록달록해서 앱의 색과 따로 논다. 무엇보다
   * '임시로 넣어둔 것'처럼 보였다. 굵기와 색을 앱이 정할 수 있는 선 아이콘을 쓴다.
   *
   * 그림이 아니라 이름만 둔다. 이 파일은 서버에서도 읽는데, 리액트 컴포넌트는
   * 서버에서 화면 쪽으로 건네줄 수 없다 — 실제로 넘겼더니 화면이 통째로 죽었다.
   * 이름을 그림으로 바꾸는 일은 components/nav-icons.tsx 가 한다.
   */
  icon: NavIconName;
  /**
   * 휴대폰 아래 탭에서 쓸 짧은 이름. 없으면 label 을 그대로 쓴다.
   *
   * 탭 칸이 좁아 긴 이름은 줄바꿈되거나 잘린다. 좁은 곳에서는 뜻이 갈리는
   * 쪽만 남기고('투구 영상' → '영상'), 사이드바처럼 자리가 넉넉한 곳은 전체
   * 이름을 그대로 쓴다.
   */
  short?: string;
  /**
   * 아이콘 배경색. 목록에서 항목을 눈으로 가르는 데 쓴다.
   *
   * 라이브러리 카테고리와 같은 색 토큰(--color-cat-*)을 그대로 쓴다.
   * 같은 앱 안에서 색 체계를 두 벌 만들 이유가 없다.
   */
  tone?: 'lower' | 'upper' | 'mobility' | 'power' | 'core' | 'armcare' | 'recovery';
  /** 관리자에게만 보이는 항목 */
  adminOnly?: boolean;
  /**
   * 앱(스마트폰 껍데기)에서는 누구나, 웹에서는 관리자만 보이는 항목 — 폰의 고속 촬영이 있어야
   * 하는 구속 측정. 여는 쪽의 규칙(app/(session)/velocity/access.ts)과 같다.
   */
  appOrAdmin?: boolean;
  /**
   * 어느 기능에 속하나 — 처음 가입한 사람에게 잠긴 탭(lib/feature-locks.ts, 2026-10-09). 잠겨 있으면
   * 아래 applyLocks 가 주소를 그 기능의 첫 설정 화면으로 바꾸고 locked 를 단다. 없으면 늘 열린 항목.
   */
  lock?: FeatureKey;
  /**
   * 잠겨 있다 — applyLocks 만 단다. 셸(components/app-shell.tsx)이 보고 흐리게 + 자물쇠로 그린다.
   * 링크는 산다(누르면 첫 설정 화면으로 간다) — 그래서 aria-disabled 가 아니라 이 표시다.
   */
  locked?: boolean;
};

export type NavGroup = {
  /** 그룹 제목. 없으면 제목 없이 바로 항목이 나온다(홈 등). */
  title?: string;
  items: NavItem[];
};

/**
 * 큰 카테고리로 나눈다.
 *
 *   홈 · 투구 기록 · 트레이닝 · 영양 · 라이브러리 · 자료실 · 설정
 *
 * '분석'은 홈으로 들어갔다. 분석은 결국 '그날 어땠나'를 보는 일인데 날짜는 홈 캘린더가
 * 쥐고 있어서, 캘린더 밑에 늘 떠 있는 분석 칸이 고른 날의 분석을 보여 준다. 예전 주소
 * (/coach)는 그 칸으로 넘겨 준다.
 *
 * 홈과 트레이닝은 '남기는 것'과 '하는 것'으로 갈랐다. 홈에서 체크인과 투구
 * 기록을 남기고 운동 일정을 만들면, 실제 운동은 트레이닝에서 한다. 예전에는
 * 한 화면에 다 있어서 운동 하나 체크하려고 한참 스크롤해야 했다.
 * (일정 만들기는 양쪽에 다 있다.)
 *
 * '구속 측정'은 메뉴에 없다. 카메라로 재는 기능이라 앱(폰) 안에서만 열고, 들어가는
 * 길은 투구 기록 탭의 단추다(/velocity — app/(session)/velocity). 관리자는 웹에서도 연다.
 *
 * 주소는 예전 것을 그대로 쓴다(/today = 홈). 주소는 사용자에게 거의 안 보이는데
 * 스무 군데를 고치면 어딘가 하나는 놓치게 된다.
 *
 * '투구 일지'는 메뉴에서 뺐다. 달력과 목록이 홈 맨 앞으로 올라갔기 때문이다.
 * 매일 하는 일은 결국 '오늘 것을 남기고 요즘 어떻게 던졌는지 본다' 하나인데
 * 그것이 홈과 일지로 갈라져 있어서, 하루를 마치려면 두 화면을 오가야 했다.
 * 날짜 하나를 파고드는 화면(/pitch-log/<날짜>)은 그대로 있고, 홈 달력에서
 * 날짜를 누르면 거기로 간다.
 *
 * '투구 기록'은 투구 영상과 투구 기록을 한 탭에 합친 것이다(주소는 예전 그대로
 * /videos). 한동안 영상만 '투구 영상' 탭으로 갈라 두었는데, 영상을 볼 때 알고 싶은
 * 것은 결국 그날 몇 구를 어떤 강도로 던졌는가이고, 기록을 볼 때도 그날 영상이 곁에
 * 있어야 했다 — 둘이 두 화면에 나뉘어 오갔다. 이제 한 캘린더에 투구한 날이 모두
 * 나오고 영상이 있는 날은 그 장면이 칸을 채운다. 날짜 하나를 파고드는 화면
 * (/pitch-log/<날짜>)도 이 탭에 속한다(NAV_ALSO).
 *
 * 이름에 'AI'를 붙이지 않는다. 두 가지 이유가 있다.
 *
 * 하나는 사실과 다르다는 것이다. 오늘의 운동을 고르는 것은 규칙(코드)이고
 * AI는 그 결과를 문장으로 풀어 쓸 뿐이다. 'AI 트레이닝'이라고 부르면
 * 정작 이 앱이 잘하는 부분(위험한 운동은 애초에 후보에서 빠진다)이 가려진다.
 *
 * 다른 하나는 모바일 하단 탭이 이미 '트레이닝'·'리포트'라는 것이다.
 * 같은 화면을 두 이름으로 부르고 있었다.
 *
 * 라이브러리 쪽은 내용 그대로 '운동 영상'·'투구 드릴'로 부른다.
 */
/*
 * 메뉴 항목에는 설명을 붙이지 않는다. 예전에는 '운동 영상' 밑에 '부위 · 강도 · 장비로
 * 찾는 운동' 같은 한 줄이 있었는데, 이름으로 충분한 것을 되풀이해 메뉴만 길어졌다.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: '/today', label: '홈', icon: 'home' }],
  },
  /* 투구 기록 · 트레이닝 · 영양 · 구속 측정은 처음 가입한 사람에게 잠겨 있다(lock — 위 NavItem.lock) */
  {
    items: [{ href: '/videos', label: '투구 기록', icon: 'baseball', lock: 'pitch' }],
  },
  {
    /* 트레이닝 홈 — 트레이닝 · 암케어 · 메커니즘 앱 카드(lib/training-part.ts) */
    items: [
      {
        href: TRAINING_HOME_HREF,
        label: '트레이닝',
        icon: 'dumbbell',
        lock: 'training',
      },
    ],
  },
  /*
   * 영양은 트레이닝 바로 뒤에 둔다. 몸을 만드는 두 바퀴라 나란히 있어야 하고,
   * 매일 적는 것이라 하단 탭에도 들어간다(아래 MOBILE_TABS).
   */
  {
    items: [{ href: '/nutrition', label: '영양', icon: 'utensils', lock: 'nutrition' }],
  },
  /*
   * 구속 측정 — 투구 기록을 거치지 않고 카메라 측정으로 곧장(2026-09-28 사용자). 막대의 넷
   * (홈 · 투구 기록 · 트레이닝 · 영양) 뒤에 둔다 — 도크의 첫 줄이 막대의 넷이라, 그 사이에 끼우면
   * 막대에서 날아온 아이콘이 제 줄에 앉지 못한다. 투구 기록에 속하므로 같은 자물쇠다.
   */
  {
    items: [
      {
        href: '/velocity',
        label: '구속 측정',
        icon: 'radar',
        appOrAdmin: true,
        lock: 'pitch',
      },
    ],
  },
  {
    title: '라이브러리',
    items: [
      {
        href: '/library/training',
        label: '운동 영상',
        icon: 'film',
        tone: 'power',
      },
      {
        href: '/library/mechanics',
        label: '투구 드릴',
        icon: 'target',
        tone: 'mobility',
      },
      {
        href: '/board',
        label: '자료실',
        icon: 'book',
        tone: 'upper',
      },
    ],
  },
  {
    title: '관리',
    items: [
      {
        href: '/admin',
        label: '관리자',
        icon: 'shield',
        tone: 'armcare',
        adminOnly: true,
      },
      /* 카메라로 잰 값과 스피드건 값을 견줘 정확도를 올리는 자료 — 관리자만, 웹 화면 */
      {
        href: '/admin/velocity',
        label: '구속 측정 관리자',
        icon: 'gauge',
        tone: 'armcare',
        adminOnly: true,
      },
      /* 유튜브 참고 영상을 우리 영상으로 — 촬영 계획 · 체크 · 휴대폰 촬영 모드(2026-10-09) */
      {
        href: '/admin/shoot',
        label: '영상 촬영',
        icon: 'clapper',
        tone: 'armcare',
        adminOnly: true,
      },
    ],
  },
];

/**
 * 모바일 하단 탭 — 매일 쓰는 것 + 더보기.
 * 라이브러리와 자료실은 매일 열지 않으므로 '더보기'로 보낸다.
 */
/**
 * 하단 탭의 '더보기' 자리.
 *
 * 링크처럼 생겼지만 화면으로 넘어가지 않는다 — 누르면 PC 와 같은 사이드바가
 * 옆에서 나온다(components/app-shell.tsx 의 MobileTabs). 목록에서 이 자리를
 * 알아보는 표시로만 쓴다. /more 화면은 지웠다 — 그 주소로 오면 홈으로(next.config.ts).
 */
export const MORE_HREF = '/more';

/**
 * PC 틀(오른쪽 위 아이콘 줄 · 도크 · 판의 연출)을 쓰는 화면 — 1024px 이상이거나, 마우스로
 * 쓰는(hover · 가는 포인터) 576px 이상. PC 창을 화면 반으로 나눠도 PC 틀 그대로다.
 *
 * 576px 인 까닭: 윈도우 배율 150% 노트북(1920 → 1280 CSS px)에서 창을 반으로 나누면
 * 640px 에 조금 못 미친다. 휴대폰은 세로 430px 안팎이라 한참 밑이다. 로고와 오른쪽
 * 아이콘 줄은 520px 쯤까지 겹치지 않는다.
 *
 * app/globals.css 의 @custom-variant desk 와 글자 하나 다르지 않은 조건이다. CSS 는
 * desk: 로 틀을 보이고 숨기고, JS(matchMedia)는 이것으로 연출을 돌지 정한다. 둘이
 * 어긋나면 좁힌 PC 창에서 막대는 보이는데 연출이 안 돌거나 그 반대가 된다.
 * px 가 아니라 rem 으로 적는 것도 CSS 와 같게 하려는 것이다.
 */
export const DESK_MEDIA =
  '(min-width: 64rem), (min-width: 36rem) and (hover: hover) and (pointer: fine)';

/**
 * 메뉴 주소 말고도 그 탭에 속하는 주소 — 거기 있을 때도 그 탭에 불이 들어온다.
 *
 * 투구 기록 탭(/videos)은 날짜 하나를 파고드는 화면(/pitch-log/<날짜>)까지 맡는다.
 * 캘린더에서 날짜를 눌러 들어가도 지금 어느 탭에 있는지 메뉴가 알려 준다.
 */
export const NAV_ALSO: Record<string, readonly string[]> = {
  /*
   * 구속 측정 관리자도 투구 기록의 한 보기다(같은 머리 · 같은 고르개, app/(app)/videos/pitch-log-heading.tsx).
   * 첫 설정 화면(lib/feature-locks.ts SETUP_PATH)도 그 탭의 것이다 — 탭 주소 밑이라 이미 켜지지만, 설정을 마친 뒤
   * 다시 들어와도 그 탭이라는 것을 여기 적어 둔다.
   */
  '/videos': ['/pitch-log', '/admin/velocity', SETUP_PATH.pitch],
  '/training': [SETUP_PATH.training],
  '/nutrition': [SETUP_PATH.nutrition],
  /* 분석 · 그래프는 홈의 '더 보기'다(2026-10-05 홈 정리, app/(app)/coach/page.tsx) */
  '/today': ['/coach'],
};

export const MOBILE_TABS: NavItem[] = [
  { href: '/today', label: '홈', icon: 'home' },
  {
    href: '/videos',
    label: '투구 기록',
    short: '기록',
    icon: 'baseball',
    lock: 'pitch',
  },
  { href: TRAINING_HOME_HREF, label: '트레이닝', icon: 'dumbbell', lock: 'training' },
  { href: '/nutrition', label: '영양', icon: 'utensils', lock: 'nutrition' },
  { href: MORE_HREF, label: '더보기', icon: 'menu' },
];

/** applyLocks 가 곁 항목(탭의 첫 화면이 아닌 잠긴 항목)의 주소에 붙이는 칸 이름 — isLockSideHref 가 같은 이름을 본다 */
const LOCK_FROM_PARAM = 'from';

/**
 * 잠긴 항목의 주소를 첫 설정 화면으로 바꾸고 locked 를 단다(lib/feature-locks.ts, 2026-10-09).
 *
 * 항목을 지우지 않는다 — 처음 가입한 사람도 막대에서 그 탭이 '있다'는 것은 보고, 누르면 질문 몇 개를 거쳐 열린다.
 * 셸은 locked 를 보고 흐리게 + 자물쇠로 그린다(components/app-shell.tsx).
 *
 * 탭의 첫 화면(FEATURE_HOME)이 아닌 항목(구속 측정 → 투구 기록 설정)은 ?from= 을 붙여 주소를 갈라 둔다. 셸이 주소를
 * 항목의 이름(React key · 아이콘 이름표 nav-fly-N · 판의 돋는 차례)으로 쓰는데, 같은 주소가 둘이면 이름표가 겹쳐 메뉴
 * 연출이 통째로 멈춘다. 그 칸은 셸의 '지금 여기' 판정도 본다(isLockSideHref) — 설정 화면은 읽지 않는다.
 *
 * 주소에 뜻 없는 칸이 하나 남지만(복사하면 보인다) 그대로 둔다. 없애려면 셸이 주소 대신 다른 열쇠로 항목을 가려야 해서
 * 막대 · 도크 · 판 · 탭의 이름표 · 동그라미(useSlidingThumb) · 고른 자리(pick)를 다 바꿔야 한다. 설정 화면이 이 칸을
 * 읽어 마친 뒤 그 자리(/velocity)로 돌려보내게 되면 뜻도 생긴다.
 */
export function applyLocks<T extends NavItem>(
  items: T[],
  locks: FeatureLocks
): (T & { locked?: boolean })[] {
  return items.map((item) => {
    const key = item.lock;
    if (!key || !locks[key]) return item;
    const path = item.href.split('?')[0];
    const href =
      path === FEATURE_HOME[key]
        ? SETUP_PATH[key]
        : `${SETUP_PATH[key]}?${LOCK_FROM_PARAM}=${encodeURIComponent(path)}`;
    return { ...item, href, locked: true };
  });
}

/**
 * applyLocks 가 바꾼 곁 항목의 주소인가(구속 측정 → /videos/setup?from=%2Fvelocity).
 *
 * 셸은 이것을 '지금 여기'로 켜지 않는다 — 같은 설정 화면을 가리키는 탭 항목(투구 기록 → /videos/setup)이 따로 있어서,
 * 경로만 보면 투구 기록 설정 화면에서 둘이 같이 켜졌다(aria-current 둘, 판에서는 파란 줄 둘).
 */
export function isLockSideHref(href: string): boolean {
  const q = href.indexOf('?');
  return q >= 0 && new URLSearchParams(href.slice(q + 1)).has(LOCK_FROM_PARAM);
}

/** 도크 · 판의 묶음에 같은 것을 — 묶음은 그대로, 항목만 바꾼다 */
export function applyLocksToGroups(
  groups: NavGroup[],
  locks: FeatureLocks
): NavGroup[] {
  return groups.map((g) => ({ ...g, items: applyLocks(g.items, locks) }));
}

/**
 * PC 오른쪽 간편 이동 막대에 둘 항목.
 *
 * 휴대폰 하단 탭과 같은 목록을 쓴다 — 자주 가는 곳은 기기가 달라도 같다.
 * 다만 '더보기'는 뺀다. PC 막대에는 사이드바를 여는 네모 버튼이 따로 있어서,
 * 여기 또 두면 같은 버튼이 두 개가 된다.
 */
export function quickTabs(): NavItem[] {
  return MOBILE_TABS.filter((t) => t.href !== MORE_HREF);
}

/**
 * 볼 수 없는 항목을 걸러낸다 — 관리자 전용은 관리자만, 앱 · 관리자 전용(구속 측정)은 앱 안이거나
 * 관리자일 때만. 앱 안인지는 요청의 User-Agent 로 부르는 쪽이 가린다(lib/app-env.ts).
 */
export function visibleGroups(isAdmin: boolean, isNative = false): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => (!i.adminOnly || isAdmin) && (!i.appOrAdmin || isAdmin || isNative)
    ),
  })).filter((g) => g.items.length > 0);
}
