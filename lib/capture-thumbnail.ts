/**
 * 영상에서 한 장면을 뽑아 미리보기 이미지를 만든다.
 *
 * 서버에서 영상을 처리하려면 별도 도구가 필요하지만, 브라우저는
 * 이미 그 영상을 열어둔 상태라 프레임 하나 꺼내는 건 공짜에 가깝다.
 * 실패해도 등록 자체는 막지 않고 미리보기만 없는 채로 진행한다.
 */

/** 미리보기 이미지의 최대 가로 길이. 4K 원본을 그대로 저장하지 않기 위함. */
const MAX_WIDTH = 640;

/** 첫 프레임은 검은 화면인 경우가 많아 살짝 뒤로 간다. */
const SEEK_RATIO = 0.15;
const MAX_SEEK_SECONDS = 2;

/** 영상이 열리지 않을 때 무한정 기다리지 않도록 */
const TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('영상을 읽는 데 너무 오래 걸립니다.')), ms)
    ),
  ]);
}

export async function captureThumbnail(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');

  try {
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    // 프레임을 그리려면 화소 데이터가 필요하다.
    video.preload = 'auto';

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('영상을 열 수 없습니다.'));
      })
    );

    const target = Math.min(
      MAX_SEEK_SECONDS,
      (Number.isFinite(video.duration) ? video.duration : 0) * SEEK_RATIO
    );

    if (target > 0) {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve();
          video.onerror = () => reject(new Error('장면을 찾을 수 없습니다.'));
          video.currentTime = target;
        })
      );
    }

    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) return null;

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
    // 미리보기는 있으면 좋은 것이지 없으면 안 되는 것이 아니다.
    return null;
  } finally {
    video.src = '';
    URL.revokeObjectURL(objectUrl);
  }
}
