/**
 * 팝업(날짜 화면)이 뜨기 전에 보고 있던 화면의 경로 — 예: '/today', '/videos'.
 *
 * 투구 기록 팝업(app/(app)/@modal)은 지금 화면 위에 뜬다. 팝업 안의 '홈 달력' ·
 * '투구 기록' 단추 가운데 원래 있던 화면 쪽은 새로 옮겨 가지 않고 팝업만 닫아야 한다 —
 * 그래야 보던 달 · 고른 날 · 굴린 자리가 그대로 남는다. 그 화면이 어디였는지를 틀
 * (components/app-shell.tsx 의 AppNav)이 화면이 바뀔 때마다 여기 적는다.
 *
 * 서버에서는 쓰지 않는다(클라이언트에서만 읽고 쓴다).
 */
let lastPage: string | null = null;

/** 팝업 주소(/pitch-log/…)가 아닌 화면에 들어설 때마다 부른다 */
export function rememberPage(pathname: string) {
  if (!pathname.startsWith('/pitch-log')) lastPage = pathname;
}

export function pageBeforePopup(): string | null {
  return lastPage;
}
