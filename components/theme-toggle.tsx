'use client';

import { useSyncExternalStore } from 'react';
import { Moon, MoonStar, Sun, type LucideIcon } from 'lucide-react';
import {
  applyTheme,
  getServerTheme,
  readTheme,
  subscribeTheme,
  THEME_CHOICES,
  type ThemeChoice,
} from '@/lib/theme';
import { Segmented } from '@/components/segmented';

/**
 * 라이트 / 다크 중 하나를 고르는 버튼 줄.
 *
 * 지금 값은 <html data-theme> 에 있어서 서버는 알 수가 없다. 그래서
 * useSyncExternalStore 로 읽는다 — 서버에서 그릴 때와 화면에 붙는 순간에는
 * 기본값을 쓰고, 붙고 난 뒤 진짜 값으로 바꿔 그려준다. 이렇게 해야
 * 서버가 그린 것과 브라우저가 그린 것이 어긋났다는 경고가 나지 않는다.
 */
/*
 * 테마마다 붙는 그림.
 *
 * 다크와 네이비는 둘 다 어두운 화면이라 달을 쓰되, 네이비는 별을 얹어
 * 가른다. 이름만으로도 알 수 있지만 좁은 자리에서는 글자가 먼저 줄어든다.
 */
const THEME_ICONS: Record<ThemeChoice, LucideIcon> = {
  light: Sun,
  dark: Moon,
  navy: MoonStar,
};

/* 고르개에 넘길 모양으로 한 번만 합쳐 둔다 — 그릴 때마다 새로 만들 이유가 없다. */
const THEME_OPTIONS = THEME_CHOICES.map((option) => ({
  ...option,
  icon: THEME_ICONS[option.value],
}));

export function ThemeToggle({ className = '' }: { className?: string }) {
  const current = useSyncExternalStore(subscribeTheme, readTheme, getServerTheme);

  /*
   * 바로 적용한다. applyTheme 은 <html data-theme-switching> 을 켜 화면 전체의
   * 색을 0.26초에 걸쳐 건너가게 하는데, 그 창 안에서는 globals.css 가 모든
   * 요소의 CSS transition 을 색 계열로만 못 박는다. 고르개의 표시가 그 창 안에서
   * 옮겨 가야 하므로, 표시만 그 규칙에서 빼 두었다(globals.css 의 [data-thumb]).
   * 표시가 다 간 뒤에 부르는 방법도 있지만, 그러면 색이 늦게 바뀌어 '눌렀는데
   * 한참 있다 바뀐다'가 된다.
   */
  function pick(next: ThemeChoice) {
    applyTheme(next);
  }

  return (
    <Segmented
      role="radiogroup"
      layout="grid"
      label="화면 밝기"
      value={current}
      onChange={pick}
      options={THEME_OPTIONS}
      className={className}
      itemClassName="px-2 py-2"
    />
  );
}
