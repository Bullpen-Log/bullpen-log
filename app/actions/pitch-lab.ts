'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import {
  createV2ResultUploadUrl,
  deleteLabSample,
  labVideoUrls,
  loadLabJob,
  loadV2Result,
  saveLabJob,
  saveLabMeta,
} from '@/lib/pitch-lab';
import {
  applyGpuStatus,
  canRequestV2,
  failV2Job,
  isV2JobId,
  newV2Job,
  PITCH3D_V2_VERSION,
  readPitch3dV2Result,
  type GpuStatus,
  type Pitch3dV2Job,
  type Pitch3dV2Result,
} from '@/lib/pitch-3d/v2/contract';
import {
  getGpuStatus,
  isPitch3dV2Configured,
  startGpuJob,
} from '@/lib/pitch-3d/v2/gpu-client';
import { isLabId, readLabMeta } from '@/lib/pitch-lab-meta';

/**
 * 투구 분석 실험실(베타)의 서버 동작 — 관리자만. 영상은 브라우저가 이미 올렸고(app/api/pitch-lab/upload-url), 여기서는 촬영 정보 ·
 * 분석 결과 · v2 작업 상태를 다룬다. 오류 글은 해요체 한 줄(화면이 그대로 보인다).
 *
 * v2(서버 GPU, 설계 pitch-3d-quality.md 기술 D1): job.json 을 쓰는 것은 여기 둘(requestPitch3dV2 · checkPitch3dV2)뿐이다.
 * 화면은 열려 있는 동안 5초마다 checkPitch3dV2 를 부르고, 그때 서버 동작이 GPU 에 작업 번호로 상태를 물어 job.json 을 갱신한다.
 */

type Result = { ok: true } | { error: string };

const LAB_PATH = '/videos/lab';
const STORAGE_ERROR = '저장소에 쓰지 못했어요. 다시 해 주세요.';

async function admin() {
  const user = await requireUser();
  return user.role === 'ADMIN' ? user : null;
}

/** 저장소 쓰기 — 한 번 다시(검토 2절 StorageError) */
async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}

export async function saveLabSample(input: {
  id: string;
  meta: unknown;
}): Promise<Result> {
  const user = await admin();
  if (!user) return { error: '관리자만 할 수 있어요.' };
  if (!isLabId(input.id)) return { error: '샘플 번호를 확인할 수 없어요.' };
  try {
    await saveLabMeta(
      user.id,
      input.id,
      readLabMeta(input.meta, new Date().toISOString())
    );
  } catch {
    return { error: '정보를 저장하지 못했어요. 다시 해 주세요.' };
  }
  revalidatePath(LAB_PATH);
  return { ok: true };
}

export async function removeLabSample(input: { id: string }): Promise<Result> {
  const user = await admin();
  if (!user) return { error: '관리자만 할 수 있어요.' };
  if (!isLabId(input.id)) return { error: '샘플 번호를 확인할 수 없어요.' };
  try {
    await deleteLabSample(user.id, input.id);
  } catch {
    return { error: '지우지 못했어요. 다시 해 주세요.' };
  }
  revalidatePath(LAB_PATH);
  return { ok: true };
}

/* ───────────────────────────── v2(서버 GPU) ───────────────────────────── */

/**
 * v2 분석을 건다(검토 2절 요청 쪽 오류 지도: Forbidden · BadId · NoConsent · NotConfigured · MissingVideo · Busy · StorageError · Gpu*).
 * 순서: 검사 → job.json 을 queued 로 먼저 쓴다(두 번 누름을 서버가 Busy 로 막게) → 서명 주소 둘 → GPU 걸기 → 번호를 적는다.
 * GPU 를 못 부르면 job 을 failed(gpu · gpu-auth)로 — 사용자는 한 줄 보고 다시 할 수 있다.
 */
