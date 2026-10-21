import 'server-only';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls, videoBucket } from '@/lib/storage';
import { readLabGuard, type LabGuard } from '@/lib/pitch-lab-guard';
import { readMoov, videoEditShift } from '@/lib/pitch-lab-file';
import {
  LAB_VIEWS,
  readLabMeta,
  type LabMeta,
  type LabSport,
  type LabView,
} from '@/lib/pitch-lab-meta';
import {
  isV2JobId,
  readPitch3dV2Job,
  type Pitch3dV2Job,
} from '@/lib/pitch-3d/v2/contract';
import { jobReportSummary, type ReportSummary } from '@/lib/pitch-3d/v2/report';
import { FOCUS_SESSIONS, readProgramState } from '@/lib/mechanics/program';

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
 *
 * 관리자끼리 같이 쓴다(2026-10-13 김민: "투구 분석은 관리자 모두 접근 가능하게") — 샘플은 올린 관리자 폴더에 그대로 두고, 목록은 모든 관리자
 * 폴더를 모으고(listLabSamples), 샘플 하나를 다룰 때는 그 샘플이 든 관리자 폴더를 찾아(findLabOwner) 쓴다. 새 샘플은 올린 사람 폴더에.
 */

const LAB_DIR = 'pitch-lab';
const JOB_FILE = 'job.json';
const V2_PREFIX = 'analysis-v2-';
const v2File = (jobId: string) => `${V2_PREFIX}${jobId}.json`;
/** 폴더 안 파일 수 상한 — 영상 2 · 정보 · v1 결과 · job + v2 결과(작업마다 하나) */
const FOLDER_LIMIT = 100;

/**
 * 종목별 폴더 — 투구 `pitch-lab`, 타자 3D 스윙 분석 `swing-lab`(2026-10-21). 아래 함수들의 끝 인자 sport 가 정하고, 안 주면 투구라 예전 그대로다.
 * v2 GPU(작업 · 결과 · 비용 지키기)는 투구만 — 타자 모델은 샘플을 모은 뒤에 만든다.
 */
const labDir = (sport: LabSport = 'pitch') => (sport === 'hit' ? 'swing-lab' : LAB_DIR);
const folder = (userId: string, id: string, sport: LabSport = 'pitch') => `${userId}/${labDir(sport)}/${id}`;

/** 올릴 수 있는 영상 자리 — 짝 둘(side · back) + 마커 샘플의 ③ · ④ 카메라(타자 마커 샘플은 앱 · 웹에서 올린다) */
export type LabUploadView = LabView | 'cam3' | 'cam4';

export type LabSample = {
  id: string;
  /** 샘플이 든 폴더의 관리자(올린 사람) */
  ownerId: string;
  /** 올리다 멈춰 정보가 없으면 null — 목록에서 지울 수 있게 보인다 */
  meta: LabMeta | null;
  videos: Partial<Record<LabView, { path: string; url: string | null }>>;
  /** 마커 샘플의 ③ · ④ 카메라(cam3.* · cam4.*) — 분석은 옆 · 뒤만 쓰고, 이것은 보기 · 정답지용 */
  extras: { key: 'cam3' | 'cam4'; path: string; url: string | null }[];
  /** v2(서버) — 작업 상태와 결과 파일이 있는 작업 번호들 */
  v2: { job: Pitch3dV2Job | null; resultIds: string[] };
};

/** 브라우저가 영상 하나를 직접 올릴 임시 주소 — 같은 자리에 다시 올리면 덮어쓴다 */
export async function createLabUploadTarget(
  userId: string,
  id: string,
  view: LabUploadView,
  fileName: string,
  sport: LabSport = 'pitch'
) {
  const ext =
    fileName
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 5) || 'mp4';
  const path = `${folder(userId, id, sport)}/${view}.${ext}`;
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

/** 사람마다 GPU 비용 지키기 기록(lib/pitch-lab-guard.ts) — 관리자 폴더 바로 밑 파일이라 샘플 목록(폴더만 센다)에 안 섞인다 */
const guardPath = (userId: string) => `${userId}/${LAB_DIR}/_guard.json`;
export async function loadLabGuard(userId: string): Promise<LabGuard> {
  return readLabGuard(await getJson(guardPath(userId)));
}
export async function saveLabGuard(userId: string, guard: LabGuard) {
  await putJson(guardPath(userId), guard);
}

