/**
 * 앱 내비게이션 구성.
 *
 * PC는 오른쪽 위 막대와 옆에서 나오는 사이드바로, 모바일은 아래 탭 5개로
 * 같은 목록을 나눠 보여준다. 모바일의 "더보기"도 PC 와 같은 사이드바를 연다.
 * 한 곳에서 정의해 두 화면이 어긋나지 않게 한다.
 */

import { TRAINING_LAST_HREF } from '@/lib/training-part';

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
   * 한 줄 설명. '더보기' 목록에서 이름 아래에 붙는다.
   *
   * 이름만 있으면 '자료실'이 무엇을 모아둔 곳인지, '투구 드릴'이 무엇을
   * 하는 것인지 눌러 봐야 안다. 사이드바처럼 자리가 좁은 곳에서는 안 쓴다.
   */
  desc?: string;
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
 * '구속 측정'은 뺐다. 영상으로 잰 구속이 스피드건과 맞는지 확인이 끝나지
 * 않아서다. 화면은 app/(app)/_velocity 에 그대로 있고, 왜 껐는지도 거기 적어
 * 두었다.
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
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: '/today', label: '홈', icon: 'home' }],
  },
  {
    items: [{ href: '/videos', label: '투구 기록', icon: 'baseball' }],
  },
  {
    /* 마지막으로 본 칸(트레이닝 · 암케어)을 연다 — lib/training-part.ts */
    items: [{ href: TRAINING_LAST_HREF, label: '트레이닝', icon: 'dumbbell' }],
  },
  /*
   * 영양은 트레이닝 바로 뒤에 둔다. 몸을 만드는 두 바퀴라 나란히 있어야 하고,
   * 매일 적는 것이라 하단 탭에도 들어간다(아래 MOBILE_TABS).
   */
  {
    items: [{ href: '/nutrition', label: '영양', icon: 'utensils' }],
  },
  {
    title: '라이브러리',
    items: [
      {
        href: '/library/training',
        label: '운동 영상',
        icon: 'film',
        desc: '부위·강도·장비로 찾는 운동',
        tone: 'power',
      },
      {
        href: '/library/mechanics',
        label: '투구 드릴',
        icon: 'target',
        desc: '설명을 보고 직접 고르는 드릴',
        tone: 'mobility',
      },
      {
        href: '/board',
        label: '자료실',
        icon: 'book',
        desc: '투구 역학과 트레이닝 자료',
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
        desc: '회원과 영상 관리',
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
 * 알아보는 표시로만 쓴다.
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
  '/videos': ['/pitch-log'],
};

export const MOBILE_TABS: NavItem[] = [
  { href: '/today', label: '홈', icon: 'home' },
  { href: '/videos', label: '투구 기록', short: '기록', icon: 'baseball' },
  { href: TRAINING_LAST_HREF, label: '트레이닝', icon: 'dumbbell' },
  { href: '/nutrition', label: '영양', icon: 'utensils' },
  { href: MORE_HREF, label: '더보기', icon: 'menu' },
];

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

/** 관리자가 아니면 관리자 전용 항목을 걸러낸다. */
export function visibleGroups(isAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.adminOnly || isAdmin),
  })).filter((g) => g.items.length > 0);
}

/**
 * /more 화면용 목록.
 *
 * 하단 "더보기"는 이제 사이드바를 열어서 이 화면으로 오는 길은 없다. 주소를
 * 저장해 둔 사람을 위해 화면만 남겨 둔다. 하단 탭에 이미 있는 항목은 빼서
 * 같은 화면에 두 번 나오지 않게 한다.
 */
export function moreGroups(isAdmin: boolean): NavGroup[] {
  const inTabs = new Set(MOBILE_TABS.map((t) => t.href));
  return visibleGroups(isAdmin)
    .map((g) => ({ ...g, items: g.items.filter((i) => !inTabs.has(i.href)) }))
    .filter((g) => g.items.length > 0);
}
