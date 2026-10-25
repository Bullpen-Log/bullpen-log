/** Native responder callbacks, with rendering/animation drivers replaced by deterministic doubles.
 * Run: node scripts/native-tab-bar-selftest.mjs
 * UIKit refraction and spring appearance still require an iPhone check.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'native/package.json'));
const ts = require('typescript');
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

function harness({ count = 5, reduce = false, glass = true, width = 390, deferSpring = false } = {}) {
  let cursor = 0, effects = [], tree, clock = 1000, nextTimer = 1, retaps = 0;
  const slots = [], timers = new Map(), calls = [];
  let tabs = Array.from({ length: count }, (_, i) => ({ href: `/tab-${i}`, label: `Tab ${i}`, icon: 'home' }));
  let props = { tabs, active: tabs[0]?.href ?? null, onPress: t => calls.push(t.href) };
  const ref = initial => slots[cursor++] ??= { current: initial };
  const React = {
    useRef: ref,
    useState: initial => { const s = ref(typeof initial === 'function' ? initial() : initial); return [s.current, value => { s.current = typeof value === 'function' ? value(s.current) : value; }]; },
    useEffect: (effect, deps) => {
      const s = ref({ deps: undefined, cleanup: undefined });
      if (!deps || !s.current.deps || deps.some((v, i) => !Object.is(v, s.current.deps[i]))) {
        effects.push(() => { s.current.cleanup?.(); s.current.cleanup = effect(); s.current.deps = deps; });
      }
    },
  };
  const shared = initial => {
    const s = ref(initial);
    return s.shared ??= { get: () => s.current, set: v => { if (!v?.deferredSpring) s.current = v; }, get value() { return s.current; }, set value(v) { s.current = v; } };
  };
  const interpolate = (v, input, output) => {
    for (let i = 1; i < input.length; i++) if (v <= input[i]) return output[i - 1] + Math.max(0, (v - input[i - 1]) / (input[i] - input[i - 1])) * (output[i] - output[i - 1]);
    return output.at(-1);
  };
  const Animated = { View: 'AnimatedView' };
  const native = { Pressable: 'Pressable', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width }), StyleSheet: { create: x => x, absoluteFill: {} } };
  const mocks = {
    react: React,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': native,
    'react-native-reanimated': { __esModule: true, default: Animated, Easing: { bezier: () => 0 }, Extrapolation: { CLAMP: 'clamp' }, interpolate, useAnimatedStyle: fn => ({ sample: fn }), useReducedMotion: () => reduce, useSharedValue: shared, withSpring: (v, c, cb) => { cb?.(true); return deferSpring ? { deferredSpring: true, target: v } : v; }, withTiming: (v, c, cb) => { cb?.(true); return v; }, runOnJS: fn => fn },
    'expo-haptics': { selectionAsync: () => {} },
    'expo-glass-effect': { GlassView: 'GlassView', isLiquidGlassAvailable: () => glass },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0 }) },
    '~/lib/ui': { usePalette: () => ({ sky: '#0070c9', muted: '#666666', ink: '#111111' }), useTheme: () => 'light', withAlpha: () => 'rgba(0,0,0,.1)' },
    '~/shell/icon': { Icon: 'Icon' },
    './tab-pager': { emitRetap: () => retaps++ },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    const get = id => mocks[id] ?? load(path.resolve(path.dirname(file), id + '.ts'));
    vm.runInNewContext('(function(require,exports){' + code + '\n})', { setTimeout: fn => { const id = nextTimer++; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id), Date: { now: () => clock } })(get, exports);
    return exports;
  }
  const { TabBar } = load(path.join(root, 'native/src/shell/tab-bar.tsx'));
  function render(next = {}) { props = { ...props, ...next }; cursor = 0; effects = []; tree = TabBar(props); for (const effect of effects) effect(); return tree; }
  const visit = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    const children = [node.props?.children].flat(Infinity);
    for (const child of children) { const got = visit(child, predicate); if (got) return got; }
  };
  render();
  const preview = () => visit(tree, n => n.type?.name === 'TabFace')?.props.preview.get();
  const press = (i, advance = 500) => { clock += advance; visit(tree, n => n.type === 'Pressable' && n.props.accessibilityLabel === `Tab ${i}`).props.onPress(); };
  const surface = () => visit(tree, n => n.props?.onResponderGrant);
  const fire = (name, e = {}) => {
    const { x = 34.2, y = 26, fingers = name === 'onResponderRelease' ? 0 : 1, ...rest } = e;
    clock += 16;
    return surface().props[name]?.({ nativeEvent: {
      locationX: x, locationY: y, pageX: 100 + x, pageY: 700 + y,
      timestamp: clock, touches: Array.from({ length: fingers }, (_, identifier) => ({ identifier })), ...rest,
    } });
  };
  return { render, fire, press, calls, preview, timers, surface, get retaps() { return retaps; }, expire: () => { for (const fn of [...timers.values()]) fn(); timers.clear(); }, cloneTabs: () => tabs.map(t => ({ ...t })) };

}

for (const glass of [true, false]) for (const reduce of [true, false]) {
  const h = harness({ glass, reduce });
  check(h.surface().props.onStartShouldSetResponder(), true, 'input surface claims stationary touches');
  h.fire('onResponderGrant', { x: 171 });
  h.fire('onResponderRelease', { x: 171 });
  check(h.calls, ['/tab-2'], 'a stationary tap navigates without requiring a pan to activate');
  h.render({ active: '/tab-2' });
  h.fire('onResponderGrant', { x: 34.2 });
  h.fire('onResponderMove', { x: 307.8, locationX: 2 });
  check(h.calls.length, 1, 'scrubbing never navigates through intermediate tabs');
  check(h.preview(), 4, 'candidate uses page coordinates even when event target coordinates change');
  h.fire('onResponderRelease', { x: 307.8 });
  h.fire('onResponderRelease', { x: 307.8 });
  check(h.calls, ['/tab-2', '/tab-4'], 'release navigates exactly once');
  h.render({ tabs: h.cloneTabs() });
  check(h.preview(), 4, 'fresh arrays/old active route do not bounce selection back');
  h.render({ active: '/tab-4' });
  check(h.timers.size, 0, 'route acknowledgement clears rollback timer');
  h.fire('onResponderGrant', { x: 307.8 });
  h.fire('onResponderMove', { x: 100 });
  h.fire('onResponderTerminate');
  h.fire('onResponderRelease', { x: 100 });
  check(h.preview(), 4, 'cancel restores committed selection');
  check(h.calls.length, 2, 'system cancellation never navigates');
  h.fire('onResponderGrant', { x: 307.8 });
  h.fire('onResponderRelease', { x: 100, y: -100 });
  check(h.calls.length, 2, 'release far outside cancels');
  h.fire('onResponderGrant');
  h.fire('onResponderStart', { fingers: 2 });
  h.fire('onResponderRelease', { x: 100 });
  check(h.calls.length, 2, 'second finger cancels the entire contact');
}
{
  const h = harness({ deferSpring: true });
  for (const i of [3, 1, 4, 2, 0, 4]) {
    const x = (i + 0.5) * 68.4;
    h.fire('onResponderGrant', { x }); h.fire('onResponderRelease', { x });
    h.render({ active: `/tab-${i}` });
  }
  check(h.calls, ['/tab-3', '/tab-1', '/tab-4', '/tab-2', '/tab-0', '/tab-4'], 'rapid sequential taps are never blocked, even before springs finish');
  h.fire('onResponderGrant', { x: 307.8 }); h.render({ tabs: h.cloneTabs().slice(0, 3), active: '/tab-0' });
  h.fire('onResponderRelease', { x: 100 });
  check(h.calls.length, 6, 'menu changes invalidate the contact');
}
{
  const h = harness();
  h.fire('onResponderGrant', { x: 239.4 }); h.render();
  h.fire('onResponderRelease', { x: 239.4 });
  check(h.calls, ['/tab-3'], 'a render while pressed preserves contact ownership');
  h.expire(); check(h.preview(), 0, 'unacknowledged navigation rolls back');
  h.press(0, 0); check(h.retaps, 1, 'accessibility activation still emits retap');
  h.press(2, 0); check(h.calls.at(-1), '/tab-2', 'accessibility tab activation navigates directly');
}
// Full-width hit regions for sport/main bars and compact/large phones.
for (const count of [3, 5, 6]) for (const width of [320, 390, 480]) {
  const h = harness({ count, width });
  const cell = (Math.min(width - 40, 448) - 8) / count;
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * cell;
    h.fire('onResponderGrant', { x }); h.fire('onResponderRelease', { x });
    if (i > 0) check(h.calls.at(-1), `/tab-${i}`, 'all tab centers remain tappable across phone/bar sizes');
    h.render({ active: `/tab-${i}` });
  }
}
// Geometry invariants cover narrow/sport bars as well as five tabs.
const geometryExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'native/src/shell/tab-bar-motion.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: geometryExports });
const { tabIndexAt, tabDragPosition, tabReleaseIndex } = geometryExports;
for (const count of [1, 3, 5, 6]) for (const cell of [36, 52, 70, 90]) {
  for (let i = 0; i < count; i++) for (const grab of [-cell * 0.4, 0, cell * 0.4]) {
    const x = (i + 0.5) * cell + grab;
    check(tabIndexAt(x, cell, count), i, 'hit regions cover the full tab');
    assert.ok(Math.abs(tabDragPosition(x, grab, cell, count) - i) < 1e-10); checks++;
    check(tabReleaseIndex(x, 26, i, cell, count), i, 'release preserves a grabbed tab center');
  }
  for (const x of [-10000, -10, 0, cell * count, 10000]) {
    const position = tabDragPosition(x, 0, cell, count);
    assert.ok(Number.isFinite(position) && position > -0.2 && position < count - 1 + 0.2); checks++;
  }
}
check(tabIndexAt(NaN, 70, 5), -1, 'invalid coordinates never select a tab');
check(tabIndexAt(10, 0, 5), -1, 'unmeasured bars do not select');
check(tabReleaseIndex(10, 10, NaN, 70, 5), -1, 'invalid releases cancel');
console.log(`Tab bar responder scenarios passed: ${checks}`);
