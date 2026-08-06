/**
 * 라이트/다크 모드.
 *
 * 고를 수 있는 건 라이트와 다크 둘뿐이고, 아무것도 고르지 않았으면
 * 언제나 라이트로 시작한다. 기기 설정(prefers-color-scheme)은 보지 않는다 —
 * 처음 들어온 사람이 늘 같은 화면을 보게 하려는 것이다.
 *
 * 고른 값은 브라우저(localStorage)에만 둔다. 서버에 저장하면 로그인 전
 * 화면에서는 쓸 수가 없고, 기기마다 다르게 두고 싶은 설정이기도 하다.
 *
 * 실제로 화면에 적용되는 값은 <html data-theme="light|dark"> 하나뿐이고,
 * 색은 app/globals.css 에서 그 선택자로 갈아끼운다.
 */

export const THEME_STORAGE_KEY = 'bullpen-theme';

export const THEME_CHOICES = [
  { value: 'light', label: '라이트', icon: '☀️', hint: '밝은 화면' },
  { value: 'dark', label: '다크', icon: '🌙', hint: '어두운 화면' },
] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number]['value'];

/** 아무것도 고르지 않았을 때 */
export const DEFAULT_THEME: ThemeChoice = 'light';

export function isThemeChoice(value: string | null): value is ThemeChoice {
  return THEME_CHOICES.some((c) => c.value === value);
}

/**
 * 첫 페인트 전에 실행되는 스크립트.
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
    document.documentElement.dataset.theme = stored === 'dark' ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`.trim();

/**
 * 지금 화면에 칠해져 있는 값.
 *
 * 저장된 값을 다시 읽지 않고 <html> 을 그대로 본다. 위 스크립트가 이미
 * 칠해 두었기 때문에 이쪽이 언제나 화면과 일치한다.
 */
export function readTheme(): ThemeChoice {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/**
 * 값이 바뀌었을 때 알려줄 곳들.
 *
 * <html> 의 속성은 리액트 바깥이라서, 화면이 그 값을 읽으려면 구독이
 * 필요하다. 'storage' 이벤트는 다른 탭에서 바꿨을 때만 오므로
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
  document.documentElement.dataset.theme = choice;
  for (const listener of listeners) listener();
}

/** 서버는 <html> 을 볼 수 없다. 붙기 전까지는 이 값으로 그린다. */
export function getServerTheme(): ThemeChoice {
  return DEFAULT_THEME;
}
