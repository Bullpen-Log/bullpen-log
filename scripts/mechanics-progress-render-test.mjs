/** 실제 앱·웹 진행/장비 컴포넌트의 표시를 비교한다. 네이티브 기본 뷰와 실행하지 않는 서버 동작만 대체한다. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
globalThis.__progressReact = React;
const reactUrl = import.meta.resolve('react'),
  jsxUrl = import.meta.resolve('react/jsx-runtime');
const data = (source) => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });
registerHooks({
  resolve(s, c, next) {
    if (s === 'react') return { url: reactUrl, shortCircuit: true };
    if (s === 'react/jsx-runtime') return { url: jsxUrl, shortCircuit: true };
    if (s === 'react-native')
      return data(
        `const h=globalThis.__progressReact.createElement;export const View=({children})=>h('div',null,children);export const Text=({children})=>h('span',null,children);`
      );
    if (s === '~/shell/press')
      return data(
        `export const Press=({children,disabled,accessibilityRole})=>globalThis.__progressReact.createElement('button',{disabled,role:accessibilityRole},children);`
      );
    if (s === '~/mechanics/parts') return data('export const act=async()=>({ok:true});');
    if (s === 'expo-router') return data('export const router={push(){}};');
    if (s === '@/lib/quiet-refresh') return data('export const quietRefresh=()=>{};');
    if (s === 'next/navigation') return data('export const useRouter=()=>({refresh(){}});export const unstable_rethrow=()=>{};');
    if (s === 'next/link')
      return data(`export default function Link({href,children}){return globalThis.__progressReact.createElement('a',{href},children);}`);
    if (s === '@/app/actions/mechanics')
      return data(
        'export const saveMechanicsEquipment=async()=>({ok:true});export const convertMechanicsFocus=saveMechanicsEquipment;export const recordMechanicsNextDay=saveMechanicsEquipment;export const advanceMechanicsStage=saveMechanicsEquipment;'
      );
    return next(s, c);
  },
  load(url, c, next) {
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
const { focusView } = await import('../lib/mechanics/program.ts');
const { newProgression } = await import('../lib/mechanics/progression.ts');
const { REPORT_CRITERIA } = await import('../lib/pitch-3d/v2/report-policy.ts');
const native = await import('../native/src/mechanics/focus-progress.tsx');
const web = await import('../app/(app)/training/focus-progress.tsx');
const rx = {
  element: '드리프트',
  fault: 'drift.stuck',
  key: 'drift',
  level: 'improve',
  slots: 1,
  cue: '목표 신호',
  target: null,
  weeks: [],
};
const progression = newProgression('run', [rx]);
progression.evidence = [
  {
    id: 'e',
    fault: rx.fault,
    stage: '기초',
    on: '2026-10-25',
    quality: 'yes',
    transferred: 'unknown',
    during: 'clear',
    nextDay: 'unknown',
    responseOn: null,
    source: 'self',
  },
];
const focus = { reportId: 'r', jobId: 'j', criteria: REPORT_CRITERIA, rx: [rx], startedOn: '2026-10-25', done: 15, progression };
const c = { ink: '#111', muted: '#777', warn: '#aa6600', sky: '#0088ff', chip: '#eee', line: '#ddd' };
const render = (component, props) => renderToStaticMarkup(React.createElement(component, { c, reload: async () => {}, ...props }));
for (const m of [native, web]) {
  const wait = render(m.FocusProgress, { focus: focusView(focus, '2026-10-26') });
  assert.match(wait, /누적 15회 연습/);
  assert.match(wait, /기초 연습 중/);
  assert.match(wait, /다음 날 반응 확인/);
  assert.doesNotMatch(wait, /연결 단계로 전환|9세션|3주/);
  assert.match(wait, /자가 평가/);
  progression.evidence[0].nextDay = 'clear';
  progression.evidence[0].responseOn = '2026-10-26';
  const ready = render(m.FocusProgress, { focus: focusView(focus, '2026-10-26') });
  assert.match(ready, /연결 단계로 전환/);
  const blocked = focusView(focus, '2026-10-26');
  blocked.skill.blockedReason = '장비 확인 필요';
  assert.match(render(m.FocusProgress, { focus: blocked }), /장비 확인 필요/);
  const legacy = { ...focus };
  delete legacy.progression;
  assert.match(render(m.FocusProgress, { focus: focusView(legacy, '2026-10-26') }), /누적 수행 기록은 보존/);
  assert.match(render(m.MechanicsEquipment, { equipment: ['밴드'] }), /오늘 메커니즘 장비/);
  progression.evidence[0].nextDay = 'unknown';
  progression.evidence[0].responseOn = null;
}
console.log('앱·웹 진행 화면 렌더 검사 통과: 확인 대기·전환 권유·통증/장비 제한·이전 기준 전환·장비 설정');
