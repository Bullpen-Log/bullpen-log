import 'server-only';
import { createClient } from '@supabase/supabase-js';

export const VIDEO_BUCKET = 'pitch-videos';

/**
 * 라이브러리(트레이닝·드릴) 영상이 들어가는 폴더.
 *
 * 투구 영상은 `{userId}/` 아래에 두고 본인만 볼 수 있게 하지만,
 * 라이브러리 영상은 관리자가 올려 모든 회원이 함께 보는 자료다.
 * 그래서 사용자 폴더와 완전히 분리해 두고, 접근 규칙도 따로 둔다.
 */
export const LIBRARY_PREFIX = 'library';

/** 업로드 가능한 최대 용량. 버킷 설정과 같은 값을 유지해야 한다. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB

/** 재생용 임시 주소의 유효 시간(초). */
const PLAYBACK_TTL_SECONDS = 60 * 60;

/**
 * 한 번 만든 주소를 이만큼(밀리초) 돌려쓴다.
 *
 * 서명 수명의 절반으로 둔다. 이 기간이 끝나 새로 발급하더라도 방금 나간
 * 주소는 최소 30분 더 살아 있다 — 영상을 보는 도중에 주소가 죽지 않는다.
 */
const URL_REUSE_MS = (PLAYBACK_TTL_SECONDS / 2) * 1000;

/** 들고 있을 주소의 최대 개수. 운동·드릴 미리보기를 다 담고도 남는다. */
const URL_CACHE_MAX = 2000;

/**
 * 한 번 만든 주소를 잠시 들고 있는다.
 *
 * 서명 주소는 만들 때마다 토큰이 달라진다. 주소가 달라지면 브라우저는 같은
 * 그림이어도 받아둔 것을 못 쓰고 처음부터 다시 받는다. 운동 목록에는
 * 미리보기가 145장 있고 한 장이 64KB 라, 화면을 열 때마다 9MB 가 통째로
 * 다시 내려왔다.
 *
 * 응답에 Expires 가 한 시간 뒤로 붙어 오는 것은 확인했다. 그러니 주소만
 * 같게 해 주면 브라우저가 알아서 캐시한다.
 *
 * 서버가 잠들면 이 기억도 사라진다. 그래도 손해는 없다 — 그때는 예전처럼
 * 새로 만들 뿐이다.
 */
const urlCache = new Map<string, { url: string; expiresAt: number }>();

/** 만료된 것을 버린다. 그래도 넘치면 오래된 것부터 버린다. */
function pruneUrlCache(now: number) {
  for (const [path, item] of urlCache) {
    if (item.expiresAt <= now) urlCache.delete(path);
  }
  while (urlCache.size > URL_CACHE_MAX) {
    const oldest = urlCache.keys().next().value;
    if (oldest === undefined) break;
    urlCache.delete(oldest);
  }
}

/**
 * 들고 있던 주소를 전부 버린다. 영상이나 미리보기를 바꾼 뒤에 부른다.
 *
 * 안 부르면, 같은 자리에 새 그림을 올려도 주소가 그대로라 브라우저가
 * 받아둔 옛 그림을 계속 보여준다. lib/library-cache.ts 의 clearLibraryCache
 * 가 함께 부른다 — 고치는 자리가 아홉 군데라 한 곳에 모아 둔다.
 */
export function clearPlaybackUrlCache() {
  urlCache.clear();
}

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. .env와 배포 환경 설정을 확인하세요.'
    );
  }

  // service_role 키는 절대 브라우저로 나가면 안 되므로 서버에서만 만든다.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 스토리지 설정이 되어 있는지 확인한다. */
export function isStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * 브라우저가 파일을 직접 올릴 수 있는 임시 주소를 만든다.
 * 서버를 거치지 않으므로 큰 파일도 업로드할 수 있다.
 */
export async function createUploadTarget(userId: string, fileName: string) {
  const ext =
    fileName
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'mp4';
  // 사용자별 폴더로 나눠 저장한다.
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await getClient()
    .storage.from(VIDEO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(error?.message ?? '업로드 주소를 만들지 못했습니다.');
  }

  return { path: data.path, signedUrl: data.signedUrl, token: data.token };
}

/**
 * 여러 영상의 재생 주소를 한 번의 요청으로 받아온다.
 * 하나씩 발급하면 영상 수만큼 왕복이 생겨 느려진다.
 */
export async function createPlaybackUrls(
  paths: string[]
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const now = Date.now();
  const result: Record<string, string> = {};

  /* 이미 만들어 둔 것은 그대로 쓴다 — 주소가 같아야 브라우저가 캐시한다 */
  const missing: string[] = [];
  for (const path of paths) {
    const kept = urlCache.get(path);
    if (kept && kept.expiresAt > now) result[path] = kept.url;
    else missing.push(path);
  }

  if (missing.length === 0) return result;

  const { data, error } = await getClient()
    .storage.from(VIDEO_BUCKET)
    .createSignedUrls(missing, PLAYBACK_TTL_SECONDS);

  if (error || !data) {
    console.error('[storage] 재생 주소 일괄 생성 실패', error);
    /* 만들어 둔 것이라도 돌려준다. 전부 실패로 만들 이유가 없다. */
    return result;
  }

  const expiresAt = now + URL_REUSE_MS;
  for (const item of data) {
    // 개별 항목이 실패해도 나머지는 살린다.
    if (item.path && item.signedUrl && !item.error) {
      result[item.path] = item.signedUrl;
      urlCache.set(item.path, { url: item.signedUrl, expiresAt });
    }
  }

  pruneUrlCache(now);
  return result;
}

/** 기록을 지울 때 저장된 파일도 함께 정리한다. */
export async function deleteVideos(paths: string[]) {
  if (paths.length === 0) return;

  const { error } = await getClient().storage.from(VIDEO_BUCKET).remove(paths);
  if (error) {
    // 파일 삭제가 실패해도 기록 삭제 자체는 막지 않는다.
    console.error('[storage] 영상 삭제 실패', paths, error);
  }
}

/** 해당 경로가 그 사용자의 폴더인지 확인한다. */
export function isOwnedBy(path: string, userId: string) {
  return path.startsWith(`${userId}/`);
}

/** 미리보기 이미지의 최대 용량. 캡처한 한 장면이라 넉넉한 값이다. */
export const MAX_THUMB_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * 라이브러리 파일(영상 또는 미리보기 이미지)을 올릴 임시 주소를 만든다.
 * 사용자 폴더가 아니라 공용 폴더에 넣는다.
 */
export async function createLibraryUploadTarget(
  fileName: string,
  kind: 'video' | 'thumbnail' = 'video'
) {
  const fallback = kind === 'thumbnail' ? 'jpg' : 'mp4';
  const ext =
    fileName
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || fallback;
  const path = `${LIBRARY_PREFIX}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await getClient()
    .storage.from(VIDEO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(error?.message ?? '업로드 주소를 만들지 못했습니다.');
  }

  return { path: data.path, signedUrl: data.signedUrl, token: data.token };
}

/**
 * 라이브러리 폴더의 경로인지 확인한다.
 * 이 검사를 통과한 경로만 회원 누구에게나 재생 주소를 내준다.
 */
export function isLibraryPath(path: string) {
  return path.startsWith(`${LIBRARY_PREFIX}/`) && !path.includes('..');
}
