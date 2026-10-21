/**
 * 그날 새 앱 구속 측정 현장 보고(DB 읽기만) — 시도마다 결과 · 단계별 시간 · 그때 카메라 상태, 그리고 세션 녹화가 얼마나 올라갔나.
 * 새 앱(2026-10-20 밤 판부터)이 시도 기록 analysis 에 timing · camera 를 싣는다(native/src/velocity/capture.ts · app/actions/velocity.ts).
 *
 *   node --env-file=.env scripts/velocity-lab/attempts-report.mjs --date=2026-10-21 [--user=<id 앞자리>]
 *
 * 읽는 법: 카메라 fps 가 55 밑이거나 늦음(L) · 버퍼(B) 버림이 있으면 장면이 빠진다 — 화면기록(rec)이 켜졌나 · 열(th)부터 본다.
 * 시간은 큐(줄 기다림) · 자르기 · 읽기(다리) · 계산(웹뷰 안) · 합(ms). 합이 10초를 넘는 공이 많으면 계산 줄이 막힌 것이다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const date = arg('date');
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('쓰는 법: node --env-file=.env scripts/velocity-lab/attempts-report.mjs --date=YYYY-MM-DD [--user=<id 앞자리>]');
  process.exit(1);
}
const user = arg('user');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const day = new Date(`${date}T00:00:00.000Z`);
const kst = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(11, 19);
const n = (v, w = 5) => (v == null ? '-' : String(Math.round(v))).padStart(w);

const rows = (
  await prisma.velocityAttempt.findMany({
    where: { date: day },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, userId: true, kind: true, ok: true, rejectCode: true, why: true, trackFrames: true, rawKmh: true, confidence: true, analysis: true, engineVersion: true },
  })
).filter((r) => !user || r.userId.startsWith(user));

console.log(`${date} 시도 ${rows.length}개${user ? ` (사용자 ${user}…)` : ''}`);
console.log('시각(KST) 사용자 종류    결과                       km/h  장면 |  큐 자르기 읽기  계산   합  fps실 | 카메라 fps L  B  쓰개 공찾기ms 건너뜀 열 rec  셔터 상한  ISO');
const codes = new Map();
for (const r of rows) {
  const a = r.analysis ?? {};
  const t = a.timing ?? {};
  const c = a.camera ?? {};
  const res = r.ok ? `OK ${r.confidence ?? ''}` : `${r.rejectCode ?? '?'} ${r.why ?? ''}`;
  codes.set(r.ok ? 'OK' : r.rejectCode ?? '?', (codes.get(r.ok ? 'OK' : r.rejectCode ?? '?') ?? 0) + 1);
  console.log(
    [
      kst(r.createdAt),
      r.userId.slice(0, 6),
      r.kind.padEnd(6),
      res.slice(0, 26).padEnd(26),
      (r.rawKmh?.toFixed(1) ?? '-').padStart(5),
      n(r.trackFrames, 4),
      '|',
      n(t.queueMs),
      n(t.clipMs),
      n(t.readMs),
      n(t.engineMs),
      n(t.totalMs),
      n(t.fpsActual, 4),
      '|',
      n(c.fps, 4),
      n(c.droppedLate, 3),
      n(c.droppedBuffers, 3),
      n(c.writerSkipped, 3),
      n(c.feedMs, 5),
      n(c.feedSkipped, 4),
      n(c.thermal ?? a.thermal, 2),
      c.screenCaptured ? ' 켬' : ' -',
      c.shutterDen ? `1/${c.shutterDen}`.padStart(7) : '      -',
      c.shutterCap ? `1/${c.shutterCap}`.padStart(6) : '     -',
      n(c.iso, 4),
    ].join(' ')
  );
}
console.log('결과별:', [...codes].map(([k, v]) => `${k} ${v}`).join(' · ') || '없음');

const recs = (
  await prisma.velocityRecording.findMany({
    where: { date: day },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, userId: true, status: true, durationSec: true, meta: true, parts: { select: { offsetSec: true, durationSec: true } } },
  })
).filter((r) => !user || r.userId.startsWith(user));
for (const r of recs) {
  const up = r.parts.reduce((s, p) => s + (p.durationSec ?? 0), 0);
  console.log(
    `녹화 ${kst(r.createdAt)} ${r.userId.slice(0, 6)} ${r.meta?.sessionRecording ? '세션' : '개발'} ${r.status} 길이 ${Math.round(r.durationSec ?? 0)}초 · 올라감 ${Math.round(up)}초(${r.parts.length}조각)`
  );
}
await prisma.$disconnect();
