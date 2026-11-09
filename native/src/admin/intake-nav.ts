/**
 * 외부 영상 접수(앱 화면 native/src/app/admin/intake.tsx)의 웹뷰가 어디로 가도 되나 — 순수 판정(시험 scripts/intake-access-selftest.mts).
 * 이 웹뷰는 웹 /admin/intake 와 그 아래(접수 하나)만 그린다. 그 밖으로 가려 하면:
 *   - 웹 /admin(관리자 첫 화면) → 앱 관리자 화면으로 돌아간다(back)
 *   - 우리 사이트의 다른 주소(로그인 · 오늘 등 서버가 돌려보낸 곳) → 앱 껍데기 웹으로 넘긴다(shell)
 *   - 다른 사이트(원본 내려받기 서명 주소 등) → 폰의 사파리 · 앱으로(outside)
 * 화면을 숨기는 것은 막기가 아니다 — 권한은 웹 화면(requirePermission('intake'))과 쓰기 동작(assertIntakeAdmin)이 다시 본다.
 */
export const INTAKE_WEB_PATH = '/admin/intake';

export type IntakeWebMove =
  | { kind: 'stay' }
  | { kind: 'back' }
  | { kind: 'shell'; href: string }
  | { kind: 'outside'; url: string }
  | { kind: 'block' };

/**
 * 사이트 메뉴 '관리' 항목 가운데 앱 화면으로 여는 것(웹 주소 → 앱 화면) — 위 메뉴(shell/menu-button.tsx)와 더보기 폴더(app/more.tsx)가 같은 짝을 쓴다.
 * 3D 개발 관리자는 앱 화면(2026-11-09 6b829da4), 외부 영상 접수는 웹 접수함을 띄우는 앱 화면(app/admin/intake.tsx — 못 불러오면 다시 불러오기).
 * 껍데기의 웹 → 앱 짝(app/index.tsx nativeOfWeb)에는 없어 메뉴가 직접 연다. 쿼리는 보지 않는다.
 */
const NATIVE_MANAGE: ReadonlyMap<string, string> = new Map([
  ['/admin/dev3d', '/swing/samples'],
  [INTAKE_WEB_PATH, INTAKE_WEB_PATH],
]);
export const nativeManageScreen = (href: string): string | null => NATIVE_MANAGE.get(href.split('?')[0]) ?? null;

/** 접수함 · 접수 하나(/admin/intake/<번호>) 주소인가 — '/admin/intakes' 같은 다른 주소는 아니다 */
export const isIntakePath = (path: string) => path === INTAKE_WEB_PATH || path.startsWith(`${INTAKE_WEB_PATH}/`);

/** 사이트 안 주소(경로 + 쿼리)를 어떻게 다룰지 */
export function intakePathMove(path: string, search = ''): IntakeWebMove {
  if (isIntakePath(path)) return { kind: 'stay' };
  if (path === '/admin') return { kind: 'back' };
  const q = search && !search.startsWith('?') ? `?${search}` : search;
  return { kind: 'shell', href: `${path || '/'}${q}` };
}

/** 로그인 · 가입 주소(껍데기 index.tsx isLoginPath 와 같은 묶음) */
const isLoginPath = (p: string) => p === '/login' || p.startsWith('/login/') || p === '/signup';

/**
 * 사이트가 '앱 화면을 열어 줘'({ t: 'native', path })를 보냈을 때 — 이 웹뷰에 접수함 말고 다른 화면이 그려졌다는 뜻이다.
 * 가장 흔한 것은 로그인이 풀려 웹 로그인 자리(app/login/native-login.tsx)가 그려진 경우 — 웹 로그인 폼을 이 웹뷰에 남기지 않고 껍데기를 '/login' 으로
 * 넘긴다(그냥 '/login' 이어야 껍데기가 앞사람 기록을 지우고 앱 로그인 화면을 연다 — '/login?native=1' 로 바로 열면 지우기를 건너뛴다).
 * 그 밖의 앱 화면은 껍데기가 그 주소를 앱 화면으로 연다.
 */
export function intakeNativeMove(path: string): IntakeWebMove {
  const [p] = path.split('?');
  if (isLoginPath(p)) return { kind: 'shell', href: '/login' };
  if (isIntakePath(p)) return { kind: 'stay' };
  return { kind: 'shell', href: path.startsWith('/') ? path : `/${path}` };
}

/** 웹뷰가 맨 위 창을 새 주소로 옮기려 할 때(onShouldStartLoadWithRequest) */
export function intakeWebMove(url: string, siteHost: string): IntakeWebMove {
  if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) return { kind: 'stay' };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: 'block' };
  }
  if ((u.protocol === 'https:' || u.protocol === 'http:') && u.host === siteHost) return intakePathMove(u.pathname, u.search);
  /* 자바스크립트 주소는 열지 않는다. 메일 · 전화 · 다른 사이트는 폰에 맡긴다 */
  if (u.protocol === 'javascript:') return { kind: 'block' };
  return { kind: 'outside', url };
}
