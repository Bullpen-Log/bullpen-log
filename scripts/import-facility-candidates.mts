/**
 * 덕아웃 수집 후보 가져오기 — 레슨 · 연습장 통합 자료(combined-facilities.json, 2026-10-26 · 430곳) 또는
 * 야구장 조사 파일(baseball-field-usage-*.json, 2026-10-27 · 672곳 — fields · metadata 가 있으면 야구장으로 읽는다)을 FacilityCandidate 표에 잇는다.
 *
 *   npm run candidates:import -- <파일.json>            # 시험 실행 — DB 를 읽기만 하고 계획 · 결과 파일만 남긴다
 *   npm run candidates:import -- <파일.json> --apply    # DB 에 씀(이 저장소의 DB 는 운영 DB 하나 — npm run backup 먼저)
 *
 * 두 자료는 같은 표의 다른 묶음이다 — 계획은 같은 종류의 기존 행(야구장은 분류 '야구장 후보')끼리만 견준다. 다른 종류와 이름 · 주소가 같은 곳은 알리기만 한다.
 *
 * 규칙(lib/market/candidates.ts planImport):
 * - candidates 배열만 후보다. 연결표 · 통합 이력 · 주소 검토로는 행을 만들지 않는다. 약속(처음 상태 · 숫자 · 연결)이 하나라도 깨지면 아무것도 안 쓴다.
 * - 기존 행은 이전 id(sourceCandidateIds) · 지도 장소 id 로 찾아 수집 칸만 고친다 — 기본키 · 연락 · 동의 · 확인 · 승인 · 메모 · 전화 칸은 건드리지 않는다.
 * - 같은 장소로 통합된 이전 행은 지우지 않고 대표 행으로 잇는다(mergedIntoId). 관리자 기록이 있으면 잇지 않는다.
 * - 바뀐 collected 는 collectedHistory 에 쌓는다. 자료에 없는 기존 행은 지우지 않는다. 같은 파일을 다시 돌리면 아무것도 안 바뀐다.
 * 결과(계획 · 충돌 · 숫자)는 ~/bullpen-log-backups/candidates-import-<시각>.json 에 남는다(원본 자료는 고치지 않는다).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { type ExistingCandidate, type ImportPlan, planImport, readCombinedFile } from '../lib/market/candidates.ts';
import { ACCESS_NOTICE, FIELD_OPERATION_NOTICE, IDENTITY_NOTICE, isFieldType, readFieldReviewFile } from '../lib/market/field-candidates.ts';

const [file, ...flags] = process.argv.slice(2).filter((a) => a !== '--');
if (!file) {
  console.error('쓰는 법: npm run candidates:import -- <파일.json> [--apply]');
  process.exit(1);
}
const apply = flags.includes('--apply');
const raw = JSON.parse(readFileSync(file, 'utf8'));
const isField = Array.isArray(raw?.fields) && !!raw?.metadata;
const label = isField ? '야구장 조사 파일' : '통합 자료';
const { file: data, errors } = isField ? readFieldReviewFile(raw) : readCombinedFile(raw);
if (!data) {
  console.error(`자료 약속이 깨져 아무것도 안 썼어요(${errors.length}):`);
  for (const e of errors.slice(0, 30)) console.error(`  - ${e}`);
  process.exit(1);
}

/* 표에 아직 없을 수 있는 칸(2026-10-26 마이그레이션 전) — 시험 실행은 그래도 돌게 기본값으로 읽는다 */
const NEW_COLUMNS: Record<string, string> = {
  operationNotice: 'NULL::text',
  originGroup: 'NULL::text',
  reviewTags: 'ARRAY[]::text[]',
  mergedIntoId: 'NULL::text',
  offersHardball: 'NULL::boolean',
  phone: 'NULL::text',
  consentScope: 'NULL::text',
  accessNotice: 'NULL::text',
  identityNotice: 'NULL::text',
};
const COLUMNS = [
  'id', 'coordsEdited', 'name', 'typeHint', 'region', 'district', 'roadAddress', 'address', 'lat', 'lng', 'mapStatus', 'lessonNotice',
  'rentalNotice', 'hardballNotice', 'sharedPlaceGroup', 'duplicateGroup', 'collected', 'collectedAt', 'collectionStatus', 'businessStatus',
  'contactStatus', 'consentStatus', 'offersLessons', 'offersRental', 'verifiedAt', 'lastContactedAt', 'adminNote', 'approvedAt',
  ...Object.keys(NEW_COLUMNS),
];

