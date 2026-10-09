import type { ItemState } from '@/lib/shoot/progress';

/** 상태 이름 — 촬영 관리자 화면 공통 */
export const STATE_LABEL: Record<ItemState, string> = {
  done: '찍음',
  redo: '다시 찍기',
  later: '미룸',
  todo: '대기',
};

/** 상태 알약 — 색은 하나(sky)만, 다시 찍기는 경고색(사용자 규칙 '한 색 + 고른 것만 강조') */
export const STATE_PILL: Record<ItemState, string> = {
  done: 'bg-sky text-white',
  redo: 'bg-warn/15 text-warn',
  later: 'bg-ink/8 text-muted',
  todo: 'bg-transparent text-muted ring-1 ring-inset ring-line-strong',
};

/** 'M월 D일 HH:mm'(한국 시간) */
const stamp = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
export function stampText(iso: string) {
  return stamp.format(new Date(iso));
}

/** 'HH:mm'(한국 시간) */
const hhmm = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
export function timeText(iso: string) {
  return hhmm.format(new Date(iso));
}

/** '10월 9일 (목)' — 날 키('YYYY-MM-DD') */
export function dayText(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const w = '일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${w})`;
}
