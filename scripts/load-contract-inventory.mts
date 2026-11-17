/**
 * EX-LOAD01 — 장비 기록 계약 인벤토리(읽기만).
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/load-contract-inventory.mts [--out=<폴더>]
 *
 * 하는 일(쓰지 않는다 — 모든 조회를 `SET TRANSACTION READ ONLY` 거래 안에서):
 *   1. 운동 라이브러리 줄마다 지금 장비로 기록 계약을 풀어 방식(모드)별로 센다.
 *   2. 장비만으로 뜻이 안 정해지는 운동(unresolved) · 밴드 운동(역할을 세트마다 고름) · 밴드+무게(같이/골라 쓰기 미정)를 운동 id · 이름 ·
 *      장비와 함께 적는다(라이브러리 자료 — 사용자 자료 아님). 제목 낱말은 '제안' 열에만 쓰고 판단에는 쓰지 않는다.
 *   3. 근력 프로그램 본운동 규칙(variantCandidates — squat · hinge · push · ohp · pull)의 후보 가운데 자유 중량 한 묶음인 것 →
 *      1RM 허용 목록 후보.
 *   4. 지난 세트의 kg 이 어떤 근거로 읽힐지(판에 얼린 계약 · 판에 얼린 장비 · 판 없음)를 **모드별 개수만** 센다 — 사용자 id · 값은 찍지 않는다.
 * 결과는 --out 폴더(기본 ~/bullpen-load01-evidence/inventory)에 JSON 으로, 요약은 표준 출력에.
 *
 * EX-LOAD01 R1-04 — 관리자 뜻 설정(ExerciseVideo.loadSemantics)과 출시 차단 항목:
 *   - 새로 읽기(위 명령): WORKOUT_LOAD_SCHEMA=1 일 때만 같은 읽기 전용 거래 안에서 loadSemantics 를 읽어 앞서는 차례(semantics.ts)대로 쓴다.
 *     꺼져 있으면 그 칸 이름이 든 SQL 을 보내지 않고 코드 검토 표만 쓴다. 저장값 판단(읽음 · 못 읽음 · 출처)을 센다.
 *   - 캐시 다시 셈(DB 없음): --recompute=<이전 인벤토리 JSON>
 *       node --import ./scripts/alias-register.mjs scripts/load-contract-inventory.mts --recompute=~/bullpen-load01-evidence/inventory/load-contract-inventory.json
 *     이전에 읽어 둔 라이브러리 줄(id · 장비 · 분류 · 숨김)을 지금 해석기 · 코드 검토 표로 다시 푼다. 새로 읽은 인벤토리가 아니다 —
 *     그 뒤에 바뀐 라이브러리 줄 · 저장된 뜻 설정은 모른다(결과 JSON 의 basis 에 적는다). DATABASE_URL 을 읽지 않는다.
 *   - 둘 다 blockers 를 낸다: 보이는 운동 가운데 미정(unresolved) · 근력 프로그램 본운동 후보인데 추정 1RM 이 없는 것(% 칸에 기준 무게가 없다).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { EXERCISE_EQUIPMENT } from '@/lib/exercise-meta';
import { resolveRecordingContract, type RecordingContract } from '@/lib/workout/load/contract';
import { overridesFor, overridesSourceFor } from '@/lib/workout/load/overrides';
import { readLoadSemantics, readStoredSemanticsRows } from '@/lib/workout/load/semantics';
import { variantCandidates, type VariantKey } from '@/lib/program/program';

const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT = outArg ? outArg.slice('--out='.length) : join(homedir(), 'bullpen-load01-evidence', 'inventory');
const recomputeArg = process.argv.find((a) => a.startsWith('--recompute='));
const RECOMPUTE = recomputeArg ? recomputeArg.slice('--recompute='.length).replace(/^~(?=\/)/, homedir()) : null;
/* 스키마 스위치 — lib/workout/load/server.ts loadStructured 와 같은 값(그 파일은 server-only 라 스크립트가 부르지 않는다) */
const STRUCTURED = process.env.WORKOUT_LOAD_SCHEMA === '1';

type Row = {
  id: string;
  title: string;
  category: string;
  equipment: string[];
  movementPattern: string | null;
  reps: number | null;
  holdSeconds: number | null;
  intensity: string;
  difficulty: string | null;
  perSide: boolean;
  hiddenAt: Date | null;
};

const MAIN_LIFTS: VariantKey[] = ['squat', 'hinge', 'push', 'ohp', 'pull'];

