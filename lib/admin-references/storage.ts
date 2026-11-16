import 'server-only';
import { storageBucket, videoBucket } from '@/lib/storage';
import type { Catalog } from '@/lib/admin-references/schema';
import { ASSET_KEY } from '@/lib/admin-references/schema';
import { isReferenceKey, localAssetFetch, localSource } from '@/lib/admin-references/local-source';
import { loadCatalogFor, loadDetailFor, type DetailLoaded, type Failed, type ReferenceSource, type SourceRead, type Viewer } from '@/lib/admin-references/load';
import { serveOriginal, type AssetFetch } from '@/lib/admin-references/original';

/**
 * EX-REF02 — 참고자료의 진짜 저장소(서버에서만).
 * - 목록 · 한 건: 비공개 버킷 pitch-videos 의 admin-references/v1/ (서명 주소 없이 서버가 바로 받음)
 * - 원본 파일: 비공개 버킷 external-intake 의 admin-references/v1/assets/ (application/octet-stream).
 *   요청마다 60초짜리 서명 주소를 서버 안에서만 만들어 그 자리에서 받고 버린다 — 화면 · 응답 · 기억(캐시)에 남기지 않는다.
 * 버킷 · 정책은 바꾸지 않는다. 받은 글 · 파일을 어디에도 기억해 두지 않는다.
 *
 * 내 컴퓨터에서 미리 볼 때만: ADMIN_REFERENCES_LOCAL_DIR(서버 환경변수)가 있고 운영(NODE_ENV=production)이 아니면 그 폴더에서 읽는다
 * (catalog.json · entries/ · assets/). 폴더 밖 열쇠는 거절한다(local-source.ts). 운영에서는 이 갈래가 꺼진다 — 배포물에 자료 폴더가 따라가지 않는다.
 */

/** 원본 파일이 있는 비공개 버킷 — 접수(외부 영상)와 같은 버킷의 따로 된 자리 */
const ASSET_BUCKET = 'external-intake';
/** 서버 안에서 한 번 받고 버릴 서명 주소의 수명 */
const ASSET_URL_TTL_SECONDS = 60;

function bucketSource(): ReferenceSource {
  return {
    async read(key, maxBytes): Promise<SourceRead> {
      if (!isReferenceKey(key)) return { ok: false, reason: 'unavailable' };
      let res: Awaited<ReturnType<ReturnType<typeof videoBucket>['download']>>;
      try {
        res = await videoBucket().download(key);
      } catch {
        /* 환경변수 없음 · 연결 실패 — 까닭 글(경로 · 키 이름)은 화면으로 보내지 않는다 */
        return { ok: false, reason: 'unavailable' };
      }
      const { data, error } = res;
      if (error || !data) return { ok: false, reason: isNotFound(error) ? 'missing' : 'unavailable' };
      if (data.size > maxBytes) return { ok: false, reason: 'too_large' };
      return { ok: true, text: await data.text() };
    },
  };
}

function isNotFound(error: unknown): boolean {
  const e = error as { statusCode?: string | number; status?: number; message?: string } | null;
  const code = String(e?.statusCode ?? e?.status ?? '');
  return code === '404' || /not.?found/i.test(e?.message ?? '');
}

const bucketAssetFetch: AssetFetch = async (key, range, signal) => {
  const none = { get: () => null };
  if (!ASSET_KEY.test(key)) return { status: 400, headers: none, body: null };
  const { data, error } = await storageBucket(ASSET_BUCKET).createSignedUrl(key, ASSET_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    if (isNotFound(error)) return { status: 404, headers: none, body: null };
    throw new Error('asset-url');
  }
  const res = await fetch(data.signedUrl, {
    headers: range ? { Range: range } : undefined,
    cache: 'no-store',
    /* 서명 주소는 저장소를 바로 가리킨다 — 다른 곳으로 돌려보내면 따라가지 않고 실패로 본다 */
    redirect: 'manual',
    signal,
  });
  return { status: res.status, headers: res.headers, body: res.body };
};

function localDir(): string | null {
  const dir = process.env.ADMIN_REFERENCES_LOCAL_DIR;
  return dir && process.env.NODE_ENV !== 'production' ? dir : null;
}

function referenceSource(): ReferenceSource {
  const dir = localDir();
  return dir ? localSource(dir) : bucketSource();
}

function referenceAssetFetch(): AssetFetch {
  const dir = localDir();
  return dir ? localAssetFetch(dir) : bucketAssetFetch;
}

/** 목록 — 보는 사람 검사가 먼저(load.ts) */
export function loadReferenceCatalog(viewer: Viewer): Promise<{ ok: true; catalog: Catalog } | Failed> {
  return loadCatalogFor(viewer, referenceSource());
}

/** 한 자료 — 보는 사람 · 번호 검사가 먼저, 열쇠는 목록에서만 */
export function loadReferenceDetail(viewer: Viewer, id: unknown): Promise<DetailLoaded | Failed> {
  return loadDetailFor(viewer, id, referenceSource());
}

/** 원본 — 보는 사람 · 번호 · 목록 · 한 건 · 이용 허락을 다 본 뒤에만 원본 저장소를 묻는다(original.ts) */
export function serveReferenceOriginal(viewer: Viewer, id: unknown, rangeHeader: string | null, signal?: AbortSignal): Promise<Response> {
  return serveOriginal({ viewer, id, rangeHeader, source: referenceSource(), fetchAsset: referenceAssetFetch(), signal });
}
