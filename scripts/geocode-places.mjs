/**
 * 이미 저장된 연습장 · 레슨장 주소를 지도 좌표로 채운다(덕아웃 지도, 2026-10-24). 좌표가 빈 곳만, 한 번 돌리면 된다.
 *   node --env-file=.env scripts/geocode-places.mjs          (보기만)
 *   node --env-file=.env scripts/geocode-places.mjs --write  (DB 에 씀)
 * 열쇠 KAKAO_REST_API_KEY 가 있어야 한다. 받는 법은 lib/geocode.ts 와 같다(주소 검색 → 못 찾으면 키워드).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const key = process.env.KAKAO_REST_API_KEY;
if (!key) {
  console.error('KAKAO_REST_API_KEY 가 없어요.');
  process.exit(1);
}
const write = process.argv.includes('--write');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function ask(kind, q) {
  const r = await fetch(`https://dapi.kakao.com/v2/local/search/${kind}.json?size=1&query=${encodeURIComponent(q)}`, {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  if (!r.ok) return null;
  const d = (await r.json()).documents?.[0];
  const lat = Number(d?.y);
  const lng = Number(d?.x);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 32 && lat < 39.5 && lng > 124 && lng < 132 ? { lat, lng } : null;
}
const geo = async (address, name) => (await ask('address', address)) ?? (await ask('keyword', `${address} ${name}`));

const venues = await prisma.venue.findMany({ where: { lat: null, address: { not: null } }, select: { id: true, name: true, address: true } });
const orgs = await prisma.org.findMany({ where: { lat: null, address: { not: null } }, select: { id: true, name: true, address: true } });
let ok = 0;
for (const [model, rows] of [['venue', venues], ['org', orgs]]) {
  for (const r of rows) {
    const c = await geo(r.address, r.name);
    console.log(`${model} ${r.name} · ${r.address} → ${c ? `${c.lat}, ${c.lng}` : '못 찾음'}`);
    if (c) {
      ok++;
      if (write) await prisma[model].update({ where: { id: r.id }, data: c });
    }
  }
}
console.log(`\n${venues.length + orgs.length}곳 중 ${ok}곳 찾음${write ? ' · 저장함' : ' (보기만 — --write 로 저장)'}`);
await prisma.$disconnect();
