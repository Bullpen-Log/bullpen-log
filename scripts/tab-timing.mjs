/**
 * 탭 넷(홈 · 투구 · 트레이닝 · 영양)을 서버가 만드는 시간을 잰다 — 하단 탭을 누르거나 쓸어 넘길 때와 같은 요청(RSC)으로.
 * 2026-10-15 사용자 "탭 전환을 더 빠르게 — 서버 시간을 재서 줄이자". 클라우드엔 .env 가 없어 맥북 · 데스크톱에서 돌린다.
 *
 *   1) 서버를 빌드해 켠다(개발 서버는 컴파일 시간이 섞여 못 쓴다). `npm run build` 는 쓰지 않는다 — 운영 DB 에 마이그레이션을 건다.
 *        npx next build && PRISMA_TIMING=1 npx next start
 *      PRISMA_TIMING=1 이면 서버 창에 조회마다 `[db] 모델.동작 N ms` 줄이 찍힌다(lib/prisma.ts) — 어느 조회가 느린지 본다.
 *   2) 다른 창에서
 *        npm run tabs:timing -- --email=<내 이메일> [--runs=5] [--base=http://localhost:3000] [--app]
 *      --app 은 아이폰 앱처럼(User-Agent 에 BullpenLogApp — 앱 틀이 조금 다르다).
 *
 * 로그인 표는 .env 의 SESSION_SECRET 으로 이 자리에서 만든다(1시간). DB 는 읽기만 한다(사용자 한 줄).
 * 첫 번째 요청은 데우기라 빼고, 나머지의 가운데 값을 보인다. 숫자는 서버 안 시간 + 이 컴퓨터 ↔ 서버 거리다 — localhost 면 서버 시간뿐.
 */
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SignJWT } from 'jose';

const arg = (name, fallback) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
};
const email = arg('email');
const base = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const runs = Math.max(2, Number(arg('runs', '5')));
const asApp = process.argv.includes('--app');
if (!email) {
  console.error('--email=<로그인 이메일> 이 필요해요');
  process.exit(1);
}
if (!process.env.SESSION_SECRET || !process.env.DATABASE_URL) {
  console.error('.env 를 읽지 못했어요 — node --env-file=.env 로 돌려 주세요');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, password: true } });
await prisma.$disconnect();
if (!user) {
  console.error(`${email} 계정이 없어요`);
  process.exit(1);
}
/* lib/session.ts 와 같은 표 — 비밀번호 지문(pw)까지 */
const pw = createHash('sha256').update(user.password).digest('base64url').slice(0, 16);
const token = await new SignJWT({ userId: user.id, role: user.role, pw })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode(process.env.SESSION_SECRET));

const TABS = [
  ['홈', '/today'],
  ['투구', '/videos'],
  ['트레이닝', '/training?view=home'],
  ['커뮤니티', '/community'],
];
const headers = {
  cookie: `session=${token}`,
  /* 화면 이동 때 브라우저가 보내는 요청 — HTML 이 아니라 화면 자료(RSC)를 받는다 */
  RSC: '1',
  ...(asApp ? { 'user-agent': 'Mozilla/5.0 (iPhone) BullpenLogApp' } : {}),
};

const once = async (path) => {
  const t0 = performance.now();
  const res = await fetch(base + path, { headers, redirect: 'manual' });
  const ttfb = performance.now() - t0;
  if (res.status >= 300 && res.status < 400) {
    return { error: `${res.status} → ${res.headers.get('location')} (로그인 표가 안 통했거나 잠긴 탭)` };
  }
  const body = await res.arrayBuffer();
  return { ttfb, total: performance.now() - t0, bytes: body.byteLength, status: res.status };
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

console.log(`${base} · ${runs}번씩(첫 번째는 데우기로 뺌)${asApp ? ' · 앱처럼' : ''}\n`);
console.log('탭        첫 바이트(가운데)   다 받음(가운데 · 가장 느림)   크기');
for (const [name, path] of TABS) {
  const rs = [];
  for (let k = 0; k < runs; k++) rs.push(await once(path));
  const bad = rs.find((r) => r.error);
  if (bad) {
    console.log(`${name.padEnd(8)}  ${bad.error}`);
    continue;
  }
  const kept = rs.slice(1);
  const ms = (v) => `${Math.round(v)}ms`.padStart(7);
  console.log(
    `${name.padEnd(8)}  ${ms(median(kept.map((r) => r.ttfb)))}            ${ms(median(kept.map((r) => r.total)))} · ${ms(Math.max(...kept.map((r) => r.total)))}         ${Math.round(kept[0].bytes / 1024)}KB`
  );
}
