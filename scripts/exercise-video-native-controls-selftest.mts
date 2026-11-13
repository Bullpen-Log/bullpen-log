/** VP01 R2: execute the production React Native control callbacks and route lease.
 * React hooks/native primitives are mocked. No layout engine, recognizer arbitration,
 * iOS decoder or device is exercised. Run with node --import ./scripts/alias-register.mjs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic transpilation harness inspects mocked native callbacks and React elements. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as state from '../lib/exercise-video-state.ts';
const require = createRequire(import.meta.url);
const ts = require('typescript');
let passed = 0;
const check = (v: unknown, message: string) => { assert.ok(v, message); passed++; };
const slots: unknown[] = [];
let at = 0;
const effects: (() => void)[] = [];
const cleanup: (() => void)[] = [];
const react = {
  useState(initial: unknown) {
    const id = at++; if (!(id in slots)) slots[id] = typeof initial === 'function' ? initial() : initial;
    return [slots[id], (v: unknown) => { slots[id] = typeof v === 'function' ? v(slots[id]) : v; }];
  },
  useRef(initial: unknown) { const id = at++; if (!(id in slots)) slots[id] = { current: initial }; return slots[id]; },
  useLayoutEffect(fn: () => void) { effects.push(fn); },
  useEffect(fn: () => (() => void)) { const id = at++; if (!(id in slots)) { slots[id] = true; effects.push(() => { const f = fn(); if (f) cleanup.push(f); }); } },
  useCallback: (f: unknown) => f,
};
let pan: Record<string, any>;
const gesture = { usePanGesture: (config: Record<string, any>) => { pan = config; return config; }, GestureDetector: 'GestureDetector', GestureHandlerRootView: 'GestureHandlerRootView' };
const native = { View: 'View', Text: 'Text', Modal: 'Modal', Pressable: 'Pressable', Platform: { OS: 'ios' }, StyleSheet: { create: (s: unknown) => s } };
const navCalls: Record<string, unknown>[] = [];
const focus: (() => (() => void) | undefined)[] = [];
const navigation = { setOptions: (v: Record<string, unknown>) => navCalls.push(v) };
const mocks: Record<string, unknown> = {
  react, 'react/jsx-runtime': { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) },
  'react-native': native, 'react-native-gesture-handler': gesture,
  'expo-symbols': { SymbolView: 'SymbolView' }, '~/shell/icon': { Icon: 'Icon' }, '~/shell/press': { Press: 'Press' },
  '@/lib/exercise-video-state': state, 'expo-router': { useNavigation: () => navigation, useFocusEffect: (f: () => (() => void)) => focus.push(f) },
};
function production(path: string) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', js)((id: string) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected production dependency: ${id}`);
  }, testModule, testModule.exports);
  return testModule.exports;
}
const { ExerciseVideoControls, EXERCISE_VIDEO_RATES } = production('native/src/workout/exercise-video-controls.tsx');
const events: unknown[][] = [];
const selectedRates: number[] = [];
const props = { stageTapControls: true, c: { link: '#00aaff' }, playing: true, ready: true, duration: 20, time: 3, loop: true, rate: 1, rates: EXERCISE_VIDEO_RATES,
  onToggle() {}, onRate(r: number) { selectedRates.push(r); }, onExpand() {}, onLoop() {}, onStep() {},
  onScrubStart: () => events.push(['start']), onScrubDraft: (t: number) => events.push(['draft', t]),
  onScrubEnd: (...args: unknown[]) => events.push(['end', ...args]),
};
function render() { at = 0; const out = ExerciseVideoControls(props); effects.splice(0).forEach((f) => f()); return out; }
function find(node: any, predicate: (n: any) => boolean): any {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const got = find(child,predicate); if (got) return got; }
  return null;
}
let tree = render(); tree.props.onLayout({ nativeEvent: { layout: { width: 331 } } }); tree = render();
const slider = find(tree, (n) => n.props?.accessibilityRole === 'adjustable');
slider.props.onLayout({ nativeEvent: { layout: { width: 160 } } }); tree = render();
check(pan!.minDistance === 0 && pan!.maxPointers === 1 && pan!.shouldCancelWhenOutside === false, 'native recognition starts from down, retains outside drag');
check(slider.props.style[0].height === 44 && tree.props.style.height === 44, '44pt invisible gesture target with one-row overlay');
check(slider.props.accessibilityValue.max === 20 && slider.props.accessibilityValue.text.includes('/ 0:20'), 'duration retained in accessibility');
const track = find(slider, (n) => n.type === 'View' && n.props?.style?.height === 6);
check(track?.props.style.borderRadius === 3, 'R3 prominent 6pt timeline');
check(tree.props.style.left === 0 && tree.props.style.right === 0 && tree.props.style.height === 44, 'R3 edge-to-edge row keeps the same vertical height');
check(!find(tree, (n) => n.type === 'View' && n.props?.style?.backgroundColor === 'rgba(0,0,0,0.28)'), 'R3 no translucent backing behind rail or icons');
const play = find(tree, (n) => n.type === 'Press' && n.props?.accessibilityLabel === '영상 일시정지');
const expand = find(tree, (n) => n.type === 'Press' && n.props?.accessibilityLabel === '크게 보기');
check(!play && expand.props.style[0].width === 32 && expand.props.style[0].height === 44 && slider.props.style[1].marginLeft === 24, 'R4 no left toggle, separate compact targets and screen-edge scrub inset');
check(slider.props.style[0].marginHorizontal === undefined, 'R3 bar takes the freed margins between controls');
check(!find(tree, (n) => n.type === 'Text' && /\d+:\d+/.test(String(n.props.children))), 'no visual elapsed/total line');
pan!.onBegin({ x: 40 }); pan!.onUpdate({ x: 80, numberOfPointers: 1 }); pan!.onFinalize({ x: 120, canceled: false });
check(JSON.stringify(events) === JSON.stringify([['start'],['draft',5],['draft',10],['end',true,15]]), 'real control callbacks seek on down/move and exact release');
pan!.onFinalize({ x: 160, canceled: false });
check(events.length === 4, 'late duplicate release ignored');
events.length = 0; pan!.onBegin({x:20}); pan!.onUpdate({ x:40, numberOfPointers:1 }); pan!.onFinalize({ x:100, canceled:true });
check(JSON.stringify(events.at(-1)) === JSON.stringify(['end',false,5]), 'native cancellation cannot commit canceled end coordinate');
events.length = 0; pan!.onBegin({x:20}); pan!.onUpdate({x:80,numberOfPointers:2}); pan!.onFinalize({x:120,canceled:false});
check(events.filter((e) => e[0] === 'end').length === 1 && events.at(-1)?.[1] === false, 'second touch cancels exactly once');
events.length = 0; pan!.onBegin({x:30}); slider.props.onLayout({nativeEvent:{layout:{width:200}}});
check(events.at(-1)?.[1] === false, 'rotation/track layout change cancels active drag');
events.length = 0; pan!.onBegin({x:40}); pan!.onTouchesUp({numberOfTouches:0,changedTouches:[{x:40}]}); pan!.onFinalize({x:40,canceled:true});
check(JSON.stringify(events.at(-1)) === JSON.stringify(['end',true,5]) && events.filter((e) => e[0] === 'end').length === 1, 'stationary seek tap commits despite pan recognizer nonactivation');
events.length = 0; pan!.onBegin({x:40}); pan!.onTouchesDown({numberOfTouches:2}); pan!.onTouchesUp({numberOfTouches:1,changedTouches:[{x:80}]});
check(events.at(-1)?.[1] === false && events.filter((e) => e[0] === 'end').length === 1, 'secondary down cancels before movement and later up cannot commit');
events.length = 0; pan!.onBegin({x:30}); cleanup.splice(0).forEach((f) => f()); pan!.onFinalize({x:120,canceled:false});
check(events.at(-1)?.[1] === false && events.at(-1)?.[3] === true && events.filter((e) => e[0] === 'end').length === 1, 'unmount aborts and prevents resume or late release');
const { useExerciseVideoNavigationGuard: guardPlayerScreen } = production('native/src/workout/exercise-video-visibility.tsx');
guardPlayerScreen(true); guardPlayerScreen(true);
const endA = focus.shift()!()!; const endB = focus.shift()!()!;
check(navCalls.length === 1 && navCalls[0].fullScreenGestureEnabled === false && !('gestureEnabled' in navCalls[0]), 'production hook proactively excludes only full-screen pop, keeps edge/header policy');
endA(); check(navCalls.length === 1, 'first player cleanup does not reenable another player route');
endB(); check(navCalls.length === 2 && navCalls[1].fullScreenGestureEnabled === undefined, 'last focus cleanup restores native default');
guardPlayerScreen(false); check(focus.shift()!() === undefined && navCalls.length === 2, 'no-media screen takes no navigation lease');
for (const rate of [1, 1.25, 0.25, 0.5]) { props.rate = rate; tree = render(); find(tree, (n) => n.type === 'Press' && n.props?.accessibilityLabel === `재생 속도 ${rate}배, 바꾸기`).props.onPress(); }
check(JSON.stringify(selectedRates) === '[1.25,0.25,0.5,1]', 'R4 actual rate callbacks cycle two slow steps and max1.25');
at = 0;
const externalTree = ExerciseVideoControls({ ...props, stageTapControls: false, overlay: false });
check(find(externalTree, (n) => n.type === 'Press' && n.props?.accessibilityLabel === '영상 일시정지')?.props.style[0].width === 44, 'official provider external row retains explicit play and44pt targets');
console.log(`native-control callbacks: ${passed} pass, 0 fail (mocked hooks/native primitives; no device validation)`);
