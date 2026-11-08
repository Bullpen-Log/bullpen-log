/**
 * 회귀 시험 — 화면 쪽(F02 복원 · F03 버퍼링 재개 · F05 반복 구간 재생 · F07 영상 고르기 · F08 일부).
 * 실제 소스(transport-hook.ts · workbench.tsx · source-pick.ts)를 TypeScript 로 바꿔 가짜 훅 순서(useState · useEffect …)와 가짜 재생기로 돌린다.
 * React Native 렌더러 · 실제 React 커밋 · expo-video 디코더 · 터치는 아니다(기기 확인 목록은 대장 문서에).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as doc from '~/compare/doc';
import * as timing from '~/compare/timing';
import * as machine from '~/compare/transport';
import * as annotations from '~/compare/annotations';
import * as geometry from '~/compare/geometry';
import * as events from '~/compare/pitch-events';
import * as storage from '~/compare/storage';
import * as nav from '~/videos/compare-math';
import * as wsLayout from '~/compare/workspace-layout';
import * as wsContext from '~/compare/workspace-context';
import * as shapeEdit from '~/compare/shape-edit';
import * as fit from '~/compare/fit';
import * as exportPlan from '~/compare/export-plan';
import * as noteDrafts from '~/compare/note-drafts';
import * as imGeometry from '~/compare/immersive/geometry';
const IDENTITY_V = { zoom: 1, panX: 0, panY: 0, mirror: false, crop: null };
import * as imPresentation from '~/compare/immersive/presentation';
import * as imVisibility from '~/compare/immersive/visibility';
import * as imPalette from '~/compare/immersive/palette';
/* 고르기 규칙은 없을 수도 있다(고치기 전 판에서 돌릴 때) — 없으면 그 시험만 실패로 */
const sourcePick: Record<string, unknown> = await import('~/compare/source-pick').catch(() => ({}));

