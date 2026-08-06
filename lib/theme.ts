/**
 * 라이트/다크 모드.
 *
 * 고른 값은 브라우저(localStorage)에만 둔다. 서버에 저장하면 로그인 전
 * 화면에서는 쓸 수가 없고, 기기마다 다르게 두고 싶은 설정이기도 하다.
 *
 * 실제로 화면에 적용되는 값은 <html data-theme="light|dark"> 하나뿐이고,
 * 색은 app/globals.css 에서 그 선택자로 갈아끼운다.
 */

export const THEME_STORAGE_KEY = 'bullpen-theme';

export const THEME_CHOICES = [
  { value: 'light', label: '라이트', icon: '☀️', hint: '항상 밝게' },
  { value: 'dark', label: '다크', icon: '🌙', hint: '항상 어둡게' },
  { value: 'system', label: '시스템', icon: '📱', hint: '기기 설정을 따라감' },
] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number]['value'];

/** 실제로 화면에 칠해지는 두 가지. 'system'은 여기로 풀어서 쓴다. */
export type ResolvedTheme = 'light' | 'dark';

export const DEFAULT_THEME: ThemeChoice = 'system';

export function isThemeChoice(value: string | null): value is ThemeChoice {
  return THEME_CHOICES.some((c) => c.value === value);
}

/**
 * 첫 페인트 전에 <head>에서 실행되는 스크립트.
 *
 * 이게 없으면 리액트가 올라오기 전까지 밝은 화면이 한 번 번쩍인다.
 * 다크 모드를 쓰는 사람에게는 이 깜빡임이 가장 거슬리는 부분이라
 * 어떤 값이 저장돼 있는지 여기서 먼저 읽어 칠해둔다.
 *
 * 문자열로 두는 이유는 번들러를 거치지 않고 그대로 넣기 위해서다.
 * 실패하더라도 화면은 떠야 하므로 통째로 try/catch 한다.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || ((!stored || stored === 'system') && prefersDark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`.trim();

/** 'system'이면 지금 기기 설정을 보고 실제 색을 정한다. */
export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice !== 'system') return choice;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readStoredTheme(): ThemeChoice {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * 고른 값이 바뀌었을 때 알려줄 곳들.
 *
 * localStorage 는 리액트 바깥의 저장소라서, 화면이 그 값을 읽으려면
 * 구독이 필요하다. 'storage' 이벤트는 다른 탭에서 바꿨을 때만 오므로
 * 같은 탭에서 바꾼 것은 직접 알린다.
 */
const listeners = new Set<() => void>();

export function subscribeTheme(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** 고른 값을 저장하고 바로 화면에 반영한다. */
export function applyTheme(choice: ThemeChoice) {
  if (typeof document === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // 사생활 보호 모드 등에서 저장이 막힐 수 있다. 이번 화면에는 그래도 적용한다.
  }
  document.documentElement.dataset.theme = resolveTheme(choice);
  for (const listener of listeners) listener();
}

/** 서버에는 저장된 값이 없다. 붙기 전까지는 이 값으로 그린다. */
export function getServerTheme(): ThemeChoice {
  return DEFAULT_THEME;
}
