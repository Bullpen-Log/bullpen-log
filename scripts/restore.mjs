/**
 * 백업 파일에서 사라진 데이터를 되살린다.
 *
 *   npm run restore                        — 받아둔 백업 목록을 보여준다
 *   npm run restore -- <파일경로>            — 무엇이 되살아나는지만 보여준다 (아무것도 안 바꿈)
 *   npm run restore -- <파일경로> --yes      — 실제로 되살린다
 *
 * ── 이 스크립트가 하는 일과 하지 않는 일 ──
 *
 * 하는 일:  백업에는 있는데 지금 DB에 없는 줄을 다시 넣는다.
 * 안 하는 일: 지금 DB에 있는 줄은 손대지 않는다. 지우지도, 덮어쓰지도 않는다.
 *
 * 이렇게 만든 까닭이 있다. 백업 시점으로 통째로 되돌리면, 백업 이후에 쌓인
 * 기록이 함께 사라진다. 복구하려다 다른 것을 잃는 셈이다. 그래서 "빠진 것만
 * 채우는" 쪽으로 좁혔다.
 *
 * 그래서 못 고치는 경우가 하나 있다. 줄이 지워진 것이 아니라 값이 잘못 바뀐
 * 경우는 이걸로 되돌아오지 않는다. 그때는 백업 파일에서 해당 값을 찾아 손으로
 * 고쳐야 한다.
 *
 * 표 구조(열 추가·삭제)는 백업의 대상이 아니다. 마이그레이션으로 열을 지웠다면
 * 이 스크립트로는 돌아오지 않는다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/** 한 번에 넣는 줄 수. 너무 크게 보내면 요청이 거절된다. */
const CHUNK = 300;

const BACKUP_DIR = join(homedir(), 'bullpen-log-backups');

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const confirmed = args.includes('--yes');

function showBackupList() {
  let files = [];
  try {
    files = readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    console.log(`백업 폴더가 아직 없습니다: ${BACKUP_DIR}`);
    console.log('먼저 npm run backup 을 실행하세요.');
    return;
  }

  if (files.length === 0) {
    console.log(`받아둔 백업이 없습니다: ${BACKUP_DIR}`);
    console.log('먼저 npm run backup 을 실행하세요.');
    return;
  }

  console.log(`받아둔 백업 (${BACKUP_DIR})\n`);
  for (const f of files) console.log(`  ${f}`);
  console.log('\n되살릴 파일을 골라 이렇게 실행하세요:');
  console.log(`  npm run restore -- "${join(BACKUP_DIR, files.at(-1))}"`);
}

if (!filePath) {
  showBackupList();
  process.exit(0);
}

let dump;
try {
  dump = JSON.parse(readFileSync(filePath, 'utf8'));
} catch (error) {
  console.error(`백업 파일을 읽지 못했습니다: ${filePath}`);
  console.error(error.message);
  process.exit(1);
}

/*
 * 표 이름과 날짜·JSON 열은 스키마에서 읽는다.
 * JSON 파일에서 되읽은 날짜는 글자라서, 그대로 넣으면 프리즈마가 거절한다.
 */
const models = Prisma.dmmf.datamodel.models.map((m) => ({
  key: m.name[0].toLowerCase() + m.name.slice(1),
  dateFields: m.fields.filter((f) => f.type === 'DateTime').map((f) => f.name),
  jsonFields: m.fields.filter((f) => f.type === 'Json').map((f) => f.name),
}));

function revive(row, { dateFields, jsonFields }) {
  const out = { ...row };
  for (const f of dateFields) {
    if (out[f] != null) out[f] = new Date(out[f]);
  }
  // 비어 있는 JSON 열은 null 이 아니라 DbNull 로 넣어야 한다.
  for (const f of jsonFields) {
    if (f in out && out[f] === null) out[f] = Prisma.DbNull;
  }
  return out;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

console.log(`백업 파일: ${filePath}`);
if (dump.받은시각) console.log(`받은 시각: ${dump.받은시각}`);
console.log();

const plan = [];
for (const model of models) {
  const rows = dump[model.key];
  if (!Array.isArray(rows)) continue; // 그 표가 없던 시절의 백업 파일
  const now = await prisma[model.key].count();
  plan.push({ ...model, rows, now });
}

const missingTables = models
  .filter((m) => !Array.isArray(dump[m.key]))
  .map((m) => m.key);

console.log('표'.padEnd(20), '백업'.padStart(8), '지금'.padStart(8));
console.log('-'.repeat(38));
for (const p of plan) {
  console.log(
    p.key.padEnd(20),
    String(p.rows.length).padStart(8),
    String(p.now).padStart(8)
  );
}
if (missingTables.length > 0) {
  console.log(`\n이 백업에 없는 표(그대로 둡니다): ${missingTables.join(', ')}`);
}

if (!confirmed) {
  console.log('\n──────────────────────────────────────────');
  console.log('아직 아무것도 바꾸지 않았습니다.');
  console.log('실제로 되살리려면 뒤에 --yes 를 붙여 다시 실행하세요:');
  console.log(`  npm run restore -- "${filePath}" --yes`);
  console.log('\n지금 DB에 있는 줄은 지우지도 덮어쓰지도 않습니다.');
  console.log('백업에만 있고 지금 없는 줄만 다시 넣습니다.');
  await prisma.$disconnect();
  process.exit(0);
}

console.log('\n되살리는 중…\n');

let totalAdded = 0;
for (const p of plan) {
  let added = 0;
  for (let i = 0; i < p.rows.length; i += CHUNK) {
    const chunk = p.rows.slice(i, i + CHUNK).map((r) => revive(r, p));
    // skipDuplicates: 이미 있는 줄은 건너뛴다 — 덮어쓰지 않기 위한 핵심이다.
    const res = await prisma[p.key].createMany({ data: chunk, skipDuplicates: true });
    added += res.count;
  }
  totalAdded += added;
  console.log(`  ${p.key}: ${added}건 되살림${added === 0 ? ' (빠진 것 없음)' : ''}`);
}

console.log(`\n총 ${totalAdded}건 되살렸습니다.`);
if (totalAdded === 0) {
  console.log('백업에 있는 줄이 모두 이미 DB에 있습니다.');
}

await prisma.$disconnect();
