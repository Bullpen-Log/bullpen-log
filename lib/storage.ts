import 'server-only';
import { createClient } from '@supabase/supabase-js';

export const VIDEO_BUCKET = 'pitch-videos';

/** 업로드 가능한 최대 용량. 버킷 설정과 같은 값을 유지해야 한다. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB

/** 재생용 임시 주소의 유효 시간(초). */
const PLAYBACK_TTL_SECONDS = 60 * 60;

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
  const ext = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
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

/** 비공개 영상을 재생하기 위한 시간제한 주소를 만든다. */
export async function createPlaybackUrl(path: string): Promise<string | null> {
  const { data, error } = await getClient()
    .storage.from(VIDEO_BUCKET)
    .createSignedUrl(path, PLAYBACK_TTL_SECONDS);

  if (error || !data) {
    console.error('[storage] 재생 주소 생성 실패', path, error);
    return null;
  }
  return data.signedUrl;
}

export async function createPlaybackUrls(paths: string[]) {
  return Promise.all(
    paths.map(async (path) => ({ path, url: await createPlaybackUrl(path) }))
  );
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
