/**
 * 덕아웃 야구장 수집 후보 좌표 일괄 찾기(2026-10-27) — 조사 파일엔 좌표가 없어 카카오 로컬 API 로 찾는다. 열쇠는 KAKAO_REST_API_KEY(.env).
 *
 *   npm run candidates:geocode            # 시험 실행 — DB 를 읽고 카카오에 묻기만, 결과 파일만 남긴다
 *   npm run candidates:geocode -- --apply # DB 에 씀(이 저장소의 DB 는 운영 DB 하나 — npm run backup 먼저)
 *
 * 찾는 차례(lib/market/field-candidates.ts pickKakaoPlace · pickAddress):
 * 1. 카카오 장소 id 가 있는 구장은 이름(→ 구 · 시 + 이름 → 다른 이름)으로 장소를 검색해 같은 id 가 나올 때만 그 좌표(KAKAO_PLACE).
 * 2. 못 찾으면 주소마다 주소 검색 — 번지 · 건물 주소까지 맞은 결과만(KAKAO_ADDRESS). 동 · 길 이름만 맞으면 쓰지 않는다.
 * 3. 그래도 없으면 좌표 없이 둔다(목록에만, 상세에서 손으로).
 * 쓰는 줄: 야구장 후보 · 좌표 없음 · 관리자가 좌표를 안 정한 곳만. coordsEdited 를 켜 둔다 — 조사 파일을 다시 가져와도 좌표가 지워지지 않게(planImport 는 coordsEdited 면 좌표를 안 건드린다).
 * 카카오 약관상 받은 좌표는 카카오 지도 위에 표시하는 데만 쓴다. 결과는 ~/bullpen-log-backups/field-geocode-<시각>.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { FIELD_TYPE_HINT, type FieldCoords, kakaoIdsOf, pickAddress, pickKakaoPlace } from '../lib/market/field-candidates.ts';

const apply = process.argv.includes('--apply');
const key = process.env.KAKAO_REST_API_KEY;
if (!key) {
  console.error('KAKAO_REST_API_KEY 가 .env 에 없어요 — 카카오 개발자 콘솔의 REST API 키를 넣어 주세요.');
  process.exit(1);
}

let calls = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 카카오에 한 번 묻기 — 열쇠가 틀리면(401 · 403) 바로 멈춘다(계속 두드리지 않게). 잠깐 막히면(429) 한 번 쉬었다 다시 */
async function ask(kind: 'keyword' | 'address', query: string): Promise<Record<string, string>[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await wait(120);
    calls += 1;
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/${kind}.json?size=15&query=${encodeURIComponent(query)}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) {
      console.error(`카카오가 열쇠를 거절했어요(${res.status}) — REST API 키와 '카카오맵' 사용 설정을 확인해 주세요. 아무것도 안 썼어요.`);
      process.exit(1);
    }
    if (res.status === 429) {
      await wait(3000);
      continue;
    }
    if (!res.ok) return [];
    return ((await res.json()) as { documents?: Record<string, string>[] }).documents ?? [];
  }
  return [];
}

type Row = { id: string; name: string; district: string | null; address: string | null; lat: number | null; coordsEdited: boolean; collected: unknown };
type Result = { id: string; name: string; found: FieldCoords | null; tried: string[] };

async function locate(r: Row): Promise<Result> {
  const c = (r.collected ?? {}) as { placeIds?: unknown; names?: unknown; addresses?: unknown };
  const tried: string[] = [];
  const ids = kakaoIdsOf(c.placeIds);
  if (ids.length) {
    const names = [...new Set([r.name, ...(Array.isArray(c.names) ? (c.names as string[]) : [])])];
    const queries = [...new Set([r.name, r.district ? `${r.district} ${r.name}` : null, ...names].filter((q): q is string => !!q && q.trim() !== ''))];
    for (const q of queries) {
      tried.push(`장소: ${q}`);
      const found = pickKakaoPlace(await ask('keyword', q), ids);
      if (found) return { id: r.id, name: r.name, found, tried };
    }
  }
  const addresses = [...new Set([...(Array.isArray(c.addresses) ? (c.addresses as string[]) : []), r.address].filter((a): a is string => !!a && a.trim() !== ''))];
  for (const a of addresses) {
    tried.push(`주소: ${a}`);
    const found = pickAddress(await ask('address', a));
    if (found) return { id: r.id, name: r.name, found, tried };
  }
  return { id: r.id, name: r.name, found: null, tried };
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) });
try {
  const rows: Row[] = await prisma.facilityCandidate.findMany({
    where: { typeHint: FIELD_TYPE_HINT, mergedIntoId: null },
    select: { id: true, name: true, district: true, address: true, lat: true, coordsEdited: true, collected: true },
    orderBy: { id: 'asc' },
  });
  const todo = rows.filter((r) => r.lat == null && !r.coordsEdited);
  console.log(`야구장 후보 ${rows.length} · 좌표 찾을 곳 ${todo.length}(좌표 있음 · 관리자가 정함 ${rows.length - todo.length}은 건너뜀)`);
  const results: Result[] = [];
  for (const [i, r] of todo.entries()) {
    results.push(await locate(r));
    if ((i + 1) % 100 === 0) console.log(`  … ${i + 1}/${todo.length}`);
  }
  const found = results.filter((r) => r.found);
  const by = (s: FieldCoords['source']) => found.filter((r) => r.found!.source === s).length;
  const spots = new Map<string, string[]>();
  for (const r of found) {
    const k = `${r.found!.lat.toFixed(5)},${r.found!.lng.toFixed(5)}`;
    spots.set(k, [...(spots.get(k) ?? []), r.name]);
  }
  const shared = [...spots.values()].filter((v) => v.length > 1);
  console.log(`찾음 ${found.length} = 카카오맵 같은 장소 ${by('KAKAO_PLACE')} + 주소 검색 ${by('KAKAO_ADDRESS')} · 못 찾음 ${results.length - found.length} · 카카오에 물은 수 ${calls}`);
  console.log(`같은 자리에 겹친 점: ${shared.length}묶음 · ${shared.reduce((n, v) => n + v.length, 0)}곳(한 단지의 여러 면이 주소 하나로 찍힌 곳 — 상세에서 손으로 나눌 수 있어요)`);
  for (const v of shared.slice(0, 8)) console.log(`  · ${v.join(' / ')}`);
  for (const r of results.filter((x) => !x.found).slice(0, 15)) console.log(`  ? ${r.id} ${r.name} — ${r.tried.join(' · ') || '물을 이름 · 주소 없음'}`);

  const dir = join(homedir(), 'bullpen-log-backups');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `field-geocode-${new Date().toISOString().replace(/[:.]/g, '-')}${apply ? '' : '-dry'}.json`);
  writeFileSync(out, JSON.stringify({ apply, total: rows.length, todo: todo.length, found: found.length, calls, shared, results }, null, 1));
  console.log(`결과 파일: ${out}`);

  if (!apply) console.log('시험 실행이라 아무것도 안 썼어요. 쓰려면 --apply');
  else {
    const now = new Date();
    let written = 0;
    for (const r of found) {
      /* 그새 관리자가 좌표를 정했으면 덮지 않는다 */
      const n = await prisma.facilityCandidate.updateMany({
        where: { id: r.id, lat: null, coordsEdited: false },
        data: { lat: r.found!.lat, lng: r.found!.lng, coordsEdited: true, coordsSource: r.found!.source, coordsSetAt: now },
      });
      written += n.count;
    }
    console.log(`썼어요: 좌표 ${written}곳`);
  }
} finally {
  await prisma.$disconnect();
}
