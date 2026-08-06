/**
 * DB 전체를 JSON 파일 하나로 받아둔다.
 *
 * 여럿이 같은 DB를 보고 개발하면, 누군가 실수로 지우는 일이 언젠가 생긴다.
 * pg_dump 를 따로 깔지 않아도 되게 프리즈마로 읽어서 저장한다.
 *
 *   npm run backup
 *
 * 저장 위치는 저장소 바깥(~/bullpen-log-backups)이다.
 * 회원 이메일과 비밀번호 해시가 들어 있어 깃에 올라가면 안 된다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const dump = {
  받은시각: new Date().toISOString(),
  user: await prisma.user.findMany(),
  pitchLog: await prisma.pitchLog.findMany(),
  dailyCheckin: await prisma.dailyCheckin.findMany(),
  aiReport: await prisma.aiReport.findMany(),
  poseAnalysis: await prisma.poseAnalysis.findMany(),
  exerciseVideo: await prisma.exerciseVideo.findMany(),
  mechanicsGuide: await prisma.mechanicsGuide.findMany(),
  userExerciseLog: await prisma.userExerciseLog.findMany(),
  userGuideProgress: await prisma.userGuideProgress.findMany(),
  article: await prisma.article.findMany(),
};

const dir = join(homedir(), 'bullpen-log-backups');
mkdirSync(dir, { recursive: true });

// 2026-08-07T00-32 처럼 — 파일 이름에 콜론을 쓸 수 없다
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const out = join(dir, `db-${stamp}.json`);
writeFileSync(out, JSON.stringify(dump, null, 2));

let total = 0;
for (const [name, rows] of Object.entries(dump)) {
  if (!Array.isArray(rows)) continue;
  total += rows.length;
  console.log(`  ${name}: ${rows.length}건`);
}
console.log(`\n총 ${total}건 → ${out}`);

await prisma.$disconnect();
