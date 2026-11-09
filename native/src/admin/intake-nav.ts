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

/** 접수함 · 접수 하나(/admin/intake/<번호>) 주소인가 — '/admin/intakes' 같은 다른 주소는 아니다 */
export const isIntakePath = (path: string) => path === INTAKE_WEB_PATH || path.startsWith(`${INTAKE_WEB_PATH}/`);

/** 사이트 안 주소(경로 + 쿼리)를 어떻게 다룰지 */
export function intakePathMove(path: string, search = ''): IntakeWebMove {
  if (isIntakePath(path)) return { kind: 'stay' };
  if (path === '/admin') return { kind: 'back' };
  const q = search && !search.startsWith('?') ? `?${search}` : search;
  return { kind: 'shell', href: `${path || '/'}${q}` };
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
