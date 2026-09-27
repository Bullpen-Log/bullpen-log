import type { AnalyzeResult, Approach } from '@/lib/velocity-engine/analyze-frames';

/**
 * 엔진이 본 자료를 DB(VelocityPitch.analysis)에 남길 모양으로 — 영상 없이도 다시 맞춰 볼 수 있게.
 *
 * 궤적은 [t, x, y, 지름] 배열(분석 해상도 픽셀, 지름은 다시 잰 값)로 줄여 담는다. 원본 해상도로
 * 되돌리려면 sourceSize.width / analyzeSize.width 를 곱한다. focalPx 는 원본 긴 변 기준.
 * 서버는 lib/velocity-sync.ts 의 sanitizeAnalysis 로 숫자만 걸러 저장한다.
 */
export type AnalysisJson = {
  v: 1;
  track: number[][];
  analyzeSize: { width: number; height: number };
  sourceSize: { width: number; height: number };
  fps: number | null;
  shakePx: number;
  focalPx: number;
  fitQuality: number | null;
  startKmh: number | null;
  endKmh: number | null;
  frameCount: number;
  approach: Approach;
};

export function analysisOf(result: AnalyzeResult, approach: Approach): AnalysisJson {
  const m = result.measure;
  return {
    v: 1,
    track: result.track.map((o) => [
      Math.round(o.t * 10000) / 10000,
      Math.round(o.x * 100) / 100,
      Math.round(o.y * 100) / 100,
      Math.round(o.diameterPx * 1000) / 1000,
    ]),
    analyzeSize: result.analyzeSize,
    sourceSize: result.sourceSize,
    fps: result.fps,
    shakePx: result.shakePx,
    focalPx: result.focalPx,
    fitQuality: m.ok ? m.detail.fitQuality : null,
    startKmh: m.ok ? m.detail.startKmh : null,
    endKmh: m.ok ? m.detail.endKmh : null,
    frameCount: result.frameCount,
    approach,
  };
}
