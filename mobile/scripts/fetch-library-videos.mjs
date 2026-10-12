// 아이폰 앱 굽기(GitHub) 때 운동 · 드릴 영상(720p)을 받아 앱 안(ios/App/App/LibraryVideos)에 넣는다.
// 사이트의 굽기 전용 주소(/api/library/bundle)가 굽기 전용 열쇠(LIBRARY_BUNDLE_TOKEN)로 읽기 주소를 준다.
// 열쇠가 없거나 못 받으면 영상 없이 굽는다 — 실패로 끝내지 않는다(앱은 볼 때 받아 폰에 둔다, lib/local-video.ts).
// 같은 푸시로 사이트가 아직 배포 중일 수 있어 404 · 5xx 는 30초씩 10번까지 다시 묻는다.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://bullpen-log.vercel.app';
const token = process.env.LIBRARY_BUNDLE_TOKEN;
const out = new URL('../ios/App/App/LibraryVideos', import.meta.url).pathname;
const warn = (msg) => console.log(`::warning title=운동 영상::${msg}`);

if (!token) {
  warn('LIBRARY_BUNDLE_TOKEN 이 없어 영상 없이 굽는다');
  process.exit(0);
}

let files = null;
for (let i = 0; i < 10 && !files; i++) {
  const res = await fetch(`${SITE}/api/library/bundle`, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
  if (res?.ok) files = (await res.json()).files;
  else {
    console.log(`목록 못 받음(${res?.status ?? '연결 실패'}) — 30초 뒤 다시`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
}
if (!Array.isArray(files)) {
  warn('영상 목록을 못 받아 영상 없이 굽는다');
  process.exit(0);
}

mkdirSync(out, { recursive: true });
let ok = 0;
let bytes = 0;
const queue = files.filter((f) => /^[\w-]{1,64}$/.test(f.key));
async function worker() {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const dest = join(out, `${f.key}.mp4`);
    if (existsSync(dest)) continue;
    for (let t = 0; t < 3; t++) {
      const res = await fetch(f.url).catch(() => null);
      if (!res?.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest, buf);
      ok++;
      bytes += buf.length;
      break;
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`운동 영상 ${ok}/${files.length}개 · ${(bytes / 1048576).toFixed(0)}MB`);
if (ok < files.length) warn(`${files.length - ok}개를 못 받았다(그 영상은 앱이 볼 때 받는다)`);
