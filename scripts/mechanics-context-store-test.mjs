/** 실제 저장 함수. 버킷과 DB 모듈만 메모리로 대체해 파일 덮어쓰기·기록 누락을 검사한다. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { BASE_JOB, BASE_REPORT, snapshot } from './mechanics-comparison-fixture.mjs';
const files = new Map(),
  calls = [];
globalThis.__contextBucket = {
  list: async (dir, { offset = 0, limit = 100 } = {}) => ({
    data: [...files.keys()]
      .filter((k) => k.startsWith(dir + '/'))
      .map((k) => ({ id: k, name: k.slice(dir.length + 1) }))
      .slice(offset, offset + limit),
    error: null,
  }),
  remove: async (paths) => {
    paths.forEach((p) => files.delete(p));
    return { error: null };
  },
  upload: async (path, body, options) => {
    calls.push({ path, options });
    if (files.has(path) && !options.upsert) return { error: { message: 'already exists' } };
    files.set(path, typeof body === 'string' ? body : await body.text());
    return { error: null };
  },
  download: async (path) => ({
    data: files.has(path) ? new Blob([files.get(path)]) : null,
    error: files.has(path) ? null : { message: 'not found' },
  }),
};
const data = (s) => ({ url: 'data:text/javascript,' + encodeURIComponent(s), shortCircuit: true });
registerHooks({
  resolve(s, c, next) {
    if (s === 'server-only') return data('export {};');
    if (s === '@/lib/prisma') return data('export const prisma={};');
    if (s === '@/lib/storage')
      return data('export const videoBucket=()=>globalThis.__contextBucket;export const createPlaybackUrls=async()=>({});');
    return next(s, c);
  },
});
const { contextForAnalysis } = await import('../lib/mechanics/comparison.ts');
const { readLabMeta } = await import('../lib/pitch-lab-meta.ts');
const { saveLabAnalysisContext, loadLabAnalysisContext, deleteLabSample } = await import('../lib/pitch-lab.ts');
const meta = readLabMeta(
  {
    synced: true,
    hand: 'R',
    ground: 'mound',
    heightCm: 180,
    files: { side: { name: 'edited.mp4', size: 42, fp: 'fake', at: '2099-01-01T00:00:00Z' } },
  },
  '2026-10-24T00:00:00Z'
);
const job = { jobId: BASE_JOB, requestedAt: '2026-10-24T01:00:00Z', engine: 'engine' };
assert.deepEqual(contextForAnalysis(job, meta, null).files, [], '서버 읽기 실패를 클라이언트 지문으로 채우지 않는다');
const server = {
  side: { fp: 'a'.repeat(64), facts: { startMs: Date.parse('2026-10-24T00:00:00Z'), timeSource: 'apple' } },
  back: { fp: 'b'.repeat(64), facts: null },
};
const context = contextForAnalysis(job, meta, server);
assert.equal(context.files[0].at, '2026-10-24T00:00:00.000Z');
assert.equal(context.files[0].fp, 'a'.repeat(64));
assert.equal(context.files[1].at, null);
await saveLabAnalysisContext('me', BASE_REPORT, context);
assert.deepEqual(await loadLabAnalysisContext('me', BASE_REPORT, BASE_JOB), context);
assert.equal(calls[0].options.upsert, false);
await assert.rejects(saveLabAnalysisContext('me', BASE_REPORT, { ...context, heightCm: 200 }), /already exists/);
assert.equal((await loadLabAnalysisContext('me', BASE_REPORT, BASE_JOB)).heightCm, 180);
assert.equal(await loadLabAnalysisContext('me', BASE_REPORT, '../bad'), null);
console.log('분석 조건 저장 통과: 서버 원본 정보만 사용·정보 미확인 표시·같은 작업 덮어쓰기 금지');

for (let i = 0; i < 150; i++) files.set(`me/pitch-lab/${BASE_REPORT}/context-extra-${i}.json`, '{}');
await deleteLabSample('me', BASE_REPORT);
assert.equal(files.size, 0, '조건 파일이 100개를 넘어도 빠짐없이 처리한다(메모리 버킷)');
