/**
 * 내려받은 영상을 엔진으로 다시 잰다 — 앱의 '다시 재기'와 같은 조건(fps = 파일 머리, 화각 = 파일의 렌즈 정보, 투수 뒤).
 * DB 에는 쓰지 않는다. 결과는 한 줄씩 찍고 --json 이면 파일로도 남긴다.
 *
 *   node scripts/velocity-lab/run.mjs --date=2026-10-03                 — 그날 영상 전부(저장소의 지금 엔진)
 *   node scripts/velocity-lab/run.mjs --date=2026-10-03 132 119         — 파일 이름에 그 글자가 든 것만
 *   node scripts/velocity-lab/run.mjs --date=2026-10-03 --engine=<폴더> — 엔진 복사본으로(실험)
 *   … --json=out.json --debug(장면별 덩어리 · 첫 어림 궤적까지) --port=9443(여럿을 같이 돌릴 때 — README 의 함정)
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LAB, argOf, open } from './cdp.mjs';

const date = argOf('date', '2026-10-03');
const clips = argOf('clips', join(LAB, date, 'clips'));
const jsonOut = argOf('json');
const debug = process.argv.includes('--debug');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const manifestPath = join(LAB, date, 'manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : [];
const files = readdirSync(clips)
  .filter((f) => /\.(mov|mp4|m4v)$/i.test(f))
  /* 파일 이름(스피드건_공 id) 또는 지난 기록이 쓰는 영상 이름(clipKey)으로 고른다 */
  .filter(
    (f) =>
      !only.length ||
      only.some(
        (k) => f.includes(k) || manifest.find((m) => m.file === f)?.clipKey?.includes(k)
      )
  )
  .sort();

const c = await open({ port: Number(argOf('port', 9441)), engine: argOf('engine') });
console.log('엔진', c.version, '· 영상', files.length);
const out = [];
for (const f of files) {
  const entry = manifest.find((m) => m.file === f);
  const gun = entry?.gun ?? null;
  await c.setFile(join(clips, f));
  const r = await c.evaluate(`(async () => {
    const AV = window.__m['analyze-video'], VL = window.__m['video-lens'], VF = window.__m['video-fps'];
    const file = document.querySelector('input[type=file]').files[0];
    const t0 = performance.now();
    try {
      const lens = await VL.readVideoLens(file);
      const fps = await VF.readVideoFps(file);
      const lensFov = VL.videoFovFor(lens);
      const res = await AV.analyzeVideo({ file, fps, fovDeg: lensFov ?? 69, approach: 'receding', debug: ${debug} });
      const m = res.measure;
      const obs = (list) => list ? list.map((o) => ({ t: +o.t.toFixed(4), x: +o.x.toFixed(1), y: +o.y.toFixed(1), d: +o.diameterPx.toFixed(2) })) : null;
      return {
        ms: Math.round(performance.now() - t0), fps, lens, fovDeg: lensFov ?? 69, lensKnown: lensFov != null,
        ok: m.ok, code: m.ok ? null : m.code, message: m.ok ? null : m.message,
        kmh: m.ok ? m.kmh : null, conf: m.ok ? m.confidence : null, frames: m.ok ? m.detail.frames : null,
        rel: res.release ? res.release.releaseKmh : null, relPm: res.release ? res.release.errorKmh : null,
        track: obs(res.track), seedTrack: obs(res.seedTrack), diameter: res.diameter ?? null,
        fallback: res.fallback ?? null,
        blobFrames: ${debug} ? res.blobFrames : undefined,
        video: res.video,
      };
    } catch (e) { return { ms: Math.round(performance.now() - t0), error: String(e && e.stack || e) }; }
  })()`);
  const v = r.video ?? {};
  console.log(
    f.padEnd(22),
    entry?.clipKey ?? '',
    `${r.ms}ms fps ${r.fps} 화각 ${r.fovDeg}${r.lensKnown ? '' : '(짐작)'}`,
    '|',
    r.error ??
      (r.ok
        ? `릴리스 ${r.rel?.toFixed(1)} ±${r.relPm?.toFixed(1)} · 평균 ${r.kmh?.toFixed(1)} · ${r.frames}장 ${r.conf}${r.fallback ? ` · 대비 ${r.fallback}` : ""}` +
          (gun != null && r.rel != null
            ? ` · 건 ${gun} 차 ${(r.rel - gun).toFixed(1)}`
            : '')
        : `거부 ${r.code}`),
    '|',
    (v.tried ?? []).map((t) => `${t.kind}${t.ok ? '✓' : `✗${t.code}`}`).join('→'),
    /* 0 이 아니면 되감기가 장면을 겹쳐 내준 것 — 값이 흔들린다(README 의 함정) */
    v.duplicatesDropped ? `겹친 장면 ${v.duplicatesDropped}` : ''
  );
  out.push({ file: f, clipKey: entry?.clipKey ?? null, gun, ...r });
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
const done = out.filter((r) => r.ok && r.gun != null && r.rel != null);
if (done.length) {
  const diffs = done.map((r) => r.rel - r.gun);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  console.log(
    `잰 것 ${out.filter((r) => r.ok).length}/${out.length} · 건과 차이 평균 ${mean.toFixed(1)} · ${Math.min(...diffs).toFixed(1)}~${Math.max(...diffs).toFixed(1)}km/h`
  );
} else console.log(`잰 것 ${out.filter((r) => r.ok).length}/${out.length}`);
await c.close();
process.exit(0);
