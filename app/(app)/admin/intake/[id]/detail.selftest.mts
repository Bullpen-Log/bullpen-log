/**
 * 접수 상세 화면 시험 — 진짜 부품을 그려 보고, 진짜 단추 처리기를 불러 서버 동작에 무엇이 넘어가는지 본다.
 * `node --import ./scripts/alias-register.mjs "app/(app)/admin/intake/[id]/detail.selftest.mts"`
 *
 * 서버 동작 · 라우터만 바꿔 끼운다. DB · 저장소에 닿지 않는다. 브라우저 없이 처리기를 부르므로 창의 열고 닫힘(화면 상태)은 안 본다.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React, { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type ModuleHooks = {
  resolve(specifier: string, context: { parentURL?: string }, nextResolve: (specifier: string, context: unknown) => unknown): unknown;
  load(url: string, context: unknown, nextLoad: (url: string, context: unknown) => unknown): unknown;
};
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: ModuleHooks): void };

let passed = 0;
const ok = (cond: unknown, label: string) => {
  assert.ok(cond, label);
  passed++;
};
const eq = (a: unknown, b: unknown, label: string) => {
  assert.deepEqual(a, b, label);
  passed++;
};

/* ── 바꿔 끼우기 ── */
type Handler = () => unknown;
type Bench = {
  React: typeof React;
  calls: unknown[][];
  /** 서버 동작이 돌려줄 답 — 이름별 */
  answers: Record<string, unknown>;
  clicks: Record<string, Handler>;
  confirms: Record<string, Handler>;
  refreshes: number;
  toasts: string[];
};
const bench: Bench = { React, calls: [], answers: {}, clicks: {}, confirms: {}, refreshes: 0, toasts: [] };
(globalThis as unknown as { __detailTest: Bench }).__detailTest = bench;

const ACTIONS = [
  'addIntakeAdminNote',
  'assignIntake',
  'cancelIntakeCorrection',
  'deleteIntakeAdminNote',
  'extendIntakeUploadWindow',
  'getIntakeOriginalLink',
  'getIntakePairLinks',
  'getIntakeRunPreview',
  'markIntakeSeen',
  'markIntakeUnseen',
  'publishIntakeRun',
  'requestIntakeCorrection',
  'requeueIntakeVerification',
  'resetIntakeAccessCodeLock',
  'revokeIntakeInvitation',
  'runIntakeAnalysis',
  'setIntakeHand',
  'unpublishIntake',
  'withdrawIntakeConsent',
  'withdrawIntakeModelConsent',
];
const actionStub = `const b = globalThis.__detailTest;
${ACTIONS.map((n) => `export async function ${n}(...args) { b.calls.push(['${n}', ...args]); return b.answers['${n}'] ?? { ok: true }; }`).join('\n')}`;
const STUBS: Record<string, string> = {
  'next/navigation': `const b = globalThis.__detailTest;
export function useRouter() { return { refresh() { b.refreshes++; } }; }
export function unstable_rethrow() {}`,
  '@/app/actions/intake-admin': actionStub,
  '@/lib/quiet-refresh': `export function quietRefresh(router) { router.refresh(); }`,
  '@/components/toast': `const b = globalThis.__detailTest; export function toast(t) { b.toasts.push(t); }`,
  '@/components/error-line': `const h = globalThis.__detailTest.React.createElement; export function ErrorLine({ children }) { return h('p', { 'data-error': '' }, children); }`,
  '@/components/ui': `const b = globalThis.__detailTest; const h = b.React.createElement;
const words = (n) => (Array.isArray(n) ? n.map(words).join('') : typeof n === 'string' ? n : n?.props?.children ? words(n.props.children) : '');
export function Button({ children, onClick, disabled, type }) {
  const name = words(children).trim();
  if (onClick) b.clicks[name] = onClick;
  return h('button', { type, disabled }, children);
}
export function Textarea(props) { return h('textarea', { 'aria-label': props['aria-label'], defaultValue: props.value ?? props.defaultValue }); }`,
  '@/components/confirm-delete': `const b = globalThis.__detailTest; const h = b.React.createElement;
export function ConfirmDialog({ title, detail, onConfirm, open }) {
  b.confirms[title] = onConfirm;
  return h('aside', { 'data-confirm': title, 'data-open': open }, detail);
}`,
  '@/components/icon': `const h = globalThis.__detailTest.React.createElement; const I = () => h('i');
export { I as Download, I as Play, I as Trash2, I as RefreshCw, I as RotateCcw, I as Send };`,
};

