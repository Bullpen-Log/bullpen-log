import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { calendarRange, calendarReadRange, isCalendarDate } from '@/lib/calendar-month';
import { readCalendarEvents } from '@/lib/calendar-load';
import { rpcAccessOf } from '@/lib/release-ops';
import { createCalendarCache } from '../native/src/calendar/cache.ts';
import type { RecordItem } from '@/lib/records/day-records';
import type { CalendarEventView } from '@/lib/calendar-event';
let count = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  count++;
};
ok(
  rpcAccessOf('app.loadAppCalendarEvents').cap === 'calendar',
  'month read retains calendar release policy'
);
for (const d of ['2026-11-02', '2024-02-29']) ok(isCalendarDate(d), 'real date ' + d);
for (const d of ['2026-02-29', '2026-02-30', '2026-1-01', '2026-13-01', null, []])
  ok(!isCalendarDate(d), 'invalid date ' + String(d));
const range = calendarRange('2026-11')!;
ok(
  range.days.length === 42 && range.from === '2026-10-26' && range.to === '2026-12-06',
  'fixed 6 weeks, Monday start'
);
ok(calendarRange('2024-02')!.days.includes('2024-02-29'), 'leap day selectable');
ok(
  calendarRange('2026-13') === null && calendarRange('2026-1') === null,
  'invalid month rejected'
);
ok(calendarReadRange(range.from, range.to), 'grid range accepted');
ok(!calendarReadRange('2026-02-30', '2026-03-02'), 'normalised invalid date rejected');
ok(
  !calendarReadRange('2026-11-02', '2026-11-01') &&
    !calendarReadRange('2026-01-01', '2026-12-31'),
  'reversed and unbounded reads rejected'
);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const row: RecordItem = {
  kind: 'checkin',
  id: 'c',
  date: '2026-11-02',
  at: null,
  condition: 7,
  sleepQuality: 3,
  note: null,
};
const event: CalendarEventView = {
  id: 'e',
  date: '2026-11-02',
  title: '연습',
  time: '17:00',
  memo: null,
  remindMin: null,
};
let epoch = 0,
  write = 0,
  reads = 0,
  failEvents = false,
  failRecords = false;
const cache = createCalendarCache({
  epoch: () => epoch,
  write: () => write,
  recalled: () => null,
  records: async () => {
    reads++;
    if (failRecords) throw Error('record fail');
    return [row];
  },
  events: async () => {
    if (failEvents) throw Error('event fail');
    return [event];
  },
  error: (_e, s) => s + ' failed',
});
await cache.load('2026-11');
ok(
  cache.snapshot('2026-11').records?.[0].kind === 'checkin',
  'checkin-only records retained'
);
ok(cache.snapshot('2026-11').events?.length === 1, 'events independent');
await cache.load('2026-11');
ok(reads === 1, 'fresh month deduped');
failEvents = true;
await cache.load('2026-11', true);
ok(
  cache.snapshot('2026-11').events?.length === 1 &&
    !!cache.snapshot('2026-11').eventError,
  'refresh failure retains previous events'
);
ok(
  !cache.snapshot('2026-11').recordError &&
    cache.snapshot('2026-11').records?.length === 1,
  'event failure does not discard records'
);
failRecords = true;
await cache.load('2026-12');
ok(
  cache.snapshot('2026-12').events === null &&
    cache.snapshot('2026-12').records === null,
  'failure is not false empty'
);
ok(
  !!cache.snapshot('2026-12').recordError &&
    !!cache.snapshot('2026-12').eventError &&
    !cache.snapshot('2026-12').refreshing,
  'both failures settle'
);
failRecords = false;
failEvents = false;
await cache.load('2026-12', true);
ok(
  cache.snapshot('2026-12').recordError === null &&
    cache.snapshot('2026-12').eventError === null,
  'retry recovers'
);
epoch++;
ok(
  cache.snapshot('2026-11').records === null &&
    cache.snapshot('2026-11').events === null,
  'account change masks old data before effects'
);
const old = deferred<RecordItem[]>(),
  next = deferred<RecordItem[]>();
