/**
 * 현장 기록 점검 — 맥에서 깐 개발용 앱이 폰에 남긴 측정 세션(Documents/lab/<세션>: 1분 조각 영상 + events.jsonl)을 알림마다
 * 앱과 같은 구간으로 맥에서 다시 재, 진짜 투구였나 · 잴 수 있었나 · 못 쟀으면 까닭을 한 줄씩 낸다. 공 찾기 · 엔진을 고칠 때의 기준표.
 *
 *   scripts/velocity-lab/pull-device.sh                                            # 폰에서 현장 기록 받기
 *   node scripts/velocity-lab/session-audit.mts ~/bullpen-velocity-lab/device/<세션> [--d=20] [--fov=38.33]
 *
 * 알림마다 그 앞뒤만 ~/bullpen-velocity-lab/native-decode/decode-range 로 풀어(분석 크기 720×1280) 잰 뒤 지운다.
 *   공 알림: 앱 클립 앞 0.6 ~ 뒤 1.6초, 재는 구간 앞 0.25 ~ 뒤 1.45초 · 공 찾기는 알림 둘레부터(dual-capture.ts BALL_RANGE)
 *   움직임: 앱 클립 앞 0.5 ~ 뒤 2.6초 전체에서 공을 찾는다(앱은 거칠게 훑어 구간을 정한다 — 그 대신)
 * 장면은 맥이 푼 밝기라 앱(웹킷)과 한 글자까지 같지 않다 — 견주는 도구다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { analyzeByDistance } from '../../lib/velocity-engine/analyze-distance.ts';

const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('쓰는 법: node scripts/velocity-lab/session-audit.mts <현장 기록 세션 폴더> [--d=20] [--fov=38.33]');
  process.exit(1);
}
const arg = (k: string, d: string) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const D = Number(arg('d', '20'));
const FOV = Number(arg('fov', '38.33'));
const DECODE = join(homedir(), 'bullpen-velocity-lab/native-decode/decode-range');
const W = 720;
const H = 1280;
const FOCAL = 1920 / 2 / Math.tan((FOV / 2) * (Math.PI / 180));

type Ev = { t: number; kind: string; strength: number; length: number };
const events = readFileSync(join(dir, 'events.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Ev);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.mp4'))
  .map((f) => ({ f: join(dir, f), start: Number(basename(f, '.mp4')) }))
  .sort((a, b) => a.start - b.start);
const tmp = mkdtempSync(join(tmpdir(), 'audit-'));
const t0 = files[0]?.start ?? 0;

const rows: { kind: string; ok: boolean; real: boolean }[] = [];
for (const ev of events.filter((e) => e.kind === 'ball' || e.kind === 'motion')) {
  const file = [...files].reverse().find((x) => x.start <= ev.t);
  if (!file) continue;
  const ball = ev.kind === 'ball';
  const [before, after] = ball ? [0.6, 1.6] : [0.5, 2.6];
  const rel = ev.t - file.start;
  const out = join(tmp, 'f');
  execFileSync(DECODE, [file.f, String(Math.max(0, rel - before)), String(rel + after), out]);
  const meta = JSON.parse(readFileSync(`${out}.json`, 'utf8')) as { n: number; t: number[] };
  const buf = readFileSync(`${out}.y8`);
  const S = W * H;
  const at = (i: number) => new Uint8Array(buf.buffer, buf.byteOffset + i * S, S);
  const frames: { t: number; luma: Uint8Array }[] = [];
  const bgs: Uint8Array[] = [];
  for (let i = 0; i < meta.n; i++) {
    const t = meta.t[i];
    const inWin = ball ? t >= rel - 0.25 && t <= rel + 1.45 : t >= rel - 0.1;
    if (inWin) frames.push({ t, luma: at(i) });
    else if (t < rel) bgs.push(at(i));
  }
  const base = {
    frames,
    backgroundSamples: bgs.slice(-3),
    width: W,
    height: H,
    sourceWidth: 1080,
    sourceHeight: 1920,
    focalPx: FOCAL,
    fps: 60,
    tiltRad: 0,
    seedHint: ball ? { t: rel } : null,
    stabilize: true,
  };
  const fixed = analyzeByDistance({ ...base, distanceM: D, autoDistance: false });
  const d = fixed.distance;
  /* 앱 공 찾기가 이 공을 놓친 때 · 까닭(앱 2.3.6 부터 — 0 이어지지 않음 · 1 화면 통째 · 2 그물 흔들림) */
  const end = ball ? events.find((e) => e.kind === 'end' && e.t > ev.t && e.t < ev.t + 2) : undefined;
  const real = (d?.flightFrames ?? 0) >= 10 || fixed.track.length >= 10;
  rows.push({ kind: ev.kind, ok: fixed.measure.ok, real });
  console.log(
    [
      `${(ev.t - t0).toFixed(1).padStart(6)}s`,
      ball ? '공  ' : '움직임',
      ball && end ? `앱 끝 +${(end.t - ev.t).toFixed(2)}s(${['놓침', '화면', '그물'][Math.round(end.strength)] ?? '?'})` : ''.padEnd(16),
      `공 길 ${String(fixed.track.length).padStart(3)}장`,
      fixed.measure.ok
        ? `${fixed.measure.kmh.toFixed(1).padStart(6)}km/h ±${fixed.measure.errorKmh} ${fixed.measure.confidence}`
        : `못 잼 ${fixed.measure.code}`,
      d ? `공 크기 ${d.sizeDistM ?? '-'}m 끝 ${d.impact} 이어 ${d.extended}` : '',
    ].join(' | ')
  );
  rmSync(`${out}.y8`, { force: true });
}
rmSync(tmp, { recursive: true, force: true });
const n = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
console.log(
  `공 알림 ${n((r) => r.kind === 'ball')}(공 길 있음 ${n((r) => r.kind === 'ball' && r.real)} · 잼 ${n((r) => r.kind === 'ball' && r.ok)}) · ` +
    `움직임 ${n((r) => r.kind === 'motion')}(공 길 있음 ${n((r) => r.kind === 'motion' && r.real)} · 잼 ${n((r) => r.kind === 'motion' && r.ok)})`
);
