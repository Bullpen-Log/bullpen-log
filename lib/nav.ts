/**
 * 앱 내비게이션 구성.
 *
 * PC는 왼쪽 사이드바에 그룹으로, 모바일은 아래 탭 5개 + "더보기" 화면으로
 * 같은 목록을 나눠 보여준다. 한 곳에서 정의해 두 화면이 어긋나지 않게 한다.
 */

export type NavItem = {
  href: string;
  label: string;
  /** 이모지 아이콘 — 캐주얼한 인상을 위해 그림 대신 이모지를 쓴다 */
  icon: string;
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
 * '투구 일지'는 기록·영상·폼 분석·느낀점을 날짜 하나로 묶은 화면이다.
 * 예전에는 '투구기록'과 '영상분석' 둘로 나뉘어 있었다.
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
    items: [{ href: '/today', label: '홈', icon: '🏠' }],
  },
  {
    items: [{ href: '/pitch-log', label: '투구 일지', icon: '📅' }],
  },
  {
    items: [{ href: '/training', label: '트레이닝', icon: '💪' }],
  },
  {
    items: [{ href: '/coach', label: '분석', icon: '📊' }],
  },
  {
    title: '라이브러리',
    items: [
      { href: '/library/training', label: '운동 영상', icon: '🎬' },
      { href: '/library/mechanics', label: '투구 드릴', icon: '⚙️' },
    ],
  },
  {
    items: [{ href: '/board', label: '자료실', icon: '📚' }],
  },
  {
    title: '설정',
    items: [
      { href: '/profile', label: '내 정보', icon: '👤' },
      { href: '/admin', label: '관리자', icon: '🛠️', adminOnly: true },
    ],
  },
];

/**
 * 모바일 하단 탭 — 매일 쓰는 것 + 더보기.
 * 라이브러리와 자료실은 매일 열지 않으므로 '더보기'로 보낸다.
 */
export const MOBILE_TABS: NavItem[] = [
  { href: '/today', label: '홈', icon: '🏠' },
  { href: '/pitch-log', label: '투구 일지', icon: '📅' },
  { href: '/training', label: '트레이닝', icon: '💪' },
  { href: '/coach', label: '분석', icon: '📊' },
  { href: '/more', label: '더보기', icon: '☰' },
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
