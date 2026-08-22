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

/** 유튜브 영상 ID는 11자다. */
const VIDEO_ID_RE = /^[\w-]{11}$/;

/**
 * 여러 형태의 유튜브 주소에서 영상 ID만 뽑는다.
 *
 * 촬영 리스트의 링크가 쇼츠 주소(youtube.com/shorts/...)로 되어 있는데,
 * 화면에 삽입할 때는 다른 형식을 써야 한다. 영상 ID는 같으므로 여기서
 * 한 번 뽑아 두면 어느 형식이든 만들어 쓸 수 있다.
 */
export function parseYoutubeId(input: string): string | null {
  const value = input.trim();
  if (VIDEO_ID_RE.test(value)) return value;

  const patterns = [
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/watch\?[^#]*\bv=([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = value.match(re);
    if (m) return m[1];
  }
  return null;
}

/** 목록에 보여줄 미리보기 이미지 주소. 유튜브가 공개하는 고정 주소다. */
export function referenceThumbUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * 화면 안에서 재생할 때 쓰는 주소.
 *
 * 유튜브가 다른 사이트에서 틀 수 있게 공식으로 제공하는 재생기다.
 * 관련 영상이 끝나고 뜨지 않도록 rel=0 을 붙인다.
 */
export function referenceEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}

/** 유튜브에서 바로 열 때 쓰는 주소. 삽입이 막힌 영상의 대비책이다. */
export function referenceWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
