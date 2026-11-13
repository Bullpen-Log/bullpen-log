/**
 * 외부 접수 큰 파일 검증 속도 재기 — 100MB · 500MB · 1GiB 가짜 영상을 임시 폴더(os.tmpdir()/intake-bench)에 만들어 재고 끝나면 지운다.
 * node --import ./scripts/alias-register.mjs scripts/intake-hash-bench.mts [--sizes=100M,500M,1G] [--keep]
 *
 * 재는 것(따로따로):
 *   1) 해시 — 앱과 같은 길: createIntakeStorage().hash() → 가짜 fetch 가 디스크 파일을 응답 몸통(ReadableStream)으로 준다 → hashStream.
 *      그래서 이 값은 '이 컴퓨터의 SHA-256 + 웹 스트림 처리' 속도다. 네트워크(Supabase → Vercel) 속도가 아니다.
 *   2) 머리 읽기 — 같은 저장소의 reader()(범위 읽기) 위에서 lib/intake/media.ts readIntakeMediaFacts. 범위 요청 수 · 읽은 바이트도 센다.
 *   3) 예산 흉내 — 초당 N MB 로 늦춘 몸통을 해시하다가 끝낼 시각에 signal 을 끊어, 끊긴 뒤 몇 ms 만에 손을 놓는지 잰다.
 *   4) 계산 — 원격 내려받기 속도를 30 · 60 · 120MB/초와 앱의 짐작 값(VERIFY_MIN_BYTES_PER_SEC)으로 두고 크론 예산(270초)과 견준다.
 *
 * 운영 DB · .env · 실제 저장소에 닿지 않는다. 실제 Supabase 업로드 · 다운로드와 Vercel 실행 시간은 재지 않는다.
 */
import { createReadStream, mkdirSync, openSync, rmSync, statSync, writeSync, closeSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { randomBytes, createHash } from 'node:crypto';
import { verifyCostMs } from '@/lib/intake/job-handlers';
import { GIB, INTAKE_CRON_BUDGET_MS, VERIFY_FIXED_OVERHEAD_MS, VERIFY_MIN_BYTES_PER_SEC } from '@/lib/intake/limits';
import { readIntakeMediaFacts } from '@/lib/intake/media';
import { createIntakeStorage } from '@/lib/intake/storage-core';
import { buildMov } from './intake-fixtures.mts';

const MB = 1_000_000;
const MIB = 1024 * 1024;
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}`))?.split('=')[1];
const parseSize = (t: string) => {
  const m = /^(\d+(?:\.\d+)?)([MG])$/i.exec(t.trim());
  if (!m) throw new Error(`크기 글이 이상해요: ${t}`);
  return m[2].toUpperCase() === 'G' ? Math.round(Number(m[1]) * GIB) : Math.round(Number(m[1]) * MB);
};
const SIZES = (arg('sizes') ?? '100M,500M,1G').split(',').map(parseSize);
const KEEP = process.argv.includes('--keep');
const DIR = join(tmpdir(), 'intake-bench');

/* ── 가짜 영상 파일: ftyp · mdat(크기만큼) · moov(아이폰처럼 뒤에) ── */
function writeFakeMov(path: string, totalBytes: number): number {
  const small = buildMov({ timescale: 240000, stts: [[1200, 1001]], rotation: 90, mdatBytes: 16, appleDate: '2026-11-06T12:00:00+0900', appleModel: 'iPhone 15 Pro' });
  const ftypSize = small.readUInt32BE(0);
  const mdatSize = small.readUInt32BE(ftypSize);
  const ftyp = small.subarray(0, ftypSize);
  const moov = small.subarray(ftypSize + mdatSize);
  const payload = Math.max(16, totalBytes - ftyp.length - 8 - moov.length);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload + 8);
  head.write('mdat', 4, 'latin1');
  const fd = openSync(path, 'w');
  try {
    writeSync(fd, ftyp);
    writeSync(fd, head);
    const block = randomBytes(8 * MIB);
    for (let left = payload; left > 0; ) {
      const n = Math.min(left, block.length);
      writeSync(fd, block, 0, n);
      left -= n;
    }
    writeSync(fd, moov);
  } finally {
    closeSync(fd);
  }
  return statSync(path).size;
}

/* ── 가짜 저장소 서버(fetch) — 서명 주소와 몸통 · 범위 읽기. throttle 을 주면 몸통을 초당 그만큼으로 늦춘다 ── */
type Counters = { rangeRequests: number; rangeBytes: number };
function fakeFetchFor(path: string, counters: Counters, throttleBytesPerSec?: number): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (init?.method === 'POST' && url.pathname.startsWith('/storage/v1/object/sign/')) {
      return Response.json({ signedURL: `/object/sign/${url.pathname.slice('/storage/v1/object/sign/'.length)}?token=bench` });
    }
    const size = statSync(path).size;
    const range = new Headers(init?.headers).get('range');
    const m = range ? /^bytes=(\d+)-(\d+)?$/.exec(range) : null;
    if (m) {
      const start = Number(m[1]);
      const end = Math.min(size - 1, Number(m[2] ?? size - 1));
      counters.rangeRequests++;
      counters.rangeBytes += end - start + 1;
      const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
      return new Response(body, { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${size}`, 'content-type': 'video/quicktime' } });
    }
    const file = Readable.toWeb(createReadStream(path, { highWaterMark: MIB })) as ReadableStream<Uint8Array>;
    if (!throttleBytesPerSec) return new Response(file, { status: 200, headers: { 'content-length': String(size) } });
    /* 초당 N 바이트를 넘지 않게 조각마다 기다린다 — 원격 내려받기를 흉내 낸다 */
    const reader = file.getReader();
    const started = performance.now();
    let sent = 0;
    const slow = new ReadableStream<Uint8Array>({
      async pull(c) {
        const { done, value } = await reader.read();
        if (done) return c.close();
        sent += value.byteLength;
        const due = (sent / throttleBytesPerSec) * 1000 - (performance.now() - started);
        if (due > 0) await new Promise((r) => setTimeout(r, due));
        c.enqueue(value);
      },
      cancel: () => reader.cancel(),
    });
    return new Response(slow, { status: 200 });
  }) as typeof fetch;
}

