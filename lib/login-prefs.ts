/**
 * 로그인 화면이 이 기기에 기억해 두는 것 — 아이디와 '자동 로그인' 여부.
 *
 * 서버에 두지 않는다. 필요한 순간이 로그인하기 '전'이라 서버에 있으면 읽을
 * 수가 없고, 기기마다 다르게 두고 싶은 값이기도 하다 — 자기 폰에서는 켜 두고
 * 공용 PC 에서는 꺼 두는 것이 정상이다.
 *
 * 비밀번호는 여기 담지 않는다. 담을 수 있는 자리가 있어도 담지 않는다.
 * localStorage 는 그 사이트에서 도는 어떤 스크립트든 읽을 수 있는 서랍이라,
 * 비밀번호를 두는 곳이 아니다. '자동 로그인'은 비밀번호를 기억해 두었다가
 * 대신 쳐 주는 것이 아니라, 서버가 준 로그인 표를 더 오래 들고 있는 것이다
 * (lib/session.ts).
 */

const EMAIL_KEY = 'bullpen-remember-email';
const STAY_KEY = 'bullpen-stay-logged-in';

export type LoginPrefs = {
  /** 기억해 둔 아이디. 기억하지 않기로 했으면 null */
  email: string | null;
  stayLoggedIn: boolean;
};

/**
 * 아무것도 고른 적이 없을 때.
 *
 * 자동 로그인은 켜 둔다. 매일 쓰는 앱이고 대개 자기 폰에서 쓰는데, 기본값을
 * 꺼 두면 체크박스를 못 본 사람은 브라우저를 닫을 때마다 로그아웃된다 —
 * 편하자고 만든 것이 오히려 불편해진다. 공용 PC 라면 끄면 된다.
 */
const DEFAULTS: LoginPrefs = { email: null, stayLoggedIn: true };

/**
 * 저장된 값을 읽는다.
 *
 * 사생활 보호 모드처럼 저장이 막힌 곳에서는 읽기도 막힌다. 그때는 기본값으로
 * 둔다 — 로그인 화면이 안 뜨는 것보다 낫다.
 */
export function readLoginPrefs(): LoginPrefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const email = window.localStorage.getItem(EMAIL_KEY);
    const stay = window.localStorage.getItem(STAY_KEY);
    return {
      email: email && email.trim() ? email : null,
      /* 적어 둔 적이 없으면 기본값을 쓴다. 'false'라고 적혀 있을 때만 끈다. */
      stayLoggedIn: stay == null ? DEFAULTS.stayLoggedIn : stay !== 'false',
    };
  } catch {
    return DEFAULTS;
  }
}

/** 고른 것만 골라서 저장한다. 넘기지 않은 것은 그대로 둔다. */
export function saveLoginPrefs(prefs: Partial<LoginPrefs>) {
  if (typeof window === 'undefined') return;
  try {
    if ('email' in prefs) {
      const email = prefs.email?.trim();
      if (email) window.localStorage.setItem(EMAIL_KEY, email);
      else window.localStorage.removeItem(EMAIL_KEY);
    }
    if (prefs.stayLoggedIn != null) {
      window.localStorage.setItem(STAY_KEY, String(prefs.stayLoggedIn));
    }
  } catch {
    // 저장이 막힌 곳에서는 조용히 넘어간다. 이번 로그인은 그대로 된다.
  }
}
