// 앱이 웹과 같은 계산(저장소의 lib/)을 쓰도록 저장소 뿌리를 지켜보게 한다(tsconfig 의 '@/*' → '../*').
// 패키지는 이 폴더의 node_modules 에서만 찾는다 — 웹의 React(19.2)와 앱의 React 가 섞이지 않게.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
