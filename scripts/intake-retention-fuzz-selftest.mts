/**
 * 외부 접수 보유 삭제 무작위 시험 — 지울 날을 따로 셈하는 모델을 옆에 두고, 접수 · 철회 · 고침 · 다시 내기 · 공개 · 내리기 · 분석 · 전송 중 교체 ·
 * 깨진 파일 · 전송 이어 가기 · 시간 흐름 · 크론 · 저장소 실패 · 분석 서버 무응답 · 일꾼 죽음을 씨앗대로 섞는다. 저장소가 지우는 순간마다, 단계마다, 끝에 불변식을 본다.
 * 끼어들기는 저장소 호출과 트랜잭션을 열기 직전에 넣는다 — 읽고 나서 잠그기 전의 틈까지 본다.
 * `npm run intake:retention-fuzz`
 *
 * 운영 DB 에 닿지 않는다. 메모리 안 PostgreSQL(PGlite)에 마이그레이션 SQL 을 그대로 깔고, 저장소 · 분석 서버는 가짜다.
 *
 * 씨앗 하나 다시 돌리기:   FUZZ_SEED=123 V=1 npm run -s intake:retention-fuzz — 앱이 고르는 번호까지 씨앗을 따라서 같은 길을 탄다
 * 더 오래 돌리기:          FUZZ_MS=300000 FUZZ_FROM=10000 npm run -s intake:retention-fuzz
 * 그 밖의 값:              FUZZ_JOBS(프로세스 수) · FUZZ_STEPS(씨앗 하나의 단계 수) · FUZZ_GAP(끼어들 비율, 0~1)
 *
 * ── 불변식 ──────────────────────────────
 * 지우는 순간(저장소 remove 를 부를 때)
 *   - 판에 오른 원본은 'purging' 표시가 있어야 지운다. 표시를 처음 볼 때 모델의 지울 날이 지났고 기다릴 까닭이 없어야 하며, 시작 기록의 날이 모델과 같아야 한다.
 *   - 분석이 읽고 있는 원본은 지우지 않는다.
 *   - 판 밖 파일은 'replaced' · 'abandoned' 만 지운다. 철회한 접수는 철회 7일 뒤, 그 밖은 내려온 지 26시간 뒤다.
 *   - 미리보기는 입력 원본이 지워질 때만 지운다. 분석 결과 JSON 은 지우지 않는다.
 * 단계마다
 *   - 'purged' 인 자산의 바이트는 없다. 판에 오른 자산의 바이트가 없으면 'purging' · 'purged' 다.
 *   - 'purging' 은 'purged' 로만 간다. 'purged' 는 움직이지 않는다. 'purging' 은 판에 오른 자산뿐이다.
 *   - 감사 기록의 시작 · 끝 · 임시 파일 수가 자산 상태와 맞는다.
 *   - 앱의 지울 날이 모델의 지울 날과 같다.
 *   - 끝낸 접수에 판 밖 파일이 칸에 남지 않는다. 칸은 내려온 파일을 가리키지 않는다. 지운 칸은 고침 요청에 들어 있다.
 *   - 한 접수에 도는 삭제 일감은 하나다. 분석 결과 JSON 은 남는다.
 *   - 파일은 올리기 기간이 끝나고 여유가 지난 뒤에만 버린다. 기간을 늘린 뒤에는 안 버린다.
 * 시나리오 끝에
 *   - 고침 기다림은 지울 날 + 14일에 끝난다. 저장소를 고치면 표시한 파일은 날짜가 밀려도 28시간 안에 다 지운다.
 * 끝에(저장소를 고치고 크론을 충분히 돌린 뒤)
 *   - 'purging' 이 안 남는다. 지울 날이 지난 판 자산은 모두 'purged' 다. 판 밖 파일도 모두 'purged' 다. 도는 삭제 일감이 없다.
 *   - 저장소에는 분석 결과 JSON 만 남는다. 상세에 삭제 일감의 경고가 안 남는다. 끝 기록은 지운 미리보기를 빠뜨리지 않는다. 공개 결과는 원본 없이 열린다.
 *
 * ── 일부러 안 보는 것 ──────────────────────────────
 * - 판 밖 파일은 바이트를 지운 뒤 상태를 적기 전에 끊기면 잠깐 'replaced' 로 남는다. 표시 단계가 없는 길이라서다(lib/intake/service.ts cleanupStaleUploads 머리글). 끝에는 'purged' 여야 한다.
 * - 정리가 지우기 직전에 접수를 다시 본 뒤 저장소를 부르는 사이의 철회는 못 잡는다. 철회 앞에 정한 지우기로 친다. 이 시험의 틈은 remove 안쪽이라 그 파일의 검사 뒤에 온다.
 * - 끝 기록의 previewPaths 는 지우라고 부른 경로 수다. 없던 파일도 세고 자산이 나뉘어 끝나면 또 세서, 실제로 지운 수보다 크거나 같으면 된다.
 * - 삭제 일감이 마지막 시도에서 임대가 끝나면 줄은 'failed' 로 남는다. 상세가 안 보일 뿐 줄을 닫지는 않는다. 다음 삭제가 끝날 때 닫힌다.
 * - 닫힌 실행의 미리보기가 삭제 뒤에 늦게 올라오면 남는다(문서에 적힌 위험). 그 파일은 따로 세어 끝 검사에서 뺀다.
 * - 크론 안에서 삭제가 검증보다 먼저 돌아서, 멈춘 검증이 다시 걸린 크론의 삭제는 '검증 중'으로 미뤄진다. 몇 시간 간격으로만 돌리면 이 차례가 되풀이되어 표시가 늦어 보인다. 실제 5분 간격에서는 15분 안에 풀려 기다림 끝을 따로 안 본다.
 * - 잠금 밖에서 주소를 내는 사이에 표시가 걸리면 주소는 그대로 나간다(lib/intake/admin.ts). 그 틈이 든 동작은 뒤 검사를 건너뛴다.
 * - PGlite 는 연결이 하나라 두 일꾼의 겹침은 await 자리에서만 일어난다. 진짜 저장소 · 진짜 크론에 대해서는 이 시험으로 말할 수 없다.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import nodeCrypto, { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { availableParallelism } from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type IntakeAsset } from '@prisma/client';
import { openIntakeScope, type IntakeScope } from '@/lib/intake/access';
import { adminRequeueVerification, adminRevokeInvitation, issueOriginalLinks, issueRunPreviewLink, loadIntakeDetail, loadIntakeList, parseIntakeFilters } from '@/lib/intake/admin';
import { analysisReadiness, listRuns, setAnalysisHand, startIntakeAnalysis, type IntakeGpu, type IntakeRuntime } from '@/lib/intake/analysis';
import { acknowledgeRunReview, loadRunReview } from '@/lib/intake/review';
import { consentDocOf, type ConsentAnswer } from '@/lib/intake/consent';
import { IntakeError } from '@/lib/intake/errors';
import { intakeJobHandlers, runIntakeCron } from '@/lib/intake/job-handlers';
import { leaseJobs, runDueJobs } from '@/lib/intake/jobs';
import { seoulDateKey } from '@/lib/intake/paths';
import { loadPublicResult, publishRun, unpublish } from '@/lib/intake/publication';
import { purgeSubmissionOriginals } from '@/lib/intake/purge';
import { originalRetention } from '@/lib/intake/retention';
import {
  cancelCorrection,
  cleanupStaleUploads,
  confirmUpload,
  createInvitation,
  extendUploadWindow,
  finalizeSubmission,
  issueUploadToken,
  loadPublicState,
  recordConsents,
  registerUploadUrl,
  requestCorrection,
  reserveAsset,
  saveDraft,
  withdrawConsent,
  withdrawRequiredConsent,
} from '@/lib/intake/service';
import { assetGone, assetInTransit, readCorrection, type CorrectableField, type IntakeView } from '@/lib/intake/state';
import type { IntakeRunStorage } from '@/lib/intake/storage-core';
import { fitPitch3dV2 } from '@/lib/pitch-3d/v2/fit';
import type { GpuStatus, Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import type { GpuJobRequest } from '@/lib/pitch-3d/v2/gpu-client';
import { mov120, mov240 } from './intake-fixtures.mts';
import { base, cameras, EV } from './pitch-lab/synth.mts';
import { makeV2Track } from './pitch-lab/synth-v2.mts';

/*
 * 시험 시계 — 일꾼 처리기(verifyAsset · cleanupStaleUploads)는 시각 인자 없이 도는 길이 있어서 전역 시계를 바꾼다.
 * 시간은 단계 사이에서만 움직이고, 시간 예산은 실제 시계로 잰다.
 */
const realNow = Date.now.bind(Date);
const RealDate = Date;
const T0 = RealDate.parse('2026-11-06T03:00:00Z');
let nowMs = T0;
globalThis.Date = class SimDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(nowMs);
    else super(...(args as [string]));
  }
  static override now() {
    return nowMs;
  }
  static [Symbol.hasInstance](x: unknown) {
    return x instanceof RealDate;
  }
} as unknown as DateConstructor;

/*
 * 씨앗 하나가 언제 돌아도 같게 — 앱이 고르는 번호 · 토큰도 씨앗을 따른다. 안 그러면 번호 차례에 따라 다른 길을 타서, 실패한 씨앗을 다시 돌려도 통과한다.
 * 저장소 경로와 줄 차례가 번호를 따라가서 가장 먼저 굳혀야 하는 값이다.
 */
let idState = 1;
const nextId = () => {
  idState = (Math.imul(idState, 1664525) + 1013904223) | 0;
  return idState >>> 0;
};
const seededBytes = (n: number) => {
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = nextId() >>> 24;
  return out;
};
const realRandomBytes = nodeCrypto.randomBytes;
Object.assign(nodeCrypto, {
  randomBytes: (n: number, cb?: (e: Error | null, b: Buffer) => void) => (cb ? realRandomBytes(n, cb) : seededBytes(n)),
  randomInt: (a: number, b?: number) => (b === undefined ? nextId() % a : a + (nextId() % (b - a))),
  randomUUID: () => {
    const h = seededBytes(16).toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  },
});
syncBuiltinESMExports();

