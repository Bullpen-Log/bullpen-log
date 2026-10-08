import 'server-only';
import type { GpuStatus, V2FailCode, V2Stage } from '@/lib/pitch-3d/v2/contract';
import { V2_FAIL_TEXT } from '@/lib/pitch-3d/v2/contract';

/**
 * 클라우드 GPU 함수(Modal) 부르기 — 서버 동작만 쓴다(설계 pitch-3d-quality.md 기술 D1: 알림 주소 없음, 작업 번호로 상태를 묻는다).
 *
 * 환경변수 셋(.env.example): PITCH3D_GPU_URL(함수 주소) · PITCH3D_GPU_KEY · PITCH3D_GPU_SECRET(Modal 프록시 인증 — 우리 서버만 부른다).
 * 셋이 다 있을 때만 켜진다(isPitch3dV2Configured) — 없으면 화면이 v2 단추를 숨긴다(검토 2절 NotConfigured).
 *
 * GPU 쪽 약속(services/pitch3d-gpu/README.md):
 *   POST {URL}/jobs            본문 GpuJobRequest → 200 { callId }
 *   GET  {URL}/jobs/{callId}   → { status: pending | running | done | failed, stage?, stages?, code? }
 * 영상은 서명 주소(1시간)로 받고 결과는 서명 올리기 주소(1회용)로 올린다 — 저장소 키를 GPU 회사에 주지 않는다(검토 3절).
 */

export type GpuJobRequest = {
  jobId: string;
  engine: string;
  side: { url: string };
  back: { url: string };
  meta: {
    hand: 'R' | 'L';
    slowmoFps: number | null;
    screenRecorded: boolean;
    heightCm: number | null;
  };
  /** 결과 파일을 PUT 할 서명 주소(토큰 포함) */
  result: { uploadUrl: string };
};

const START_TIMEOUT_MS = 10_000;
const STATUS_TIMEOUT_MS = 8_000;

export function isPitch3dV2Configured(): boolean {
  return Boolean(
    process.env.PITCH3D_GPU_URL &&
    process.env.PITCH3D_GPU_KEY &&
    process.env.PITCH3D_GPU_SECRET
  );
}

function base() {
  return (process.env.PITCH3D_GPU_URL ?? '').replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Modal-Key': process.env.PITCH3D_GPU_KEY ?? '',
    'Modal-Secret': process.env.PITCH3D_GPU_SECRET ?? '',
  };
}

/** 작업을 건다 — 10초 안에 답이 없거나 5xx 면 gpu, 401 · 403 이면 gpu-auth(검토 2절) */
export async function startGpuJob(
  req: GpuJobRequest
): Promise<{ callId: string } | { error: 'gpu' | 'gpu-auth' }> {
  if (!isPitch3dV2Configured()) return { error: 'gpu' };
  try {
    const res = await fetch(`${base()}/jobs`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(START_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return { error: 'gpu-auth' };
    if (!res.ok) {
      console.error('[pitch3d v2] start', res.status, await res.text().catch(() => ''));
      return { error: 'gpu' };
    }
    const data = (await res.json().catch(() => null)) as { callId?: unknown } | null;
    if (!data || typeof data.callId !== 'string' || !data.callId)
      return { error: 'gpu' };
    return { callId: data.callId };
  } catch (err) {
    console.error('[pitch3d v2] start', err instanceof Error ? err.message : err);
    return { error: 'gpu' };
  }
}

const STAGES: V2Stage[] = ['download', 'pose', 'segment', 'fit', 'upload'];

/** 상태를 묻는다 — 답이 이상하면 unknown(다음 물음에 다시, 검토 2절 StatusError) */
export async function getGpuStatus(callId: string): Promise<GpuStatus> {
  if (!isPitch3dV2Configured() || !/^[A-Za-z0-9_-]{1,128}$/.test(callId))
    return { kind: 'unknown' };
  try {
    const res = await fetch(`${base()}/jobs/${encodeURIComponent(callId)}`, {
      headers: headers(),
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403)
      return { kind: 'failed', code: 'gpu-auth' };
    if (!res.ok) return { kind: 'unknown' };
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) return { kind: 'unknown' };
    const stages: Partial<Record<V2Stage, number>> = {};
    if (data.stages && typeof data.stages === 'object') {
      for (const s of STAGES) {
        const v = (data.stages as Record<string, unknown>)[s];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) stages[s] = v;
      }
    }
    switch (data.status) {
      case 'pending':
        return { kind: 'pending' };
      case 'running':
        return {
          kind: 'running',
          stage: STAGES.includes(data.stage as V2Stage)
            ? (data.stage as V2Stage)
            : undefined,
          stages,
        };
      case 'done':
        return { kind: 'done', stages };
      case 'failed': {
        const code =
          typeof data.code === 'string' && data.code in V2_FAIL_TEXT
            ? (data.code as V2FailCode)
            : 'internal';
        return { kind: 'failed', code, stages };
      }
      default:
        return { kind: 'unknown' };
    }
  } catch (err) {
    console.error('[pitch3d v2] status', err instanceof Error ? err.message : err);
    return { kind: 'unknown' };
  }
}