let sequence = 0;
const racing = createCalendarCache({
  epoch: () => epoch,
  write: () => write,
  recalled: () => null,
  records: () => (++sequence === 1 ? old.promise : next.promise),
  events: async () => [],
  error: () => 'failed',
});
const first = racing.load('2026-11');
await Promise.resolve();
write++;
const second = racing.load('2026-11', true);
await Promise.resolve();
next.resolve([{ ...row, id: 'new' }]);
await second;
old.resolve([{ ...row, id: 'old' }]);
await first;
ok(
  racing.snapshot('2026-11').records?.[0].id === 'new',
  'late pre-write response cannot overwrite newer response'
);
const accountRead = deferred<RecordItem[]>();
let accountReads = 0;
const accounts = createCalendarCache({
  epoch: () => epoch,
  write: () => write,
  recalled: () => null,
  records: () =>
    ++accountReads === 1
      ? accountRead.promise
      : Promise.resolve([{ ...row, id: 'new-account' }]),
  events: async () => [],
  error: () => 'failed',
});
const preLogout = accounts.load('2026-11');
await Promise.resolve();
epoch++;
accountRead.resolve([row]);
await preLogout;
ok(accounts.snapshot('2026-11').records === null, 'late logged-out response discarded');
await accounts.load('2026-11');
ok(
  accounts.snapshot('2026-11').records?.[0].id === 'new-account',
  'new account can load its own month after old reply'
);
let reusedRead = 0;
const reused = createCalendarCache({
  epoch: () => epoch,
  write: () => write,
  recalled: () => [row],
  records: async () => {
    reusedRead++;
    return [];
  },
  events: async () => [],
  error: () => 'failed',
});
await reused.load('2026-11');
ok(
  reusedRead === 0 && reused.snapshot('2026-11').records?.length === 1,
  'complete current records window reused'
);
await reused.load('2026-11', true);
ok(reusedRead === 1, 'explicit refresh bypasses recalled records');
const nov = deferred<RecordItem[]>(),
  dec = deferred<RecordItem[]>();
const months = createCalendarCache({
  epoch: () => epoch,
  write: () => write,
  recalled: () => null,
  records: (from) => (from === '2026-10-26' ? nov.promise : dec.promise),
  events: async () => [],
  error: () => 'failed',
});
const n = months.load('2026-11'),
  d = months.load('2026-12');
await Promise.resolve();
dec.resolve([{ ...row, id: 'dec' }]);
await d;
nov.resolve([{ ...row, id: 'nov' }]);
await n;
ok(
  months.snapshot('2026-11').records?.[0].id === 'nov' &&
    months.snapshot('2026-12').records?.[0].id === 'dec',
  'rapid month reads isolated'
);

// Isolated ephemeral DB only: no env-file, no connection to the shared service.
const pg = await PGlite.create();
await pg.exec(
  execSync(
    'npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  )
);
const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await socket.start();
const port = (
  socket as unknown as { server: { address(): { port: number } } }
).server.address().port;
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    max: 1,
  }),
});
try {
  const user = await db.user.create({
    data: { email: 'calendar@test.local', nickname: '사용자', password: 'test' },
  });
  const other = await db.user.create({
    data: { email: 'other@test.local', nickname: '다른 사용자', password: 'test' },
  });
  const admin = await db.user.create({
    data: {
      email: 'admin@test.local',
      nickname: '관리자',
      password: 'test',
      role: 'ADMIN',
    },
  });
  const admin2 = await db.user.create({
    data: {
      email: 'admin2@test.local',
      nickname: '관리자2',
      password: 'test',
      role: 'ADMIN',
    },
  });
  const date = new Date('2026-11-02T00:00:00Z');
  await db.calendarEvent.createMany({
    data: [
      { userId: user.id, date, title: '시간 있음', time: '18:00' },
      { userId: user.id, date, title: '종일', time: null },
      { userId: other.id, date, title: '비공개' },
      { userId: admin.id, date, title: '내 관리자 일정' },
      { userId: admin2.id, date, title: '다른 관리자 일정' },
    ],
  });
  const mine = await readCalendarEvents(db, user, '2026-11-01', '2026-11-30');
  ok(
    mine.length === 2 && !mine.some((e) => e.title === '비공개'),
    'normal user sees only own events'
  );
  ok(
    mine[0].title === '종일' && mine[1].time === '18:00',
    'all-day first, then chronological'
  );
  ok(
    mine.every((e) => e.owner === undefined),
    'own events editable'
  );
  const admins = await readCalendarEvents(db, admin, '2026-11-01', '2026-11-30');
  ok(
    admins.length === 2 && !admins.some((e) => e.title === '비공개'),
    'admin visibility remains admin-only, no member data leak'
  );
  ok(
    admins.find((e) => e.title === '다른 관리자 일정')?.owner === '관리자2' &&
      admins.find((e) => e.title === '내 관리자 일정')?.owner === undefined,
    'owner/read-only marker retained'
  );
  ok(
    (await readCalendarEvents(db, user, '2026-12-01', '2026-12-31')).length === 0,
    'bounded month read'
  );
  await db.calendarEvent.createMany({
    data: Array.from({ length: 3002 }, (_, i) => ({
      userId: user.id,
      date: new Date('2020-01-01T00:00:00Z'),
      title: '과거 ' + i,
    })),
  });
  ok(
    (await readCalendarEvents(db, user, '2026-11-01', '2026-11-30')).length === 2,
    '3000 old events cannot hide later month'
  );
  ok(
    (await db.calendarEvent.count({ where: { userId: user.id } })) === 3004,
    'calendar reads never alter events'
  );
} finally {
  await db.$disconnect();
  await socket.stop();
  await pg.close();
}
console.log(
  `native-calendar: ${count} checks passed (isolated Prisma/PGlite included)`
);