const storageFor = (path: string, counters: Counters, throttle?: number) =>
  createIntakeStorage({ url: 'http://bench.invalid', serviceKey: 'bench', fetch: fakeFetchFor(path, counters, throttle) });

const fmt = (n: number, d = 1) => n.toFixed(d);
type Row = {
  label: string;
  bytes: number;
  hashMs: number;
  hashMBps: number;
  rawHashMs: number;
  rawMBps: number;
  rssPeakMB: number;
  inspectMs: number;
  inspectRequests: number;
  inspectBytes: number;
  facts: { container: string; hasVideo: boolean | null; nominalFps: number | null; width: number | null; height: number | null };
};

mkdirSync(DIR, { recursive: true });
const rows: Row[] = [];
let abortProbe: { throttleMBps: number; deadlineMs: number; abortedAfterMs: number; releaseLagMs: number; readMB: number } | null = null;
try {
  for (const target of SIZES) {
    const path = join(DIR, `bench-${target}.mov`);
    const label = target >= GIB ? `${fmt(target / GIB, 2)}GiB` : `${Math.round(target / MB)}MB`;
    process.stdout.write(`만드는 중 ${label} … `);
    const bytes = writeFakeMov(path, target);
    console.log('끝');

    /* 1) 해시 — 앱과 같은 길 */
    const counters: Counters = { rangeRequests: 0, rangeBytes: 0 };
    const s = storageFor(path, counters);
    let rssPeak = process.memoryUsage().rss;
    const watch = setInterval(() => (rssPeak = Math.max(rssPeak, process.memoryUsage().rss)), 50);
    const t0 = performance.now();
    const h = await s.hash('sub/bench/side.mov');
    const hashMs = performance.now() - t0;
    clearInterval(watch);
    if (h.size !== bytes) throw new Error('크기가 다르게 읽혔어요');

    /* 비교 기준 — 같은 파일을 node 스트림 + createHash 로만(웹 스트림 · fetch 껍데기 없이) */
    const r0 = performance.now();
    const raw = createHash('sha256');
    for await (const c of createReadStream(path, { highWaterMark: MIB })) raw.update(c as Buffer);
    const rawHex = raw.digest('hex');
    const rawHashMs = performance.now() - r0;
    if (rawHex !== h.sha256) throw new Error('해시가 다르게 나왔어요');

    /* 2) 머리 읽기 — 범위 읽기 위에서 */
    const counters2: Counters = { rangeRequests: 0, rangeBytes: 0 };
    const s2 = storageFor(path, counters2);
    const i0 = performance.now();
    const reader = await s2.reader('sub/bench/side.mov');
    if (!reader) throw new Error('reader 없음');
    const facts = await readIntakeMediaFacts(reader);
    const inspectMs = performance.now() - i0;

    rows.push({
      label,
      bytes,
      hashMs,
      hashMBps: bytes / MB / (hashMs / 1000),
      rawHashMs,
      rawMBps: bytes / MB / (rawHashMs / 1000),
      rssPeakMB: rssPeak / MB,
      inspectMs,
      inspectRequests: counters2.rangeRequests,
      inspectBytes: counters2.rangeBytes,
      facts: { container: facts.container, hasVideo: facts.hasVideo, nominalFps: facts.nominalFps, width: facts.width, height: facts.height },
    });

    /* 3) 예산 흉내 — 가장 작은 파일에서 한 번: 30MB/초로 늦춰 읽다가 1.5초에 끊는다 */
    if (!abortProbe) {
      const throttle = 30 * MB;
      const deadlineMs = 1500;
      const ctrl = new AbortController();
      let readBytes = 0;
      const slow = storageFor(path, { rangeRequests: 0, rangeBytes: 0 }, throttle);
      const a0 = performance.now();
      let firedAt = 0;
      setTimeout(() => {
        firedAt = performance.now();
        ctrl.abort(new Error('job_budget_exceeded'));
      }, deadlineMs);
      try {
        await slow.hash('sub/bench/side.mov', { signal: ctrl.signal, onBytes: (n) => (readBytes = n) });
        throw new Error('끊기지 않았어요');
      } catch (e) {
        if ((e as Error).message !== 'job_budget_exceeded') throw e;
      }
      const end = performance.now();
      abortProbe = { throttleMBps: throttle / MB, deadlineMs, abortedAfterMs: end - a0, releaseLagMs: end - firedAt, readMB: readBytes / MB };
    }

    if (!KEEP) rmSync(path, { force: true });
  }
} finally {
  if (!KEEP) rmSync(DIR, { recursive: true, force: true });
}

