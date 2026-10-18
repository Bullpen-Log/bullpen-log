/**
 * 고객센터 화면이 함께 쓰는 날짜 글 — 서버(Vercel)는 UTC 로 돈다. 시간대를 안 주면 한국 0~9시에 쓴 글이 전날로,
 * 시각은 9시간 이르게 찍힌다.
 */
const DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DATE_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** 2026. 10. 17. */
export function formatSupportDate(date: Date) {
  return DATE.format(date);
}

/** 2026. 10. 17. 14:05 */
export function formatSupportDateTime(date: Date) {
  return DATE_TIME.format(date);
}
