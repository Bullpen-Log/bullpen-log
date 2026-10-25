/** Native gesture callbacks, with rendering/animation drivers replaced by deterministic doubles.
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
  let cursor = 0, effects = [], tree, gesture, clock = 1000, nextTimer = 1, retaps = 0;
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
  const factory = () => {
    const g = { handlers: {}, config: {} };
    for (const name of ['enabled', 'maxPointers', 'minDistance', 'shouldCancelWhenOutside', 'cancelsTouchesInView']) g[name] = v => { g.config[name] = v; return g; };
    for (const name of ['onBegin', 'onStart', 'onUpdate', 'onEnd', 'onFinalize']) g[name] = fn => { g.handlers[name] = fn; return g; };
    gesture = g; return g;
  };
  const mocks = {
    react: React,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': native,
    'react-native-gesture-handler': { Gesture: { Pan: factory }, GestureDetector: 'GestureDetector' },
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
  const fire = (name, e = {}, success = true) => gesture.handlers[name]?.({ x: 34.2, y: 26, translationX: 0, translationY: 0, velocityX: 0, ...e }, success);
  return { render, fire, press, calls, preview, timers, get retaps() { return retaps; }, get config() { return gesture.config; }, expire: () => { for (const fn of [...timers.values()]) fn(); timers.clear(); }, cloneTabs: () => tabs.map(t => ({ ...t })) };
}

for (const glass of [true, false]) for (const reduce of [true, false]) {
  const h = harness({ glass, reduce });
  check(h.config.minDistance, 0, 'press is tracked without waiting for a long press');
  h.fire('onBegin'); h.fire('onStart');
  h.fire('onUpdate', { x: 307.8, translationX: 0, velocityX: 900 });
  check(h.calls.length, 0, 'scrubbing never navigates through intermediate tabs');
  check(h.preview(), 4, 'candidate color follows the finger, even when native translation resets at activation');
  h.fire('onEnd', { x: 307.8 }); h.fire('onFinalize');
  check(h.calls, ['/tab-4'], 'release navigates once');
  h.render({ tabs: h.cloneTabs() });
  check(h.preview(), 4, 'fresh arrays/old active route do not bounce selection back');
  h.render({ active: '/tab-4' });
  check(h.timers.size, 0, 'route acknowledgement clears rollback timer');
  h.fire('onBegin', { x: 307.8 }); h.fire('onStart');
  h.fire('onUpdate', { x: 100, translationX: -207.8 });
  h.fire('onFinalize', {}, false);
  check(h.preview(), 4, 'cancel restores committed selection');
  check(h.calls.length, 1, 'cancel never navigates');
  h.fire('onBegin', { x: 307.8 }); h.fire('onStart');
  h.fire('onUpdate', { x: 100, y: -100, translationX: -207.8 });
  h.fire('onEnd', { x: 100, y: -100 }); h.fire('onFinalize');
  check(h.calls.length, 1, 'release far outside cancels');
}
{
  const h = harness();
  h.fire('onBegin', { x: 171 }); h.fire('onStart');
  h.fire('onEnd', { x: 171 }); h.fire('onEnd', { x: 171 }); h.fire('onFinalize');
  check(h.calls, ['/tab-2'], 'duplicate end/finalize cannot dispatch twice');
  h.press(2, 0); check(h.calls.length, 1, 'native touch does not also dispatch Pressable onPress');
  h.expire(); check(h.preview(), 0, 'unacknowledged navigation rolls back');
  h.fire('onBegin'); h.fire('onFinalize', {}, false); h.press(1, 0);
  check(h.calls.at(-1), '/tab-1', 'short taps that never activate Pan retain Pressable fallback');
}
{
  const h = harness(); h.press(0);
  check(h.retaps, 1, 'accessibility retap scrolls the current tab to top');
  check(h.calls.length, 0, 'retap does not reload the current route');
  h.press(3); check(h.calls, ['/tab-3'], 'accessibility activation still works');
  h.render({ active: '/tab-3' });
  h.fire('onBegin', { x: 239.4 }); h.fire('onStart');
  h.fire('onUpdate', { x: 307.8 });
  h.render({ tabs: h.cloneTabs().slice(0, 3), active: '/tab-0' });
  h.fire('onEnd', { x: 100 }); h.fire('onFinalize');
  check(h.calls.length, 1, 'menu changes during a drag invalidate the old gesture');
}
{
  const h = harness({ deferSpring: true });
  h.fire('onBegin', { x: 239.4 }); h.fire('onStart');
  h.fire('onEnd', { x: 239.4 }); h.fire('onFinalize');
  check(h.calls, ['/tab-3'], 'a quick tap selects the touched tab before the spring reaches it');
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
console.log(`Tab bar gesture scenarios passed: ${checks}`);