/** 촬영 정보(meta.json) 원본 — 없으면 null. 모양 검사는 readLabMeta 가 */
export async function loadLabMetaRaw(userId: string, id: string, sport: LabSport = 'pitch'): Promise<unknown | null> {
  return getJson(`${folder(userId, id, sport)}/meta.json`);
}

export async function saveLabMeta(userId: string, id: string, meta: LabMeta, sport: LabSport = 'pitch') {
  await putJson(`${folder(userId, id, sport)}/meta.json`, meta);
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
async function scanFolder(userId: string, id: string, sport: LabSport = 'pitch') {
  const dir = folder(userId, id, sport);
  const { data: files, error } = await videoBucket().list(dir, {
    limit: FOLDER_LIMIT,
  });
  if (error) throw new Error(error.message);
  const names = (files ?? []).map((f) => f.name);
  const videos: LabSample['videos'] = {};
  for (const view of LAB_VIEWS) {
    const f = names.find((x) => x.startsWith(`${view}.`));
    if (f) videos[view] = { path: `${dir}/${f}`, url: null };
  }
  const extras: LabSample['extras'] = [];
  for (const key of ['cam3', 'cam4'] as const) {
    const f = names.find((x) => x.startsWith(`${key}.`));
    if (f) extras.push({ key, path: `${dir}/${f}`, url: null });
  }
  const resultIds = names
    .filter((n) => n.startsWith(V2_PREFIX) && n.endsWith('.json'))
    .map((n) => n.slice(V2_PREFIX.length, -'.json'.length))
    .filter(isV2JobId);
  return {
    names,
    videos,
    extras,
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

/*
 * 옆 · 뒤 영상의 편집 목록 앞머리(lib/pitch-lab-file.ts videoEditShift) — 결과 화면이 3D 시각에 더해 원본 영상 currentTime 으로 쓴다.
 * 서명 주소에 범위 요청으로 머리 상자만 훑고 moov 만 받는다(한 영상에 요청 4~5번). 영상은 같은 자리에 다시 안 올리니 자리로 기억한다.
 * ponytail: 서버 한 대 안의 Map — 인스턴스가 바뀌면 다시 읽는다(요청 몇 번이라 따로 저장하지 않음).
 */
const shiftCache = new Map<string, number>();

async function urlShift(url: string): Promise<number> {
  const signal = AbortSignal.timeout(5_000);
  const moov = await readMoov({
    size: Number.POSITIVE_INFINITY,
    read: async (start, end) => {
      const r = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` }, signal });
      if (!r.ok) throw new Error(`range ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  });
  return moov ? videoEditShift(moov) : 0;
}

export async function labVideoShifts(sample: LabSample): Promise<Record<LabView, number>> {
  const out: Record<LabView, number> = { side: 0, back: 0 };
  await Promise.all(
    LAB_VIEWS.map(async (view) => {
      const v = sample.videos[view];
      if (!v?.url) return;
      const kept = shiftCache.get(v.path);
      if (kept != null) {
        out[view] = kept;
        return;
      }
      try {
        out[view] = await urlShift(v.url);
        shiftCache.set(v.path, out[view]);
      } catch {
        /* 못 읽으면 0 — 예전처럼 3D 시각 그대로 */
      }
    })
  );
  return out;
}

async function readSample(userId: string, id: string, sport: LabSport = 'pitch'): Promise<LabSample> {
  const scan = await scanFolder(userId, id, sport);
  const [metaRaw, jobRaw] = await Promise.all([
    getJson(`${folder(userId, id, sport)}/meta.json`),
    scan.hasJob ? getJson(`${folder(userId, id, sport)}/${JOB_FILE}`) : Promise.resolve(null),
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
    ownerId: userId,
    meta,
    videos: scan.videos,
    extras: scan.extras,
    v2: { job: readPitch3dV2Job(jobRaw), resultIds: scan.resultIds },
  };
}

async function attachUrls(samples: LabSample[]) {
  const paths = samples.flatMap((s) => [
    ...Object.values(s.videos).map((v) => v.path),
    ...s.extras.map((v) => v.path),
  ]);
  const urls = await createPlaybackUrls(paths);
  for (const s of samples) {
    for (const v of Object.values(s.videos)) v.url = urls[v.path] ?? null;
    for (const v of s.extras) v.url = urls[v.path] ?? null;
  }
}

/** 관리자 id(실험실 폴더 주인 후보) */
async function adminIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** 보는 사람 — 3D 동작 분석은 2026-10-14 부터 일반 사용자에게도 연다 */
export type LabViewer = { id: string; role: string };

/**
 * 보는 사람이 볼 수 있는 폴더 주인 — 관리자는 관리자끼리 서로의 샘플(예전 그대로, 마커 샘플 포함), 일반 사용자는 자기 것만.
 * 관리자도 일반 사용자의 영상은 안 본다(남의 투구 영상).
 */
async function ownerIds(viewer: LabViewer): Promise<string[]> {
  if (viewer.role !== 'ADMIN') return [viewer.id];
  const ids = await adminIds();
  return [viewer.id, ...ids.filter((x) => x !== viewer.id)];
}

/**
 * 마커 샘플(meta.kind 'marker')을 보는 계정 하나 — 2026-10-16 김민: "마커 샘플은 이 계정만 보게". 다른 관리자(같은 사람의 다른 계정 포함)에게는
 * 목록 · 결과 화면 · 동작(분석 걸기 · 지우기 · 올리기) 모두에서 없는 샘플이다. 폴더는 그대로(지금 있는 마커는 다른 관리자 폴더에 있어도 보인다).
 */
const MARKER_VIEWER_ID = 'e0418384-8334-4c4b-85e3-b042cad362c5';
export const seesMarkerSamples = (viewer: LabViewer) => viewer.id === MARKER_VIEWER_ID;
/** 그 종목의 마커 샘플을 보는가 — 타자 마커 샘플은 3D 개발 관리자(대표관리자)끼리 같이 본다 */
const seesMarkers = (viewer: LabViewer, sport: LabSport) =>
  sport === 'hit' ? viewer.role === 'ADMIN' : seesMarkerSamples(viewer);

async function isMarkerFolder(uid: string, id: string, sport: LabSport = 'pitch'): Promise<boolean> {
  const raw = (await getJson(`${folder(uid, id, sport)}/meta.json`)) as { kind?: unknown } | null;
  return raw?.kind === 'marker';
}

/** 그 샘플이 든 폴더의 주인(보는 사람이 볼 수 있는 폴더 안에서) — 없으면 null. 자기 폴더를 먼저 본다 */
export async function findLabOwner(id: string, viewer: LabViewer, sport: LabSport = 'pitch'): Promise<string | null> {
  const order = await ownerIds(viewer);
  for (const uid of order) {
    const { data, error } = await videoBucket().list(folder(uid, id, sport), { limit: 1 });
    if (!error && (data ?? []).length > 0) {
      if (!seesMarkers(viewer, sport) && (await isMarkerFolder(uid, id, sport))) return null;
      return uid;
    }
  }
  return null;
}

/** 샘플 하나(결과 화면) — 볼 수 있는 폴더에 없거나 폴더가 비었으면 null */
export async function loadLabSample(id: string, viewer: LabViewer, sport: LabSport = 'pitch'): Promise<LabSample | null> {
  const owner = await findLabOwner(id, viewer, sport);
  if (!owner) return null;
  const sample = await readSample(owner, id, sport);
  if (!sample.meta && Object.keys(sample.videos).length === 0 && sample.extras.length === 0)
    return null;
  await attachUrls([sample]);
  return sample;
}

/** 보는 사람이 볼 수 있는 샘플(관리자는 모든 관리자 것, 일반 사용자는 자기 것) — 최근 것부터. 재생 주소까지 붙인다 */
export async function listLabSamples(viewer: LabViewer, sport: LabSport = 'pitch'): Promise<LabSample[]> {
  const bucket = videoBucket();
  const per = await Promise.all(
    (await ownerIds(viewer)).map(async (uid) => {
      const { data: dirs, error } = await bucket.list(`${uid}/${labDir(sport)}`, { limit: 200 });
      if (error) throw new Error(error.message);
      /* 폴더는 id 가 없다 */
      const ids = (dirs ?? []).filter((d) => d.id == null).map((d) => d.name);
      return Promise.all(ids.map((id) => readSample(uid, id, sport)));
    })
  );
  const samples = per
    .flat()
    .filter((s) => s.meta?.kind !== 'marker' || seesMarkers(viewer, sport));
  await attachUrls(samples);
  return samples.sort((a, b) =>
    (b.meta?.createdAt ?? '').localeCompare(a.meta?.createdAt ?? '')
  );
}

/** 샘플 하나를 폴더째 지운다 */
/**
 * 정보(meta.json)를 아직 못 쓴 새 샘플의 영상만 지운다 — 올린 뒤 저장 전 검사에 막힌 짝(app/actions/pitch-lab.ts saveLabSample).
 * 정보가 있는 샘플은 건드리지 않는다. 목록을 못 읽으면 던진다(아무것도 안 지움).
 */
/**
 * 내 가장 최근 진단 리포트의 요약(투구, 마커 샘플 빼고) — 메커니즘 요소 탭이 처방 없이 리포트만 받은 사람에게도 점을 찍게(설계 6-4절).
 * 샘플마다 job.json(요약이 든 곳) · meta.json 두 작은 파일만 읽는다(영상 주소 · 결과 파일은 안 읽음). 요약이 아직 없는 옛 결과는 건너뛴다.
 * ponytail: 샘플 수만큼 읽는다 — 한 사람 샘플이 수십 개를 넘으면 마지막 리포트 번호를 따로 적어 둔다.
 */
export async function loadLatestReport(
  userId: string
): Promise<{ reportId: string; finishedAt: string | null; summary: ReportSummary } | null> {
  const { data: dirs, error } = await videoBucket().list(`${userId}/${labDir('pitch')}`, { limit: 200 });
  if (error) throw new Error(error.message);
  const ids = (dirs ?? []).filter((d) => d.id == null).map((d) => d.name);
  const rows = await Promise.all(
    ids.map(async (id) => {
      const [jobRaw, metaRaw] = await Promise.all([
        getJson(`${folder(userId, id)}/${JOB_FILE}`),
        getJson(`${folder(userId, id)}/meta.json`),
      ]);
      const job = readPitch3dV2Job(jobRaw);
      const summary = jobReportSummary(job);
      if (!job || !summary) return null;
      let marker = false;
      try {
        marker = metaRaw != null && readLabMeta(metaRaw, '').kind === 'marker';
      } catch {
        /* 정보가 깨졌으면 투구로 */
      }
      return marker ? null : { reportId: id, finishedAt: job.finishedAt ?? job.requestedAt, summary };
    })
  );
  const found = rows.filter((r): r is NonNullable<typeof r> => r != null);
  found.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  return found[0] ?? null;
}

/**
 * 메커니즘에서 진행 중인 리포트 처방(메커니즘 세션 P2 — MechanicsProgram.progress.focus) — 리포트 화면의 [처방 시작]이 '처방 진행 중 n / 9'로.
 * 없으면 null. 마친 처방(done = 9)도 돌려준다(화면이 '마쳤어요'로).
 */
export async function loadFocusProgress(userId: string): Promise<{ reportId: string; done: number; total: number } | null> {
  const row = await prisma.mechanicsProgram.findUnique({ where: { userId }, select: { progress: true } });
  const focus = row ? readProgramState(row.progress).focus : null;
  return focus ? { reportId: focus.reportId, done: Math.min(focus.done, FOCUS_SESSIONS), total: FOCUS_SESSIONS } : null;
}

export async function deleteUnsavedLabSample(userId: string, id: string, sport: LabSport = 'pitch') {
  const { data: files, error } = await videoBucket().list(folder(userId, id, sport), {
    limit: FOLDER_LIMIT,
  });
  if (error) throw new Error(error.message);
  if ((files ?? []).some((f) => f.name === 'meta.json')) return;
  await deleteLabSample(userId, id, sport);
}

export async function deleteLabSample(userId: string, id: string, sport: LabSport = 'pitch') {
  const bucket = videoBucket();
  const { data: files, error } = await bucket.list(folder(userId, id, sport), {
    limit: FOLDER_LIMIT,
  });
  if (error) throw new Error(error.message);
  const paths = (files ?? []).map((f) => `${folder(userId, id, sport)}/${f.name}`);
  if (paths.length === 0) return;
  const removed = await bucket.remove(paths);
  if (removed.error) throw new Error(removed.error.message);
}