type Check = (name: string, fn: () => unknown | Promise<unknown>) => Promise<void>;
const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof import('typescript');
const ROOT = new URL('../', import.meta.url).pathname;
const assert = (v: unknown, m: string) => {
  if (!v) throw new Error(m);
};
const near = (a: number, b: number, m: string, eps = 0.02) => assert(Math.abs(a - b) <= eps, `${m}: ${a} ≠ ${b}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---- 가짜 훅 순서(한 컴포넌트) ---- */
function hookRuntime() {
  type Cell = { v?: unknown; current?: unknown; deps?: unknown[]; clean?: (() => void) | void; fn?: (...a: unknown[]) => unknown; stable?: (...a: unknown[]) => unknown };
  const cells: Cell[] = [];
  let i = 0;
  let dirty = false;
  let pending: (() => void)[] = [];
  let rendering = false;
  const api = {
    useState(init: unknown) {
      const n = i++;
      if (!cells[n]) cells[n] = { v: typeof init === 'function' ? (init as () => unknown)() : init };
      const cell = cells[n];
      return [
        cell.v,
        (v: unknown) => {
          const next = typeof v === 'function' ? (v as (x: unknown) => unknown)(cell.v) : v;
          if (!Object.is(next, cell.v)) {
            cell.v = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(v: unknown) {
      const n = i++;
      return cells[n] ?? (cells[n] = { current: v });
    },
    useEffect(fn: () => (() => void) | void, deps?: unknown[]) {
      const n = i++;
      const c = cells[n];
      const changed = !c || !deps || deps.some((v, j) => !Object.is(v, c.deps?.[j]));
      if (changed) {
        cells[n] = { deps, clean: c?.clean };
        pending.push(() => {
          const cell = cells[n];
          if (typeof cell.clean === 'function') cell.clean();
          cell.clean = fn();
        });
      }
    },
    useEffectEvent(fn: (...a: unknown[]) => unknown) {
      const n = i++;
      if (!cells[n]) {
        const c: Cell = { fn };
        c.stable = (...a: unknown[]) => c.fn!(...a);
        cells[n] = c;
      }
      cells[n].fn = fn;
      return cells[n].stable;
    },
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useSyncExternalStore: (_s: unknown, get: () => unknown) => get(),
  };
  return {
    api,
    render<T>(fn: () => T): T {
      let out!: T;
      for (let guard = 0; guard < 25; guard++) {
        i = 0;
        dirty = false;
        rendering = true;
        out = fn();
        rendering = false;
        const e = pending;
        pending = [];
        e.forEach((f) => f());
        if (!dirty) break;
      }
      return out;
    },
    isDirty: () => dirty || rendering,
    unmount() {
      for (const c of cells) if (c && typeof c.clean === 'function') c.clean();
    },
  };
}

/* COMPARE_UI_ROOT 를 주면 화면 파일(native/src/compare/ui/*)을 그 폴더에서 읽는다 — 고치기 전 판(git show HEAD:…)으로 같은 시험을 돌려 실패를 본다 */
const UI_ROOT = process.env.COMPARE_UI_ROOT ? process.env.COMPARE_UI_ROOT.replace(/\/?$/, '/') : ROOT;
const srcOf = (file: string) => (file.startsWith('native/src/compare/ui/') ? UI_ROOT : ROOT) + file;
export const hasUi = (file: string) => fs.existsSync(srcOf(file));
function compile(file: string, mocks: Record<string, unknown>) {
  const src = fs.readFileSync(srcOf(file), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const m = { exports: {} as Record<string, unknown> };
  new Function('require', 'module', 'exports', js)(
    (n: string) => {
      if (n in mocks) return mocks[n];
      throw new Error(`가짜 모듈 없음: ${n}`);
    },
    m,
    m.exports
  );
  return m.exports;
}

/* ---- 가짜 재생기 ---- */
type Player = {
  status: string;
  currentTime: number;
  playing: boolean;
  playbackRate: number;
  addListener(e: string, f: (x: unknown) => void): { remove(): void };
  emit(e: string, x: unknown): void;
  play(): void;
  pause(): void;
};
function makePlayer(): Player {
  const listeners: Record<string, ((x: unknown) => void)[]> = {};
  const p: Player = {
    status: 'readyToPlay',
    currentTime: 0,
    playing: false,
    playbackRate: 1,
    addListener(e, f) {
      (listeners[e] ??= []).push(f);
      return { remove: () => void (listeners[e] = (listeners[e] ?? []).filter((x) => x !== f)) };
    },
    emit(e, x) {
      for (const f of [...(listeners[e] ?? [])]) f(x);
    },
    play() {
      if (!p.playing) {
        p.playing = true;
        p.emit('playingChange', { isPlaying: true });
      }
    },
    pause() {
      if (p.playing) {
        p.playing = false;
        p.emit('playingChange', { isPlaying: false });
      }
    },
  };
  return p;
}
const playerCall = {
  play: (p: Player | null) => p?.play(),
  pause: (p: Player | null) => p?.pause(),
  rate: (p: Player | null, r: number) => void (p && (p.playbackRate = r)),
  time: (p: Player | null) => p?.currentTime ?? 0,
  seek: (p: Player | null, t: number) => void (p && (p.currentTime = Math.max(0, t))),
};

const jsx = (type: unknown, props: Record<string, unknown>, key?: unknown) => ({ type, props, key });
const appState = { listeners: [] as ((s: string) => void)[] };
/* 화면 크기 · 글자 배율 · 안전 영역 · 화면 포커스 · 자판 — 시험마다 바꾼다 */
const dims = { width: 390, height: 844, fontScale: 1, scale: 3 };
const insets = { top: 47, bottom: 34, left: 0, right: 0 };
const focusState = { v: true };
const kbd = { l: {} as Record<string, ((e: unknown) => void)[]> };
const emitKeyboard = (name: string, e: unknown) => (kbd.l[name] ?? []).forEach((f) => f(e));
const setScreen = (o: { w: number; h: number; fs?: number; top?: number; bottom?: number; left?: number; right?: number }) => {
  Object.assign(dims, { width: o.w, height: o.h, fontScale: o.fs ?? 1 });
  Object.assign(insets, { top: o.top ?? 47, bottom: o.bottom ?? 34, left: o.left ?? 0, right: o.right ?? 0 });
  focusState.v = true;
  kbd.l = {};
};
/* 동작 시트에서 고를 글(다음 한 번) */
const sheetPick: { label: string | null } = { label: null };
/* 알림 창에서 누를 단추(다음 한 번) */
const alertPick: { label: string | null } = { label: null };
/** 마지막으로 붙은 하드웨어 뒤로(안드로이드) 처리 — 시험이 '뒤로'를 흉내 낸다 */
const hwBack: { f: (() => boolean) | null } = { f: null };
const rn = {
  StyleSheet: { create: <T,>(s: T) => s, absoluteFill: {}, hairlineWidth: 1 },
  AppState: {
    addEventListener: (_: string, f: (s: string) => void) => {
      appState.listeners.push(f);
      return { remove: () => void (appState.listeners = appState.listeners.filter((x) => x !== f)) };
    },
  },
  BackHandler: {
    addEventListener: (_: string, f: () => boolean) => {
      hwBack.f = f;
      return { remove: () => void (hwBack.f === f && (hwBack.f = null)) };
    },
  },
  AccessibilityInfo: { announceForAccessibility() {} },
  useWindowDimensions: () => dims,
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  Alert: {
    alert(...args: unknown[]) {
      const buttons = args[2] as { text: string; onPress?: () => void }[] | undefined;
      const b = buttons?.find((x) => x.text === alertPick.label);
      alertPick.label = null;
      b?.onPress?.();
    },
  },
  ActionSheetIOS: {
    showActionSheetWithOptions(o: { options: string[] }, cb: (i: number) => void) {
      const i = o.options.indexOf(sheetPick.label ?? '');
      sheetPick.label = null;
      if (i >= 0) cb(i);
    },
  },
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Keyboard: {
    addListener: (name: string, f: (e: unknown) => void) => {
      (kbd.l[name] ??= []).push(f);
      return { remove: () => void (kbd.l[name] = (kbd.l[name] ?? []).filter((x) => x !== f)) };
    },
    dismiss() {},
  },
  TextInput: 'TextInput',
  Platform: { OS: 'ios' },
};
/* 화면용 가짜 — 모르는 이름은 부품 이름(글자) 또는 아무것도 안 하는 함수 */
const loose = (named: Record<string, unknown> = {}) =>
  new Proxy(named, {
    get: (t, k) => (k in t ? t[k as string] : k === '__esModule' ? true : typeof k === 'string' && /^[A-Z]/.test(k) ? k : () => undefined),
  });

function rafToTimers() {
  (globalThis as unknown as { requestAnimationFrame: (f: () => void) => unknown }).requestAnimationFrame = (f) => setTimeout(f, 1);
  (globalThis as unknown as { cancelAnimationFrame: (h: unknown) => void }).cancelAnimationFrame = (h) => clearTimeout(h as ReturnType<typeof setTimeout>);
}

const base = (react: unknown) => ({
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': rn,
  'expo-router': { Stack: { Screen: 'Screen' }, useIsFocused: () => focusState.v, router: loose() },
  'expo-video': { VideoView: 'VideoView' },
  'expo-screen-orientation': loose(),
  'expo-status-bar': { StatusBar: 'StatusBar' },
  'expo-haptics': loose(),
  'react-native-safe-area-context': { useSafeAreaInsets: () => insets },
  '~/compare/doc': doc,
  '~/compare/timing': timing,
  '~/compare/transport': machine,
  '~/compare/annotations': annotations,
  '~/compare/geometry': geometry,
  '~/compare/pitch-events': events,
  '~/compare/storage': storage,
  '~/videos/compare-math': nav,
  '~/videos/player-parts': { playerCall, Scrubber: 'Scrubber', ScrubLabels: 'ScrubLabels' },
  '~/compare/fit': fit,
  '~/compare/export-plan': exportPlan,
  '~/compare/note-drafts': noteDrafts,
  '~/compare/immersive/geometry': imGeometry,
  '~/compare/immersive/presentation': imPresentation,
  '~/compare/immersive/visibility': imVisibility,
  '~/compare/immersive/palette': imPalette,
  '~/lib/ui': { TYPE: {}, usePalette: () => new Proxy({}, { get: () => '#123456' }), withAlpha: () => '' },
  '~/compare/ui/compare-palette': { useComparePalette: () => new Proxy({}, { get: () => '#123456' }) },
  '~/shell/icon': { Icon: 'Icon' },
  '~/shell/press': { Press: 'Press' },
});
/** 작은 부품 모듈(실제 소스) — 도우미(rowOf · flowRow …)는 진짜, 부품(단추 · 창)은 이름 글자로 남긴다(트리에서 찾게) */
function partsModule(react: unknown) {
  const real = compile('native/src/compare/ui/workspace-parts.tsx', { ...base(react), 'expo-image': loose(), '~/compare/workspace-layout': wsLayout });
  const names = ['IconBtn', 'TextBtn', 'Seg', 'Pager', 'Inspector', 'ShotPair', 'Wrap', 'HeadText', 'SubText'];
  return { ...real, ...Object.fromEntries(names.filter((n) => n in real).map((n) => [n, n])) };
}
function panelsModule(react: unknown) {
  const real = compile('native/src/compare/ui/panels.tsx', { ...base(react), '~/compare/ui/annotation-layer': {} });
  return { ...real, Sheet: 'Sheet', TextSheet: 'TextSheet' };
}

/* ---- 재생 줄기 하네스 ---- */
function transportHarness(clock: { ma: number; mb: number | null; range: { min: number; max: number }; loop: { min: number; max: number } | null; normalized: null }) {
  rafToTimers();
  const h = hookRuntime();
  const { useCompareTransport } = compile('native/src/compare/ui/transport-hook.ts', base(h.api)) as { useCompareTransport: (o: unknown) => Record<string, (...a: unknown[]) => unknown> & { state: { phase: string } } };
  const pa = makePlayer();
  let pb: Player | null = makePlayer();
  pa.currentTime = clock.ma;
  if (pb) pb.currentTime = clock.mb ?? 0;
  const opts = { pa, pb, clock, rate: 0.5, enabled: true, onTimes: (_t: unknown) => undefined };
  let tr!: ReturnType<typeof useCompareTransport>;
  const render = () => {
    tr = h.render(() => useCompareTransport(opts));
  };
  render();
  const settle = async (ms = 40) => {
    for (let k = 0; k < 6; k++) {
      await sleep(ms / 6 + 1);
      render();
    }
  };
  return {
    pa,
    get pb() {
      return pb;
    },
    setPb(p: Player | null) {
      pb = p;
      (opts as { pb: Player | null }).pb = p;
      render();
    },
    opts,
    get tr() {
      return tr;
    },
    render,
    settle,
    unmount: () => h.unmount(),
  };
}
/** 둘 다 relA 자리까지 재생된 것처럼 */
function advance(t: ReturnType<typeof transportHarness>, rel: number, ma: number, mb: number) {
  t.pa.currentTime = ma + rel;
  if (t.pb) t.pb.currentTime = mb + rel;
  t.pa.emit('timeUpdate', { currentTime: ma + rel });
}
async function startPlaying(t: ReturnType<typeof transportHarness>) {
  await t.settle(); /* 재생기가 붙은 다음 장면까지 기다린 뒤 누른다(사람이 누르는 때) */
  t.tr.play();
  await t.settle();
  assert(t.tr.state.phase === 'playing', `재생 시작 실패: ${t.tr.state.phase}`);
}

export async function run(check: Check) {
  const C = { ma: 0, mb: 0, range: { min: 0, max: 10 }, loop: null, normalized: null };

  /* =========================================================== F03 */
  await check('F03 검토 재현 — 5초에서 받기 → 준비되면 5초에서 다시', async () => {
    const t = transportHarness(C);
    await startPlaying(t);
    advance(t, 5, 0, 0);
    t.pb!.status = 'loading';
    t.pb!.emit('statusChange', { status: 'loading' });
    await t.settle();
    assert(t.tr.state.phase === 'buffering', `받는 중이어야: ${t.tr.state.phase}`);
    t.pb!.status = 'readyToPlay';
    t.pb!.emit('statusChange', { status: 'readyToPlay' });
    await t.settle();
    near(t.pa.currentTime, 5, 'A 재개 자리');
    near(t.pb!.currentTime, 5, 'B 재개 자리');
    assert(t.tr.state.phase === 'playing' && t.pa.playing && t.pb!.playing, '다시 재생');
    t.unmount();
  });

  await check('F03 받기 두 번 — 매번 그 자리에서', async () => {
    const t = transportHarness(C);
    await startPlaying(t);
    for (const at of [3, 7.5]) {
      advance(t, at, 0, 0);
      t.pb!.status = 'loading';
      t.pb!.emit('statusChange', { status: 'loading' });
      await t.settle();
      t.pb!.status = 'readyToPlay';
      t.pb!.emit('statusChange', { status: 'readyToPlay' });
      await t.settle();
      near(t.pa.currentTime, at, `${at}초 재개`);
    }
    t.unmount();
  });

  await check('F03 기준이 다른 짝 — A 2초 · B 3초 기준, 상대 1.5초에서 재개', async () => {
    const t = transportHarness({ ...C, ma: 2, mb: 3 });
    await startPlaying(t);
    advance(t, 1.5, 2, 3);
    t.pa.status = 'loading';
    t.pa.emit('statusChange', { status: 'loading' });
    await t.settle();
    t.pa.status = 'readyToPlay';
    t.pa.emit('statusChange', { status: 'readyToPlay' });
    await t.settle();
    near(t.pa.currentTime, 3.5, 'A');
    near(t.pb!.currentTime, 4.5, 'B');
    t.unmount();
  });

  await check('F03 받는 중에 멈춤 — 준비돼도 다시 안 틂', async () => {
    const t = transportHarness(C);
    await startPlaying(t);
    advance(t, 4, 0, 0);
    t.pb!.status = 'loading';
    t.pb!.emit('statusChange', { status: 'loading' });
    await t.settle();
    t.tr.pause();
    await t.settle();
    t.pb!.status = 'readyToPlay';
    t.pb!.emit('statusChange', { status: 'readyToPlay' });
    await t.settle();
    assert(t.tr.state.phase === 'idle' && !t.pa.playing && !t.pb!.playing, '멈춘 채');
    t.unmount();
  });

  await check('F03 받는 중에 B 바꿈 — 옛 B 의 준비 알림은 재생을 시작하지 않음', async () => {
    const t = transportHarness(C);
    await startPlaying(t);
    advance(t, 4, 0, 0);
    const old = t.pb!;
    old.status = 'loading';
    old.emit('statusChange', { status: 'loading' });
    await t.settle();
    t.setPb(makePlayer());
    await t.settle();
    old.status = 'readyToPlay';
    old.emit('statusChange', { status: 'readyToPlay' });
    await t.settle();
    assert(t.tr.state.phase === 'idle' && !t.pa.playing, '새 B 로 바뀌면 멈춘 채');
    t.unmount();
  });

  await check('F03 받는 중 재생기 오류 — 둘 다 멈춤', async () => {
    const t = transportHarness(C);
    await startPlaying(t);
    advance(t, 2, 0, 0);
    t.pb!.status = 'loading';
    t.pb!.emit('statusChange', { status: 'loading' });
    await t.settle();
    t.pb!.status = 'error';
    t.pb!.emit('statusChange', { status: 'error' });
    await t.settle();
    assert(t.tr.state.phase === 'error' && !t.pa.playing && !t.pb!.playing, '오류에 멈춤');
    t.unmount();
  });

  await check('F03 받는 중 앱이 뒤로 — 돌아와 준비돼도 안 틂', async () => {
    const t = transportHarness(C);
    await startPlaying(t);
    advance(t, 2, 0, 0);
    t.pb!.status = 'loading';
    t.pb!.emit('statusChange', { status: 'loading' });
    await t.settle();
    for (const f of appState.listeners) f('background');
    await t.settle();
    t.pb!.status = 'readyToPlay';
    t.pb!.emit('statusChange', { status: 'readyToPlay' });
    await t.settle();
    assert(t.tr.state.phase === 'idle' && !t.pa.playing, '멈춘 채');
    t.unmount();
  });

  await check('F03 B 다시 붙인 직후 받기가 길어지면 — 버퍼링으로(A 만 계속 가지 않음)', async () => {
    const t = transportHarness(C);
    await startPlaying(t);
    t.pa.currentTime = 3;
    t.pb!.currentTime = 2.7;
    t.pa.emit('timeUpdate', { currentTime: 3 });
    t.pb!.status = 'loading';
    t.pb!.emit('statusChange', { status: 'loading' });
    await t.settle(60);
    assert(t.tr.state.phase === 'playing', '잠깐은 봐줌');
    await sleep(520);
    t.render();
    await t.settle();
    assert(t.tr.state.phase === 'buffering', `봐주는 시간 뒤엔 버퍼링: ${t.tr.state.phase}`);
    assert(!t.pa.playing, 'A 도 멈춤');
    t.unmount();
  });

  await check('F03 "섰다"가 "받는 중"보다 먼저 와도 — 멈춤이 아니라 버퍼링', async () => {
    const t = transportHarness(C);
    await startPlaying(t);
    advance(t, 6, 0, 0);
    t.pb!.playing = false;
    t.pb!.emit('playingChange', { isPlaying: false });
    await sleep(30);
    t.pb!.status = 'loading';
    t.pb!.emit('statusChange', { status: 'loading' });
    await t.settle(300);
    assert(t.tr.state.phase === 'buffering', `버퍼링이어야: ${t.tr.state.phase}`);
    t.pb!.status = 'readyToPlay';
    t.pb!.emit('statusChange', { status: 'readyToPlay' });
    await t.settle();
    near(t.pa.currentTime, 6, '6초에서 재개');
    assert(t.tr.state.phase === 'playing', '다시 재생');
    t.unmount();
  });

  await check('F03 반복 끝 — 반복 처음에서 둘 다 다시', async () => {
    const t = transportHarness({ ...C, loop: { min: 1, max: 3 } });
    t.pa.currentTime = 1;
    t.pb!.currentTime = 1;
    await startPlaying(t);
    advance(t, 2.99, 0, 0);
    await t.settle();
    near(t.pa.currentTime, 1, 'A 처음으로');
    near(t.pb!.currentTime, 1, 'B 처음으로');
    assert(t.tr.state.phase === 'playing', '이어서 재생');
    t.unmount();
  });

  await check('F02 확인 옮기기 — 두 재생기가 닿으면 성공, 그사이 사용자가 옮기면 실패', async () => {
    const t = transportHarness({ ...C, ma: 2, mb: 3, range: { min: -2, max: 6 } });
    const ok = await (t.tr.seekConfirmed as (r: number) => Promise<boolean>)(1.25);
    assert(ok === true, '닿음');
    near(t.pa.currentTime, 3.25, 'A');
    near(t.pb!.currentTime, 4.25, 'B');
    t.pb!.status = 'loading';
    const p = (t.tr.seekConfirmed as (r: number) => Promise<boolean>)(-1);
    await sleep(20);
    (t.tr.seekRel as (r: number) => void)(0.5);
    assert((await p) === false, '사용자 옮기기가 이김');
    t.unmount();
  });

  /* =========================================================== F05 — 기준 앞 반복 구간, 저장 왕복 뒤 재생 */
  await check('F05 -1 ~ +1 반복이 저장 왕복 뒤에도 남고, 재생은 기준 1초 앞에서', async () => {
    const d0 = doc.createDocument('u1', [{ path: 'u1/local-a', origin: 'photos', owned: true, label: null, date: null }, { path: 'u1/local-b', origin: 'photos', owned: true, label: null, date: null }], '2026-11-02T00:00:00.000Z');
    const d1 = doc.updatePair(doc.updatePair(d0, { anchors: { a: 2, b: 3 } }), { loop: { start: -1, end: 1 } });
    const back = doc.parseDocument(JSON.parse(JSON.stringify(d1)), 'u1');
    assert(back.ok, '문서 읽힘');
    const loop = back.ok ? doc.activePair(back.doc)!.loop : null;
    assert(loop && loop.start === -1 && loop.end === 1, `반복 남음: ${JSON.stringify(loop)}`);
    const t = transportHarness({ ma: 2, mb: 3, range: { min: -2, max: 6 }, loop: { min: loop!.start, max: loop!.end }, normalized: null });
    t.pa.currentTime = 0;
    await startPlaying(t);
    near(t.pa.currentTime, 1, 'A = 기준 2초 − 1');
    near(t.pb!.currentTime, 2, 'B = 기준 3초 − 1');
    t.unmount();
  });
  await check('F05 전부 음수 · 전부 양수 왕복, 깨진 값은 거절', () => {
    const d0 = doc.createDocument('u1', [{ path: 'u1/local-a', origin: 'photos', owned: true, label: null, date: null }, { path: 'u1/local-b', origin: 'photos', owned: true, label: null, date: null }], '2026-11-02T00:00:00.000Z');
    const rt = (loop: unknown) => {
      const r = doc.parseDocument(JSON.parse(JSON.stringify(doc.updatePair(d0, { loop: loop as doc.RelSpan }))), 'u1');
      return r.ok ? doc.activePair(r.doc)!.loop : 'bad';
    };
    assert(JSON.stringify(rt({ start: -3, end: -1 })) === '{"start":-3,"end":-1}', '전부 음수');
    assert(JSON.stringify(rt({ start: 0.5, end: 2 })) === '{"start":0.5,"end":2}', '전부 양수');
    for (const bad of [{ start: 1, end: -1 }, { start: Number.NaN, end: 1 }, { start: 0, end: 0.01 }, { start: -9999, end: 1 }, { start: 'x', end: 1 }]) assert(rt(bad) === null, `거절 ${JSON.stringify(bad)}`);
    assert(JSON.stringify(doc.fitLoop({ start: -3, end: 1 }, { min: -1, max: 5 })) === '{"start":-1,"end":1}', '공통 구간에 맞춤');
    assert(doc.fitLoop({ start: -3, end: -2 }, { min: -1, max: 5 }) === null, '안 겹치면 없음');
  });
  await check('R09 영상별 다듬기 — 기준 장면 밖은 거절 · 다 풀면 null · 공통 구간이 따라 줄어듦', () => {
    let d = doc.updatePair(doc.createDocument('u1', [{ path: 'u1/local-a', origin: 'photos', owned: true, label: null, date: null }, { path: 'u1/local-b', origin: 'photos', owned: true, label: null, date: null }], '2026-11-02T00:00:00.000Z'), { anchors: { a: 2, b: 3 } });
    assert(doc.setTrim(d, 'a', 'start', 2.5, 10) === null, '기준(2초)보다 뒤 시작은 거절');
    d = doc.setTrim(d, 'a', 'start', 1, 10)!;
    d = doc.setTrim(d, 'a', 'end', 4, 10)!;
    const p = doc.activePair(d)!;
    assert(JSON.stringify(p.trims.a) === '{"start":1,"end":4}', '다듬음');
    const r = timing.offsetRange(2, 3, timing.trimmedRange(10, p.trims.a), timing.trimmedRange(10, null));
    assert(r && r.min === -1 && r.max === 2, `공통 구간 ${JSON.stringify(r)}`);
    assert(doc.activePair(doc.clearTrim(d, 'a'))!.trims.a === null, '풀기');
    const back = doc.parseDocument(JSON.parse(JSON.stringify(d)), 'u1');
    assert(back.ok && JSON.stringify(doc.activePair(back.doc)!.trims.a) === '{"start":1,"end":4}', '저장 왕복');
  });
  await check('R11 겹쳐 보기 자리 맞춤 — 조금씩 · 범위 안', () => {
    let r = geometry.IDENTITY_REG;
    for (let i = 0; i < 100; i++) r = geometry.nudgeReg(r, 'right');
    assert(r.dx === 1, `오른쪽 끝 1: ${r.dx}`);
    r = geometry.nudgeReg(geometry.nudgeReg(geometry.IDENTITY_REG, 'bigger'), 'smaller');
    near(r.scale, 1, '크게 → 작게', 1e-9);
  });
  await check('F01 · R20 사본 — 영상을 같이 쓰고(owned 꺼짐) 기준 · 그림은 그대로', () => {
    const d = doc.updatePair(doc.createDocument('u1', [{ path: 'u1/local-a', origin: 'photos', owned: true, label: null, date: null }, { path: 'u1/local-b', origin: 'photos', owned: true, label: null, date: null }], '2026-11-02T00:00:00.000Z'), { anchors: { a: 1, b: 2 }, rel: 0.4 });
    const c = doc.duplicate(d, '2026-11-02T00:01:00.000Z', 'copy');
    assert(c.id === 'copy' && c.revision === 0 && c.sources.every((x) => !x.owned), '같이 쓰는 사본');
    assert(doc.activePair(c)?.rel === 0.4 && doc.activePair(c)?.anchors.b === 2, '짝 상태 그대로');
  });
  await check('F08 보기 이동은 칸 비율 — 칸 크기가 바뀌어도 같은 곳', () => {
    const v = geometry.zoomAt(geometry.IDENTITY_VIEW, { w: 320, h: 480, aspect: 9 / 16 }, { x: 250, y: 100 }, 3);
    const p = { u: 0.7, v: 0.3 };
    const small = geometry.toScreen(p, { w: 320, h: 480, aspect: 9 / 16 }, v);
    const big = geometry.toScreen(p, { w: 640, h: 960, aspect: 9 / 16 }, v);
    near(big.x, small.x * 2, '가로 비례', 1e-6);
    near(big.y, small.y * 2, '세로 비례', 1e-6);
    assert(geometry.normalizeView({ zoom: 2, panX: 120, panY: -40 }).panX === 0, '옛 px 값은 0');
  });

  /* =========================================================== F02 — 실제 Workbench 의 복원 순서 */
  await runWorkbench(check);
  /* =========================================================== F07 — 영상 고르기 */
  await runSourcePick(check);
  await runWorkbenchPick(check);
  await runSingleScreen(check);
  await runDrawTransaction(check);
  await runRemediation(check);
}

/* ---- Workbench 하네스 ---- */
type Tree = { type: unknown; props?: Record<string, unknown> } | Tree[] | null | undefined | string | number | boolean;
function findAll(x: Tree, pred: (n: { type: unknown; props: Record<string, unknown> }) => boolean, out: { type: unknown; props: Record<string, unknown> }[] = [], seen = new Set<object>()) {
  if (!x || typeof x !== 'object' || seen.has(x)) return out;
  seen.add(x);
  if (Array.isArray(x)) {
    for (const y of x) findAll(y, pred, out, seen);
    return out;
  }
  const n = x as { type: unknown; props: Record<string, unknown> };
  if (n.props && pred(n)) out.push(n);
  if (n.props) for (const v of Object.values(n.props)) if (v && typeof v === 'object') findAll(v as Tree, pred, out, seen);
  /* 도구 줄 · 작은 창 줄처럼 부품이 아닌 묶음({ key, node } · { items }) 안의 부품도 찾는다 — 재생기 · 문서는 건너뛴다 */
  if (!n.props && !('addListener' in n) && !('sources' in n)) for (const v of Object.values(n)) if (v && typeof v === 'object') findAll(v as Tree, pred, out, seen);
  return out;
}

type WbOpts = { initial: doc.ComparisonDocument; start?: 'pick' | 'align' | 'compare'; confirm?: (rel: number) => Promise<boolean>; drift?: number[]; drafts?: noteDrafts.DraftStore | null };
function workbenchHarness(o: WbOpts) {
  rafToTimers();
  const h = hookRuntime();
  const schedules: doc.ComparisonDocument[] = [];
  const seeks: number[] = [];
  const confirms: number[] = [];
  const store = {
    useCompareStore: () => ({ owner: 'u1', recent: [], version: 0 }),
    compareOwner: () => 'u1',
    compareStorage: () => null,
    refreshRecent() {},
    deleteComparison: async () => true,
    holdPaths() {},
    releaseHold() {},
    discardImported: async () => undefined,
    importForCompare: async () => [],
    compareDrafts: () => o.drafts ?? null,
  };
  let lastClock: { ma: number; mb: number | null } | null = null;
  const m = {
    ...base(h.api),
    '@/lib/my-videos': {},
    '~/compare/store': store,
    '~/compare/storage': { ...storage, createAutosaver: () => ({ base() {}, schedule: (d: doc.ComparisonDocument) => void schedules.push(d), flush: async () => {}, stop() {}, dirty: false }) },
    '~/compare/ui/pane': { Pane: 'Pane' },
    '~/compare/ui/panels': panelsModule(h.api),
    '~/compare/ui/timeline': { Timeline: 'Timeline' },
    '~/compare/ui/note-editor': { NoteEditor: 'NoteEditor' },
    '~/compare/ui/tool-bar': { ToolBar: 'ToolBar' },
    '~/compare/ui/workspace-parts': partsModule(h.api),
    '~/compare/workspace-layout': wsLayout,
    '~/compare/workspace-context': wsContext,
    '~/compare/ui/source-picker': { SourcePicker: 'SourcePicker' },
    '~/compare/source-pick': sourcePick,
    /* 한 영상 재생(A 만 · B 만)은 실제 훅을 같은 훅 순서로 돌린다(없는 판에선 빈 모듈) */
    '~/compare/ui/side-playback': hasUi('native/src/compare/ui/side-playback.ts') ? compile('native/src/compare/ui/side-playback.ts', base(h.api)) : {},
    '~/compare/ui/transport-hook': {
      useCompareTransport: (x: { clock: { ma: number; mb: number | null } | null; onTimes: (t: { a: number; b: number }) => void }) => {
        lastClock = x.clock;
        return {
          state: { phase: 'idle' },
          driftMs: o.drift ?? [],
          relNow: () => 0,
          play() {},
          pause() {},
          seekRel(r: number) {
            seeks.push(r);
            if (x.clock) x.onTimes({ a: x.clock.ma + r, b: (x.clock.mb ?? 0) + r });
          },
          seekConfirmed(r: number) {
            confirms.push(r);
            seeks.push(r);
            if (x.clock) x.onTimes({ a: x.clock.ma + r, b: (x.clock.mb ?? 0) + r });
            return o.confirm ? o.confirm(r) : Promise.resolve(true);
          },
        };
      },
    },
    '~/lib/layout': { READABLE: {} },
    '~/lib/ui': { TYPE: {}, usePalette: () => new Proxy({}, { get: () => '#123456' }), withAlpha: () => '' },
    '~/compare/ui/compare-palette': { useComparePalette: () => new Proxy({}, { get: () => '#123456' }) },
    '~/shell/icon': { Icon: 'Icon' },
    '~/shell/press': { Press: 'Press' },
    '~/shell/toast': { toast() {} },
    '~/videos/filters': { startPickUi() {} },
    '~/videos/gallery': { VideoGallery: 'VideoGallery' },
    '~/videos/store': { useMyVideos: () => ({ items: [] }) },
    '~/videos/text': { videoDateText: () => '', videoCaption: () => '' },
  };
  const { Workbench } = compile('native/src/compare/ui/workbench.tsx', m) as { Workbench: (p: unknown) => Tree };
  let tree: Tree = null;
  const render = () => {
    tree = h.render(() => Workbench({ initial: o.initial, start: o.start ?? 'compare', onExit() {}, exitIsBack: true }));
  };
  render();
  const info = (dur = 10, error: unknown = null, player = makePlayer()) => ({ player, ready: !error, duration: dur, fps: 30, aspect: 9 / 16, codec: null, width: 1080, height: 1920, error });
  const players: Record<'a' | 'b', Player | null> = { a: null, b: null };
  return {
    render,
    players,
    unmount: () => h.unmount(),
    get tree() {
      return tree;
    },
    panes: () => findAll(tree, (n) => n.type === 'Pane'),
    ready(side: 'a' | 'b', dur = 10, error: unknown = null, player = makePlayer()) {
      const p = this.panes().find((x) => x.props.side === side);
      assert(p, `${side} 칸 없음`);
      players[side] = player;
      (p!.props.onInfo as (i: unknown) => void)(info(dur, error, player));
      render();
      return player;
    },
    schedules,
    seeks,
    confirms,
    clock: () => lastClock,
    find: (pred: (n: { type: unknown; props: Record<string, unknown> }) => boolean) => findAll(tree, pred),
    /** 무대(영상 자리)가 이 크기로 놓였다고 알린다(onLayout) */
    stage(w: number, h: number) {
      const st = findAll(tree, (n) => typeof n.props.onLayout === 'function' && (n.props.style as { minHeight?: number } | undefined)?.minHeight === 0)[0];
      assert(st, '무대 없음');
      (st.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 0, width: w, height: h } } });
      render();
    },
    press(label: string) {
      /* 단추 이름 — RN 단추는 accessibilityLabel, 작은 부품(IconBtn · TextBtn)은 label · a11y */
      const n = findAll(tree, (x) => (x.props.accessibilityLabel === label || x.props.a11y === label || x.props.label === label) && typeof x.props.onPress === 'function')[0];
      assert(n, `단추 없음: ${label}`);
      (n.props.onPress as () => void)();
      render();
    },
    /** 하드웨어 뒤로 한 번 */
    back() {
      hwBack.f?.();
      render();
    },
    async settle() {
      for (let k = 0; k < 5; k++) {
        await sleep(3);
        render();
      }
    },
  };
}
const SRC = (p: string, owned = false): doc.NewSource => ({ path: p, origin: owned ? 'photos' : 'myVideos', owned, label: null, date: null, facts: timing.normalizeFacts({ durationSec: 10 }) });
const pairDoc = (rel: number, anchors = { a: 2, b: 3 }) => doc.updatePair(doc.createDocument('u1', [SRC('u1/local-a'), SRC('u1/local-b')], '2026-11-02T00:00:00.000Z', { doc: 'w1', sources: ['sa', 'sb'] }), { anchors, rel });
const lastRel = (h: ReturnType<typeof workbenchHarness>) => {
  const d = h.schedules.at(-1);
  return d ? (doc.activePair(d)?.rel ?? null) : null;
};

const texts = (x: Tree, out: string[] = []): string[] => {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((y) => texts(y, out));
  else if (x && typeof x === 'object' && (x as { props?: Record<string, unknown> }).props) for (const v of Object.values((x as { props: Record<string, unknown> }).props)) if (v && (typeof v === 'object' || typeof v === 'string')) texts(v as Tree, out);
  return out;
};
/** 작은 창 한 줄의 글(덩어리 · 단추 · 긴 글 모두) */
type InspRowT = { key: string; h: number; node?: unknown; items?: { key: string; w: number; node: unknown }[]; text?: { s: string }; head?: boolean };
const rowTexts = (r: InspRowT) => [...texts(r.node as Tree), ...(r.text ? [r.text.s] : []), ...(r.items ?? []).flatMap((it) => texts(it.node as Tree))];
async function runWorkbench(check: Check) {
  await check('UI01 한 화면 — 굴리는 판이 없고, 그리기를 켜도 · 그리는 동안에도 없음(뒤로 쓸기만 막음)', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(0), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    const scrolls = () => h.find((n) => n.type === 'ScrollView' || n.type === 'FlatList' || n.type === 'SectionList');
    assert(scrolls().length === 0, '보기에서 굴림 없음');
    h.press('그리기');
    await h.settle();
    assert(scrolls().length === 0, '그리기에서 굴림 없음');
    const pa = h.panes().find((x) => x.props.side === 'a')!;
    const draw = pa.props.draw as { drawing: boolean; onStroke: (b: boolean) => void };
    assert(draw.drawing, '그리기 켜짐');
    draw.onStroke(true);
    h.render();
    const screen = () => h.find((n) => n.type === 'Screen')[0]?.props.options as { gestureEnabled: boolean };
    assert(screen().gestureEnabled === false, '그리는 동안 뒤로 쓸기 막음');
    assert(h.find((n) => n.type === 'Timeline').length === 1, '그리는 동안에도 타임라인');
    draw.onStroke(false);
    h.render();
    assert(scrolls().length === 0, '다 그린 뒤에도 굴림 없음');
  });
  await check('F08 동작 길이 맞춤 — 재생 구간은 짚은 첫 장면 ~ 마지막 장면', async () => {
    let d = pairDoc(0, { a: 2, b: 3 });
    d = doc.updateSource(d, 'sa', { events: { kneePeak: 1, footContact: 2, release: 2.5 } });
    d = doc.updateSource(d, 'sb', { events: { kneePeak: 1.5, footContact: 3, release: 3.6 } });
    d = doc.updatePair(d, { mode: 'normalized', semantic: 'footContact' });
    const h = workbenchHarness({ initial: { ...d, revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    const ck = h.clock() as { range: { min: number; max: number }; normalized: unknown } | null;
    assert(ck && ck.normalized, '정규화 시계');
    near(ck!.range.min, -1, '첫 장면(무릎 최고 1초 − 기준 2초)', 1e-6);
    near(ck!.range.max, 0.5, '마지막 장면(릴리스 2.5 − 2)', 1e-6);
    assert(!timing.buildNormalized([0, 1], [0, 5]).ok, '다섯 배 늘임은 거절');
  });
  await check('F08 A · B 바꾸면 손가락 확대 값이 새 짝을 덮지 않음', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(0), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    const pa = h.panes().find((x) => x.props.side === 'a')!;
    (pa.props.onView as (v: unknown) => void)({ ...geometry.IDENTITY_VIEW, zoom: 3, panX: 0.2 });
    await h.settle();
    const zoomed = h.panes().find((x) => x.props.side === 'a')!.props.view as { zoom: number };
    assert(zoomed.zoom === 3, 'A 확대');
    sheetPick.label = 'A · B 바꾸기';
    const more = h.find((n) => n.props.accessibilityLabel === '더보기')[0];
    (more.props.onPress as () => void)();
    await h.settle();
    const newA = h.panes().find((x) => x.props.side === 'a')!.props.view as { zoom: number };
    const newB = h.panes().find((x) => x.props.side === 'b')!.props.view as { zoom: number };
    assert(newA.zoom === 1 && newB.zoom === 3, `바꾼 뒤 A ${newA.zoom} · B ${newB.zoom}(옛 B · 옛 A 의 보기)`);
  });
  await check('F08 맞춤 정도를 "최대"라고 말하지 않음', async () => {
    const drift = Array.from({ length: 60 }, (_, i) => (i % 2 ? 1 : -1) * (5 + (i % 7) * 12));
    const h = workbenchHarness({ initial: { ...pairDoc(0), revision: 2 }, drift });
    h.ready('a');
    h.ready('b');
    await h.settle();
    h.press('맞추기 · 반복 · 배치');
    await h.settle();
    const insp = h.find((n) => n.type === 'Inspector')[0];
    assert(insp, '맞추기 작은 창');
    const all = (insp.props.rows as InspRowT[]).flatMap(rowTexts);
    assert(!all.some((t) => t.includes('최대')), '"최대" 없음');
    assert(all.some((t) => t.includes('95%') && t.includes('어림')), `95% 어림 설명: ${all.filter((t) => t.includes('ms')).join(' / ')}`);
  });
  for (const rel of [1.25, -1.5, 0, 6.9]) {
    await check(`F02 저장된 자리 ${rel} 로 복원 — 준비 전엔 안 덮음`, async () => {
      const h = workbenchHarness({ initial: { ...pairDoc(rel), revision: 3 } });
      await h.settle();
      assert(lastRel(h) == null || lastRel(h) === rel, `준비 전에 자리를 덮음: ${lastRel(h)}`);
      h.ready('a');
      await h.settle();
      assert(lastRel(h) == null || lastRel(h) === rel, `A 만 준비됐는데 덮음: ${lastRel(h)}`);
      h.ready('b');
      await h.settle();
      assert(h.confirms.length === 1, `확인 옮기기 한 번: ${h.confirms}`);
      near(h.confirms[0], Math.min(rel, 7), '저장된 자리로');
      assert(lastRel(h) == null || Math.abs((lastRel(h) as number) - Math.min(rel, 7)) < 0.011, `복원 뒤 자리: ${lastRel(h)}`);
    });
  }
  await check('F02 B 가 먼저 준비돼도 같음', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(1.25), revision: 2 } });
    h.ready('b');
    await h.settle();
    h.ready('a');
    await h.settle();
    near(h.confirms[0] ?? NaN, 1.25, '복원');
  });
  await check('F02 B 오류 — 자리를 0 으로 덮지 않음, 다시 준비되면 복원', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(1.25), revision: 2 } });
    h.ready('a');
    h.ready('b', 10, { kind: 'load' });
    await h.settle();
    assert(h.confirms.length === 0, '오류 중엔 복원 안 함');
    assert(lastRel(h) == null || lastRel(h) === 1.25, `덮음: ${lastRel(h)}`);
    h.ready('b');
    await h.settle();
    near(h.confirms[0] ?? NaN, 1.25, '다시 준비되면 복원');
  });
  await check('F02 확인 실패(재생기가 안 닿음) — 자리를 저장하지 않음', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(1.25), revision: 2 }, confirm: async () => false });
    h.ready('a');
    h.ready('b');
    await h.settle();
    assert(lastRel(h) == null || lastRel(h) === 1.25, `실패한 복원 뒤 덮음: ${lastRel(h)}`);
  });
  await check('F02 한 영상 — 마지막 자리로 복원 · 저장', async () => {
    const d0 = doc.createDocument('u1', [SRC('u1/local-a', true)], '2026-11-02T00:00:00.000Z', { doc: 'w2', sources: ['sa'] });
    const d1 = { ...doc.updateSource(d0, 'sa', { lastTime: 4.2 }), revision: 1 };
    const h = workbenchHarness({ initial: d1 });
    await h.settle();
    h.ready('a');
    await h.settle();
    near(h.confirms[0] ?? NaN, 4.2, '한 영상 복원');
    const saved = h.schedules.at(-1);
    assert(!saved || Math.abs((doc.sourceOf(saved, 'sa')?.lastTime ?? -1) - 4.2) < 0.011, '자리 그대로');
  });
}

/* ---- 작업대의 고르기 연결(F07) ---- */
async function runWorkbenchPick(check: Check) {
  const pickEl = (h: ReturnType<typeof workbenchHarness>) => h.find((n) => n.type === 'SourcePicker')[0];
  await check('F07 앱 영상 0개 — 사진 앱 A 한 영상 → 비교 영상 추가 → 사진 앱 B → 맞추기', async () => {
    const d0 = doc.createDocument('u1', [SRC('u1/local-a', true)], '2026-11-02T00:00:00.000Z', { doc: 'f7a', sources: ['sa'] });
    const h = workbenchHarness({ initial: d0, start: 'align' });
    h.ready('a');
    await h.settle();
    h.press('비교 영상 추가');
    const p = pickEl(h);
    assert(p, '고르기 화면');
    assert(p.props.slot === 'b' && p.props.relink === null, 'B 더하기');
    (p.props.onPick as (c: unknown) => void)({ kind: 'new', source: SRC('u1/local-b', true) });
    await h.settle();
    const last = h.schedules.at(-1)!;
    assert(last.sources.length === 2 && last.active.b && doc.sourceOf(last, last.active.b)!.path === 'u1/local-b', 'B 로 들어감');
    assert(h.panes().some((x) => x.props.side === 'b'), 'B 칸');
    assert(!pickEl(h), '고르기 닫힘');
  });
  await check('F07 B 바꾸다 취소 — 짝 · 기준 · 자리 그대로', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(1.25), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    const n0 = h.schedules.length;
    const pb = h.panes().find((x) => x.props.side === 'b')!;
    (pb.props.onReplace as () => void)();
    h.render();
    const p = pickEl(h);
    assert(p && p.props.slot === 'b', '고르기 열림');
    (p!.props.onCancel as () => void)();
    await h.settle();
    assert(!pickEl(h), '닫힘');
    const changed = h.schedules.slice(n0).find((d) => JSON.stringify(doc.activePair(d)?.anchors) !== '{"a":2,"b":3}' || doc.activePair(d)?.rel !== 1.25);
    assert(!changed, `짝이 바뀜: ${JSON.stringify(changed && doc.activePair(changed))}`);
    assert(h.panes().some((x) => x.props.side === 'b'), 'B 그대로');
  });
  await check('F07 A 만 바꾸기 — B 그대로', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(0.5), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    const pa = h.panes().find((x) => x.props.side === 'a')!;
    (pa.props.onReplace as () => void)();
    h.render();
    const p = pickEl(h);
    assert(p && p.props.slot === 'a', 'A 고르기');
    (p!.props.onPick as (c: unknown) => void)({ kind: 'new', source: SRC('u1/local-n', true) });
    await h.settle();
    const last = h.schedules.at(-1)!;
    assert(last.active.b === 'sb' && doc.sourceOf(last, last.active.a)!.path === 'u1/local-n', 'A 만 바뀜');
  });
  await check('F07 없는 영상 다시 잇기 — 같은 칸에 새 경로', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(0.5), revision: 2 } });
    h.ready('a');
    h.ready('b', 10, { kind: 'missing' });
    await h.settle();
    const pb = h.panes().find((x) => x.props.side === 'b')!;
    (pb.props.onReplace as () => void)();
    h.render();
    const p = pickEl(h);
    assert(p && p.props.relink === 'sb', '다시 잇기');
    (p!.props.onPick as (c: unknown) => void)({ kind: 'new', source: SRC('u1/local-new', true) });
    await h.settle();
    const last = h.schedules.at(-1)!;
    assert(doc.sourceOf(last, 'sb')!.path === 'u1/local-new' && doc.activePair(last)?.anchors.b === 3, '기준 그대로 새 경로');
  });
}

/* ---- 영상 고르기(F07) ---- */
async function runSourcePick(check: Check) {
  let sp: typeof import('~/compare/source-pick') | null = null;
  try {
    sp = await import('~/compare/source-pick');
  } catch {
    await check('F07 영상 고르기 모듈(compare/source-pick.ts)', () => {
      throw new Error('없음 — 한 고르기 흐름이 아직 없다');
    });
    return;
  }
  const { applyPick, candidatesFor, cancelPick, beginPick } = sp;
  const D = () => doc.createDocument('u1', [SRC('u1/local-a', true)], '2026-11-02T00:00:00.000Z', { doc: 'p1', sources: ['sa'] });
  await check('F07 한 영상 → 사진 앱 B 추가(앱 안 영상 0개)', () => {
    const s = beginPick(D(), 'b');
    const r = applyPick(s, { kind: 'new', source: SRC('u1/local-b', true) }, '2026-11-02T00:00:01.000Z');
    assert(r.ok, '추가');
    if (!r.ok) return;
    assert(r.doc.sources.length === 2 && r.doc.active.b === r.doc.sources[1].id, 'B 로 짝');
    assert(r.adopted.includes('u1/local-b'), '가져온 영상은 문서에 넘김');
  });
  await check('F07 지금 문서의 영상 다시 고르기 · 같은 영상 두 보기', () => {
    let d = D();
    const added = doc.addSource(d, SRC('u1/local-c'), '2026-11-02T00:00:01.000Z', 'sc');
    d = added!.doc;
    const c = candidatesFor(d, 'b');
    assert(c.some((x) => x.id === 'sc'), '문서 영상이 후보');
    const r = applyPick(beginPick(d, 'b'), { kind: 'existing', sourceId: 'sc' }, '2026-11-02T00:00:02.000Z');
    assert(r.ok && r.doc.active.b === 'sc', '다시 고름');
    const twin = applyPick(beginPick(d, 'b'), { kind: 'same' }, '2026-11-02T00:00:02.000Z');
    assert(twin.ok && twin.doc.active.b && twin.doc.active.b !== 'sa' && doc.sourceOf(twin.doc, twin.doc.active.b)!.path === 'u1/local-a', '같은 영상 새 칸');
    assert(twin.ok && !doc.sourceOf(twin.doc, twin.doc.active.b!)!.owned, '두 번째 칸은 복사본 주인 아님');
  });
  await check('F07 A 바꾸기 — B · 그림은 그대로, 새 A 짝', () => {
    let d = doc.createDocument('u1', [SRC('u1/local-a'), SRC('u1/local-b')], '2026-11-02T00:00:00.000Z', { doc: 'p2', sources: ['sa', 'sb'] });
    d = doc.updatePair(d, { anchors: { a: 1, b: 2 }, rel: 0.5 });
    const r = applyPick(beginPick(d, 'a'), { kind: 'new', source: SRC('u1/local-n', true) }, '2026-11-02T00:00:03.000Z');
    assert(r.ok && r.doc.active.b === 'sb' && r.doc.active.a !== 'sa', 'A 만 바뀜');
    assert(r.ok && doc.pairOf(r.doc, 'sa', 'sb')?.rel === 0.5, '옛 짝 상태는 문서에 남음');
  });
  await check('F07 B 바꾸다 취소 — 짝 · 기준 · 자리 그대로, 가져온 영상은 정리 대상', () => {
    let d = doc.createDocument('u1', [SRC('u1/local-a'), SRC('u1/local-b')], '2026-11-02T00:00:00.000Z', { doc: 'p3', sources: ['sa', 'sb'] });
    d = doc.updatePair(d, { anchors: { a: 1, b: 2 }, rel: 0.75, loop: { start: -0.5, end: 0.5 } });
    const s = beginPick(d, 'b');
    const c = cancelPick(s, ['u1/local-tmp']);
    assert(c.doc === d, '문서 그대로(같은 객체)');
    assert(JSON.stringify(c.discard) === '["u1/local-tmp"]', '안 쓴 가져온 영상');
  });
  await check('F07 다른 계정에서 고른 결과는 버림', () => {
    const s = beginPick(D(), 'b');
    const r = applyPick({ ...s, owner: 'u2' }, { kind: 'new', source: SRC('u1/local-b', true) }, '2026-11-02T00:00:01.000Z');
    assert(!r.ok && r.reason === 'owner', '거절');
  });
  await check('F07 없는 영상 다시 잇기 — 기준 · 그림 칸 그대로', () => {
    let d = doc.createDocument('u1', [SRC('u1/local-a'), SRC('u1/local-gone')], '2026-11-02T00:00:00.000Z', { doc: 'p4', sources: ['sa', 'sb'] });
    d = doc.updateSource(d, 'sb', { events: { release: 1.2 } });
    const r = applyPick(beginPick(d, 'b', { relink: 'sb' }), { kind: 'new', source: SRC('u1/local-new', true) }, '2026-11-02T00:00:01.000Z');
    assert(r.ok && doc.sourceOf(r.doc, 'sb')!.path === 'u1/local-new' && doc.sourceOf(r.doc, 'sb')!.events.release === 1.2, '같은 칸에 새 경로');
  });
}

/* ---- 한 화면(UI01~UI10) — 실제 workbench.tsx 를 가짜 훅 순서로 ---- */
async function runSingleScreen(check: Check) {
  type R = { x: number; y: number; w: number; h: number };
  const rectOf = (h: ReturnType<typeof workbenchHarness>, side: 'a' | 'b') => h.panes().find((x) => x.props.side === side)?.props.rect as R | null | undefined;
  const keysOf = (h: ReturnType<typeof workbenchHarness>) => h.panes().map((x) => (x as unknown as { key: unknown }).key).join('|');
  const inspector = (h: ReturnType<typeof workbenchHarness>) => h.find((n) => n.type === 'Inspector')[0] as unknown as { props: { rows: { node: Tree }[]; title: string } } | undefined;
  const inRows = (h: ReturnType<typeof workbenchHarness>, pred: (n: { type: unknown; props: Record<string, unknown> }) => boolean) =>
    (inspector(h)?.props.rows ?? []).flatMap((r) => findAll([r.node, ...((r as { items?: { node: Tree }[] }).items ?? []).map((it) => it.node)] as Tree, pred));
  /*
   * IM03(2026-11-03) — 예전 계약('칸 = 원본 비율 사각형 · 타임라인 쪽 아래 붙임')을 몰입 계약으로 바꿈(지우지 않고 같은 이름 아래):
   * 칸은 무대를 빈틈없이 나누고(구분선 1pt) 영상은 위 끝부터. 원본 비율은 칸 안 영상 사각형(LayerMap)이 지킨다.
   */
  const splitDoc = (rel: number) => {
    const d = pairDoc(rel);
    return doc.setPresent(d, { ...doc.presentOf(doc.activePair(d)!), view: 'split' as const, viewChosen: true, autoOverlayDone: true });
  };
  await check('UI03 무대를 재면 두 칸이 무대를 빈틈없이 나누고 · 무대 안 · 겹치지 않음 · 영상은 위 끝부터(IM03)', async () => {
    const h = workbenchHarness({ initial: { ...splitDoc(0), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    assert(rectOf(h, 'a') == null, '재기 전엔 자리 없음(칸은 붙어 있음)');
    h.stage(382, 560);
    const a = rectOf(h, 'a')!;
    const b = rectOf(h, 'b')!;
    assert(a && b, '두 칸 자리');
    for (const r of [a, b]) assert(r.x >= 0 && r.y >= 0 && r.x + r.w <= 382.5 && r.y + r.h <= 560.5, `무대 밖: ${JSON.stringify(r)}`);
    const overlap = !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    assert(!overlap, '겹침');
    assert(a.y === 0 && b.y === 0, `위 빈자리 없음: ${a.y} · ${b.y}`);
    assert(a.y === b.y, '세로 영상 둘은 나란히(같은 높이)');
    assert(a.h === 560 && b.h === 560 && a.w + b.w + 1 === 382, `칸이 무대를 다 덮음(구분선 1pt): ${JSON.stringify([a, b])}`);
    const pa = h.panes().find((x) => x.props.side === 'a')!;
    assert(pa.props.display === 'fill', '새 비교 기본 표시는 채움');
    const m = imGeometry.layerMap(a, 9 / 16, IDENTITY_V, 'fill');
    near(m.w / m.h, 9 / 16, 'A 영상 사각형은 원본 비율(찌그러짐 없음)', 1e-6);
    assert(m.x <= 0 && m.y <= 0 && m.x + m.w >= a.w && m.y + m.h >= a.h, '채움 — 칸을 다 덮음');
  });
  await check('IM04 새 비교는 함께 보기에 들어서면 한 번 겹침(위 B 45%) · 예전 문서는 그대로', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(0), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    h.stage(382, 560);
    const p = doc.presentOf(doc.activePair(h.schedules.at(-1)!)!);
    assert(p.view === 'overlay' && p.top === 'b' && Math.abs(p.opacity - 0.45) < 1e-9 && p.autoOverlayDone, `겹침 B 45%: ${JSON.stringify(p)}`);
    const pb = h.panes().find((x) => x.props.side === 'b')!;
    const la = h.panes().find((x) => x.props.side === 'a')!.props.layer as { opacity: number; role: string; map: unknown };
    const lb = pb.props.layer as { opacity: number; role: string; map: { w: number; h: number } };
    assert(la.role === 'base' && la.opacity === 1 && lb.role === 'top' && Math.abs(lb.opacity - 0.45) < 1e-9, '아래 A 1 · 위 B 0.45');
    near(lb.map.w / lb.map.h, 9 / 16, '위 영상도 원본 비율', 1e-6);
    /* 예전 문서(present 칸 없음 · 겹침 꺼짐)는 자동 겹침을 하지 않는다 */
    const old = pairDoc(0);
    const legacy = { ...old, pairs: old.pairs.map((x) => ({ ...x, present: undefined })) };
    const h2 = workbenchHarness({ initial: { ...legacy, revision: 2 } as typeof old });
    h2.ready('a');
    h2.ready('b');
    await h2.settle();
    h2.stage(382, 560);
    const last = h2.schedules.at(-1);
    assert(!last || doc.presentOf(doc.activePair(last)!).view === 'split', '예전 문서는 분할 그대로');
    assert(!h2.panes().some((x) => x.props.layer), '겹침 겹 없음');
  });
  await check('UI10 배치 · 겹쳐 · 크게 보기 · 작은 창을 바꿔도 칸(재생기)은 같은 부품 그대로', async () => {
    const h = workbenchHarness({ initial: { ...splitDoc(0.5), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    h.stage(382, 560);
    const k0 = keysOf(h);
    h.press('맞추기 · 반복 · 배치');
    const seg = (label: string) => inRows(h, (n) => n.type === 'Seg' && n.props.label === label)[0];
    (seg('영상 배치').props.onChange as (v: string) => void)('stack');
    h.render();
    assert(keysOf(h) === k0, `위아래: ${keysOf(h)} ≠ ${k0}`);
    const a = rectOf(h, 'a')!;
    const b = rectOf(h, 'b')!;
    assert(b.y >= a.y + a.h, '위아래로 놓임');
    (seg('영상 배치').props.onChange as (v: string) => void)('overlay');
    h.render();
    assert(keysOf(h) === k0, '겹쳐 보기에서도 같은 칸');
    /* IM05 — 예전 '겹친 판 하나(OverlayBox)'를 걷고, 같은 두 칸(같은 재생기)을 같은 자리에 겹친다 */
    const ra = rectOf(h, 'a');
    const rb = rectOf(h, 'b');
    assert(ra != null && rb != null && JSON.stringify(ra) === JSON.stringify(rb), '겹쳐 보기 — 두 칸이 같은 자리(재생기 그대로)');
    assert(h.find((n) => typeof n.type === 'function' && (n.type as { name: string }).name === 'OverlayBox').length === 0, '따로 그리는 겹친 판 없음');
    assert((h.panes().find((x) => x.props.side === 'b')!.props.layer as { role: string }).role === 'top', '위 겹은 B');
    (seg('영상 배치').props.onChange as (v: string) => void)('auto');
    h.render();
    (seg('크게 볼 영상').props.onChange as (v: string) => void)('focusB');
    h.render();
    assert(rectOf(h, 'a') == null && rectOf(h, 'b') != null, 'B 크게 — A 칸만 숨김');
    assert(keysOf(h) === k0, '크게 보기에서도 같은 칸');
    const last = h.schedules.at(-1);
    assert(!last || doc.activePair(last)?.rel === 0.5, '배치를 바꿔도 자리 그대로');
  });
  await check('IM06 도구 숨김 — 머리 · 타임라인 · 재생 · 도구 줄을 걷고 칸(재생기) 그대로 · 뒤로는 먼저 도구만 · 영상 누르기로도 돌아옴', async () => {
    const h = workbenchHarness({ initial: { ...splitDoc(0.5), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    h.stage(382, 560);
    const k0 = keysOf(h);
    const seeks0 = h.schedules.length;
    const tl = () => h.find((n) => n.type === 'Timeline').length;
    assert(tl() === 1, '처음엔 도구가 보임');
    h.press('도구 숨기기');
    assert(tl() === 0, '숨기면 타임라인 걷힘');
    assert(h.find((n) => n.props.accessibilityLabel === '더보기').length === 0, '머리 줄 걷힘');
    assert(h.find((n) => n.props.accessibilityLabel === '도구 보이기').length === 1, '도구 보이기 하나');
    assert(keysOf(h) === k0, '같은 칸(재생기)');
    h.stage(382, 760);
    {
      const ra = rectOf(h, 'a')!;
      const rb = rectOf(h, 'b')!;
      const bottom = Math.max(ra.y + ra.h, rb.y + rb.h);
      assert(ra.y === 0 && bottom === 760, `풀린 자리를 영상이 씀: ${JSON.stringify([ra, rb])}`);
    }
    h.press('도구 보이기');
    assert(tl() === 1, '도구 보이기로 돌아옴');
    h.press('도구 숨기기');
    h.back();
    assert(tl() === 1, '뒤로는 먼저 도구만 되살림(나가지 않음)');
    h.press('도구 숨기기');
    (h.panes().find((x) => x.props.side === 'a')!.props.onFocus as () => void)();
    h.render();
    assert(tl() === 1, '영상을 누르면 돌아옴');
    assert(h.schedules.length === seeks0 || doc.activePair(h.schedules.at(-1)!)?.rel === 0.5, '숨김은 자리를 바꾸지 않음');
    assert(!h.schedules.slice(seeks0).some((d) => JSON.stringify(d).includes('"hidden"')), '숨김은 저장하지 않음');
  });
  await check('UI04 · UI05 타임라인 · 재생 줄은 보기 · 맞추기 · 그리기 · 장면 · 메모에서 늘 있고, 메모 쓰기만 잠시 편집 줄로', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(0), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    const tl = () => h.find((n) => n.type === 'Timeline').length;
    const play = () => h.find((n) => n.props.accessibilityLabel === '함께 재생' || n.props.accessibilityLabel === '함께 멈춤').length;
    assert(tl() === 1 && play() === 1, '보기');
    for (const tool of ['그리기', '장면', '메모']) {
      h.press(tool);
      assert(tl() === 1, `${tool} — 타임라인`);
      assert(h.find((n) => n.type === 'Seg' && n.props.label === '재생 대상').length === 1, `${tool} — 함께 · A · B`);
      h.press('도구 끝내기');
    }
    h.press('메모');
    h.press(`A ${timing.clock(2)} 메모 쓰기`);
    assert(h.find((n) => n.type === 'NoteEditor').length === 1, '메모 쓰기 줄');
    assert(tl() === 0, '메모 쓰기 동안 타임라인 자리에 편집 줄');
    const ed = h.find((n) => n.type === 'NoteEditor')[0];
    (ed.props.onDraft as (t: string) => void)('쓰던 글');
    /* 닫기(쓴 글 남김) — 편집 줄의 닫기(고친 판) 또는 머리의 뒤로(고치기 전 판) */
    if (typeof ed.props.onClose === 'function') (ed.props.onClose as () => void)();
    else h.press('메모 쓰기 닫기, 쓴 글은 남겨요');
    h.render();
    assert(h.find((n) => n.type === 'NoteEditor').length === 0 && tl() === 1, '뒤로 — 편집 닫고 타임라인 돌아옴');
    h.press(`A ${timing.clock(2)} 메모 쓰기`);
    assert(h.find((n) => n.type === 'NoteEditor')[0].props.initial === '쓰던 글', '쓰던 글을 이어서');
  });
  await check('UI05 맞추기 — 같은 타임라인 · 재생 줄로 A → B 지정, 취소하면 보던 비교 그대로', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(1.25), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    h.press('맞추기 · 반복 · 배치');
    const again = inRows(h, (n) => n.props.label === '장면 다시 맞추기')[0];
    (again.props.onPress as () => void)();
    h.render();
    assert(h.find((n) => n.type === 'Timeline').length === 1, '맞추기에도 같은 타임라인');
    const tgt = h.find((n) => n.type === 'Seg' && n.props.label === '재생 대상')[0];
    assert(tgt && JSON.stringify((tgt.props.options as { value: string }[]).map((o) => o.value)) === '["a","b"]', '맞추기는 A · B 만');
    assert(h.find((n) => n.props.label === 'A 착지 지정').length === 1, 'A 지정 단추');
    (tgt.props.onChange as (v: string) => void)('b');
    h.render();
    assert(h.find((n) => n.props.label === 'B 착지 지정').length === 1, 'B 로 바꾸면 B 지정');
    h.press('맞추기 취소, 전에 보던 비교로');
    await h.settle();
    const last = h.schedules.at(-1)!;
    assert(JSON.stringify(doc.activePair(last)?.anchors) === '{"a":2,"b":3}' && doc.activePair(last)?.rel === 1.25, '기준 · 자리 그대로');
  });
  await check('UI07 뒤로는 작은 창 → 도구 → 나가기 차례 · 작은 창은 하나만', async () => {
    let exited = 0;
    const h = workbenchHarness({ initial: { ...pairDoc(0), revision: 2 } });
    void exited;
    h.ready('a');
    h.ready('b');
    await h.settle();
    h.press('장면');
    h.press('장면 결과, 구간 시간 · 2D 참고 측정');
    assert(inspector(h)?.props.title === '장면 결과', '결과 창');
    h.press(`A 착지, 안 짚음, 다른 장면 고르기`.replace('A 착지', 'A 앞발 착지'));
    assert(h.find((n) => n.type === 'Inspector').length === 1, '창은 하나(바꿔 엶)');
    assert(inspector(h)?.props.title === 'A 투구 장면', '장면 고르기 창');
    h.press('작은 창 닫기');
    assert(!inspector(h), '먼저 창');
    assert(h.find((n) => n.props.accessibilityLabel === '도구 끝내기').length === 1, '아직 도구 안');
    h.press('도구 끝내기');
    assert(h.find((n) => n.props.accessibilityLabel === '뒤로').length === 1, '그다음 도구');
    exited = 1;
  });
  await check('UI04 따로 옮기기(A · B)는 기준을 바꾸지 않고 함께로 돌아오면 A 자리에 다시 붙음', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(0.5), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    const tgt = () => h.find((n) => n.type === 'Seg' && n.props.label === '재생 대상')[0];
    (tgt().props.onChange as (v: string) => void)('b');
    h.render();
    const tl = h.find((n) => n.type === 'Timeline')[0];
    assert(tl.props.label === 'B 영상 장면', 'B 만 옮기는 타임라인');
    (tl.props.onSeek as (t: number) => void)(6);
    h.render();
    const n0 = h.seeks.length;
    (tgt().props.onChange as (v: string) => void)('both');
    h.render();
    assert(h.seeks.length === n0 + 1, '함께로 — 한 번 다시 붙임');
    const last = h.schedules.at(-1);
    assert(!last || JSON.stringify(doc.activePair(last)?.anchors) === '{"a":2,"b":3}', '기준 그대로');
  });
  await check('UI06 그리기 — 빠른 도구 넷 · 되돌리기 · 완료가 한 줄에, 완료하면 보기', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(0), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    h.press('그리기');
    for (const l of ['선', '각도', '자유선', '점', '되돌리기', '그리기 끝내기']) assert(h.find((n) => n.props.label === l || n.props.a11y === l || n.props.accessibilityLabel === l).length >= 1, `없음: ${l}`);
    h.press('그리기 끝내기');
    assert(h.find((n) => n.props.accessibilityLabel === '뒤로').length === 1, '보기로');
  });
}

/* ---- 그림 끌기 한 번 = 고침 한 번(UI06) — 실제 annotation-layer.tsx ---- */
async function runDrawTransaction(check: Check) {
  const chain: unknown = new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : () => chain), apply: () => chain });
  const layerHarness = (props: Record<string, unknown>) => {
    const h = hookRuntime();
    const m = {
      ...base(h.api),
      'react-native-gesture-handler': { Gesture: chain, GestureDetector: 'GestureDetector' },
      'react-native-svg': loose(),
      '~/compare/shape-edit': shapeEdit,
    };
    const { AnnotationLayer } = compile('native/src/compare/ui/annotation-layer.tsx', m) as { AnnotationLayer: (p: unknown) => Tree };
    let tree: Tree = null;
    const render = () => (tree = h.render(() => AnnotationLayer(props)));
    render();
    const surface = () => findAll(tree, (n) => typeof n.props.onResponderGrant === 'function')[0];
    return { render, surface, tree: () => tree };
  };
  const pane = { w: 300, h: 400, aspect: 0.75 };
  const line = { id: 'g1', sourceId: 'sa', span: { kind: 'always' }, geom: { kind: 'line', a: { u: 0.2, v: 0.2 }, b: { u: 0.8, v: 0.8 } }, color: '#fff', width: 3, metric: null, createdAt: '' };
  const ev = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y } });
  await check('UI06 고른 그림 끌기 — 끄는 동안 문서에 안 쓰고 손을 뗄 때 한 번(되돌리기 한 번)', async () => {
    const moves: unknown[] = [];
    const touches: unknown[] = [];
    const L = layerHarness({ pane, view: geometry.IDENTITY_VIEW, items: [line], drawing: true, tool: 'select', color: '#fff', width: 3, selectedId: 'g1', calibration: null, onCreate() {}, onMove: (id: string, g: unknown) => moves.push([id, g]), onSelect() {}, onView() {}, onNeedText() {}, onStroke() {}, onTouch: (p: unknown) => touches.push(p) });
    const s = L.surface();
    assert(s, '손가락 판');
    /* 선 가운데(통째 옮기기) */
    (s.props.onResponderGrant as (e: unknown) => void)(ev(150, 200));
    for (let i = 1; i <= 30; i++) (s.props.onResponderMove as (e: unknown) => void)(ev(150 + i, 200 + i));
    assert(moves.length === 0, `끄는 동안 문서에 ${moves.length}번`);
    (s.props.onResponderRelease as () => void)();
    assert(moves.length === 1, `손을 뗀 뒤 ${moves.length}번`);
    const g = (moves[0] as [string, { kind: string; a: { u: number } }])[1];
    near(g.a.u, 0.2 + 30 / 300, '30px 옮김(원본 좌표)', 1e-6);
    assert(touches.at(-1) === null && touches.length >= 2, '돋보기 자리 알림 · 뗄 때 null');
  });
  await check('UI06 손잡이(끝점)만 끌면 그 점만 옮김 · 두 손가락에 빼앗기면 아무것도 안 씀', async () => {
    const moves: unknown[] = [];
    const L = layerHarness({ pane, view: geometry.IDENTITY_VIEW, items: [line], drawing: true, tool: 'select', color: '#fff', width: 3, selectedId: 'g1', calibration: null, onCreate() {}, onMove: (id: string, g: unknown) => moves.push([id, g]), onSelect() {}, onView() {}, onNeedText() {}, onStroke() {} });
    const s = L.surface();
    const end = geometry.toScreen({ u: 0.8, v: 0.8 }, pane, geometry.IDENTITY_VIEW);
    (s.props.onResponderGrant as (e: unknown) => void)(ev(end.x + 10, end.y - 10));
    for (let i = 1; i <= 10; i++) (s.props.onResponderMove as (e: unknown) => void)(ev(end.x + 10 - i * 3, end.y - 10));
    (s.props.onResponderRelease as () => void)();
    const g = (moves[0] as [string, { a: { u: number; v: number }; b: { u: number; v: number } }])[1];
    assert(moves.length === 1 && g.a.u === 0.2 && g.a.v === 0.2 && Math.abs(g.b.u - 0.8) > 0.01, `끝점만: ${JSON.stringify(g)}`);
    (s.props.onResponderGrant as (e: unknown) => void)(ev(150, 200));
    (s.props.onResponderMove as (e: unknown) => void)(ev(170, 220));
    (s.props.onResponderTerminate as () => void)();
    assert(moves.length === 1, '빼앗긴 끌기는 버림');
  });
}

/* =========================================================================================
 * SS01~SS07 교정(2026-11-03 — docs/designs/sinker-pitch-video-single-screen-review-2026-11-03.md)
 * 실제 workbench.tsx · note-editor.tsx · side-playback.ts · transport-hook.ts 를 돌리고, 단추 폭 · 줄 높이는 fit.ts 의 실제 수치로 잰다.
 * 같은 시험을 고치기 전 판(COMPARE_UI_ROOT=<HEAD 사본>)으로 돌리면 실패한다(대장 문서에 결과). 기기의 실제 렌더 · 자판 · 한글 조합 · VoiceOver 는 아니다.
 * ========================================================================================= */
type El = { type: unknown; props: Record<string, unknown> };
const flat = (st: unknown): Record<string, unknown> => (Array.isArray(st) ? Object.assign({}, ...st.map(flat)) : st && typeof st === 'object' ? (st as Record<string, unknown>) : {});
const fsNow = () => fit.fsOf(dims.fontScale);
const kids = (n: El): El[] => {
  const c = n.props.children;
  return (Array.isArray(c) ? c.flat(3) : [c]).filter((x): x is El => !!x && typeof x === 'object' && 'type' in (x as object));
};
/** 부품 하나의 폭(실제 fit.ts 수치) — 모르는 것은 null */
function elW(n: El | null | undefined): number | null {
  if (!n) return null;
  const p = n.props ?? {};
  const fs = fsNow();
  if (n.type === 'IconBtn') return fit.iconW;
  if (n.type === 'TextBtn') return fit.textBtnW(String(p.label), fs) + (p.icon ? 22 : 0);
  if (n.type === 'Seg') return fit.segW((p.options as { label: string }[]).map((o) => o.label), fs);
  if (n.type === 'Pager') return (p.pages as number) > 1 ? 88 + Math.ceil(fit.textW(`${(p.page as number) + 1}/${p.pages}`, 13, fs) + 4) : 0;
  if (n.type === 'Press') return (flat(p.style).width as number) ?? 44;
  if (n.type === 'View') {
    const st = flat(p.style);
    if (st.flex === 1 && kids(n).length === 0) return 0;
    const ws = kids(n).map(elW);
    return ws.every((w) => w != null) ? ws.reduce((a: number, w) => a + (w as number), 0) + 4 * Math.max(0, ws.length - 1) : null;
  }
  if (n.type === 'Text') return Math.ceil(fit.textW(texts(p.children as Tree).join(''), 13, fs));
  return null;
}
/** 고치기 전 판의 도구 줄(ctxRow: 가로 · 높이 44 · 간격 4)의 폭 */
const legacyRows = (h: { find: (p: (n: El) => boolean) => El[] }) =>
  h.find((n) => n.type === 'View' && flat(n.props.style).flexDirection === 'row' && flat(n.props.style).minHeight === 44 && flat(n.props.style).gap === 4 && kids(n).some((k) => k.type === 'IconBtn' || k.type === 'TextBtn'));
const rowW = (n: El) => {
  const ws = kids(n).map((k) => elW(k) ?? 44);
  const real = kids(n).filter((k) => (elW(k) ?? 44) > 0).length;
  return ws.reduce((a, w) => a + w, 0) + 4 * Math.max(0, real - 1);
};
type BarEl = { props: { items: (fit.BarItem & { node: El; more?: { label: string } })[]; width: number; maxRows: number; label: string; preferCompact?: boolean } };
/** 도구 줄 하나 — 적어 둔 폭이 실제보다 작지 않고, 계획대로 놓으면 폭 안 · 꼭 있어야 할 단추가 보임 */
function checkBar(bar: BarEl, W: number, must: string[] = []) {
  const { items, maxRows, preferCompact } = bar.props;
  assert(bar.props.width <= W + 0.5, `${bar.props.label}: 줄 폭 어림 ${bar.props.width} 이 화면 ${W} 보다 큼`);
  const widths: Record<string, number> = {};
  for (const it of items) {
    const real = elW(it.node);
    if (real != null) assert(it.w + 0.5 >= real, `${bar.props.label}: '${it.key}' 폭을 ${it.w} 로 적었지만 실제 ${real}`);
    widths[it.key] = it.w;
  }
  const plan = fit.planBarAdaptive(items, { width: W, maxRows, preferCompact });
  for (const k of plan.compact) widths[k] = items.find((x) => x.key === k)!.compactW!;
  assert(fit.barFits(plan, widths), `${bar.props.label}: 폭 ${W} 안에 안 들어감 ${JSON.stringify(plan.lines)}`);
  for (const it of items) if (it.essential) assert(!plan.hidden.includes(it.key), `${bar.props.label}: 꼭 있어야 할 '${it.key}' 가 빠짐`);
  for (const k of plan.hidden) {
    const it = items.find((x) => x.key === k)!;
    assert(!it.overflow || !!it.more, `${bar.props.label}: '${k}' 를 더보기로 옮겼는데 동작이 없음`);
  }
  for (const k of must) assert(items.some((x) => x.key === k), `${bar.props.label}: '${k}' 없음`);
  return plan;
}
const sideWOf = (rootW: number) => Math.round(Math.min(240, Math.max(176, rootW * 0.3)));
const DEV = {
  se: { w: 320, h: 568, top: 20, bottom: 0 },
  s8: { w: 375, h: 667, top: 20, bottom: 0 },
  p14: { w: 390, h: 844, top: 47, bottom: 34 },
  max: { w: 430, h: 932, top: 59, bottom: 34 },
  seL: { w: 568, h: 320, top: 0, bottom: 0 },
  p14L: { w: 844, h: 390, top: 0, bottom: 21, left: 47, right: 47 },
} as const;
type Dev = { w: number; h: number; top: number; bottom: number; left?: number; right?: number };
const isLand = (d: Dev) => d.w > d.h && d.h < 520;
/** 아래 도구 줄이 받는 폭(세로) · 오른쪽 칸 폭(가로 폰) */
const barW = (d: Dev) => {
  const rootW = d.w - (d.left ?? 0) - (d.right ?? 0);
  return isLand(d) ? sideWOf(rootW) - 12 : rootW - 16;
};
/** 무대 높이 어림(화면 · 머리 · 줄들) — 시험의 무대 크기로 쓴다 */
const stageOf = (d: Dev, fs: number) => {
  const rootW = d.w - (d.left ?? 0) - (d.right ?? 0);
  const ctl = fit.ctlH(fs);
  const land = isLand(d);
  const h = d.h - d.top - d.bottom - ctl - 44 - ctl - (land ? 4 : 2 * ctl + 4 + 8);
  return { w: land ? rootW - sideWOf(rootW) : rootW, h: Math.max(60, h) };
};
const insp = (h: { find: (p: (n: El) => boolean) => El[] }) => h.find((n) => n.type === 'Inspector')[0] as unknown as { props: { rows: InspRowT[]; avail: number; width: number; title: string; startRow?: string | null } } | undefined;
/** 작은 창 — 덩어리마다 실제 높이로 쪽을 나누면 모든 쪽이 본문 안 · 모든 덩어리에 닿음 */
function checkInspector(ip: NonNullable<ReturnType<typeof insp>>, label: string) {
  const fs = fsNow();
  const ch = fit.inspChrome(fs);
  const bodyH = Math.max(44, ip.props.avail - ch.head - ch.pad);
  const bodyW = Math.max(44, ip.props.width - 20);
  const blocks = fit.expandRows(ip.props.rows as fit.InspRow<unknown>[], { width: bodyW, bodyH, fs });
  const heights = blocks.map((b) => {
    if (b.kind !== 'node') return b.h;
    const n = b.node as El;
    /* 큰 Wrap 한 덩어리(고치기 전) — 실제로 감기는 줄 수로 높이를 다시 잰다 */
    if (n && (n.type === 'Wrap' || (n.type === 'View' && flat(n.props.style).flexWrap === 'wrap'))) {
      const ws = kids(n).map((k) => elW(k) ?? 44);
      const lines = fit.flowLines(ws, bodyW, 6).length;
      return Math.max(b.h, lines * fit.ctlH(fs) + (lines - 1) * 6);
    }
    if (n && n.type === 'Seg') return Math.max(b.h, fit.segBlockH((n.props.options as { label: string }[]).map((o) => o.label), bodyW, fs, (n.props.maxH as number | undefined) ?? Infinity));
    return b.h;
  });
  const plan = fit.packPages(heights.map((h, i) => ({ h, keepWithNext: blocks[i].head })), bodyH, 8);
  assert(plan.oversize.length === 0, `${label}: 본문 ${bodyH} 보다 큰 덩어리 ${plan.oversize.map((i) => `${blocks[i].key}=${heights[i]}`).join(', ')}`);
  assert(fit.pagesFit(plan, heights), `${label}: 쪽이 본문을 넘음`);
  assert(plan.pages.flat().length === blocks.length, `${label}: 닿지 않는 덩어리`);
  return { plan, blocks, bodyH };
}

async function runRemediation(check: Check) {
  const eventsAll = { kneePeak: 1, handBreak: 1.3, footContact: 2, maxER: 2.2, release: 2.5, followThrough: 2.9 } as Record<string, number>;
  const draw = (h: ReturnType<typeof workbenchHarness>) => {
    const pa = h.panes().find((x) => x.props.side === 'a')!;
    (pa.props.draw as { onCreate: (g: unknown) => void }).onCreate({ kind: 'line', a: { u: 0.2, v: 0.2 }, b: { u: 0.8, v: 0.8 } });
    h.render();
  };
  const open = async (d: Dev, fs: number, initial = { ...pairDoc(0), revision: 2 }, start: 'compare' | 'align' = 'compare') => {
    setScreen({ ...d, fs });
    const h = workbenchHarness({ initial, start });
    h.ready('a');
    h.ready('b');
    await h.settle();
    const s = stageOf(d, fs);
    h.stage(s.w, s.h);
    const side = h.find((n) => n.props.testID === 'compare-side')[0];
    if (side) (side.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 0, width: sideWOf(d.w - (d.left ?? 0) - (d.right ?? 0)), height: d.h - d.top - d.bottom - fit.ctlH(fs) } } });
    h.render();
    return h;
  };

  /* ---------------- SS01 그리기 도구 줄 ---------------- */
  for (const [dn, d] of Object.entries(DEV) as [string, Dev][])
    for (const fs of [1, 1.6, 2])
      for (const sel of [false, true]) {
        await check(`SS01 그리기 도구 줄 ${dn} ${d.w}×${d.h} 글자${fs * 100}%${sel ? ' 고른 그림' : ''} — 폭 안 · 되돌리기 · 완료 · 모든 도구`, async () => {
          const h = await open(d, fs);
          h.press('그리기');
          if (sel) draw(h);
          const W = barW(d);
          const bars = h.find((n) => n.type === 'ToolBar' && String(n.props.label).startsWith('그리기')) as unknown as BarEl[];
          if (!bars.length) {
            const rows = legacyRows(h);
            assert(rows.length > 0, '도구 줄 없음');
            for (const r of rows) assert(rowW(r) <= W + 0.5, `줄 폭 ${rowW(r)} > ${W}`);
          } else {
            const keys = bars.flatMap((b) => b.props.items.map((x) => x.key));
            for (const k of ['tool', 'style', 'undo', 'done', 'target']) assert(keys.includes(k), `없음: ${k}`);
            for (const b of bars) checkBar(b, W);
            if (sel) assert(keys.includes('delete'), '고른 그림 지우기');
          }
          /* 지금 도구 → 도구 고르기 창에 열두 도구가 다 있다 */
          const chooser = h.find((n) => typeof n.props.onPress === 'function' && /^그리기 도구/.test(String(n.props.accessibilityLabel ?? n.props.label ?? '')))[0];
          assert(chooser, '도구 고르기 단추');
          (chooser.props.onPress as () => void)();
          h.render();
          const ip = insp(h);
          assert(ip, '도구 고르기 창');
          const labels = new Set(ip!.props.rows.flatMap((r) => [...(r.items ?? []).map((it) => (it.node as El).props?.label), ...findAll(r.node as Tree, (n) => typeof n.props.label === 'string').map((n) => n.props.label)]));
          const panels = panelsModule(hookRuntime().api) as unknown as { DRAW_TOOLS: { label: string }[] };
          for (const t of panels.DRAW_TOOLS) assert(labels.has(t.label), `도구 고르기에 없음: ${t.label}`);
          checkInspector(ip!, '도구 고르기');
          assert(h.find((n) => n.type === 'Timeline').length === 1, '타임라인 그대로');
        });
      }

  /* ---------------- SS02 작은 창 쪽 ---------------- */
  const longNote = '착지 때 앞무릎이 안으로 무너짐.\n\n릴리스 직전 팔꿈치 높이가 어깨선보다 낮음. '.repeat(6).slice(0, 480);
  const richDoc = () => {
    let d = pairDoc(0);
    d = doc.updateSource(d, 'sa', { events: eventsAll as never });
    d = doc.updateSource(d, 'sb', { events: Object.fromEntries(Object.entries(eventsAll).map(([k, v]) => [k, v + 1])) as never });
    d = doc.updatePair(d, { overlay: { on: true, opacity: 0.5, wipe: null, reg: { ...geometry.IDENTITY_REG } } });
    d = doc.addNote(d, { sourceId: 'sa', t: 2, text: longNote }, '2026-11-03T00:00:00.000Z', 'n1');
    d = doc.addNote(d, { sourceId: 'sb', t: 3, text: '짧은 메모' }, '2026-11-03T00:00:01.000Z', 'n2');
    return { ...d, revision: 2 };
  };
  const inspCases: { name: string; go: (h: ReturnType<typeof workbenchHarness>) => void }[] = [
    { name: '맞추기 · 보기(겹쳐 보기 자리 맞춤 여덟)', go: (h) => h.press('맞추기 · 반복 · 배치') },
    {
      name: '투구 장면 여섯 고르기',
      go: (h) => {
        h.press('장면');
        const chip = h.find((n) => typeof n.props.onPress === 'function' && /다른 장면 고르기$/.test(String(n.props.a11y ?? n.props.accessibilityLabel ?? '')))[0];
        (chip.props.onPress as () => void)();
        h.render();
      },
    },
    { name: '장면 모음', go: (h) => h.press('장면 모음') },
    {
      name: '긴 메모',
      go: (h) => {
        h.press('메모');
        const list = h.find((n) => typeof n.props.onPress === 'function' && /^메모 \d+개 보기$/.test(String(n.props.label ?? n.props.accessibilityLabel ?? '')))[0];
        (list.props.onPress as () => void)();
        h.render();
      },
    },
    {
      name: 'A 영상 정보',
      go: (h) => {
        sheetPick.label = 'A 영상 정보';
        h.press('더보기');
      },
    },
    { name: '재생', go: (h) => h.press(h.find((n) => /^재생 속도/.test(String(n.props.a11y ?? '')))[0]?.props.a11y as string) },
  ];
  for (const [dn, d] of Object.entries(DEV) as [string, Dev][])
    for (const fs of [1, 2])
      for (const c of inspCases) {
        await check(`SS02 작은 창 ${c.name} ${dn} 글자${fs * 100}% — 모든 쪽이 본문 안 · 영상 가림 한도`, async () => {
          const h = await open(d, fs, richDoc());
          c.go(h);
          await h.settle();
          const ip = insp(h);
          assert(ip, '작은 창 없음');
          checkInspector(ip!, c.name);
          const s = stageOf(d, fs);
          const inSide = h.find((n) => n.props.testID === 'compare-inspector-side').length > 0;
          if (!inSide) assert(ip!.props.avail <= s.h - fit.PREVIEW_MIN + 0.5, `영상을 너무 가림: 창 ${ip!.props.avail} / 무대 ${s.h}`);
          else assert(isLand(d), '세로 화면은 무대 위');
          assert(h.find((n) => n.type === 'Timeline').length === 1, '타임라인 그대로');
        });
      }
  await check('SS02 증거 재현 — 겹쳐 보기 여덟 동작이 본문 96 의 한 덩어리(144)로 남지 않음', async () => {
    const h = await open(DEV.p14, 1, richDoc());
    h.stage(264, 172);
    h.press('맞추기 · 반복 · 배치');
    await h.settle();
    checkInspector(insp(h)!, '겹쳐 보기');
  });

  /* ---------------- SS03 자판 위 메모 쓰기 ---------------- */
  const kbCases: { name: string; d: Dev; kb: number; fs: number }[] = [
    { name: '가로 390 · 자판 216', d: DEV.p14L, kb: 216, fs: 1 },
    { name: '가로 390 · 자판 216 · 글자 160%', d: DEV.p14L, kb: 216, fs: 1.6 },
    { name: '가로 390 · 예측 자판 260 · 글자 200%', d: DEV.p14L, kb: 260, fs: 2 },
    { name: '가로 320 · 자판 200', d: DEV.seL, kb: 200, fs: 1 },
    { name: '세로 568 · 자판 253 · 글자 200%', d: DEV.se, kb: 253, fs: 2 },
    { name: '세로 844 · 자판 336', d: DEV.p14, kb: 336, fs: 1 },
  ];
  const kbEvent = (d: Dev, kb: number) => ({ endCoordinates: { screenX: 0, screenY: d.h - kb, width: d.w, height: kb }, duration: 250, easing: 'keyboard' });
  const editorUse = (h: ReturnType<typeof workbenchHarness>, d: Dev, fs: number) => {
    const ed = h.find((n) => n.type === 'NoteEditor')[0];
    assert(ed, '편집 줄 없음');
    const holder = h.find((n) => n.type === 'View' && kids(n).some((k) => k === ed))[0];
    const pad = (flat(holder?.props.style).paddingBottom as number) ?? 0;
    const bar = h.find((n) => n.props.accessibilityLabel === '메모 쓰기 닫기, 쓴 글은 남겨요').length ? fit.ctlH(fs) : 0;
    const plan = ed.props.plan as fit.EditorPlan | undefined;
    const lines = plan?.lines ?? (ed.props.lines as number);
    const editorH = plan ? plan.height : 44 + Math.ceil(lines * 22 * fs + 16) + 44 + 12;
    return { ed, used: d.top + bar + editorH + pad, plan, lines };
  };
  for (const c of kbCases)
    await check(`SS03 ${c.name} — 저장 · 닫기 · 쓰는 줄이 자판 위에 다 들어감`, async () => {
      const h = await open(c.d, c.fs);
      h.press('메모');
      h.press(`A ${timing.clock(2)} 메모 쓰기`);
      emitKeyboard('keyboardWillShow', kbEvent(c.d, c.kb));
      emitKeyboard('keyboardWillChangeFrame', kbEvent(c.d, c.kb));
      h.render();
      const u = editorUse(h, c.d, c.fs);
      assert(u.used <= c.d.h + 0.5, `높이 ${u.used} > 화면 ${c.d.h}`);
      assert(!u.plan || (u.plan.fits && u.plan.lines >= 1), '편집 줄 계획');
      /* 자판 높이가 바뀌면(예측 줄 켬) 다시 맞춘다 */
      emitKeyboard('keyboardWillChangeFrame', kbEvent(c.d, c.kb + 44));
      h.render();
      const u2 = editorUse(h, c.d, c.fs);
      assert(u2.used <= c.d.h + 0.5, `자판이 커진 뒤 ${u2.used} > ${c.d.h}`);
      emitKeyboard('keyboardWillHide', { endCoordinates: { screenX: 0, screenY: c.d.h, width: c.d.w, height: 0 } });
      h.render();
      const u3 = editorUse(h, c.d, c.fs);
      assert(u3.lines >= u2.lines, '자판이 내려가면 줄이 다시 늘거나 같음');
    });

  /* ---------------- SS04 메모 쪽 · 한글 · 초안 ---------------- */
  const editorHarness = (initial: string, o: { width?: number; avail?: number; fs?: number } = {}) => {
    setScreen({ ...DEV.p14, fs: o.fs ?? 1 });
    rafToTimers();
    const h = hookRuntime();
    const m = {
      ...base(h.api),
      '~/compare/ui/tool-bar': { ToolBar: 'ToolBar' },
      '~/compare/ui/workspace-parts': partsModule(h.api),
      '~/compare/workspace-layout': wsLayout,
    };
    const { NoteEditor } = compile('native/src/compare/ui/note-editor.tsx', m) as { NoteEditor: (p: unknown) => Tree };
    const out = { saved: null as string | null, closed: 0, discarded: 0, drafts: [] as string[] };
    const plan = fit.planEditor({ avail: o.avail ?? 200, fs: fsNow() });
    const props = {
      title: 'A 0:02.00 메모',
      initial,
      plan,
      lines: plan.lines,
      width: o.width ?? 320,
      onDraft: (t: string) => out.drafts.push(t),
      onSave: (t: string) => (out.saved = t),
      onClose: () => out.closed++,
      onCancel: () => out.discarded++,
      onDiscard: () => out.discarded++,
    };
    let tree: Tree = null;
    const render = () => (tree = h.render(() => NoteEditor(props)));
    render();
    const input = () => findAll(tree, (n) => n.type === 'TextInput')[0];
    const pager = () => findAll(tree, (n) => n.type === 'Pager')[0];
    const pages = () => (pager()?.props.pages as number | undefined) ?? 1;
    const type = (v: string) => {
      (input().props.onChangeText as (t: string) => void)(v);
      render();
    };
    const goPage = (p: number) => {
      const pg = pager();
      if (pg) (pg.props.onPage as (n: number) => void)(p);
      render();
    };
    const all = () => {
      const out2: string[] = [];
      for (let p = 0; p < pages(); p++) {
        goPage(p);
        out2.push(String(input().props.value));
      }
      return out2;
    };
    const geom = { w: Math.max(40, props.width - 26), fontPx: 16 * fsNow(), lines: plan.lines };
    return { render, input, pager, pages, type, goPage, all, out, plan, geom, tree: () => tree, find: (p: (n: El) => boolean) => findAll(tree, p) };
  };
  await check('SS04 증거 재현 — 두 줄 칸에 12줄 붙여넣기: 쪽으로 나뉘고 이어 붙이면 원문 · 숨은 글 없음', async () => {
    const e = editorHarness('');
    const t = Array.from({ length: 12 }, (_, i) => `${i + 1}번째 줄 메모`).join('\n');
    e.type(t);
    assert(e.pages() >= Math.ceil(12 / Math.max(1, e.plan.lines)), `쪽 ${e.pages()} (줄 ${e.plan.lines})`);
    const parts = e.all();
    assert(parts.join('') === t, '이어 붙이면 원문');
    for (const v of parts) assert(fit.pageLines(v, e.geom.w, e.geom.fontPx) <= e.plan.lines, `칸보다 긴 쪽: ${JSON.stringify(v)}`);
    assert(e.input().props.maxLength == null || (e.input().props.maxLength as number) >= String(e.input().props.value).length, 'maxLength 로 얼리지 않음');
  });
  await check('SS04 빈 줄 많음 · 긴 한글 · 가운데 넣기 · 지우기 — 원문 그대로 · 쪽은 칸 안', async () => {
    const base0 = '첫 쪽 글입니다.\n\n\n둘째 단락은 길게 이어집니다 '.repeat(5);
    const e = editorHarness(base0);
    const before = e.all().join('');
    assert(before === base0, '처음 나눔이 원문');
    e.goPage(1);
    const v = String(e.input().props.value);
    const mid = Math.floor(v.length / 2);
    e.type(v.slice(0, mid) + '넣은글' + v.slice(mid));
    const after = e.all();
    const want = (() => {
      const p = fit.paginateNote(base0, e.geom);
      const at = p[1].start + mid;
      return base0.slice(0, at) + '넣은글' + base0.slice(at);
    })();
    assert(after.join('') === want, '가운데 넣기 뒤 원문');
    for (const x of after) assert(fit.pageLines(x, e.geom.w, e.geom.fontPx) <= e.plan.lines, '칸보다 긴 쪽');
    e.goPage(0);
    const v0 = String(e.input().props.value);
    e.type(v0.slice(3));
    assert(e.all().join('') === want.slice(3), '앞에서 지우기 뒤 원문');
  });
  await check('SS04 한글 조합 중에는 칸 글을 바꾸지 않고, 조합이 끝나면 넘친 글을 다음 쪽으로', async () => {
    const e = editorHarness('', { avail: 160 });
    for (const step of ['ㅎ', '하', '한', '한ㄱ', '한그', '한글']) {
      e.type(step);
      assert(String(e.input().props.value) === step, `조합 중 칸 글이 바뀜: ${step} → ${e.input().props.value}`);
    }
    /* 칸을 거의 채운 뒤 끝에서 조합 — 넘쳐도 그 순간엔 그대로, 빈칸(조합 끝)을 치면 나눈다 */
    const full = '가'.repeat(Math.floor((e.geom.w / e.geom.fontPx) * e.plan.lines) - 1);
    e.type(full);
    e.type(full + 'ㄴ');
    e.type(full + '나');
    assert(String(e.input().props.value).endsWith('나'), '조합 중인 글자가 칸에 남음');
    e.type(full + '나 ');
    const parts = e.all();
    assert(parts.join('') === full + '나 ', '원문');
    for (const x of parts) assert(fit.pageLines(x, e.geom.w, e.geom.fontPx) <= e.plan.lines, '조합이 끝난 뒤 칸 안');
  });
  await check('SS04 그림 문자 · 결합 문자 붙여넣기 — 쪽 경계가 글자를 가르지 않음', async () => {
    const e = editorHarness('');
    const t = 'ab😀👍🏽👨‍👩‍👧 가나'.repeat(20);
    e.type(t);
    const parts = e.all();
    assert(parts.join('') === t, '원문');
    for (const x of parts.slice(0, -1)) {
      const last = x.codePointAt(x.length - 1) ?? 0;
      assert(!(last >= 0xd800 && last <= 0xdbff) && !x.endsWith('‍'), `경계가 글자를 가름: ${JSON.stringify(x.slice(-3))}`);
    }
  });
  await check('SS04 글자 한도는 원문 전체에 — 600자 붙여넣기는 500자까지 · 저장은 줄바꿈 그대로', async () => {
    const e = editorHarness('');
    e.type('메'.repeat(600));
    assert(e.all().join('').length === doc.MAX_NOTE, `원문 ${e.all().join('').length}`);
    const e2 = editorHarness('');
    e2.type('첫 줄\n\n셋째 줄');
    const save = e2.find((n) => n.props.a11y === '메모 저장' || n.props.label === '저장')[0];
    (save.props.onPress as () => void)();
    assert(e2.out.saved === '첫 줄\n\n셋째 줄', `저장 글 ${JSON.stringify(e2.out.saved)}`);
  });
  await check('SS04 저장 · 닫기(초안 남김) · 버리기(초안 지움)가 따로', async () => {
    const e = editorHarness('쓰던 글');
    const close = e.find((n) => n.props.label === '메모 닫기, 쓴 글은 이 기기에 남겨요')[0];
    assert(close, '닫기(초안 남김) 단추');
    (close.props.onPress as () => void)();
    assert(e.out.closed === 1 && e.out.discarded === 0, '닫기는 버리지 않음');
    const disc = e.find((n) => n.props.a11y === '쓰던 메모 버리기')[0];
    assert(disc, '버리기 단추');
    alertPick.label = '버리기';
    (disc.props.onPress as () => void)();
    assert(e.out.discarded === 1, '버리기는 확인 뒤');
  });
  const memFs = () => {
    const files = new Map<string, string>();
    const f: storage.FsAdapter = {
      read: async (n) => files.get(n) ?? null,
      write: async (n, t) => void files.set(n, t),
      move: async (a, b) => void (files.set(b, files.get(a) ?? ''), files.delete(a)),
      remove: async (n) => void files.delete(n),
      list: async () => [...files.keys()],
    };
    return { f, files };
  };
  await check('SS04 초안 저장소 — 다시 켜도 남고 · 다른 계정은 못 보고 · 깨진 파일은 빈 목록 · 비교를 지우면 같이', async () => {
    const { f, files } = memFs();
    const a = noteDrafts.createDraftStore(f, 'u1', { delayMs: 0 });
    const key = noteDrafts.draftKey('w1', { sourceId: 'sa', t: 2 });
    a.set({ key, docId: 'w1', sourceId: 'sa', t: 2, noteId: null, text: '첫 줄\n\n둘째', caret: 3, at: '2026-11-03T00:00:00.000Z' });
    await a.flush();
    const b = noteDrafts.createDraftStore(f, 'u1');
    await b.load();
    assert(b.get(key)?.text === '첫 줄\n\n둘째' && b.get(key)?.caret === 3, '다시 켜도 초안 · 커서');
    const other = noteDrafts.createDraftStore(f, 'u2');
    await other.load();
    assert(other.list('w1').length === 0, '다른 계정 파일 주인은 안 읽음');
    files.set(noteDrafts.DRAFT_FILE, '{깨짐');
    const c = noteDrafts.createDraftStore(f, 'u1');
    await c.load();
    assert(c.list('w1').length === 0, '깨진 파일은 빈 목록');
    b.removeDoc('w1');
    await b.flush();
    const d2 = noteDrafts.createDraftStore(f, 'u1');
    await d2.load();
    assert(d2.list('w1').length === 0, '비교 지우면 초안도');
  });
  await check('SS04 화면 — 쓰다 닫으면 기기에 남고 새로 연 화면(앱 다시 켬)에서 이어 쓰고, 버리기만 지움', async () => {
    const { f } = memFs();
    const store1 = noteDrafts.createDraftStore(f, 'u1', { delayMs: 0 });
    setScreen(DEV.p14);
    const h = workbenchHarness({ initial: { ...pairDoc(0), revision: 2 }, drafts: store1 });
    h.ready('a');
    h.ready('b');
    await h.settle();
    h.press('메모');
    h.press(`A ${timing.clock(2)} 메모 쓰기`);
    const ed1 = h.find((n) => n.type === 'NoteEditor')[0];
    (ed1.props.onDraft as (t: string, c: number) => void)('쓰던 글', 4);
    if (typeof ed1.props.onClose === 'function') (ed1.props.onClose as () => void)();
    else h.press('메모 쓰기 닫기, 쓴 글은 남겨요');
    h.render();
    await store1.flush();
    const store2 = noteDrafts.createDraftStore(f, 'u1', { delayMs: 0 });
    await store2.load();
    const h2 = workbenchHarness({ initial: { ...pairDoc(0), revision: 2 }, drafts: store2 });
    h2.ready('a');
    h2.ready('b');
    await h2.settle();
    h2.press('메모');
    h2.press(`A ${timing.clock(2)} 메모 쓰기`);
    const ed = h2.find((n) => n.type === 'NoteEditor')[0];
    assert(ed.props.initial === '쓰던 글', `다시 켠 뒤 초안: ${JSON.stringify(ed.props.initial)}`);
    (ed.props.onDiscard as () => void)();
    h2.render();
    assert(store2.list('w1').length === 0, '버리기는 초안을 지움');
  });

  /* ---------------- SS05 생명주기 · SS06 대상 ---------------- */
  const playBtn = (h: ReturnType<typeof workbenchHarness>) =>
    h.find((n) => n.type === 'Press' && !!n.props.accessibilityState && 'busy' in (n.props.accessibilityState as object) && /재생|멈춤/.test(String(n.props.accessibilityLabel)))[0];
  const pressPlay = (h: ReturnType<typeof workbenchHarness>) => {
    const b = playBtn(h);
    assert(b, '재생 단추');
    (b.props.onPress as () => void)();
    h.render();
  };
  const chooseTarget = (h: ReturnType<typeof workbenchHarness>, t: 'both' | 'a' | 'b') => {
    const seg = h.find((n) => n.type === 'Seg' && n.props.label === '재생 대상')[0];
    assert(seg, '재생 대상 고르기');
    (seg.props.onChange as (v: string) => void)(t);
    h.render();
  };
  for (const mode of ['align', 'compare'] as const)
    for (const side of ['a', 'b'] as const)
      for (const ev of ['background', 'blur', 'unmount', 'source'] as const)
        await check(`SS05 ${mode === 'align' ? '맞추기' : '비교'} 중 ${side.toUpperCase()} 만 재생 → ${ev} — 두 재생기 다 멈춤 · 저절로 다시 안 틂`, async () => {
          const h = await open(DEV.p14, 1, { ...pairDoc(0.5), revision: 2 }, mode);
          if (mode === 'align') chooseTarget(h, side);
          else chooseTarget(h, side);
          pressPlay(h);
          const p = h.players[side]!;
          assert(p.playing, `${side.toUpperCase()} 재생 시작`);
          assert(!h.players[side === 'a' ? 'b' : 'a']!.playing, '다른 쪽은 그대로 멈춤');
          if (ev === 'background') for (const f of appState.listeners) f('background');
          if (ev === 'blur') focusState.v = false;
          if (ev === 'unmount') h.unmount();
          if (ev === 'source') h.ready(side, 10, null, makePlayer());
          if (ev !== 'unmount') await h.settle();
          assert(!p.playing, `${ev} 뒤에도 ${side.toUpperCase()} 재생 중`);
          assert(!h.players.a!.playing && !h.players.b!.playing, '둘 다 멈춤');
          if (ev === 'background') {
            for (const f of appState.listeners) f('active');
            await h.settle();
            assert(!h.players.a!.playing && !h.players.b!.playing, '돌아와도 저절로 안 틂');
          }
        });
  await check('SS05 함께 재생 훅 — 멈춘(idle) 때 따로 재생 중인 재생기도 뒤로 가면 멈춤', async () => {
    const t = transportHarness({ ma: 0, mb: 0, range: { min: 0, max: 10 }, loop: null, normalized: null });
    await t.settle();
    t.pa.play();
    t.pb!.play();
    for (const f of appState.listeners) f('background');
    await t.settle();
    assert(!t.pa.playing && !t.pb!.playing, '둘 다 멈춤');
    t.unmount();
  });
  await check('SS06 A 고르고 재생 → A 만 · 한 장면 · 옮기기도 A 만, 함께로 안 바뀜', async () => {
    const h = await open(DEV.p14, 1, { ...pairDoc(0.5), revision: 2 });
    chooseTarget(h, 'a');
    pressPlay(h);
    assert(h.players.a!.playing && !h.players.b!.playing, 'A 만 재생');
    const seg = h.find((n) => n.type === 'Seg' && n.props.label === '재생 대상')[0];
    assert(seg.props.value === 'a', `대상이 바뀜: ${seg.props.value}`);
    pressPlay(h);
    assert(!h.players.a!.playing, '다시 누르면 A 멈춤');
    const b0 = h.players.b!.currentTime;
    h.press('A 다음 장면');
    assert(h.players.b!.currentTime === b0, '한 장면 이동은 A 만');
    const tl = h.find((n) => n.type === 'Timeline')[0];
    assert(tl.props.label === 'A 영상 장면', `타임라인 ${tl.props.label}`);
  });
  await check('SS06 B 로 옮긴 뒤 함께 — B 자리를 기준으로 다시 붙임(기준 장면 그대로)', async () => {
    const h = await open(DEV.p14, 1, { ...pairDoc(0.5), revision: 2 });
    chooseTarget(h, 'b');
    pressPlay(h);
    assert(h.players.b!.playing && !h.players.a!.playing, 'B 만 재생');
    (h.find((n) => n.type === 'Timeline')[0].props.onSeek as (t: number) => void)(6);
    h.render();
    chooseTarget(h, 'both');
    near(h.seeks.at(-1) ?? NaN, 6 - 3, 'B 6초 − B 기준 3초 = 상대 3초');
    const last = h.schedules.at(-1);
    assert(!last || JSON.stringify(doc.activePair(last)?.anchors) === '{"a":2,"b":3}', '기준 그대로');
  });
  await check('SS06 동작 길이 맞춤에서 B 기준으로 함께 — 늘인 축으로 되돌려 A 자리', async () => {
    let d = pairDoc(0, { a: 2, b: 3 });
    d = doc.updateSource(d, 'sa', { events: { kneePeak: 1, footContact: 2, release: 2.5 } });
    d = doc.updateSource(d, 'sb', { events: { kneePeak: 1.5, footContact: 3, release: 3.6 } });
    d = doc.updatePair(d, { mode: 'normalized', semantic: 'footContact' });
    const h = await open(DEV.p14, 1, { ...d, revision: 2 });
    chooseTarget(h, 'b');
    (h.find((n) => n.type === 'Timeline')[0].props.onSeek as (t: number) => void)(3.3);
    h.render();
    chooseTarget(h, 'both');
    const m = timing.buildNormalized([1, 2, 2.5], [1.5, 3, 3.6]);
    assert(m.ok, 'map');
    const u = (() => {
      const b = [1.5, 3, 3.6];
      for (let i = 0; i < b.length - 1; i++) if (3.3 <= b[i + 1]) return i + (3.3 - b[i]) / (b[i + 1] - b[i]);
      return 2;
    })();
    const ta = m.ok ? timing.normalizedTimes(m.map, u).a : NaN;
    near(h.seeks.at(-1) ?? NaN, ta - 2, 'B 3.3초 → A 자리 − A 기준');
  });
  await check('SS06 좁은 화면 — 대상은 누를 때마다 도는 단추가 아니라 고르는 창(지금 대상이 보임)', async () => {
    const h = await open(DEV.se, 1, { ...pairDoc(0.5), revision: 2 });
    const btn = h.find((n) => typeof n.props.onPress === 'function' && /^재생 대상/.test(String(n.props.a11y ?? n.props.accessibilityLabel ?? '')) && n.type !== 'Seg')[0];
    assert(btn, '대상 단추');
    assert(String(btn.props.label ?? '').includes('함께'), `지금 대상이 보임: ${btn.props.label}`);
    (btn.props.onPress as () => void)();
    h.render();
    const ip = insp(h);
    assert(ip && /재생 대상/.test(ip.props.title), '대상 고르기 창');
    const seg = h.find((n) => n.type === 'Seg' && n.props.label === '재생 대상')[0];
    assert(seg && seg.props.value === 'both', '누르기만으로 대상이 바뀌지 않음');
    (seg.props.onChange as (v: string) => void)('b');
    h.render();
    const btn2 = h.find((n) => typeof n.props.onPress === 'function' && /^재생 대상/.test(String(n.props.a11y ?? '')))[0];
    assert(String(btn2?.props.label ?? '').includes('B'), 'B 로 바뀜이 보임');
  });
  await check('SS06 재생 줄 — 320 · 375 · 430 × 글자 100 · 200% 폭 안(대상 · 이전 · 재생 · 다음 · 속도)', async () => {
    for (const d of [DEV.se, DEV.s8, DEV.max] as Dev[])
      for (const fs of [1, 2]) {
        const h = await open(d, fs);
        const bar = h.find((n) => n.type === 'ToolBar' && n.props.label === '재생 줄')[0] as unknown as BarEl | undefined;
        assert(bar, '재생 줄');
        checkBar(bar!, d.w - (d.left ?? 0) - (d.right ?? 0) - 16, ['target', 'prev', 'play', 'next', 'rate']);
      }
  });

  /* ---------------- SS07 큰 글씨 ---------------- */
  await check('SS07 비교 화면 글자는 2배까지 따른다(1.3 · 1.4 상한 없음) — 머리 · 도구 · 작은 창', async () => {
    const h = await open(DEV.p14, 2, richDoc());
    const capped = (where: string) => {
      const bad = h.find((n) => n.type === 'Text' && typeof n.props.maxFontSizeMultiplier === 'number' && (n.props.maxFontSizeMultiplier as number) < fit.FS_MAX);
      assert(bad.length === 0, `${where}: 글자 상한 ${bad.map((n) => `${n.props.maxFontSizeMultiplier} '${texts(n.props.children as Tree).join('')}'`).join(', ')}`);
    };
    capped('보기');
    for (const t of ['그리기', '장면', '메모']) {
      h.press(t);
      capped(t);
      h.press('도구 끝내기');
    }
  });
  await check('SS07 작은 부품(단추 · 고르기 · 쪽 · 제목) 글자는 2배까지', () => {
    setScreen({ ...DEV.p14, fs: 2 });
    const rt = hookRuntime();
    const real = compile('native/src/compare/ui/workspace-parts.tsx', { ...base(rt.api), 'expo-image': loose(), '~/compare/workspace-layout': wsLayout }) as Record<string, (p: unknown) => Tree>;
    const trees = [
      real.TextBtn({ label: '반복 구간 고치기', onPress() {} }),
      real.Seg({ label: '배치', value: 'a', onChange() {}, options: [{ value: 'a', label: '자동' }, { value: 'b', label: '위아래' }] }),
      real.Pager({ page: 0, pages: 3, onPage() {}, label: '쪽' }),
      real.HeadText({ text: '제목' }),
      real.SubText({ text: '보조 글' }),
    ];
    for (const t of trees) {
      const bad = findAll(t, (n) => n.type === 'Text' && typeof n.props.maxFontSizeMultiplier === 'number' && (n.props.maxFontSizeMultiplier as number) < fit.FS_MAX);
      assert(bad.length === 0, `상한 ${bad.map((n) => n.props.maxFontSizeMultiplier).join(',')}`);
    }
  });

  /* ---------------- 처음 쓰기 — 앞발 착지 기본 · A 다음 B · 멈춘 채 비교 ---------------- */
  await check('처음 맞추기 — 앞발 착지가 기본, A 지정 뒤 B 로, 둘 다 지정하면 "비교 보기" 하나 · 누르면 멈춘 채 기준 장면', async () => {
    const d0 = doc.updatePair(pairDoc(0), { anchors: { a: null, b: null } });
    const h = await open(DEV.p14, 1, { ...d0, revision: 1 }, 'align');
    const sem = h.find((n) => n.type === 'Seg' && n.props.label === '기준 뜻')[0];
    assert(sem?.props.value === 'footContact', '앞발 착지 기본');
    h.press('A 착지 지정');
    assert(h.find((n) => n.props.label === 'B 착지 지정').length === 1, 'A 다음 B');
    h.press('B 착지 지정');
    const go = h.find((n) => n.type === 'TextBtn' && n.props.label === '비교 보기')[0];
    assert(!!go && !!go.props.primary, '비교 보기(주 단추)');
    assert(!h.find((n) => n.type === 'TextBtn' && !!n.props.primary && n.props.label !== '비교 보기').length, '주 단추는 하나');
    (go.props.onPress as () => void)();
    await h.settle();
    assert(!h.players.a!.playing && !h.players.b!.playing, '멈춘 채');
    assert(h.find((n) => n.type === 'Timeline')[0]?.props.label === '기준 장면부터 함께 재생할 위치', '함께 보기');
  });
}
