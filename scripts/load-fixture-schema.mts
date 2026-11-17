/** TEST ONLY: reproduce the pre-promotion DB in a new in-memory PGlite fixture.
 * The current generated client is used with explicit global omit to reproduce the
 * old client's default selection. This is not an actual old generated-client run.
 * No service connection or production schema is accepted by this helper.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import type { Prisma } from '@prisma/client';

export async function removeLoadSchemaFromFixture(pg: PGlite): Promise<void> {
  await pg.exec(readFileSync('prisma/pending-migrations/20261116150000_ex_load01_recording_contract/rollback.sql', 'utf8'));
}

/** Erase constructor inference only; runtime omit still excludes both promoted fields. */
export function legacyLoadClientOptions(): Pick<Prisma.PrismaClientOptions, 'omit'> {
  return { omit: { exerciseVideo: { loadSemantics: true }, userExerciseSet: { load: true } } };
}

/** from-empty is offline SQL generation. Only the child config sees this unusable URL;
 * test-process service-URL refusal guards remain intact. No actual DB is queried.
 */
export function fixtureSchemaSql(): string {
  return execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/unused', DIRECT_URL: 'postgresql://fixture:fixture@127.0.0.1:1/unused' },
  });
}

/** Synthetic v2 test prerequisite snapshot, never a production migration.
 * Origin: pre-existing EX-RX01 R2A pending proposal in root checkout,
 * prisma/pending-migrations/20261113120000_workout_v2_foundation/migration.sql.
 * SHA256: 195122e7980dcff46124b50fdc06ec93fb2fce54a770dc56e82f4cb903a8f3d0
 * Inclusion does not certify historical foundation approval or permit activation.
 */
export const V2_FIXTURE_SQL = 'scripts/fixtures/workout-v2-foundation.sql';
