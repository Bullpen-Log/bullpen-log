import 'server-only';
import { createPlaybackUrls, videoBucket } from '@/lib/storage';
import {
  LAB_VIEWS,
  readLabMeta,
  type LabMeta,
  type LabView,
} from '@/lib/pitch-lab-meta';
import {
  isV2JobId,
  readPitch3dV2Job,
  type Pitch3dV2Job,
} from '@/lib/pitch-3d/v2/contract';

/**
 * 투구 분석 실험실(베타)의 샘플 저장 — 비공개 영상 버킷의 `{userId}/pitch-lab/{샘플 번호}/` 에 둔다.
 *
 *   side.mp4 · back.mp4          옆 · 뒤 영상(브라우저가 서명 주소로 직접 올린다 — 서버를 안 거쳐 큰 파일도 된다)
 *   meta.json                    촬영 정보(lib/pitch-lab-meta.ts)
 *   analysis.json                (옛 v1 결과 — 2026-10-08 v1 화면을 뺐다. 남은 파일은 읽지 않고 폴더를 지울 때 같이 지워진다)
 *   job.json                     v2(서버 GPU) 작업 상태(lib/pitch-3d/v2/contract.ts Pitch3dV2Job) — 서버 동작 둘(요청 · 상태 묻기)만 쓴다
 *   analysis-v2-{jobId}.json     v2 결과 — GPU 함수가 서명 올리기 주소로 올린다. 작업마다 파일이 따로라 다시 분석 중에도 이전 결과가 남는다
 *
 * 버킷이 받는 파일 종류에 application/json 이 있어야 한다(2026-10-08 더함 — video/* · image/jpeg 뿐이면 meta.json 이 거절된다).
 * DB 표를 만들지 않는다 — 베타 실험용이라 구조를 굳히지 않고, 사용자 폴더라 소유권 확인(isOwnedBy)이 그대로 걸린다.
 * 지우면 폴더째 지운다.
 */

const LAB_DIR = 'pitch-lab';
const JOB_FILE = 'job.json';
const V2_PREFIX = 'analysis-v2-';
const v2File = (jobId: string) => `${V2_PREFIX}${jobId}.json`;
/** 폴더 안 파일 수 상한 — 영상 2 · 정보 · v1 결과 · job + v2 결과(작업마다 하나) */
const FOLDER_LIMIT = 100;

const folder = (userId: string, id: string) => `${userId}/${LAB_DIR}/${id}`;

export type LabSample = {
  id: string;
  /** 올리다 멈춰 정보가 없으면 null — 목록에서 지울 수 있게 보인다 */
  meta: LabMeta | null;
  videos: Partial<Record<LabView, { path: string; url: string | null }>>;
  /** v2(서버) — 작업 상태와 결과 파일이 있는 작업 번호들 */
  v2: { job: Pitch3dV2Job | null; resultIds: string[] };
};

/** 브라우저가 영상 하나를 직접 올릴 임시 주소 — 같은 자리에 다시 올리면 덮어쓴다 */
export async function createLabUploadTarget(
  userId: string,
  id: string,
  view: LabView,
  fileName: string
) {
  const ext =
    fileName
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 5) || 'mp4';
  const path = `${folder(userId, id)}/${view}.${ext}`;
  const { data, error } = await videoBucket().createSignedUploadUrl(path, {
    upsert: true,
  });
  if (error || !data)
    throw new Error(error?.message ?? '업로드 주소를 만들지 못했어요.');
  return { path: data.path, signedUrl: data.signedUrl, token: data.token };
}

async function putJson(path: string, value: unknown) {
  const { error } = await videoBucket().upload(
    path,
    new Blob([JSON.stringify(value)], { type: 'application/json' }),
    { upsert: true, contentType: 'application/json' }
  );
  if (error) throw new Error(error.message);
}