/** stored: undefined = 저장 칸을 읽지 않음(스위치 꺼짐 · 캐시 다시 셈) — 코드 검토 표만 */
function contractOf(r: Row, stored?: unknown): RecordingContract {
  return resolveRecordingContract({
    exerciseId: r.id,
    equipment: r.equipment,
    category: r.category,
    isHold: r.holdSeconds != null && r.reps == null,
    movementPattern: r.movementPattern,
    overrides: overridesFor(r.id, stored),
  });
}

/** 출시 차단 항목(R1-04) — 보이는 미정 · 본운동 후보인데 1RM 없음. 숨긴 미정은 따로 적는다(차단 아님 · 새 일정에 안 나온다) */
function blockersOf(
  rows: readonly { id: string; title: string; hidden: boolean; equipment: string[] }[],
  contracts: Map<string, RecordingContract>,
  candidates: readonly { id: string; title: string; variants: string[]; hold: boolean }[]
) {
  const hiddenOf = new Map(rows.map((r) => [r.id, r.hidden]));
  const unresolved = rows
    .filter((r) => contracts.get(r.id)?.mode === 'unresolved')
    .map((r) => ({ id: r.id, title: r.title, equipment: r.equipment, hidden: r.hidden, reason: contracts.get(r.id)!.reason }));
  const programWithoutE1rm = candidates
    .filter((c) => hiddenOf.get(c.id) === false)
    .map((c) => {
      const k = contracts.get(c.id);
      const shapeOk = !!k && k.readiness === 'ready' && k.mode === 'externalMass' && k.massBasis !== 'added' && !c.hold;
      return { id: c.id, title: c.title, variants: c.variants, mode: k?.mode ?? 'missing', shapeOk, e1rm: shapeOk && !!k?.e1rmEligible };
    })
    .filter((c) => !c.e1rm);
  return {
    visibleUnresolved: unresolved.filter((u) => !u.hidden),
    hiddenUnresolved: unresolved.filter((u) => u.hidden),
    /* % 방식 칸에 고정되면 기준 무게(TM)가 없어 숫자 없이 안내한다 — 실제 회차 고정 목록과 맞춰 볼 것(README) */
    programMainLiftWithoutE1rm: programWithoutE1rm,
    visibleBandRolePerSet: rows.filter((r) => !r.hidden && contracts.get(r.id)?.mode === 'band' && contracts.get(r.id)?.bandRole == null).length,
  };
}

