/**
 * 스크립트에서 앱 코드를 그대로 불러오기 위한 경로 해석기.
 *
 * 앱은 '@/lib/...' 같은 짧은 경로를 쓰는데(tsconfig 에 적혀 있다), node 는
 * 그 규칙을 모른다. 그래서 확인용 스크립트에서 앱 코드를 부르면 파일을 못 찾는다.
 *
 * 확인 스크립트가 앱과 다른 코드를 보게 되면 확인하는 의미가 없으므로,
 * 앱 코드를 그대로 부를 수 있게 여기서 '@/' 를 실제 경로로 바꿔준다.
 *
 *   node --import ./scripts/alias-register.mjs 스크립트.ts
 */
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function resolve(specifier, context, next) {
  /*
   * 'server-only' 는 브라우저 묶음에 서버 코드가 섞이지 않게 막는 표시라, node 로 그냥 부르면 바로 던진다.
   * 운동 시작 목록(lib/workout/session-plan.ts — 순수 계산뿐)을 시험하려고 그 파일에서만 빈 모듈로 바꾼다(2026-10-04).
   * 모든 파일에 풀면 DB 에 쓰는 서버 코드(예: today-data.ts)까지 스크립트에서 불려 운영 DB 를 건드릴 수 있다.
   */
  if (
    specifier === 'server-only' &&
    context.parentURL?.endsWith('/lib/workout/session-plan.ts')
  ) {
    return { url: 'data:text/javascript,', shortCircuit: true };
  }
  if (!specifier.startsWith('@/')) return next(specifier, context);

  const base = path.join(root, specifier.slice(2));
  // 앱에서는 확장자를 안 적으므로 여기서 붙여 본다.
  const found = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(
    isFile
  );
  if (!found) {
    throw new Error(`'${specifier}' 에 해당하는 파일을 찾지 못했습니다.`);
  }
  return next(pathToFileURL(found).href, context);
}
