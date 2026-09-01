/**
 * 앱 내비게이션 구성.
 *
 * PC는 왼쪽 사이드바에 그룹으로, 모바일은 아래 탭 5개 + "더보기" 화면으로
 * 같은 목록을 나눠 보여준다. 한 곳에서 정의해 두 화면이 어긋나지 않게 한다.
 */

/** 쓸 수 있는 아이콘 이름. 그림은 components/nav-icons.tsx 에 있다. */
export type NavIconName =
  | 'home'
  | 'calendar'
  | 'dumbbell'
  | 'chart'
  | 'film'
  | 'target'
  | 'book'
  | 'user'
  | 'settings'
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
   * 탭이 여섯 개가 되면서 칸이 좁아졌다. 무엇보다 '투구 일지'와 '투구 영상'이
   * 나란히 붙으니 앞 두 글자가 같아서 눈에 잘 안 갈렸다. 좁은 곳에서는 서로
   * 다른 쪽('일지'·'영상')만 남긴다. 사이드바처럼 자리가 넉넉한 곳은 전체
   * 이름을 그대로 쓴다.
   */
  short?: string;
  /**
   * 아이콘 배경색. 목록에서 항목을 눈으로 가르는 데 쓴다.
   *
   * 라이브러리 카테고리와 같은 색 토큰(--color-cat-*)을 그대로 쓴다.
   * 같은 앱 안에서 색 체계를 두 벌 만들 이유가 없다.
   */
  tone?:
    'lower' | 'upper' | 'mobility' | 'power' | 'core' | 'armcare' | 'recovery';
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
 *   홈 · 투구 일지 · 트레이닝 · 분석 · 라이브러리 · 자료실 · 설정
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
 * '투구 일지'는 그날의 기록·폼 분석·느낀점을 날짜 하나로 묶은 화면이다.
 * 예전에는 '투구기록'과 '영상분석' 둘로 나뉘어 있었다.
 *
 * 영상은 다시 '투구 영상'으로 갈라 두었다. 나머지는 날짜를 알고 찾아가는
 * 것인데 영상만은 여러 날을 가로질러 본다 — 예전 폼과 지금을 견주는 일이
 * 그렇다. 무엇보다 이 앱에서 영상은 곁다리가 아니라 폼을 고치는 근거라,
 * 다른 화면의 탭 안에 숨겨 둘 것이 아니었다.
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
    items: [{ href: '/pitch-log', label: '투구 일지', icon: 'calendar' }],
  },
  {
    items: [{ href: '/videos', label: '투구 영상', icon: 'film' }],
  },
  {
    items: [{ href: '/training', label: '트레이닝', icon: 'dumbbell' }],
  },
  {
    items: [{ href: '/coach', label: '분석', icon: 'chart' }],
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
    title: '설정',
    items: [
      {
        href: '/profile',
        label: '내 정보',
        icon: 'user',
        desc: '신체 정보 · 평소 문진 · 기본 운동 시간',
        tone: 'recovery',
      },
      {
        href: '/admin',
        label: '관리자',
        icon: 'settings',
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
export const MOBILE_TABS: NavItem[] = [
  { href: '/today', label: '홈', icon: 'home' },
  { href: '/pitch-log', label: '투구 일지', short: '일지', icon: 'calendar' },
  { href: '/videos', label: '투구 영상', short: '영상', icon: 'film' },
  { href: '/training', label: '트레이닝', icon: 'dumbbell' },
  { href: '/coach', label: '분석', icon: 'chart' },
  { href: '/more', label: '더보기', icon: 'menu' },
];

/** 관리자가 아니면 관리자 전용 항목을 걸러낸다. */
export function visibleGroups(isAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.adminOnly || isAdmin),
  })).filter((g) => g.items.length > 0);
}

/**
 * 모바일 "더보기" 화면용 목록.
 * 하단 탭에 이미 있는 항목은 빼서 같은 화면에 두 번 나오지 않게 한다.
 */
export function moreGroups(isAdmin: boolean): NavGroup[] {
  const inTabs = new Set(MOBILE_TABS.map((t) => t.href));
  return visibleGroups(isAdmin)
    .map((g) => ({ ...g, items: g.items.filter((i) => !inTabs.has(i.href)) }))
    .filter((g) => g.items.length > 0);
}
