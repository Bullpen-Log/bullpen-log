/**
 * 덕아웃 레슨 · 연습장 수집 후보 가져오기(2026-10-26) — 수집 자료 JSON 의 candidates 배열만 FacilityCandidate 표에 넣는다.
 *
 *   npm run candidates:import -- <dugout-facility-candidates.json>            # 시험 실행(아무것도 안 씀)
 *   npm run candidates:import -- <dugout-facility-candidates.json> --apply    # 운영 DB 에 씀
 *
 * 규칙(collection-notes.txt '개발 전달 계약'):
 * - 보류 · 범위 밖 · 퇴역 · 과거 검색 결과 배열은 읽지 않는다. 약속(처음 상태 · id)이 하나라도 깨지면 아무것도 안 쓴다(lib/market/candidates.ts readCandidateFile).
 * - 같은 id 로 다시 넣으면 수집 칸만 고친다 — 연락 · 동의 · 확인 · 승인 · 메모 칸은 건드리지 않는다. 좌표는 관리자가 손으로 고쳤으면(coordsEdited) 그대로.
 * - 자료에서 빠진 기존 후보는 지우지 않는다(연락 기록이 있을 수 있다) — 몇 개인지만 알린다.
 * 운영 DB 를 쓰므로 --apply 전에 npm run backup.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readCandidateFile } from '../lib/market/candidates.ts';

const [file, ...flags] = process.argv.slice(2).filter((a) => a !== '--');
if (!file) {
  console.error('쓰는 법: npm run candidates:import -- <json> [--apply]');
  process.exit(1);
}
const apply = flags.includes('--apply');
const { rows, errors } = readCandidateFile(JSON.parse(readFileSync(file, 'utf8')));
if (errors.length) {
  console.error(`자료 약속이 깨져 아무것도 안 썼어요(${errors.length}):`);
  for (const e of errors.slice(0, 30)) console.error(`  - ${e}`);
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) });
try {
  const existing = new Map(
    (await prisma.facilityCandidate.findMany({ select: { id: true, coordsEdited: true } })).map((r) => [r.id, r.coordsEdited])
  );
  const incoming = new Set(rows.map((r) => r.id));
  const fresh = rows.filter((r) => !existing.has(r.id));
  const again = rows.filter((r) => existing.has(r.id));
  const gone = [...existing.keys()].filter((id) => !incoming.has(id));
  console.log(`후보 ${rows.length} — 새로 ${fresh.length} · 다시 ${again.length} · 자료에 없는 기존 ${gone.length}(지우지 않음)`);
  console.log(`좌표 없음: ${rows.filter((r) => r.lat == null).map((r) => r.name).join(', ') || '없음'}`);
  if (!apply) {
    console.log('시험 실행이라 아무것도 안 썼어요. 쓰려면 --apply');
  } else {
    for (const r of rows) {
      const { collected, collectedAt, lat, lng, ...rest } = r;
      const data = { ...rest, collected: collected as Prisma.InputJsonValue, collectedAt: new Date(`${collectedAt}T00:00:00Z`) };
      if (!existing.has(r.id)) await prisma.facilityCandidate.create({ data: { ...data, lat, lng } });
      else await prisma.facilityCandidate.update({ where: { id: r.id }, data: existing.get(r.id) ? data : { ...data, lat, lng } });
    }
    console.log(`썼어요: 새로 ${fresh.length} · 고침 ${again.length}`);
  }
} finally {
  await prisma.$disconnect();
}
