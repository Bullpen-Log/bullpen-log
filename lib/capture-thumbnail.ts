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

/**
 * 화면에 붙이지 않고 쓰는 <video> 를 아이폰에서도 열리게 차린다 — src 를 넣기 전에 부른다.
 *
 * 아이폰은 preload='auto' 를 들어도 'metadata' 까지만 받는다(배터리 · 데이터 아끼기). 그래서 첫 장면 알림
 * (loadeddata)이 영영 안 와 폼 분석은 30초를 기다리다 '불러오지 못했어요', 썸네일은 빈손이었다(2026-10-03 점검).
 * 소리 없음 · 화면 안 재생(playsinline, 옛 사파리는 webkit-playsinline)을 속성으로도 달아야 누름 없이 재생이 허락된다.
 */
export function prepareDetachedVideo(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
}

export type FirstFrameResult = 'ok' | 'error' | 'timeout' | 'aborted';

/**
 * 첫 장면이 준비될 때까지(loadeddata) 기다린다. 길이 · 크기(loadedmetadata)까지만 오고 멈추면 재생을 한 번 걸었다
 * 곧바로 멈춰 나머지를 받게 깨운다 — 아이폰이 metadata 에서 멈추는 것을 푸는 길이다. 재생이 막히면(저전력 모드 등)
 * 맨 앞 장면으로 옮겨 본다. 깨우려고 건 재생은 끝날 때 멈춰 둔다 — 부른 쪽이 장면을 옮기거나 다시 틀 때 섞이지 않게.
 */
export function waitForFirstFrame(
  video: HTMLVideoElement,
  ms: number,
  signal?: AbortSignal
): Promise<FirstFrameResult> {
  return new Promise((resolve) => {
    if (video.readyState >= 2) return resolve('ok');
    let settled = false;
    let kicked = false;
    const kick = () => {
      if (settled || kicked || video.readyState >= 2) return;
      kicked = true;
      video
        .play()
        .then(() => {
          if (!settled) video.pause();
        })
        .catch(() => {
          if (settled) return;
          try {
            video.currentTime = 0.001;
          } catch {
            /* 옮기지 못하면 기다리던 대로 */
          }
        });
    };
    const finish = (result: FirstFrameResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onData);
      video.removeEventListener('loadedmetadata', kick);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      /* 아직 재생이 시작되기 전이면 이 멈춤이 그 재생을 거둔다(play 약속은 위 catch 로 조용히 끝난다) */
      if (kicked) video.pause();
      resolve(result);
    };
    const onData = () => finish('ok');
    const onError = () => finish('error');
    const onAbort = () => finish('aborted');
    const timer = setTimeout(() => finish('timeout'), ms);

    video.addEventListener('loadeddata', onData);
    video.addEventListener('loadedmetadata', kick);
    video.addEventListener('error', onError);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    /* 이미 길이까지 와 있으면 곧바로 깨운다 */
    if (video.readyState >= 1) kick();
  });
}

/** 방금 옮긴 장면이 그려질 때까지 기다린다 — 알림이 없으면 0.3초 뒤에 그냥 간다 */
function frameReady(video: HTMLVideoElement): Promise<void> {
  const v = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  };
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 300);
    v.requestVideoFrameCallback?.(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * @param at 뽑을 장면(초). 비우면 앞쪽 조금 뒤(15%, 최대 2초)에서 뽑는다 — 첫 프레임은
 *   검은 화면인 경우가 많다. 영상 캘린더에서 '이 장면을 썸네일로'를 누르면 그 자리를 준다.
 */
export async function captureThumbnail(
  source: File | string,
  at?: number
): Promise<Blob | null> {
  const isFile = typeof source !== 'string';
  const objectUrl = isFile ? URL.createObjectURL(source) : null;
  const video = document.createElement('video');

  try {
    prepareDetachedVideo(video);
    // 다른 주소에서 받아온 영상도 캔버스에 그릴 수 있게 한다.
    if (!isFile) video.crossOrigin = 'anonymous';
    video.src = objectUrl ?? (source as string);

    if ((await waitForFirstFrame(video, LOAD_TIMEOUT_MS)) !== 'ok') return null;

    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) return null;

    // 조금 뒤 장면으로 옮긴다. 실패하면 첫 프레임을 그대로 쓴다.
    // 장면을 골라 넘겼으면(at) 그 자리로 — 끝을 넘지 않게 살짝 앞에서 멈춘다.
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target =
      at != null
        ? Math.max(0, Math.min(at, duration > 0 ? duration - 0.05 : at))
        : Math.min(MAX_SEEK_SECONDS, duration * SEEK_RATIO);
    if (target > 0) {
      const seeked = waitFor(video, 'seeked', SEEK_TIMEOUT_MS);
      video.currentTime = target;
      await seeked;
      /*
       * 사파리는 새 장면이 준비되기 전에 seeked 를 먼저 보낸다 — 그대로 뜨면 첫(흔히 검은) 장면이 썸네일로 남았다. 장면이
       * 그려질 때까지(requestVideoFrameCallback) 기다리고, 안 오면 0.3초 뒤에 뜬다(lib/pose/extract.ts 의 seekTo 와 같다).
       */
      await frameReady(video);
    }
    /* 그릴 장면이 아직 없으면(HAVE_CURRENT_DATA 전) 빈 그림을 올리지 않는다 */
    if (video.readyState < 2) return null;

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
