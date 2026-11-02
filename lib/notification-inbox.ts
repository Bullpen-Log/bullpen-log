export type InboxItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  at: string;
};
export type InboxCursor = { at: string; id: string };
export type InboxPage = {
  items: InboxItem[];
  unread: number;
  before: string;
  next: InboxCursor | null;
};
export type InboxRead = { scope: 'one'; id: string } | { scope: 'all'; before: string };
export type InboxResult = { ok: true; unread: number } | { ok: false; error: string };
export type InboxVerification =
  | { ok: true; state: 'applied' | 'not-applied'; unread: number }
  | { ok: false; error: string };
export const INBOX_PAGE_SIZE = 20;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v);
export const inboxDate = (v: unknown): v is string =>
  typeof v === 'string' &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
export function inboxRead(raw: unknown): InboxRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.scope === 'one' && uuid(r.id)) return { scope: 'one', id: r.id };
  return r.scope === 'all' && inboxDate(r.before)
    ? { scope: 'all', before: r.before }
    : null;
}
export function inboxPageRequest(
  raw: unknown
): { before: string | null; cursor: InboxCursor | null } | null {
  if (raw == null) return { before: null, cursor: null };
  if (typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!inboxDate(r.before) || !r.cursor || typeof r.cursor !== 'object') return null;
  const c = r.cursor as Record<string, unknown>;
  return inboxDate(c.at) && uuid(c.id) && c.at < r.before
    ? { before: r.before, cursor: { at: c.at, id: c.id } }
    : null;
}
export const inboxReadIncludes = (command: InboxRead, item: InboxItem) =>
  command.scope === 'one' ? item.id === command.id : item.at < command.before;
