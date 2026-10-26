/**
 * 지금 화면이 '앱'(스마트폰 네이티브 껍데기) 안에서 열렸는지 가린다.
 *
 * 구속 측정처럼 폰 카메라의 고속 촬영(120~240fps)이 있어야 제대로 도는 기능은 웹에서는
 * 열지 않는다. 브라우저의 getUserMedia 는 대개 30~60fps 까지만 주어서, 웹에서 잰 숫자는
 * 앱에서 잰 숫자와 다르다. 틀린 숫자가 기록에 섞이는 것보다 안 보이는 편이 낫다.
 *
 * 앱 껍데기(Capacitor 등)는 브라우저 이름표(User-Agent)에 아래 표시를 덧붙인다 —
 * Capacitor 라면 capacitor.config 의 `appendUserAgent: 'BullpenLogApp/1.0'`.
 * 서버는 요청 머리에서, 화면은 navigator.userAgent 에서 같은 표시를 본다.
 *
 * 관리자는 웹에서도 연다(사용자 요청) — 스피드건과 견주며 보정하는 일을 PC 에서도 해야
 * 해서다. 그 판단은 이 파일이 아니라 부르는 쪽(app/(session)/velocity/page.tsx)이 한다.
 */

/** 앱 껍데기가 User-Agent 에 덧붙이는 표시 */
export const NATIVE_UA_MARK = 'BullpenLogApp';

/**
 * 새 아이폰 앱(Expo, native/ — 'BullpenLogApp/2.0 BullpenNative/1', native/src/lib/site.ts APP_UA)의 표시. 네이티브로 옮긴 화면(구속 측정)은
 * 사이트 안에서 눌러도 앱 화면으로 넘긴다 — 사이트 안 이동은 페이지를 새로 안 불러 앱이 주소로 가로채지 못한다(2026-10-18).
 */
export const EXPO_UA_MARK = 'BullpenNative/';

/** 덕아웃 앱(선수가 아닌 사람의 앱, docs/designs/sinker-dugout.md 7절 — 아직 없다)이 달 표시 */
export const DUGOUT_UA_MARK = 'DugoutApp/';

/** 지금 요청이 어느 얼굴에서 왔나 — 싱커 앱(지금 '불펜로그' 앱 · 옛 Capacitor 껍데기 포함) · 덕아웃 앱 · 브라우저 */
export type Surface = 'sinker-app' | 'dugout-app' | 'web';
export function surfaceOf(userAgent: string | null | undefined): Surface {
  if (!userAgent) return 'web';
  if (userAgent.includes(DUGOUT_UA_MARK)) return 'dugout-app';
  if (userAgent.includes(NATIVE_UA_MARK)) return 'sinker-app';
  return 'web';
}

/**
 * 휴대폰 브라우저(앱 밖)인가 — 2026-10-20 김민: "데스크탑 · 맥 · PC 에서만 웹으로, 휴대폰은 앱만". proxy.ts 가 휴대폰 브라우저를
 * '앱으로 써 주세요' 화면(/phone)으로 돌린다. 아이패드 사파리는 맥 이름표를 달고 와서 여기 안 걸린다(태블릿은 막지 않음).
 */
export function isPhoneBrowser(userAgent: string | null | undefined): boolean {
  return (
    !!userAgent &&
    /iPhone|iPod|Android.+Mobile|Windows Phone/i.test(userAgent) &&
    !userAgent.includes(NATIVE_UA_MARK)
  );
}

export function isExpoUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && userAgent.includes(EXPO_UA_MARK);
}

/**
 * 새 앱이 아는 앱 화면의 판(BullpenNative/<n>) — 사이트가 앱 화면으로 넘기기 전에 그 판이 그 화면을 아는지 본다. 사이트는 바로 배포되고
 * 앱은 폰에 깔린 판이 늦게 바뀌어서, 모르는 판에 넘기면 화면이 사라진다. 판: 1 구속 측정 · 투구 그날, 2 운동 진행(/workout),
 * 3 암케어 따라 하기(/armcare/<id>), 4 메카닉 따라 하기(/mechanics), 5 분석(/analysis), 6 커뮤니티 · 고객센터(/community · /support),
 * 7 라이브러리(/library/training · /library/mechanics) · 자료실(/board), 8 관리자(/admin) · 3D 동작 분석 결과(/lab/<id>) · 계정(로그인 · /account),
 * 9 3D 동작 분석 목록 · 촬영 안내(/lab · /lab/guide) · 촬영 관리자(/admin/shoot · /admin/shoot/<주>) ·
 *   구속 측정 관리자 휴대폰 화면(/admin/velocity · /<날짜> · /upload).
 * 10 카메라 모드 주소(/velocity?mode=speed · ?mode=abs — 모드 고르기를 건너뛰고 그 모드로).
 */
export function expoLevel(userAgent: string | null | undefined): number {
  const m = userAgent ? /BullpenNative\/(\d+)/.exec(userAgent) : null;
  return m ? Number(m[1]) : 0;
}

/** 서버 — 요청 머리의 User-Agent 로 판단한다 */
export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && userAgent.includes(NATIVE_UA_MARK);
}

/**
 * 화면(브라우저) — 앱 껍데기 안인가.
 *
 * Capacitor 는 window.Capacitor 를 심어 주므로 그것도 본다. 표시가 하나도 없으면 웹이다.
 */
export function isNativeClient(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (
    window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  return isNativeUserAgent(navigator.userAgent);
}
