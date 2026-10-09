/**
 * 현장 기록 점검 — 맥에서 깐 개발용 앱이 폰에 남긴 측정 세션(Documents/lab/<세션>: 1분 조각 영상 + events.jsonl)을 알림마다
 * 앱과 같은 구간으로 맥에서 다시 재, 진짜 투구였나 · 잴 수 있었나 · 못 쟀으면 까닭을 한 줄씩 낸다. 공 찾기 · 엔진을 고칠 때의 기준표.
 *
 *   scripts/velocity-lab/pull-device.sh                                            # 폰에서 현장 기록 받기
 *   node scripts/velocity-lab/session-audit.mts ~/bullpen-velocity-lab/device/<세션> [--d=20] [--fov=38.33]
 *   … --jobs=old | --jobs=new                                                       # 알림 대신 앱의 작업으로(예전 · 오늘 규칙)
 *
 * 알림마다 그 앞뒤만 ~/bullpen-velocity-lab/native-decode/decode-range 로 풀어(분석 크기 720×1280) 잰 뒤 지운다.
 *   공 알림: 앱 클립 앞 0.6 ~ 뒤 1.6초, 재는 구간 앞 0.25 ~ 뒤 1.45초 · 공 찾기는 알림 둘레부터(dual-capture.ts BALL_RANGE)
 *   움직임: 앱 클립 앞 0.5 ~ 뒤 2.6초를 앱처럼 거칠게 훑어(가로 320 · find-throw.ts planThrowWindows) 공 구간 → 1.55초 구간 차례로
 * 장면은 맥이 푼 밝기라 앱(웹킷)과 한 글자까지 같지 않다 — 견주는 도구다. PLAN=1 이면 움직임 클립의 거친 훑기 결과(공 후보 · 구간)도 찍는다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { analyzeByDistance } from '../../lib/velocity-engine/analyze-distance.ts';
import {
  anchoredBackgroundTimes,
  coarseGrid,
  denseBandTimes,
  planThrowWindows,
  type ThrowSample,
} from '../../lib/velocity-engine/find-throw.ts';

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

type Ev = { t: number; kind: string; strength: number; length: number; areaFirst?: number; ballAt?: number };
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

/*
 * --jobs=old|new: 알림 하나씩이 아니라 앱의 작업으로 — 클립 창 안에 온 알림은 그 작업에 묶인다(dual-capture.ts onThrow). new 는 오늘 규칙:
 * 처음 덩어리 60칸 밑 공 알림은 없던 것으로(2.3.12 MIN_AREA), 움직임 작업 창 안의 공 알림은 그 공 시각으로 잰다(2.3.14 ballAt).
 */
const jobsMode = arg('jobs', '');
let tasks: Ev[] = events.filter((e) => e.kind === 'ball' || e.kind === 'motion');
if (jobsMode) {
  if (jobsMode === 'new') tasks = tasks.filter((e) => e.kind !== 'ball' || (e.areaFirst ?? 999) >= 60);
  const jobs: (Ev & { end: number })[] = [];
  for (const e of tasks) {
    const cover = jobs.find((j) => e.t >= j.t - (j.kind === 'ball' ? 0.6 : 0.5) && e.t <= j.end);
    if (cover) {
      if (jobsMode === 'new' && e.kind === 'ball' && cover.kind === 'motion' && cover.ballAt == null) cover.ballAt = e.t;
      continue;
    }
    jobs.push({ ...e, end: e.t + (e.kind === 'ball' ? 1.6 : 2.6) });
  }
  tasks = jobs;
}

