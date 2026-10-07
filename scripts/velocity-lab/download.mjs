/**
 * 그날 올린 구속 측정 영상을 작업 폴더로 내려받는다 — 읽기만 한다(DB · 저장소에 쓰지 않는다).
 *
 *   node --env-file=.env scripts/velocity-lab/download.mjs --date=2026-10-03 --manual   — 밖에서 찍어 수기로 올린 13개
 *   node --env-file=.env scripts/velocity-lab/download.mjs --date=2026-09-28            — 실내 보정 영상 18개
 *
 * 받는 곳: ~/bullpen-velocity-lab/<날짜>/clips/<스피드건>_<공 id 8자>.<확장자> 와 manifest.json(공 id · 스피드건 · 카메라 위치).
 * --manual 이면 수기 공(카메라 값 없음)만, 없으면 스피드건 값이 있는 공 전부. 영상은 개인 것이라 저장소에 넣지 않는다.
 *
 *   node --env-file=.env scripts/velocity-lab/download.mjs --date=2026-10-07 --live   — 앱에서 실시간으로 잰 공 전부(스피드건 없어도)
 *
 * --live 는 <날짜>/live/L<잰 값>_<공 id 8자>.<확장자> · 광각 클립(W 로 시작) · <이름>.analysis.json(엔진이 본 것) · manifest.json(잰 값 ·
 * 판 번호 · 세션 설정)을 받는다.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { LAB, argOf } from './cdp.mjs';

const date = argOf('date', '2026-10-03');
const manualOnly = process.argv.includes('--manual');
const live = process.argv.includes('--live');
const out = join(LAB, date, live ? 'live' : 'clips');
mkdirSync(out, { recursive: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  }
);

const rows = await prisma.velocityPitch.findMany({
  where: {
    clipPath: { not: null },
    ...(live ? {} : { gunKmh: { not: null } }),
    ...(manualOnly ? { manual: true } : {}),
    session: { date: new Date(`${date}T00:00:00.000Z`) },
  },
  select: {
    id: true,
    sessionId: true,
    seq: true,
    gunKmh: true,
    rawKmh: true,
    kmh: true,
    errorKmh: true,
    confidence: true,
    engineVersion: true,
    clipPath: true,
    clipMime: true,
    clipEventSec: true,
    wideClipPath: true,
    analysis: live,
    manual: true,
    createdAt: true,
    session: {
      select: {
        cameraPos: true,
        net: true,
        source: true,
        fovDeg: true,
        focalPx: true,
        frameW: true,
        frameH: true,
        device: true,
        releaseDistM: true,
        engineVersion: true,
      },
    },
  },
  orderBy: { createdAt: 'asc' },
});

/** 저장소에서 받아 쓴다 — 이미 있으면 건너뛴다 */
async function fetchTo(path, file) {
  if (existsSync(file)) return true;
  const { data, error } = await supabase.storage.from('pitch-videos').download(path);
  if (error) {
    console.log('못 받음', basename(file), error.message);
    return false;
  }
  writeFileSync(file, Buffer.from(await data.arrayBuffer()));
  return true;
}

const manifest = [];
for (const r of rows) {
  const kmh = live ? r.kmh : r.gunKmh;
  const name = `${live ? 'L' : ''}${String(Math.round(kmh)).padStart(3, '0')}_${r.id.slice(0, 8)}${extname(r.clipPath) || '.mov'}`;
  const file = join(out, name);
  if (!(await fetchTo(r.clipPath, file))) continue;
  if (live) {
    if (r.wideClipPath) await fetchTo(r.wideClipPath, join(out, `W${name.slice(1)}`));
    writeFileSync(
      join(out, `${name}.analysis.json`),
      JSON.stringify(r.analysis ?? null, null, 1)
    );
  }
  manifest.push({
    ...(live
      ? {
          seq: r.seq,
          rawKmh: r.rawKmh,
          kmh: r.kmh,
          errorKmh: r.errorKmh,
          confidence: r.confidence,
          engineVersion: r.engineVersion,
          clipEventSec: r.clipEventSec,
          createdAt: r.createdAt,
          session: r.session,
        }
      : {}),
    file: name,
    pitchId: r.id,
    /* 저장소 파일 이름의 앞 8자 — 지난 기록(메모 · 문서)은 실내 영상을 이 이름으로 부른다 */
    clipKey: basename(r.clipPath).slice(0, 8),
    sessionId: r.sessionId,
    gun: r.gunKmh,
    manual: r.manual,
    cameraPos: r.session.cameraPos,
    net: r.session.net,
    source: r.session.source,
  });
  console.log(name, `${(statSync(file).size / 1e6).toFixed(1)}MB`, r.session.cameraPos);
}
writeFileSync(join(LAB, date, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length}개 → ${out}`);
await prisma.$disconnect();
