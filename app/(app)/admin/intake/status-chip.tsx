import type { ReactNode } from 'react';
import { ANALYSIS_STATUS_TEXT, analysisChipText, textOf, type AnalysisBlock } from '@/lib/intake/admin-labels';

/** 상태 표시 — 색은 거들 뿐이고 글이 뜻을 말한다 */
export type ChipTone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger';

const TONES: Record<ChipTone, string> = {
  neutral: 'border-line text-muted',
  info: 'border-sky-soft text-sky-strong',
  ok: 'border-line text-ok',
  warn: 'border-warn-line bg-warn-bg text-warn',
  danger: 'border-danger-line bg-danger-bg text-danger',
};

export function StatusChip({ tone = 'neutral', children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${TONES[tone]}`}>{children}</span>;
}

export const submissionTone = (s: string): ChipTone =>
  s === 'verified' ? 'ok' : s === 'needs_attention' ? 'danger' : s === 'correction_requested' ? 'warn' : s === 'submitted' ? 'info' : 'neutral';

export const analysisTone = (s: string): ChipTone =>
  s === 'succeeded' ? 'ok' : s === 'failed' ? 'danger' : s === 'running' || s === 'queued' ? 'info' : s === 'ready' ? 'warn' : 'neutral';

/** 분석 칩 — 원본이 없거나 철회 · 폐기 · 지울 날 지남으로 새 분석을 못 하면 분석 상태 대신 그 사실을 말한다. 막힘은 서버가 정한다(analysisBlockOf) */
export function AnalysisChip({ status, block }: { status: string; block: AnalysisBlock | null }) {
  const blocked = analysisChipText(status, block);
  return <StatusChip tone={blocked ? 'neutral' : analysisTone(status)}>{blocked ?? textOf(ANALYSIS_STATUS_TEXT, status)}</StatusChip>;
}

export const publicationTone = (s: string): ChipTone => (s === 'published' ? 'ok' : 'neutral');
