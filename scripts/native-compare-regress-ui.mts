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

function compile(file: string, mocks: Record<string, unknown>) {
  const src = fs.readFileSync(ROOT + file, 'utf8');
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

const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
const appState = { listeners: [] as ((s: string) => void)[] };
/* 동작 시트에서 고를 글(다음 한 번) */
const sheetPick: { label: string | null } = { label: null };
const focused = true;
const rn = {
  StyleSheet: { create: <T,>(s: T) => s, absoluteFill: {}, hairlineWidth: 1 },
  AppState: {
    addEventListener: (_: string, f: (s: string) => void) => {
      appState.listeners.push(f);
      return { remove: () => void (appState.listeners = appState.listeners.filter((x) => x !== f)) };
    },
  },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  AccessibilityInfo: { announceForAccessibility() {} },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  Alert: { alert() {} },
  ActionSheetIOS: {
    showActionSheetWithOptions(o: { options: string[] }, cb: (i: number) => void) {
      const i = o.options.indexOf(sheetPick.label ?? '');
      sheetPick.label = null;
      if (i >= 0) cb(i);
    },
  },
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
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
  'expo-router': { Stack: { Screen: 'Screen' }, useIsFocused: () => focused, router: loose() },
  'expo-video': { VideoView: 'VideoView' },
  'expo-screen-orientation': loose(),
  'expo-haptics': loose(),
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
  '~/compare/doc': doc,
  '~/compare/timing': timing,
  '~/compare/transport': machine,
  '~/compare/annotations': annotations,
  '~/compare/geometry': geometry,
  '~/compare/pitch-events': events,
  '~/compare/storage': storage,
  '~/videos/compare-math': nav,
  '~/videos/player-parts': { playerCall, Scrubber: 'Scrubber', ScrubLabels: 'ScrubLabels' },
});

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
}

/* ---- Workbench 하네스 ---- */
type Tree = { type: unknown; props?: Record<string, unknown> } | Tree[] | null | undefined | string | number | boolean;
function findAll(x: Tree, pred: (n: { type: unknown; props: Record<string, unknown> }) => boolean, out: { type: unknown; props: Record<string, unknown> }[] = []) {
  if (!x || typeof x !== 'object') return out;
  if (Array.isArray(x)) {
    for (const y of x) findAll(y, pred, out);
    return out;
  }
  const n = x as { type: unknown; props: Record<string, unknown> };
  if (n.props && pred(n)) out.push(n);
  if (n.props) for (const v of Object.values(n.props)) if (v && typeof v === 'object') findAll(v as Tree, pred, out);
  return out;
}

type WbOpts = { initial: doc.ComparisonDocument; start?: 'pick' | 'align' | 'compare'; confirm?: (rel: number) => Promise<boolean>; drift?: number[] };
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
  };
  let lastClock: { ma: number; mb: number | null } | null = null;
  const m = {
    ...base(h.api),
    '@/lib/my-videos': {},
    '~/compare/store': store,
    '~/compare/storage': { ...storage, createAutosaver: () => ({ base() {}, schedule: (d: doc.ComparisonDocument) => void schedules.push(d), flush: async () => {}, stop() {}, dirty: false }) },
    '~/compare/ui/pane': { Pane: 'Pane' },
    '~/compare/ui/panels': loose({ exportPlanFor: () => null }),
    '~/compare/ui/source-picker': { SourcePicker: 'SourcePicker' },
    '~/compare/source-pick': sourcePick,
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
  const info = (dur = 10, error: unknown = null) => ({ player: makePlayer(), ready: !error, duration: dur, fps: 30, aspect: 9 / 16, codec: null, width: 1080, height: 1920, error });
  return {
    render,
    get tree() {
      return tree;
    },
    panes: () => findAll(tree, (n) => n.type === 'Pane'),
    ready(side: 'a' | 'b', dur = 10, error: unknown = null) {
      const p = this.panes().find((x) => x.props.side === side);
      assert(p, `${side} 칸 없음`);
      (p!.props.onInfo as (i: unknown) => void)(info(dur, error));
      render();
    },
    schedules,
    seeks,
    confirms,
    clock: () => lastClock,
    find: (pred: (n: { type: unknown; props: Record<string, unknown> }) => boolean) => findAll(tree, pred),
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
async function runWorkbench(check: Check) {
  await check('F08 그리기 도구를 켜도 화면은 굴러감 — 손가락으로 그리는 동안만 멈춤', async () => {
    const h = workbenchHarness({ initial: { ...pairDoc(0), revision: 2 } });
    h.ready('a');
    h.ready('b');
    await h.settle();
    const chip = h.find((n) => n.type === 'Chip' && n.props.label === '그리기')[0];
    assert(chip, '그리기 칩');
    (chip.props.onPress as () => void)();
    await h.settle();
    const scroll = () => h.find((n) => n.type === 'ScrollView' && 'scrollEnabled' in n.props)[0];
    assert(scroll()?.props.scrollEnabled === true, '도구만 켜면 굴림 그대로');
    const pa = h.panes().find((x) => x.props.side === 'a')!;
    const draw = pa.props.draw as { drawing: boolean; onStroke: (b: boolean) => void };
    assert(draw.drawing, '그리기 켜짐');
    draw.onStroke(true);
    h.render();
    assert(scroll()?.props.scrollEnabled === false, '그리는 동안 멈춤');
    draw.onStroke(false);
    h.render();
    assert(scroll()?.props.scrollEnabled === true, '다 그리면 다시 굴림');
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
    const chip = h.find((n) => n.type === 'Chip' && n.props.label === '맞추기')[0];
    (chip.props.onPress as () => void)();
    await h.settle();
    const all = texts(h.tree);
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
    const single = h.find((n) => typeof n.props.onAdd === 'function')[0];
    assert(single, '한 영상 보기의 비교 영상 추가');
    (single.props.onAdd as () => void)();
    h.render();
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
