import 'server-only';
import { createPlaybackUrls, videoBucket } from '@/lib/storage';
import { LAB_VIEWS, readLabMeta, type LabMeta, type LabView } from '@/lib/pitch-lab-meta';

/**
 * 투구 분석 실험실(베타)의 샘플 저장 — 비공개 영상 버킷의 `{userId}/pitch-lab/{샘플 번호}/` 에 둔다.
 *
 *   side.mp4 · back.mp4  옆 · 뒤 영상(브라우저가 서명 주소로 직접 올린다 — 서버를 안 거쳐 큰 파일도 된다)
 *   meta.json            촬영 정보(lib/pitch-lab-meta.ts)
 *
 * DB 표를 만들지 않는다 — 베타 실험용이라 구조를 굳히지 않고, 사용자 폴더라 소유권 확인(isOwnedBy)이 그대로 걸린다.
 * 지우면 폴더째 지운다.
 */

const LAB_DIR = 'pitch-lab';

const folder = (userId: string, id: string) => `${userId}/${LAB_DIR}/${id}`;

export type LabSample = {
  id: string;
  /** 올리다 멈춰 정보가 없으면 null — 목록에서 지울 수 있게 보인다 */
  meta: LabMeta | null;
  videos: Partial<Record<LabView, { path: string; url: string | null }>>;
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
  const { data, error } = await videoBucket().createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(error?.message ?? '업로드 주소를 만들지 못했어요.');
  return { path: data.path, signedUrl: data.signedUrl, token: data.token };
}

export async function saveLabMeta(userId: string, id: string, meta: LabMeta) {
  const { error } = await videoBucket().upload(
    `${folder(userId, id)}/meta.json`,
    new Blob([JSON.stringify(meta)], { type: 'application/json' }),
    { upsert: true, contentType: 'application/json' }
  );
  if (error) throw new Error(error.message);
}

/** 내 샘플 — 최근 것부터. 재생 주소까지 붙인다 */
export async function listLabSamples(userId: string): Promise<LabSample[]> {
  const bucket = videoBucket();
  const { data: dirs, error } = await bucket.list(`${userId}/${LAB_DIR}`, { limit: 200 });
  if (error) throw new Error(error.message);
  /* 폴더는 id 가 없다 */
  const ids = (dirs ?? []).filter((d) => d.id == null).map((d) => d.name);

  const samples = await Promise.all(
    ids.map(async (id): Promise<LabSample> => {
      const [{ data: files }, metaFile] = await Promise.all([
        bucket.list(folder(userId, id), { limit: 20 }),
        bucket.download(`${folder(userId, id)}/meta.json`),
      ]);
      const videos: LabSample['videos'] = {};
      for (const view of LAB_VIEWS) {
        const f = (files ?? []).find((x) => x.name.startsWith(`${view}.`));
        if (f) videos[view] = { path: `${folder(userId, id)}/${f.name}`, url: null };
      }
      let meta: LabMeta | null = null;
      if (metaFile.data) {
        try {
          meta = readLabMeta(JSON.parse(await metaFile.data.text()), '');
        } catch {
          meta = null;
        }
      }
      return { id, meta, videos };
    })
  );

  const paths = samples.flatMap((s) => Object.values(s.videos).map((v) => v.path));
  const urls = await createPlaybackUrls(paths);
  for (const s of samples) {
    for (const v of Object.values(s.videos)) v.url = urls[v.path] ?? null;
  }
  return samples.sort((a, b) =>
    (b.meta?.createdAt ?? '').localeCompare(a.meta?.createdAt ?? '')
  );
}

/** 샘플 하나를 폴더째 지운다 */
export async function deleteLabSample(userId: string, id: string) {
  const bucket = videoBucket();
  const { data: files, error } = await bucket.list(folder(userId, id), { limit: 50 });
  if (error) throw new Error(error.message);
  const paths = (files ?? []).map((f) => `${folder(userId, id)}/${f.name}`);
  if (paths.length === 0) return;
  const removed = await bucket.remove(paths);
  if (removed.error) throw new Error(removed.error.message);
}
