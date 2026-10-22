/* 녹화마다 그 시간의 앱 시도를 조각 시각에 맞춰 attempts.json 으로(읽기만) */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const recs = await prisma.velocityRecording.findMany({ orderBy: { createdAt: 'asc' }, include: { parts: { orderBy: { index: 'asc' }, select: { index: true, offsetSec: true, durationSec: true } } } });
for (const r of recs) {
  const id = r.id.slice(0, 8);
  const dir = `${homedir()}/bullpen-velocity-lab/rec-${id}`;
  if (!existsSync(dir) || !r.parts.length) continue;
  const c0 = r.meta?.cameraClockStart;
  const end = r.parts.at(-1).offsetSec + (r.parts.at(-1).durationSec ?? 4);
  const atts = c0 == null ? [] : await prisma.velocityAttempt.findMany({
    where: { createdAt: { gte: new Date(r.createdAt.getTime() - 60e3), lte: new Date(r.createdAt.getTime() + (end + 120) * 1e3) } },
    select: { atSec: true, kind: true, ok: true, rejectCode: true, why: true, rawKmh: true, confidence: true },
  });
  const mine = atts.filter((a) => a.atSec != null && a.atSec - c0 >= -2 && a.atSec - c0 <= end + 2)
    .map((a) => ({ t: +(a.atSec - c0).toFixed(2), kind: a.kind, ok: a.ok, code: a.rejectCode, why: a.why, kmh: a.rawKmh, conf: a.confidence }));
  writeFileSync(`${dir}/attempts.json`, JSON.stringify({ c0, parts: r.parts, attempts: mine }, null, 1));
  console.log(id, '시도', mine.length, c0 == null ? '(카메라 시계 없음)' : '');
}
await prisma.$disconnect();
