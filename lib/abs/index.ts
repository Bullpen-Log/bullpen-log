/**
 * ABS(폰 한 대 볼 · 스트라이크 자동 판정) — 순수 계산 모음. DOM · Prisma 없음, node 시험(`npm run abs:test` · `abs:bench`)이 그대로 돈다.
 * 설계: docs/designs/abs-single-camera.md, 구축 지시: docs/designs/abs-build-prompt.md. 설정(localStorage)은 setup.ts 를 따로 부른다.
 */
export * from './rules.ts';
export * from './zone.ts';
export * from './cross.ts';
export * from './judge.ts';
export * from './calib.ts';
export * from './plate-detect.ts';
export * from './stability.ts';
export * from './depth.ts';
export * from './events.ts';
export * from './analysis.ts';
