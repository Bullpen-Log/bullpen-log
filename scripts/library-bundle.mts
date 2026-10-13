/*
 * 운동 · 드릴 영상을 720p 로 줄여 아이폰 앱 안에 넣는다 — DB · 저장소는 읽기만 한다(원본은 그대로).
 *
 *   npm run library:bundle            (받기 → 줄이기 → mobile/ios/App/App/LibraryVideos/)
 *   npm run library:bundle -- --dry   (무엇을 할지만)
 *
 * 왜: 운동 영상은 회원이 볼 때마다 서버에서 받아 전송 비용이 가장 컸다(2026-10-13 김민: "영상을 줄여서 앱 안에 넣는 방안").
 * 앱에 든 영상은 서버에서 받지 않고 바로 튼다(LocalVideoPlugin libraryLoad). 앱을 낸 뒤 새로 올리거나 고친 영상은 이름(uuid)이
 * 새로 붙어 앱 안에 없으니, 앱이 처음 볼 때 한 번 받아 폰에 둔다(libraryFetch). 다음 앱을 낼 때 이걸 다시 돌리면 최신 영상이 들어간다.
 *
 * 줄인 영상은 저장소(git)에 올리지 않는다(.gitignore) — 공개 저장소이고 수백 MB 라서. 그래서 맥에서 굽는 앱에만 들고,
 * GitHub 의 TestFlight 굽기에는 아직 안 든다(영상 없이 구워도 앱은 서버에서 받아 폰에 두며 돈다).
 * 원본은 ~/bullpen-library-bundle/src 에 받아 두고 다시 받지 않는다. 숨긴 운동 · 드릴은 넣지 않는다(보이면 앱이 받는다).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';

const dry = process.argv.includes('--dry');
const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'mobile/ios/App/App/LibraryVideos');
const srcDir = join(homedir(), 'bullpen-library-bundle/src');
const BUCKET = 'pitch-videos';

const where = { videoPath: { not: null }, hiddenAt: null } as const;
const select = { videoPath: true } as const;
const [exercises, guides] = await Promise.all([
  prisma.exerciseVideo.findMany({ where, select }),
  prisma.mechanicsGuide.findMany({ where, select }),
]);
await prisma.$disconnect();

/** 'library/<uuid>.mp4' → '<uuid>' — 앱 안 파일 이름(LocalVideoPlugin 과 같은 규칙) */
const keyOf = (path: string) => basename(path, extname(path));
const paths = [...new Set([...exercises, ...guides].map((r) => r.videoPath!))].filter((p) =>
  /^library\/[\w-]+\.\w+$/.test(p)
);
const want = new Set(paths.map(keyOf));

mkdirSync(outDir, { recursive: true });
mkdirSync(srcDir, { recursive: true });
const stale = readdirSync(outDir).filter((f) => f.endsWith('.mp4') && !want.has(keyOf(f)));
const todo = paths.filter((p) => !existsSync(join(outDir, `${keyOf(p)}.mp4`)));
console.log(`영상 ${paths.length}개 · 새로 줄일 것 ${todo.length} · 뺄 옛 것 ${stale.length}`);
if (dry) process.exit(0);

for (const f of stale) rmSync(join(outDir, f));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('.env 의 SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요해요');
const bucket = createClient(url!, key!, { auth: { persistSession: false } }).storage.from(BUCKET);

const list: string[] = [];
let n = 0;
for (const p of todo) {
  const src = join(srcDir, basename(p));
  if (!existsSync(src)) {
    const { data, error } = await bucket.download(p);
    if (error || !data) {
      console.log(`받기 실패 ${p}: ${error?.message}`);
      continue;
    }
    writeFileSync(src, Buffer.from(await data.arrayBuffer()));
  }
  list.push(`${src}\t${join(outDir, `${keyOf(p)}.mp4`)}`);
  if (++n % 20 === 0) console.log(`받음 ${n}/${todo.length}`);
}

if (list.length) {
  const listFile = join(srcDir, '../list.tsv');
  writeFileSync(listFile, list.join('\n'));
  try {
    execFileSync('swift', ['-suppress-warnings', join(root, 'scripts/library-bundle/compress.swift'), listFile], { stdio: 'inherit' });
  } catch {
    console.log('일부 영상을 줄이지 못했어요 — 위 fail 줄을 보세요(그 영상은 앱이 서버에서 받아요).');
  }
}

const files = readdirSync(outDir).filter((f) => f.endsWith('.mp4'));

/*
 * 줄인 판을 저장소 library-720/ 에도 올린다(더하기만 — 원본 · 이미 있는 것은 그대로). GitHub 의 앱 굽기가 여기서 받아 앱에
 * 넣고(/api/library/bundle), 앱이 새 영상을 받을 때 · 운동 영상 재생도 이것을 쓴다(/api/library/video-url small).
 */
if (url && key) {
  const have = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await bucket.list('library-720', { limit: 1000, offset });
    for (const f of data ?? []) have.add(f.name);
    if (!data || data.length < 1000) break;
  }
  let up = 0;
  for (const f of files.filter((f) => !have.has(f))) {
    const { error } = await bucket.upload(`library-720/${f}`, readFileSync(join(outDir, f)), {
      contentType: 'video/mp4',
      upsert: false,
    });
    if (error) console.log(`올리기 실패 ${f}: ${error.message}`);
    else up++;
  }
  console.log(`저장소 library-720/ 에 새로 올림 ${up}개`);
}
const before = files.reduce((s, f) => {
  const src = readdirSync(srcDir).find((x) => keyOf(x) === keyOf(f));
  return s + (src ? statSync(join(srcDir, src)).size : 0);
}, 0);
const after = files.reduce((s, f) => s + statSync(join(outDir, f)).size, 0);
const mb = (b: number) => (b / 1048576).toFixed(0);
console.log(`앱 안 영상 ${files.length}/${paths.length}개 · 원본 ${mb(before)}MB → ${mb(after)}MB`);
