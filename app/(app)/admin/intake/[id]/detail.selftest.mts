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
  /** 받는 사람 화면 시험 — 입력 칸 · 체크 칸의 처리기(id 별)와 고침 화면의 상태 칸 */
  inputs: Record<string, (e: { currentTarget: { value: string } }) => void>;
  checks: Record<string, (next: boolean) => void>;
  hooks: { slots: unknown[]; i: number };
};
const bench: Bench = { React, calls: [], answers: {}, clicks: {}, confirms: {}, refreshes: 0, toasts: [], inputs: {}, checks: {}, hooks: { slots: [], i: 0 } };
(globalThis as unknown as { __detailTest: Bench }).__detailTest = bench;

const ACTIONS = [
  'acknowledgeIntakeRunReview',
  'addIntakeAdminNote',
  'assignIntake',
  'cancelIntakeCorrection',
  'deleteIntakeAdminNote',
  'extendIntakeUploadWindow',
  'getIntakeOriginalLink',
  'getIntakePairLinks',
  'getIntakeRunPreview',
  'getIntakeRunReview',
  'markIntakeSeen',
  'markIntakeUnseen',
  'publishIntakeRun',
  'requestIntakeCorrection',
  'reissueIntakeInvitation',
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
export function Textarea(props) { return h('textarea', { 'aria-label': props['aria-label'], defaultValue: props.value ?? props.defaultValue }); }
export function Input(props) {
  if (props.id) b.inputs[props.id] = props.onChange;
  return h('input', { id: props.id, defaultValue: props.value, 'aria-invalid': props['aria-invalid'], 'aria-describedby': props['aria-describedby'] });
}`,
  /* 받는 사람 화면의 틀 — 바닥 단추의 처리기를 쥔다 */
  '@/components/intake/shell': `const b = globalThis.__detailTest; const h = b.React.createElement;
const words = (n) => (Array.isArray(n) ? n.map(words).join('') : typeof n === 'string' ? n : n?.props?.children ? words(n.props.children) : '');
export function Screen({ title, desc, actions, children }) { return h('main', null, h('h1', null, title), desc ? h('p', null, desc) : null, children, h('footer', null, actions)); }
export function PrimaryButton({ children, onClick, disabled }) { b.clicks[words(children).trim()] = onClick; return h('button', { disabled }, children); }
export function SecondaryButton({ children, onClick }) { b.clicks[words(children).trim()] = onClick; return h('button', null, children); }
export function FieldError({ id, children }) { return h('p', { id, 'data-field-error': '' }, children); }
export function NoteBox({ children }) { return h('aside', null, children); }`,
  /* 체크 칸 — 처리기를 id 로 쥔다. 진짜 부품이 같은 id 를 그리는지는 시험이 따로 본다 */
  '@/components/intake/consent-block': `const b = globalThis.__detailTest; const h = b.React.createElement;
export function CheckRow({ id, checked, onChange, label, invalid, describedBy }) {
  if (id) b.checks[id] = onChange;
  return h('label', null, h('input', { id, type: 'checkbox', defaultChecked: checked, 'aria-invalid': invalid || undefined, 'aria-describedby': describedBy }), label);
}
export function RequiredConsents({ docs, agreed, onChange, invalid }) {
  return h('div', null, docs.filter((d) => d.required).map((d) => {
    b.checks['consent-' + d.kind] = (next) => onChange(d.kind, next);
    return h('input', { key: d.kind, id: 'consent-' + d.kind, type: 'checkbox', defaultChecked: agreed[d.kind] === true, 'aria-invalid': (invalid && agreed[d.kind] !== true) || undefined });
  }));
}
export function ConsentText({ body }) { return h('p', null, body); }`,
  /* 새 링크 창 — 열렸을 때만 안을 그린다 */
  '@/components/modal': `const h = globalThis.__detailTest.React.createElement;
export function Modal({ open, title, children }) { return open ? h('section', { 'data-modal': title }, children) : null; }`,
  /* 한 번 보이는 링크 칸 — 진짜는 목록 화면 파일에 있다. 여기서는 개발용인지와 링크만 그린다 */
  '../create-invitation': `const h = globalThis.__detailTest.React.createElement;
export function IssuedLinkPanel({ made, devNote }) { return h('div', { 'data-link': made.link, 'data-external': String(made.external) }, made.external ? null : devNote); }`,
  '@/components/confirm-delete': `const b = globalThis.__detailTest; const h = b.React.createElement;
export function ConfirmDialog({ title, detail, onConfirm, open }) {
  b.confirms[title] = onConfirm;
  return h('aside', { 'data-confirm': title, 'data-open': open }, detail);
}`,
  '@/components/icon': `const h = globalThis.__detailTest.React.createElement; const I = () => h('i');
export { I as Download, I as Play, I as Trash2, I as RefreshCw, I as RotateCcw, I as Send, I as CircleAlert, I as CircleCheck, I as Clock3, I as Copy, I as Loader2, I as Check, I as FileVideo, I as Eye };`,
};

const reactUrl = import.meta.resolve('react');
/* useAction 은 전환 안에서 돈다 — 서버 그리기에는 전환이 없어 이 파일에만 바로 도는 판을 준다 */
const FAKE_REACT = `export const useState = (v) => [v, () => {}]; export const useTransition = () => [false, (f) => { globalThis.__detailTest.last = f(); }];`;
/* 받는 사람 고침 화면은 상태를 바꾼 뒤 다시 그려 봐야 한다 — 부른 차례로 칸을 쥐는 작은 useState 를 준다(그리기마다 hooks.i 를 0 으로) */
const HOOKS_REACT = `const s = globalThis.__detailTest.hooks;
export function useState(init) {
  const k = s.i++;
  if (!(k in s.slots)) s.slots[k] = typeof init === 'function' ? init() : init;
  return [s.slots[k], (v) => { s.slots[k] = typeof v === 'function' ? v(s.slots[k]) : v; }];
}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react' && context.parentURL?.endsWith('/use-action.ts')) return { url: `data:text/javascript,${encodeURIComponent(FAKE_REACT)}`, shortCircuit: true };
    if (specifier === 'react' && context.parentURL?.endsWith('/components/intake/status-steps.tsx')) return { url: `data:text/javascript,${encodeURIComponent(HOOKS_REACT)}`, shortCircuit: true };
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
const { AnalysisPanel, AssetCard, JobStateLine, PairDownload, ReissueButton } = await import('./detail-client.tsx');
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

/* ── 공개 전 3D 검토(INTAKE-MAIN/R01) — 검토 완료 번호가 없으면 공개 단추가 꺼져 있다. 막는 것은 서버고(intake-analysis-selftest), 화면은 그 번호를 들고 간다 ── */
{
  const html = draw(panel({}));
  ok(html.includes('3D 결과 검토') && typeof bench.clicks['3D 결과 검토'] === 'function', '성공한 실행에는 검토 단추가 있다');
  ok(/<button[^>]*disabled=""[^>]*>이 결과 공개/.test(html), '검토 완료 전에는 공개 단추가 꺼져 있다');
  ok(html.includes('이 결과 검토 완료') && html.includes('를 누르면 공개할 수 있어요'), '왜 꺼졌는지 한 줄');
  ok(!draw(panel({ runs: [{ ...RUN, status: 'failed', hasResult: false }] })).includes('3D 결과 검토'), '실패한 실행에는 검토 단추가 없다');
  ok(!draw(panel({ withdrawn: true })).includes('3D 결과 검토'), '철회된 접수에는 검토 단추가 없다');
  /* 검토 완료를 받은 때의 공개와 지금 공개가 같을 때만 그 번호를 쓴다 */
  const P = '44444444-4444-4444-8444-444444444444';
  eq(rules.acknowledgementForPublish(null, null), null, '검토 완료가 없으면 번호가 없다');
  eq(rules.acknowledgementForPublish({ id: 'a1', publication: null }, null), 'a1', '공개가 그대로면 그 번호');
  eq(rules.acknowledgementForPublish({ id: 'a1', publication: null }, P), null, '그사이 공개됐으면 버린다');
  eq(rules.acknowledgementForPublish({ id: 'a1', publication: P }, null), null, '그사이 내렸으면 버린다');
  ok(['stale_review', 'review_required', 'stale_publication'].every(rules.dropsAcknowledgement) && !rules.dropsAcknowledgement('run_not_current'), '서버가 낡았다고 하면 검토 완료를 버린다');
  ok(rules.needsFreshView('stale_review'), '낡은 검토는 최신 내용을 다시 받는다');
  bench.calls.length = 0;
}

/* ── 공개 · 내리기의 '알던 공개'(#29) ── */
{
  const PUB = '44444444-4444-4444-8444-444444444444';
  draw(panel({}));
  bench.answers.publishIntakeRun = { ok: true, replaced: false };
  await press(bench.clicks['이 결과 공개'], '공개');
  eq(bench.calls, [['publishIntakeRun', SID, RUN.id, '', null, { acknowledgementId: null }]], '공개가 없을 때는 null 을 보낸다(검토 완료가 없으면 번호 없이 — 서버가 막는다)');
  ok(bench.refreshes === 1 && bench.toasts[0] === '결과를 공개했어요', '끝나면 새로 받고 알린다');

  draw(panel({ runs: [{ ...RUN, id: 'other', published: true }, RUN], activePublicationId: PUB }));
  await press(bench.clicks['이 결과 공개'], '바꿔 공개');
  eq(bench.calls, [], '다른 공개가 있으면 먼저 묻는다');
  bench.answers.publishIntakeRun = { ok: false, code: 'stale_publication', message: '다른 관리자가 공개를 바꿨어요.' };
  await press(bench.confirms['공개 중인 결과를 바꿀까요?'], '바꿔 공개 확인');
  eq(bench.calls, [['publishIntakeRun', SID, RUN.id, '', PUB, { acknowledgementId: null }]], '그릴 때 본 공개 번호를 보낸다');
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

/* ── 큰 파일 검증 기다림: 실패가 아니라 기다림으로 보인다 ── */
{
  const labels = await import('@/lib/intake/admin-labels');
  const { VERIFY_BUDGET_NOTE_PREFIX } = await import('@/lib/intake/limits');
  const base = { state: 'failed', attempts: 8, maxAttempts: 8, lastError: '저장소 응답 실패 [주소]', note: null, updatedAt: '2026-11-06T00:00:00.000Z' };
  const failed = draw(h(JobStateLine, { issue: base }));
  ok(failed.includes('text-danger') && failed.includes('시도를 다 썼어요') && failed.includes('8/8'), '실패는 오류 색 · 시도 횟수');

  const waitNote = `${VERIFY_BUDGET_NOTE_PREFIX} 큰 파일이라 다음 실행에서 이어 확인해요.`;
  const waiting = draw(h(JobStateLine, { issue: { ...base, state: 'waiting', attempts: 0, lastError: null, note: waitNote } }));
  ok(waiting.includes('검증 대기') && waiting.includes('다음 실행에서 이어 확인해요'), '기다림 글을 보인다');
  ok(!waiting.includes('text-danger'), '기다림은 오류 색이 아니다');
  ok(!waiting.includes('시도 0/'), '횟수를 안 쓰는 기다림이라 시도 칸을 안 보인다');
  eq((waiting.match(/다음 실행에서 이어 확인해요/g) ?? []).length, 1, '모습 글과 같은 기다림 글은 두 번 말하지 않는다');

  const parked = draw(h(JobStateLine, { issue: { ...base, state: 'waiting', attempts: 0, lastError: null, note: `${VERIFY_BUDGET_NOTE_PREFIX} 시간 안에 다 읽지 못한 일이 거듭돼 검증 작업자를 기다려요.` } }));
  ok(parked.includes('검증 작업자를 기다려요') && !parked.includes(VERIFY_BUDGET_NOTE_PREFIX), '덧붙일 사정은 머리말 없이 보인다');
  ok(!labels.JOB_STATE_TEXT.waiting.includes('—'), '기다림 글에 줄표가 없다');
  eq([labels.jobStateTone('waiting'), labels.jobStateTone('failed'), labels.jobStateTone('stalled')], ['neutral', 'danger', 'danger'], '기다림만 오류 색이 아니다');
  eq([labels.jobWaitNoteText(null), labels.jobWaitNoteText(waitNote)], [null, null], '빈 글 · 같은 말은 없다');

  /* 기다리는 검증도 '다시 확인'으로 지금 차례로 당길 수 있다(requeueJob 이 기다림을 받는다).
     패널(detail-manage.tsx JobIssuesPanel)은 아직 JobStateLine 을 안 쓴다 — 시도 칸이 남고 덧붙일 사정(note)이 안 보인다. 여기서는 붉은 줄이 없다는 것만 본다 */
  const waitIssue = { id: 'j2', kind: 'verify_asset', state: 'waiting', attempts: 0, maxAttempts: 8, lastError: null, note: waitNote, view: 'rear', revisionNumber: null, updatedAt: base.updatedAt, canRequeue: true };
  const panel = draw(h(JobIssuesPanel, { submissionId: SID, issues: [waitIssue], locked: false }));
  ok(panel.includes('검증 대기') && panel.includes('뒤 영상') && panel.includes('다시 확인'), '패널이 기다림과 다시 확인 단추를 보인다');
  ok(!panel.includes('font-mono text-xs text-danger'), '패널에 붉은 오류 줄이 없다');
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
  /* 검증 지적: 폐기된 초대의 고침에 '기간을 늘려 주세요'를 권했다 — 폐기된 초대는 기간을 늘릴 수 없고, 늘리기 칸도 없다 */
  for (const uploadExpired of [true, false]) {
    const revoked = draw(h(CorrectionPanel, { ...base, editable: false, uploadExpired }));
    ok(!revoked.includes('기간을 늘려') && !revoked.includes('올리기 기간이 끝나'), `폐기된 초대에는 기간 늘리기를 권하지 않는다: 기간 끝남 ${uploadExpired}`);
    ok(revoked.includes('초대를 폐기해 받는 분이 고칠 수 없어요') && revoked.includes('고침 요청을 거둘 수 있어요'), `폐기한 까닭과 할 수 있는 일을 말한다: 기간 끝남 ${uploadExpired}`);
  }
  ok(!draw(h(CorrectionPanel, base)).includes('초대를 폐기'), '살아 있는 초대에는 폐기 글이 없다');
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

  /* 철회 배너 — 시각을 늘 넘긴다. 기본값(지금)에 기대면 지울 날(2027-02-04)이 지난 뒤 시험이 깨진다 */
  const beforeDue = new Date('2027-01-10T00:00:00.000Z');
  eq(rules.withdrawnRetentionText(null, beforeDue), '', '지울 날이 없으면 안 말한다');
  ok(rules.withdrawnRetentionText(base as never, beforeDue).includes('에 지워요'), '지울 날을 말한다');
  ok(rules.withdrawnRetentionText({ ...base, purgedAt: '2027-02-04T01:00:00.000Z' } as never, beforeDue).includes('에 지웠어요'), '지운 날을 말한다');
  eq(rules.withdrawnRetentionText({ ...current, purgeAt: '2027-05-07T00:00:00.000Z' } as never, beforeDue), ' 원본을 지우고 있어요.', '철회로 밀린 날을 지울 날이라고 안 말한다');
  ok(rules.withdrawnRetentionText(older as never, beforeDue).includes('에 지워요'), '옛 판만 지우면 지금 판의 지울 날을 말한다');

  const page = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8');
  ok(page.includes('pairDownloadable(d)') && page.includes('retentionFactRows(d.retention, d.filesPurgedAt, now)'), '화면이 규칙을 쓴다');
  ok(!page.includes('보유 기간이 정해질 때까지'), '옛 약속이 안 남는다');
  const manage = readFileSync(fileURLToPath(new URL('./detail-manage.tsx', import.meta.url)), 'utf8');
  ok(manage.includes('모델 개발 동의는 이 기록으로 거둬지지 않고 따로 남아요'), '철회 확인창이 모델 동의를 말한다');
  ok(!manage.includes('보유 기간이 정해질 때까지'), '철회 확인창의 옛 약속이 없다');
  const list = readFileSync(fileURLToPath(new URL('../page.tsx', import.meta.url)), 'utf8');
  /* 검증 지적: 칸 머리가 판에 안 오른 철회 초안의 파일까지 '원본'이라고 불렀다 — 낱말은 칸 글 쪽이 고른다(retentionLineText · 상세 fileWords) */
  ok(list.includes("'삭제 예정일'") && !list.includes('원본 삭제 예정일'), '목록 칸 머리가 모든 줄을 원본이라고 부르지 않는다');
  ok(list.includes('retentionCellText(r)') && list.includes('retentionLineText(r)'), '목록이 지우는 중을 아는 글을 쓴다');
  ok(page.includes('withdrawnRetentionText(d.retention, now)'), '철회 배너가 지우는 중을 아는 글을 쓴다');
}

/* ── 지운 접수의 칩과 확인창 글(지적 5 · 8) ── */
{
  const { analysisBlockOf, analysisChipText, viewProgressOf, VIEW_PROGRESS_TEXT } = await import('@/lib/intake/admin-labels');
  eq([viewProgressOf('purging'), viewProgressOf('purged'), viewProgressOf(null)], ['deleting', 'deleted', 'empty'], '지운 칸과 받은 적 없는 칸을 가른다');
  eq([VIEW_PROGRESS_TEXT.deleting, VIEW_PROGRESS_TEXT.deleted], ['지우는 중', '지워짐'], '칩 글');
  const at = new Date('2027-01-01T00:00:00.000Z');
  const live = { status: 'verified', invitationStatus: 'active', originalPurgeAt: '2027-02-04T00:00:00.000Z', originalsPurgedAt: null, originalsPurging: null, hasRevision: true };
  const block = (f: Record<string, unknown>) => analysisBlockOf({ ...live, ...f } as never, at);
  eq(block({}), null, '살아 있으면 막힘이 없다');
  eq(block({ originalsPurgedAt: '2027-02-04T00:00:00.000Z' }), 'deleted', '지운 접수');
  eq(block({ originalsPurging: 'current' }), 'deleting', '지우는 중');
  eq(block({ originalsPurging: 'older' }), null, '옛 판만 지우면 지금 판은 분석할 수 있다');
  eq(block({ originalsPurgedAt: '2027-02-04T00:00:00.000Z', originalsPurging: 'older' }), 'deleted', '지금 판을 지웠으면 옛 판과 상관없다');
  eq(block({ status: 'withdrawn' }), 'withdrawn', '철회');
  eq(block({ invitationStatus: 'revoked' }), 'revoked', '폐기');
  eq(block({ originalPurgeAt: '2026-12-31T00:00:00.000Z' }), 'overdue', '지울 날이 지났다');
  eq(block({ originalPurgeAt: null }), null, '시계가 없으면 지울 날로 안 막는다');
  eq(analysisChipText('ready', null), null, '막힘이 없으면 분석 칩 그대로다');
  eq(analysisChipText('ready', 'deleted'), '원본 지워짐', '지운 접수를 분석 가능이라고 안 말한다');
  eq(analysisChipText('none', 'deleted'), '원본 지워짐', '분석 전도 같다');
  eq(analysisChipText('ready', 'deleting'), '원본 지우는 중', '지우는 중도 말한다');
  eq([analysisChipText('ready', 'withdrawn'), analysisChipText('ready', 'revoked'), analysisChipText('ready', 'overdue')], ['분석 불가', '분석 불가', '분석 불가'], '철회 · 폐기 · 지울 날 지남은 분석 불가다');
  eq(analysisChipText('succeeded', 'deleted'), null, '끝난 분석은 그대로다');
  eq(analysisChipText('failed', 'withdrawn'), null, '실패도 그대로다');

  const alive = { purgeAt: '2027-02-04T00:00:00.000Z', anchorAt: '2026-11-06T00:00:00.000Z', basis: 'published', purgedAt: null, heldUntil: null, purging: null };
  const gone = { ...alive, purgedAt: '2027-02-04T01:00:00.000Z' };
  const deleting = { ...alive, purging: { since: '2027-02-04T00:10:00.000Z', files: 2, scope: 'current' } };
  const olderOnly = { ...alive, purging: { since: '2027-02-04T00:10:00.000Z', files: 1, scope: 'older' } };
  /* 시각을 늘 넘긴다 — 기본값(지금)에 기대면 지울 날(2027-02-04)이 지난 뒤 '그대로 · 까지 열려요' 시험이 깨진다 */
  const early = new Date('2027-01-10T00:00:00.000Z');
  ok(rules.cancelCorrectionDetail(alive as never, early).includes('그대로예요'), '살아 있으면 그대로라고 말한다');
  ok(rules.cancelCorrectionDetail(gone as never, early).includes('이미 지웠어요') && !rules.cancelCorrectionDetail(gone as never, early).includes('그대로예요'), '지웠으면 지웠다고 말한다');
  ok(rules.cancelCorrectionDetail(deleting as never, early).includes('지우고 있어요'), '지우는 중이면 그렇게 말한다');
  ok(rules.cancelCorrectionDetail(olderOnly as never, early).includes('그대로예요'), '옛 판만 지우면 지금 판은 그대로다');
  ok(rules.cancelCorrectionDetail(null, early).includes('그대로예요'), '지울 날이 없어도 그대로다');
  ok(rules.revokeRetentionText(alive as never, { now: early }).includes('2027. 02. 04') && rules.revokeRetentionText(alive as never, { now: early }).includes('까지 열려요'), '폐기해도 지울 날까지만 열린다');
  ok(!rules.revokeRetentionText(alive as never, { now: early }).includes('계속'), '계속 열린다고 안 말한다');
  ok(rules.revokeRetentionText(gone as never, { now: early }).includes('이미 지웠어요') && !rules.revokeRetentionText(gone as never, { now: early }).includes('열려요'), '지웠으면 열린다고 안 말한다');
  ok(rules.revokeRetentionText(deleting as never, { now: early }).includes('지우고 있어요'), '지우는 중이면 그렇게 말한다');
  eq(rules.revokeRetentionText(null, { now: early }), '동의 철회는 아니에요.', '지울 날이 없으면 날짜를 안 말한다');

  const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  const list = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
  ok(page.includes('<AnalysisChip') && !page.includes('analysisTone('), '상세 칩이 지운 사실을 안다');
  ok(list.split('<AnalysisChip').length === 3 && !list.includes('analysisTone('), '목록 두 칩이 지운 사실을 안다');
  ok(page.includes('cancelDetail={cancelCorrectionDetail(d.retention, now)}') && page.includes('retentionLine={revokeRetentionText(d.retention, { status: d.status, now })}'), '두 확인창이 지운 사실 · 지울 날 · 철회를 안다');
  ok(page.includes('retentionLine={withdrawConsentRetentionText(d.retention, now)}') && page.includes('goneViews={goneViewsOf(d.assets)}') && page.includes('emptyVideosText(d.assets)'), '철회 확인창 · 고침 칸 · 빈 영상 칸이 지운 사실 · 지울 날을 안다');
  ok(page.includes('<AnalysisChip status={d.analysisStatus} block={d.analysisBlock} />') && list.split('block={r.analysisBlock}').length === 3, '칩은 서버가 정한 막힘을 그대로 쓴다');
  const manage = readFileSync(new URL('./detail-manage.tsx', import.meta.url), 'utf8');
  const client = readFileSync(new URL('./detail-client.tsx', import.meta.url), 'utf8');
  ok(!manage.includes('얼린 판의 원본은 그대로예요') && !client.includes('원본은 계속 열려요'), '고정 글이 안 남는다');
}

/* ── 검증 지적: 지울 날이 지난 접수 · 철회한 접수의 확인창 글, 지운 접수의 칸 ── */
{
  const at = new Date('2027-02-10T00:00:00.000Z');
  const before = new Date('2027-01-10T00:00:00.000Z');
  const due = { purgeAt: '2027-02-04T00:00:00.000Z', anchorAt: '2026-11-06T00:00:00.000Z', basis: 'submitted', purgedAt: null, heldUntil: '2027-02-18T00:00:00.000Z', purging: null };
  const alive = { ...due, heldUntil: null };

  /* 고침 거두기 — 기다리던 삭제가 이어진다 */
  const cancel = rules.cancelCorrectionDetail(due as never, at);
  ok(!cancel.includes('그대로예요') && cancel.includes('다음 정리 때') && cancel.includes('되돌릴 수 없어요'), '지울 날이 지나 기다리는 원본은 거두면 지운다고 말한다');
  ok(!rules.cancelCorrectionDetail({ ...due, heldUntil: null } as never, at).includes('그대로예요'), '기다림 없이 지울 날이 지난 원본도 그대로라고 안 한다');
  ok(rules.cancelCorrectionDetail(alive as never, before).includes('그대로예요'), '지울 날 전에는 그대로다');

  /* 초대 폐기 — 지난 날짜까지 열린다고 안 하고, 철회한 접수에는 열린다고 안 한다 */
  const revokeDue = rules.revokeRetentionText(due as never, { status: 'correction_requested', now: at });
  ok(!revokeDue.includes('까지 열려요') && revokeDue.includes('다음 정리 때'), '지난 날짜까지 열린다고 안 한다');
  ok(rules.revokeRetentionText(alive as never, { status: 'verified', now: before }).includes('까지 열려요'), '지울 날 전에는 그날까지 열린다');
  const revokeWithdrawn = rules.revokeRetentionText(alive as never, { status: 'withdrawn', now: before });
  ok(revokeWithdrawn.includes('철회한 접수') && !revokeWithdrawn.includes('열려요') && !revokeWithdrawn.includes('동의 철회는 아니'), '철회한 접수에는 원본이 열린다고 안 한다');
  eq(rules.revokeRetentionText(null, { status: 'withdrawn', now: before }), '이미 철회한 접수예요.', '지울 날 없는 철회 초안');
  ok(!rules.withdrawnRetentionText({ ...alive, basis: 'published' } as never, at).includes('2027. 02. 04.에 지워요'), '철회 배너도 지난 날짜에 지운다고 안 한다');

  /* 필수 동의 철회 — 이미 지운 원본을 앞으로 지운다고 안 한다 */
  const gone = { ...alive, purgedAt: '2027-02-04T01:00:00.000Z' };
  const deleting = { ...alive, purging: { since: '2027-02-04T00:10:00.000Z', files: 2, scope: 'current' } };
  const wGone = rules.withdrawConsentRetentionText(gone as never, at);
  ok(wGone.includes('이미 지웠어요') && !wGone.includes('90일 뒤 지우고'), '지운 원본은 지웠다고 한다');
  ok(rules.withdrawConsentRetentionText(deleting as never, at).includes('지우고 있어요'), '지우는 중이면 그렇게 말한다');
  ok(rules.withdrawConsentRetentionText(alive as never, before).includes('90일 뒤 지우고'), '살아 있으면 규칙을 말한다');
  /*
   * 검증 지적: 공개한 적이 있는 접수는 철회가 지울 날을 늦추지 않는다(retention.ts). 지울 날이 지나 고침을 기다리던 원본은
   * 철회하면 기다림(status 'correction_requested')이 끝나 다음 정리 때 지운다 — 폐기 · 거두기 창과 같이 그렇게 말해야 한다.
   */
  for (const basis of ['published', 'resubmitted'] as const) {
    const wDue = rules.withdrawConsentRetentionText({ ...due, basis } as never, at);
    ok(wDue.includes('다음 정리 때') && wDue.includes('되돌릴 수 없어요') && !wDue.includes('원래 지울 날에 지워요'), `공개한 적 있는 지난 원본은 다음 정리 때 지운다고 한다: ${basis}`);
    ok(rules.withdrawConsentRetentionText({ ...alive, basis } as never, before).includes('원래 지울 날'), `지울 날 전이면 규칙을 그대로 말한다: ${basis}`);
  }
  /* 공개한 적 없는 접수는 철회한 날부터 다시 센다 — 지난 날짜라도 곧 지운다고 안 한다 */
  const wFresh = rules.withdrawConsentRetentionText(due as never, at);
  ok(wFresh.includes('철회한 날부터 90일 뒤') && !wFresh.includes('다음 정리 때'), '공개한 적 없으면 철회한 날부터 센다');
  const wDialog = draw(h(WithdrawConsentButton, { submissionId: SID, retentionLine: '원본 줄 자리' }));
  ok(wDialog.includes('원본 줄 자리') && !wDialog.includes('철회한 날부터'), '확인창이 받은 원본 줄을 쓴다');

  /* 삭제 기준 — 지운 뒤에는 지금 시계를 지운 근거라고 안 말하고, 접수 시계는 마지막으로 낸 날이다 */
  const facts = (r: unknown, files: string | null = null) => rules.retentionFactRows(r as never, files, at).map(([k]) => k);
  eq(facts(gone), ['원본 지운 날'], '지운 뒤에는 삭제 기준 줄이 없다');
  eq(facts(deleting), ['원본 지우는 중'], '지우는 중에도 없다');
  eq(facts(alive), ['원본 삭제 예정일', '삭제 기준'], '살아 있으면 기준을 말한다');
  ok(rules.retentionFactRows(alive as never, null, at)[1][1].includes('마지막으로 낸 날'), '공개한 적 없는 접수의 시계는 마지막으로 낸 날이다');
  eq(rules.retentionFactRows(null, '2026-11-08T00:00:00.000Z', at).map(([k]) => k), ['영상 지운 날'], '시계 없는 초안도 지운 날을 말한다');
  eq(rules.retentionFactRows(null, null, at), [], '없으면 없다');

  /* 고침 칸 — 지운 칸은 끝내지 못한 접수처럼 말하지 않는다 */
  const panel = { submissionId: SID, version: 7, requested: false, correction: null, requestedAt: null, uploadExpired: false, editable: true, extendChoices: [3, 7], cancelDetail: '거두기 글' };
  const goneForm = draw(h(CorrectionPanel, { ...panel, suggestViews: ['side', 'rear'], goneViews: ['side', 'rear'] }));
  ok(!goneForm.includes('다시 받아야 접수를 끝낼 수 있어요') && goneForm.includes('원본을 지웠어요'), '지운 칸은 지웠다고 말한다');
  const mixed = draw(h(CorrectionPanel, { ...panel, suggestViews: ['side', 'rear'], goneViews: ['rear'] }));
  ok(mixed.includes('옆 영상을 다시 받아야 접수를 끝낼 수 있어요') && mixed.includes('뒤 영상 원본을 지웠어요'), '막힌 칸과 지운 칸을 가른다');
  eq(rules.goneViewsOf([{ view: 'side', status: 'purged', current: true }, { view: 'rear', status: 'rejected', current: true }]), ['side'], '지운 칸만 고른다');

  /* 분석 칸 — 원본이 없으면 손 고르기 · 분석 전 주의 · 국외 이전 확인을 안 보인다 */
  const over = {
    runnable: false,
    blockers: [
      { code: 'original_purged', text: '보유 기간이 끝난 원본이라 쓸 수 없어요.' },
      { code: 'analysis_hand_required', text: '던지는 손을 먼저 정해 주세요.' },
      { code: 'analysis_confirm_required', text: '확인' },
    ],
    needsDraftConfirm: true,
    hand: null,
    inputNotes: [{ view: 'side', code: 'zoom_unknown', text: '옆 영상: 줌 배율을 읽지 못했어요. 1배로 찍었다고 보고 돌려요.', dropsTiming: false }],
  };
  const panelHtml = draw(h(AnalysisPanel, { submissionId: SID, analysisStatus: 'ready', readiness: over, runs: [], hand: null, withdrawn: false, activePublicationId: null }));
  ok(!panelHtml.includes('던지는 손을 정해') && !panelHtml.includes('던지는 손을 먼저') && !panelHtml.includes('분석 전에 볼 것') && !panelHtml.includes('국외 이전 안내'), '돌릴 수 없는 접수에 손 · 주의 · 확인 칸이 없다');
  ok(panelHtml.includes('보유 기간이 끝난 원본'), '까닭은 보인다');

  /* 분석 칩 — 칩은 서버가 준 막힘을 그대로 말한다 */
  const { AnalysisChip } = await import('../status-chip.tsx');
  const chip = (status: string, block: unknown) => renderToStaticMarkup(h(AnalysisChip, { status, block }));
  ok(chip('ready', 'withdrawn').includes('분석 불가') && chip('ready', 'revoked').includes('분석 불가') && chip('ready', 'overdue').includes('분석 불가'), '철회 · 폐기 · 지울 날 지남은 분석 불가다');
  ok(chip('ready', 'deleted').includes('원본 지워짐') && chip('none', 'deleting').includes('원본 지우는 중'), '지운 사실을 말한다');
  ok(chip('ready', null).includes('분석 가능') && chip('failed', 'withdrawn').includes('분석 실패'), '막힘이 없거나 끝난 분석은 그대로다');
}

/*
 * ── 받는 사람 고침 화면 — 막힘 차례 · 초점 · 칸 글이 순수 규칙(review-rules)과 이어져 있나 ──
 * 검증 지적: 규칙 함수만 시험해서, 화면이 옛 차례로 막거나 초점을 안 옮기거나 칸 글을 고정 글로 바꾸거나 초점 대상 id 를 지워도 몰랐다.
 * 진짜 CorrectionStep 을 그리고, 바닥 단추 처리기를 부르고, 다시 그려 본다. 초점은 그려진 마크업에 그 id 가 있을 때만 옮겨진 것으로 친다.
 */
{
  const { CorrectionStep } = await import('@/components/intake/status-steps');
  const real = await import('../../../../../components/intake/consent-block.tsx');
  const { EMPTY_VIEW_TEXT, GONE_VIEW_TEXT, correctionProblem } = await import('@/components/intake/review-rules');
  const { INTAKE_ERROR_TEXT } = await import('@/lib/intake/errors');
  type Props = Parameters<typeof CorrectionStep>[0];
  type Picked = Props['picked']['side'];

  let markup = '';
  const focused: string[] = [];
  const g = globalThis as unknown as { document?: unknown };
  const hadDocument = 'document' in g;
  const oldDocument = g.document;
  g.document = { getElementById: (id: string) => (markup.includes(`id="${id}"`) ? { focus: () => focused.push(id) } : null) };

  const doc = (kind: string, required: boolean) => ({ kind, version: `${kind}-v`, title: `${kind} 글`, required, defaultGranted: false, body: '본문', textHash: 'x' });
  const docs = [doc('submission', true), doc('overseas', true), doc('model', false)] as unknown as Props['docs'];
  const asset = (status: string) => ({ id: 'A1', view: 'side', status, fileName: 'IMG.MOV', sizeBytes: 1000, sha256: 'a'.repeat(64), integrity: null, fps: null, timing: null, codec: null, width: null, height: null, sampleDurationSec: null, rejectCode: null });
  /* 옆 칸은 원본을 지웠고, 뒤 칸은 끊긴 전송을 정리가 버려 비었다. 이름 · 두 영상 · 동의를 다시 받는다 */
  const state = {
    screen: 'correction',
    submissionStatus: 'correction_requested',
    analysisStatus: 'none',
    draft: { athleteName: '', athleteAgeBand: '14_or_over', throwingHand: 'R', submitterRelation: 'self', submitterName: null, samePitchConfirmed: true },
    assets: { side: asset('purged'), rear: null },
    consent: { requiredOk: false, granted: { submission: false, overseas: false, model: false } },
    correction: { fields: ['athleteName'], views: ['side', 'rear'], message: null },
  } as unknown as Props['state'];
  const submits: unknown[] = [];
  const none = { side: null, rear: null } as Props['picked'];
  const file = { file: { name: 'new.MOV', size: 2000 }, url: 'blob:x', facts: null } as unknown as Picked;
  const both = { side: file, rear: file } as Props['picked'];
  const render = (picked: Props['picked']) => {
    bench.hooks.i = 0;
    bench.clicks = {};
    bench.inputs = {};
    bench.checks = {};
    markup = renderToStaticMarkup(
      h(CorrectionStep, { state, docs, picked, inspecting: null, pickError: null, notes: {}, busy: false, error: null, consentEpoch: 0, onPick: () => {}, onSubmit: (x: unknown) => submits.push(x) }),
    );
    return markup;
  };
  /** 바닥 단추를 누르고, 옮긴 초점을 돌려준 뒤 다시 그린다 */
  const send = (picked: Props['picked']) => {
    focused.length = 0;
    const click = bench.clicks['고친 내용 보내기'];
    assert.ok(click, '고친 내용 보내기 단추가 있어요');
    click();
    const moved = [...focused];
    render(picked);
    return moved;
  };
  const between = (from: string, to: string | null, text: string) => {
    const start = markup.indexOf(`id="${from}"`);
    const end = to ? markup.indexOf(`id="${to}"`) : markup.length;
    const at = markup.indexOf(text, start);
    return start >= 0 && at > start && at < end;
  };

  bench.hooks.slots = [];
  render(none);
  for (const id of ['fix-name', 'slot-side', 'slot-rear', 'fix-same-pitch', 'consent-submission', 'consent-overseas']) ok(markup.includes(`id="${id}"`), `초점 대상 칸이 그려진다: ${id}`);
  ok(!markup.includes('id="consent-model"'), '고침 화면에 선택 동의 칸은 없다');

  /* 1 이름 — 아래 칸이 다 막혀도 맨 위 칸이 먼저다 */
  eq(send(none), ['fix-name'], '이름이 비면 이름 칸으로 초점이 간다');
  ok(markup.includes(INTAKE_ERROR_TEXT.athlete_name_required) && markup.includes('aria-describedby="fix-name-error"'), '이름 칸 곁에 막힌 까닭을 말한다');
  eq(submits.length, 0, '막히면 안 보낸다');

  /* 2 영상 — 지운 칸과 비운 칸을 가른다 */
  bench.inputs['fix-name']({ currentTarget: { value: '금윤호' } });
  render(none);
  eq(send(none), ['slot-side'], '다시 골라야 할 첫 영상 칸으로 초점이 간다');
  ok(between('slot-side', 'slot-rear', GONE_VIEW_TEXT), '지운 옆 칸은 지웠다고 말한다');
  ok(between('slot-rear', 'fix-same-pitch', EMPTY_VIEW_TEXT) && !between('slot-rear', 'fix-same-pitch', GONE_VIEW_TEXT), '정리가 비운 뒤 칸은 지웠다고 안 하고 골라 달라고 한다');
  /* 검증 지적: 지우고 있는 칸도 '지웠어요'라고 했다 — 같은 화면에서 옆 칸만 지우는 중으로 바꿔 본다 */
  const slotAssets = state.assets as unknown as Record<string, unknown>;
  slotAssets.side = asset('purging');
  render(none);
  ok(between('slot-side', 'slot-rear', '이 칸의 원본을 지우고 있어요. 영상을 다시 골라 주세요.') && !between('slot-side', 'slot-rear', GONE_VIEW_TEXT), '지우고 있는 옆 칸은 지우고 있다고 말한다');
  slotAssets.side = asset('purged');
  render(none);
  ok(!markup.includes(INTAKE_ERROR_TEXT.athlete_name_required), '고친 칸의 글은 걷힌다');

  /* 3 같은 투구 — 동의 칸보다 위다 */
  render(both);
  eq(send(both), ['fix-same-pitch'], '같은 투구 확인으로 초점이 간다(동의보다 먼저)');
  ok(markup.includes(INTAKE_ERROR_TEXT.same_pitch_required) && !markup.includes(GONE_VIEW_TEXT), '같은 투구 칸 곁에 말하고 영상 칸 글은 걷힌다');

  /* 4 동의 — 빠진 첫 필수 동의로 간다 */
  bench.checks['fix-same-pitch'](true);
  render(both);
  eq(send(both), ['consent-submission'], '빠진 첫 필수 동의로 초점이 간다');
  ok(markup.includes(INTAKE_ERROR_TEXT.consent_required), '동의 칸 곁에 말한다');

  /* 5 다 채우면 보낸다 — 초점은 안 옮긴다 */
  bench.checks['consent-submission'](true);
  bench.checks['consent-overseas'](true);
  render(both);
  eq(send(both), [], '막힘이 없으면 초점을 안 옮긴다');
  eq(submits, [{ patch: { athleteName: '금윤호' }, agreed: { submission: true, overseas: true, model: false }, samePitch: true }], '고친 이름 · 동의 · 같은 투구 확인을 보낸다');

  /* 화면이 쓰는 막힘 차례와 규칙의 차례가 같다 — 위 차례가 규칙에서 나온 것인지 한 번 더 본다 */
  const check = { nameAsked: true, name: '', missing: ['side'] as const, viewsAsked: true, same: false, needsConsent: true, docs, agreed: {} };
  eq(
    [correctionProblem(check)?.target, correctionProblem({ ...check, name: 'x' })?.target, correctionProblem({ ...check, name: 'x', missing: [] })?.target, correctionProblem({ ...check, name: 'x', missing: [], same: true })?.target],
    ['fix-name', 'slot-side', 'fix-same-pitch', 'consent-submission'],
    '규칙의 차례와 화면의 초점 차례가 같다',
  );

  /* 쥔 처리기는 가짜 부품의 것이다 — 진짜 부품도 같은 id 를 그리는지 본다 */
  const realConsents = renderToStaticMarkup(h(real.RequiredConsents, { docs, agreed: {}, onChange: () => {}, invalid: false }));
  ok(realConsents.includes('id="consent-submission"') && realConsents.includes('id="consent-overseas"'), '진짜 동의 칸이 초점 대상 id 를 그린다');
  ok(renderToStaticMarkup(h(real.CheckRow, { id: 'fix-same-pitch', checked: false, onChange: () => {}, label: '같은 투구' })).includes('id="fix-same-pitch"'), '진짜 체크 칸이 초점 대상 id 를 그린다');

  /*
   * 검증 지적: 요청받은 칸을 새로 안 고른 경우를 화면이 못 잡았다 — 얼린 파일이 살아 있는 칸, 해시가 달라 막힌 칸.
   * 화면은 막지 않고 보냈고, 서버는 막힌 칸에 '전송이 아직 끝나지 않았어요'라고 했다. 보내기 전에 그 칸으로 초점을 옮기고 새 영상을 골라 달라고 한다.
   */
  const { REPICK_VIEW_TEXT } = await import('@/components/intake/review-rules');
  for (const [kind, status] of [
    ['얼린 파일 그대로', 'verified'],
    ['막힌 파일', 'rejected'],
  ] as const) {
    const live = {
      ...(state as unknown as Record<string, unknown>),
      draft: { ...(state as unknown as { draft: object }).draft, athleteName: '금윤호' },
      assets: { side: { ...asset(status), rejectCode: status === 'rejected' ? 'hash_mismatch' : null }, rear: { ...asset('verified'), id: 'A2', view: 'rear' } },
      consent: { requiredOk: true, granted: { submission: true, overseas: true, model: false } },
      correction: { fields: [], views: ['side'], message: null },
      frozenAssetIds: { side: 'A1', rear: 'A2' },
    } as unknown as Props['state'];
    const before = submits.length;
    bench.hooks.slots = [];
    const drawLive = (picked: Props['picked']) => {
      bench.hooks.i = 0;
      bench.clicks = {};
      bench.checks = {};
      markup = renderToStaticMarkup(
        h(CorrectionStep, { state: live, docs, picked, inspecting: null, pickError: null, notes: {}, busy: false, error: null, consentEpoch: 0, onPick: () => {}, onSubmit: (x: unknown) => submits.push(x) }),
      );
    };
    drawLive(none);
    bench.checks['fix-same-pitch'](true);
    drawLive(none);
    focused.length = 0;
    bench.clicks['고친 내용 보내기']();
    eq([...focused], ['slot-side'], `새로 안 고른 요청 칸으로 초점이 간다: ${kind}`);
    eq(submits.length, before, `새로 안 고르면 보내지 않는다: ${kind}`);
    drawLive(none);
    ok(between('slot-side', 'fix-same-pitch', REPICK_VIEW_TEXT), `그 칸 곁에 새 영상을 골라 달라고 한다: ${kind}`);
    const sideOnly = { side: file, rear: null } as Props['picked'];
    drawLive(sideOnly);
    focused.length = 0;
    bench.clicks['고친 내용 보내기']();
    eq([[...focused], submits.length], [[], before + 1], `새로 고르면 보낸다: ${kind}`);
  }

  /*
   * 검증 지적: 고침 중에 새 파일이 이미 도착한 칸(얼린 파일은 A1, 칸은 A3)에도 '이 영상을 다시 골라 주세요'라고 했다. 막힘 판단은 다시 고를 필요가 없다고 보는데 칸 글만 달랐다.
   * 그 칸은 도착 글을 보이고, 얼린 그 파일 그대로인 칸만 새 영상을 골라 달라고 한다. 같은 영상을 다시 고르라는 말로 읽히지 않게 '새 영상'이라고 한다.
   */
  const slotFor = (sideId: string, status: string) => {
    const shown = {
      ...(state as unknown as Record<string, unknown>),
      draft: { ...(state as unknown as { draft: object }).draft, athleteName: '금윤호' },
      assets: { side: { ...asset(status), id: sideId }, rear: { ...asset('verified'), id: 'A2', view: 'rear' } },
      consent: { requiredOk: true, granted: { submission: true, overseas: true, model: false } },
      correction: { fields: [], views: ['side'], message: null },
      frozenAssetIds: { side: 'A1', rear: 'A2' },
    } as unknown as Props['state'];
    bench.hooks.slots = [];
    bench.hooks.i = 0;
    markup = renderToStaticMarkup(
      h(CorrectionStep, { state: shown, docs, picked: none, inspecting: null, pickError: null, notes: {}, busy: false, error: null, consentEpoch: 0, onPick: () => {}, onSubmit: () => {} }),
    );
  };
  slotFor('A3', 'uploaded');
  ok(!between('slot-side', 'fix-same-pitch', '골라 주세요') && between('slot-side', 'fix-same-pitch', '도착했어요'), '새 파일이 도착한 칸은 다시 고르라고 하지 않고 도착 글을 보인다');
  slotFor('A1', 'verified');
  ok(between('slot-side', 'fix-same-pitch', '새 영상을 골라 주세요.') && !between('slot-side', 'fix-same-pitch', '이 영상을 다시 골라 주세요'), '얼린 그 파일 그대로인 칸은 새 영상을 골라 달라고 한다');
  slotFor('A1', 'purged');
  ok(between('slot-side', 'fix-same-pitch', '이 영상을 다시 골라 주세요.'), '지운 칸은 그 영상을 다시 보내 달라고 한다');

  if (hadDocument) g.document = oldDocument;
  else delete g.document;
}

/* ── 검증 지적(낮음): 지우는 중을 지웠다고 함 · 칸 하나만 지운 빈 영상 칸 · 판에 안 오른 파일의 낱말 ── */
{
  const { slotProgressOf, analysisBlockOf, analysisChipText } = await import('@/lib/intake/admin-labels');

  /* 1 고침 칸 — 지우고 있는 원본을 '지웠어요'라고 안 하고, 지운 칸 · 지우는 칸이 섞이면 둘 다 말한다 */
  const corr = { submissionId: SID, version: 7, requested: false, correction: null, requestedAt: null, uploadExpired: false, editable: true, extendChoices: [3, 7], cancelDetail: '거두기 글' };
  const correctionFor = (side: string, rear: string) => {
    const assets = [
      { view: 'side', status: side, current: true },
      { view: 'rear', status: rear, current: true },
    ] as never;
    return draw(h(CorrectionPanel, { ...corr, suggestViews: rules.viewsToResend(assets), goneViews: rules.goneViewsOf(assets), deletingViews: rules.deletingViewsOf(assets) }));
  };
  const deletingBoth = correctionFor('purging', 'purging');
  ok(deletingBoth.includes('옆 영상 · 뒤 영상 원본을 지우고 있어요. 다시 분석하려면 영상을 다시 받아야 해요.') && !deletingBoth.includes('지웠어요'), '지우고 있는 원본을 지웠다고 안 한다');
  const mixedGone = correctionFor('purged', 'purging');
  ok(mixedGone.includes('옆 영상 원본을 지웠어요. 뒤 영상 원본을 지우고 있어요.'), '지운 칸과 지우는 칸을 따로 말한다');
  const doneBoth = correctionFor('purged', 'purged');
  ok(doneBoth.includes('옆 영상 · 뒤 영상 원본을 지웠어요.') && !doneBoth.includes('지우고 있어요'), '다 지운 칸은 지웠다고 한다');
  const deletingBlocked = correctionFor('rejected', 'purging');
  ok(deletingBlocked.includes('옆 영상을 다시 받아야 접수를 끝낼 수 있어요') && deletingBlocked.includes('뒤 영상 원본을 지우고 있어요.') && !deletingBlocked.includes('지웠어요'), '막힌 칸 · 지우는 칸을 가른다');
  eq(rules.deletingViewsOf([{ view: 'side', status: 'purging', current: true }, { view: 'rear', status: 'purged', current: true }, { view: 'rear', status: 'purging', current: false }] as never), ['side'], '지우는 칸은 지금 칸의 purging 뿐이다');
  const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  ok(page.includes('deletingViews={deletingViewsOf(d.assets)}'), '고침 칸이 지우는 칸을 안다');

  /* 2 빈 영상 칸 — 목록 칸(slotProgressOf)과 칸마다 같은 판단이다. 칸 하나만 지워도 받은 적 없는 접수처럼 안 말한다 */
  const file = (view: string, status: string, revisions: number[] = []) => ({ view, status, current: false, revisions });
  eq(rules.emptyVideosText([file('side', 'purged'), file('rear', 'abandoned')] as never), '옆 영상은 지웠어요. 뒤 영상은 없어요.', '옆만 지우고 뒤는 버린 초안');
  eq(rules.emptyVideosText([file('side', 'purging'), file('rear', 'abandoned')] as never), '옆 영상은 지우고 있어요. 뒤 영상은 없어요.', '지우는 칸은 지우고 있다고 한다');
  eq(rules.emptyVideosText([file('rear', 'purged')] as never), '옆 영상은 없어요. 뒤 영상은 지웠어요.', '받은 적 없는 칸은 없다고 한다');
  eq(rules.emptyVideosText([file('side', 'purged'), file('rear', 'purging')] as never), '옆 영상은 지웠어요. 뒤 영상은 지우고 있어요.', '지운 칸 · 지우는 칸이 섞이면 둘 다 말한다');
  eq(rules.emptyVideosText([file('side', 'purged'), file('rear', 'purged')] as never), '받은 영상을 지웠어요.', '다 지웠으면 한 줄이다');
  eq(rules.emptyVideosText([file('side', 'purging'), file('rear', 'purging')] as never), '받은 영상을 지우고 있어요.', '다 지우는 중이면 한 줄이다');
  eq(rules.emptyVideosText([file('side', 'verified', [1]), file('rear', 'verified', [1]), file('side', 'purged')] as never), '새로 받은 영상이 없어요. 판에 얼린 원본은 아래 이전에 고른 영상에 있어요.', '얼린 원본이 살아 있으면 지금 글이다');
  eq(rules.emptyVideosText([]), '아직 고른 영상이 없어요.', '받은 적 없으면 그대로다');
  /* 칸 넷의 모든 짝 — 글이 칸마다 목록과 같은 판단을 말한다 */
  const kinds: (string | null)[] = [null, 'abandoned', 'purged', 'purging'];
  for (const s of kinds)
    for (const r of kinds) {
      const assets = [...(s ? [file('side', s)] : []), ...(r ? [file('rear', r)] : [])];
      const text = rules.emptyVideosText(assets as never);
      const progress = (['side', 'rear'] as const).map((v) => slotProgressOf(assets, v, null));
      for (const [i, v] of (['옆', '뒤'] as const).entries()) {
        const p = progress[i];
        const said = text.includes(`${v} 영상은 지웠어요`) || (text === '받은 영상을 지웠어요.' && p === 'deleted');
        const saying = text.includes(`${v} 영상은 지우고 있어요`) || (text === '받은 영상을 지우고 있어요.' && p === 'deleting');
        ok(said === (p === 'deleted') && saying === (p === 'deleting'), `칸마다 목록과 같다: 옆 ${s} · 뒤 ${r} → ${text}`);
      }
    }

  /* 3 판에 안 오른 파일 — '원본'은 판에 얼린 파일만 부른다. 철회 초안의 보유 줄 · 배너 · 칩은 '영상' · '받은 영상'이다 */
  const now = new Date('2026-11-20T00:00:00.000Z');
  const draftR = { purgeAt: '2026-11-17T00:00:00.000Z', anchorAt: '2026-11-10T00:00:00.000Z', basis: 'withdrawn_draft', purgedAt: null, heldUntil: null, purging: null };
  eq(rules.retentionText(draftR as never, new Date('2026-11-12T00:00:00.000Z')).label, '영상 삭제 예정일', '철회 초안의 지울 날은 영상 삭제 예정일이다');
  eq(rules.retentionText({ ...draftR, purgedAt: '2026-11-17T01:00:00.000Z' } as never, now).label, '영상 지운 날', '지운 뒤에는 영상 지운 날이다');
  eq(rules.retentionText({ ...draftR, purging: { since: '2026-11-17T00:10:00.000Z', files: 1, scope: 'current' } } as never, now).label, '영상 지우는 중', '지우는 중도 영상이다');
  /* 판이 없으면 purgingScope 는 'older' 라고 한다 — 옛 판이 없는 초안에 '옛 판 파일'이라고 하지 않고 지우는 중이라고 한다 */
  const draftOlder = rules.retentionText({ ...draftR, purging: { since: '2026-11-17T00:10:00.000Z', files: 1, scope: 'older' } } as never, now);
  ok(draftOlder.label === '영상 지우는 중' && !draftOlder.note?.includes('옛 판'), '판 없는 초안의 지우는 파일은 옛 판이 아니다');
  eq(rules.retentionFactRows({ ...draftR, purgedAt: '2026-11-17T01:00:00.000Z' } as never, '2026-11-17T01:00:00.000Z', now).map(([k]) => k), ['영상 지운 날'], '보유 줄도 영상 지운 날이다');
  eq(rules.retentionFactRows(draftR as never, null, new Date('2026-11-12T00:00:00.000Z')).map(([k]) => k), ['영상 삭제 예정일', '삭제 기준'], '지울 날 줄도 영상이다');
  const banner = rules.withdrawnRetentionText({ ...draftR, purgedAt: '2026-11-17T01:00:00.000Z' } as never, now);
  ok(banner.includes('받은 영상은') && banner.includes('지웠어요') && !banner.includes('원본'), `철회 배너가 받은 영상이라고 한다: ${banner}`);
  const bannerDue = rules.withdrawnRetentionText(draftR as never, new Date('2026-11-12T00:00:00.000Z'));
  ok(bannerDue.includes('받은 영상은') && !bannerDue.includes('원본'), `지울 날 전 배너도 받은 영상이다: ${bannerDue}`);
  ok(!rules.withdrawnRetentionText(draftR as never, now).includes('원본'), '지울 날이 지난 배너도 원본이라고 안 한다');
  ok(!rules.revokeRetentionText(draftR as never, { status: 'withdrawn', now }).includes('원본'), '폐기 확인창도 판에 안 오른 파일을 원본이라고 안 한다');
  /* 배너 첫 줄도 같은 낱말이다 — 한 배너에서 '원본'과 '받은 영상'이 섞이지 않게 */
  eq(rules.withdrawnBannerLead({ revisions: [] } as never), '필수 동의가 철회된 접수예요. 받은 영상을 열거나 분석할 수 없어요.', '판에 안 오른 철회 초안의 배너는 받은 영상이다');
  eq(rules.withdrawnBannerLead({ revisions: [{ number: 1 }] } as never), '필수 동의가 철회된 접수예요. 원본을 열거나 분석할 수 없어요.', '판이 있으면 원본이다');
  ok(page.includes('{withdrawnBannerLead(d)}') && !page.includes('원본을 열거나 분석할 수 없어요'), '배너가 낱말 규칙을 쓴다');
  /* 판이 있는 접수는 그대로 '원본'이다 */
  eq(rules.retentionText({ ...draftR, basis: 'withdrawn', purgedAt: '2026-11-17T01:00:00.000Z' } as never, now).label, '원본 지운 날', '판이 있으면 원본이다');
  ok(rules.withdrawnRetentionText({ ...draftR, basis: 'withdrawn', purgedAt: '2026-11-17T01:00:00.000Z' } as never, now).includes('원본은'), '판이 있는 철회 배너는 원본이다');

  /* 칩 — 지금 판이 없는 접수에서 지운 파일은 '영상 지워짐'이다. 판이 있으면 '원본 지워짐' 그대로 */
  const at = new Date('2027-01-01T00:00:00.000Z');
  const noRev = { status: 'draft', invitationStatus: 'active', originalPurgeAt: null, originalsPurgedAt: '2026-12-01T00:00:00.000Z', originalsPurging: null, hasRevision: false };
  const noRevBlock = analysisBlockOf(noRev, at);
  eq([noRevBlock, analysisChipText('none', noRevBlock)], ['received_deleted', '영상 지워짐'], '판이 없는 접수의 지운 파일은 영상 지워짐이다');
  const noRevDeleting = analysisBlockOf({ ...noRev, originalsPurgedAt: null, originalsPurging: 'current' }, at);
  eq([noRevDeleting, analysisChipText('none', noRevDeleting)], ['received_deleting', '영상 지우는 중'], '지우는 중도 영상이다');
  eq(analysisBlockOf({ ...noRev, originalsPurgedAt: null, originalsPurging: 'older' }, at), 'received_deleting', '판이 없으면 older 도 받은 영상을 지우는 중이다');
  const withRev = analysisBlockOf({ ...noRev, status: 'verified', hasRevision: true }, at);
  eq([withRev, analysisChipText('ready', withRev)], ['deleted', '원본 지워짐'], '판이 있으면 원본 지워짐 그대로다');
  ok(analysisBlockOf({ ...noRev, status: 'withdrawn' }, at) === 'received_deleted', '철회한 초안도 지운 사실을 먼저 말한다');
}

/* ── 새 링크 만들기 — 경고 · 본 횟수를 보낸다 · 준비가 안 되면 꺼진다 ── */
{
  const labels = await import('@/lib/intake/admin-labels');
  const html = draw(h(ReissueButton, { submissionId: SID, reissueCount: 3, ready: true, blockedText: null, devNote: null }));
  ok(html.includes('새 링크 만들기') && !/<button[^>]*disabled/.test(html), '준비되면 새 링크 단추가 켜진다');
  ok(html.includes(labels.REISSUE_WARNING_TEXT), '확인 창이 예전 링크가 막히고 자료가 이어진다고 말한다');
  ok(labels.REISSUE_WARNING_TEXT.includes('예전 링크는 바로 막혀요') && !labels.REISSUE_WARNING_TEXT.includes('—'), '경고 글 — 줄표 없이');
  await press(bench.confirms['새 링크를 만들까요?'], '새 링크 확인');
  eq(bench.calls, [['reissueIntakeInvitation', SID, 3]], '그릴 때 본 바꿈 횟수를 보낸다');
  const off = draw(h(ReissueButton, { submissionId: SID, reissueCount: 0, ready: false, blockedText: 'DB 마이그레이션 적용 전이에요.', devNote: null }));
  ok(/<button[^>]*disabled/.test(off) && off.includes('DB 마이그레이션 적용 전이에요.'), '준비가 안 되면 단추가 꺼지고 까닭을 말한다');
  /* 준비 글 · 개발용 표시 */
  eq(labels.readinessLines({ blockers: [], link: { source: 'default', problem: null, external: true } }), [], '준비되면 안내가 없다');
  ok(labels.readinessLines({ blockers: ['db', 'origin'], link: { source: 'default', problem: null, external: true } }).length === 2, '막힌 까닭마다 한 줄');
  ok(labels.devLinkText({ link: { source: 'NEXT_PUBLIC_SITE_URL', problem: 'not_https', external: false } })?.includes('https 주소가 아니에요'), '개발용 표시가 까닭을 말한다');
  for (const t of [...labels.readinessLines({ blockers: ['db', 'origin'], link: { source: 'INTAKE_PUBLIC_ORIGIN', problem: 'local_host', external: false } }), labels.devLinkText({ link: { source: 'default', problem: 'preview_host', external: false } }) ?? '', labels.UNTOUCHED_TEXT]) {
    ok(!t.includes('—'), `줄표 없는 글: ${t.slice(0, 20)}`);
  }
  ok(labels.AUDIT_ACTION_TEXT['invitation.reissued'] === '링크를 새로 바꿨어요', '링크 바꿈 감사 글');
}

console.log(`intake detail: ${passed}개 통과`);
