/**
 * 현장 시험 비교표(DB 읽기만) — PitchLab 방식의 두 값을 스피드건과 견준다(docs/velocity/redesign/PLAN-pitchlab.md).
 *   고른 값    — 사용자가 고른 거리로 낸 값(analysis.distance.kmhAtInput — 엔진 2.9.0 부터 화면 값)
 *   공 크기 값 — 공 크기 거리로 낸 값(2.9.0 부터 kmhAtSize, 2.8.x 는 화면 값)
 *   둘 다 공 크기 거리가 고른 거리와 15% 넘게 다르면 거리 오류로 측정 불가.
 * 시도마다 한 줄(알림 차례), 끝에 두 방식의 MAE · ±3 안 비율 · 치우침.
 *
 *   node --env-file=.env scripts/velocity-lab/field-report.mjs --date=2026-10-26 [--user=<id 앞자리>] [--gun=118,121,…] [--tape=22.4]
 *
 * --gun  : 스피드건 값을 앱에 안 넣었으면 순서대로(잰 시도 — 구속이 나온 시도에만 차례로 붙인다). 앱 · 관리자에서 넣은 값(gunKmh)이 이긴다.
 * --tape : 줄자로 잰 폰 → 공이 멈추는 곳(m) — 고른 거리 · 공 크기 거리가 그것과 몇 % 다른지.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const date = arg('date');
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('쓰는 법: node --env-file=.env scripts/velocity-lab/field-report.mjs --date=YYYY-MM-DD [--user=<id 앞자리>] [--gun=118,121] [--tape=22.4]');
  process.exit(1);
}
const user = arg('user');
const guns = (arg('gun') ?? '').split(',').filter(Boolean).map(Number);
const tape = arg('tape') ? Number(arg('tape')) : null;
const EXP = 1.076; // lib/velocity-engine/analyze-distance.ts SPEED_DISTANCE_EXPONENT

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const rows = (
  await prisma.velocityAttempt.findMany({
    where: { date: new Date(`${date}T00:00:00.000Z`) },
    orderBy: { createdAt: 'asc' },
    include: { pitch: { select: { rawKmh: true, gunKmh: true } } },
  })
).filter((r) => !user || r.userId.startsWith(user));
await prisma.$disconnect();
if (!rows.length) {
  console.log(`${date} 시도 기록 없음`);
  process.exit(0);
}

const kst = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(11, 19);
const f1 = (v, w = 6) => (v == null ? '-' : v.toFixed(1)).padStart(w);
let gi = 0;
const A = []; // 화면 값 − 건 (기록된 공)
const B = []; // 고른 값 − 건
const C = []; // 공 크기 값 − 건
let gated = 0;
const dists = { input: [], size: [] };
console.log(`${date} 시도 ${rows.length}${user ? ` · 사용자 ${user}` : ''}${tape ? ` · 줄자 ${tape}m` : ''}`);
console.log('  시각      종류    결과              건 |   화면   고른 공크기 | 고른 거리 공 크기 거리 | 판');
for (const r of rows) {
  const d = r.analysis?.distance ?? {};
  const measured = r.rawKmh != null;
  const gun = r.gunKmh ?? r.pitch?.gunKmh ?? (measured && gi < guns.length ? guns[gi++] : null);
  const shown = r.pitch?.rawKmh ?? null;
  const kept = shown != null;
  const mismatch = d.why === 'size-mismatch';
  if (mismatch) gated++;
  /* 고른 값 — 2.8.2 부터 엔진이 싣는다. 옛 판이면 거리 비율로 다시 셈 */
  const atInput = d.kmhAtInput ?? (measured && d.inputDistM && d.distanceM ? r.rawKmh * (d.inputDistM / d.distanceM) ** EXP : null);
  if (d.inputDistM) dists.input.push(d.inputDistM);
  const sizeD = d.kmhAtSize != null ? d.sizeDistM : d.distanceSource === 'ball' ? d.distanceM : null;
  if (sizeD) dists.size.push(sizeD);
  if (gun != null && kept) A.push(shown - gun);
  if (gun != null && atInput != null) B.push(atInput - gun);
  const atSize = d.kmhAtSize ?? (d.distanceSource === 'ball' && measured && !String(r.engineVersion ?? '').startsWith('2.9') ? r.rawKmh : null);
  if (gun != null && atSize != null) C.push(atSize - gun);
  const res = kept ? '기록' : mismatch ? '거리 오류' : r.ok ? `측정 불가(${r.why ?? r.confidence})` : `못 잼(${r.rejectCode ?? '-'})`;
  console.log(
    `  ${kst(r.createdAt)}  ${String(r.kind).padEnd(6)}  ${res.padEnd(16).slice(0, 16)} ${f1(gun, 5)} | ${f1(shown)} ${f1(atInput)} ${f1(atSize)} | ${f1(d.inputDistM, 8)} ${f1(sizeD ?? d.sizeDistM, 10)} | ${r.engineVersion ?? '-'}`
  );
}
const stat = (name, e) => {
  if (!e.length) return console.log(`  ${name}: 스피드건 짝 없음`);
  const mae = e.reduce((s, x) => s + Math.abs(x), 0) / e.length;
  const bias = e.reduce((s, x) => s + x, 0) / e.length;
  const in3 = e.filter((x) => Math.abs(x) <= 3).length;
  console.log(`  ${name}: 공 ${e.length} · MAE ${mae.toFixed(1)} · ±3 안 ${in3}/${e.length}(${Math.round((100 * in3) / e.length)}%) · 치우침 ${bias >= 0 ? '+' : ''}${bias.toFixed(1)}km/h`);
};
const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return Math.round(m * 10) / 10;
};
console.log('\n요약(합격선: 잡은 공 80% 가 ±3 안 · MAE 2.5 밑)');
stat('화면 값(기록된 공)', A);
stat('고른 값(고른 거리)', B);
stat('공 크기 값(공 크기 거리)', C);
console.log(`  거리 오류로 빠진 공 ${gated}`);
const mi = med(dists.input);
const ms = med(dists.size);
console.log(`  고른 거리(폰 →) 가운데 ${mi ?? '-'}m · 공 크기 거리 가운데 ${ms ?? '-'}m`);
if (tape) {
  const pct = (v) => (v == null ? '-' : `${v >= tape ? '+' : ''}${((v / tape - 1) * 100).toFixed(1)}%`);
  console.log(`  줄자 ${tape}m 대비 — 고른 거리 ${pct(mi)} · 공 크기 거리 ${pct(ms)}`);
}
