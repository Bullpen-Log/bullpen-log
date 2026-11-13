/**
 * 참고 영상(유튜브)을 다루는 규칙.
 *
 * 아직 직접 촬영하지 못한 운동은 유튜브 참고 영상으로 대신 보여준다.
 * 이때 영상 파일이나 미리보기 이미지를 우리 저장소로 가져오지 않는다.
 * 유튜브가 공개해 둔 주소를 가리키기만 한다. 그래야 남의 영상을 복사해
 * 두는 일이 되지 않고, 조회수와 광고 수익도 원래 만든 사람에게 간다.
 *
 * 저장소 용량을 쓰지 않는다는 이점도 있다. 참고 영상은 수백 개가 될 수 있다.
 */

/** 목록에 보여줄 미리보기 이미지 주소. 유튜브가 공개하는 고정 주소다. */
export function referenceThumbUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * 화면 안에서 재생할 때 쓰는 주소(공식 삽입 재생기, API 없이 쓰는 옛 길).
 *
 * rel=0 — 관련 영상을 없애지 않는다. 공식 설명대로 끝난 뒤 보여 주는 관련 영상을 '같은 채널'의 것으로 좁힐 뿐이다.
 * playsinline=1 — 아이폰은 이것이 없으면 누르자마자 전체 화면으로 튄다. 제자리에서 틀고, 크게 보려면 재생기의 전체 화면 단추를 쓴다.
 */
export function referenceEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1`;
}

/**
 * 공식 IFrame Player API 로 띄울 때의 playerVars(VP01).
 *
 * 한 영상 반복은 공식 규칙대로 loop=1 + 같은 영상 번호의 playlist. enablejsapi · origin 은 실제로 삽입하는 문서의 출처와
 * 같아야 한다(웹은 location.origin, 앱은 WebView 의 baseUrl 출처). 공식 조작부(controls)와 표시는 그대로 둔다.
 *
 * autoplay 는 넣지 않는다 — 재생기가 준비된 뒤 우리 쪽이 사용자 의도를 확인하고 playVideo 로 시작한다.
 * autoplay 를 두면 준비 전에 사용자가 화면을 떠나거나 멈춰도 재생기가 스스로 시작해 소리가 잠깐 샜다(VP01 검토).
 */
export function referencePlayerVars(videoId: string, origin: string): Record<string, string | number> {
  return {
    playsinline: 1,
    rel: 0,
    loop: 1,
    playlist: videoId,
    enablejsapi: 1,
    origin,
  };
}

/** 유튜브에서 바로 열 때 쓰는 주소. 삽입이 막힌 영상의 대비책이다. */
export function referenceWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/* ------------------------------ 영상 비율 ------------------------------ */

/**
 * 비율을 모를 때 쓰는 값 (16:9).
 *
 * 지금 들어 있는 참고 영상 383개를 재보니 전부 1920x1080 이었다. 그래서 비어
 * 있으면 가로로 보는 것이 지금 화면과 똑같은 결과를 준다.
 */
export const DEFAULT_ASPECT = 16 / 9;

/**
 * 세로로 세워 보여줄 영상인가.
 *
 * 정사각(1.0)은 가로 틀에 넣어도 크게 안 상하므로 가로로 본다. 확실히 세로일
 * 때만 틀을 바꾼다 — 틀이 자꾸 바뀌면 목록이 들쭉날쭉해 보인다.
 */
export function isPortraitVideo(aspectRatio: number | null | undefined): boolean {
  return (aspectRatio ?? DEFAULT_ASPECT) < 0.95;
}

/**
 * 영상 틀에 줄 Tailwind 클래스.
 *
 * 세로 영상을 가로로 꽉 채우면 화면 하나를 통째로 잡아먹는다. 폭을 제한하고
 * 가운데에 세운다 — 420px 자리에서 256x455 쯤이 된다.
 */
export function videoFrameClass(aspectRatio: number | null | undefined): string {
  return isPortraitVideo(aspectRatio)
    ? 'aspect-[9/16] mx-auto w-full max-w-[16rem]'
    : 'aspect-video w-full';
}
