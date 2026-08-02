/**
 * 영상에서 한 장면을 뽑아 미리보기 이미지를 만든다.
 *
 * 서버에서 영상을 처리하려면 별도 도구가 필요하지만, 브라우저는
 * 이미 그 영상을 열 수 있는 상태라 프레임 하나 꺼내는 건 공짜에 가깝다.
 *
 * 파일(업로드 직전)과 주소(이미 올려둔 영상) 양쪽에서 모두 뽑을 수 있다.
 * 실패하면 null을 돌려주고, 호출한 쪽에서 사용자에게 알린다.
 */

/** 미리보기 이미지의 최대 가로 길이. 4K 원본을 그대로 저장하지 않기 위함. */
const MAX_WIDTH = 640;

/** 첫 프레임은 검은 화면인 경우가 많아 살짝 뒤로 간다. */
const SEEK_RATIO = 0.15;
const MAX_SEEK_SECONDS = 2;

/**
 * 메타데이터가 파일 끝에 있는 영상은 첫 프레임까지 오래 걸린다.
 * 넉넉히 기다리되, 응답이 없으면 포기한다.
 */
const LOAD_TIMEOUT_MS = 30_000;
const SEEK_TIMEOUT_MS = 15_000;

function waitFor(
  video: HTMLVideoElement,
  event: 'loadeddata' | 'seeked',
  ms: number
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      video.removeEventListener(event, onOk);
      video.removeEventListener('error', onFail);
      clearTimeout(timer);
      resolve(ok);
    };
    const onOk = () => finish(true);
    const onFail = () => finish(false);
    const timer = setTimeout(() => finish(false), ms);

    video.addEventListener(event, onOk, { once: true });
    video.addEventListener('error', onFail, { once: true });
  });
}

export async function captureThumbnail(
  source: File | string
): Promise<Blob | null> {
  const isFile = typeof source !== 'string';
  const objectUrl = isFile ? URL.createObjectURL(source) : null;
  const video = document.createElement('video');

  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    // 다른 주소에서 받아온 영상도 캔버스에 그릴 수 있게 한다.
    if (!isFile) video.crossOrigin = 'anonymous';
    video.src = objectUrl ?? (source as string);

    if (!(await waitFor(video, 'loadeddata', LOAD_TIMEOUT_MS))) return null;

    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) return null;

    // 조금 뒤 장면으로 옮긴다. 실패하면 첫 프레임을 그대로 쓴다.
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = Math.min(MAX_SEEK_SECONDS, duration * SEEK_RATIO);
    if (target > 0) {
      const seeked = waitFor(video, 'seeked', SEEK_TIMEOUT_MS);
      video.currentTime = target;
      await seeked;
    }

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
  } finally {
    video.src = '';
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
