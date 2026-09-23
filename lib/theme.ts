/**
 * 화면 테마.
 *
 * 세 가지다 — 라이트 · 다크 · 네이비. 아무것도 고르지 않았으면 언제나
 * 라이트로 시작한다. 기기 설정(prefers-color-scheme)은 보지 않는다 —
 * 처음 들어온 사람이 늘 같은 화면을 보게 하려는 것이다.
 *
 * 다크와 네이비를 나눈 이유: 원래 '다크'가 남색 계열이었는데, 다크 모드를
 * 찾는 사람이 기대하는 것은 대개 검은 화면이다. OLED 화면에서 진짜 검정은
 * 화소를 아예 꺼서 눈부심도 전력도 확실히 줄어든다. 그렇다고 남색을 버리기는
 * 아까웠다 — 밤에 보기 부드럽고 이 앱의 하늘색과도 잘 맞는다. 그래서 따로
 * 이름을 주고 남겼다.
 *
 * 고른 값은 브라우저(localStorage)에만 둔다. 서버에 저장하면 로그인 전
 * 화면에서는 쓸 수가 없고, 기기마다 다르게 두고 싶은 설정이기도 하다.
 *
 * 실제로 화면에 적용되는 값은 <html data-theme="light|dark|navy"> 하나뿐이고,
 * 색은 app/globals.css 에서 그 선택자로 갈아끼운다.
 */

export const THEME_STORAGE_KEY = 'bullpen-theme';

export const THEME_CHOICES = [
  { value: 'light', label: '라이트', hint: '밝은 화면' },
  { value: 'dark', label: '다크', hint: '검은 화면' },
  { value: 'navy', label: '네이비', hint: '남색 화면' },
] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number]['value'];

/** 모르는 값이면 라이트로 떨어뜨린다. 옛 저장값과 손댄 값을 함께 막는다. */
function normalizeTheme(value: unknown): ThemeChoice {
  return THEME_CHOICES.some((c) => c.value === value)
    ? (value as ThemeChoice)
    : DEFAULT_THEME;
}

/** 아무것도 고르지 않았을 때 */
export const DEFAULT_THEME: ThemeChoice = 'light';

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
    var known = ${JSON.stringify(THEME_CHOICES.map((c) => c.value))};
    document.documentElement.dataset.theme =
      known.indexOf(stored) === -1 ? 'light' : stored;
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
  return normalizeTheme(document.documentElement.dataset.theme);
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

/**
 * 색이 갈리는 동안만 켜 두는 표시.
 *
 * 이게 붙어 있는 짧은 동안에만 화면 전체가 색을 부드럽게 건너간다
 * (app/globals.css). 늘 켜 두지 않는 이유가 있다 — 모든 요소에 색 전환을
 * 걸어 두면 버튼에 마우스를 올릴 때도 그 시간만큼 늦게 반응해서, 앱 전체가
 * 굼떠진다. 테마를 바꾸는 순간에만 켠다.
 */
const SWITCHING_ATTR = 'data-theme-switching';

/** 색이 건너가는 데 걸리는 시간. globals.css 의 값과 같아야 한다. */
const SWITCH_MS = 260;

/*
 * 표시를 끄는 타이머.
 *
 * 하나만 들고 있다가 갈아 끼운다. 라이트→다크→네이비를 빠르게 누르면 먼저
 * 걸어둔 타이머가 나중 것 도중에 표시를 꺼서, 마지막 전환만 뚝 끊긴다.
 */
let switchTimer: ReturnType<typeof setTimeout> | undefined;

/** 고른 값을 저장하고 바로 화면에 반영한다. */
export function applyTheme(choice: ThemeChoice) {
  if (typeof document === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // 사생활 보호 모드 등에서 저장이 막힐 수 있다. 이번 화면에는 그래도 적용한다.
  }

  const root = document.documentElement;
  /*
   * 이미 같은 테마면 아무것도 하지 않는다. 같은 버튼을 두 번 눌렀다고
   * 화면 전체에 전환을 걸 이유가 없다.
   */
  if (root.dataset.theme !== choice) {
    root.setAttribute(SWITCHING_ATTR, '');
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => root.removeAttribute(SWITCHING_ATTR), SWITCH_MS);
  }

  root.dataset.theme = choice;
  for (const listener of listeners) listener();
}

/** 서버는 <html> 을 볼 수 없다. 붙기 전까지는 이 값으로 그린다. */
export function getServerTheme(): ThemeChoice {
  return DEFAULT_THEME;
}
