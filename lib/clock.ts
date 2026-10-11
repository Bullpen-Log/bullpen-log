/**
 * '지금' — 시뮬레이션 계정(User.simDate, 시험용)이면 그 날짜의 같은 시각, 아니면 실제 시각.
 * 서버는 lib/clock-server.ts 가 요청마다 로그인 계정을 보고 고른다(그 파일이 아래 hook 을 단다).
 * 화면은 뿌리 레이아웃이 그 계정일 때만 브라우저의 Date 를 통째로 옮겨 두므로, 여기서는 Date.now() 그대로다.
 * 로그인 쿠키 기한 · 저장소 서명 주소처럼 실제 시각이어야 하는 것은 이것을 쓰지 않는다.
 */
const g = globalThis as { __bpNow?: () => number };

export const appNowMs = (): number => (typeof window === 'undefined' && g.__bpNow ? g.__bpNow() : Date.now());
export const appNow = (): Date => new Date(appNowMs());
