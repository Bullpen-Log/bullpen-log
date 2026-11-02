import type { InboxItem } from '@/lib/notification-inbox';
import { KIND_LABEL, type NotifyKind } from '@/lib/notify-rules';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
const ICONS = {
  chat: 'chat',
  listing: 'market',
  booking: 'lesson',
  venue: 'venue',
  community: 'chat',
  lesson: 'clipboard-list',
  team: 'people',
  record: 'log',
  coach: 'clipboard-list',
} as const;
export const inboxKind = (kind: string) =>
  Object.hasOwn(KIND_LABEL, kind) ? KIND_LABEL[kind as NotifyKind] : '알림';
export const inboxIcon = (kind: string) =>
  Object.hasOwn(ICONS, kind) ? ICONS[kind as NotifyKind] : 'bell';
export function inboxDay(at: string, now: number) {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return '날짜 확인 필요';
  const key = toDateKey(d),
    today = toDateKey(new Date(now));
  return key === today
    ? '오늘'
    : key === shiftDateKey(today, -1)
      ? '어제'
      : `${key.slice(0, 4) !== today.slice(0, 4) ? `${d.getFullYear()}년 ` : ''}${d.getMonth() + 1}월 ${d.getDate()}일`;
}
export function inboxTime(at: string, now: number) {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return '';
  const seconds = Math.max(0, (now - d.getTime()) / 1000);
  if (seconds < 60) return '방금';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400 && toDateKey(d) === toDateKey(new Date(now)))
    return `${Math.floor(seconds / 3600)}시간 전`;
  return `${d.getHours() < 12 ? '오전' : '오후'} ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function inboxSections(items: InboxItem[], now: number) {
  const sections: { title: string; data: InboxItem[] }[] = [];
  for (const n of items) {
    const title = inboxDay(n.at, now),
      last = sections.at(-1);
    if (last?.title === title) last.data.push(n);
    else sections.push({ title, data: [n] });
  }
  return sections;
}
export function safeInboxPath(link: string, origin: string): string | null {
  if (!link || /[\\\u0000-\u0020\u007f]/.test(link) || link.startsWith('//'))
    return null;
  try {
    const base = new URL(origin),
      url = new URL(link, base);
    return url.origin === base.origin &&
      ['http:', 'https:'].includes(url.protocol) &&
      (link.startsWith('/') || /^https?:\/\//.test(link))
      ? url.pathname + url.search + url.hash
      : null;
  } catch {
    return null;
  }
}
