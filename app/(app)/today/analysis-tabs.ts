/**
 * 홈 분석 칸의 세 칸 — 리포트 · 투구 · 트레이닝.
 *
 * 화면(analysis-block.tsx)과 서버(app/actions/analysis.tsx, 홈 page.tsx) 양쪽이 쓴다.
 * 화면 쪽 파일('use client')에 두면 서버가 이 함수를 부를 수 없어서 따로 둔다.
 */
export type AnalysisTab = 'report' | 'pitch' | 'training';

export function isAnalysisTab(value: unknown): value is AnalysisTab {
  return value === 'report' || value === 'pitch' || value === 'training';
}

/** 주소의 ?analysis= 값을 세 칸 중 하나로. 모르는 값은 리포트. */
export function readAnalysisTab(raw: string | string[] | undefined): AnalysisTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isAnalysisTab(value) ? value : 'report';
}
