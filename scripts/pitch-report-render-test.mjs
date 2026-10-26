/** 앱·웹의 실제 리포트 컴포넌트를 같은 결과로 렌더링한다. 네이티브 기본 뷰·영상만 대체한다. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
globalThis.__reportReact = React;
const reactUrl = import.meta.resolve('react');
const jsxUrl = import.meta.resolve('react/jsx-runtime');
const data = (source) => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });
registerHooks({
  resolve(s, c, next) {
    if (s === 'react') return { url: reactUrl, shortCircuit: true };
    if (s === 'react/jsx-runtime') return { url: jsxUrl, shortCircuit: true };
    if (s === 'react-native')
      return data(
        `const h=globalThis.__reportReact.createElement; export const View=({children})=>h('div',null,children); export const Text=({children})=>h('span',null,children); export const Pressable=({children})=>h('button',null,children); export const StyleSheet={create:v=>v,hairlineWidth:1,absoluteFillObject:{}};`
      );
    if (s === 'expo-image') return data('export const Image=()=>null;');
    if (s === 'expo-haptics') return data('export const selectionAsync=async()=>{};');
    if (s === 'expo-router') return data('export const router={push(){}};');
    if (s === '~/shell/web-nav') return data('export const leaveTo=()=>{};');
    if (s === '~/lib/ui') return data('export const TYPE={};');
    if (s === '@/components/ui')
      return data(
        "const h=globalThis.__reportReact.createElement; export const ButtonLink=({children,href})=>h('a',{href},children); export const Button=({children})=>h('button',null,children);"
      );
    if (s === 'next/link') return data("export default ({children,href})=>globalThis.__reportReact.createElement('a',{href},children);");
    return next(s, c);
  },
  load(url, c, next) {
    if (url.endsWith('/lib/pitch-3d/v2/mech-checks.ts'))
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export const DROP_RISE_MAX=.02;export const mechChecks=()=>globalThis.__reportMetrics;',
      };
    if (url.endsWith('.tsx'))
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
      };
    return next(url, c);
  },
});
const { buildReport } = await import('../lib/pitch-3d/v2/report.ts');
const native = await import('../native/src/lab/report.tsx');
const web = await import('../app/(app)/videos/lab/[id]/report-parts.tsx');
globalThis.__reportMetrics = {
  hand: 'R',
  drift: { aheadAtKneeUp: 0.065, conf: 50 },
  drop: { pelvisDrop: 0.36, rise: 0, conf: 50 },
  separation: { trunkOpenAtPlantDeg: -40, trunkConf: 50 },
  trunkTilt: { forwardDeg: 30, conf: 50 },
  arm: { abductionAtPlantDeg: 88, conf: 50 },
  block: { pelvisDecelPct: 95, kneeExtensionDeg: 10, kneeCollapseDeg: 30, conf: 50 },
};
const result = {
  hand: 'R',
  joints: [],
  conf: [],
  events: { kneeUp: 5, footPlant: 10, release: 20 },
  t: Array.from({ length: 30 }, (_, i) => i / 60),
};
const { prescribedTitles } = await import('../lib/mechanics/prescriptions.ts');
const drills = ['기초', '연결', '통합'].map((stage) => ({
  title: prescribedTitles('drift.stuck', stage, 1)[0],
  stage,
  category: '무브먼트 패턴 드릴',
  focusPoints: ['드리프트'],
  thumbUrl: null,
}));
const opts = { heightCm: 180, ground: 'mound', youth: false, drills };
/* 드리프트 경계 · 브레이크 고칠 점(30°) — 2026-10-26 등급이면 둘 다 평가 · 개선 드릴 */
const report = buildReport(result, opts);
globalThis.__reportMetrics.drift.aheadAtKneeUp = 0.1;
globalThis.__reportMetrics.block.kneeCollapseDeg = 3;
/* 모두 좋아요(스로잉만 참고) — 권할 드릴 없음 */
const heldReport = buildReport(result, opts);
/* 성장기 — 드롭 · 브레이크 · 몸통은 참고(관찰 + 제한 한 줄) */
const refReport = buildReport(result, { ...opts, youth: true });
globalThis.__reportMetrics.arm.conf = 10;
const hardReport = buildReport(result, opts);
const hardYouth = buildReport(result, { ...opts, youth: true });
const c = {
  page: '#fff',
  card: '#fff',
  line: '#eee',
  ink: '#111',
  muted: '#777',
  sky: '#0088ff',
  warn: '#aa6600',
  warnBg: '#fff4dd',
  ok: '#00aa66',
  action: '#0088ff',
};
const render = (component, props) => renderToStaticMarkup(React.createElement(component, { c, ...props }));
/* 웹: 참고 · 확인 어려움을 모양과 접근성 이름으로 가른다(색만이 아니라) */
const webFlow = renderToStaticMarkup(React.createElement(web.FlowCard, { report: hardYouth, onPick() {} }));
assert.match(webFlow, /aria-label="브레이크 참고"/);
assert.match(webFlow, /aria-label="상하체 분리 좋아요"/);
assert.match(webFlow, /aria-label="스로잉 확인 어려움"/);
assert.match(webFlow, /border-2 border-muted bg-surface[^"]*"[^>]*><span class="size-1.5 rounded-full bg-muted"/, '참고 = 실선 고리 + 가운데 점');
assert.match(webFlow, /border-dashed border-line-strong bg-surface[^"]*"[^>]*><\/span>/, '확인 어려움 = 점선 빈 고리');
for (const components of [native, web]) {
  const flow = render(components.FlowCard, { report: { ...report, primary: '브레이크' }, onPick() {} });
  assert.match(flow, /수치 확인 6\/6 · 평가 가능 5\/6/);
  assert.match(flow, /수치 확인 · 평가 가능/);
  assert.match(flow, /30°/);
  assert.doesNotMatch(flow, /지표 검증 중/, '평가 지표에 검증 중 표시 없음');
  /* 참고(성장기 · 스로잉)는 관찰이 주 설명, 제한은 띠 밑 보조 문구 */
  const ref = render(components.FlowCard, { report: { ...refReport, primary: '몸통 회전' }, onPick() {} });
  assert.match(ref, /공을 놓을 때 몸통이 앞으로 30° 기울어져 있어요/);
  assert.match(ref, /회전 속도를 평가한 값은 아니에요/);
  assert.match(ref, /성장기는 크기보다 순서를 먼저 봐서/);
  assert.match(ref, /성장기라 참고/);
  assert.ok(ref.indexOf('기울어져 있어요') < ref.indexOf('성장기는 크기보다'), '관찰이 제한 안내보다 먼저');
  const armRef = render(components.FlowCard, { report: { ...refReport, primary: '스로잉' }, onPick() {} });
  assert.match(armRef, /어깨 벌림은 88°예요/);
  assert.match(armRef, /동작이나 촬영에 문제가 있다는 뜻은 아니에요/);
  assert.match(armRef, /지표 검증 중/);
  assert.match(render(components.FlowCard, { report: { ...refReport, primary: '드롭' }, onPick() {} }), /골반 높이가 다리 길이의 36%만큼 내려가요/);
  const hard = render(components.FlowCard, { report: { ...hardReport, primary: '스로잉' }, onPick() {} });
  assert.match(hard, /확인 어려움/);
  assert.match(hard, /착지 때 던지는 팔이 영상에서 잘 보이지 않아/);
  assert.match(hard, /수치 확인 5\/6 · 평가 가능 5\/6/);
  /* 개선 드릴 — 한 번 보는 목록, 새 3주 처방 단추 없음 */
  const rx = render(components.RxCard, { report, mine: true, focus: null });
  assert.match(rx, /개선 드릴 · 쉬운 것부터/);
  assert.match(rx, /레그 리프트 드리프트/);
  assert.match(rx, /기초/);
  assert.match(rx, /드릴 영상 보기/);
  assert.match(rx, /같은 자리에서 다시 찍으면 지난번과 숫자를 견줘/);
  assert.doesNotMatch(rx, /처방 시작|1단계|집중 · 2칸|보조 · 1칸/);
  assert.match(render(components.RxCard, { report, mine: true, focus: { done: 3, total: 9 } }), /처방 진행 중 3 \/ 9/, '진행 중인 옛 처방은 그대로');
  const hold = render(components.RxCard, { report: heldReport, mine: true, focus: null });
  assert.match(hold, /고칠 점이 없어 따로 권할 드릴이 없어요/);
  assert.doesNotMatch(hold, /처방 시작|자동 처방/);
  const old = {
    ...report,
    criteria: '2026-10-21',
    coverage: undefined,
    items: report.items.map((i) => {
      const copy = { ...i };
      delete copy.measurement;
      return copy;
    }),
  };
  assert.match(render(components.FlowCard, { report: old, onPick() {} }), /이전 판정 기준/);
  assert.match(render(components.RxCard, { report: old, mine: true, focus: null }), /기준을 업데이트/);
  /* 지난번 리포트와 견주기 — 숫자는 촬영 조건 확인 뒤에만, 못 견주면 까닭 한 줄 */
  const prev = { reportId: 'p1', requestedAt: '2026-10-20T03:00:00.000Z', compared: true, reason: null, note: '한 구씩 비교한 수치 변화예요.', rows: [{ key: 'drift', element: '드리프트', label: '니업 때 골반이 축발보다 앞', before: 8.2, after: 10.1, delta: 1.9, unit: '% 키' }] };
  const cmp = render(components.CompareCard, { prev });
  assert.match(cmp, /지난번 리포트와 견주기 · 10월 20일/);
  assert.match(cmp, /지난번과 같은 자리 · 배율 · 세기로 찍었어요/);
  assert.doesNotMatch(cmp, /키의 8\.2%/, '확인 전에는 숫자를 안 보인다');
  const held = render(components.CompareCard, { prev: { ...prev, compared: false, reason: '분석 엔진 버전이 다르거나 확인되지 않아요.', rows: [] } });
  assert.match(held, /분석 엔진 버전이 다르거나/);
  assert.doesNotMatch(held, /같은 자리 · 배율/);
}
console.log('앱·웹 리포트 렌더 검사 통과: 확인 범위·평가 5 · 참고 관찰·확인 어려움 구분·개선 드릴(새 3주 처방 없음 · 진행 중 처방 유지)·이전 서버 응답 호환');
