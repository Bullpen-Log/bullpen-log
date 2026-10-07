/**
 * 분석 칸의 두 칸 — 투구 · 트레이닝(분석 · 그래프 화면 /coach). 리포트 칸은 2026-10-07 AI 를 빼며 지웠다.
 *
 * 화면(analysis-block.tsx)과 서버(app/actions/analysis.tsx) 양쪽이 쓴다.
 * 화면 쪽 파일('use client')에 두면 서버가 이 함수를 부를 수 없어서 따로 둔다.
 * 주소에서 처음 펼 칸을 읽는 것은 coach/tabs.tsx 의 readCoachView 다.
 */
export type AnalysisTab = 'pitch' | 'training';

export function isAnalysisTab(value: unknown): value is AnalysisTab {
  return value === 'pitch' || value === 'training';
}
