/**
 * 구속 측정 관리자 화면들이 같이 쓰는 글자 만들기 — 종합(page.tsx) · 날짜(/[date]) · 공 목록.
 * 서버 · 클라이언트 어느 쪽에서도 부른다(브라우저 API 를 쓰지 않는다).
 */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** '9월 27일 (토)' */
export function dayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const w = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${w})`;
}

/** '+1.2' · '-0.4' · '—' */
export function signed(n: number | null, digits = 1) {
  if (n == null) return '—';
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}

/** '12.3MB' */
export function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)}MB`;
}

/** ISO 시각 → 'HH:MM'(한국 시간) */
export function hhmm(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** 오차 색 — |차| ≤ 2 초록, ≤ 5 노랑, 그 밖 빨강 */
export function errorTone(err: number | null) {
  if (err == null) return 'text-muted';
  const a = Math.abs(err);
  return a <= 2 ? 'text-ok' : a <= 5 ? 'text-warn' : 'text-danger';
}

/** '28일 (일)' — 탐색기의 날짜 폴더 이름 */
export function dayShortLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const w = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${d}일 (${w})`;
}

/** '1차 보정 · 9/28 · v1.4.0' — [보정] 영역의 차수 폴더 이름. 보정일(createdAt)은 한국 시간의 월/일 */
export function calibRunName(run: { pass: number; createdAt: string; engineVersion: string }) {
  const md = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(run.createdAt));
  return `${run.pass}차 보정 · ${md} · v${run.engineVersion}`;
}
