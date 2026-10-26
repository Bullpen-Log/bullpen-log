import 'server-only';
import { createHash } from 'node:crypto';
import { appNow } from '@/lib/clock';
import { trainingGuides } from '@/lib/library-cache';
import { groupDrills } from '@/lib/mechanics/drills';
import { findLabOwner, loadLabJob, loadLabMetaRaw, loadLabAnalysisContext, loadV2Result, labServerFacts } from '@/lib/pitch-lab';
import { isLabId, readLabMeta } from '@/lib/pitch-lab-meta';
import { engineKeyOf, isV2JobId, readPitch3dV2Result } from '@/lib/pitch-3d/v2/contract';
import { buildReport, isYouth, reportDrillsOf } from '@/lib/pitch-3d/v2/report';
import { COMPARISON_METRICS, snapshotRows, type AnalysisSnapshot } from '@/lib/mechanics/comparison';

type Viewer = { id: string; role: string; birthDate?: Date | null; heightCm?: number | null };
/** 서버에서 소유권·작업 번호를 고정해 읽는다. 클라이언트가 보낸 수치·엔진·지문을 저장하지 않는다. */
export async function loadAnalysisSnapshot(viewer: Viewer, reportId: unknown, expectedJob?: string) {
  if (!isLabId(reportId) || (expectedJob !== undefined && !isV2JobId(expectedJob))) return { error: '분석 번호를 확인해 주세요.' } as const;
  const owner = await findLabOwner(reportId, viewer);
  if (owner !== viewer.id) return { error: '내 투구 분석만 연결할 수 있어요.' } as const;
  const job = await loadLabJob(owner, reportId);
  if (!job || job.status !== 'done' || job.jobId !== job.shownJobId || (expectedJob && expectedJob !== job.jobId))
    return { error: '완료된 분석이 바뀌었거나 분석 중이에요. 다시 불러와 주세요.' } as const;
  const [raw, context, metaRaw, guides, source] = await Promise.all([
    loadV2Result(owner, reportId, job.jobId),
    loadLabAnalysisContext(owner, reportId, job.jobId),
    loadLabMetaRaw(owner, reportId),
    trainingGuides(),
    labServerFacts(owner, reportId).catch(() => null),
  ]);
  const parsed = readPitch3dV2Result(raw);
  if (!parsed?.ok || parsed.jobId !== job.jobId) return { error: '이 작업 번호의 정상 분석 결과를 찾지 못했어요.' } as const;
  const meta = readLabMeta(metaRaw, job.requestedAt);
  if (meta.kind === 'marker') return { error: '마커 실험 영상은 처방 전후 비교에 연결하지 않아요.' } as const;
  const fixed =
    context?.jobId === job.jobId &&
    context.requestedAt === job.requestedAt &&
    context.engine === job.engine &&
    context.hand === parsed.hand &&
    context.engine === engineKeyOf(parsed.engine.build ?? null)
      ? context
      : null;
  const now = appNow();
  const youth = isYouth(viewer.birthDate, new Date(job.requestedAt));
  const report = buildReport(parsed, {
    heightCm: fixed ? fixed.heightCm : (meta.heightCm ?? viewer.heightCm ?? null),
    ground: fixed?.ground ?? meta.ground,
    youth,
    drills: reportDrillsOf(groupDrills(guides)),
  });
  const snapshot: AnalysisSnapshot = {
    source:
      fixed && fixed.files.length === 2 && source?.side && source.back
        ? fixed.files.every((f) => source[f.view]?.fp === f.fp)
          ? 'verified'
          : 'changed'
        : 'unknown',
    v: 1,
    reportId,
    jobId: job.jobId,
    savedAt: now.toISOString(),
    resultDigest: createHash('sha256').update(JSON.stringify(parsed)).digest('hex'),
    engine: parsed.engine.build ? JSON.stringify([parsed.version, parsed.engine.v1, parsed.engine.pose, parsed.engine.build]) : null,
    criteria: report.criteria,
    metricsVersion: COMPARISON_METRICS,
    context: fixed,
    youth,
    hasRx: report.rx.length > 0,
    rows: snapshotRows(report),
  };
  // 도중에 새 작업이 시작돼도 오래된 선택을 현재 결과로 저장하지 않는다.
  const latest = await loadLabJob(owner, reportId);
  if (latest?.status !== 'done' || latest.jobId !== job.jobId || latest.shownJobId !== job.jobId)
    return { error: '분석이 바뀌었어요. 결과를 다시 선택해 주세요.' } as const;
  return { snapshot, report } as const;
}
