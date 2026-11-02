import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  validRecordDate,
  recordEditable,
  applyRecordSets,
  recordTotals,
  recordNoteMatches,
} from '@/lib/workout/record-model';
import { saveRecordNote } from '@/lib/workout/record-note';
import { saveRecordChecks } from '@/lib/workout/record-checks';
let passed = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
};
for (const d of ['2026-10-30', '2024-02-29']) ok(validRecordDate(d), d);
for (const d of ['2026-02-30', '2026-13-01', 'invalid', '2026-1-01'])
  ok(!validRecordDate(d), 'invalid ' + d);
ok(recordEditable('2026-10-26', '2026-11-02'), '7day inclusive');
ok(!recordEditable('2026-10-25', '2026-11-02'), '8day blocked');
ok(!recordEditable('2026-11-03', '2026-11-02'), 'future blocked');
const ex = {
  id: 'ex1',
  title: '스쿼트',
  category: '하체',
  planned: null,
  done: false,
  setsDone: null,
  repsDone: null,
  holdSecondsDone: null,
  weightKg: null,
  meta: { perHand: false, perSide: false, inMinutes: false },
  method: 'exercise' as const,
};
const sets = [
  { setNo: 1, weightKg: 40, reps: 8, holdSeconds: null, rir: null },
  { setNo: 3, weightKg: 45, reps: 8, holdSeconds: null, rir: null },
  { setNo: 4, weightKg: 50, reps: 6, holdSeconds: null, rir: 2 },
];
const row = applyRecordSets(ex, sets, true, false);
ok(row.done && row.setsDone === 3 && row.weightKg === 50, 'raw sets authoritative');
ok(!row.canToggle, 'raw not checkable');
ok(
  recordTotals([row], true).volumeKg === 980,
  'sum of true set rows, not max times modal reps'
);
ok(recordTotals([row], false).volumeKg === null, 'unknown volume not zero');
ok(applyRecordSets(ex, [], true, false).canToggle, 'check only editable');
ok(!applyRecordSets(ex, [], true, true).canToggle, 'active not checkable');
ok(!applyRecordSets(ex, null, true, false).canToggle, 'unknown not checkable');
ok(!recordNoteMatches(null, { intensity: 5, memo: '' }), 'missing note not saved');
ok(
  recordNoteMatches(
    { intensity: 5, memo: null, version: 'x' },
    { intensity: 5, memo: ' ' }
  ),
  'normalized ack'
);
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
  const a = await db.user.create({
    data: { email: 'a@test.local', nickname: 'A', password: 'test' },
  });
  const b = await db.user.create({
    data: { email: 'b@test.local', nickname: 'B', password: 'test' },
  });
  const date = '2026-10-30',
    today = '2026-11-02',
    now = new Date('2026-11-02T00:00:00Z');
  const save = (intensity: number, memo: string, version: string | null) =>
    saveRecordNote(db, a.id, date, { intensity, memo, version }, today, now);
  for (const n of [0, 11, 1.5])
    ok('error' in (await save(n, '', null)), 'invalid intensity ' + n);
  const first = await save(1, ' original ', null);
  ok('ok' in first, 'create min1');
  if (!('ok' in first)) throw Error('no note');
  await db.dailyTrainingNote.updateMany({
    where: { userId: a.id },
    data: { discomfort: [{ id: 'old', move: 'squat' }] },
  });
  const loaded = await db.dailyTrainingNote.findFirstOrThrow({
    where: { userId: a.id },
  });
  const second = await save(10, '', loaded.updatedAt.toISOString());
  ok('ok' in second, 'save max10');
  if (!('ok' in second)) throw Error('no note');
  ok(second.note.memo === null, 'blank normalized');
  const stored = await db.dailyTrainingNote.findFirstOrThrow({
    where: { userId: a.id },
  });
  ok(
    JSON.stringify(stored.discomfort) ===
      JSON.stringify([{ id: 'old', move: 'squat' }]),
    'coach discomfort preserved'
  );
  ok('error' in (await save(5, 'stale', first.note.version)), 'stale note rejected');
  ok(
    (await db.dailyTrainingNote.findFirstOrThrow({ where: { userId: a.id } }))
      .intensity === 10,
    'stale did not overwrite'
  );
  ok(
    'error' in
      (await saveRecordNote(
        db,
        b.id,
        date,
        { intensity: 5, memo: 'other', version: second.note.version },
        today,
        now
      )),
    'other owner version not accepted'
  );
  ok(
    (await db.dailyTrainingNote.count({ where: { userId: b.id } })) === 0,
    'other owner remains empty'
  );
  ok(
    'error' in
      (await saveRecordNote(
        db,
        a.id,
        '2026-10-20',
        { intensity: 5, memo: 'old', version: null },
        today,
        now
      )),
    'old date blocked'
  );
  const exercise = await db.exerciseVideo.create({
    data: {
      title: '운동',
      category: '하체',
      description: '',
      equipment: [],
      bodyParts: [],
    },
  });
  const at = new Date(date + 'T00:00:00Z'),
    allowed = new Set([exercise.id]);
  const checks = (before: boolean, done: boolean) =>
    saveRecordChecks(
      db,
      a.id,
      date,
      [{ exerciseId: exercise.id, before, done }],
      allowed,
      today
    );
  ok('ok' in (await checks(false, true)), 'mark check-only');
  ok('error' in (await checks(false, true)), 'stale checkbox rejected');
  ok('ok' in (await checks(true, false)), 'explicit uncheck');
  ok(
    (await db.userExerciseLog.count({ where: { userId: a.id } })) === 0,
    'check removed'
  );
  ok(
    'error' in
      (await saveRecordChecks(
        db,
        a.id,
        date,
        [{ exerciseId: 'not-in-plan', before: false, done: true }],
        allowed,
        today
      )),
    'unlisted exercise blocked'
  );
  const session = await db.trainingSession.create({
    data: {
      userId: a.id,
      date: at,
      themeKey: 'lower',
      plan: {},
      warmupDoneIds: [],
      status: 'ACTIVE',
    },
  });
  ok('error' in (await checks(false, true)), 'active protected');
  await db.trainingSession.update({
    where: { id: session.id },
    data: { status: 'FINISHED' },
  });
  await db.userExerciseSet.create({
    data: {
      sessionId: session.id,
      userId: a.id,
      date: at,
      exerciseId: exercise.id,
      setNo: 1,
      weightKg: 50,
      reps: 6,
    },
  });
  ok('error' in (await checks(false, true)), 'raw set protected');
  ok(
    (await db.userExerciseSet.count({ where: { userId: a.id } })) === 1,
    'raw set preserved'
  );
  console.log(`workout-record: ${passed}개 통과 (격리 Prisma/PGlite 포함)`);
} finally {
  await db.$disconnect();
  await socket.stop();
  await pg.close();
}
