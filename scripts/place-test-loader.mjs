import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fake = pathToFileURL(path.join(root, 'scripts/place-test-fixtures.mjs')).href;
export function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true };
  if (['@/lib/prisma', '@/lib/dal', '@/lib/storage', 'next/server'].includes(specifier)) return { url: fake, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const base = path.join(root, specifier.slice(2));
    const found = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((p) => {
      try { return statSync(p).isFile(); } catch { return false; }
    });
    if (found) return next(pathToFileURL(found).href, context);
  }
  return next(specifier, context);
}