/* 4) 계산 — 원격 속도 가정 × 파일 크기 → 크론 예산 */
const assumptions = [
  { label: `앱 짐작 ${fmt(VERIFY_MIN_BYTES_PER_SEC / MIB, 0)}MiB/초`, bps: VERIFY_MIN_BYTES_PER_SEC },
  { label: '30MB/초', bps: 30 * MB },
  { label: '60MB/초', bps: 60 * MB },
  { label: '120MB/초', bps: 120 * MB },
];
const budgetSec = INTAKE_CRON_BUDGET_MS / 1000;
const plan = assumptions.map((a) => ({
  assumption: a.label,
  perSize: rows.map((r) => {
    const sec = verifyCostMs(r.bytes, a.bps) / 1000;
    return { size: r.label, seconds: Number(fmt(sec)), fitsEmptyCron: sec <= budgetSec, perCron: Math.floor(budgetSec / sec) };
  }),
}));

console.log(`\n기계: ${cpus()[0]?.model ?? '?'} · node ${process.version}`);
console.log('\n크기 | 해시(앱 길) | MB/초 | 해시(node 만) | MB/초 | RSS 최고 | 머리 읽기 | 범위 요청 · 바이트 | 머리 결과');
for (const r of rows) {
  console.log(
    `${r.label} | ${fmt(r.hashMs / 1000, 2)}초 | ${fmt(r.hashMBps, 0)} | ${fmt(r.rawHashMs / 1000, 2)}초 | ${fmt(r.rawMBps, 0)} | ${fmt(r.rssPeakMB, 0)}MB | ${fmt(r.inspectMs, 1)}ms | ${r.inspectRequests} · ${r.inspectBytes}B | ${r.facts.container} ${r.facts.width}x${r.facts.height} ${r.facts.nominalFps}fps`,
  );
}
if (abortProbe) {
  console.log(
    `\n예산 흉내: ${abortProbe.throttleMBps}MB/초로 읽다 ${abortProbe.deadlineMs}ms 에 끊음 → ${fmt(abortProbe.abortedAfterMs, 0)}ms 에 손을 놓음(끊긴 뒤 ${fmt(abortProbe.releaseLagMs, 1)}ms) · 그때까지 ${fmt(abortProbe.readMB, 1)}MB 읽음`,
  );
}
console.log(`\n크론 예산 ${budgetSec}초 · 고정 몫 ${VERIFY_FIXED_OVERHEAD_MS / 1000}초 기준`);
for (const p of plan) console.log(`${p.assumption}: ${p.perSize.map((x) => `${x.size} ${x.seconds}초(한 크론 ${x.perCron}개)`).join(' · ')}`);
console.log('\nJSON', JSON.stringify({ machine: cpus()[0]?.model, node: process.version, rows, abortProbe, plan }));
