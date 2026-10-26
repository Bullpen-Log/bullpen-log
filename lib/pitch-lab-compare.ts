import 'server-only';
import { loadAnalysisSnapshot } from '@/lib/mechanics/analysis-load';
import { previousLabReport } from '@/lib/pitch-lab';
import { previousComparisonOf, type PreviousComparison } from '@/lib/pitch-3d/v2/compare-view';

type Viewer = { id: string; role: string; heightCm?: number | null; birthDate?: Date | null };

/**
 * 이 리포트를 바로 앞 내 리포트와 견준다(셈은 lib/pitch-3d/v2/compare-view.ts previousComparisonOf) — 내 것만, 앞 리포트가 없으면 null.
 * ponytail: 열 때마다 두 결과를 다시 읽어 셈한다 — 느려지면 리포트 요약처럼 job.json 에 남긴다.
 */
export async function loadPreviousComparison(viewer: Viewer, reportId: string): Promise<PreviousComparison | null> {
  const prev = await previousLabReport(viewer.id, reportId);
  if (!prev) return null;
  const [after, before] = await Promise.all([loadAnalysisSnapshot(viewer, reportId), loadAnalysisSnapshot(viewer, prev.reportId)]);
  if ('error' in after || 'error' in before) return null;
  return previousComparisonOf(prev, before.snapshot, after.snapshot);
}
