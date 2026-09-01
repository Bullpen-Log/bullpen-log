/**
 * 유튜브 채널의 영상 목록을 통째로 받아온다.
 *
 *   node scripts/youtube-channel-list.mjs @핸들 [videos|shorts] [저장할파일.json]
 *
 * 예)
 *   node scripts/youtube-channel-list.mjs @johnrusin3229 videos scripts/lists/_rusin.json
 *
 * ── 왜 필요한가 ──
 *
 * 브라우저로 채널 페이지를 열어 스크롤하면 영상이 조금씩 더 나온다. 그런데
 * 천 개가 넘는 채널에서는 수백 번을 내려야 하고, 중간에 한 번 끊기면 다시
 * 처음부터다.
 *
 * 유튜브 화면 자신이 쓰는 방식을 그대로 쓴다. 첫 페이지 HTML 안에 목록과
 * '다음 쪽 표(continuation token)'가 들어 있고, 그 표를 들고 다시 물으면
 * 다음 30개를 준다. 표가 없어질 때까지 되풀이한다.
 *
 * 공개된 목록만 읽는다. 로그인하지 않고, 영상을 내려받지도 않는다.
 */

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** 한 번에 너무 많이 부르지 않게. 유튜브가 막으면 아무것도 못 받는다. */
const PAGE_DELAY_MS = 400;
/** 안전장치. 무한히 도는 것을 막는다. */
const MAX_PAGES = 120;

/** HTML 안에 박혀 있는 큰 JSON 덩어리를 꺼낸다. */
function extractJson(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  let i = html.indexOf('{', at);
  if (i < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * 어떤 모양으로 오든 영상 하나를 찾아낸다.
 *
 * 유튜브는 화면 구조를 자주 바꾼다. 지금만 해도 옛 모양(videoRenderer)과
 * 새 모양(lockupViewModel)이 섞여 온다. 이름을 정해 두고 찾기보다,
 * 나무 전체를 훑으며 '영상 ID처럼 생긴 것'을 줍는 편이 오래 간다.
 */
function walkVideos(node, out) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const v of node) walkVideos(v, out);
    return;
  }

  // 옛 모양
  if (node.videoRenderer?.videoId) {
    const r = node.videoRenderer;
    const title =
      r.title?.runs?.map((x) => x.text).join('') ?? r.title?.simpleText ?? '';
    if (title) out.set(r.videoId, title);
  }
  // 새 모양
  if (node.lockupViewModel?.contentId) {
    const r = node.lockupViewModel;
    const title =
      r.metadata?.lockupMetadataViewModel?.title?.content ??
      r.metadata?.lockupMetadataViewModel?.title?.simpleText ??
      '';
    if (title && /^[\w-]{11}$/.test(r.contentId)) out.set(r.contentId, title);
  }
  // 쇼츠
  if (node.reelItemRenderer?.videoId) {
    const r = node.reelItemRenderer;
    const title = r.headline?.simpleText ?? '';
    if (title) out.set(r.videoId, title);
  }
  if (node.shortsLockupViewModel?.entityId) {
    const r = node.shortsLockupViewModel;
    const id = r.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ?? null;
    const title = r.overlayMetadata?.primaryText?.content ?? '';
    if (id && title) out.set(id, title);
  }

  for (const k of Object.keys(node)) walkVideos(node[k], out);
}

/** 다음 쪽을 부를 표를 찾는다. */
function findContinuation(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const v of node) {
      const got = findContinuation(v);
      if (got) return got;
    }
    return null;
  }
  if (node.continuationCommand?.token) return node.continuationCommand.token;
  for (const k of Object.keys(node)) {
    const got = findContinuation(node[k]);
    if (got) return got;
  }
  return null;
}

export async function listChannelVideos(
  handle,
  tab = 'videos',
  { log = console.log } = {}
) {
  const url = `https://www.youtube.com/${handle}/${tab}`;
  const first = await fetch(url, { headers: HEADERS });
  if (!first.ok) throw new Error(`채널 페이지를 못 읽었습니다 (${first.status})`);
  const html = await first.text();

  const apiKey = html.match(/"INNERTUBE_API_KEY":"([\w-]+)"/)?.[1];
  const clientVersion =
    html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([\d.]+)"/)?.[1] ??
    '2.20240101.00.00';

  const initial =
    extractJson(html, 'var ytInitialData =') ?? extractJson(html, 'ytInitialData');
  if (!initial) throw new Error('채널 목록을 못 읽었습니다 (ytInitialData 없음)');

  const found = new Map();
  walkVideos(initial, found);
  let token = findContinuation(initial);
  log(`  1쪽: ${found.size}개`);

  let page = 1;
  while (token && page < MAX_PAGES) {
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/browse${apiKey ? `?key=${apiKey}` : ''}`,
      {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion } },
          continuation: token,
        }),
      }
    );
    if (!res.ok) {
      log(`  ${page + 1}쪽에서 멈춤 (${res.status})`);
      break;
    }
    const data = await res.json();
    const before = found.size;
    walkVideos(data, found);
    token = findContinuation(data);
    page++;
    if (found.size === before) {
      log(`  ${page}쪽: 새로운 것 없음 — 끝`);
      break;
    }
    log(`  ${page}쪽: 누적 ${found.size}개`);
  }

  return found;
}

/*
 * 직접 실행했을 때만 아래를 돈다.
 *
 * 경로를 손으로 이어 붙여 견주면 윈도우에서 어긋난다 — import.meta.url 은
 * file:///C:/... 인데 손으로 만들면 file://C:/... 이 된다. 실제로 그래서
 * 아무 일도 안 일어난 채 조용히 끝났다. 표준 변환기를 쓴다.
 */
const { pathToFileURL } = await import('node:url');
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [handle, tab = 'videos', outPath] = process.argv.slice(2);
  if (!handle) {
    console.error(
      '사용법: node scripts/youtube-channel-list.mjs @핸들 [videos|shorts] [저장.json]'
    );
    process.exit(1);
  }
  const found = await listChannelVideos(handle, tab);
  console.log(`\n${handle} / ${tab} — 모두 ${found.size}개`);
  if (outPath) {
    const { writeFileSync } = await import('node:fs');
    const rows = [...found].map(([videoId, title]) => ({ videoId, title }));
    writeFileSync(outPath, JSON.stringify(rows, null, 1), 'utf8');
    console.log(`→ ${outPath}`);
  } else {
    for (const [id, t] of [...found].slice(0, 30)) console.log(`  ${id}\t${t}`);
    if (found.size > 30) console.log(`  … 외 ${found.size - 30}개`);
  }
}
