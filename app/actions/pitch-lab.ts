'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import {
  createV2ResultUploadUrl,
  deleteLabSample,
  findLabOwner,
  labVideoUrls,
  loadLabGuard,
  loadLabJob,
  loadLabMetaRaw,
  loadV2Result,
  saveLabGuard,
  saveLabJob,
  saveLabMeta,
} from '@/lib/pitch-lab';
import { guardBlock, readLabGuard, recordFail } from '@/lib/pitch-lab-guard';
import {
  applyGpuStatus,
  canRequestV2,
  failV2Job,
  isV2JobId,
  newV2Job,
  PITCH3D_V2_VERSION,
  readPitch3dV2Result,
  V2_VIDEO_FAULT,
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
 * 3D 동작 분석(베타, 옛 이름 투구 분석 실험실)의 서버 동작 — 로그인한 누구나(2026-10-14 일반 사용자에게 엶). 사람마다 자기 폴더만,
 * 관리자는 관리자끼리 같이 본다(lib/pitch-lab.ts ownerIds). GPU 비용은 lib/pitch-lab-guard.ts 가 지킨다. 영상은 브라우저가 이미 올렸고(app/api/pitch-lab/upload-url), 여기서는 촬영 정보 ·
 * 분석 결과 · v2 작업 상태를 다룬다. 오류 글은 해요체 한 줄(화면이 그대로 보인다).
 *
 * v2(서버 GPU, 설계 pitch-3d-quality.md 기술 D1): job.json 을 쓰는 것은 여기 둘(requestPitch3dV2 · checkPitch3dV2)뿐이다.
 * 화면은 열려 있는 동안 5초마다 checkPitch3dV2 를 부르고, 그때 서버 동작이 GPU 에 작업 번호로 상태를 물어 job.json 을 갱신한다.
 */

type Result = { ok: true } | { error: string };

const LAB_PATH = '/videos/lab';
const STORAGE_ERROR = '저장소에 쓰지 못했어요. 다시 해 주세요.';

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
  const user = await requireUser();
  if (!isLabId(input.id)) return { error: '샘플 번호를 확인할 수 없어요.' };
  try {
    await saveLabMeta(
      (await findLabOwner(input.id, user)) ?? user.id,
      input.id,
      /* 마커 샘플은 관리자 스크립트만 — 일반 사용자가 보낸 kind 는 늘 sample */
      ((m) => (user.role === 'ADMIN' ? m : { ...m, kind: 'sample' as const }))(
        readLabMeta(input.meta, new Date().toISOString())
      )
    );
  } catch {
    return { error: '정보를 저장하지 못했어요. 다시 해 주세요.' };
  }
  revalidatePath(LAB_PATH);
  return { ok: true };
}