async function getJson(path: string): Promise<unknown | null> {
  const { data, error } = await videoBucket().download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

export async function saveLabMeta(userId: string, id: string, meta: LabMeta) {
  await putJson(`${folder(userId, id)}/meta.json`, meta);
}

/* ───────────────────────────── v2(서버 GPU) ───────────────────────────── */

/** job.json — 없거나 모양이 틀리면 null(없는 것과 같이 다룬다) */
export async function loadLabJob(
  userId: string,
  id: string
): Promise<Pitch3dV2Job | null> {
  return readPitch3dV2Job(await getJson(`${folder(userId, id)}/${JOB_FILE}`));
}

export async function saveLabJob(userId: string, id: string, job: Pitch3dV2Job) {
  await putJson(`${folder(userId, id)}/${JOB_FILE}`, job);
}

/** v2 결과 읽기 — 없으면 null(모양 검사 readPitch3dV2Result 는 부르는 쪽이) */
export async function loadV2Result(
  userId: string,
  id: string,
  jobId: string
): Promise<unknown | null> {
  if (!isV2JobId(jobId)) return null;
  return getJson(`${folder(userId, id)}/${v2File(jobId)}`);
}

/** GPU 함수가 결과를 PUT 할 서명 주소(토큰 포함, 1회용 · 같은 자리면 덮어씀) */
export async function createV2ResultUploadUrl(
  userId: string,
  id: string,
  jobId: string
): Promise<string> {
  const { data, error } = await videoBucket().createSignedUploadUrl(
    `${folder(userId, id)}/${v2File(jobId)}`,
    { upsert: true }
  );
  if (error || !data)
    throw new Error(error?.message ?? '결과 올리기 주소를 만들지 못했어요.');
  return data.signedUrl;
}

/** 폴더 파일 목록 → 영상 경로 · v1 결과 · v2 작업 번호들 */
async function scanFolder(userId: string, id: string) {
  const { data: files, error } = await videoBucket().list(folder(userId, id), {
    limit: FOLDER_LIMIT,
  });
  if (error) throw new Error(error.message);
  const names = (files ?? []).map((f) => f.name);
  const videos: LabSample['videos'] = {};
  for (const view of LAB_VIEWS) {
    const f = names.find((x) => x.startsWith(`${view}.`));
    if (f) videos[view] = { path: `${folder(userId, id)}/${f}`, url: null };
  }
  const resultIds = names
    .filter((n) => n.startsWith(V2_PREFIX) && n.endsWith('.json'))
    .map((n) => n.slice(V2_PREFIX.length, -'.json'.length))
    .filter(isV2JobId);
  return {
    names,
    videos,
    hasJob: names.includes(JOB_FILE),
    resultIds,
  };
}

/** 옆 · 뒤 영상의 재생(내려받기) 서명 주소 — GPU 함수에 준다. 둘 중 하나가 없으면 null */
export async function labVideoUrls(
  userId: string,
  id: string
): Promise<{ side: string; back: string } | null> {
  const { videos } = await scanFolder(userId, id);
  const s = videos.side?.path;
  const b = videos.back?.path;
  if (!s || !b) return null;
  const urls = await createPlaybackUrls([s, b]);
  if (!urls[s] || !urls[b]) return null;
  return { side: urls[s], back: urls[b] };
}

async function readSample(userId: string, id: string): Promise<LabSample> {
  const scan = await scanFolder(userId, id);
  const [metaRaw, jobRaw] = await Promise.all([
    getJson(`${folder(userId, id)}/meta.json`),
    scan.hasJob ? getJson(`${folder(userId, id)}/${JOB_FILE}`) : Promise.resolve(null),
  ]);
  let meta: LabMeta | null = null;
  if (metaRaw != null) {
    try {
      meta = readLabMeta(metaRaw, '');
    } catch {
      meta = null;
    }
  }
  return {
    id,
    meta,
    videos: scan.videos,
    v2: { job: readPitch3dV2Job(jobRaw), resultIds: scan.resultIds },
  };
}

async function attachUrls(samples: LabSample[]) {
  const paths = samples.flatMap((s) => Object.values(s.videos).map((v) => v.path));
  const urls = await createPlaybackUrls(paths);
  for (const s of samples) {
    for (const v of Object.values(s.videos)) v.url = urls[v.path] ?? null;
  }
}

/** 샘플 하나(결과 화면) — 폴더가 비었으면 null */
export async function loadLabSample(
  userId: string,
  id: string
): Promise<LabSample | null> {
  const sample = await readSample(userId, id);
  if (!sample.meta && Object.keys(sample.videos).length === 0) return null;
  await attachUrls([sample]);
  return sample;
}

/** 내 샘플 — 최근 것부터. 재생 주소까지 붙인다 */
export async function listLabSamples(userId: string): Promise<LabSample[]> {
  const bucket = videoBucket();
  const { data: dirs, error } = await bucket.list(`${userId}/${LAB_DIR}`, {
    limit: 200,
  });
  if (error) throw new Error(error.message);
  /* 폴더는 id 가 없다 */
  const ids = (dirs ?? []).filter((d) => d.id == null).map((d) => d.name);
  const samples = await Promise.all(ids.map((id) => readSample(userId, id)));
  await attachUrls(samples);
  return samples.sort((a, b) =>
    (b.meta?.createdAt ?? '').localeCompare(a.meta?.createdAt ?? '')
  );
}

/** 샘플 하나를 폴더째 지운다 */
export async function deleteLabSample(userId: string, id: string) {
  const bucket = videoBucket();
  const { data: files, error } = await bucket.list(folder(userId, id), {
    limit: FOLDER_LIMIT,
  });
  if (error) throw new Error(error.message);
  const paths = (files ?? []).map((f) => `${folder(userId, id)}/${f.name}`);
  if (paths.length === 0) return;
  const removed = await bucket.remove(paths);
  if (removed.error) throw new Error(removed.error.message);
}
