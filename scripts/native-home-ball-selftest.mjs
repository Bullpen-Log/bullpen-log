/** 홈 야구공의 실제 Expo 변환 결과를 별도 UI 런타임에서 실행한다.
 * 일반 JS만 실행하면 보이지 않는 worklet 기본 매개변수의 클로저 오류를 검사한다.
 * 실행: node scripts/native-home-ball-selftest.mjs
 * 기기의 터치 인식·SVG 렌더링 검사는 별도로 필요하다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'native/package.json'));
const babel = require('@babel/core');
const source = path.join(root, 'native/src/home/ball/ball.tsx');
let checks = 0;

for (const mode of ['development', 'production']) {
  const animations = [];
  const cancellations = [];
  const cubic = (t) => t * t * t;
  const reanimated = {
    __esModule: true,
    default: { createAnimatedComponent: (component) => component },
    Easing: { out: (ease) => (t) => 1 - ease(1 - t), cubic },
    cancelAnimation: (value) => cancellations.push(value),
    withTiming: (target, config) => {
      animations.push({ target, ...config });
      return target;
    },
  };
  const mocks = {
    react: {},
    'react/jsx-runtime': {},
    'react-native': {},
    'react-native-gesture-handler': {},
    'react-native-reanimated': reanimated,
    'react-native-svg': { Path: 'Path' },
    'expo-haptics': {},
    '~/home/camera-swipe': {},
    '~/shell/mark-path': { MARK_PATH: '' },
    './geometry': { logoRings: () => ({ points: [], rings: [] }) },
  };
  const { code } = babel.transformSync(fs.readFileSync(source, 'utf8'), {
    filename: source,
    envName: mode,
    caller: { name: 'metro', bundler: 'metro', platform: 'ios', isDev: mode === 'development', isServer: false },
    configFile: false,
    babelrc: false,
    presets: [[require.resolve('babel-preset-expo'), { platform: 'ios' }]],
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (id) => mocks[id] ?? require(id),
    global: { Error },
  });
  const original = exports.spinBall;
  assert.ok(original.__initData?.code, `${mode}: Expo가 실제 worklet을 생성해야 한다`);
  // UI 런타임에는 모듈의 전역 변수가 없다. 플러그인이 캡처한 클로저만 넘긴다.
  const spin = vm.runInNewContext(original.__initData.code).bind({ __closure: original.__closure });
  const ry = { current: -0.4, get() { return this.current; }, set(value) { this.current = value; } };
  const rotation = { ry };
  const cases = [
    { name: '접속 자동 회전', args: [Math.PI * 2, 1300], turn: Math.PI * 2, ms: 1300 },
    { name: '야구공 터치', args: [], turn: Math.PI * 1.55, ms: 1350 },
    { name: '시간만 기본값', args: [Math.PI], turn: Math.PI, ms: 1350 },
    { name: '회전량만 기본값', args: [undefined, 420], turn: Math.PI * 1.55, ms: 420 },
    { name: '0 값 지정', args: [0, 0], turn: 0, ms: 0 },
    ...Array.from({ length: 200 }, (_, i) => ({ name: `연속 터치 ${i + 1}`, args: [], turn: Math.PI * 1.55, ms: 1350 })),
  ];
  for (const { name, args, turn, ms } of cases) {
    const before = ry.get();
    assert.doesNotThrow(() => spin(rotation, ...args), `${mode}: ${name}`);
    const animation = animations.at(-1);
    assert.equal(ry.get(), before + turn, `${mode}: ${name}의 회전량`);
    assert.equal(animation.duration, ms, `${mode}: ${name}의 시간`);
    assert.equal(cancellations.at(-1), ry, `${mode}: 이전 회전 취소`);
    assert.ok(Number.isFinite(animation.target), `${mode}: 유효한 회전값`);
    assert.equal(animation.easing(1), 1, `${mode}: 감속 완료`);
    checks++;
  }
}
console.log(`홈 야구공 worklet 검사 ${checks}개 통과 (개발·배포 변환, 자동 회전·터치·연속 터치)`);
