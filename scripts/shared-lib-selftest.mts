/**
 * 웹 · 아이폰 앱(native/, React Native)이 같이 쓰는 lib 계산의 경계 시험 — `npm run shared-lib:test`.
 *
 * 앱 코드(native/ 의 .ts · .tsx)가 부르는 `@/lib/…` 파일을 import 를 끝까지 따라가, 앱에서 돌 수 없는 것에 닿으면 실패한다:
 *   - 서버 전용: 'server-only' · @/lib/prisma · next/* · node:* · @prisma/*
 *   - 브라우저 전용: window. · document. · localStorage. · navigator.
 * 웹 쪽 커밋이 공유 파일에 이런 것을 넣으면 앱을 굽기 전에 여기서 잡힌다(2026-10-17 엔지니어링 검토 D8).
 * 주석과 타입 전용 import(`import type`)는 보지 않는다 — 타입은 앱 묶음에 안 들어간다.
 *
 * 앱이 아직 lib 를 하나도 안 부르면 할 일이 없고, 지금 lib 계산 폴더에서 앱이 그대로 쓸 수 있는 파일 수만 알린다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const NATIVE = join(ROOT, 'native');

const SERVER =
  /import\s+['"]server-only['"]|from\s+['"](@\/lib\/prisma|next\/[^'"]*|node:[^'"]*|@prisma\/[^'"]*)['"]/;
const BROWSER = /\b(window|document|localStorage|navigator)\./;

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const cache = new Map<string, string>();
const code = (f: string) => {
  if (!cache.has(f)) cache.set(f, strip(readFileSync(f, 'utf8')));
  return cache.get(f)!;
};

/** `@/x` 와 상대 경로만 따라간다 — 패키지(react 등)는 앱 · 웹이 각자 깐다. */
function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith('@/')
    ? join(ROOT, spec.slice(2))
    : spec.startsWith('.')
      ? resolve(dirname(from), spec)
      : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

const importsOf = (f: string) =>
  [
    ...code(f).matchAll(
      /(?:import|export)\s+(?!type\b)[^'";]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
    ),
  ]
    .map((m) => resolveSpec(f, m[1] ?? m[2]))
    .filter((x): x is string => x != null);

/** 그 파일에서 닿는 곳 가운데 처음 막힌 파일과 까닭(없으면 null) — 길도 같이 */
function blocked(start: string): { path: string[]; why: string } | null {
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const f = queue.shift()!;
    const s = code(f);
    const why = SERVER.test(s) ? '서버 전용' : BROWSER.test(s) ? '브라우저 전용' : null;
    if (why) {
      const path: string[] = [];
      for (let c: string | null = f; c; c = prev.get(c) ?? null)
        path.unshift(relative(ROOT, c));
      return { path, why };
    }
    for (const t of importsOf(f)) {
      if (prev.has(t)) continue;
      prev.set(t, f);
      queue.push(t);
    }
  }
  return null;
}

const walk = (dir: string, out: string[] = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};

let fail = 0;
const shared = new Set<string>();
for (const f of walk(NATIVE))
  for (const t of importsOf(f))
    if (t.startsWith(join(ROOT, 'lib') + '/')) shared.add(t);
for (const f of [...shared].sort()) {
  const b = blocked(f);
  if (b) {
    fail++;
    console.log(`✗ ${relative(ROOT, f)} — ${b.why}: ${b.path.join(' → ')}`);
  } else console.log(`✓ ${relative(ROOT, f)}`);
}

// 참고: 계산 폴더에서 앱이 그대로 쓸 수 있는 파일 수
const DIRS = [
  'engine',
  'report',
  'nutrition',
  'program',
  'mechanics',
  'armcare',
  'workout',
  'velocity-engine',
  'pitch-3d',
];
let total = 0;
let ok = 0;
for (const d of DIRS)
  for (const f of walk(join(ROOT, 'lib', d))) {
    total++;
    if (!blocked(f)) ok++;
  }
ok += Number(!blocked(join(ROOT, 'lib/units.ts')));
total++;

console.log(
  `\n앱이 부르는 lib ${shared.size}개 · 막힘 ${fail} · (참고) 계산 파일 ${total}개 중 앱에서 그대로 쓸 수 있음 ${ok}`
);
if (blocked(join(ROOT, 'lib/units.ts'))) {
  console.log(
    '✗ lib/units.ts 가 다시 브라우저 · 서버 코드를 품었다 — 기기 저장은 lib/units-storage.ts 로'
  );
  fail++;
}
process.exit(fail ? 1 : 0);
