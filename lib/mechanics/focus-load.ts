import 'server-only';
import { loadAnalysisSnapshot } from '@/lib/mechanics/analysis-load';
import { prescriptionMessage, type ElementRx } from '@/lib/pitch-3d/v2/report';
import type { AnalysisSnapshot } from '@/lib/mechanics/comparison';

export type FocusOffer = { criteria: string; reportId: string; jobId: string; rx: ElementRx[]; snapshot: AnalysisSnapshot };
type Viewer = { id: string; role: string; heightCm?: number | null; birthDate?: Date | null };
/** 시작 직전의 분석 번호·수치·조건과 처방을 한 번에 읽어 같은 기준으로 보존한다. */
export async function loadFocusOffer(viewer: Viewer, reportId: unknown): Promise<FocusOffer | { error: string }> {
  const loaded = await loadAnalysisSnapshot(viewer, reportId);
  if ('error' in loaded) return { error: loaded.error ?? '분석을 읽지 못했어요.' };
  if (loaded.snapshot.source === 'changed') return { error: '분석 당시와 원본 파일이 달라요. 새 분석을 마친 뒤 처방을 시작해 주세요.' };
  if (!loaded.report.rx.length) return { error: prescriptionMessage(loaded.report) };
  return {
    reportId: loaded.snapshot.reportId,
    jobId: loaded.snapshot.jobId,
    rx: loaded.report.rx,
    criteria: loaded.report.criteria,
    snapshot: loaded.snapshot,
  };
}
