// 앱이 웹과 같은 계산(저장소의 lib/)을 쓰도록 저장소 뿌리를 지켜보게 한다(tsconfig 의 '@/*' → '../*').
// 패키지는 이 폴더의 node_modules 에서만 찾는다 — 웹의 React(19.2)와 앱의 React 가 섞이지 않게.
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

// 다만 이 폴더 node_modules 안의 패키지가 제 안쪽 node_modules 에 둔 것은 찾는다 — 위 막음이 그것까지 막아, reanimated 가 안쪽에 둔 semver 7 대신
// 바깥 semver 6(functions/ 없음)을 찾다 묶기가 깨졌다(2026-10-18). 저장소 뿌리(웹) node_modules 는 여전히 안 본다.
const appModules = path.resolve(__dirname, 'node_modules');
// 앱 화면(src/)의 import 'react-native' 는 src/rn/index.tsx 로 — 글꼴(Pretendard)을 한 곳에서 입히려고(그 파일 머리말). 그 파일 자신은 진짜를 받는다.
// 그 파일은 혼자 폴더에 둔다 — Metro 가 찾은 결과를 폴더마다 기억해, src/shell 에 두었더니 같은 폴더 파일 열둘이 진짜를 받았다.
const appSrc = path.resolve(__dirname, 'src') + path.sep;
const rnShim = path.resolve(__dirname, 'src/rn/index.js');
config.resolver.resolveRequest = (context, name, platform) => {
  const origin = context.originModulePath;
  if (name === 'react-native' && origin.startsWith(appSrc) && origin !== rnShim) return { type: 'sourceFile', filePath: rnShim };
  if (origin.startsWith(appModules + path.sep)) {
    const rel = origin.slice(appModules.length + 1).split(path.sep);
    const pkg = rel[0].startsWith('@') ? rel.slice(0, 2) : rel.slice(0, 1);
    const nested = path.join(appModules, ...pkg, 'node_modules');
    if (fs.existsSync(nested)) {
      try {
        return context.resolveRequest({ ...context, nodeModulesPaths: [nested, ...context.nodeModulesPaths] }, name, platform);
      } catch {
        /* 안쪽에 없으면 바깥으로 */
      }
    }
  }
  return context.resolveRequest(context, name, platform);
};

module.exports = config;
