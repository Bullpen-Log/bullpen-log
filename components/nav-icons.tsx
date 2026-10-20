import {
  Baseball,
  BookOpen,
  Clapperboard,
  Dumbbell,
  Film,
  Gauge,
  House,
  Menu,
  PersonStanding,
  Radar,
  Settings,
  Shield,
  Target,
  Utensils,
  type LucideIcon,
  LifeBuoy,
  MessagesSquare,
  Users,
} from '@/components/icon';
import type { NavIconName } from '@/lib/nav';

/**
 * 메뉴 아이콘 이름 → 그림.
 *
 * lib/nav.ts 는 서버에서도 읽으므로 이름만 들고 있다. 리액트 컴포넌트는
 * 서버에서 화면 쪽으로 건네줄 수 없어서다. 이름을 그림으로 바꾸는 자리를
 * 여기 하나만 둔다 — 사이드바·하단 탭·더보기가 같은 그림을 쓴다.
 */
/**
 * 휴대폰 더보기의 앱 아이콘 판 색 — 위(밝음) → 아래(짙음) 그라데이션 두 색(2026-10-13 김민 "고품질 아이콘").
 * 아이폰 앱처럼 앱마다 한 색. 관리 · 설정은 같은 짙은 회색으로 묶어 눈에 덜 띄게.
 */
export const NAV_TINT: Record<NavIconName, [string, string]> = {
  home: ['#4fc3ff', '#0a7fd6'],
  baseball: ['#ff7a6b', '#e0352b'],
  dumbbell: ['#ffb14a', '#f06a0f'],
  utensils: ['#5fe07a', '#1f9e45'],
  radar: ['#8f9bff', '#4b55d6'],
  body: ['#4fe0cf', '#0e968a'],
  film: ['#ff86b0', '#d93d74'],
  target: ['#ffd25a', '#eb9a06'],
  book: ['#a3adbf', '#5e6b80'],
  shield: ['#6b7180', '#2c313b'],
  gauge: ['#6b7180', '#2c313b'],
  clapper: ['#6b7180', '#2c313b'],
  settings: ['#6b7180', '#2c313b'],
  community: ['#c4a7ff', '#7c3aed'],
  support: ['#5fd3c8', '#0f8f86'],
  users: ['#7fb3ff', '#2563eb'],
  menu: ['#6b7180', '#2c313b'],
};

export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  home: House,
  baseball: Baseball,
  dumbbell: Dumbbell,
  film: Film,
  utensils: Utensils,
  target: Target,
  book: BookOpen,
  settings: Settings,
  shield: Shield,
  gauge: Gauge,
  clapper: Clapperboard,
  radar: Radar,
  body: PersonStanding,
  community: MessagesSquare,
  support: LifeBuoy,
  users: Users,
  menu: Menu,
};
