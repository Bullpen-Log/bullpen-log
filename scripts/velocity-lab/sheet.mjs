/**
 * 영상 장면을 한 장에 모아 보기 — 공이 실제로 어디를 어떻게 날아가는지 눈으로 볼 때(칸마다 시각 표시).
 *
 *   node scripts/velocity-lab/sheet.mjs <영상> [--from=0] [--to=끝] [--n=12] [--cols=6] [--w=230]
 *        [--crop=x,y,w,h(0~1)] [--out=<그림.jpg>] [--port=9451]
 * 예) 공이 날아가는 구간만 장면마다: --from=0.1083 --to=0.6083 --n=31 --cols=8 --w=170 --crop=0.15,0.1,0.7,0.5
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { LAB, argOf, open } from './cdp.mjs';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) throw new Error('영상 파일을 알려 주세요.');
const c = await open({ port: Number(argOf('port', 9451)) });
await c.setFile(file);
const r = await c.evaluate(`(async () => {
  const o = await window.__open();
  const v = o.v;
  const from = ${Number(argOf('from', 0))};
  const to = ${argOf('to', 'null')} ?? v.duration;
  const n = ${Number(argOf('n', 12))}, cols = ${Number(argOf('cols', 6))};
  const [cx, cy, cw, ch] = ${JSON.stringify(argOf('crop', '0,0,1,1').split(',').map(Number))};
  const sw = v.videoWidth * cw, sh = v.videoHeight * ch;
  const w = ${Number(argOf('w', 230))}, h = Math.round(w * sh / sw);
  const sheet = document.createElement('canvas');
  sheet.width = w * cols; sheet.height = h * Math.ceil(n / cols);
  const g = sheet.getContext('2d');
  const times = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? from : from + (to - from) * i / (n - 1);
    await o.seek(Math.min(v.duration - 0.001, t));
    const x = (i % cols) * w, y = Math.floor(i / cols) * h;
    g.drawImage(v, v.videoWidth * cx, v.videoHeight * cy, sw, sh, x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, 64, 16);
    g.fillStyle = '#fff'; g.font = '12px monospace'; g.fillText(t.toFixed(3), x + 3, y + 12);
    times.push(+t.toFixed(3));
  }
  return { url: sheet.toDataURL('image/jpeg', 0.85), w: v.videoWidth, h: v.videoHeight, dur: v.duration, times };
})()`);
const dir = join(LAB, 'sheets');
mkdirSync(dir, { recursive: true });
const out = argOf('out', join(dir, `${basename(file).replace(/\.\w+$/, '')}.jpg`));
writeFileSync(out, Buffer.from(r.url.split(',')[1], 'base64'));
console.log(out, `${r.w}x${r.h} ${r.dur.toFixed(2)}초`, r.times.join(' '));
await c.close();
process.exit(0);
