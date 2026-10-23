/**
 * 배포된 계산기 확인 — 실제 사이트의 /velocity-engine 을 헤드리스 크롬으로 열고, 아이폰 앱(native/src/velocity/engine.tsx)이 하는 그대로
 * 옵션 · 클립 조각(base64 1MB)을 보내 결과를 받는다. 현장에 나가기 전에 '배포된 그 계산기'가 앱 클립을 재는지 본다(2026-10-22).
 * DB 는 안 쓴다(계산기는 재기만 한다).
 *
 *   node scripts/velocity-lab/prod-smoke.mjs [--url=https://bullpen-log.vercel.app/velocity-engine] [--live=2026-10-21] [--auto=1]
 *
 * 클립은 download.mjs --live 로 받은 앱 카메라 클립(<날짜>/live, manifest.json · .analysis.json) — 공 알림 시각 둘레(앱 BALL_RANGE)만 잰다.
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LAB, argOf } from './cdp.mjs';

const URL_ = argOf('url', 'https://bullpen-log.vercel.app/velocity-engine');
const DATES = argOf('live', '2026-10-21').split(',');
const AUTO = argOf('auto', '1') === '1';
const PORT = Number(argOf('port', 9701));
const CHROME = process.env.CHROME_PATH;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* 앱 capture.ts 와 같은 값 */
const BALL_RANGE = [0.25, 1.45];
const PART = 1024 * 1024;

mkdirSync(LAB, { recursive: true });
const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(LAB, `chrome-prof-${PORT}`)}`, '--no-first-run', 'about:blank'],
  { stdio: 'ignore' }
);
let target;
for (let i = 0; i < 150 && !target; i++) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
  } catch {
    /* 아직 */
  }
  if (!target) await sleep(200);
}
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
  const my = ++id;
  ws.send(JSON.stringify({ id: my, method, params }));
  return new Promise((res, rej) => pending.set(my, { res, rej }));
};
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result?.value;
};
await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'window.__out = []; window.ReactNativeWebView = { postMessage: (s) => window.__out.push(JSON.parse(s)) };',
});
await send('Page.navigate', { url: URL_ });
let ready = false;
for (let i = 0; i < 100 && !ready; i++) {
  await sleep(300);
  ready = await evaluate("(window.__out || []).some((m) => m.t === 'ready')").catch(() => false);
}
if (!ready) {
  console.error('계산기가 ready 를 안 보냈어요');
  process.exit(1);
}
console.log('계산기 ready —', URL_);

let n = 0;
let bad = 0;
for (const d of DATES) {
  for (const e of JSON.parse(readFileSync(join(LAB, d, 'manifest.json'), 'utf8'))) {
    const an = JSON.parse(readFileSync(join(LAB, d, 'live', `${e.file}.analysis.json`), 'utf8'));
    const long = Math.max(an.sourceSize?.width ?? e.session.frameW, an.sourceSize?.height ?? e.session.frameH);
    const fp = an.focalPx ?? e.session.focalPx;
    const fovDeg = (2 * Math.atan(long / 2 / fp) * 180) / Math.PI;
    const seed = e.clipEventSec;
    const opts = {
      fps: 60,
      fovDeg,
      fovKnown: true,
      ...(seed != null ? { ballRange: { startSec: Math.max(0, seed - BALL_RANGE[0]), endSec: seed + BALL_RANGE[1], seedT: seed } } : {}),
      approach: 'receding',
      focalPerLongSide: null,
      releaseDistanceM: null,
      distanceM: 20,
      distanceAuto: AUTO,
      tiltRad: 0.035,
    };
    const jid = 1000 + ++n;
    const b64 = readFileSync(join(LAB, d, 'live', e.file)).toString('base64');
    const parts = Math.ceil(b64.length / PART);
    const t0 = Date.now();
    await evaluate(`window.postMessage(${JSON.stringify(JSON.stringify({ t: 'opts', id: jid, opts, ack: true }))}, '*')`);
    for (let p = 0; p < parts; p++)
      await evaluate(
        `window.postMessage(${JSON.stringify(JSON.stringify({ t: 'clip', id: jid, part: p, parts, data: b64.slice(p * PART, (p + 1) * PART) }))}, '*')`
      );
    let out = null;
    for (let i = 0; i < 300 && !out; i++) {
      await sleep(200);
      out = await evaluate(`(window.__out || []).find((m) => (m.t === 'result' || m.t === 'fail') && m.id === ${jid}) ?? null`);
    }
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    if (!out) {
      bad++;
      console.log(`${e.file.padEnd(22)} 건 ${String(e.gun ?? '-').padStart(3)} | 답 없음(60초)`);
      continue;
    }
    if (out.t === 'fail') {
      bad++;
      console.log(`${e.file.padEnd(22)} 건 ${String(e.gun ?? '-').padStart(3)} | 실패 ${out.message}`);
      continue;
    }
    const m = out.result.measure;
    const dist = out.result.distance ?? {};
    console.log(
      `${e.file.padEnd(22)} 건 ${String(e.gun ?? '-').padStart(3)} | ${m.ok ? `${m.kmh} ${m.confidence}` : `못 잼 ${m.code}`}` +
        ` · 거리 ${dist.distanceM ?? '-'}m(${dist.distanceSource ?? '-'}) · 까닭 ${dist.why ?? '-'} · ${s}초`
    );
  }
}
console.log(`\n클립 ${n} · 답 없음 · 실패 ${bad}`);
ws.close();
chrome.kill();
process.exit(bad ? 1 : 0);