const reactUrl = import.meta.resolve('react');
/* useAction 은 전환 안에서 돈다 — 서버 그리기에는 전환이 없어 이 파일에만 바로 도는 판을 준다 */
const FAKE_REACT = `export const useState = (v) => [v, () => {}]; export const useTransition = () => [false, (f) => { globalThis.__detailTest.last = f(); }];`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react' && context.parentURL?.endsWith('/use-action.ts')) return { url: `data:text/javascript,${encodeURIComponent(FAKE_REACT)}`, shortCircuit: true };
    if (specifier === 'react') return { url: reactUrl, shortCircuit: true };
    if (Object.hasOwn(STUBS, specifier)) return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
    /* 앱은 같은 폴더 파일도 확장자 없이 부른다 */
    if (specifier.startsWith('./') && !/\.\w+$/.test(specifier)) {
      const found = ['.ts', '.tsx'].map((ext) => new URL(`${specifier}${ext}`, context.parentURL)).find((u) => existsSync(fileURLToPath(u)));
      if (found) return { url: found.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      return { format: 'module', source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const rules = await import('./detail-rules.ts');
const { AnalysisPanel, AssetCard, PairDownload } = await import('./detail-client.tsx');
const { AccessCodeLockBox, CorrectionPanel, JobIssuesPanel, UploadWindowBox, WithdrawConsentButton } = await import('./detail-manage.tsx');
const { ACCESS_CODE_MIN_CHARS, ACCESS_CODE_MAX_CHARS } = await import('@/lib/intake/token');

/** 처리기를 부르고 끝날 때까지 기다린다 */
async function press(handler: Handler | undefined, label: string) {
  assert.ok(handler, `${label}: 단추가 없어요`);
  handler();
  await (bench as unknown as { last?: Promise<unknown> }).last;
}
const fresh = () => {
  bench.calls = [];
  bench.answers = {};
  bench.clicks = {};
  bench.confirms = {};
  bench.refreshes = 0;
  bench.toasts = [];
};
const draw = (el: ReactElement) => {
  fresh();
  return renderToStaticMarkup(el);
};
const h = (type: unknown, props: Record<string, unknown>, ...children: ReactNode[]) => React.createElement(type as never, props as never, ...children);

const SID = '11111111-1111-4111-8111-111111111111';
const ASSET = {
  id: '22222222-2222-4222-8222-222222222222',
  view: 'side',
  status: 'verified',
  current: true,
  revisions: [1],
  fileName: 'IMG_1.MOV',
  declaredType: 'video/quicktime',
  declaredBytes: 1000,
  storedBytes: 1000,
  clientSha256: 'a'.repeat(64),
  serverSha256: 'a'.repeat(64),
  hashMatched: true,
  rejectCode: null,
  integrity: '선택한 파일 그대로 전송됨',
  fps: '240fps 감지',
  averageFps: 240,
  timing: null,
  container: 'mov',
  brand: 'qt',
  codec: 'hvc1',
  width: 1920,
  height: 1080,
  rotation: 0,
  frameCount: 480,
  frameTiming: 'constant',
  sampleDurationSec: 2,
  durationLabel: '촬영 길이',
  playbackDurationSec: 2,
  make: 'Apple',
  model: 'iPhone',
  captureAt: null,
  captureAtSource: null,
  uploadedAt: '2026-11-06T00:00:00.000Z',
  verifiedAt: '2026-11-06T00:01:00.000Z',
  createdAt: '2026-11-06T00:00:00.000Z',
  available: true,
};
const RUN = {
  id: '33333333-3333-4333-8333-333333333333',
  revisionNumber: 1,
  isCurrentRevision: true,
  engineKey: '2.0.0+abc',
  status: 'succeeded',
  requestedAt: '2026-11-06T00:00:00.000Z',
  finishedAt: '2026-11-06T00:05:00.000Z',
  failureText: null,
  failureDetail: null,
  videoFault: false,
  hasResult: true,
  frames: 100,
  published: false,
  hasPreviews: false,
  timingDropped: false,
  startUnknown: false,
};
const READY = { runnable: true, blockers: [], needsDraftConfirm: false, hand: 'R', inputNotes: [] };
const panel = (over: Record<string, unknown>) =>
  h(AnalysisPanel, { submissionId: SID, analysisStatus: 'succeeded', readiness: READY, runs: [RUN], hand: 'R', withdrawn: false, activePublicationId: null, ...over });

/* ── 표본 시간(#39) ── */
{
  const made = draw(h(AssetCard, { submissionId: SID, asset: { ...ASSET, durationLabel: '표본 시간' }, locked: false }));
  ok(made.includes('표본 시간') && !made.includes('촬영 길이'), '서버가 정한 이름 그대로 — 표본 시간을 촬영 길이라고 안 부른다');
  ok(draw(h(AssetCard, { submissionId: SID, asset: ASSET, locked: false })).includes('촬영 길이'), '일정한 고속 영상만 촬영 길이다');
}

/* ── 확인 안 된 파일 내려받기(#4) ── */
{
  eq(rules.originalWarning(ASSET), null, '확인된 영상은 바로 받는다');
  eq(rules.originalWarning({ ...ASSET, verifiedAt: null }), null, '검증됨 상태면 믿는다');
  ok(rules.originalWarning({ ...ASSET, status: 'rejected', rejectCode: 'not_video', verifiedAt: null })?.includes('영상이 아니에요'), '막힌 파일은 까닭을 말한다');
  ok(rules.originalWarning({ ...ASSET, status: 'replaced', rejectCode: 'not_video', verifiedAt: null }), '교체돼도 막힌 파일이다');
  ok(rules.originalWarning({ ...ASSET, status: 'unconfirmed' }), '영상인지 모르는 파일');
  ok(rules.originalWarning({ ...ASSET, status: 'uploaded', verifiedAt: null }), '아직 확인 전인 파일');
  ok(rules.originalWarning({ ...ASSET, status: 'replaced', container: 'unknown' }), '그릇을 모르는 옛 파일');
  eq(rules.originalWarning({ ...ASSET, status: 'replaced' }), null, '검증된 옛 영상은 바로 받는다');

  draw(h(AssetCard, { submissionId: SID, asset: { ...ASSET, status: 'rejected', rejectCode: 'not_video', verifiedAt: null, container: 'unknown' }, locked: false }));
  await press(bench.clicks['원본 내려받기'], '막힌 파일 단추');
  eq(bench.calls, [], '막힌 파일은 누르자마자 주소를 받지 않는다');
  bench.answers.getIntakeOriginalLink = { ok: false, code: 'original_locked', message: '막힘' };
  await press(bench.confirms['확인되지 않은 파일을 내려받을까요?'], '막힌 파일 확인');
  eq(bench.calls.map((c) => c[0]), ['getIntakeOriginalLink'], '확인한 뒤에야 주소를 받는다');

  draw(h(AssetCard, { submissionId: SID, asset: ASSET, locked: false }));
  bench.answers.getIntakeOriginalLink = { ok: false, code: 'original_locked', message: '막힘' };
  await press(bench.clicks['원본 내려받기'], '검증된 파일 단추');
  eq(bench.calls.map((c) => c.slice(0, 4)), [['getIntakeOriginalLink', SID, ASSET.id, 'download']], '검증된 영상은 바로 받는다');

  const rejected = { ...ASSET, id: 'x', view: 'rear', status: 'rejected', rejectCode: 'not_video', verifiedAt: null, revisions: [1] };
  const d = { assets: [ASSET, rejected], revisions: [{ number: 1, current: true }] };
  ok(rules.pairOriginalWarning(d as never)?.startsWith('뒤 영상:'), '짝에 막힌 파일이 있으면 어느 칸인지 말한다');
  eq(rules.pairOriginalWarning({ assets: [ASSET, { ...ASSET, id: 'y', view: 'rear' }], revisions: [{ number: 1, current: true }] } as never), null, '둘 다 확인된 짝은 바로 받는다');
  eq(rules.pairOriginalWarning({ assets: [ASSET, { ...rejected, revisions: [2], current: false }], revisions: [{ number: 1, current: true }] } as never), null, '지금 판에 없는 옛 파일은 짝이 아니다');

  draw(h(PairDownload, { submissionId: SID, warning: '뒤 영상: 막힘' }));
  await press(bench.clicks['옆 · 뒤 원본 함께 받기'], '짝 단추');
  eq(bench.calls, [], '짝도 먼저 묻는다');
  bench.answers.getIntakePairLinks = { ok: false, code: 'x', message: '막힘' };
  await press(bench.confirms['확인되지 않은 파일이 있어요'], '짝 확인');
  eq(bench.calls.map((c) => c[0]), ['getIntakePairLinks'], '확인한 뒤에 받는다');
}

/* ── 얼린 옛 원본(#21) ── */
{
  const old = { ...ASSET, id: 'old', current: false, status: 'replaced', revisions: [1, 2] };
  const gone = { ...ASSET, id: 'gone', current: false, status: 'abandoned', revisions: [] };
  const { frozen, loose } = rules.splitOlderAssets([ASSET, old, gone] as never[]);
  eq([(frozen as { id: string }[]).map((a) => a.id), (loose as { id: string }[]).map((a) => a.id)], [['old'], ['gone']], '판에 얼린 파일만 카드로 간다');
  const made = draw(h(AssetCard, { submissionId: SID, asset: old, locked: false }));
  ok(made.includes('1, 2판'), '어느 판의 원본인지 보인다');
  bench.answers.getIntakeOriginalLink = { ok: false, code: 'x', message: '막힘' };
  await press(bench.clicks['원본 내려받기'], '옛 원본 단추');
  eq(bench.calls.map((c) => c.slice(0, 4)), [['getIntakeOriginalLink', SID, 'old', 'download']], '옛 원본 번호로 주소를 받는다');
  const page = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8');
  ok(/frozen\.map\(\(a\) => \(\s*<AssetCard/.test(page), '화면이 얼린 파일에 카드를 그린다');
}

/* ── 분석 미리보기(#13) ── */
{
  ok(draw(panel({ runs: [{ ...RUN, status: 'failed', hasPreviews: true, hasResult: false, failureText: '실패' }] })).includes('옆 미리보기 영상'), '실패한 실행의 미리보기도 보인다');
  ok(draw(panel({ runs: [{ ...RUN, hasPreviews: true }] })).includes('뒤 미리보기 영상'), '성공한 실행도 그대로다');
  ok(!draw(panel({ runs: [{ ...RUN, status: 'failed', hasPreviews: true }], withdrawn: true })).includes('미리보기 영상'), '철회된 접수는 안 보인다');
  ok(!draw(panel({ runs: [RUN] })).includes('미리보기 영상'), '구운 적 없는 실행에는 없다');
  ok(draw(h(AssetCard, { submissionId: SID, asset: ASSET, locked: false, hasRunPreview: true })).includes('미리보기'), '카드는 그대로 그려진다');
}

/* ── 공개 · 내리기의 '알던 공개'(#29) ── */
{
  const PUB = '44444444-4444-4444-8444-444444444444';
  draw(panel({}));
  bench.answers.publishIntakeRun = { ok: true, replaced: false };
  await press(bench.clicks['이 결과 공개'], '공개');
  eq(bench.calls, [['publishIntakeRun', SID, RUN.id, '', null]], '공개가 없을 때는 null 을 보낸다');
  ok(bench.refreshes === 1 && bench.toasts[0] === '결과를 공개했어요', '끝나면 새로 받고 알린다');

  draw(panel({ runs: [{ ...RUN, id: 'other', published: true }, RUN], activePublicationId: PUB }));
  await press(bench.clicks['이 결과 공개'], '바꿔 공개');
  eq(bench.calls, [], '다른 공개가 있으면 먼저 묻는다');
  bench.answers.publishIntakeRun = { ok: false, code: 'stale_publication', message: '다른 관리자가 공개를 바꿨어요.' };
  await press(bench.confirms['공개 중인 결과를 바꿀까요?'], '바꿔 공개 확인');
  eq(bench.calls, [['publishIntakeRun', SID, RUN.id, '', PUB]], '그릴 때 본 공개 번호를 보낸다');
  eq(bench.refreshes, 1, '막히면 최신 내용을 받는다');
  eq(bench.toasts, [], '막혔는데 공개했다고 말하지 않는다');

  draw(panel({ runs: [{ ...RUN, published: true }], activePublicationId: PUB }));
  bench.answers.unpublishIntake = { ok: false, code: 'stale_publication', message: '다른 관리자가 공개를 바꿨어요.' };
  await press(bench.clicks['공개 내리기'], '내리기 단추');
  eq(bench.calls, [], '내리기는 먼저 묻는다');
  await press(bench.confirms['공개를 내릴까요?'], '내리기 확인');
  eq(bench.calls, [['unpublishIntake', SID, PUB]], '내리기도 알던 공개를 보낸다');
  eq(bench.refreshes, 1, '내리기가 막혀도 최신 내용을 받는다');
  ok(rules.needsFreshView('stale_publication') && rules.needsFreshView('stale_version') && rules.needsFreshView('run_not_current') && rules.needsFreshView('invalid_state'), '낡은 화면의 답');
  ok(!rules.needsFreshView('rate_limited') && !rules.needsFreshView('invalid_input'), '입력 오류는 화면을 안 바꾼다');
}

/* ── 분석 전 주의(#38) ── */
{
  const notes = [{ view: 'side', code: 'screen_like', text: '옆 영상: 화면 녹화로 보여요.', dropsTiming: true }];
  const made = draw(panel({ readiness: { ...READY, inputNotes: notes }, runs: [] }));
  ok(made.includes('옆 영상: 화면 녹화로 보여요.') && made.indexOf('화면 녹화로') < made.indexOf('분석 실행'), '단추보다 먼저 보인다');
  ok(made.includes('시간 지표는 빠져요'), '돌리면 무엇이 빠지는지 말한다');
  ok(!draw(panel({ readiness: { ...READY, inputNotes: [{ ...notes[0], dropsTiming: false }] }, runs: [] })).includes('시간 지표는 빠져요'), '안 빠지면 그 말은 없다');
  ok(!draw(panel({ readiness: READY, runs: [] })).includes('분석 전에 볼 것'), '주의가 없으면 칸도 없다');
  ok(draw(panel({ runs: [{ ...RUN, timingDropped: true }] })).includes('시간 지표를 뺀 실행'), '시간 지표를 뺀 실행을 표시한다');
}

/* ── 철회 기록(#1 · #7 · #26) ── */
{
  const consent = (over: object) => ({ kind: 'submission', granted: true, withdrawnAt: null, ...over });
  ok(rules.withdrawalRecordable({ status: 'verified', consents: [consent({})] } as never), '살아 있는 필수 동의가 있으면 기록한다');
  ok(rules.withdrawalRecordable({ status: 'draft', consents: [consent({ kind: 'overseas' })] } as never), '접수 전에도 동의를 남겼으면 기록한다');
  ok(!rules.withdrawalRecordable({ status: 'withdrawn', consents: [consent({})] } as never), '이미 철회됐으면 없다');
  ok(!rules.withdrawalRecordable({ status: 'draft', consents: [] } as never), '동의 전 초안에는 없다');
  ok(!rules.withdrawalRecordable({ status: 'verified', consents: [consent({ kind: 'model' })] } as never), '선택 동의만으로는 아니다');
  ok(!rules.withdrawalRecordable({ status: 'verified', consents: [consent({ withdrawnAt: 'x' })] } as never), '다 거둔 동의도 아니다');

  const made = draw(h(WithdrawConsentButton, { submissionId: SID }));
  ok(made.includes('되돌릴 수 없어요') && made.includes('철회를 알린 내용'), '창이 결과를 말하고 메모 칸을 준다');
  await press(bench.clicks['필수 동의 철회 기록'], '철회 단추');
  eq(bench.calls, [], '누르자마자 기록하지 않는다');
  bench.answers.withdrawIntakeConsent = { ok: true, withdrawn: true, unpublished: true };
  await press(bench.confirms['필수 동의 철회를 기록할까요?'], '철회 확인');
  eq(bench.calls, [['withdrawIntakeConsent', SID, null]], '확인하면 기록한다');
  ok(bench.toasts[0].includes('공개를 내렸어요') && bench.refreshes === 1, '공개가 닫혔는지 알린다');
}

/* ── 멈춘 일감(#14) ── */
{
  const job = { id: 'j1', kind: 'verify_asset', state: 'failed', attempts: 8, maxAttempts: 8, lastError: '저장소 응답 실패 [주소]', view: 'side', revisionNumber: null, updatedAt: '2026-11-06T00:00:00.000Z', canRequeue: true };
  const made = draw(h(JobIssuesPanel, { submissionId: SID, issues: [job], locked: false }));
  ok(made.includes('파일 확인') && made.includes('옆 영상') && made.includes('8/8') && made.includes('저장소 응답 실패'), '무엇이 왜 멈췄는지 보인다');
  bench.answers.requeueIntakeVerification = { ok: true, requeued: 1 };
  await press(bench.clicks['다시 확인'], '다시 확인');
  eq(bench.calls, [['requeueIntakeVerification', SID]], '지금 판을 다시 건다');
  ok(bench.toasts[0] === '다시 확인을 걸었어요' && bench.refreshes === 1, '걸었다고 알리고 새로 받는다');
  draw(h(JobIssuesPanel, { submissionId: SID, issues: [job], locked: false }));
  bench.answers.requeueIntakeVerification = { ok: true, requeued: 0 };
  await press(bench.clicks['다시 확인'], '또 다시 확인');
  eq(bench.toasts, ['다시 걸 일감이 없어요'], '걸린 것이 없으면 그렇게 말한다');
  const noButton = draw(h(JobIssuesPanel, { submissionId: SID, issues: [{ ...job, state: 'stalled', canRequeue: false }], locked: false }));
  ok(!noButton.includes('다시 확인') && noButton.includes('크론'), '시도가 남은 일감은 단추 대신 안내');
  ok(!draw(h(JobIssuesPanel, { submissionId: SID, issues: [job], locked: true })).includes('다시 확인'), '철회된 접수에는 단추가 없다');
}

/* ── 고침 요청 바꾸기 · 거두기(#25) ── */
{
  const base = { submissionId: SID, version: 7, requested: true, correction: { fields: ['athleteName'], views: ['side'], message: '다시 찍어 주세요' }, requestedAt: '2026-11-06T00:00:00.000Z', uploadExpired: true, editable: true, extendChoices: [3, 7], suggestViews: [], cancelDetail: '거두기 글' };
  const made = draw(h(CorrectionPanel, base));
  ok(made.includes('선수 이름 · 옆 영상') && made.includes('다시 찍어 주세요') && made.includes('기간을 늘려'), '연 요청과 막힌 까닭을 보인다');
  ok(bench.clicks['요청 바꾸기'] && bench.clicks['고침 요청 거두기'], '바꾸고 거둘 길이 있다');
  await press(bench.clicks['고침 요청 거두기'], '거두기 단추');
  eq(bench.calls, [], '거두기는 먼저 묻는다');
  bench.answers.cancelIntakeCorrection = { ok: true, version: 8, status: 'verified' };
  await press(bench.confirms['고침 요청을 거둘까요?'], '거두기 확인');
  eq(bench.calls, [['cancelIntakeCorrection', SID, 7]], 'version 을 같이 보낸다');
  ok(bench.refreshes === 1, '끝나면 새로 받는다');
  ok(!(draw(h(CorrectionPanel, { ...base, editable: false })), bench.clicks['요청 바꾸기']), '폐기된 초대는 거두기만 된다');
  ok(bench.clicks['고침 요청 거두기'], '폐기돼도 거둘 수 있다');
  const form = draw(h(CorrectionPanel, { ...base, requested: false, correction: null, requestedAt: null, uploadExpired: false, suggestViews: ['rear'] }));
  ok(/<input[^>]*checked[^>]*value="rear"|<input[^>]*value="rear"[^>]*checked/.test(form), '막힌 칸은 미리 골라 둔다');
  ok(!/<input[^>]*checked[^>]*value="side"|<input[^>]*value="side"[^>]*checked/.test(form), '멀쩡한 칸은 안 고른다');
  ok(form.includes('뒤 영상을 다시 받아야'), '왜 고른 칸인지 말한다');
  ok(form.includes(">그대로<"), '기간이 남았으면 안 늘려도 된다');

  const none = { status: 'verified', invitation: { status: 'revoked' } };
  ok(!rules.correctionSectionVisible(none as never), '폐기됐고 연 요청이 없으면 칸이 없다');
  ok(rules.correctionSectionVisible({ status: 'correction_requested', invitation: { status: 'revoked' } } as never), '폐기돼도 연 요청은 보인다');
  ok(!rules.correctionSectionVisible({ status: 'draft', invitation: { status: 'active' } } as never), '접수 전에는 없다');
  ok(!rules.correctionSectionVisible({ status: 'withdrawn', invitation: { status: 'active' } } as never), '철회되면 없다');
  eq(rules.viewsToResend([{ view: 'side', status: 'rejected', current: true }, { view: 'rear', status: 'verified', current: true }, { view: 'rear', status: 'rejected', current: false }]), ['side'], '지금 칸의 막힌 파일만');
}

/* ── 올리기 기간(#37) ── */
{
  const now = new Date('2026-11-06T00:00:00.000Z');
  eq(rules.extendDayChoices('2026-11-01T00:00:00.000Z', now), [3, 7, 14, 30, 60], '끝난 기간은 다 고를 수 있다');
  eq(rules.extendDayChoices('2026-11-16T00:00:00.000Z', now), [14, 30, 60], '지금 끝나는 날보다 앞선 칸은 없다(서버가 안 받는다)');
  eq(rules.extendDayChoices('2027-03-01T00:00:00.000Z', now), [], '더 늘릴 칸이 없을 수도 있다');
  ok(rules.uploadWindowExtendable({ status: 'draft', invitation: { status: 'active' } } as never), '초안에서 늘린다');
  ok(rules.uploadWindowExtendable({ status: 'correction_requested', invitation: { status: 'active' } } as never), '고침 중에도 늘린다');
  ok(!rules.uploadWindowExtendable({ status: 'verified', invitation: { status: 'active' } } as never), '끝난 접수는 뜻이 없다');
  ok(!rules.uploadWindowExtendable({ status: 'draft', invitation: { status: 'revoked' } } as never), '폐기된 초대는 안 늘린다');
  const made = draw(h(UploadWindowBox, { submissionId: SID, expired: true, choices: [3, 7] }));
  ok(made.includes('기간이 끝났어요') && made.includes('오늘부터 7일'), '끝났다고 알린다');
  bench.answers.extendIntakeUploadWindow = { ok: true, uploadExpiresAt: '2026-11-13T00:00:00.000Z' };
  await press(bench.clicks['올리기 기간 늘리기'], '기간 늘리기');
  eq(bench.calls, [['extendIntakeUploadWindow', SID, 7]], '고른 날수로 늘린다');
  eq(draw(h(UploadWindowBox, { submissionId: SID, expired: false, choices: [] })), '', '고를 칸이 없으면 안 그린다');
}

/* ── 접근 코드 막힘(#5) ── */
{
  eq(rules.accessCodeText({ hasAccessCode: false, accessCodeLocked: false, accessCodeFailures: 0 }), '없음', '코드 없음');
  eq(rules.accessCodeText({ hasAccessCode: true, accessCodeLocked: false, accessCodeFailures: 0 }), '있음', '코드 있음');
  eq(rules.accessCodeText({ hasAccessCode: true, accessCodeLocked: false, accessCodeFailures: 3 }), '있음 · 틀린 횟수 3번', '틀린 횟수');
  eq(rules.accessCodeText({ hasAccessCode: true, accessCodeLocked: true, accessCodeFailures: 10 }), '있음 · 잠김(틀린 횟수 10번)', '잠김');
  ok(draw(h(AccessCodeLockBox, { submissionId: SID, failures: 10 })).includes('10번'), '몇 번 틀렸는지 보인다');
  await press(bench.clicks['결과 보기 잠금 풀기'], '풀기 단추');
  eq(bench.calls, [], '먼저 묻는다');
  bench.answers.resetIntakeAccessCodeLock = { ok: true, reset: true };
  await press(bench.confirms['결과 보기 잠금을 풀까요?'], '풀기 확인');
  eq(bench.calls, [['resetIntakeAccessCodeLock', SID]], '확인하면 푼다');
  const hint = readFileSync(fileURLToPath(new URL('../create-invitation.tsx', import.meta.url)), 'utf8');
  ok(hint.includes(`minLength={${ACCESS_CODE_MIN_CHARS}} maxLength={${ACCESS_CODE_MAX_CHARS}}`), '초대 폼의 코드 길이가 서버와 같다');
  ok(hint.includes(`${ACCESS_CODE_MIN_CHARS}자에서 ${ACCESS_CODE_MAX_CHARS}자`), '안내 글도 같다');
}

/* ── 원본 보유 기간 ── */
{
  const gone = { ...ASSET, status: 'purged', available: false, purgedAt: '2027-02-04T00:00:00.000Z' };
  const made = draw(h(AssetCard, { submissionId: SID, asset: gone, locked: false }));
  ok(made.includes('지워짐') && made.includes('2027'), '지운 날을 보인다');
  ok((made.match(/<button[^>]*disabled/g) ?? []).length >= 2, '미리보기 · 내려받기가 꺼진다');

  const pair = (a: object, b: object = a) => ({ status: 'verified', revisions: [{ number: 1, current: true }], assets: [{ ...ASSET, revisions: [1], ...a }, { ...ASSET, id: 'y', view: 'rear', revisions: [1], ...b }] });
  ok(rules.pairDownloadable(pair({ available: true }) as never), '둘 다 있으면 받는다');
  ok(!rules.pairDownloadable(pair({ available: false }) as never), '지웠으면 단추가 없다');
  ok(!rules.pairDownloadable({ ...pair({ available: true }), status: 'withdrawn' } as never), '철회되면 단추가 없다');
  ok(!rules.pairDownloadable({ status: 'draft', revisions: [], assets: [] } as never), '판이 없으면 단추가 없다');
  eq(rules.viewsToResend([{ view: 'side', status: 'purged', current: true }, { view: 'rear', status: 'purged', current: true }, { view: 'rear', status: 'purged', current: false }]), ['side', 'rear'], '지운 칸은 다시 받을 칸이다');
  eq(rules.viewsToResend([{ view: 'side', status: 'purging', current: true }, { view: 'rear', status: 'verified', current: true }]), ['side'], '지우는 칸도 다시 받을 칸이다');
  ok(rules.needsFreshView('original_purged'), '지운 뒤 낡은 화면은 새로 받는다');
  ok(rules.needsFreshView('purge_in_progress'), '지우는 중에 막히면 화면을 새로 받는다');

  const base = { purgeAt: '2027-02-04T00:00:00.000Z', anchorAt: '2026-11-06T00:00:00.000Z', basis: 'submitted', purgedAt: null, heldUntil: null };
  const now = new Date('2027-02-05T00:00:00.000Z');
  eq(rules.retentionText(base as never, now), { label: '원본 삭제 예정일', date: base.purgeAt, note: null }, '지울 날을 말한다');
  eq(rules.retentionText({ ...base, purgedAt: '2027-02-04T01:00:00.000Z' } as never, now).label, '원본 지운 날', '지운 뒤에는 지운 날이다');
  ok(rules.retentionText({ ...base, heldUntil: '2027-02-10T00:00:00.000Z' } as never, now).note?.includes('고침'), '기다리는 까닭을 말한다');
  eq(rules.retentionText({ ...base, heldUntil: '2027-02-10T00:00:00.000Z' } as never, new Date('2027-01-01T00:00:00.000Z')).note, null, '지울 날 전에는 말할 것이 없다');

  /* 지우는 중 — 표시는 고침 · 철회를 안 기다린다. 지울 날 · 기다림 글을 말하면 거짓이다 */
  const since = '2027-02-04T00:10:00.000Z';
  const current = { ...base, purging: { since, files: 2, scope: 'current' } };
  const shown = rules.retentionText(current as never, now);
  eq([shown.label, shown.date], ['원본 지우는 중', since], '지금 판을 지우는 중이면 그렇게 말하고 시작한 때를 보인다');
  ok(shown.note?.includes('지운 날로 바뀌어요'), '끝나면 어떻게 되는지 말한다');
  eq(rules.retentionText({ ...current, purgeAt: '2027-05-07T00:00:00.000Z' } as never, now).label, '원본 지우는 중', '철회로 지울 날이 밀려도 지우는 중이다');
  ok(!rules.retentionText({ ...current, heldUntil: '2027-02-10T00:00:00.000Z' } as never, now).note?.includes('고침'), '고침을 기다린다고 안 말한다');

  /* 옛 판만 지우는 중 — 지금 판의 날짜는 그대로이고, 끝나도 지운 날로 안 바뀐다 */
  const older = { ...base, purging: { since, files: 1, scope: 'older' } };
  const olderShown = rules.retentionText(older as never, now);
  eq([olderShown.label, olderShown.date], ['원본 삭제 예정일', base.purgeAt], '지금 판의 지울 날을 지킨다');
  ok(olderShown.note?.includes('옛 판') && !olderShown.note.includes('지운 날로 바뀌어요'), '옛 판을 지우는 중이라고 따로 말한다');
  ok(!rules.retentionText({ ...older, heldUntil: '2027-02-10T00:00:00.000Z' } as never, now).note?.includes('고침'), '옛 판을 말할 때는 기다림 글을 안 섞는다');
  const olderGone = rules.retentionText({ ...older, purgedAt: '2027-02-04T01:00:00.000Z' } as never, now);
  eq([olderGone.label, olderGone.date], ['원본 지운 날', '2027-02-04T01:00:00.000Z'], '지금 판을 지웠으면 지운 날을 말한다');
  ok(olderGone.note?.includes('옛 판'), '옛 판이 남았다고 같이 말한다');

  /* 철회 배너 */
  eq(rules.withdrawnRetentionText(null), '', '지울 날이 없으면 안 말한다');
  ok(rules.withdrawnRetentionText(base as never).includes('에 지워요'), '지울 날을 말한다');
  ok(rules.withdrawnRetentionText({ ...base, purgedAt: '2027-02-04T01:00:00.000Z' } as never).includes('에 지웠어요'), '지운 날을 말한다');
  eq(rules.withdrawnRetentionText({ ...current, purgeAt: '2027-05-07T00:00:00.000Z' } as never), ' 원본을 지우고 있어요.', '철회로 밀린 날을 지울 날이라고 안 말한다');
  ok(rules.withdrawnRetentionText(older as never).includes('에 지워요'), '옛 판만 지우면 지금 판의 지울 날을 말한다');

  const page = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8');
  ok(page.includes('pairDownloadable(d)') && page.includes('RETENTION_BASIS_TEXT'), '화면이 규칙을 쓴다');
  ok(!page.includes('보유 기간이 정해질 때까지'), '옛 약속이 안 남는다');
  const manage = readFileSync(fileURLToPath(new URL('./detail-manage.tsx', import.meta.url)), 'utf8');
  ok(manage.includes('모델 개발 동의는 이 기록으로 거둬지지 않고 따로 남아요'), '철회 확인창이 모델 동의를 말한다');
  ok(!manage.includes('보유 기간이 정해질 때까지'), '철회 확인창의 옛 약속이 없다');
  const list = readFileSync(fileURLToPath(new URL('../page.tsx', import.meta.url)), 'utf8');
  ok(list.includes('원본 삭제 예정일'), '목록에 칸이 있다');
  ok(list.includes('retentionCellText(r)') && list.includes('retentionLineText(r)'), '목록이 지우는 중을 아는 글을 쓴다');
  ok(page.includes('withdrawnRetentionText(d.retention)'), '철회 배너가 지우는 중을 아는 글을 쓴다');
}

/* ── 지운 접수의 칩과 확인창 글(지적 5 · 8) ── */
{
  const { analysisGoneText, viewProgressOf, VIEW_PROGRESS_TEXT } = await import('@/lib/intake/admin-labels');
  eq([viewProgressOf('purging'), viewProgressOf('purged'), viewProgressOf(null)], ['deleting', 'deleted', 'empty'], '지운 칸과 받은 적 없는 칸을 가른다');
  eq([VIEW_PROGRESS_TEXT.deleting, VIEW_PROGRESS_TEXT.deleted], ['지우는 중', '지워짐'], '칩 글');
  const none = { originalsPurgedAt: null, originalsPurging: null };
  const purged = { originalsPurgedAt: '2027-02-04T00:00:00.000Z', originalsPurging: null };
  eq(analysisGoneText('ready', none), null, '살아 있으면 분석 칩 그대로다');
  eq(analysisGoneText('ready', purged), '원본 지워짐', '지운 접수를 분석 가능이라고 안 말한다');
  eq(analysisGoneText('none', purged), '원본 지워짐', '분석 전도 같다');
  eq(analysisGoneText('ready', { originalsPurgedAt: null, originalsPurging: 'current' }), '원본 지우는 중', '지우는 중도 말한다');
  eq(analysisGoneText('ready', { originalsPurgedAt: null, originalsPurging: 'older' }), null, '옛 판만 지우면 지금 판은 분석할 수 있다');
  eq(analysisGoneText('ready', { originalsPurgedAt: '2027-02-04T00:00:00.000Z', originalsPurging: 'older' }), '원본 지워짐', '지금 판을 지웠으면 옛 판과 상관없다');
  eq(analysisGoneText('succeeded', purged), null, '끝난 분석은 그대로다');
  eq(analysisGoneText('failed', purged), null, '실패도 그대로다');

  const alive = { purgeAt: '2027-02-04T00:00:00.000Z', anchorAt: '2026-11-06T00:00:00.000Z', basis: 'published', purgedAt: null, heldUntil: null, purging: null };
  const gone = { ...alive, purgedAt: '2027-02-04T01:00:00.000Z' };
  const deleting = { ...alive, purging: { since: '2027-02-04T00:10:00.000Z', files: 2, scope: 'current' } };
  const olderOnly = { ...alive, purging: { since: '2027-02-04T00:10:00.000Z', files: 1, scope: 'older' } };
  ok(rules.cancelCorrectionDetail(alive as never).includes('그대로예요'), '살아 있으면 그대로라고 말한다');
  ok(rules.cancelCorrectionDetail(gone as never).includes('이미 지웠어요') && !rules.cancelCorrectionDetail(gone as never).includes('그대로예요'), '지웠으면 지웠다고 말한다');
  ok(rules.cancelCorrectionDetail(deleting as never).includes('지우고 있어요'), '지우는 중이면 그렇게 말한다');
  ok(rules.cancelCorrectionDetail(olderOnly as never).includes('그대로예요'), '옛 판만 지우면 지금 판은 그대로다');
  ok(rules.cancelCorrectionDetail(null).includes('그대로예요'), '지울 날이 없어도 그대로다');
  ok(rules.revokeRetentionText(alive as never).includes('2027. 02. 04') && rules.revokeRetentionText(alive as never).includes('까지 열려요'), '폐기해도 지울 날까지만 열린다');
  ok(!rules.revokeRetentionText(alive as never).includes('계속'), '계속 열린다고 안 말한다');
  ok(rules.revokeRetentionText(gone as never).includes('이미 지웠어요') && !rules.revokeRetentionText(gone as never).includes('열려요'), '지웠으면 열린다고 안 말한다');
  ok(rules.revokeRetentionText(deleting as never).includes('지우고 있어요'), '지우는 중이면 그렇게 말한다');
  eq(rules.revokeRetentionText(null), '동의 철회는 아니에요.', '지울 날이 없으면 날짜를 안 말한다');

  const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  const list = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
  ok(page.includes('<AnalysisChip') && !page.includes('analysisTone('), '상세 칩이 지운 사실을 안다');
  ok(list.split('<AnalysisChip').length === 3 && !list.includes('analysisTone('), '목록 두 칩이 지운 사실을 안다');
  ok(page.includes('cancelDetail={cancelCorrectionDetail(d.retention)}') && page.includes('retentionLine={revokeRetentionText(d.retention)}'), '두 확인창이 지운 사실을 안다');
  const manage = readFileSync(new URL('./detail-manage.tsx', import.meta.url), 'utf8');
  const client = readFileSync(new URL('./detail-client.tsx', import.meta.url), 'utf8');
  ok(!manage.includes('얼린 판의 원본은 그대로예요') && !client.includes('원본은 계속 열려요'), '고정 글이 안 남는다');
}

console.log(`intake detail: ${passed}개 통과`);
