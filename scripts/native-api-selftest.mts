/**
 * 아이폰 앱(native/)이 부르는 서버 입구가 실제로 있는가 — `npm run native-api:test`.
 *
 * 앱은 서버 액션을 /api/rpc/<파일>.<함수> 로 부르고(app/api/rpc/registry.ts 허용 목록), 투구 기록 같은 것은 /api/... 주소로 바로 부른다.
 * 웹 쪽에서 액션 이름을 바꾸거나 허용 목록에 새 파일을 빠뜨리면 앱에서만 'unknown-action' 으로 깨진다 — 앱을 굽기 전에 여기서 잡는다.
 *   1. native/src 의 rpc('<파일>.<함수>') 마다: 허용 목록에 그 파일이 있고, 그 파일이 그 함수를 export 한다
 *   2. native/src 의 '/api/…' 주소마다: app/api/…/route.ts 가 있다
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
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

/*
 * 3. 모양 — 앱이 부르는 서버 동작의 인자 · 돌려주는 모양을 적어 둔 것(native-api-shapes.json)과 견준다.
 *    앱은 rpc<T>(…) 로 답 모양을 손으로 적어, 웹에서 액션 모양을 바꿔도 앱 타입 검사가 못 잡는다(이미 깔린 앱은 고칠 수도 없다).
 *    바뀌면 실패 — 앱 화면을 새 모양에 맞춘 뒤 `npm run native-api:test -- --update`, 깔린 옛 앱이 깨지면 lib/app-api.ts 의
 *    APP_API_LEVEL(막아야 하면 MIN_APP_API 도)을 올린다. 앱 패키지 없이 웹 쪽 타입스크립트로만 돈다(2026-10-18 아키텍처 검토 2번).
 *    4. 인자 수 — rpc('<파일>.<함수>', …) 로 넘기는 인자 수가 서버 함수가 받는 수 안인가.
 */