/** 계획을 메모리에서 돌린 뒤의 행들 — 두 번째 실행이 아무것도 안 바꾸는지 보려고 */
function applyInMemory(rows: ExistingCandidate[], plan: ImportPlan): ExistingCandidate[] {
  const next = new Map(rows.map((r) => [r.id, { ...r }]));
  for (const o of plan.ops) {
    if (o.kind === 'create') next.set(o.id, { ...(blank(o.id) as ExistingCandidate), ...o.data });
    if (o.kind === 'update') Object.assign(next.get(o.id)!, o.data);
    if (o.kind === 'merge') next.get(o.id)!.mergedIntoId = o.into;
  }
  return [...next.values()];
}
const blank = (id: string): Partial<ExistingCandidate> => ({
  id, mergedIntoId: null, coordsEdited: false, collectionStatus: 'UNVERIFIED', businessStatus: 'UNKNOWN', contactStatus: 'NOT_CONTACTED',
  consentStatus: 'NOT_REQUESTED', offersLessons: null, offersRental: null, offersHardball: null, phone: null, consentScope: null,
  verifiedAt: null, lastContactedAt: null, adminNote: null, approvedAt: null,
});

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) });
try {
  const have = new Set(
    (await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'FacilityCandidate'`).map((c) => c.column_name)
  );
  const missing = Object.keys(NEW_COLUMNS).filter((c) => !have.has(c));
  if (apply && missing.length) {
    console.error(`표에 새 칸이 아직 없어요(${missing.join(', ')}) — 마이그레이션(npx prisma migrate deploy)부터`);
    process.exit(1);
  }
  const select = COLUMNS.map((c) => (have.has(c) ? `"${c}"` : `${NEW_COLUMNS[c]} AS "${c}"`)).join(', ');
  const all = await prisma.$queryRawUnsafe<ExistingCandidate[]>(`SELECT ${select} FROM "FacilityCandidate"`);
  const existing = all.filter((r) => isFieldType(r.typeHint) === isField);
  const [venues, lessonOrgs] = await Promise.all([prisma.venue.count(), prisma.org.count({ where: { kind: 'LESSON' } })]);

  const plan = planImport(data, existing);
  const again = planImport(data, applyInMemory(existing, plan));
  /* 새로 만들 후보가 이미 있는 다른 기록과 이름 또는 주소가 같은지 — 같은 곳일 수 있어 알리기만(합치지 않음) */
  const norm = (v: string | null | undefined) => (v ?? '').replace(/[\s·.,()-]/g, '').toLowerCase();
  const byName = new Map<string, string[]>();
  const byAddress = new Map<string, string[]>();
  for (const r of all.filter((x) => !x.mergedIntoId)) {
    if (norm(r.name)) byName.set(norm(r.name), [...(byName.get(norm(r.name)) ?? []), r.id]);
    for (const a of new Set([norm(r.address), norm(r.roadAddress)].filter(Boolean))) byAddress.set(a, [...(byAddress.get(a) ?? []), r.id]);
  }
  const lookalikes = plan.ops.flatMap((o) => {
    if (o.kind !== 'create') return [];
    const ids = [...new Set([...(byName.get(norm(o.data.name)) ?? []), ...(byAddress.get(norm(o.data.address)) ?? [])])];
    return ids.length ? [{ candidateId: o.candidateId, name: o.data.name, address: o.data.address, sameAs: ids }] : [];
  });
  const t = plan.tally;
  const written = t.create + t.update + t.same;
  const fields = new Map<string, number>();
  for (const o of plan.ops) if (o.kind === 'update') for (const k of o.changed) fields.set(k, (fields.get(k) ?? 0) + 1);
  const conflicts = plan.ops.filter((o) => o.kind === 'conflict' || o.kind === 'hold');

  console.log(`${label} ${data.reviewedDate}: 후보 ${data.rows.length} · 이전 id ${data.mappingCount} · 통합 이력 ${data.mergeCount}`);
  console.log(`표 지금: ${all.length}행 중 같은 종류 ${existing.length}행(${missing.length ? `새 칸 ${missing.length}개 아직 없음 — 기본값으로 읽음` : '새 칸 있음'}) · 정식 연습장 ${venues} · 정식 레슨장 ${lessonOrgs}`);
  console.log(`후보 ${data.rows.length} = 새로 ${t.create} + 고침 ${t.update} + 그대로 ${t.same} + 충돌(안 씀) ${t.conflict}${written + t.conflict === data.rows.length ? ' ✓' : ' ✗ 합이 안 맞아요'}`);
  const linked = existing.filter((r) => r.mergedIntoId && !plan.untouched.includes(r.id)).length;
  const rest = existing.length - (t.update + t.same + t.merge + t.hold + t.untouched + linked);
  console.log(`기존 행 ${existing.length} = 대표로 씀 ${t.update + t.same} + 통합해 이음 ${t.merge} + 이미 이어 둔 이전 기록 ${linked} + 잇지 않고 둠 ${t.hold} + 자료에 없음(지우지 않음) ${t.untouched}${rest ? ` + 충돌 관련 ${rest}` : ''}`);
  console.log(`바뀌는 칸: ${[...fields].map(([k, n]) => `${k} ${n}`).join(' · ') || '없음'}`);
  console.log(`좌표: 있음 ${data.rows.filter((r) => r.fields.lat != null).length} · 없음 ${data.rows.filter((r) => r.fields.lat == null).length}(목록에는 보이고 지도 점만 없음)`);
  console.log(`확인 우선 꼬리표 붙은 후보 ${plan.ops.filter((o) => (o.kind === 'create' || o.kind === 'update') && (o.data.reviewTags?.length ?? 0) > 0).length}`);
  if (isField) {
    const count = (k: 'accessNotice' | 'identityNotice' | 'operationNotice', map: Record<string, string>) =>
      Object.entries(map).map(([code, name]) => `${name} ${data.rows.filter((r) => r.fields[k] === code).length}`).join(' · ');
    console.log(`이용 경로: ${count('accessNotice', ACCESS_NOTICE)}`);
    console.log(`장소 대응: ${count('identityNotice', IDENTITY_NOTICE)}`);
    console.log(`운영 근거: ${count('operationNotice', FIELD_OPERATION_NOTICE)}`);
    console.log(`가린 휴대전화 번호: ${'maskedPhones' in data ? String(data.maskedPhones) : 0}`);
  }
  console.log(`이름 · 주소가 같은 기존 기록(만들되 알림): ${lookalikes.length}`);
  for (const l of lookalikes) console.log(`  ? ${l.candidateId} ${l.name} (${l.address}) ↔ ${l.sameAs.join(', ')}`);
  for (const o of conflicts) console.log(`  ! ${o.kind} ${o.candidateId}${o.id ? ` ↔ ${o.id}` : ''}: ${o.reason}`);
  for (const o of plan.ops) if (o.kind === 'merge') console.log(`  ↳ 통합해 이음 ${o.id} → ${o.into}`);
  const a = again.tally;
  console.log(`다시 돌리면: 새로 ${a.create} · 고침 ${a.update} · 그대로 ${a.same} · 이음 ${a.merge}${a.create + a.update + a.merge === 0 ? ' ✓ 바뀌는 것 없음' : ' ✗'}`);

  const dir = join(homedir(), 'bullpen-log-backups');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `candidates-import-${new Date().toISOString().replace(/[:.]/g, '-')}${apply ? '' : '-dry'}.json`);
  writeFileSync(
    out,
    JSON.stringify({ file, kind: isField ? 'fields' : 'combined', reviewedDate: data.reviewedDate, apply, existing: existing.length, lookalikes, tally: t, again: a, changedFields: Object.fromEntries(fields), ops: plan.ops.map((o) => ('data' in o ? { ...o, data: { ...o.data, collected: undefined } } : o)), untouched: plan.untouched }, null, 1)
  );
  console.log(`결과 파일: ${out}`);

  if (!apply) console.log('시험 실행이라 아무것도 안 썼어요. 쓰려면 --apply');
  else {
    const now = new Date().toISOString();
    const prev = new Map(existing.map((r) => [r.id, r]));
    const ops = plan.ops;
    await prisma.$transaction(
      async (tx) => {
        for (const o of ops) {
          if (o.kind === 'create') {
            const { collected, collectedAt, ...rest } = o.data;
            await tx.facilityCandidate.create({ data: { id: o.id, ...rest, collected: collected as Prisma.InputJsonValue, collectedAt: new Date(`${collectedAt}T00:00:00Z`) } });
          } else if (o.kind === 'update') {
            const { collected, collectedAt, ...rest } = o.data;
            const old = prev.get(o.id)!;
            const history = o.pushHistory
              ? ((await tx.facilityCandidate.findUnique({ where: { id: o.id }, select: { collectedHistory: true } }))?.collectedHistory as unknown[] | undefined) ?? []
              : null;
            await tx.facilityCandidate.update({
              where: { id: o.id },
              data: {
                ...rest,
                ...(collected ? { collected: collected as Prisma.InputJsonValue } : {}),
                ...(collectedAt ? { collectedAt: new Date(`${collectedAt}T00:00:00Z`) } : {}),
                ...(history
                  ? { collectedHistory: [...history, { replacedAt: now, collectedAt: new Date(old.collectedAt).toISOString().slice(0, 10), record: old.collected }] as Prisma.InputJsonValue }
                  : {}),
              },
            });
          } else if (o.kind === 'merge') await tx.facilityCandidate.update({ where: { id: o.id }, data: { mergedIntoId: o.into } });
        }
      },
      { timeout: 300_000, maxWait: 10_000 }
    );
    console.log(`썼어요: 새로 ${t.create} · 고침 ${t.update} · 이음 ${t.merge}`);
  }
} finally {
  await prisma.$disconnect();
}
