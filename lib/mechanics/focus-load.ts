import 'server-only';

import { appNow } from '@/lib/clock';
import { trainingGuides } from '@/lib/library-cache';
import { groupDrills } from '@/lib/mechanics/drills';
import { findLabOwner, loadLabJob, loadLabMetaRaw, loadV2Result } from '@/lib/pitch-lab';
import { isLabId, readLabMeta } from '@/lib/pitch-lab-meta';
import { readPitch3dV2Result } from '@/lib/pitch-3d/v2/contract';
import { buildReport, isYouth, reportDrillsOf, type ElementRx } from '@/lib/pitch-3d/v2/report';

/**
 * 3D 리포트의 처방 한 장들(ElementRx[]) — 메커니즘의 [처방 시작] 확인 시트 · 시작 동작이 읽는다(docs/designs/pitch-3d-report.md 6-4절).
 * 리포트는 아직 파일로 남기지 않고 분석 결과로 셈한다(3D 세션 P1) — 그래서 결과 화면과 같은 재료(드릴 목록 · 키 · 마운드 · 성장기)로 같은
 * buildReport 를 부른다. 리포트 번호 = 샘플 번호. 내 샘플만(관리자가 남의 샘플로 내 처방을 시작하지 않게).
 * 시작할 때 한 번 베끼고 그 뒤로는 다시 안 읽는다(lib/mechanics/program.ts ProgramFocus).
 */
export type FocusOffer = {
  reportId: string;
  jobId: string;
  rx: ElementRx[];
};

type Viewer = { id: string; role: string; heightCm?: number | null; birthDate?: Date | null };

export async function loadFocusOffer(viewer: Viewer, reportId: unknown): Promise<FocusOffer | { error: string }> {
  if (!isLabId(reportId)) return { error: '리포트를 찾을 수 없어요.' };
  const owner = await findLabOwner(reportId, viewer);
  if (owner !== viewer.id) return { error: '내 리포트의 처방만 시작할 수 있어요.' };
  const job = await loadLabJob(owner, reportId);
  const jobId = job?.shownJobId ?? null;
  const parsed = jobId ? readPitch3dV2Result(await loadV2Result(owner, reportId, jobId).catch(() => null)) : null;
  if (!jobId || !parsed?.ok) return { error: '분석이 끝난 리포트가 아니에요.' };
  const now = appNow();
  const [meta, guides] = await Promise.all([
    loadLabMetaRaw(owner, reportId).then((raw) => readLabMeta(raw, now.toISOString())).catch(() => null),
    trainingGuides(),
  ]);
  const report = buildReport(parsed, {
    heightCm: meta?.heightCm ?? viewer.heightCm ?? null,
    ground: meta?.ground ?? 'mound',
    youth: isYouth(viewer.birthDate, now),
    drills: reportDrillsOf(groupDrills(guides)),
  });
  if (report.rx.length === 0) return { error: '이 리포트에는 처방할 드릴이 없어요. 지금 동작을 지켜요.' };
  return { reportId, jobId, rx: report.rx };
}