const envInt = (name: string, fallback: number) => {
  const raw = process.env[name];
  const n = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const FUZZ_MS = envInt('FUZZ_MS', 21_000);
const FUZZ_FROM = envInt('FUZZ_FROM', 1);
const FUZZ_STEPS = envInt('FUZZ_STEPS', 70);
/** 아직 안 고친 틈까지 실패로 본다 */
const ONE_SEED = process.env.FUZZ_SEED != null && process.env.FUZZ_SEED !== '' ? Number(process.env.FUZZ_SEED) : null;
const WORKER = process.env.FUZZ_WORKER != null ? Number(process.env.FUZZ_WORKER) : null;

/* ─────────────────────── 여러 프로세스로 나눠 돌리기 ─────────────────────── */

type WorkerReport = { seeds: number; steps: number; counters: Record<string, number> };

if (ONE_SEED == null && WORKER == null) {
  const jobs = envInt('FUZZ_JOBS', Math.max(2, Math.min(8, availableParallelism() - 2)));
  const started = realNow();
  const scriptPath = process.argv[1];
  const results = await Promise.all(
    Array.from({ length: jobs }, (_, i) =>
      new Promise<{ code: number | null; out: string }>((resolve) => {
        const child = spawn(process.execPath, [...process.execArgv, scriptPath], {
          env: { ...process.env, NODE_NO_WARNINGS: '1', FUZZ_WORKER: String(i), FUZZ_JOBS: String(jobs), FUZZ_DEADLINE: String(started + FUZZ_MS) },
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        let out = '';
        child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
        child.on('close', (code) => resolve({ code, out }));
      }),
    ),
  );
  const total: WorkerReport = { seeds: 0, steps: 0, counters: {} };
  for (const r of results) {
    const line = r.out.split('\n').find((l) => l.startsWith('FUZZ_REPORT '));
    if (line) {
      const w = JSON.parse(line.slice('FUZZ_REPORT '.length)) as WorkerReport;
      total.seeds += w.seeds;
      total.steps += w.steps;
      for (const [k, v] of Object.entries(w.counters)) total.counters[k] = (total.counters[k] ?? 0) + v;
    }
    if (r.code !== 0) process.stdout.write(r.out.split('\n').filter((l) => !l.startsWith('FUZZ_REPORT ')).join('\n') + '\n');
  }
  const seconds = ((realNow() - started) / 1000).toFixed(1);
  if (process.env.V) console.log(Object.entries(total.counters).sort().map(([k, v]) => `${k}=${v}`).join(' '));
  if (results.some((r) => r.code !== 0)) {
    console.log(`실패 — 프로세스 ${jobs}개, 씨앗 ${total.seeds}개, ${seconds}초`);
    process.exit(1);
  }
  const c = total.counters;
  console.log(
    `intake:retention-fuzz 통과 — 씨앗 ${total.seeds}개 · 단계 ${total.steps}개 · 프로세스 ${jobs}개 · ${seconds}초` +
      ` (보유 삭제 ${c['삭제.원본'] ?? 0}건 · 임시 파일 ${c['삭제.임시'] ?? 0}건 · 틈 끼어들기 ${c['틈'] ?? 0}건 · 삭제 중 막힘 ${c['막힘.삭제중'] ?? 0}건 · 저장소 실패 ${c['실패.저장소'] ?? 0}건)`,
  );
  process.exit(0);
}

/* ─────────────────────── 시험 DB ─────────────────────── */

/* 공유 DB 에 적용하기 전에는 prisma/pending-migrations 에 둔다(그 폴더 README) */
const MIGRATION_ROOT = readdirSync('prisma').includes('pending-migrations') ? 'prisma/pending-migrations' : 'prisma/migrations';
const migrationDir = readdirSync(MIGRATION_ROOT).filter((d) => d.endsWith('_external_intake')).sort()[0];
const pg = await PGlite.create();
await pg.exec(readFileSync(`${MIGRATION_ROOT}/${migrationDir}/migration.sql`, 'utf8'));
/*
 * updatedAt 은 Prisma 가 실제 시계로 적는다. 시험 시계로 정리 여유를 재려면 그 칸도 시험 시계여야 해서, 자산 줄을 쓸 때마다 시험 시계로 덮는다.
 * 사용자 표는 관리자 상세가 이름을 읽는 데만 쓰여 빈 표로 둔다.
 */
await pg.exec(`
  CREATE TABLE "SimClock" ("now" TIMESTAMP(3) NOT NULL);
  INSERT INTO "SimClock" VALUES ('2026-11-06 03:00:00');
  CREATE FUNCTION sim_touch() RETURNS trigger AS $$ BEGIN NEW."updatedAt" := (SELECT "now" FROM "SimClock"); RETURN NEW; END $$ LANGUAGE plpgsql;
  CREATE TRIGGER sim_touch_asset BEFORE INSERT OR UPDATE ON "IntakeAsset" FOR EACH ROW EXECUTE FUNCTION sim_touch();
  CREATE TABLE "SimAbandon" ("assetId" TEXT, "was" TEXT, "at" TIMESTAMP(3), "uploadExpiresAt" TIMESTAMP(3), "invStatus" TEXT, "revokedAt" TIMESTAMP(3), "subStatus" TEXT, "withdrawnAt" TIMESTAMP(3));
  CREATE FUNCTION sim_abandon() RETURNS trigger AS $$ BEGIN
    INSERT INTO "SimAbandon" SELECT NEW."id", OLD."status", (SELECT "now" FROM "SimClock"), i."uploadExpiresAt", i."status", i."revokedAt", s."status", s."withdrawnAt"
      FROM "IntakeSubmission" s JOIN "IntakeInvitation" i ON i."id" = s."invitationId" WHERE s."id" = NEW."submissionId";
    RETURN NEW;
  END $$ LANGUAGE plpgsql;
  CREATE TRIGGER sim_abandon_asset AFTER UPDATE OF "status" ON "IntakeAsset" FOR EACH ROW WHEN (NEW."status" = 'abandoned' AND OLD."status" <> 'abandoned') EXECUTE FUNCTION sim_abandon();
  CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MANAGER');
  CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "nickname" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'USER');
`);
const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await socket.start();
const addr = (socket as unknown as { server: { address(): { port: number } } }).server.address();
const rawDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${addr.port}/postgres?sslmode=disable`, max: 1 }) });
/* 트랜잭션을 열기 직전도 틈이다 — 읽고 나서 잠그기 전에 다른 요청이 끼어드는 자리다. 잠근 뒤 다시 보지 않은 값이 여기서 드러난다 */
const db = new Proxy(rawDb, {
  get(target, prop) {
    const value = Reflect.get(target, prop) as unknown;
    if (prop !== '$transaction') return typeof value === 'function' ? value.bind(target) : value;
    return async (...args: Parameters<typeof rawDb.$transaction>) => {
      await gapMaybe('tx');
      return (target.$transaction as (...a: unknown[]) => unknown)(...args);
    };
  },
});

/* ─────────────────────── 규칙 — 앱의 상수를 안 불러 따로 적는다. 앱이 어긋나면 모델과 부딪혀 드러난다 ─────────────────────── */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const RETENTION = 90 * DAY;
const WITHDRAW_GRACE = 7 * DAY;
const STALE_GRACE = 26 * HOUR;
const HOLD_CAP = 14 * DAY;
const RUN_SETTLE = HOUR;
const TUS_LIFE = 24 * HOUR;
const ADMIN = '6f1d1b7e-0c1a-4c7e-9a44-111111111111';
const ACTOR = { id: ADMIN, role: 'ADMIN' };

/* ─────────────────────── 씨앗 난수 ─────────────────────── */

let rngState = 1;
const rand = () => {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const chance = (p: number) => rand() < p;
/* 저장소 실패 · 틈은 따로 뽑는다 — 겹쳐 돌리는 두 일꾼이 부르는 차례는 그때그때 달라서, 같은 수열을 쓰면 뒤의 단계가 통째로 어긋난다 */
let storageRngState = 1;
const storageChance = (p: number) => {
  storageRngState = (Math.imul(storageRngState, 1103515245) + 12345) | 0;
  return (storageRngState >>> 8) / 16777216 < p;
};
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const key = () => randomBytes(16).toString('hex');

/* ─────────────────────── 모델 ─────────────────────── */

type MSub = {
  no: number;
  id: string;
  scope: IntakeScope;
  /** 낸 시각 · 공개 시각 · 철회 시각 — 앱에서 읽지 않고 동작이 성공할 때 적는다 */
  finalized: number[];
  published: number[];
  withdrawnAt: number | null;
  uploadExpiresAt: number;
  /** 마지막으로 읽은 판 번호 — 낡은 화면을 흉내 낸다 */
  seenVersion: number;
  /** 칸마다 마지막으로 고른 파일 — 같은 파일을 다시 고르는 길을 본다 */
  lastBytes: Partial<Record<IntakeView, MFile>>;
  /** 마지막으로 낸 열쇠 — 응답을 잃고 다시 내는 길을 본다 */
  lastKey: string | null;
};
/** 고른 파일 — declared 는 브라우저가 잰 값이고, delivered 는 저장소에 실제로 닿는 바이트다 */
type MFile = { declared: Buffer; delivered: Buffer };
type Trace = { sub: MSub; status: string; hadBytes: boolean; outAt: number | null; markedAt: number | null };
type Transfer = { assetId: string; sub: MSub; path: string; bytes: Buffer; until: number };
type GpuJob = { req: GpuJobRequest; callId: string | null; doneAt: number; outcome: 'ok' | 'fail'; wrote: boolean };

/** 지울 날 — 공개한 적이 있으면 마지막 공개 · 그 뒤에 낸 날, 없으면 철회한 날 · 낸 날에서 90일. 판 없이 철회했으면 7일 */
function oracleDue(s: MSub): number | null {
  const fin = s.finalized.length ? s.finalized[s.finalized.length - 1] : null;
  if (s.published.length) return Math.max(Math.max(...s.published), fin ?? 0) + RETENTION;
  if (s.withdrawnAt != null) return s.withdrawnAt + (fin != null ? RETENTION : WITHDRAW_GRACE);
  return fin != null ? fin + RETENTION : null;
}

class Crash extends Error {}

const counters: Record<string, number> = {};
const count = (k: string, n = 1) => {
  counters[k] = (counters[k] ?? 0) + n;
};

const nowDate = () => new Date(nowMs);
let subs: MSub[] = [];
let trace = new Map<string, Trace>();
let transfers: Transfer[] = [];
let gpuJobs: GpuJob[] = [];
let violations: string[] = [];
let log: string[] = [];
let stepNo = 0;
let inGap = false;
let gapRate = 0;
/** 끼어든 횟수 — 동작이 끝난 뒤의 검사가 '그사이 끼어든 일'을 동작 탓으로 돌리지 않게 */
let gapsSeen = 0;
/** 앱은 벌써 적었고 모델은 동작이 돌아온 뒤에 적는 동안 — 판을 낸 뒤의 정산 앞 틈이다 */
let modelBehind = false;
let crashNext: 'before' | 'partial' | 'after' | null = null;
const fault = { remove: 0, partial: 0, silent: 0, lost: 0, stat: 0, hash: 0, gpu: 0, stuck: new Set<string>() };
const faulty = () => fault.remove + fault.partial + fault.silent + fault.lost + fault.stat + fault.hash > 0 || fault.stuck.size > 0 || crashNext != null;
const objects = new Map<string, Buffer>();

const stamp = () => {
  const ms = nowMs - T0;
  return `${Math.floor(ms / DAY)}일${Math.floor((ms % DAY) / HOUR)}시${Math.floor((ms % HOUR) / MIN)}분`;
};
const note = (line: string) => {
  log.push(`#${stepNo} ${stamp()} ${line}`);
  if (process.env.V && ONE_SEED != null) console.log(log[log.length - 1]);
};
function must(cond: unknown, message: string): asserts cond {
  if (cond) return;
  const line = `#${stepNo} ${stamp()} ${message}`;
  violations.push(line);
  throw new Error(`불변식 위반: ${line}`);
}

async function setClock(ms: number) {
  assert.ok(ms >= nowMs, '시계는 앞으로만 간다');
  /* 내려온 시각은 시계가 움직이기 전에 적어 둔다 — 한 단계 안에서도 시계가 돈다 */
  for (const a of await db.intakeAsset.findMany({ where: { status: { in: ['replaced', 'abandoned'] } }, select: { id: true, submissionId: true, status: true } })) {
    const t = traceOf(a);
    if (t.outAt == null) t.outAt = nowMs;
  }
  nowMs = ms;
  await db.$executeRaw`UPDATE "SimClock" SET "now" = ${nowDate()}`;
  gpuTick();
}

/* ─────────────────────── 지우는 순간의 검사 ─────────────────────── */

const subOfId = (id: string) => subs.find((s) => s.id === id);
function traceOf(a: Pick<IntakeAsset, 'id' | 'submissionId' | 'status'>): Trace {
  let t = trace.get(a.id);
  if (!t) {
    const sub = subOfId(a.submissionId);
    assert.ok(sub, `모르는 접수의 자산: ${a.submissionId}`);
    t = { sub, status: a.status, hadBytes: false, outAt: null, markedAt: null };
    trace.set(a.id, t);
  }
  return t;
}

/** 지금 표시하면 안 되는 까닭 — 모델이 따로 본다 */
async function waitingReason(s: MSub, due: number): Promise<string | null> {
  const row = await db.intakeSubmission.findUniqueOrThrow({ where: { id: s.id }, include: { invitation: true, runs: true, assets: { select: { id: true } } } });
  if (row.runs.some((r) => r.status === 'requested' || r.status === 'running')) return '분석이 도는데';
  if (row.runs.some((r) => r.finishedAt != null && nowMs - r.finishedAt.getTime() < RUN_SETTLE)) return '실행이 끝난 지 한 시간이 안 됐는데';
  const verifying = await db.intakeJob.count({ where: { dedupeKey: { in: row.assets.map((x) => `verify_asset:${x.id}`) }, status: { in: ['queued', 'running'] } } });
  if (verifying > 0) return '검증 일감이 살아 있는데';
  if (row.status === 'correction_requested' && row.invitation.status === 'active' && nowMs < Math.min(row.invitation.uploadExpiresAt.getTime(), due + HOLD_CAP)) return '고침을 기다려야 하는데';
  return null;
}

/** 'purging' 을 처음 본 때 — 표시가 걸린 순간의 지울 날과 기다림을 모델로 다시 본다 */
async function approveMark(a: IntakeAsset) {
  const t = traceOf(a);
  if (t.markedAt != null) return;
  t.markedAt = nowMs;
  const due = oracleDue(t.sub);
  must(due != null && nowMs >= due, `접수 ${t.sub.no}: 지울 날(${due == null ? '없음' : new Date(due).toISOString()}) 전에 표시했다 — ${a.view}`);
  const waiting = await waitingReason(t.sub, due);
  must(waiting == null, `접수 ${t.sub.no}: ${waiting} 표시했다`);
  /* 판단 근거는 표시를 건 트랜잭션이 남긴다 — 나중에 철회로 날짜가 밀려도 이 줄은 표시한 때의 날을 말해야 한다 */
  const started = await db.intakeAudit.findFirst({ where: { submissionId: t.sub.id, action: 'originals.purge_started' }, orderBy: { createdAt: 'desc' } });
  must(started, `접수 ${t.sub.no}: 표시했는데 시작 기록이 없다`);
  must((started.detail as { purgeAt?: string }).purgeAt === new Date(due).toISOString(), `접수 ${t.sub.no}: 시작 기록의 지울 날이 모델과 다르다`);
}

const PREVIEW = /^sub\/[0-9a-f-]{36}\/runs\/([0-9a-f-]{36})\/preview-(side|rear)\.mp4$/;

async function checkRemoval(paths: readonly string[]) {
  for (const path of paths) {
    const preview = PREVIEW.exec(path);
    if (preview) {
      const run = await db.intakeAnalysisRun.findUnique({ where: { id: preview[1] }, select: { revision: { select: { sideAssetId: true, rearAssetId: true } } } });
      must(run, `모르는 실행의 미리보기를 지운다: ${path}`);
      const pair = await db.intakeAsset.findMany({ where: { id: { in: [run.revision.sideAssetId, run.revision.rearAssetId] } } });
      must(pair.some((a) => a.status === 'purging'), `입력 원본을 안 지우는 실행의 미리보기를 지운다: ${pair.map((a) => a.status).join(' · ')}`);
      continue;
    }
    must(path.endsWith('/original'), `지우면 안 되는 경로: ${path}`);
    const a = await db.intakeAsset.findUnique({ where: { objectPath: path } });
    must(a, `모르는 원본을 지운다: ${path}`);
    const frozen = await db.intakeRevision.count({ where: { OR: [{ sideAssetId: a.id }, { rearAssetId: a.id }] } });
    if (frozen > 0) {
      must(a.status === 'purging', `판에 오른 원본을 표시 없이 지운다: ${a.status}`);
      await approveMark(a);
      const reading = await db.intakeAnalysisRun.count({ where: { status: { in: ['requested', 'running'] }, revision: { OR: [{ sideAssetId: a.id }, { rearAssetId: a.id }] } } });
      must(reading === 0, `접수 ${traceOf(a).sub.no}: 분석이 읽고 있는 원본을 지운다`);
      continue;
    }
    must(a.status === 'replaced' || a.status === 'abandoned', `판 밖 파일을 내리기 전에 지운다: ${a.status}`);
    const t = traceOf(a);
    if (t.sub.withdrawnAt != null) must(nowMs >= t.sub.withdrawnAt + WITHDRAW_GRACE, `접수 ${t.sub.no}: 철회 7일 전에 판 밖 파일을 지운다`);
    else must(nowMs >= (t.outAt ?? nowMs) + STALE_GRACE, `접수 ${t.sub.no}: 내려온 지 26시간 전에 판 밖 파일을 지운다(${a.status})`);
  }
}

/* ─────────────────────── 가짜 저장소 ─────────────────────── */

const PUT = 'https://put.example/';

/** 막 지운 경로 — 없어졌는지 확인하는 사이에도 다른 요청이 끼어든다 */
const justRemoved = new Set<string>();

function dropObject(path: string) {
  justRemoved.add(path);
  if (fault.stuck.has(path)) return;
  if (objects.delete(path) && PREVIEW.test(path)) previewsGone.add(path);
}

const storage: IntakeRunStorage = {
  uploadOrigin: 'https://proj.storage.supabase.co',
  async issueUpload(objectPath) {
    await gapMaybe('token');
    if (objects.has(objectPath)) throw new IntakeError('storage_unavailable', { cause: 'sign_upload' });
    return { endpoint: `${this.uploadOrigin}/storage/v1/upload/resumable/sign`, token: `tok-${key()}`, tokenTtlMs: 3_600_000, apikey: 'pk', bucket: 'external-intake', objectName: objectPath };
  },
  async stat(p) {
    justRemoved.delete(p);
    await gapMaybe('stat');
    if (storageChance(fault.stat)) {
      count('실패.저장소');
      throw new IntakeError('storage_unavailable', { cause: 'stat' });
    }
    const b = objects.get(p);
    return b ? { size: b.length, contentType: 'video/quicktime' } : null;
  },
  async reader(p) {
    await gapMaybe('reader');
    const b = objects.get(p);
    return b ? { size: b.length, read: async (s, e) => new Uint8Array(b.subarray(s, e)) } : null;
  },
  async hash(p) {
    await gapMaybe('hash');
    if (storageChance(fault.hash)) {
      count('실패.저장소');
      throw new IntakeError('storage_unavailable', { cause: 'hash_read' });
    }
    const b = objects.get(p);
    if (!b) throw new IntakeError('storage_unavailable', { cause: 'hash_gone' });
    return { sha256: createHash('sha256').update(b).digest('hex'), size: b.length };
  },
  async readUrl(p) {
    await gapMaybe('read');
    return `https://read.example/${p}`;
  },
  async list(prefix) {
    return [...objects.keys()].filter((k) => k.startsWith(prefix));
  },
  async remove(paths) {
    try {
      await checkRemoval(paths);
    } catch (e) {
      /* 위반은 기록해 두고 지우지 않는다 — 일꾼이 삼켜도 단계 끝에서 드러난다 */
      if (violations.length === 0) violations.push(`#${stepNo} ${stamp()} 지우기 검사 오류: ${String(e)}`);
      throw e;
    }
    await gapMaybe('remove');
    if (crashNext) {
      const mode = crashNext;
      crashNext = null;
      count('일꾼 죽음');
      if (mode !== 'before') for (const p of mode === 'after' ? paths : paths.slice(0, Math.ceil(paths.length / 2))) dropObject(p);
      throw new Crash(mode);
    }
    if (storageChance(fault.remove)) {
      count('실패.저장소');
      throw new IntakeError('storage_unavailable', { cause: 'remove' });
    }
    if (storageChance(fault.silent)) {
      count('실패.저장소');
      return;
    }
    if (storageChance(fault.partial)) {
      count('실패.저장소');
      for (const p of paths.slice(0, Math.floor(paths.length / 2))) dropObject(p);
      throw new IntakeError('storage_unavailable', { cause: 'remove' });
    }
    /* 다 지웠는데 답이 끊긴다 */
    if (storageChance(fault.lost)) {
      count('실패.저장소');
      for (const p of paths) dropObject(p);
      throw new IntakeError('storage_unavailable', { cause: 'remove' });
    }
    for (const p of paths) dropObject(p);
  },
  async resultUploadUrl(p) {
    await gapMaybe('sign');
    return `${PUT}${p}`;
  },
};

/* ─────────────────────── 가짜 분석 서버 ─────────────────────── */

const sc = base;
const { side: camS, back: camB } = cameras(sc);
const trackS = makeV2Track(sc, camS, sc.side, 'side', 11);
const trackB = makeV2Track(sc, camB, sc.back, 'back', 12);
const fitted = fitPitch3dV2({
  side: trackS.track,
  back: trackB.track,
  hand: sc.hand,
  heightCm: 183,
  jobId: '2b0c7c1e-8f7a-4d1e-9a51-0c9d2f3e4a5b',
  poseModel: 'synth',
  screenRecorded: true,
  slowmoFps: 240,
  events: { kneeUp: trackS.toMedia(EV.kneeUp), footPlant: trackS.toMedia(EV.footPlant), release: trackS.toMedia(EV.release) },
}).result as Pitch3dV2Ok;
assert.ok(fitted.ok, '합성 투수 결과가 나온다');
/* 파일을 작게 — 읽기 검사에는 장면 수가 상관없다 */
const FRAMES = 8;
const cut = <T,>(a: T[]) => a.slice(0, FRAMES);
const smallResult = { ...fitted, t: cut(fitted.t), tBack: cut(fitted.tBack), joints: cut(fitted.joints), conf: cut(fitted.conf), lowConf: [], experimental: undefined, events: { kneeUp: 1, footPlant: 2, release: 3 } };
const resultBytes = (runId: string) => Buffer.from(JSON.stringify({ ...smallResult, jobId: runId }));

/** 시계가 돌 때마다 — 분석 서버는 앱이 묻든 말든 끝나면 파일을 올린다 */
function gpuTick() {
  for (const j of gpuJobs) {
    if (j.wrote || nowMs < j.doneAt) continue;
    j.wrote = true;
    if (j.req.previews) {
      for (const url of [j.req.previews.side, j.req.previews.back]) {
        const path = url.slice(PUT.length);
        written.push({ path, runId: j.req.jobId, at: nowMs });
        objects.set(path, Buffer.from('preview'));
      }
    }
    if (j.outcome === 'ok') objects.set(j.req.result.uploadUrl.slice(PUT.length), resultBytes(j.req.jobId));
  }
}
let written: { path: string; runId: string; at: number }[] = [];
/** 저장소에서 실제로 없어진 미리보기 — 감사 기록의 수와 맞춰 본다 */
let previewsGone = new Set<string>();

const gpu: IntakeGpu = {
  configured: () => true,
  async start(req) {
    const roll = rand();
    /* 받지 않은 경우 */
    if (roll < 0.06) return { error: 'gpu-auth' };
    if (roll < 0.1) return { error: 'gpu' };
    const job: GpuJob = { req, callId: null, doneAt: nowMs + int(1, 40) * MIN, outcome: chance(0.2) ? 'fail' : 'ok', wrote: false };
    gpuJobs.push(job);
    /* 받아서 도는데 답만 끊긴 경우 */
    if (roll < 0.15) throw new Error('The operation was aborted due to timeout');
    if (roll < 0.2) return { error: 'gpu' };
    job.callId = `call-${gpuJobs.length}`;
    return { callId: job.callId };
  },
  async status(callId): Promise<GpuStatus> {
    const j = gpuJobs.find((x) => x.callId === callId);
    /* 분석 서버가 답을 안 하는 동안 — 15분이 지나면 앱이 실패로 닫지만 서버의 작업은 계속 돌 수 있다 */
    if (!j || storageChance(fault.gpu)) return { kind: 'unknown' };
    if (!j.wrote) return nowMs - j.doneAt > -5 * MIN ? { kind: 'running', stages: { fit: 1 } } : { kind: 'pending' };
    return j.outcome === 'ok' ? { kind: 'done', stages: { fit: 3 } } : { kind: 'failed', code: 'internal', stages: { fit: 1 } };
  },
  async engineBuild() {
    return 'build-a';
  },
};

const rt: IntakeRuntime = { db, storage, gpu, env: { INTAKE_ALLOW_DRAFT_ANALYSIS: '1' }, now: nowDate };

/* ─────────────────────── 동작 ─────────────────────── */

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const answer = (kind: ConsentAnswer['kind'], granted = true): ConsentAnswer => {
  const d = consentDocOf(kind);
  return { kind, version: d.version, textHash: d.textHash, granted };
};

/** 도메인이 거절한 것만 받는다 — 그 밖의 오류는 시험 실패다. 저장소 실패를 안 넣었는데 저장소 오류가 나면 그것도 실패다 */
async function attempt<T>(label: string, work: () => Promise<T>): Promise<T | null> {
  try {
    const r = await work();
    count(`된.${label}`);
    return r;
  } catch (e) {
    if (e instanceof Crash) throw e;
    if (!(e instanceof IntakeError)) throw e;
    count(`거절.${label}.${e.code}`);
    if (e.code === 'purge_in_progress') count('막힘.삭제중');
    note(`${label} → ${e.code}`);
    must(e.code !== 'storage_unavailable' || faulty(), `${label}: 저장소 실패를 안 넣었는데 ${e.code}`);
    return null;
  }
}

const rowOf = (s: MSub) => db.intakeSubmission.findUniqueOrThrow({ where: { id: s.id } });
const assetIn = (ids: (string | null | undefined)[]) => db.intakeAsset.findMany({ where: { id: { in: ids.filter((x): x is string => x != null) } } });

async function actNew(): Promise<MSub> {
  const uploadExpiresAt = nowMs + int(3, 45) * DAY;
  const created = await createInvitation(db, { adminId: ADMIN, uploadExpiresAt: new Date(uploadExpiresAt) }, nowDate());
  const scope = await openIntakeScope(db, `Intake ${created.token}`, 'read', nowDate());
  const s: MSub = { no: subs.length + 1, id: scope.submissionId, scope, finalized: [], published: [], withdrawnAt: null, uploadExpiresAt, seenVersion: 0, lastBytes: {}, lastKey: null };
  subs.push(s);
  note(`접수 ${s.no} 만듦(올리기 ${Math.round((uploadExpiresAt - nowMs) / DAY)}일)`);
  /* 새 접수를 차리는 동안에는 끼어들지 않는다 — 시험의 준비 단계라 거절을 받을 길이 없다 */
  const outer = inGap;
  inGap = true;
  await saveDraft(db, scope, { expectedVersion: 0, athleteName: `선수${s.no}`, athleteAgeBand: '14_or_over', throwingHand: chance(0.85) ? 'R' : null, samePitchConfirmed: true }, nowDate());
  await recordConsents(db, scope, { answers: [answer('submission'), answer('overseas'), ...(chance(0.5) ? [answer('model')] : [])] }, nowDate());
  inGap = outer;
  /* 뒤 단계에 빨리 닿게 — 대부분은 낸 접수로 시작한다 */
  const stage = rand();
  if (stage < 0.15) return s;
  await actPick(s, 'side');
  await actPick(s, 'rear');
  if (stage < 0.3) return s;
  for (const t of transfers.filter((x) => x.sub === s)) await actArrive(t, true);
  await actFinalize(s);
  if (stage < 0.4) return s;
  await work();
  return s;
}

/** 칸에 파일을 고르고 전송을 시작한다. 바이트는 actArrive 가 도착시킨다 */
async function actPick(s: MSub, view: IntakeView) {
  const row = await rowOf(s);
  const expectedAssetId = view === 'side' ? row.sideAssetId : row.rearAssetId;
  const file = (chance(0.25) ? s.lastBytes[view] : undefined) ?? makeFile(view);
  s.lastBytes[view] = file;
  /* 다른 기기가 칸을 바꾼 낡은 화면 */
  const seen = chance(0.08) ? (row.sideAssetId ?? row.rearAssetId) : expectedAssetId;
  const r = await attempt('고르기', () =>
    reserveAsset(db, s.scope, { view, expectedAssetId: seen, fileName: `${view}.MOV`, sizeBytes: file.declared.length, declaredType: 'video/quicktime', sha256: sha(file.declared), pairConfirmed: true }, nowDate()),
  );
  if (!r) return;
  note(`접수 ${s.no} ${view} 고름`);
  const a = await db.intakeAsset.findUniqueOrThrow({ where: { id: r.asset.id } });
  traceOf(a);
  must(!assetGone(a.status), `접수 ${s.no}: 지운 자산을 다시 골랐다고 답했다 — ${a.status}`);
  /* 같은 파일을 다시 골랐으면 있던 자산을 이어 보낸다 — 새로고침 뒤 다시 고른 경우다 */
  if (!r.created && !assetInTransit(a.status)) return;
  await startTransfer(s, a, file.delivered);
}

/** 토큰을 받고 전송을 시작한다. 살아 있는 주소가 있으면 거기서 잇는다 */
async function startTransfer(s: MSub, a: Pick<IntakeAsset, 'id' | 'objectPath'>, bytes: Buffer) {
  const grant = await attempt('토큰', () => issueUploadToken(db, storage, s.scope, { assetId: a.id }, nowDate()));
  if (!grant) return;
  if (grant.uploadUrl) {
    if (!transfers.some((t) => t.assetId === a.id)) transfers.push({ assetId: a.id, sub: s, path: a.objectPath, bytes, until: new Date(grant.transportExpiresAt!).getTime() });
    return;
  }
  const url = await attempt('주소', () => registerUploadUrl(db, storage, s.scope, { assetId: a.id, uploadUrl: `${storage.uploadOrigin}/storage/v1/upload/resumable/${randomUUID()}` }, nowDate()));
  if (!url) return;
  transfers = transfers.filter((t) => t.assetId !== a.id);
  transfers.push({ assetId: a.id, sub: s, path: a.objectPath, bytes, until: nowMs + TUS_LIFE });
}

/** 칸에 전송 중인 파일이 있으면 이어 보낸다 — 화면이 닫혔다 다시 열린 경우다 */
async function actResume(s: MSub) {
  const row = await rowOf(s);
  const inFlight = (await assetIn([row.sideAssetId, row.rearAssetId])).filter((a) => assetInTransit(a.status));
  if (!inFlight.length) return;
  const a = pick(inFlight);
  await startTransfer(s, a, s.lastBytes[a.view as IntakeView]?.delivered ?? mov120(1024));
  note(`접수 ${s.no} 전송 이어 감`);
}

/** 전송이 끝난다 — 칸에서 내려온 파일도 살아 있는 주소로 끝날 수 있다. 화면이 알리기도 하고 안 알리기도 한다 */
async function actArrive(t: Transfer, confirm = chance(0.75)) {
  transfers = transfers.filter((x) => x !== t);
  if (nowMs >= t.until) return;
  objects.set(t.path, t.bytes);
  const tr = trace.get(t.assetId);
  if (tr) tr.hadBytes = true;
  note(`접수 ${t.sub.no} 바이트 도착`);
  if (confirm) await attempt('도착 확인', () => confirmUpload(db, storage, t.sub.scope, { assetId: t.assetId }, nowDate()));
}

/** 대부분 좋은 파일이다. 나머지는 전송이 깨졌거나 영상이 아니거나 영상인지 모르는 파일로, 판이 실패로 닫히는 길을 탄다 */
function makeFile(view: IntakeView): MFile {
  const good = view === 'side' ? mov240(1024) : mov120(1024);
  const roll = rand();
  if (roll < 0.82) return { declared: good, delivered: good };
  if (roll < 0.87) {
    const corrupt = Buffer.from(good);
    corrupt[corrupt.length - 1] ^= 0xff;
    return { declared: good, delivered: corrupt };
  }
  if (roll < 0.91) return { declared: good, delivered: good.subarray(0, good.length - 16) };
  if (roll < 0.95) {
    const junk = Buffer.from(`이건 영상이 아니에요 ${key()}`.repeat(40));
    return { declared: junk, delivered: junk };
  }
  const unknown = mov240(1024, { fillerBoxes: 70 });
  return { declared: unknown, delivered: unknown };
}

async function actFinalize(s: MSub, stale = false) {
  const state = await attempt('상태 읽기', () => loadPublicState(db, s.scope, { now: nowDate() }));
  if (!state) return;
  const expectedVersion = stale ? s.seenVersion : state.version;
  s.seenVersion = state.version;
  const retry = s.lastKey != null && chance(0.15);
  const idempotencyKey = retry ? s.lastKey! : key();
  modelBehind = true;
  const r = await attempt('내기', () => finalizeSubmission(db, s.scope, { expectedVersion, idempotencyKey, samePitchConfirmed: true }, nowDate())).finally(() => {
    modelBehind = false;
  });
  if (r && retry) must(!r.created, `접수 ${s.no}: 같은 열쇠로 새 판이 생겼다`);
  if (!r?.created) return;
  s.lastKey = idempotencyKey;
  s.finalized.push(nowMs);
  note(`접수 ${s.no} 냄(${r.revision}판)`);
  const rev = await db.intakeRevision.findFirstOrThrow({ where: { submissionId: s.id }, orderBy: { number: 'desc' } });
  for (const a of await assetIn([rev.sideAssetId, rev.rearAssetId])) must(!assetGone(a.status), `접수 ${s.no}: 지우는 파일로 판을 얼렸다 — ${a.status}`);
}

/** 검증 · 등록을 일꾼처럼 돌린다 */
const work = () => runDueJobs(db, intakeJobHandlers(rt), { owner: `work-${stepNo}`, kinds: ['verify_asset', 'register_revision'], limit: 12, now: nowDate });

async function actCorrect(s: MSub) {
  const views = pick<IntakeView[]>([[], ['side'], ['rear'], ['side', 'rear']]);
  const fields: CorrectableField[] = views.length === 0 || chance(0.4) ? ['athleteName'] : [];
  const extend = chance(0.5) ? nowMs + int(2, 20) * DAY : undefined;
  const r = await attempt('고침 요청', () => requestCorrection(db, { adminId: ADMIN, submissionId: s.id, fields, views, message: '다시 찍어 주세요', extendUploadUntil: extend ? new Date(extend) : undefined }, nowDate()));
  if (!r) return;
  if (extend && extend > s.uploadExpiresAt) s.uploadExpiresAt = extend;
  note(`접수 ${s.no} 고침 요청 ${views.join('+') || '글'}`);
}

async function actRename(s: MSub) {
  const row = await rowOf(s);
  await attempt('이름 고침', () => saveDraft(db, s.scope, { expectedVersion: row.version, athleteName: `선수${s.no}-${stepNo}` }, nowDate()));
}

async function actCancel(s: MSub) {
  const row = await rowOf(s);
  if (await attempt('고침 거둠', () => cancelCorrection(db, { adminId: ADMIN, submissionId: s.id, expectedVersion: row.version }, nowDate()))) note(`접수 ${s.no} 고침 거둠`);
}

async function actExtend(s: MSub) {
  const until = Math.max(nowMs, s.uploadExpiresAt) + int(1, 15) * DAY;
  if (await attempt('기간 늘림', () => extendUploadWindow(db, { adminId: ADMIN, submissionId: s.id, until: new Date(until) }, nowDate()))) s.uploadExpiresAt = until;
}

async function actWithdraw(s: MSub) {
  const how = pick(['받는 사람', '관리자', '모델만'] as const);
  if (how === '모델만') {
    await attempt('모델 철회', () => withdrawConsent(db, s.scope, { kind: 'model' }, nowDate()));
    return;
  }
  const done = await attempt<unknown>('철회', () =>
    how === '관리자' ? withdrawRequiredConsent(db, { adminId: ADMIN, submissionId: s.id }, nowDate()) : withdrawConsent(db, s.scope, { kind: pick(['submission', 'overseas'] as const) }, nowDate()),
  );
  if (!done) return;
  const row = await rowOf(s);
  if (row.status === 'withdrawn' && s.withdrawnAt == null) {
    s.withdrawnAt = nowMs;
    note(`접수 ${s.no} 철회(${how})`);
  }
}

async function actRevoke(s: MSub) {
  if ((await attempt('폐기', () => adminRevokeInvitation(db, ACTOR, { submissionId: s.id }, nowDate())))?.revoked) note(`접수 ${s.no} 초대 폐기`);
}

async function actAnalyze(s: MSub) {
  const r = await attempt('분석', () => startIntakeAnalysis({ submissionId: s.id, adminId: ADMIN, confirmDraftConsent: true }, rt));
  if (!r?.created) return;
  note(`접수 ${s.no} 분석 시작`);
  const due = oracleDue(s);
  must(due == null || nowMs < due, `접수 ${s.no}: 지울 날이 지났는데 새 분석이 시작됐다`);
  const run = await db.intakeAnalysisRun.findUniqueOrThrow({ where: { id: r.run.id }, include: { revision: true } });
  for (const a of await assetIn([run.revision.sideAssetId, run.revision.rearAssetId])) must(!assetGone(a.status), `접수 ${s.no}: 지운 원본으로 분석을 시작했다`);
}

async function actPublish(s: MSub) {
  const runs = await db.intakeAnalysisRun.findMany({ where: { submissionId: s.id, status: 'succeeded' }, orderBy: { requestedAt: 'desc' }, include: { revision: true } });
  if (!runs.length) return;
  const run = pick(runs);
  const active = await db.intakePublication.findUnique({ where: { activeFor: s.id } });
  /* 화면처럼 검토를 열고 검토 완료를 누른 뒤 공개한다(INTAKE-MAIN/R01). 열 수 없으면(철회 · 회수 등) 검토 완료 없이 공개가 막히는지만 본다 */
  const acknowledgementId = await (async () => {
    try {
      const v = await loadRunReview({ submissionId: s.id, runId: run.id, adminId: ADMIN }, rt);
      return (await acknowledgeRunReview({ submissionId: s.id, runId: run.id, adminId: ADMIN, resultDigest: v.resultDigest, currentRevisionId: v.currentRevisionId }, rt)).acknowledgementId;
    } catch (e) {
      if (e instanceof Crash) throw e;
      return null;
    }
  })();
  const r = await attempt('공개', () =>
    publishRun({ runId: run.id, adminId: ADMIN, expectedActivePublicationId: active?.id ?? null, allowOlderRevision: chance(0.5), explanation: `설명${stepNo}`, acknowledgementId }, rt),
  );
  if (!r?.created) return;
  must(s.withdrawnAt == null, `접수 ${s.no}: 철회한 접수를 공개했다 — 철회는 시계를 늦추지 않는다`);
  s.published.push(nowMs);
  note(`접수 ${s.no} 공개 ${r.number}판`);
  const row = await rowOf(s);
  const rev = row.currentRevisionId ? await db.intakeRevision.findUnique({ where: { id: row.currentRevisionId } }) : null;
  for (const a of await assetIn([run.revision.sideAssetId, run.revision.rearAssetId, rev?.sideAssetId, rev?.rearAssetId])) must(a.status !== 'purging', `접수 ${s.no}: 지우는 원본이 있는데 공개했다`);
}

async function actUnpublish(s: MSub) {
  const active = await db.intakePublication.findUnique({ where: { activeFor: s.id } });
  if (!active) return;
  if ((await attempt('내리기', () => unpublish({ submissionId: s.id, adminId: ADMIN, expectedActivePublicationId: active.id }, rt)))?.unpublished) note(`접수 ${s.no} 공개 내림`);
}

async function actHand(s: MSub) {
  await attempt('손 정함', () => setAnalysisHand({ submissionId: s.id, adminId: ADMIN, hand: pick(['R', 'L'] as const) }, rt));
}

async function actLinks(s: MSub) {
  /* 옛 판 파일 하나를 골라서도 본다 — 관리자 화면이 판마다 파일을 연다 */
  const frozen = (await db.intakeRevision.findMany({ where: { submissionId: s.id } })).flatMap((r) => [r.sideAssetId, r.rearAssetId]);
  const assetId = frozen.length && chance(0.4) ? pick(frozen) : undefined;
  const seen = gapsSeen;
  const links = await attempt('원본 주소', () => issueOriginalLinks(db, storage, ACTOR, { submissionId: s.id, purpose: 'preview', assetId }, nowDate()));
  /* 주소를 만드는 사이에 표시가 걸릴 수 있다. 주소는 잠금 밖이라 그 틈은 받아들인 위험이다(lib/intake/admin.ts issueOriginalLinks 머리글) */
  if (!links || seen !== gapsSeen) return;
  for (const a of await assetIn(links.map((l) => l.assetId))) {
    must(!assetGone(a.status), `접수 ${s.no}: 지우는 원본의 주소를 냈다`);
    must(objects.has(a.objectPath), `접수 ${s.no}: 바이트가 없는 원본의 주소를 냈다 — ${a.status}`);
  }
}

async function actPreviewLink(s: MSub) {
  const runs = await db.intakeAnalysisRun.findMany({ where: { submissionId: s.id }, include: { revision: true } });
  if (!runs.length) return;
  const run = pick(runs);
  const seen = gapsSeen;
  const link = await attempt('미리보기 주소', () => issueRunPreviewLink(db, storage, ACTOR, { submissionId: s.id, runId: run.id, view: pick(['side', 'rear'] as const) }, nowDate()));
  if (!link || seen !== gapsSeen) return;
  for (const a of await assetIn([run.revision.sideAssetId, run.revision.rearAssetId])) must(!assetGone(a.status), `접수 ${s.no}: 지우는 원본의 미리보기 주소를 냈다`);
}

async function actRequeue(s: MSub) {
  await attempt('다시 확인', () => adminRequeueVerification(db, ACTOR, { submissionId: s.id }, nowDate()));
}

/** 화면이 읽는 길 — 어떤 상태에서도 안 던지고, 지운 사실을 맞게 말해야 한다 */
async function actRead(s: MSub) {
  const state = await attempt('상태 읽기', () => loadPublicState(db, s.scope, { now: nowDate() }));
  const assets = await db.intakeAsset.findMany({ where: { submissionId: s.id } });
  const revisions = await db.intakeRevision.findMany({ where: { submissionId: s.id } });
  const purging = assets.filter((a) => a.status === 'purging');
  if (state) {
    must((state.originalDeleting != null) === purging.length > 0, `접수 ${s.no}: 지우는 중 표시가 자산과 다르다`);
    /* 지운 날은 지금 판의 두 파일을 본다 — 옛 파일 하나가 남아도 지운 지금 판을 살아 있다고 말하지 않게 */
    const { currentRevisionId } = await rowOf(s);
    const current = revisions.find((r) => r.id === currentRevisionId);
    const watched = current ? assets.filter((a) => a.id === current.sideAssetId || a.id === current.rearAssetId) : assets;
    const allGone = watched.length > 0 && watched.every((a) => a.status === 'purged');
    must((state.originalDeletedDate != null) === allGone, `접수 ${s.no}: 지운 날 표시가 자산과 다르다`);
    if (state.originalDeleting === 'current') must(watched.some((a) => a.status === 'purging'), `접수 ${s.no}: 지금 판을 지우는 중이라는데 지금 판 파일이 'purging' 이 아니다`);
    if (state.originalDeleting === 'older') must(!watched.some((a) => a.status === 'purging'), `접수 ${s.no}: 옛 판만 지운다는데 지금 판 파일이 'purging' 이다`);
    const due = oracleDue(s);
    if (state.originalDeleteDate != null && !modelBehind) must(due != null && state.originalDeleteDate === seoulDateKey(new Date(due)), `접수 ${s.no}: 화면의 지울 날이 모델과 다르다`);
    s.seenVersion = chance(0.5) ? state.version : s.seenVersion;
  }
  const detail = await loadIntakeDetail(db, ACTOR, s.id, nowDate());
  must(detail.retention == null || detail.retention.purging != null === purging.length > 0, `접수 ${s.no}: 관리자 지우는 중 표시가 자산과 다르다`);
  if (detail.retention?.purging?.scope === 'current' || detail.retention?.purgedAt) must(detail.retention.heldUntil == null, `접수 ${s.no}: 지우기 시작했는데 고침을 기다린다고 말한다`);
  await analysisReadiness(s.id, rt);
  await listRuns(s.id, rt);
  await loadIntakeList(db, ACTOR, parseIntakeFilters({}), nowDate());
}

async function actPurgeDirect(s: MSub) {
  await attempt('바로 지우기', () => purgeSubmissionOriginals({ db, storage, now: nowDate }, s.id));
}

async function actCron() {
  const r = await runIntakeCron(rt, { owner: `cron-${stepNo}` });
  note(`크론 끝 ${r.done} · 다시 ${r.retried} · 실패 ${r.failed} · 미룸 ${r.postponed} · 삭제 일감 ${r.purgesQueued}`);
}

/** 일꾼이 저장소를 부르다 죽는다 — 일감은 임대가 끝날 때까지 'running' 으로 남는다 */
async function actCrash(s: MSub) {
  /* null — 지우기를 다 끝내고 일감을 닫기 전에 죽는다 */
  crashNext = pick(['before', 'partial', 'after', null] as const);
  const leased = await leaseJobs(db, { owner: 'dead', limit: 1, kinds: ['purge_originals'], now: nowDate() });
  const target = leased.length ? (leased[0].payload as { submissionId: string }).submissionId : s.id;
  try {
    if (chance(0.25)) await cleanupStaleUploads(db, storage, nowDate());
    else await purgeSubmissionOriginals({ db, storage, now: nowDate }, target);
  } catch (e) {
    if (!(e instanceof Crash) && !(e instanceof IntakeError)) throw e;
  } finally {
    crashNext = null;
  }
  note(`일꾼 죽음 흉내(임대 ${leased.length})`);
}

/** 두 일꾼이 겹친다 */
async function actOverlap(s: MSub, purge = chance(0.5)) {
  const savedGap = gapRate;
  gapRate = 0;
  const both = chance(0.3)
    ? await Promise.allSettled([runIntakeCron(rt, { owner: `cron-a-${stepNo}` }), runIntakeCron(rt, { owner: `cron-b-${stepNo}` })])
    : purge
      ? await Promise.allSettled([purgeSubmissionOriginals({ db, storage, now: nowDate }, s.id), purgeSubmissionOriginals({ db, storage, now: nowDate }, s.id)])
      : await Promise.allSettled([cleanupStaleUploads(db, storage, nowDate()), cleanupStaleUploads(db, storage, nowDate())]);
  gapRate = savedGap;
  for (const r of both) if (r.status === 'rejected' && !(r.reason instanceof IntakeError)) throw r.reason;
  note('겹쳐 돌림');
}

const NO_FAULT = { remove: 0, partial: 0, silent: 0, lost: 0, stat: 0, hash: 0, gpu: 0 };

function actFault() {
  const kind = pick(['remove', 'partial', 'silent', 'lost', 'stat', 'hash', 'gpu', 'stuck', 'heal', 'heal', 'heal'] as const);
  if (kind === 'heal') {
    Object.assign(fault, NO_FAULT);
    fault.stuck.clear();
  } else if (kind === 'stuck') {
    const paths = [...objects.keys()].filter((p) => !p.endsWith('analysis.json'));
    if (paths.length) fault.stuck.add(pick(paths));
  } else fault[kind] = pick([0.3, 0.7, 1]);
  note(`저장소 ${kind}`);
}

/** 다음으로 볼 만한 시각 — 지울 날 · 기다림 끝 · 7일 · 26시간 · 올리기 끝 · 실행 끝 한 시간 */
async function boundaries(): Promise<number[]> {
  const out: number[] = [];
  for (const s of subs) {
    const due = oracleDue(s);
    if (due != null) out.push(due, due + HOLD_CAP);
    if (s.withdrawnAt != null) out.push(s.withdrawnAt + WITHDRAW_GRACE);
    out.push(s.uploadExpiresAt, s.uploadExpiresAt + STALE_GRACE);
  }
  for (const t of trace.values()) if (t.outAt != null) out.push(t.outAt + STALE_GRACE);
  for (const r of await db.intakeAnalysisRun.findMany({ where: { finishedAt: { not: null } }, select: { finishedAt: true } })) out.push(r.finishedAt!.getTime() + RUN_SETTLE);
  return out.filter((t) => t > nowMs + 1);
}

async function actAdvance() {
  const kind = rand();
  if (kind < 0.3) {
    const list = await boundaries();
    if (list.length) {
      const target = pick(list) + pick([-1, 0, 1]);
      await setClock(Math.max(nowMs, target));
      note('경계로 감');
      await actCron();
      return;
    }
  }
  const ms = kind < 0.5 ? int(1, 59) * MIN : kind < 0.75 ? int(1, 30) * HOUR : int(1, 40) * DAY;
  await setClock(nowMs + ms);
  note('시간 흐름');
  if (chance(0.5)) await actCron();
}

const closeOut = (s: MSub, purge: boolean) => pick<() => Promise<void>>([actCron, actCron, () => actOverlap(s, purge), () => (purge ? actPurgeDirect(s) : actCron()), () => actCrash(s)])();

/** 지울 날 바로 앞에서 일을 벌이고 그날을 넘긴다 — 기다림 · 표시 · 공개 · 다시 내기가 부딪히는 자리 */
async function actEdgeDue(s: MSub) {
  const due = oracleDue(s);
  if (due == null) return;
  await setClock(Math.max(nowMs, due - (chance(0.7) ? int(1, 12) : int(13, 50)) * MIN));
  note(`접수 ${s.no} 지울 날 앞`);
  const openHold = async () => {
    await attempt('고침 요청', () => requestCorrection(db, { adminId: ADMIN, submissionId: s.id, fields: ['athleteName'], views: chance(0.5) ? ['side'] : [], message: '다시', extendUploadUntil: new Date(due + int(1, 25) * DAY) }, nowDate()));
    s.uploadExpiresAt = Math.max(s.uploadExpiresAt, (await db.intakeInvitation.findUniqueOrThrow({ where: { id: s.scope.invitationId } })).uploadExpiresAt.getTime());
  };
  await pick<(x: MSub) => Promise<void>>([actAnalyze, actAnalyze, () => openHold(), () => openHold(), actPublish, actWithdraw, (x) => actFinalize(x), actPurgeDirect])(s);
  const next = oracleDue(s);
  if (next != null && next - nowMs < 10 * DAY) await setClock(Math.max(nowMs, next + pick([-1, 0, 0, 1, int(1, 70) * MIN])));
  note(`접수 ${s.no} 지울 날 넘김`);
  /* 지울 날이 지났고 아직 안 지운 틈 — 새 분석은 막혀야 한다 */
  if (chance(0.3)) await actAnalyze(s);
  await closeOut(s, true);
  if (chance(0.5)) {
    await setClock(nowMs + pick([16 * MIN, HOUR, 61 * MIN, 14 * DAY]));
    await closeOut(s, true);
  }
}

/** 판 밖 파일을 만들고 26시간 · 철회 7일 경계를 지난다 */
async function actEdgeGrace(s: MSub) {
  const row = await rowOf(s);
  const view = pick(['side', 'rear'] as const);
  if (row.status !== 'draft' && row.status !== 'correction_requested' && row.status !== 'withdrawn') {
    await attempt('고침 요청', () => requestCorrection(db, { adminId: ADMIN, submissionId: s.id, views: [view], extendUploadUntil: new Date(nowMs + 10 * DAY) }, nowDate()));
    s.uploadExpiresAt = Math.max(s.uploadExpiresAt, nowMs + 10 * DAY);
  }
  await actPick(s, view);
  const first = transfers.filter((t) => t.sub === s);
  if (first.length && chance(0.6)) await actArrive(pick(first));
  await actPick(s, view);
  if (chance(0.4)) await actWithdraw(s);
  await setClock(nowMs + pick([25 * HOUR, 26 * HOUR - 1, 26 * HOUR + 1, 30 * HOUR]));
  await closeOut(s, false);
  if (s.withdrawnAt != null) {
    await setClock(Math.max(nowMs, s.withdrawnAt + int(2, 6) * DAY));
    await closeOut(s, false);
    await setClock(Math.max(nowMs, s.withdrawnAt + WITHDRAW_GRACE + pick([-1, 0, 1])));
    await closeOut(s, false);
  }
}

/** 실제 크론 간격(5분)으로 얼마간 돌린다 — 다른 동작은 뜸하게 돌아서, 미룬 일감 · 재시도 간격이 맞물리는 차례는 여기서만 나온다 */
async function actTicks() {
  const n = int(4, 18);
  note(`크론 5분 간격 ${n}번`);
  for (let i = 0; i < n; i++) {
    await setClock(nowMs + 5 * MIN);
    await actCron();
  }
}

/** 긴 장애 — 삭제 일감이 시도를 다 써 멈춘다. 절반은 그대로 둔 채 넘어간다 */
async function actOutage() {
  const kind = pick(['remove', 'silent', 'lost', 'stat', 'partial'] as const);
  fault[kind] = 1;
  note(`긴 장애 ${kind}`);
  for (let i = 0; i < 9; i++) {
    await setClock(nowMs + int(61, 130) * MIN);
    await actCron();
  }
  if (chance(0.5)) fault[kind] = 0;
}

/** 옛 파일 하나가 안 지워진 채 새 판을 받고, 새 판의 지울 날까지 넘긴다 — 옛 표시가 새 파일의 90일을 막지 않아야 한다 */
async function actLongStuck(s: MSub) {
  const due = oracleDue(s);
  const row = await rowOf(s);
  if (due == null || row.status === 'withdrawn' || !row.currentRevisionId) return;
  const rev = await db.intakeRevision.findUniqueOrThrow({ where: { id: row.currentRevisionId } });
  const live = (await assetIn([rev.sideAssetId, rev.rearAssetId])).filter((a) => !assetGone(a.status));
  if (!live.length) return;
  fault.stuck.add(pick(live).objectPath);
  note(`접수 ${s.no} 옛 파일이 안 지워지는 저장소`);
  await setClock(Math.max(nowMs, due));
  await actCron();
  await setClock(nowMs + 16 * MIN);
  await actCron();
  const until = nowMs + 5 * DAY;
  if (await attempt('고침 요청', () => requestCorrection(db, { adminId: ADMIN, submissionId: s.id, views: ['side', 'rear'], extendUploadUntil: new Date(until) }, nowDate()))) s.uploadExpiresAt = Math.max(s.uploadExpiresAt, until);
  await actPick(s, 'side');
  await actPick(s, 'rear');
  for (const t of transfers.filter((x) => x.sub === s)) await actArrive(t, true);
  await actFinalize(s);
  await work();
  await work();
  const next = oracleDue(s);
  if (next != null && next > nowMs) await setClock(Math.max(nowMs, next - int(1, 12) * MIN));
  await pick<(x: MSub) => Promise<void>>([actAnalyze, actAnalyze, actCorrect, actRead])(s);
  const after = oracleDue(s);
  if (after != null && after - nowMs < 10 * DAY) await setClock(Math.max(nowMs, after));
  await actCron();
  if (chance(0.5)) {
    fault.stuck.clear();
    await setClock(nowMs + pick([16 * MIN, 61 * MIN, 7 * HOUR]));
    await actCron();
    return;
  }
  /* 옛 파일이 그대로 안 지워져도 새 판의 지울 날은 지켜야 한다 — 멈춘 일감이 다시 도는 시간을 준다 */
  for (let i = 0; i < 3; i++) {
    await setClock(nowMs + 7 * HOUR);
    await actCron();
  }
  const dueNow = oracleDue(s);
  if (dueNow == null || nowMs < dueNow || (await waitingReason(s, dueNow)) != null) return;
  /* 기다림이 방금 풀렸으면 미룬 일감이 아직 안 돌았다 — 한 번 더 돌린 뒤에 본다 */
  for (let i = 0; i < 2; i++) {
    await setClock(nowMs + 7 * HOUR);
    await actCron();
  }
  /*
   * 크론 안에서 삭제는 검증보다 먼저 돈다. 멈춘 검증이 다시 걸린 크론은 삭제가 '검증 중'으로 미루고 뒤이어 검증이 실패로 끝난다 — 7시간 간격이면 이 차례만 되풀이된다.
   * 실제 간격에서는 다음 15분 안에 풀린다. 미룬 일감이 다시 도는 시간을 주고 본다.
   */
  await setClock(nowMs + 16 * MIN);
  await actCron();
  if ((await waitingReason(s, dueNow)) != null) return;
  const frozenIds = (await db.intakeRevision.findMany({ where: { submissionId: s.id } })).flatMap((r) => [r.sideAssetId, r.rearAssetId]);
  for (const a of await assetIn(frozenIds)) must(assetGone(a.status), `접수 ${s.no}: 옛 표시가 멈춘 동안 지울 날이 지난 판 파일이 표시되지 않았다 — ${a.status}`);
}

/**
 * 고침 기다림은 지울 날 + 14일까지다 — 올리기 기간을 그 뒤로 늘려도, 받는 사람이 아직 고칠 수 있어도 그날이 되면 표시한다.
 * 끝 검사는 올리기 기간이 지난 뒤에 보므로 상한이 없어도 통과한다. 그래서 여기서 그날 바로 본다.
 */
async function actEdgeCap(s: MSub) {
  const due = oracleDue(s);
  const row = await db.intakeSubmission.findUniqueOrThrow({ where: { id: s.id }, include: { invitation: true } });
  if (due == null || !row.currentRevisionId || row.status === 'withdrawn' || row.invitation.status !== 'active') return;
  const frozenIds = (await db.intakeRevision.findMany({ where: { submissionId: s.id } })).flatMap((r) => [r.sideAssetId, r.rearAssetId]);
  if ((await assetIn(frozenIds)).some((a) => assetGone(a.status))) return;
  Object.assign(fault, NO_FAULT);
  fault.stuck.clear();
  await setClock(Math.max(nowMs, due - int(1, 30) * MIN));
  const until = Math.max(nowMs, due) + HOLD_CAP + 30 * DAY;
  const opened = await attempt('고침 요청', () => requestCorrection(db, { adminId: ADMIN, submissionId: s.id, fields: ['athleteName'], views: chance(0.5) ? ['side'] : [], extendUploadUntil: new Date(until) }, nowDate()));
  if (!opened) return;
  s.uploadExpiresAt = Math.max(s.uploadExpiresAt, until);
  note(`접수 ${s.no} 상한 뒤까지 고침을 엶`);
  await setClock(Math.max(nowMs, due + HOLD_CAP - 1));
  await actCron();
  await setClock(Math.max(nowMs, due + HOLD_CAP));
  await actCron();
  /* 앞서 실패한 일감은 6시간 뒤에 다시 걸린다. 미룬 일감은 15분 뒤에 돈다 */
  await setClock(nowMs + 16 * MIN);
  await actCron();
  await setClock(nowMs + 7 * HOUR);
  await actCron();
  await setClock(nowMs + 16 * MIN);
  await actCron();
  if (oracleDue(s) !== due || faulty() || (await waitingReason(s, due)) != null) return;
  for (const a of await assetIn(frozenIds)) must(assetGone(a.status), `접수 ${s.no}: 고침 기다림 상한이 지났는데 판 파일을 표시하지 않았다 — ${a.status}`);
  count('상한 확인');
}

/**
 * 저장소가 고쳐지면 표시한 파일은 날짜와 상관없이 끝까지 지운다 — 철회로 날짜가 밀려도, 새 판을 받아 시계가 다시 돌아도 그렇다.
 * 끝 검사는 모든 날이 지난 뒤에 보므로 재시도가 날짜를 다시 봐도 통과한다. 그래서 밀린 날 앞에서 여기서 본다.
 */
async function actSettle() {
  Object.assign(fault, NO_FAULT);
  fault.stuck.clear();
  const savedGap = gapRate;
  gapRate = 0;
  note('저장소 고침 · 지우던 파일 확인');
  for (let i = 0; i < 4; i++) {
    await setClock(nowMs + 7 * HOUR);
    await actCron();
  }
  gapRate = savedGap;
  const left = await db.intakeAsset.count({ where: { status: 'purging' } });
  must(left === 0, `저장소를 고치고 28시간이 지났는데 지우는 중인 파일이 ${left}개 남았다`);
}

/** 지운 뒤에 공개하면 시계가 다시 돈다. 날짜가 멀어져도 지운 원본으로 새 분석을 걸면 안 된다 — 손을 바꿔 같은 실행을 돌려주는 길을 피한다 */
async function actAfterPurge(s: MSub) {
  const row = await rowOf(s);
  const rev = row.currentRevisionId ? await db.intakeRevision.findUnique({ where: { id: row.currentRevisionId } }) : null;
  if (!rev || row.status !== 'verified') return;
  if (!(await assetIn([rev.sideAssetId, rev.rearAssetId])).every((a) => a.status === 'purged')) return;
  await actPublish(s);
  await attempt('손 정함', () => setAnalysisHand({ submissionId: s.id, adminId: ADMIN, hand: row.throwingHand === 'L' ? 'R' : 'L' }, rt));
  const r = await attempt('분석', () => startIntakeAnalysis({ submissionId: s.id, adminId: ADMIN, confirmDraftConsent: true }, rt));
  must(!r?.created, `접수 ${s.no}: 지운 원본으로 분석을 시작했다`);
  count('지운 뒤 분석 막힘');
}

/** 다음 차례로 자연스럽게 나아간다 — 접수가 뒤 단계에 닿게 */
async function actProgress(s: MSub) {
  const row = await db.intakeSubmission.findUniqueOrThrow({ where: { id: s.id }, include: { assets: true } });
  const mine = transfers.filter((t) => t.sub === s);
  if (row.status === 'draft' || row.status === 'correction_requested') {
    const correction = readCorrection(row.correction);
    const rev = row.currentRevisionId ? await db.intakeRevision.findUnique({ where: { id: row.currentRevisionId } }) : null;
    for (const view of ['side', 'rear'] as const) {
      const slot = view === 'side' ? row.sideAssetId : row.rearAssetId;
      const frozen = rev ? (view === 'side' ? rev.sideAssetId : rev.rearAssetId) : null;
      const asked = row.status === 'draft' || correction?.views.includes(view);
      if (asked && (slot == null || slot === frozen || row.assets.find((a) => a.id === slot)?.status === 'rejected')) return actPick(s, view);
    }
    if (mine.length) return actArrive(pick(mine));
    if (correction?.fields.length && chance(0.5)) await actRename(s);
    return actFinalize(s);
  }
  if (mine.length && chance(0.5)) return actArrive(pick(mine));
  if (row.status === 'submitted') {
    await work();
    return;
  }
  if (row.status === 'verified') {
    if (row.analysisStatus === 'ready' || row.analysisStatus === 'failed') return actAnalyze(s);
    if (row.analysisStatus === 'succeeded' && row.publicationStatus !== 'published') return actPublish(s);
  }
  await setClock(nowMs + (chance(0.5) ? int(5, 45) * MIN : int(1, 30) * DAY));
  await actCron();
}

const GAP_ACTIONS: readonly ((s: MSub) => Promise<void>)[] = [
  (s) => actFinalize(s),
  (s) => actFinalize(s, true),
  actPublish,
  actUnpublish,
  actWithdraw,
  actCorrect,
  actCancel,
  (s) => actPick(s, pick(['side', 'rear'] as const)),
  actAnalyze,
  actRequeue,
  actLinks,
  actPreviewLink,
  actRead,
  actPurgeDirect,
  actExtend,
  actRevoke,
  actRename,
];

/** 표시가 커밋된 뒤 · 저장소를 부르기 전 같은 틈에 다른 요청이 끼어든다 */
async function gapMaybe(where: string) {
  if (inGap || subs.length === 0 || !storageChance(gapRate)) return;
  inGap = true;
  gapsSeen++;
  try {
    count('틈');
    const s = pick(subs);
    note(`틈(${where}) 접수 ${s.no}`);
    await pick(GAP_ACTIONS)(s);
  } catch (e) {
    /* 죽음 흉내가 틈 안의 지우기에서 터진 경우 — 틈 동작만 죽은 것으로 친다 */
    if (!(e instanceof Crash) && violations.length === 0) violations.push(`#${stepNo} ${stamp()} 틈 동작 오류: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  } finally {
    inGap = false;
  }
}

/* ─────────────────────── 단계마다 ─────────────────────── */

async function checkAll() {
  const assets = await db.intakeAsset.findMany();
  const revisions = await db.intakeRevision.findMany();
  const rows = await db.intakeSubmission.findMany({ include: { publications: { select: { publishedAt: true } } } });
  const runs = await db.intakeAnalysisRun.findMany({ select: { id: true, submissionId: true, status: true, resultPath: true } });
  const audits = await db.intakeAudit.findMany({ where: { action: { in: ['originals.purged', 'originals.purge_started', 'asset.purged'] } }, select: { action: true, detail: true, submissionId: true } });
  const jobs = await db.intakeJob.findMany({ where: { kind: 'purge_originals', status: { in: ['queued', 'running'] } }, select: { payload: true } });
  const frozen = new Set(revisions.flatMap((r) => [r.sideAssetId, r.rearAssetId]));

  for (const a of assets) {
    const t = traceOf(a);
    const has = objects.has(a.objectPath);
    if (has) t.hadBytes = true;
    if (t.status !== a.status) {
      if (t.status === 'purging') must(a.status === 'purged', `'purging' 이 ${a.status} 로 갔다`);
      must(t.status !== 'purged', `'purged' 가 ${a.status} 로 갔다`);
      if (t.status === 'replaced' || t.status === 'abandoned') must(a.status === 'purged' || a.status === 'purging', `${t.status} 가 ${a.status} 로 갔다`);
      if ((a.status === 'replaced' || a.status === 'abandoned') && t.outAt == null) t.outAt = nowMs;
      t.status = a.status;
    }
    if ((a.status === 'replaced' || a.status === 'abandoned') && t.outAt == null) t.outAt = nowMs;
    must(a.status !== 'purged' || !has, `접수 ${t.sub.no}: 'purged' 인데 바이트가 있다`);
    must((a.status === 'purged') === (a.purgedAt != null), `접수 ${t.sub.no}: purgedAt 이 상태와 다르다 — ${a.status}`);
    if (frozen.has(a.id)) {
      if (t.hadBytes && !has) must(assetGone(a.status), `접수 ${t.sub.no}: 판의 원본 바이트가 없는데 상태는 ${a.status}`);
      if (assetGone(a.status)) await approveMark(a);
    } else {
      must(a.status !== 'purging', `접수 ${t.sub.no}: 판 밖 파일이 'purging' 이다`);
      if (t.hadBytes && !has) must(assetGone(a.status) || a.status === 'replaced' || a.status === 'abandoned', `접수 ${t.sub.no}: 판 밖 파일의 바이트가 없는데 상태는 ${a.status}`);
    }
  }

  await checkAbandons();

  for (const x of audits) if (x.action !== 'asset.purged') must(Number((x.detail as { assets?: number } | null)?.assets) > 0, `${x.action} 기록의 파일 수가 0 이다`);
  const sum = (submissionId: string, action: string) => audits.filter((x) => x.submissionId === submissionId && x.action === action).reduce((n, x) => n + Number((x.detail as { assets?: number } | null)?.assets ?? 0), 0);
  for (const row of rows) {
    const s = subOfId(row.id);
    assert.ok(s, '모르는 접수');
    const mine = assets.filter((a) => a.submissionId === row.id);
    const expected = oracleDue(s);
    const plan = originalRetention({ publishedAts: row.publications.map((p) => p.publishedAt), lastFrozenAt: row.lastFinalizedAt, withdrawnAt: row.withdrawnAt });
    must((plan?.purgeAt.getTime() ?? null) === expected, `접수 ${s.no}: 앱의 지울 날 ${plan?.purgeAt.toISOString()} 이 모델 ${expected == null ? null : new Date(expected).toISOString()} 과 다르다`);

    const started = mine.filter((a) => frozen.has(a.id) && assetGone(a.status)).length;
    const ended = mine.filter((a) => frozen.has(a.id) && a.status === 'purged').length;
    const loose = mine.filter((a) => !frozen.has(a.id) && a.status === 'purged').length;
    must(sum(row.id, 'originals.purge_started') === started, `접수 ${s.no}: 시작 기록 ${sum(row.id, 'originals.purge_started')} 이 표시한 파일 ${started} 과 다르다`);
    must(sum(row.id, 'originals.purged') === ended, `접수 ${s.no}: 끝 기록 ${sum(row.id, 'originals.purged')} 이 지운 파일 ${ended} 과 다르다`);
    must(audits.filter((x) => x.submissionId === row.id && x.action === 'asset.purged').length === loose, `접수 ${s.no}: 임시 파일 기록이 지운 파일 ${loose} 과 다르다`);

    const rev = revisions.find((r) => r.id === row.currentRevisionId) ?? null;
    if (row.status === 'submitted' || row.status === 'verified' || row.status === 'needs_attention') {
      const outside = mine.filter((a) => !frozen.has(a.id) && !assetGone(a.status) && a.status !== 'replaced' && a.status !== 'abandoned');
      must(outside.length === 0, `접수 ${s.no}(${row.status}): 판 밖에 살아 있는 파일 — ${outside.map((a) => a.status).join(' · ')}`);
    }
    for (const view of ['side', 'rear'] as const) {
      const slot = mine.find((a) => a.id === (view === 'side' ? row.sideAssetId : row.rearAssetId));
      if (slot) must(frozen.has(slot.id) || (slot.status !== 'replaced' && slot.status !== 'abandoned' && !assetGone(slot.status)), `접수 ${s.no}: 칸이 내려온 파일을 가리킨다 — ${slot.status}`);
      const held = mine.find((a) => a.id === (view === 'side' ? rev?.sideAssetId : rev?.rearAssetId));
      if (row.status === 'correction_requested' && held && assetGone(held.status)) {
        must(readCorrection(row.correction)?.views.includes(view), `접수 ${s.no}: 지운 ${view} 칸이 고침 요청에 없다`);
      }
    }
    const active = jobs.filter((j) => (j.payload as { submissionId?: string }).submissionId === row.id).length;
    must(active <= 1, `접수 ${s.no}: 도는 삭제 일감이 ${active}개다`);
  }

  for (const run of runs) if (run.status === 'succeeded') must(run.resultPath && objects.has(run.resultPath), `실행 ${run.id}: 결과 JSON 이 없어졌다`);
}

/**
 * 파일을 버린 순간의 사실로 본다 — 받는 사람이 고른 파일을 칸에서 내리는 일이라, 올리기 기간이 끝나고 여유가 지난 뒤에만 된다.
 * 전송 중인 파일은 기간이 끝났거나 폐기됐어야 하고, 도착한 파일은 거기서 26시간이 더 지났어야 한다. 철회한 접수는 7일 뒤다.
 * 값은 트리거가 버리는 그 트랜잭션 안에서 적어서, 그사이 관리자가 기간을 늘렸으면 늘린 값이 보인다.
 */
async function checkAbandons() {
  const rows = await db.$queryRaw<{ assetId: string; was: string; at: Date; uploadExpiresAt: Date; invStatus: string; revokedAt: Date | null; subStatus: string; withdrawnAt: Date | null }[]>`SELECT * FROM "SimAbandon"`;
  await db.$executeRaw`DELETE FROM "SimAbandon"`;
  for (const r of rows) {
    const t = trace.get(r.assetId);
    const no = t?.sub.no ?? '?';
    const at = r.at.getTime();
    const transit = r.was === 'reserved' || r.was === 'uploading';
    const closed = r.invStatus === 'revoked' || r.uploadExpiresAt.getTime() < at;
    const overdue = r.uploadExpiresAt.getTime() + STALE_GRACE < at || (r.invStatus === 'revoked' && (r.revokedAt == null || r.revokedAt.getTime() + STALE_GRACE < at));
    const graceOver = r.subStatus === 'withdrawn' && r.withdrawnAt != null && r.withdrawnAt.getTime() + WITHDRAW_GRACE <= at;
    must(graceOver || (transit ? closed : overdue), `접수 ${no}: 아직 올릴 수 있는데 파일을 버렸다 — ${r.was} · ${r.subStatus} · 초대 ${r.invStatus} · 기간 끝 ${r.uploadExpiresAt.toISOString()}`);
  }
}

/* ─────────────────────── 씨앗 하나 ─────────────────────── */

function resetModel(seed: number) {
  rngState = seed * 2654435761;
  storageRngState = seed;
  idState = seed;
  nowMs = T0;
  subs = [];
  trace = new Map();
  transfers = [];
  gpuJobs = [];
  written = [];
  previewsGone = new Set();
  violations = [];
  log = [];
  stepNo = 0;
  inGap = false;
  crashNext = null;
  gapRate = pick([0, 0.2, 0.6]);
  if (process.env.FUZZ_GAP) gapRate = Number(process.env.FUZZ_GAP);
  Object.assign(fault, NO_FAULT);
  fault.stuck.clear();
  objects.clear();
  justRemoved.clear();
}

const TABLES = ['SimAbandon', 'IntakeRateLimit', 'IntakeJob', 'IntakeAdminRead', 'IntakeAdminNote', 'IntakeAudit', 'IntakePublication', 'IntakeAnalysisRun', 'IntakeConsent', 'IntakeAsset', 'IntakeRevision', 'IntakeSubmission', 'IntakeInvitation'];

const flush = () => {
  if (violations.length) throw new Error(`불변식 위반: ${violations[0]}`);
};

async function oneStep() {
  const s = subs.length ? pick(subs) : await actNew();
  const roll = rand();
  if (roll < 0.05 && subs.length < 4) {
    await actNew();
  } else if (roll < 0.36) {
    await actProgress(s);
  } else if (roll < 0.47) {
    await actAdvance();
  } else if (roll < 0.53) {
    await actCron();
  } else if (roll < 0.57) {
    actFault();
  } else if (roll < 0.59) {
    await actCrash(s);
  } else if (roll < 0.61) {
    await actOverlap(s);
  } else if (roll < 0.64) {
    await actRead(s);
  } else if (roll < 0.67) {
    if (transfers.length) await actArrive(pick(transfers));
  } else if (roll < 0.73) {
    await actEdgeDue(s);
  } else if (roll < 0.78) {
    await actEdgeGrace(s);
  } else if (roll < 0.8) {
    await actOutage();
  } else if (roll < 0.82) {
    await actLongStuck(s);
  } else if (roll < 0.84) {
    await actTicks();
  } else if (roll < 0.85) {
    await actEdgeCap(s);
  } else if (roll < 0.87) {
    await actSettle();
  } else {
    const finished = s.finalized.length > 0;
    await pick<(x: MSub) => Promise<void>>([
      ...(finished ? [actCorrect, actCorrect, actCorrect, actCancel, actWithdraw, actPublish, actUnpublish, actAnalyze, actHand, actLinks, actPreviewLink] : [actWithdraw, actExtend]),
      ...(chance(0.25) ? [actRevoke] : []),
      actExtend,
      actRename,
      actRequeue,
      actPurgeDirect,
      (x) => actFinalize(x, true),
      (x) => actPick(x, pick(['side', 'rear'] as const)),
      actResume,
      actAfterPurge,
    ])(s);
  }
}

/** 저장소를 고치고 모든 기다림이 끝나게 시간을 보낸다 */
async function drain() {
  Object.assign(fault, NO_FAULT);
  fault.stuck.clear();
  gapRate = 0;
  note('── 저장소 고침 · 끝 검사 ──');
  for (const t of [...transfers]) if (chance(0.5)) await actArrive(t);
  transfers = [];

  const round = async (ms: number) => {
    await setClock(nowMs + ms);
    await actCron();
    flush();
    await checkAll();
    flush();
  };
  for (const ms of [16 * MIN, HOUR, 7 * HOUR]) await round(ms);

  const horizon = Math.max(nowMs, ...subs.flatMap((s) => [oracleDue(s) ?? 0, s.uploadExpiresAt])) + 15 * DAY;
  await setClock(horizon);
  note('끝 시각으로 감');
  for (let i = 0; i < 16; i++) {
    await round(7 * HOUR);
    const open = await db.intakeAsset.count({ where: { status: { not: 'purged' } } });
    const active = await db.intakeJob.count({ where: { status: { in: ['queued', 'running'] } } });
    if (open === 0 && active === 0 && i >= 2) break;
    count(`끝.회차${i}`);
    if (process.env.V) note(`끝 ${i}회: 남은 파일 ${open} · 도는 일감 ${active}`);
  }

  const assets = await db.intakeAsset.findMany();
  const revisions = await db.intakeRevision.findMany();
  const frozen = new Set(revisions.flatMap((r) => [r.sideAssetId, r.rearAssetId]));
  for (const a of assets) {
    const t = traceOf(a);
    must(a.status !== 'purging', `접수 ${t.sub.no}: 끝난 뒤에도 'purging' 이 남았다`);
    must(a.status === 'purged', `접수 ${t.sub.no}: ${frozen.has(a.id) ? '판의' : '판 밖'} 파일이 끝까지 안 지워졌다 — ${a.status}`);
    must(!objects.has(a.objectPath), `접수 ${t.sub.no}: 바이트가 끝까지 남았다`);
    count(frozen.has(a.id) ? '삭제.원본' : '삭제.임시');
  }
  /* 입력 원본을 지우기로 한 뒤에 올라온 미리보기는 문서에 적힌 위험이다 */
  const late = new Set<string>();
  for (const w of written) {
    if (!objects.has(w.path)) continue;
    const run = await db.intakeAnalysisRun.findUniqueOrThrow({ where: { id: w.runId }, include: { revision: true } });
    const marks = [run.revision.sideAssetId, run.revision.rearAssetId].map((id) => trace.get(id)?.markedAt).filter((t): t is number => t != null);
    if (marks.length && w.at >= Math.min(...marks)) late.add(w.path);
  }
  const left = [...objects.keys()].filter((p) => !p.endsWith('/analysis.json') && !late.has(p));
  must(left.length === 0, `저장소에 남은 파일: ${left.join(' · ')}`);
  count('늦은 미리보기', late.size);

  const ends = await db.intakeAudit.findMany({ where: { action: 'originals.purged' }, select: { detail: true } });
  const called = ends.reduce((n, x) => n + Number((x.detail as { previewPaths?: number } | null)?.previewPaths ?? 0), 0);
  must(called >= previewsGone.size, `끝 기록의 미리보기 경로 ${called}개가 실제로 지운 ${previewsGone.size}개보다 적다`);

  must((await db.intakeJob.count({ where: { kind: 'purge_originals', status: { in: ['queued', 'running'] } } })) === 0, '끝났는데 도는 삭제 일감이 남았다');

  /* 줄은 닫히지 않아도 된다(머리글). 사람이 보는 상세에 풀 수 없는 경고가 남으면 안 된다 */
  const stuckJobs = await db.intakeJob.findMany({ where: { kind: 'purge_originals', status: 'failed' }, select: { lastError: true } });
  count('멈춘 일감 남음', stuckJobs.length);
  must(stuckJobs.every((j) => j.lastError?.startsWith('임대가 끝났고')), `끝난 뒤에도 멈춘 삭제 일감이 있다 — ${stuckJobs[0]?.lastError}`);
  for (const s of subs) {
    const issues = (await loadIntakeDetail(db, ACTOR, s.id, nowDate())).jobIssues.filter((j) => j.kind === 'purge_originals');
    must(issues.length === 0, `접수 ${s.no}: 다 지운 접수의 상세에 삭제 일감 경고가 남았다 — ${issues[0]?.lastError}`);
  }

  for (const s of subs) {
    const row = await db.intakeSubmission.findUniqueOrThrow({ where: { id: s.id }, include: { invitation: true } });
    const active = await db.intakePublication.findUnique({ where: { activeFor: s.id } });
    if (active && row.status !== 'withdrawn' && row.invitation.status === 'active') {
      const opened = await attempt('공개 결과', () => loadPublicResult(s.scope, {}, rt));
      must(opened, `접수 ${s.no}: 원본을 지운 뒤 공개 결과가 안 열린다`);
    }
    await actRead(s);
  }
}

async function runSeed(seed: number) {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
  resetModel(seed);
  await db.$executeRaw`UPDATE "SimClock" SET "now" = ${nowDate()}`;
  try {
    for (stepNo = 1; stepNo <= FUZZ_STEPS; stepNo++) {
      await oneStep();
      flush();
      await checkAll();
      flush();
    }
    await drain();
    flush();
  } catch (e) {
    console.log(`\n씨앗 ${seed} 실패(틈 비율 ${gapRate}): ${e instanceof Error ? e.message : String(e)}`);
    if (!(e instanceof Error && e.message.startsWith('불변식 위반'))) console.log(e instanceof Error ? e.stack : '');
    console.log(`다시 돌리기: FUZZ_SEED=${seed} V=1 npm run -s intake:retention-fuzz`);
    console.log(log.slice(-40).join('\n'));
    return false;
  }
  return true;
}

const workers = envInt('FUZZ_JOBS', 1);
const deadline = envInt('FUZZ_DEADLINE', realNow() + FUZZ_MS);
let seeds = 0;
let steps = 0;
let failed = false;
if (ONE_SEED != null) {
  failed = !(await runSeed(ONE_SEED));
  console.log(failed ? '실패' : `씨앗 ${ONE_SEED} 통과 — 단계 ${FUZZ_STEPS}개`);
  if (process.env.V) console.log(Object.entries(counters).sort().map(([k, v]) => `${k}=${v}`).join(' '));
} else {
  for (let seed = FUZZ_FROM + WORKER!; realNow() < deadline; seed += workers) {
    const ok = await runSeed(seed);
    seeds++;
    steps += stepNo;
    if (!ok) {
      failed = true;
      break;
    }
  }
  console.log(`FUZZ_REPORT ${JSON.stringify({ seeds, steps, counters } satisfies WorkerReport)}`);
}
await rawDb.$disconnect();
await socket.stop();
await pg.close();
process.exit(failed ? 1 : 0);
