import type { PostCategory } from '@/lib/community';

/**
 * 커뮤니티 화면이 같이 쓰는 글자 다듬기 — 때 · 구분 색. 서버 컴포넌트에서 부른다. 글 시각은 DB 의 실제 시각이라 실제 '지금'과 견준다(appNow 아님).
 */

/* 서버(Vercel)는 UTC 로 돈다 — 시간대를 안 주면 한국 0~9시에 쓴 글이 전날로 찍힌다 */
const dateOnly = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dateTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (date: Date) => dateOnly.format(date);
export const formatDateTime = (date: Date) => dateTime.format(date);

/** 목록의 짧은 때 — 방금 · N분 전 · N시간 전 · N일 전, 한 주 넘으면 날짜 */
export function relativeTime(date: Date, now: Date = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return formatDate(date);
}

/**
 * 게시판마다 다른 색 — 목록에서 질문 · 번개 · 팀 글이 한눈에 갈리게. 앱의 상태색 토큰만 쓴다(원색 클래스는 흰 바탕에서 안 읽힌다).
 */
export const CATEGORY_BADGE: Record<PostCategory, string> = {
  free: '',
  question: 'border-sky-soft/60 bg-sky-tint text-sky-strong desk:bg-transparent',
  meetup: 'border-warn-line bg-warn-bg text-warn desk:bg-transparent',
  team: 'border-ok/40 bg-ok/10 text-ok desk:bg-transparent',
};

export const categoryBadgeClass = (category: string) =>
  CATEGORY_BADGE[category as PostCategory] ?? '';
