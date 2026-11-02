import type { Prisma, PrismaClient } from '@prisma/client';
import {
  INBOX_PAGE_SIZE,
  inboxPageRequest,
  inboxRead,
  type InboxPage,
  type InboxResult,
  type InboxVerification,
} from '@/lib/notification-inbox';
const BAD = { ok: false as const, error: '알림 정보를 다시 확인해주세요.' };

/** Strict millisecond boundary on the database clock also excludes same-ms arrivals after the snapshot. */
async function dbNow(db: PrismaClient) {
  const [row] = await db.$queryRaw<
    { now: Date }[]
  >`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
  return row.now;
}
export async function readInboxPage(
  db: PrismaClient,
  userId: string,
  raw: unknown
): Promise<({ ok: true } & InboxPage) | { ok: false; error: string }> {
  const input = inboxPageRequest(raw);
  if (!input) return BAD;
  const now = await dbNow(db),
    before = input.before ? new Date(input.before) : now;
  if (before > now) return BAD;
  const cursor = input.cursor;
  const rows = await db.notification.findMany({
    where: {
      userId,
      createdAt: { lt: before },
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.at) } },
              { createdAt: new Date(cursor.at), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: INBOX_PAGE_SIZE + 1,
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      link: true,
      readAt: true,
      createdAt: true,
    },
  });
  const shown = rows.slice(0, INBOX_PAGE_SIZE),
    last = shown.at(-1);
  return {
    ok: true,
    items: shown.map(({ createdAt, readAt, ...n }) => ({
      ...n,
      at: createdAt.toISOString(),
      read: !!readAt,
    })),
    unread: await db.notification.count({ where: { userId, readAt: null } }),
    before: before.toISOString(),
    next:
      rows.length > INBOX_PAGE_SIZE && last
        ? { at: last.createdAt.toISOString(), id: last.id }
        : null,
  };
}
async function readWhere(
  db: PrismaClient,
  userId: string,
  raw: unknown
): Promise<Prisma.NotificationWhereInput | null> {
  const command = inboxRead(raw);
  if (!command) return null;
  if (command.scope === 'one') return { userId, id: command.id, readAt: null };
  const now = await dbNow(db);
  if (new Date(command.before) > now) return null;
  return { userId, createdAt: { lt: new Date(command.before) }, readAt: null };
}
export async function writeInboxRead(
  db: PrismaClient,
  userId: string,
  raw: unknown
): Promise<InboxResult> {
  const where = await readWhere(db, userId, raw);
  if (!where) return BAD;
  await db.notification.updateMany({ where, data: { readAt: new Date() } });
  return {
    ok: true,
    unread: await db.notification.count({ where: { userId, readAt: null } }),
  };
}
/** Verification only reads; a lost acknowledgment never causes an implicit second write. */
export async function verifyInboxRead(
  db: PrismaClient,
  userId: string,
  raw: unknown
): Promise<InboxVerification> {
  const where = await readWhere(db, userId, raw);
  if (!where) return BAD;
  const left = await db.notification.count({ where });
  return {
    ok: true,
    state: left ? 'not-applied' : 'applied',
    unread: await db.notification.count({ where: { userId, readAt: null } }),
  };
}
