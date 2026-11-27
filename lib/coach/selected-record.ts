import { prisma } from '@/lib/prisma';
import { loadLabJob, loadLabMetaRaw, loadV2Result } from '@/lib/pitch-lab';
import { isLabId, readLabMeta } from '@/lib/pitch-lab-meta';
import { isV2JobId, readPitch3dV2Result } from '@/lib/pitch-3d/v2/contract';
import { buildReport, isYouth } from '@/lib/pitch-3d/v2/report';
import { distanceMismatch } from '@/lib/velocity-analysis';
import { summarize } from '@/lib/velocity-meta';
import type { DaySlot } from '@/lib/coach/week';

/** Resolve each question against the displayed record, including the displayed analysis revision. */
export async function selectedRecord(user: { id: string; heightCm: number | null; birthDate: Date | null }, source: unknown, week: DaySlot[]) {
  const userId = user.id;
  if (!source || typeof source !== 'object' || !('kind' in source) || !('id' in source)) return null;
  const { kind, id } = source;
  if (kind === 'week' && week.length > 0 && id === week[0].date) {
    return id + '부터 시작하는 이번 주 훈련 계획. 위 7일 일정의 날짜별 계획과 진행 상태를 사용한다.';
  }
  if (kind === 'report' && isLabId(id) && 'jobId' in source && isV2JobId(source.jobId)) {
    const [job, meta] = await Promise.all([loadLabJob(userId, id), loadLabMetaRaw(userId, id)]);
    if (!job || job.shownJobId !== source.jobId || (meta && typeof meta === 'object' && 'kind' in meta && meta.kind === 'marker')) return null;
    const result = readPitch3dV2Result(await loadV2Result(userId, id, source.jobId));
    if (!result?.ok || result.jobId !== source.jobId) return null;
    const setup = readLabMeta(meta, new Date().toISOString());
    const report = buildReport(result, {
      heightCm: setup.heightCm ?? user.heightCm,
      ground: setup.ground ?? 'mound',
      youth: isYouth(user.birthDate, new Date()),
    });
    const levels = { improve: '개선', edge: '경계', fair: '보통', good: '좋음' };
    const findings = report.items.flatMap(item =>
      item.status === 'note' || item.status === 'unsure' ? [] : [item.element + ' ' + levels[item.status]]
    );
    return '선택한 3D 리포트 · ' + (findings.join(', ') || '판정한 요소 없음') + '. 판정 밖의 요소는 추정하지 않는다.';
  }
  if (kind !== 'velocity' || typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) return null;
  const session = await prisma.velocitySession.findFirst({
    where: { id, userId, mode: 'pitch' },
    select: { date: true, pitches: { where: { userId }, select: { kmh: true, analysis: true, releaseDxCm: true, releaseDyCm: true, result: true } } },
  });
  if (!session) return null;
  const pitches = session.pitches.map(p => ({ ...p, excluded: distanceMismatch(p.analysis) != null }));
  const sum = summarize(pitches);
  if (!sum) return null;
  return session.date.toISOString().slice(0, 10) + ' 구속 측정 · ' + pitches.length + '구 · 최고 ' + sum.max + ' km/h · 평균 ' + sum.avg + ' km/h. 앱 측정 추정값.';
}