/** --recompute — 이전 인벤토리 JSON 의 라이브러리 줄을 지금 해석기로 다시 푼다(DB 없음) */
function recompute(file: string) {
  type Cached = {
    generatedAt: string;
    exercises: number;
    byMode: Record<string, number>;
    library: { id: string; title: string; category: string; equipment: string[]; hidden: boolean; movementPattern: string | null }[];
    e1rmCandidates: { id: string; title: string; variants: string[]; why: string | null }[];
  };
  const cached = JSON.parse(readFileSync(file, 'utf8')) as Cached;
  const contracts = new Map(
    cached.library.map((r) => [
      r.id,
      /* 이전 JSON 에는 횟수 · 버티기 칸이 없다 — 방식(모드)은 그 칸과 상관없고, 1RM 의 버티기 여부는 후보의 why 로 본다 */
      contractOf({ ...r, reps: null, holdSeconds: null, intensity: '', difficulty: null, perSide: false, hiddenAt: r.hidden ? new Date(0) : null }),
    ])
  );
  const byMode: Record<string, number> = {};
  const visibleByMode: Record<string, number> = {};
  for (const r of cached.library) {
    const m = contracts.get(r.id)!.mode;
    byMode[m] = (byMode[m] ?? 0) + 1;
    if (!r.hidden) visibleByMode[m] = (visibleByMode[m] ?? 0) + 1;
  }
  const blockers = blockersOf(
    cached.library,
    contracts,
    cached.e1rmCandidates.map((c) => ({ id: c.id, title: c.title, variants: c.variants, hold: c.why === 'hold' }))
  );
  const report = {
    basis: 'cached-recompute',
    note: '이전에 읽어 둔 라이브러리 줄을 지금 해석기 · 코드 검토 표로 다시 푼 것. 새로 읽은 인벤토리가 아니다 — 그 뒤에 바뀐 줄 · 저장된 뜻 설정(loadSemantics)은 모른다.',
    source: file,
    sourceGeneratedAt: cached.generatedAt,
    recomputedAt: new Date().toISOString(),
    exercises: cached.library.length,
    originalByMode: cached.byMode,
    byMode,
    visibleByMode,
    blockers,
    library: cached.library.map((r) => {
      const c = contracts.get(r.id)!;
      return { id: r.id, title: r.title, hidden: r.hidden, mode: c.mode, basis: c.massBasis, role: c.bandRole, e1rm: c.e1rmEligible, reason: c.reason, overridesSource: overridesSourceFor(r.id) };
    }),
  };
  mkdirSync(OUT, { recursive: true });
  const out = join(OUT, 'load-contract-inventory-recomputed.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ file: out, basis: report.basis, source: file, exercises: report.exercises, originalByMode: cached.byMode, byMode, visibleByMode, blockers: { visibleUnresolved: blockers.visibleUnresolved, hiddenUnresolved: blockers.hiddenUnresolved, programMainLiftWithoutE1rm: blockers.programMainLiftWithoutE1rm.length, visibleBandRolePerSet: blockers.visibleBandRolePerSet } }, null, 2));
}

async function main() {
  if (RECOMPUTE) return recompute(RECOMPUTE);
  /* 새로 읽기만 DB 를 연다(--recompute 는 DATABASE_URL 을 읽지 않는다) */
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await fresh(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function fresh(prisma: import('@prisma/client').PrismaClient) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const rows = (await tx.exerciseVideo.findMany({
      select: {
        id: true,
        title: true,
        category: true,
        equipment: true,
        movementPattern: true,
        reps: true,
        holdSeconds: true,
        intensity: true,
        difficulty: true,
        perSide: true,
        hiddenAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })) as Row[];

    /* 지난 kg 세트의 근거별 개수 — 운동 id 별 집계만(사용자 · 값 없음) */
    const evidence = await tx.$queryRaw<{ exerciseId: string; inPlan: boolean; frozenContract: boolean; n: bigint }[]>`
      SELECT s."exerciseId",
             (e.elem IS NOT NULL) AS "inPlan",
             (e.elem IS NOT NULL AND e.elem ? 'load') AS "frozenContract",
             COUNT(*) AS n
        FROM "UserExerciseSet" s
        JOIN "TrainingSession" t ON t."id" = s."sessionId"
        LEFT JOIN LATERAL (
          SELECT x AS elem FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t."plan"->'exercises') = 'array' THEN t."plan"->'exercises' ELSE '[]'::jsonb END) x
           WHERE x->>'id' = s."exerciseId" LIMIT 1
        ) e ON TRUE
       WHERE s."weightKg" IS NOT NULL AND s."weightKg" > 0
       GROUP BY 1, 2, 3`;
    const logKg = await tx.$queryRaw<{ exerciseId: string; n: bigint }[]>`
      SELECT "exerciseId", COUNT(*) AS n FROM "UserExerciseLog" WHERE "weightKg" IS NOT NULL AND "weightKg" > 0 GROUP BY 1`;
    /* R1-04 — 관리자 뜻 설정은 스위치가 켜졌을 때만(꺼져 있으면 그 칸 이름이 든 SQL 을 보내지 않는다) */
    const stored = STRUCTURED ? new Map(await readStoredSemanticsRows(tx)) : null;
    return { rows, evidence, logKg, stored };
  });

  const { rows, evidence, logKg, stored } = result;
  /* 스위치가 켜졌으면 저장 칸을 읽은 것이라 없는 운동은 null(코드 표), 꺼졌으면 undefined(코드 표 — 예전과 같음) */
  const storedOf = (id: string) => (stored ? (stored.get(id) ?? null) : undefined);
  const contracts = new Map(rows.map((r) => [r.id, contractOf(r, storedOf(r.id))]));
  const semantics = stored
    ? {
        read: true,
        stored: stored.size,
        unsupported: [...stored].filter(([, v]) => readLoadSemantics(v).kind === 'unsupported').map(([id]) => id),
        bySource: rows.reduce<Record<string, number>>((m, r) => {
          const k = overridesSourceFor(r.id, storedOf(r.id));
          m[k] = (m[k] ?? 0) + 1;
          return m;
        }, {}),
      }
    : { read: false, note: 'WORKOUT_LOAD_SCHEMA 꺼짐 — loadSemantics 를 묻지 않고 코드 검토 표만 썼다' };
  const byMode: Record<string, number> = {};
  const visibleByMode: Record<string, number> = {};
  for (const r of rows) {
    const m = contracts.get(r.id)!.mode;
    byMode[m] = (byMode[m] ?? 0) + 1;
    if (!r.hiddenAt) visibleByMode[m] = (visibleByMode[m] ?? 0) + 1;
  }

  const brief = (r: Row) => ({ id: r.id, title: r.title, category: r.category, equipment: r.equipment, hidden: !!r.hiddenAt });
  const unresolved = rows
    .filter((r) => contracts.get(r.id)!.mode === 'unresolved')
    .map((r) => ({ ...brief(r), reason: contracts.get(r.id)!.reason }));
  const band = rows
    .filter((r) => contracts.get(r.id)!.mode === 'band')
    .map((r) => ({
      ...brief(r),
      /* 제안일 뿐 — 판단에 쓰지 않는다 */
      titleSuggestsAssistance: /어시스트|보조|assist/i.test(r.title),
    }));

  /* 근력 프로그램 본운동 후보(모든 장비 · 경력 모름 · 성인) — 자유 중량 한 묶음만 1RM 허용 후보 */
  const allEquipment = [...EXERCISE_EQUIPMENT];
  const visible = rows.filter((r) => !r.hiddenAt);
  const lib = visible.map((r) => ({ ...r }));
  const e1rmCandidates = new Map<string, { id: string; title: string; equipment: string[]; variants: string[]; mode: string; basis: string | null; ok: boolean; why: string | null }>();
  for (const v of MAIN_LIFTS) {
    for (const lvl of [null, '입문', '초급', '중급', '상급'] as const) {
      for (const ex of variantCandidates(v, lib, allEquipment, lvl)) {
        const c = contracts.get(ex.id)!;
        const isHold = ex.holdSeconds != null && ex.reps == null;
        const ok = c.mode === 'externalMass' && c.readiness === 'ready' && c.massBasis !== 'added' && !isHold;
        const prev = e1rmCandidates.get(ex.id);
        const variants = [...new Set([...(prev?.variants ?? []), v])];
        e1rmCandidates.set(ex.id, {
          id: ex.id,
          title: ex.title,
          equipment: ex.equipment,
          variants,
          mode: c.mode,
          basis: c.massBasis,
          ok,
          why: ok ? null : isHold ? 'hold' : `mode:${c.mode}`,
        });
      }
    }
  }

  /* 지난 kg 세트 — 근거 × 지금 모드 */
  const evidenceTable: Record<string, number> = {};
  for (const e of evidence) {
    const c = contracts.get(e.exerciseId);
    const mode = c?.mode ?? 'deleted-exercise';
    const ev = e.frozenContract ? 'contract' : e.inPlan ? 'equipment' : 'no-plan';
    const k = `${ev}|${mode}`;
    evidenceTable[k] = (evidenceTable[k] ?? 0) + Number(e.n);
  }
  const logTable: Record<string, number> = {};
  for (const l of logKg) {
    const mode = contracts.get(l.exerciseId)?.mode ?? 'deleted-exercise';
    logTable[mode] = (logTable[mode] ?? 0) + Number(l.n);
  }

  const pogo = rows.find((r) => r.id === '258c0eee-85fe-46dd-b6a1-d2639bb58345');
  const blockers = blockersOf(
    rows.map((r) => ({ id: r.id, title: r.title, hidden: !!r.hiddenAt, equipment: r.equipment })),
    contracts,
    [...e1rmCandidates.values()].map((c) => ({ id: c.id, title: c.title, variants: c.variants, hold: c.why === 'hold' }))
  );
  const report = {
    basis: 'fresh-read-only',
    generatedAt: new Date().toISOString(),
    exercises: rows.length,
    semantics,
    blockers,
    byMode,
    visibleByMode,
    pogo: pogo ? { ...brief(pogo), contract: contracts.get(pogo.id) } : null,
    unresolved,
    band,
    e1rmCandidates: [...e1rmCandidates.values()].sort((a, b) => a.title.localeCompare(b.title)),
    /* 라이브러리 줄 전체(운동 자료 — 사용자 자료 아님)와 풀린 방식 · 뜻 — 검토용 */
    library: rows.map((r) => {
      const c = contracts.get(r.id)!;
      return { ...brief(r), movementPattern: r.movementPattern, mode: c.mode, basis: c.massBasis, family: c.apparatusFamily, role: c.bandRole, e1rm: c.e1rmEligible, reason: c.reason, overridesSource: overridesSourceFor(r.id, storedOf(r.id)) };
    }),
    legacyKgSets: evidenceTable,
    legacyKgDailyLogs: logTable,
  };
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, 'load-contract-inventory.json');
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ file, basis: report.basis, exercises: rows.length, byMode, visibleByMode, unresolved: unresolved.length, band: band.length, e1rmCandidates: report.e1rmCandidates.length, e1rmOk: report.e1rmCandidates.filter((c) => c.ok).length, semantics, blockers: { visibleUnresolved: blockers.visibleUnresolved, hiddenUnresolved: blockers.hiddenUnresolved, programMainLiftWithoutE1rm: blockers.programMainLiftWithoutE1rm.length, visibleBandRolePerSet: blockers.visibleBandRolePerSet }, legacyKgSets: evidenceTable, legacyKgDailyLogs: logTable, pogo: report.pogo ? { mode: report.pogo.contract?.mode, equipment: report.pogo.equipment } : null }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
