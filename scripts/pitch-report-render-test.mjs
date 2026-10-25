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
      return data("export const ButtonLink=({children,href})=>globalThis.__reportReact.createElement('a',{href},children);");
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
const report = buildReport(result, { heightCm: 180, ground: 'mound', youth: false, drills });
globalThis.__reportMetrics.drift.aheadAtKneeUp = 0.1;
const heldReport = buildReport(result, { heightCm: 180, ground: 'mound', youth: false, drills });
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
for (const components of [native, web]) {
  const flow = render(components.FlowCard, { report: { ...report, primary: '몸통 회전' }, onPick() {} });
  assert.match(flow, /평가 1개 · 참고 5개 · 미판정 0개/);
  assert.match(flow, /지표 검증 중/);
  assert.match(flow, /회전 속도를 평가한 값은 아니에요/);
  const rx = render(components.RxCard, { report, reportId: 'r1', mine: true, focus: null });
  assert.match(rx, /레그 리프트 드리프트/);
  assert.match(rx, /기초/);
  const hold = render(components.RxCard, { report: heldReport, reportId: 'r1', mine: true, focus: null });
  assert.match(hold, /자동 처방의 근거로 쓰지 않아요/);
  assert.doesNotMatch(hold, /처방 시작/);
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
  assert.match(render(components.RxCard, { report: old, reportId: 'r1', mine: true, focus: null }), /기준을 업데이트/);
}
console.log('앱·웹 리포트 렌더 검사 통과: 확인 범위·측정 지표·기초 시작·자동 처방 보류·이전 서버 응답 호환');
