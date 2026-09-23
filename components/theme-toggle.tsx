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

export function ThemeToggle({ className = '' }: { className?: string }) {
  const current = useSyncExternalStore(subscribeTheme, readTheme, getServerTheme);

  function pick(next: ThemeChoice) {
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="화면 밝기"
      className={`flex gap-1 rounded-xl border border-line bg-surface-2 p-1 ${className}`}
    >
      {THEME_CHOICES.map((option) => {
        const selected = current === option.value;
        const Icon = THEME_ICONS[option.value];
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.hint}
            onClick={() => pick(option.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              selected
                ? 'bg-sky text-white'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
