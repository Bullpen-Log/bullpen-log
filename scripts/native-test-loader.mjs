/**
 * 아이폰 앱(native/) 코드를 node 시험에서 그대로 부르는 경로 해석기 — `@/…`(저장소) · `~/…`(native/src) 를 실제 파일로,
 * 폰에만 있는 모듈(AsyncStorage · expo-router)은 흉내로 바꾼다. 쓰는 곳: scripts/native-*-selftest.mts.
 */
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/* 폰 저장소 흉내 — 시험마다 같은 메모리를 쓴다 */
const ASYNC_STORAGE = `const m = new Map();
export default {
  getItem: async (k) => (m.has(k) ? m.get(k) : null),
  setItem: async (k, v) => { m.set(k, String(v)); },
  removeItem: async (k) => { m.delete(k); },
  getAllKeys: async () => [...m.keys()],
  multiRemove: async (ks) => { for (const k of ks) m.delete(k); },
};`;

/* 화면 길잡이 흉내 — 시험은 훅을 그리지 않고 순수 부분만 부른다(shell/transition.ts) */
const EXPO_ROUTER = `export const useRoute = () => ({ key: undefined });`;

export function resolve(specifier, context, next) {
  if (specifier === '@react-native-async-storage/async-storage')
    return { url: `data:text/javascript,${encodeURIComponent(ASYNC_STORAGE)}`, shortCircuit: true };
  if (specifier === 'expo-router') return { url: `data:text/javascript,${encodeURIComponent(EXPO_ROUTER)}`, shortCircuit: true };
  const base = specifier.startsWith('@/')
    ? path.join(root, specifier.slice(2))
    : specifier.startsWith('~/')
      ? path.join(root, 'native', 'src', specifier.slice(2))
      : null;
  if (!base) return next(specifier, context);
  const found = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(isFile);
  if (!found) throw new Error(`'${specifier}' 에 해당하는 파일을 찾지 못했어요.`);
  return next(pathToFileURL(found).href, context);
}
