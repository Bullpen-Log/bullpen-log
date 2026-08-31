import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  Dumbbell,
  Film,
  House,
  Menu,
  Settings,
  Target,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { NavIconName } from '@/lib/nav';

/**
 * 메뉴 아이콘 이름 → 그림.
 *
 * lib/nav.ts 는 서버에서도 읽으므로 이름만 들고 있다. 리액트 컴포넌트는
 * 서버에서 화면 쪽으로 건네줄 수 없어서다. 이름을 그림으로 바꾸는 자리를
 * 여기 하나만 둔다 — 사이드바·하단 탭·더보기가 같은 그림을 쓴다.
 */
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  home: House,
  calendar: CalendarDays,
  dumbbell: Dumbbell,
  chart: ChartColumn,
  film: Film,
  target: Target,
  book: BookOpen,
  user: User,
  settings: Settings,
  menu: Menu,
};
