/**
 * 이름(2026-10-21 금윤호, docs/designs/sinker-dugout.md 1단계) — 한 서버에 얼굴이 셋이다.
 * - 싱커: 선수 앱(지금 '불펜로그' 앱 — 이름만 바뀌고 기능은 그대로) · PC 의 '내 싱커'.
 * - 덕아웃: 웹사이트 전체(커뮤니티 · 장터 · 레슨 · 연습장 · 관리) · 선수가 아닌 사람의 앱(나중).
 * 화면 문구에 '불펜로그' 대신 이 상수를 쓴다. 저장소 · 번들 ID · UA 표시(BullpenLogApp)는 안 바꾼다 — 사용자에게 안 보이고 바꾸면 앱이 끊긴다.
 */
export type Brand = 'sinker' | 'dugout';

export const BRAND: Record<Brand, { name: string; en: string; tagline: string }> = {
  sinker: { name: '싱커', en: 'SINKER', tagline: '선수의 기록 앱' },
  dugout: { name: '덕아웃', en: 'DUGOUT', tagline: '야구인의 커뮤니티' },
};

/** 옛 이름 — 안내문 · 패치노트에만 */
export const OLD_NAME = '불펜로그';

/** 이름 바꾼 안내(1-4) — 로그인 화면 · 앱 안내 화면에 한 달쯤 둔다(2026-11-21 뒤 지워도 된다) */
export const RENAME_NOTICE = `${OLD_NAME}가 싱커(앱)와 덕아웃(웹)으로 이름을 바꿨어요. 계정과 기록은 그대로예요.`;

/**
 * 웹 화면의 얼굴 — 주소로 정한다. 덕아웃 바깥 공간 · 관리 · 법률 · 리포트는 덕아웃, 선수 화면(/today …)과 세션 화면은 싱커.
 * 2단계에서 PC 의 선수 화면이 덕아웃 틀 안에 들어가면 그때 '틀은 덕아웃, 내용은 싱커'가 된다 — 이 함수는 내용 쪽 이름을 준다.
 */
export function brandOfPath(pathname: string): Brand {
  return /^\/(market|chat|lessons|venues|gear|me|pay|u|notifications|link|community|manage|admin|terms|privacy|report|login|intro|phone)(\/|$)|^\/$/.test(
    pathname
  )
    ? 'dugout'
    : 'sinker';
}

/**
 * 싱커(선수 기록)를 쓰는 사람인가(2026-10-21 개편 3단계) — 선수는 늘, 덕아웃 회원(MEMBER)은 첫 레슨 기록 뒤(User.sinkerStartedAt), 팀 · 레슨장은 아니다.
 * 위 막대의 '내 싱커' · 덕아웃 홈의 요약 줄 · 내 것의 단추가 이것을 본다.
 */
export function usesSinker(u: {
  accountType: string;
  sinkerStartedAt: Date | null;
}): boolean {
  if (u.accountType === 'PLAYER') return true;
  if (u.accountType === 'MEMBER') return u.sinkerStartedAt != null;
  return false;
}
