/**
 * 아이폰 앱(native/)이 화면을 열 때 부르는 서버 동작(/api/rpc · /api/pitch-log)의 시간을 잰다 — `npm run rpc:timing`.
 * scripts/tab-timing.mjs(웹 탭)의 앱 판. 2026-10-18 '앱 화면 속도'.
 *
 *   1) 서버를 빌드해 켠다(개발 서버는 컴파일 시간이 섞인다). `npm run build` 는 쓰지 않는다 — 운영 DB 에 마이그레이션을 건다.
 *        npx next build && PRISMA_TIMING=1 npx next start -p 3020
 *   2) 다른 창에서  npm run rpc:timing -- --id=<사용자 id> [--runs=6] [--base=http://localhost:3020] [--only=app.loadAppHome]
 *
 * 읽는 동작(load…)만 부른다. 로그인 표는 .env 의 SESSION_SECRET 으로 이 자리에서 만든다(1시간). 첫 번째는 데우기로 빼고 가운데 값을 보인다.
 * 주의: 오늘 화면 읽기(loadTodayCore)는 그 사람이 앱을 열 때처럼 하루 지난 운동 판을 닫는다 — 앱을 한 번 연 것과 같다.
 */
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SignJWT } from 'jose';

const arg = (name, fallback) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
};
const id = arg('id');
const base = arg('base', 'http://localhost:3020').replace(/\/$/, '');
const runs = Math.max(2, Number(arg('runs', '6')));
const only = arg('only');
if (!id || !process.env.SESSION_SECRET || !process.env.DATABASE_URL) {
  console.error('--id=<사용자 id> 와 .env(node --env-file=.env) 가 필요해요');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, password: true } });
await prisma.$disconnect();
if (!user) {
  console.error('그 계정이 없어요');
  process.exit(1);
}
const pw = createHash('sha256').update(user.password).digest('base64url').slice(0, 16);
const token = await new SignJWT({ userId: user.id, role: user.role, pw })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode(process.env.SESSION_SECRET));

const kst = new Date(Date.now() + 9 * 3600_000);
const today = kst.toISOString().slice(0, 10);
const month = today.slice(0, 7);

/** [이름, 방법] — 앱 네 탭과 자주 여는 화면 */
const CALLS = [
  ['app.loadAppMe', []],
  ['app.loadAppHome', []],
  ['app.loadAppPitchToday', []],
  ['GET /api/pitch-log?month', `/api/pitch-log?month=${month}`],
  ['app.loadAppVelocityDay', [today]],
  ['app.loadAppTraining', []],
  ['app-training.loadAppTrainingToday', []],
  ['app-training-parts.loadAppArmcare', ['today']],
  ['app-training-parts.loadAppTrainingDay', [today]],
  ['app.loadAppNutrition', [today]],
  ['app-nutrition.loadAppNutritionStats', [null]],
  ['app.loadAppCheckin', [today]],
].filter(([name]) => !only || only.split(',').includes(name));

const headers = { cookie: `session=${token}`, 'x-bullpen-app': '1' };

async function once(name, how) {
  const t0 = performance.now();
  const res = Array.isArray(how)
    ? await fetch(`${base}/api/rpc/${name}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ args: how }),
      })
    : await fetch(base + how, { headers });
  const body = await res.text();
  const ms = performance.now() - t0;
  let ok = res.ok;
  try {
    const j = JSON.parse(body);
    if (j && j.ok === false) ok = false;
    if (j?.result && j.result.ok === false) ok = false;
  } catch {
    /* 목록(JSON 배열) 등 */
  }
  return { ms, ok, status: res.status, bytes: body.length };
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

console.log(`${base} · ${runs}번씩(첫 번째는 데우기로 뺌) · 오늘 ${today}\n`);
for (const [name, how] of CALLS) {
  const rs = [];
  for (let k = 0; k < runs; k++) rs.push(await once(name, how));
  const kept = rs.slice(1);
  const bad = kept.find((r) => !r.ok);
  console.log(
    `${name.padEnd(40)} ${String(Math.round(median(kept.map((r) => r.ms)))).padStart(5)}ms  최대 ${String(Math.round(Math.max(...kept.map((r) => r.ms)))).padStart(5)}ms  ${Math.round(kept[0].bytes / 1024)}KB${bad ? `  ⚠ ${bad.status}` : ''}`
  );
}
