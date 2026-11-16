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
    if (s === '~/shell/release') return data('export const canOpen=()=>true; export const noticeLocked=()=>{}; export const pushOpen=()=>{};');
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
  drift: { aheadAtKneeUp: 0.08, conf: 50 },
  drop: { pelvisDrop: 0.36, rise: 0, conf: 50 },
  separation: { trunkOpenAtPlantDeg: -40, trunkConf: 50 },
  trunkTilt: { forwardDeg: 30, conf: 50 },
  arm: { abductionAtPlantDeg: 88, handRise: 0.2, handRiseCm: 11, conf: 50 },
  /* 가장 굽은 장면 13 — 착지(10)와 릴리스(20) 사이. 브레이크 '더 굽음'의 장면은 릴리스가 아니라 이 장면이다 */
  block: { pelvisDecelPct: 95, kneeExtensionDeg: 10, kneeCollapseDeg: 30, worstFrame: 13, conf: 50 },
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
globalThis.__reportMetrics.drift.aheadAtKneeUp = 0.12;
globalThis.__reportMetrics.block.kneeCollapseDeg = 3;
/* 모두 좋아요 — 권할 드릴 없음 */
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
/* 브레이크 '더 굽음'은 가장 굽은 장면을 가리킨다 — 릴리스를 그 장면처럼 쓰지 않는다 */
const brake = report.items.find((i) => i.element === '브레이크');
assert.equal(brake.frame, 13);
assert.equal(brake.moment, '앞무릎이 가장 굽은');
assert.equal(report.headline.frame, 13, '3D 첫 장면도 그 장면');
/* 웹: 여섯 줄을 한 장에서 — 참고 · 확인 어려움을 모양 · 글로 가른다(색만이 아니라), 주 문제가 없으면 펴 둔 줄도 없다 */
const webFlow = renderToStaticMarkup(React.createElement(web.FlowCard, { report: hardYouth, onPick() {} }));
for (const el of ['드리프트', '드롭', '상하체 분리', '브레이크', '몸통 회전', '스로잉']) assert.match(webFlow, new RegExp(`>${el}<`));
assert.match(webFlow, />참고</);
assert.match(webFlow, />확인 어려움</);
assert.match(webFlow, />앞발 닿을 때 손 올리기</, '둘째 줄은 요소가 보는 것(쉬운 말)');
assert.doesNotMatch(webFlow, /aria-expanded="true"/);
assert.match(webFlow, /border-2 border-muted bg-surface[^"]*"[^>]*><span class="size-1.5 rounded-full bg-muted"/, '참고 = 실선 고리 + 가운데 점');
assert.match(webFlow, /border-dashed border-line-strong bg-surface[^"]*"[^>]*><\/span>/, '확인 어려움 = 점선 빈 고리');
/* 2026-11-16 개편(앱 · 웹 같은 구성 · 같은 글) — 한눈 요약(Summary) + 동작 여섯 줄(앱 ElementList · 웹 FlowCard, 처음엔 다 접힘) */
const nativeParts = { ...native, FlowCard: (props) => native.ElementList({ ...props, onScene: props.onPick }) };
for (const components of [nativeParts, web]) {
  /* 접힌 여섯 줄 — 이름 · 쉬운 말 · 값 · 상태가 다 보인다. 확인 범위 · 측정 상태 같은 메타 글은 없다 */
  const flow = render(components.FlowCard, { report: { ...report, primary: '브레이크' }, onPick() {} });
  assert.match(flow, /동작 여섯 가지/);
  assert.match(flow, /앞다리로 버티기/);
  assert.match(flow, /30°/);
  assert.match(flow, /고칠 점/);
  assert.doesNotMatch(flow, /수치 확인|평가 가능|판정 기준|지표 검증 중/);
  /* 한눈 요약 — 숫자 셋 + 먼저 고칠 것(평가 말 한 줄 · 지금 → 좋아요 기준 · 장면) */
  const lead = render(components.Summary, { report, onScene() {} });
  assert.match(lead, /좋아요/);
  assert.match(lead, /브레이크/);
  assert.match(lead, /착지 뒤 앞무릎이 무너져요/);
  assert.match(lead, /30°/);
  assert.match(lead, /좋아요 기준/);
  assert.match(lead, /앞무릎이 가장 굽은 장면 보기/);
  assert.doesNotMatch(lead, /엔진 오차|아래 10%|이번 투구에서 확인한 범위|여기부터 고쳐요/);
  /* 고칠 점이 없으면 그 사실만 — 문제를 만들어 내지 않는다 */
  const scope = render(components.Summary, { report: heldReport, onScene() {} });
  assert.match(scope, /고칠 점이 없어요/);
  assert.doesNotMatch(scope, /장면 보기|결론은 아니에요/);
  /* 참고(성장기) — 상태 '참고', 값은 그대로 */
  const ref = render(components.FlowCard, { report: { ...refReport, primary: '몸통 회전' }, onPick() {} });
  assert.match(ref, /참고/);
  assert.match(ref, /36%/);
  assert.match(render(components.FlowCard, { report: { ...refReport, primary: '스로잉' }, onPick() {} }), /\+11cm/);
  const hard = render(components.FlowCard, { report: { ...hardReport, primary: '스로잉' }, onPick() {} });
  assert.match(hard, /확인 어려움/);
  assert.match(render(components.Summary, { report: hardReport, onScene() {} }), /확인 못 함/);
  /* 개선 드릴 — 한 번 보는 목록, 새 3주 처방 단추 없음 */
  const rx = render(components.RxCard, { report, mine: true, focus: null });
  assert.match(rx, /추천 훈련/);
  assert.match(rx, /레그 리프트 드리프트/);
  assert.doesNotMatch(rx, /다음에 볼 숫자|짧게 연습|다시 찍으면 숫자를 견줘/, '드릴 밑 줄 · 단추 밑 설명 없음');
  assert.match(rx, /추천 훈련 보기/);
  assert.doesNotMatch(rx, /처방 시작|1단계|집중 · 2칸|보조 · 1칸/);
  assert.match(render(components.RxCard, { report, mine: true, focus: { done: 3, total: 9 } }), /처방 진행 중 3 \/ 9/, '진행 중인 옛 처방은 그대로');
  const hold = render(components.RxCard, { report: heldReport, mine: true, focus: null });
  assert.match(hold, /고칠 점이 없어 따로 권할 드릴이 없어요/);
  assert.doesNotMatch(hold, /처방 시작|자동 처방/);
  /* 처방이 없으면 까닭에 맞는 길 — 참고 지표는 요소 설명(처방이 아님), 확인 못 한 구간은 촬영 안내 */
  const refHold = render(components.RxCard, { report: refReport, mine: true, focus: null });
  assert.match(refHold, /요소 설명 보기/);
  assert.match(refHold, /이번 투구에 맞춘 처방은 아니에요/);
  assert.doesNotMatch(hold, /촬영 안내 보기|요소 설명 보기/);
  assert.match(render(components.RxCard, { report: hardYouth, mine: true, focus: null }), /촬영 안내 보기/);
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
  assert.match(render(components.RxCard, { report: old, mine: true, focus: null }), /기준을 업데이트/);
  /* 지난번 리포트와 견주기 — 숫자는 촬영 조건 확인 뒤에만, 못 견주면 까닭 한 줄 */
  const prev = { reportId: 'p1', requestedAt: '2026-10-20T03:00:00.000Z', compared: true, reason: null, note: '한 구씩 비교한 수치 변화예요.', rows: [{ key: 'drift', element: '드리프트', label: '니업 때 골반이 축발보다 앞', before: 8.2, after: 10.1, delta: 1.9, unit: '% 키' }] };
  const cmp = render(components.CompareCard, { prev });
  assert.match(cmp, /지난번과 견주기/);
  assert.match(cmp, /10월 20일/);
  assert.match(cmp, /지난번과 같은 자리 · 배율 · 세기로 찍었어요/);
  assert.doesNotMatch(cmp, /키의 8\.2%/, '확인 전에는 숫자를 안 보인다');
  const held = render(components.CompareCard, { prev: { ...prev, compared: false, reason: '분석 엔진 버전이 다르거나 확인되지 않아요.', rows: [] } });
  assert.match(held, /분석 엔진 버전이 다르거나/);
  assert.doesNotMatch(held, /같은 자리 · 배율/);
}
console.log('앱·웹 리포트 렌더 검사 통과: 한눈 요약 · 동작 여섯 줄 · 참고·확인 어려움 구분 · 추천 훈련(새 3주 처방 없음 · 진행 중 처방 유지) · 이전 서버 응답 호환');
