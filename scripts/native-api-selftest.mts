/**
 * 아이폰 앱(native/)이 부르는 서버 입구가 실제로 있는가 — `npm run native-api:test`.
 *
 * 앱은 서버 액션을 /api/rpc/<파일>.<함수> 로 부르고(app/api/rpc/registry.ts 허용 목록), 투구 기록 같은 것은 /api/... 주소로 바로 부른다.
 * 웹 쪽에서 액션 이름을 바꾸거나 허용 목록에 새 파일을 빠뜨리면 앱에서만 'unknown-action' 으로 깨진다 — 앱을 굽기 전에 여기서 잡는다.
 *   1. native/src 의 rpc('<파일>.<함수>') 마다: 허용 목록에 그 파일이 있고, 그 파일이 그 함수를 export 한다
 *   2. native/src 의 '/api/…' 주소마다: app/api/…/route.ts 가 있다
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'native', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

const registry = readFileSync(join(ROOT, 'app/api/rpc/registry.ts'), 'utf8');
/* import * as x from '@/app/actions/<path>' · RPC_MODULES 의 'key': x */
const importOf = new Map([...registry.matchAll(/import \* as (\w+) from '@\/app\/actions\/([\w-]+)'/g)].map((m) => [m[1], m[2]]));
const modules = new Map(
  [...registry.matchAll(/^\s+'?([\w-]+)'?: (\w+),$/gm)].map((m) => [m[1], importOf.get(m[2])] as const)
);

let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) return;
  fail++;
  console.log(`✗ ${msg}`);
};

const calls = new Map<string, string>();
const paths = new Map<string, string>();
for (const f of files(SRC)) {
  const code = readFileSync(f, 'utf8');
  const rel = f.slice(ROOT.length + 1);
  /*
   * '<파일>.<함수>' 글자 — rpc(…) 바로 안이든 도우미에 넘기든(act(date, 'nutrition.setWeight', …)). 파일 이름이 허용 목록 열쇠일 때만 센다
   * ('1.5' · 'pitch.mov' 같은 글자를 안 잡게)
   */
  for (const m of code.matchAll(/['"]([\w-]+)\.([a-z]\w*)['"]/g)) if (modules.has(m[1])) calls.set(`${m[1]}.${m[2]}`, rel);
  /* rpc(…) 바로 안의 이름은 허용 목록에 없어도 센다 — 파일 이름을 틀리게 적은 것을 잡게(타입 인자가 여러 줄일 수 있다) */
  for (const m of code.matchAll(/\brpc\b[\s\S]{0,400}?\(\s*['"]([\w-]+)\.(\w+)['"]/g)) calls.set(`${m[1]}.${m[2]}`, rel);
  for (const m of code.matchAll(/[`'"](\/api\/[\w/-]+)/g)) paths.set(m[1].replace(/\/$/, ''), rel);
}

for (const [name, at] of calls) {
  const [mod, fn] = name.split('.');
  const file = modules.get(mod);
  ok(file != null, `${name}(${at}): 허용 목록(app/api/rpc/registry.ts)에 '${mod}' 가 없어요`);
  if (!file) continue;
  const src = readFileSync(join(ROOT, 'app/actions', `${file}.ts`), 'utf8');
  ok(
    new RegExp(`export (async function|const|function) ${fn}\\b`).test(src),
    `${name}(${at}): app/actions/${file}.ts 에 export ${fn} 이 없어요`
  );
}
for (const [path, at] of paths) {
  const route = join(ROOT, 'app', path, 'route.ts');
  ok(existsSync(route), `${path}(${at}): ${route.slice(ROOT.length + 1)} 가 없어요`);
}

console.log(`앱이 부르는 서버 동작 ${calls.size}개 · 주소 ${paths.size}개 · 막힘 ${fail}`);
if (fail) process.exit(1);
