/**
 * 화면에 붙이지 않은 <video> 로 영상 파일을 여는 것 — 아이폰(웹킷)에서도 첫 장면까지 오게. 썸네일(lib/capture-thumbnail.ts) ·
 * 폼 분석(lib/pose/extract.ts) · 구속 측정 영상 파일 재기(analyze-video.ts)가 같이 쓴다. 엔진 폴더에 두는 것은 구속 측정 실험실
 * (scripts/velocity-lab)이 이 폴더 파일만 헤드리스 크롬에 올리기 때문이다.
 */

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
