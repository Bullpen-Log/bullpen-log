/** 실제 분석 로더 + 결과 파서/리포트. 저장소 읽기만 메모리로 대체하고 운영 데이터에 접근하지 않는다. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { snapshot, rawResult, BASE_JOB, AFTER_JOB, BASE_REPORT } from './mechanics-comparison-fixture.mjs';
const t = { owner: 'me', job: null, raw: null, context: null, meta: { hand: 'R', ground: 'mound', heightCm: 190 }, reads: 0, late: false };
globalThis.__analysisLoad = t;
const data = (source) => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });
registerHooks({
  resolve(s, c, next) {
    if (s === 'server-only') return data('export {};');
    if (s === '@/lib/clock') return data("export const appNow=()=>new Date('2026-10-26T05:00:00Z');");
    if (s === '@/lib/library-cache') return data('export const trainingGuides=async()=>[];');
    if (s === '@/lib/pitch-lab')
      return data(
        `const t=globalThis.__analysisLoad;export const labServerFacts=async()=>t.source;export const findLabOwner=async()=>t.owner;export const loadLabJob=async()=>{t.reads++;return t.late&&t.reads>1?{...t.job,status:'running'}:t.job};export const loadV2Result=async()=>t.raw;export const loadLabAnalysisContext=async()=>t.context;export const loadLabMetaRaw=async()=>t.meta;`
      );
    return next(s, c);
  },
});
const { PITCH3D_V2_VERSION, engineKeyOf, readPitch3dV2Result } = await import('../lib/pitch-3d/v2/contract.ts');
const { loadAnalysisSnapshot } = await import('../lib/mechanics/analysis-load.ts');
const { loadFocusOffer } = await import('../lib/mechanics/focus-load.ts');
t.source = { side: { fp: 'a'.repeat(64) }, back: { fp: 'b'.repeat(64) } };
t.raw = rawResult(PITCH3D_V2_VERSION);
assert.ok(readPitch3dV2Result(t.raw)?.ok, '실제 결과 파서를 통과하는 자료');
t.job = { status: 'done', jobId: BASE_JOB, shownJobId: BASE_JOB, engine: engineKeyOf('build-1'), requestedAt: '2026-10-24T01:00:00Z' };
t.context = { ...snapshot().context, engine: t.job.engine };
const viewer = { id: 'me', role: 'ADMIN', heightCm: 195, birthDate: null };
const initial = await loadAnalysisSnapshot(viewer, BASE_REPORT, BASE_JOB);
assert.ok(initial.snapshot);
assert.equal(initial.snapshot.source, 'verified');
t.source.side.fp = 'c'.repeat(64);
assert.equal((await loadAnalysisSnapshot(viewer, BASE_REPORT, BASE_JOB)).snapshot.source, 'changed');
t.source.side.fp = 'a'.repeat(64);
const files = t.source;
t.source = null;
assert.equal((await loadAnalysisSnapshot(viewer, BASE_REPORT, BASE_JOB)).snapshot.source, 'unknown');
t.source = files;
assert.equal(initial.snapshot.context.heightCm, 180, '현재 프로필·수정한 촬영 정보로 과거 조건을 대입하지 않는다');
assert.equal(initial.snapshot.context.ground, 'mound');
t.meta = { ...t.meta, heightCm: 200, ground: 'flat' };
const reread = await loadAnalysisSnapshot(viewer, BASE_REPORT, BASE_JOB);
assert.deepEqual(reread.snapshot.rows, initial.snapshot.rows);
assert.deepEqual(reread.snapshot.context, initial.snapshot.context);
assert.equal(reread.snapshot.resultDigest, initial.snapshot.resultDigest);
t.context = null;
assert.equal((await loadAnalysisSnapshot(viewer, BASE_REPORT)).snapshot.context, null, '이전 분석 조건은 현재 정보로 추정하지 않는다');
t.context = { ...snapshot().context, engine: 'wrong-engine' };
assert.equal((await loadAnalysisSnapshot(viewer, BASE_REPORT)).snapshot.context, null);
t.context = { ...snapshot().context, engine: t.job.engine };
t.owner = 'other-admin';
assert.ok('error' in (await loadAnalysisSnapshot(viewer, BASE_REPORT, BASE_JOB)));
t.owner = 'me';
assert.ok('error' in (await loadAnalysisSnapshot(viewer, BASE_REPORT, AFTER_JOB)));
assert.ok('error' in (await loadAnalysisSnapshot(viewer, '../other', BASE_JOB)));
t.job.status = 'failed';
assert.ok('error' in (await loadAnalysisSnapshot(viewer, BASE_REPORT, BASE_JOB)));
t.job.status = 'done';
t.raw = { ...t.raw, jobId: AFTER_JOB };
assert.ok('error' in (await loadAnalysisSnapshot(viewer, BASE_REPORT, BASE_JOB)));
t.raw = rawResult(PITCH3D_V2_VERSION);
t.raw.ok = false;
assert.ok('error' in (await loadAnalysisSnapshot(viewer, BASE_REPORT, BASE_JOB)));
t.raw = rawResult(PITCH3D_V2_VERSION);
t.meta = { ...t.meta, kind: 'marker' };
assert.ok('error' in (await loadAnalysisSnapshot(viewer, BASE_REPORT, BASE_JOB)));
delete t.meta.kind;
t.reads = 0;
t.late = true;
assert.ok('error' in (await loadAnalysisSnapshot(viewer, BASE_REPORT, BASE_JOB)));
t.late = false;
const offer = await loadFocusOffer(viewer, BASE_REPORT);
assert.ok('error' in offer, '자동 처방이 없는 실제 리포트에서 처방을 만들지 않는다');
console.log('실제 분석 로더 통과: 소유권·완료/작업 번호·조건 버전 보존·정보 변경·결과 실패·늦은 분석 교체');
