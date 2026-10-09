/**
 * 앱 카메라로 잰 공을 맥에서 다시 잰다 — 앱과 같은 구간(공 알림 앞 0.25 ~ 뒤 1.45초, dual-capture.ts BALL_RANGE)으로 엔진을 돌려
 * 거리 자동 · 넣은 거리를 견준다. 스피드건 값(관리자 · 공 시트에서 적은 것)과 나란히 보인다.
 *
 *   node --env-file=.env scripts/velocity-lab/download.mjs --date=2026-10-09 --live          # 클립 · 분석 · manifest 받기
 *   ~/bullpen-velocity-lab/native-decode/decode <날짜>/frames <날짜>/live/*.mp4               # 장면 풀기(y8 + json)
 *   node scripts/velocity-lab/app-rerun.mts --date=2026-10-09 --d=18.5                      # 다시 재기(--d 넣은 거리)
 *
 * 장면은 맥이 AVAssetReader 로 푼 밝기(웹킷이 푼 장면과 조금 다르다 — 값을 앱과 한 글자까지 맞추는 도구가 아니라 견주는 도구).
 */
import { openSync, readFileSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { analyzeByDistance } from '../../lib/velocity-engine/analyze-distance.ts';

const arg = (k: string, d: string) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const date = arg('date', '2026-10-09');
const D = Number(arg('d', '18.5'));
const ROOT = join(homedir(), 'bullpen-velocity-lab', date);
const W = 720;
const H = 1280;

type Row = {
  file: string;
  seq: number;
  sessionId: string;
  rawKmh: number;
  gun: number | null;
  clipEventSec: number;
};
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as Row[];

function down(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(W * H);
  const kx = w / W;
  const ky = h / H;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = (x + 0.5) * kx - 0.5;
      const sy = (y + 0.5) * ky - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      out[y * W + x] = Math.round(
        (src[y0 * w + x0] * (1 - fx) + src[y0 * w + x1] * fx) * (1 - fy) +
          (src[y1 * w + x0] * (1 - fx) + src[y1 * w + x1] * fx) * fy
      );
    }
  return out;
}

const rows: {
  name: string;
  gun: number | null;
  app: number;
  auto: number | null;
  fixed: number | null;
  size: number | null;
  ext: number;
  end: string;
  note: string;
}[] = [];
for (const r of manifest.sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.seq - b.seq)) {
  const name = r.file.replace(/\.mp4$/, '');
  const meta = JSON.parse(readFileSync(join(ROOT, 'frames', `${name}.json`), 'utf8')) as { w: number; h: number; n: number; t: number[] };
  const an = JSON.parse(readFileSync(join(ROOT, 'live', `${r.file}.analysis.json`), 'utf8'));
  const fd = openSync(join(ROOT, 'frames', `${name}.y8`), 'r');
  const S = meta.w * meta.h;
  const frameAt = (i: number) => {
    const b = Buffer.alloc(S);
    readSync(fd, b, 0, S, i * S);
    return down(new Uint8Array(b.buffer, b.byteOffset, S), meta.w, meta.h);
  };
  const ev = r.clipEventSec;
  const frames: { t: number; luma: Uint8Array }[] = [];
  const bgs: Uint8Array[] = [];
  for (let i = 0; i < meta.n; i++) {
    const t = meta.t[i];
    if (t >= ev - 0.25 && t <= ev + 1.45) frames.push({ t, luma: frameAt(i) });
    else if (t < ev - 0.25 && t >= ev - 0.6) bgs.push(frameAt(i));
  }
  const base = {
    frames,
    backgroundSamples: bgs.slice(-3),
    width: W,
    height: H,
    sourceWidth: meta.w,
    sourceHeight: meta.h,
    focalPx: an.focalPx * (meta.h / (an.sourceSize?.height ?? meta.h)),
    fps: 60,
    tiltRad: an.distance?.tiltRad ?? 0,
    seedHint: { t: ev },
    stabilize: true,
  };
  const auto = analyzeByDistance({ ...base, distanceM: 20, autoDistance: true });
  const fixed = analyzeByDistance({ ...base, distanceM: D, autoDistance: false });
  const kmhOf = (x: typeof auto) => (x.measure.ok ? x.measure.kmh : null);
  rows.push({
    name: `${r.sessionId.slice(0, 6)}#${r.seq}`,
    gun: r.gun,
    app: r.rawKmh,
    auto: kmhOf(auto),
    fixed: kmhOf(fixed),
    size: auto.distance?.sizeDistM ?? null,
    ext: fixed.distance?.extended ?? 0,
    end: String(fixed.distance?.impact ?? ''),
    note: fixed.measure.ok ? `±${fixed.measure.errorKmh} ${fixed.measure.confidence}` : fixed.measure.code,
  });
  const x = rows[rows.length - 1];
  const e = (v: number | null) => (v == null || x.gun == null ? '   -  ' : `${(v - x.gun >= 0 ? '+' : '') + (v - x.gun).toFixed(1)}`.padStart(6));
  console.log(
    `${x.name.padEnd(10)} 건 ${String(x.gun ?? '-').padStart(4)} | 앱 ${x.app.toFixed(1).padStart(6)} ${e(x.app)} | 자동 ${String(x.auto?.toFixed(1) ?? '못 잼').padStart(6)} ${e(x.auto)} (공 크기 ${x.size}m) | 거리 ${D}m ${String(x.fixed?.toFixed(1) ?? '못 잼').padStart(6)} ${e(x.fixed)} ${x.note} 끝 ${x.end} 이어 ${x.ext}`
  );
}
const stat = (k: 'app' | 'auto' | 'fixed') => {
  const errs = rows.filter((r) => r.gun != null && r[k] != null).map((r) => (r[k] as number) - (r.gun as number));
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  return `${k} ${errs.length}개 · MAE ${(abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(1)} · 중앙 ${abs[abs.length >> 1].toFixed(1)} · 평균 ${(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(1)}`;
};
console.log(stat('app'));
console.log(stat('auto'));
console.log(stat('fixed'));
