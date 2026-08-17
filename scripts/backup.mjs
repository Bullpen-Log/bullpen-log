/**
 * DB 전체를 JSON 파일 하나로 받아둔다.
 *
 * 여럿이 같은 DB를 보고 개발하면, 누군가 실수로 지우는 일이 언젠가 생긴다.
 * pg_dump 를 따로 깔지 않아도 되게 프리즈마로 읽어서 저장한다.
 *
 *   npm run backup
 *
 * 되돌릴 때는 scripts/restore.mjs 를 쓴다.
 *
 * 저장 위치는 저장소 바깥(~/bullpen-log-backups)이다.
 * 회원 이메일과 비밀번호 해시가 들어 있어 깃에 올라가면 안 된다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/*
 * 받을 표 목록은 손으로 적지 않고 스키마에서 읽어온다.
 *
 * 예전에는 여기에 표 이름을 하나하나 적어두었는데, 새 표를 만들면서
 * 여기에 추가하는 것을 잊으면 그 표만 조용히 백업에서 빠졌다.
 * 실제로 Routine·RoutineExercise 두 표가 빠져 있었고, 백업 파일만 보면
 * 빠진 줄을 알 수가 없다. 그래서 스키마를 그대로 따르게 했다.
 */
const modelKeys = Prisma.dmmf.datamodel.models.map(
  (m) => m.name[0].toLowerCase() + m.name.slice(1)
);

const dump = { 받은시각: new Date().toISOString() };
for (const key of modelKeys) {
  dump[key] = await prisma[key].findMany();
}

const dir = join(homedir(), 'bullpen-log-backups');
mkdirSync(dir, { recursive: true });

// 2026-08-07T00-32 처럼 — 파일 이름에 콜론을 쓸 수 없다
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const out = join(dir, `db-${stamp}.json`);
writeFileSync(out, JSON.stringify(dump, null, 2));

let total = 0;
for (const key of modelKeys) {
  total += dump[key].length;
  console.log(`  ${key}: ${dump[key].length}건`);
}
console.log(`\n총 ${total}건 → ${out}`);

await prisma.$disconnect();
