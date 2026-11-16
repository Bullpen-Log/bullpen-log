// Run with node --test scripts/native-journeys-selftest.mjs. No native process or account required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = file => readFileSync(new URL('../native/src/' + file, import.meta.url), 'utf8');
const transpile = code => ts.transpileModule(code, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText;
const jsx = (type, props) => ({ type, props });
const hooks = {
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: current => ({ current }), useEffect() {},
};
const native = { StyleSheet: { create: x => x }, useWindowDimensions: () => ({ width: 390, height: 844 }) };
const ui = { useTheme: () => 'light', usePalette: () => ({}), TYPE: {}, withAlpha: () => '' };
function renderModule(file, mocks, globals = {}) {
  const exports = {};
  const imports = { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, '~/lib/ui': ui, ...mocks };
  vm.runInNewContext(transpile(source(file)), {
    exports, require: id => imports[id] ?? {}, ...globals,
  });
  return exports;
}
function find(node, predicate) {
  if (!node?.props) return;
  if (predicate(node)) return node;
  for (const child of [node.props.children].flat(Infinity)) {
    const hit = find(child, predicate);
    if (hit) return hit;
  }
}

// Run the real shell's route classification and the prop sent to its main TabBar.
function retapDestination(path, search, tabs) {
  const code = source('app/index.tsx');
  const ast = ts.createSourceFile('index.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  let popTo;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['sportRoot', 'atSportRoot'].includes(node.name.getText(ast))) {
      declarations.push('const ' + node.getText(ast));
    }
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'popTo') popTo = node.initializer.expression.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(popTo);
  return vm.runInNewContext(transpile([...declarations, popTo].join(';\n')), {
    path, search, tabs, URLSearchParams, RECORDS_PATH: '/records',
  });
}
test('records inside pitching retaps to pitching; standalone and root tabs keep their scroll action', () => {
  const tabs = [{ href: '/videos' }];
  assert.equal(retapDestination('/records', '', tabs), '/videos');
  assert.equal(retapDestination('/records', '', [...tabs, { href: '/records' }]), null);
  assert.equal(retapDestination('/videos', '', tabs), null);
  assert.equal(retapDestination('/videos', 'view=log', tabs), '/videos');
});

function openMenu() {
  const pushed = [], animations = [], timers = [];
  const { MenuButton } = renderModule('shell/menu-button.tsx', {
    react: { ...hooks, useState: x => [x === null ? { x: 330, y: 60, w: 44, h: 44 } : x, () => {}] },
    'expo-router': { router: { push: path => pushed.push(path) } },
    'react-native-reanimated': {
      default: { View: 'AnimatedView' }, Easing: { bezier() {}, in() {} }, useSharedValue: () => ({ set() {} }), useAnimatedStyle() {},
      useReducedMotion: () => false, runOnJS: f => f, withTiming: (_to, _opts, cb) => animations.push(cb),
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
    '~/lib/country-store': { useCountry() {} }, '@/lib/country': { hasNutrition: () => false },
    '~/shell/release': { canOpen: () => true, useRelease() {} }, '~/shell/menu-store': { useMenu: () => ({ groups: [] }) },
  }, { setTimeout: cb => timers.push(cb), clearTimeout() {} });
  const launcher = find(MenuButton({}), n => typeof n.type === 'function');
  const modal = launcher.type(launcher.props);
  return {
    tap: label => find(modal, n => n.props.accessibilityLabel === label).props.onPress(),
    dismiss() {
      animations.at(-1)(true);
      modal.props.onDismiss();
      timers.forEach(cb => cb());
    }, pushed,
  };
}
test('a second tap during the menu exit cannot replace the selected destination', () => {
  const menu = openMenu();
  menu.tap('설정'); menu.tap('알림'); menu.dismiss();
  assert.deepEqual(menu.pushed, ['/settings']);
});
test('closing the menu without selecting anything stays on the same screen', () => {
  const menu = openMenu();
  menu.tap('메뉴 닫기'); menu.tap('설정'); menu.dismiss();
  assert.deepEqual(menu.pushed, []);
});

function videoDetail() {
  // expo-video iOS VideoPlayer.playbackRate writes AVPlayer.rate, including while paused.
  const player = { playing: false, set playbackRate(rate) { this.playing = rate > 0; }, pause() { this.playing = false; } };
  const { playerCall } = renderModule('videos/player-parts.tsx', {});
  let select, statusChange, cursor = 0, initialized = false;
  const state = [];
  const react = { ...hooks, useState(initial) {
    const slot = cursor++;
    if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
    return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }];
  } };
  const { DetailPlayer } = renderModule('videos/detail-player.tsx', {
    'react-native': { ...native, ActionSheetIOS: { showActionSheetWithOptions: (_options, cb) => { select = cb; } } },
    react,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) },
    'expo-video': { useVideoPlayer: (_src, init) => {
      if (!initialized) { initialized = true; init(player); }
      return player;
    } },
    expo: { useEvent: () => ({ isPlaying: player.playing }), useEventListener: (_p, event, cb) => { if (event === 'statusChange') statusChange = cb; } },
    '~/pitch/store': { usePathThumbs: () => ({}) }, '~/pitch/video': { usePauseWhenHidden() {} },
    '~/pitch/video-draw': { DRAW_COLORS: ['red'] }, '~/shell/transition': { useScreenSettled: () => true },
    './compare-math': { sceneStep: () => 1 / 30 },
    './player-parts': { playerCall, RATES: [0.25, 0.5, 1], rateText: String, secText: String, useDisplayAspect() {}, useVideoSource: () => ({ uri: 'fixture' }) },
  });
  const render = () => {
    cursor = 0;
    return DetailPlayer({ path: 'fixture', drawing: false });
  };
  const tree = render();
  const button = find(tree, n => n.props.accessibilityLabel?.startsWith('재생 속도'));
  return { player, open: () => button.props.onPress(), choose: index => select(index), ready: () => statusChange({ status: 'readyToPlay' }), render };
}
test('opening My Videos detail waits for the play button', () => {
  assert.equal(videoDetail().player.playing, false);
});
test('changing speed preserves the play state at selection, including a pause while the sheet is open', () => {
  const detail = videoDetail();
  detail.player.playing = true; detail.open(); detail.player.pause(); detail.choose(2);
  assert.equal(detail.player.playing, false);
  detail.player.playing = true; detail.open(); detail.choose(0);
  assert.equal(detail.player.playing, true);
});

test('My Videos fullscreen close returns to the inline player with the same playback state', () => {
  const detail = videoDetail();
  detail.ready();
  detail.player.playing = true;
  const expand = find(detail.render(), n => n.props.accessibilityLabel === '크게 보기');
  expand.props.onPress();
  const full = find(detail.render(), n => n.type?.name === 'FullView');
  assert.equal(full.props.player, detail.player);
  const modal = full.type(full.props);
  find(modal, n => n.props.accessibilityLabel === '크게 보기 닫기').props.onPress();
  assert.equal(find(detail.render(), n => n.type?.name === 'FullView'), undefined);
  assert.equal(detail.player.playing, true);
});