export async function removeLabSample(input: { id: string }): Promise<Result> {
  const user = await requireUser();
  if (!isLabId(input.id)) return { error: '샘플 번호를 확인할 수 없어요.' };
  try {
    const owner = await findLabOwner(input.id, user);
    if (owner) await deleteLabSample(owner, input.id);
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
  const user = await requireUser();
  if (!isLabId(input.id)) return { error: '샘플을 찾지 못했어요.' };
  if (!isPitch3dV2Configured()) return { error: '분석 서버 설정이 없어요.' };
  if (input.consent !== true)
    return { error: '영상을 분석 서버로 보내는 동의를 확인해 주세요.' };
  /* 샘플이 든 폴더 — 자기 것(관리자는 관리자끼리 같이, lib/pitch-lab.ts findLabOwner) */
  const owner = await findLabOwner(input.id, user).catch(() => null);
  if (!owner) return { error: '샘플을 찾지 못했어요.' };

  let prev: Pitch3dV2Job | null;
  let urls: { side: string; back: string } | null;
  let metaRaw: unknown;
  try {
    [prev, urls, metaRaw] = await Promise.all([
      loadLabJob(owner, input.id),
      labVideoUrls(owner, input.id),
      loadLabMetaRaw(owner, input.id),
    ]);
  } catch {
    return { error: STORAGE_ERROR };
  }
  if (!urls) return { error: '옆 · 뒤 영상이 다 있어야 해요.' };
  const now = Date.now();
  const can = canRequestV2(prev, now);
  if ('error' in can) return can;
  /*
   * GPU 비용 지키기(lib/pitch-lab-guard.ts) — 같은 엔진 판에서 영상 탓으로 실패한 샘플 · 파일은 다시 안 돌리고, 하루 실패 10번이면 멈춘다.
   * 엔진 판이 바뀌면 같은 영상도 다시 해 볼 수 있다(고친 엔진으로는 될 수 있어서).
   */
  if (
    prev?.status === 'failed' &&
    prev.fail &&
    V2_VIDEO_FAULT.has(prev.fail.code) &&
    prev.engine === PITCH3D_V2_VERSION
  )
    return { error: '이 영상은 분석하지 못했어요. 같은 영상으로는 또 실패해요. 촬영 안내대로 다시 찍어 올려 주세요.' };
  const meta = readLabMeta(metaRaw, new Date(now).toISOString());
  const fps = Object.values(meta.files).flatMap((f) => (f?.fp ? [f.fp] : []));
  const blocked = guardBlock(await loadLabGuard(user.id).catch(() => readLabGuard(null)), {
    nowMs: now,
    fps,
    engine: PITCH3D_V2_VERSION,
  });
  if (blocked) return { error: blocked };

  const nowIso = new Date(now).toISOString();
  let job = newV2Job(prev, {
    jobId: crypto.randomUUID(),
    requestedBy: user.id,
    consentAt: nowIso,
    now: nowIso,
  });
  try {
    await retryOnce(() => saveLabJob(owner, input.id, job));
  } catch {
    return { error: STORAGE_ERROR };
  }

  let uploadUrl: string;
  try {
    uploadUrl = await retryOnce(() =>
      createV2ResultUploadUrl(owner, input.id, job.jobId)
    );
  } catch {
    job = failV2Job(job, 'upload', Date.now());
    await saveLabJob(owner, input.id, job).catch(() => undefined);
    revalidatePath(LAB_PATH);
    return { error: STORAGE_ERROR };
  }

  /* 샘플의 촬영 정보(던지는 손 · 슬로모 · 화면 녹화 · 키, 위 meta) — 예전엔 null 로 읽어 늘 기본값(오른손 · 화면 녹화 · 슬로모 모름)이 갔다 */
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
    await retryOnce(() => saveLabJob(owner, input.id, job));
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
  const user = await requireUser();
  if (!isLabId(input.id)) return { error: '샘플을 찾지 못했어요.' };
  const owner = await findLabOwner(input.id, user).catch(() => null);
  if (!owner) return { job: null };
  let job: Pitch3dV2Job | null;
  try {
    job = await loadLabJob(owner, input.id);
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
    const raw = await loadV2Result(owner, input.id, job.jobId).catch(() => null);
    if (raw != null) {
      if (readPitch3dV2Result(raw)) resultSaved = true;
      else status = { kind: 'failed', code: 'internal', stages: status.stages };
    }
  }
  const next = applyGpuStatus(job, job.jobId, status, resultSaved, now);
  if (next !== job) {
    try {
      await retryOnce(() => saveLabJob(owner, input.id, next));
    } catch {
      return { error: '작업 상태를 저장하지 못했어요.' };
    }
    if (next.status === 'failed' && next.fail) await countFail(owner, input.id, next, now);
    revalidatePath(LAB_PATH);
  }
  return { job: next };
}

/**
 * 실패를 요청한 사람의 기록에 센다(하루 상한 · 영상 탓이면 파일 지문). 못 적어도 분석 흐름은 막지 않는다.
 * ponytail: 두 화면이 같은 순간에 상태를 물으면 한 실패가 두 번 셀 수 있다 — 상한이 넉넉해(10) 둔다, 잦으면 job 에 '셌음' 표시를 둔다.
 */
async function countFail(owner: string, id: string, job: Pitch3dV2Job, nowMs: number) {
  if (!job.fail) return;
  try {
    const meta = readLabMeta(await loadLabMetaRaw(owner, id), new Date(nowMs).toISOString());
    const fps = Object.values(meta.files).flatMap((f) => (f?.fp ? [f.fp] : []));
    const g = await loadLabGuard(job.requestedBy);
    const next = recordFail(g, { nowMs, code: job.fail.code, fps, engine: job.engine });
    if (next !== g) await saveLabGuard(job.requestedBy, next);
  } catch {
    /* 기록 못 함 — 다음 실패에 다시 */
  }
}

/** v2 결과 읽기 — 지금 작업 또는 보여 줄 작업(shownJobId)의 것만. 없거나 모양이 틀리면 null */
export async function loadPitch3dV2(input: {
  id: string;
  jobId: string;
}): Promise<{ result: Pitch3dV2Result | null } | { error: string }> {
  const user = await requireUser();
  if (!isLabId(input.id) || !isV2JobId(input.jobId))
    return { error: '샘플을 찾지 못했어요.' };
  const owner = await findLabOwner(input.id, user).catch(() => null);
  if (!owner) return { result: null };
  try {
    return {
      result: readPitch3dV2Result(await loadV2Result(owner, input.id, input.jobId)),
    };
  } catch {
    return { error: '분석 결과를 불러오지 못했어요.' };
  }
}
