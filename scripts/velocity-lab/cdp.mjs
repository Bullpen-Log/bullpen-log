/**
 * 구속 측정 실험실 — 헤드리스 크롬에 저장소 엔진(lib/velocity-engine)을 올려 영상 파일을 잰다. 개발 서버 · 임시 경로 없이 돈다
 * (엔진 파일을 타입만 벗겨 blob 모듈로 쪽에 올린다). 쓰는 법은 README.md.
 *
 *   const c = await open({ port, engine });
 *   await c.setFile(영상 경로);
 *   await c.evaluate('…쪽 안에서 돌 코드…');   // window.__m['detect' | 'analyze-video' | …], window.__open()
 *   await c.close();
 *
 * 작업 폴더(영상 · 결과 · 크롬 프로필)는 저장소 밖 ~/bullpen-velocity-lab — 영상은 개인 것이라 깃에 올리지 않는다.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import http from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const REPO = resolve(import.meta.dirname, '../..');
/** 작업 폴더 — 환경변수 VELOCITY_LAB 로 바꿀 수 있다 */
export const LAB = process.env.VELOCITY_LAB ?? join(homedir(), 'bullpen-velocity-lab');
const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 명령줄 '--이름=값' */
export const argOf = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ??
  fallback;

/** 엔진 파일 → 쪽에 올릴 모듈(이름 → JS, 가져오는 곳은 '@@이름@@' 자리표시) */
function engineModules(dir) {
  const mods = {};
  /* 워커 파일은 뺀다 — 올리는 순간 워커 코드가 쪽에서 돈다 */
  for (const f of readdirSync(dir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.worker.ts')
  )) {
    const src = readFileSync(join(dir, f), 'utf8').replace(/^'use client';/m, '');
    let js;
    try {
      js = stripTypeScriptTypes(src, { mode: 'strip' });
    } catch {
      continue; /* 지울 수 없는 문법(매개변수 속성)을 쓰는 파일 — 영상 길에서 안 쓴다 */
    }
    if (/from\s+'@\//.test(js)) continue; /* 별칭(@/)을 쓰는 파일(dual-capture) */
    mods[f.replace(/\.ts$/, '')] = js.replace(
      /from\s+'\.\/([\w-]+)\.ts'/g,
      (_, n) => `from '@@${n}@@'`
    );
  }
  const order = [];
  const deps = (n) => [...mods[n].matchAll(/'@@([\w-]+)@@'/g)].map((m) => m[1]);
  const visit = (n, stack = []) => {
    if (order.includes(n) || !mods[n]) return;
    if (stack.includes(n))
      throw new Error(`엔진 모듈이 서로 돈다: ${[...stack, n].join(' > ')}`);
    for (const d of deps(n)) visit(d, [...stack, n]);
    order.push(n);
  };
  for (const n of Object.keys(mods)) visit(n);
  return order.map((n) => [n, mods[n]]);
}

export async function open({
  port = 9461,
  engine = join(REPO, 'lib', 'velocity-engine'),
} = {}) {
  if (!existsSync(CHROME))
    throw new Error(
      `크롬을 못 찾았어요: ${CHROME} — 환경변수 CHROME_PATH 로 알려 주세요.`
    );
  mkdirSync(LAB, { recursive: true });
  const web = port + 1000;
  /* 빈 쪽 하나 — 파일 고르는 칸만 */
  const server = http
    .createServer((_, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><input type="file">');
    })
    .listen(web, '127.0.0.1');
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${join(LAB, `chrome-prof-${port}`)}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=800,600',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  let target;
  for (let i = 0; i < 150 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {
      /* 아직 안 떴다 */
    }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error('크롬이 안 떴어요');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(JSON.stringify(msg.error)));
      else res(msg.result);
    }
  });
  const send = (method, params = {}) => {
    const myId = ++id;
    ws.send(JSON.stringify({ id: myId, method, params }));
    return new Promise((res, rej) => pending.set(myId, { res, rej }));
  };
  /** 쪽 안에서 식을 돌리고(약속이면 기다려) 값을 받는다 */
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 1200));
    return r.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${web}/` });
  for (let i = 0; i < 100; i++) {
    await sleep(200);
    try {
      if (await evaluate('!!document.querySelector("input[type=file]")')) break;
    } catch {
      /* 쪽이 아직 */
    }
  }
  const version = await evaluate(`(async () => {
    const list = ${JSON.stringify(engineModules(resolve(engine)))};
    const urls = {};
    window.__m = {};
    for (const [n, code0] of list) {
      let code = code0;
      for (const d of Object.keys(urls)) code = code.split("'@@" + d + "@@'").join("'" + urls[d] + "'");
      urls[n] = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      window.__m[n] = await import(urls[n]);
    }
    /* 탐침 도우미 — 영상 열기 · 장면 꺼내기(엔진과 같은 방식: 되감고 그려 밝기로, 짧은 변 720) */
    window.__open = async () => {
      const file = document.querySelector('input[type=file]').files[0];
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.src = URL.createObjectURL(file);
      await new Promise((res) => { if (v.readyState >= 2) return res(); v.onloadeddata = res; v.onerror = res; setTimeout(res, 20000); });
      const scale = Math.min(1, 720 / Math.min(v.videoWidth, v.videoHeight));
      const width = Math.round(v.videoWidth * scale), height = Math.round(v.videoHeight * scale);
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      const g = c.getContext('2d', { willReadFrequently: true });
      const seek = async (t) => { v.currentTime = t; await new Promise((res) => { v.onseeked = res; setTimeout(res, 5000); }); };
      const rgba = async (t) => { await seek(t); g.drawImage(v, 0, 0, width, height); return g.getImageData(0, 0, width, height); };
      const luma = async (t) => window.__m['detect'].toLuma((await rgba(t)).data, width, height);
      return { file, v, width, height, seek, rgba, luma, canvas: c, ctx: g };
    };
    return window.__m['version'].VELOCITY_ENGINE_VERSION;
  })()`);
  /** 쪽의 파일 칸에 영상을 넣는다 */
  const setFile = async (path) => {
    const doc = await send('DOM.getDocument', { depth: -1 });
    const q = await send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: 'input[type=file]',
    });
    await send('DOM.setFileInputFiles', {
      files: [resolve(path).replace(/\\/g, '/')],
      nodeId: q.nodeId,
    });
    await sleep(100);
  };
  const close = async () => {
    await Promise.race([send('Browser.close').catch(() => {}), sleep(800)]);
    ws.close();
    chrome.kill();
    server.close();
  };
  return { send, evaluate, setFile, close, version };
}
