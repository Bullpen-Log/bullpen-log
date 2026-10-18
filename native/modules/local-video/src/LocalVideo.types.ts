/** 폰 영상(ios/LocalVideoModule.swift)의 약속 — 사이트 lib/local-video.ts 가 옛 Capacitor 부품에 쓰던 모양 그대로 */

/** load 가 내준 앱 안 영상 파일 — read · discard 는 이 경로만 받는다 */
export type LocalVideoFile = { path: string; size: number };

/** 라이브러리 영상 — 앱 안(bundle) 또는 폰에 받아 둔 것(cache) */
export type LibraryFile = { path: string; size: number; source: 'bundle' | 'cache' };

export type ReadChunk = { data: string; size: number; eof: boolean };

export type LibraryStatus = { bundled: number; cached: number; cacheBytes: number };
