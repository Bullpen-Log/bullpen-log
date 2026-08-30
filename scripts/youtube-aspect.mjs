/**
 * 유튜브 영상의 가로세로 비율을 잰다.
 *
 * 등록 스크립트와 채우기 스크립트가 같은 방법을 써야 해서 여기로 뺐다.
 *
 * ── 왜 이렇게 재나 ──
 *
 * 쉬운 길부터 다 막혔다.
 *
 *   oEmbed        재생기 기본 크기(200x113)만 준다. 영상 비율이 아니다.
 *   hqdefault.jpg 세로 영상은 4:3 으로 가운데를 잘라 준다. 잘린 뒤라 알 수 없다.
 *   iframe        유튜브가 크기를 알려주지 않는다.
 *
 * 그래서 영상 페이지의 HTML 안에 들어 있는 재생 정보(streamingData)에서 실제
 * 해상도를 읽는다. 2160x3840 같은 원본 크기가 그대로 적혀 있다.
 *
 * 유튜브가 페이지 구조를 바꾸면 못 읽을 수 있다. 그때는 null 을 돌려주고,
 * 화면은 가로(16:9)로 본다 — 지금과 같은 모습이라 망가지지 않는다.
 */

/** 사람이 보는 것처럼 보이게 한다. 안 그러면 다른 페이지를 준다. */
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** 썸네일 같은 작은 그림이 섞이지 않게 이 크기 아래는 버린다. */
const MIN_SIDE = 240;

/**
 * 한 편을 잰다.
 *
 * @returns {Promise<{ratio:number,width:number,height:number,embeddable:boolean}|null>}
 *   못 읽으면 null. 영상이 없거나 비공개인 경우도 null 이다.
 */
export async function probeAspect(videoId) {
  let html;
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: HEADERS,
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const sizes = [...html.matchAll(/"width":(\d+),"height":(\d+)/g)]
    .map((m) => [Number(m[1]), Number(m[2])])
    .filter(([w, h]) => w >= MIN_SIDE && h >= MIN_SIDE);

  if (sizes.length === 0) return null;

  // 가장 큰 판이 원본에 가장 가깝다.
  const [width, height] = sizes.sort((a, b) => b[0] * b[1] - a[0] * a[1])[0];

  return {
    width,
    height,
    ratio: Math.round((width / height) * 1000) / 1000,
    /*
     * 다른 사이트에서 틀 수 있는가. 막혀 있으면 우리 화면에서 재생이 안 되고
     * '유튜브에서 열기'만 남는다. 등록 전에 걸러내는 편이 낫다.
     */
    embeddable: /"playableInEmbed":\s*true/.test(html),
  };
}

/** 잰 값을 사람이 읽는 말로. 화면이 아니라 스크립트 출력에 쓴다. */
export function describeAspect(ratio) {
  if (ratio == null) return '알 수 없음';
  if (ratio < 0.95) return '세로';
  if (ratio > 1.2) return '가로';
  return '정사각';
}

/**
 * 여러 편을 차례로 잰다. 한꺼번에 던지지 않고 사이를 둔다 —
 * 유튜브가 막아버리면 전부 못 재게 된다.
 */
export async function probeMany(videoIds, { delayMs = 250, onEach } = {}) {
  const out = new Map();
  for (let i = 0; i < videoIds.length; i++) {
    const id = videoIds[i];
    const got = await probeAspect(id);
    out.set(id, got);
    if (onEach) onEach(id, got, i + 1, videoIds.length);
    if (i < videoIds.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return out;
}
