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
 * 큰 카테고리 여섯 개로 나눈다.
 *
 *   홈 · 투구 일지 · AI 리포트 · AI 트레이닝 · 라이브러리 · 자료실
 *
 * '투구 일지'는 기록·영상·폼 분석·느낀점을 날짜 하나로 묶은 화면이다.
 * 예전에는 '투구기록'과 '영상분석' 둘로 나뉘어 있었다.
 *
 * 라이브러리의 '트레이닝'은 'AI 트레이닝'과 이름이 겹쳐 헷갈리므로
 * 내용 그대로 '운동 영상'·'투구 드릴'로 부른다.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: '/dashboard', label: '홈', icon: '⚾' }],
  },
  {
    items: [{ href: '/pitch-log', label: '투구 일지', icon: '📅' }],
  },
  {
    items: [{ href: '/velocity', label: '구속 측정', icon: '📡' }],
  },
  {
    title: 'AI 코치',
    items: [
      { href: '/coach', label: 'AI 리포트', icon: '📊' },
      { href: '/today', label: 'AI 트레이닝', icon: '🎯' },
    ],
  },
  {
    title: '라이브러리',
    items: [
      { href: '/library/training', label: '운동 영상', icon: '💪' },
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
 * 모바일 하단 탭 — 매일 쓰는 4개 + 더보기.
 * 라이브러리와 자료실은 매일 열지 않으므로 '더보기'로 보낸다.
 */
export const MOBILE_TABS: NavItem[] = [
  { href: '/dashboard', label: '홈', icon: '⚾' },
  { href: '/pitch-log', label: '일지', icon: '📅' },
  { href: '/today', label: '트레이닝', icon: '🎯' },
  { href: '/coach', label: '리포트', icon: '📊' },
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