const SHAPES = join(ROOT, 'scripts', 'native-api-shapes.json');
const UPDATE = process.argv.includes('--update');
const shapes = shapeOf([...calls.keys()].filter((n) => modules.has(n.split('.')[0])));
if (UPDATE) {
  writeFileSync(SHAPES, JSON.stringify(Object.fromEntries([...shapes].map(([k, v]) => [k, v.text])), null, 1) + '\n');
  console.log(`모양 ${shapes.size}개를 ${SHAPES.slice(ROOT.length + 1)} 에 적었어요`);
} else {
  const saved: Record<string, string> = existsSync(SHAPES) ? JSON.parse(readFileSync(SHAPES, 'utf8')) : {};
  for (const [name, s] of shapes) {
    const was = saved[name];
    ok(
      was === s.text,
      was == null
        ? `${name}: 적어 둔 모양이 없어요 — 앱 화면을 확인한 뒤 \`npm run native-api:test -- --update\``
        : `${name}: 서버 동작 모양이 바뀌었어요 — 앱(${calls.get(name)})이 새 모양을 알아듣게 고치고 --update, 깔린 앱이 깨지면 APP_API_LEVEL 을 올려요\n    전: ${was}\n    뒤: ${s.text}`
    );
  }
}
for (const f of files(SRC)) {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'rpc') {
      const [first, ...rest] = n.arguments;
      const s = first && ts.isStringLiteralLike(first) ? shapes.get(first.text) : undefined;
      if (s && !rest.some(ts.isSpreadElement)) {
        const at = `${f.slice(ROOT.length + 1)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
        ok(
          rest.length >= s.min && rest.length <= s.max,
          `${first.text}(${at}): 인자 ${rest.length}개 — 서버는 ${s.min}~${s.max === Infinity ? '…' : s.max}개를 받아요`
        );
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

console.log(`앱이 부르는 서버 동작 ${calls.size}개 · 주소 ${paths.size}개 · 모양 ${shapes.size}개 · 막힘 ${fail}`);
if (fail) process.exit(1);

/** 서버 동작마다 인자 · 돌려주는 모양을 글자로(이름 붙은 타입도 칸까지 펴서 — 안쪽 칸이 바뀌어도 잡게) */
function shapeOf(names: string[]): Map<string, { text: string; min: number; max: number }> {
  const cfg = ts.getParsedCommandLineOfConfigFile(join(ROOT, 'tsconfig.json'), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => undefined,
  });
  const fileOf = (mod: string) => join(ROOT, 'app/actions', `${modules.get(mod)}.ts`);
  const roots = [...new Set(names.map((n) => fileOf(n.split('.')[0])))];
  const program = ts.createProgram(roots, { ...cfg!.options, noEmit: true });
  const checker = program.getTypeChecker();
  const BUILTIN = new Set(['Date', 'FormData', 'File', 'Blob', 'Map', 'Set', 'URL', 'Uint8Array', 'ArrayBuffer']);
  const F = ts.TypeFlags;

  const ser = (t: ts.Type, depth: number, seen: Set<ts.Type>): string => {
    if (t.flags & (F.Any | F.Unknown | F.Never | F.Void | F.Undefined | F.Null | F.String | F.Number | F.BigInt | F.ESSymbol | F.Literal | F.TypeParameter | F.Index | F.TemplateLiteral))
      return checker.typeToString(t);
    if (t.flags & F.Boolean) return 'boolean';
    if (t.isUnion()) return [...new Set(t.types.map((x) => ser(x, depth, seen)))].sort().join(' | ');
    const name = t.getSymbol()?.getName() ?? '';
    if (BUILTIN.has(name)) return name;
    if (depth > 6) return '…';
    if (seen.has(t)) return `↺${name}`;
    const inner = new Set(seen).add(t);
    if (name === 'Promise') return `Promise<${ser(checker.getTypeArguments(t as ts.TypeReference)[0], depth + 1, inner)}>`;
    if (checker.isArrayType(t)) return `${ser(checker.getTypeArguments(t as ts.TypeReference)[0], depth + 1, inner)}[]`;
    if (checker.isTupleType(t)) return `[${checker.getTypeArguments(t as ts.TypeReference).map((x) => ser(x, depth + 1, inner)).join(', ')}]`;
    if (t.getCallSignatures().length && !t.getProperties().length) return 'fn';
    const props = checker.getPropertiesOfType(t).map((p) => {
      const opt = p.flags & ts.SymbolFlags.Optional ? '?' : '';
      return `${p.getName()}${opt}: ${ser(checker.getTypeOfSymbol(p), depth + 1, inner)}`;
    });
    return `{ ${props.sort().join('; ')} }`;
  };

  const out = new Map<string, { text: string; min: number; max: number }>();
  for (const n of names.sort()) {
    const [mod, fn] = n.split('.');
    const sf = program.getSourceFile(fileOf(mod));
    const sym = sf && checker.getSymbolAtLocation(sf);
    const exp = sym && checker.getExportsOfModule(sym).find((e) => e.getName() === fn);
    const sig = exp && checker.getTypeOfSymbolAtLocation(exp, sf!).getCallSignatures()[0];
    if (!sig) continue;
    const params = sig.getParameters().map((p) => {
      const d = p.valueDeclaration as ts.ParameterDeclaration | undefined;
      const opt = !!d && (!!d.questionToken || !!d.initializer || !!d.dotDotDotToken);
      return { rest: !!d?.dotDotDotToken, opt, text: `${p.getName()}${opt ? '?' : ''}: ${ser(checker.getTypeOfSymbol(p), 0, new Set())}` };
    });
    out.set(n, {
      text: `(${params.map((p) => p.text).join(', ')}) => ${ser(sig.getReturnType(), 0, new Set())}`,
      min: params.filter((p) => !p.opt).length,
      max: params.some((p) => p.rest) ? Infinity : params.length,
    });
  }
  return out;
}
