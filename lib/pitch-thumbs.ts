import { captureThumbnail } from '@/lib/capture-thumbnail';

/**
 * 투구 영상 미리보기 — 브라우저 쪽.
 *
 * 영상 캘린더는 칸마다 그날 영상의 한 장면을 보여준다. 미리보기는 저장소에서 영상
 * 옆에 정해진 자리에 둔다(lib/storage.ts 의 pitchThumbPath). DB 에는 적지 않는다.
 *
 * 만드는 때는 셋이다.
 *   1. 영상을 올린 직후 — 손에 든 파일에서 바로 뜬다(가장 빠르다).
 *   2. 캘린더를 열었는데 없는 날 — 영상을 받아 앞쪽 한 장면을 뜬다(예전에 올린 영상).
 *   3. 사람이 고를 때 — 캘린더에서 영상을 보다가 '이 장면을 썸네일로'.
 * 셋 다 같은 자리에 덮어쓴다.
 */

/** 서버가 한 번에 받는 수(app/api/pitch-log/thumb-url 의 MAX_PATHS) */
const PATHS_PER_REQUEST = 40;

/** 영상 경로 → 미리보기 주소. 아직 없는 것은 빠진다. fresh 면 새 주소로 받는다. */
export async function fetchPitchThumbs(
  paths: string[],
  fresh = false
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < paths.length; i += PATHS_PER_REQUEST) {
    const chunk = paths.slice(i, i + PATHS_PER_REQUEST);
    const res = await fetch('/api/pitch-log/thumb-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: chunk, fresh }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { thumbs?: Record<string, string> };
    Object.assign(out, data.thumbs ?? {});
  }
  return out;
}

/** 뜬 장면 하나를 그 영상의 미리보기 자리에 올린다(덮어쓴다) */
export async function savePitchThumb(videoPath: string, shot: Blob): Promise<boolean> {
  const res = await fetch('/api/pitch-log/thumb-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoPath, fileSize: shot.size, fileType: 'image/jpeg' }),
  });
  if (!res.ok) return false;
  const target = (await res.json()) as { signedUrl?: string };
  if (!target.signedUrl) return false;
  const put = await fetch(target.signedUrl, {
    method: 'PUT',
    /* 같은 자리의 옛 그림을 덮어쓴다 — 주소를 만들 때도 덮어쓰기로 받았다 */
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: shot,
  });
  return put.ok;
}

/**
 * 영상에서 한 장면을 떠 미리보기로 올린다.
 *
 * @param source 올리기 전의 파일이나 재생 주소
 * @param at 뜰 장면(초). 비우면 앞쪽 조금 뒤에서 뜬다.
 * @returns 올렸으면 true. 장면을 못 뜨거나(형식·네트워크) 못 올리면 false.
 */
export async function makePitchThumb(
  videoPath: string,
  source: File | string,
  at?: number
): Promise<boolean> {
  try {
    const shot = await captureThumbnail(source, at);
    if (!shot) return false;
    return await savePitchThumb(videoPath, shot);
  } catch {
    return false;
  }
}

/** 미리보기 가로 최대 — lib/capture-thumbnail.ts 와 같은 값 */
const MAX_WIDTH = 640;

/**
 * 재생 중인 영상에서 지금 보이는 장면을 그대로 뜬다.
 *
 * 사람이 멈춰 둔 바로 그 프레임이다 — 영상을 새로 받아 그 초로 옮기면 가장 가까운
 * 열쇠 프레임으로 가서 한두 장면 어긋날 수 있다. 다른 주소의 영상은 재생기에
 * crossOrigin 이 붙어 있어야 뜰 수 있다. 못 뜨면 null — 부르는 쪽이 영상을 새로 받아
 * 뜬다(makePitchThumb).
 */
export async function frameOf(video: HTMLVideoElement): Promise<Blob | null> {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) return null;
  try {
    const scale = Math.min(1, MAX_WIDTH / videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(videoWidth * scale);
    canvas.height = Math.round(videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.72)
    );
  } catch {
    return null;
  }
}

/** 영상 재생 주소 몇 개 — 장면을 뜨려면 영상을 받아야 한다 */
export async function fetchPlaybackUrls(
  paths: string[]
): Promise<Record<string, string>> {
  const res = await fetch('/api/pitch-log/video-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as { urls?: Record<string, string> };
  return data.urls ?? {};
}
