'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  applyTheme,
  getServerTheme,
  readStoredTheme,
  resolveTheme,
  subscribeTheme,
  THEME_CHOICES,
  type ThemeChoice,
} from '@/lib/theme';

/**
 * 라이트 / 다크 / 시스템 중 하나를 고르는 버튼 줄.
 *
 * 고른 값은 localStorage 에 있어서 서버는 알 수가 없다. 그래서
 * useSyncExternalStore 로 읽는다 — 서버에서 그릴 때와 화면에 붙는 순간에는
 * 기본값을 쓰고, 붙고 난 뒤 진짜 값으로 바꿔 그려준다. 이렇게 해야
 * 서버가 그린 것과 브라우저가 그린 것이 어긋났다는 경고가 나지 않는다.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const choice = useSyncExternalStore(
    subscribeTheme,
    readStoredTheme,
    getServerTheme
  );

  // '시스템'을 골라둔 사람은 기기 설정이 바뀌면 화면도 따라가야 한다.
  useEffect(() => {
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.dataset.theme = resolveTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

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
        const selected = choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.hint}
            onClick={() => pick(option.value)}
            // 사이드바가 좁아 아이콘과 글자를 나란히 두면 '라이 트'로 줄이 바뀐다.
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium whitespace-nowrap transition-colors ${
              selected
                ? 'bg-sky text-white'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <span aria-hidden className="text-sm leading-none">
              {option.icon}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