const rows: { kind: string; ok: boolean; real: boolean }[] = [];
for (const ev of tasks) {
  const file = [...files].reverse().find((x) => x.start <= ev.t);
  if (!file) continue;
  const [before, after] = ev.kind === 'ball' ? [0.6, 1.6] : [0.5, 2.6];
  /* 공 길로 잴 시각 — 공 알림이면 그 알림, 움직임 작업에 묶인 공 알림이면 그 시각 */
  const ball = ev.kind === 'ball' || ev.ballAt != null;
  const rel = ev.t - file.start;
  const relBall = (ev.ballAt ?? ev.t) - file.start;
  const clipEnd = rel + after;
  const out = join(tmp, 'f');
  execFileSync(DECODE, [file.f, String(Math.max(0, rel - before)), String(rel + after), out]);
  const meta = JSON.parse(readFileSync(`${out}.json`, 'utf8')) as { n: number; t: number[] };
  const buf = readFileSync(`${out}.y8`);
  const S = W * H;
  const at = (i: number) => new Uint8Array(buf.buffer, buf.byteOffset + i * S, S);
  const common = {
    width: W,
    height: H,
    sourceWidth: 1080,
    sourceHeight: 1920,
    focalPx: FOCAL,
    fps: 60,
    tiltRad: 0,
    stabilize: true,
    distanceM: D,
    autoDistance: false,
  };
  let fixed: ReturnType<typeof analyzeByDistance>;
  let how = '';
  if (ball) {
    const frames: { t: number; luma: Uint8Array }[] = [];
    const bgs: Uint8Array[] = [];
    for (let i = 0; i < meta.n; i++) {
      const t = meta.t[i];
      if (t >= relBall - 0.25 && t <= Math.min(clipEnd, relBall + 1.45)) frames.push({ t, luma: at(i) });
      else if (t < relBall) bgs.push(at(i));
    }
    fixed = analyzeByDistance({ ...common, frames, backgroundSamples: bgs.slice(-3), seedHint: { t: relBall } });
    if (ev.ballAt != null) how = `묶인 공 +${(ev.ballAt - ev.t).toFixed(2)}s`;
  } else {
    /* 앱의 움직임 클립 길(analyze-video.ts) — 클립 시각으로 거칠게 훑어 공 구간을 정하고 1.55초씩 차례로 */
    const c0 = meta.t[0];
    const ct = meta.t.map((t) => t - c0);
    const duration = ct[ct.length - 1] + 1 / 60;
    const shown = (t: number) => {
      let k = 0;
      while (k + 1 < ct.length && ct[k + 1] <= t) k++;
      return k;
    };
    const cw = 320;
    const ch = Math.round((cw * H) / W);
    const coarse = (i: number) => {
      const src = at(i);
      const out = new Uint8Array(cw * ch);
      const kx = W / cw;
      const ky = H / ch;
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          let sum = 0;
          let n = 0;
          for (let yy = Math.floor(y * ky); yy < Math.floor((y + 1) * ky); yy++)
            for (let xx = Math.floor(x * kx); xx < Math.floor((x + 1) * kx); xx++) {
              sum += src[yy * W + xx];
              n++;
            }
          out[y * cw + x] = Math.round(sum / n);
        }
      return out;
    };
    const { times, step } = coarseGrid(duration);
    const samples: ThrowSample[] = [];
    let prev: Uint8Array | null = null;
    let best = -1;
    let peak: number | null = null;
    for (const t of times) {
      const k = shown(t);
      const l = coarse(k);
      if (prev) {
        let dsum = 0;
        for (let i = 0; i < l.length; i++) dsum += Math.abs(l[i] - prev[i]);
        if (dsum > best) {
          best = dsum;
          peak = t - step / 2;
        }
      }
      prev = l;
      samples.push({ t: ct[k], luma: l });
    }
    for (const t of denseBandTimes(duration, step, peak)) {
      const k = shown(t);
      samples.push({ t: ct[k], luma: coarse(k) });
    }
    samples.sort((a, b) => a.t - b.t);
    const plan = planThrowWindows({
      duration,
      approach: 'receding',
      samples,
      width: cw,
      height: ch,
      focalPx: (FOCAL / 1080) * cw,
      peak,
    });
    if (process.env.PLAN)
      console.log(
        'PLAN',
        (ev.t - t0).toFixed(1),
        JSON.stringify({
          duration: +duration.toFixed(2),
          ball: plan.ball && { t: +plan.ball.t.toFixed(2), prevT: +plan.ball.prevT.toFixed(2), links: plan.ball.links, seedZ: +plan.ball.seedZ.toFixed(1), accepted: plan.ball.accepted },
          peak: peak && +peak.toFixed(2),
          windows: plan.windows.map((w) => `${w.kind} ${w.from.toFixed(2)}~${w.to.toFixed(2)}`),
        })
      );
    const anchor = plan.ball?.accepted ? plan.ball.prevT : null;
    fixed = null as unknown as ReturnType<typeof analyzeByDistance>;
    for (const win of plan.windows) {
      const to = Math.min(duration, win.from + 1.55);
      const frames = ct.flatMap((t, i) => (t >= win.from && t <= to ? [{ t, luma: at(i) }] : []));
      /* 앱(analyze-video.ts)처럼 공을 믿었으면 모든 구간에 그 공의 힌트 · 공 시각에 묶은 배경 */
      const useBall = anchor != null;
      const bgT = useBall
        ? anchoredBackgroundTimes(anchor as number, duration)
        : [0, duration * 0.5, duration - 0.05].filter((t) => t < win.from || t > to);
      const r = analyzeByDistance({
        ...common,
        frames,
        backgroundSamples: bgT.map((t) => at(shown(t))),
        seedHint: useBall && plan.ball ? { t: plan.ball.t } : null,
      });
      if (!fixed) {
        fixed = r;
        how = `${win.kind} ${win.from.toFixed(2)}~${to.toFixed(2)}`;
      }
      if (r.measure.ok) {
        fixed = r;
        how = `${win.kind} ${win.from.toFixed(2)}~${to.toFixed(2)}`;
        break;
      }
    }
    if (!fixed) fixed = analyzeByDistance({ ...common, frames: [], backgroundSamples: [], seedHint: null });
    how += plan.ball ? ` 공 ${plan.ball.accepted ? '믿음' : '안 믿음'}` : ' 공 없음';
  }
  const d = fixed.distance;
  /* 앱 공 찾기가 이 공을 놓친 때 · 까닭(앱 2.3.6 부터 — 0 이어지지 않음 · 1 화면 통째 · 2 그물 흔들림) */
  const end = ev.kind === 'ball' ? events.find((e) => e.kind === 'end' && e.t > ev.t && e.t < ev.t + 2) : undefined;
  const real = (d?.flightFrames ?? 0) >= 10 || fixed.track.length >= 10;
  rows.push({ kind: ev.kind, ok: fixed.measure.ok, real });
  console.log(
    [
      `${(ev.t - t0).toFixed(1).padStart(6)}s`,
      ev.kind === 'ball' ? '공  ' : '움직임',
      ev.kind === 'ball' && end ? `앱 끝 +${(end.t - ev.t).toFixed(2)}s(${['놓침', '화면', '그물'][Math.round(end.strength)] ?? '?'})` : ''.padEnd(16),
      `공 길 ${String(fixed.track.length).padStart(3)}장`,
      fixed.measure.ok
        ? `${fixed.measure.kmh.toFixed(1).padStart(6)}km/h ±${fixed.measure.errorKmh} ${fixed.measure.confidence}`
        : `못 잼 ${fixed.measure.code}`,
      d ? `공 크기 ${d.sizeDistM ?? '-'}m 끝 ${d.impact} 이어 ${d.extended}` : '',
      how,
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
