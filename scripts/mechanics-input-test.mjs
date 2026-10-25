/** 앱·웹의 실제 입력 컴포넌트가 운동 단위를 구분하는지 렌더링한다. 네이티브 기본 뷰만 대체한다. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.__mechanicsReact = React;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react-native') return { url: 'data:text/javascript,' + encodeURIComponent(`
      const h = globalThis.__mechanicsReact.createElement;
      export const Text = ({children}) => h('span', null, children);
      export const View = ({children}) => h('div', null, children);
      export const TextInput = ({accessibilityLabel, placeholder, value}) => h('input', {'aria-label':accessibilityLabel,placeholder,value,readOnly:true});
    `), shortCircuit: true };
    if (specifier === '~/shell/press') return { url: 'data:text/javascript,' + encodeURIComponent(`
      export const Press = ({children,accessibilityRole}) => globalThis.__mechanicsReact.createElement('button', {role:accessibilityRole}, children);
    `), shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText };
    return next(url, context);
  },
});

for (const path of ['../native/src/mechanics/practice-input.tsx', '../app/(session)/mechanics/play/practice-input.tsx']) {
  const { PracticeInput, emptyPractice } = await import(path);
  const render = (category) => renderToStaticMarkup(React.createElement(PracticeInput, { category, value: emptyPractice(), onChange() {}, c: {} }));
  const throwing = render('스로잉 드릴');
  assert.match(throwing, /실제 투구/);
  assert.match(throwing, /checkbox/);
  for (const category of ['메디신볼 드릴', '무브먼트 패턴 드릴', '근력 · 안정 드릴']) {
    const html = render(category);
    assert.match(html, /반복 수행/);
    assert.match(html, /투구 수에는 더하지 않아요/);
    assert.doesNotMatch(html, /checkbox|이미 포함했어요/);
  }
}
console.log('앱·웹 수행 입력 렌더 검사 통과: 투구·반복 단위와 중복 투구 체크박스');