export async function requestPitch3dV2(input: {
  id: string;
  consent: boolean;
}): Promise<{ ok: true; job: Pitch3dV2Job } | { error: string }> {
  const user = await admin();
  if (!user) return { error: '관리자만 할 수 있어요.' };
  if (!isLabId(input.id)) return { error: '샘플을 찾지 못했어요.' };
  if (!isPitch3dV2Configured()) return { error: '분석 서버 설정이 없어요.' };
  if (input.consent !== true)
    return { error: '영상을 분석 서버로 보내는 동의를 확인해 주세요.' };

  let prev: Pitch3dV2Job | null;
  let urls: { side: string; back: string } | null;
  try {
    [prev, urls] = await Promise.all([
      loadLabJob(user.id, input.id),
      labVideoUrls(user.id, input.id),
    ]);
  } catch {
    return { error: STORAGE_ERROR };
  }
  if (!urls) return { error: '옆 · 뒤 영상이 다 있어야 해요.' };
  const now = Date.now();
  const can = canRequestV2(prev, now);
  if ('error' in can) return can;

  const nowIso = new Date(now).toISOString();
  let job = newV2Job(prev, {
    jobId: crypto.randomUUID(),
    requestedBy: user.id,
    consentAt: nowIso,
    now: nowIso,
  });
  try {
    await retryOnce(() => saveLabJob(user.id, input.id, job));
  } catch {
    return { error: STORAGE_ERROR };
  }

  let uploadUrl: string;
  try {
    uploadUrl = await retryOnce(() =>
      createV2ResultUploadUrl(user.id, input.id, job.jobId)
    );
  } catch {
    job = failV2Job(job, 'upload', Date.now());
    await saveLabJob(user.id, input.id, job).catch(() => undefined);
    revalidatePath(LAB_PATH);
    return { error: STORAGE_ERROR };
  }

  const meta = readLabMeta(null, nowIso);
  const started = await startGpuJob({
    jobId: job.jobId,
    engine: PITCH3D_V2_VERSION,
    side: { url: urls.side },
    back: { url: urls.back },
    meta: {
      hand: meta.hand,
      slowmoFps: meta.slowmoFps,
      screenRecorded: meta.screenRecorded,
      heightCm: meta.heightCm,
    },
    result: { uploadUrl },
  });
  job =
    'error' in started
      ? failV2Job(job, started.error, Date.now())
      : { ...job, gpuCallId: started.callId };
  try {
    await retryOnce(() => saveLabJob(user.id, input.id, job));
  } catch {
    /* GPU 는 이미 돌고 있다 — 번호를 못 적었으면 다음 물음이 gpu 실패로 돌린다(검토 2절). 글은 한 줄 */
    return { error: STORAGE_ERROR };
  }
  revalidatePath(LAB_PATH);
  return { ok: true, job };
}

/**
 * 상태 묻기 — 화면이 5초마다 부른다(검토 1절). 끝난 작업이면 GPU 에 묻지 않는다. GPU 가 done 이라면 결과 파일을 읽어 모양이
 * 맞을 때만 done 으로(검토 4절 '일부만' · 2절 BadResult). 지금 작업 번호의 답만 적는다(applyGpuStatus).
 */
export async function checkPitch3dV2(input: {
  id: string;
}): Promise<{ job: Pitch3dV2Job | null } | { error: string }> {
  const user = await admin();
  if (!user) return { error: '관리자만 할 수 있어요.' };
  if (!isLabId(input.id)) return { error: '샘플을 찾지 못했어요.' };
  let job: Pitch3dV2Job | null;
  try {
    job = await loadLabJob(user.id, input.id);
  } catch {
    return { error: '작업 상태를 읽지 못했어요.' };
  }
  if (!job || job.status === 'done' || job.status === 'failed') return { job };

  const now = Date.now();
  let status: GpuStatus = job.gpuCallId
    ? await getGpuStatus(job.gpuCallId)
    : { kind: 'failed', code: 'gpu' };
  let resultSaved = false;
  if (status.kind === 'done') {
    const raw = await loadV2Result(user.id, input.id, job.jobId).catch(() => null);
    if (raw != null) {
      if (readPitch3dV2Result(raw)) resultSaved = true;
      else status = { kind: 'failed', code: 'internal', stages: status.stages };
    }
  }
  const next = applyGpuStatus(job, job.jobId, status, resultSaved, now);
  if (next !== job) {
    try {
      await retryOnce(() => saveLabJob(user.id, input.id, next));
    } catch {
      return { error: '작업 상태를 저장하지 못했어요.' };
    }
    revalidatePath(LAB_PATH);
  }
  return { job: next };
}

/** v2 결과 읽기 — 지금 작업 또는 보여 줄 작업(shownJobId)의 것만. 없거나 모양이 틀리면 null */
export async function loadPitch3dV2(input: {
  id: string;
  jobId: string;
}): Promise<{ result: Pitch3dV2Result | null } | { error: string }> {
  const user = await admin();
  if (!user) return { error: '관리자만 할 수 있어요.' };
  if (!isLabId(input.id) || !isV2JobId(input.jobId))
    return { error: '샘플을 찾지 못했어요.' };
  try {
    return {
      result: readPitch3dV2Result(await loadV2Result(user.id, input.id, input.jobId)),
    };
  } catch {
    return { error: '분석 결과를 불러오지 못했어요.' };
  }
}
