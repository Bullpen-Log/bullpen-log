/**
 * 영상 파일의 초당 장면 수(fps)를 파일 머리에서 읽는다 — 브라우저는 이 값을 알려주지 않는다.
 *
 * 폰이 찍는 두 꼴(아이폰 mov · 안드로이드 mp4)은 같은 짜임(ISO BMFF)이다. 파일 안의 표
 * moov › trak › mdia 에 영상 트랙의 시간 단위(mdhd)와 장면마다의 길이(stts)가 적혀 있어,
 * 영상을 풀지 않고도 fps 를 센다. 파일 전체를 읽지 않는다 — 상자 머리만 건너뛰며 moov 를
 * 찾아 그것만 읽는다(영상 본체 mdat 은 수백 MB 여도 건너뛴다).
 *
 * 장면 길이가 고르지 않은 영상(가변 fps — 어두우면 폰이 장면을 늘린다)은 평균이 아니라 가장
 * 많이 나온 길이로 센다. 60fps 로 찍다 잠깐 늘어진 영상이 '55fps'가 되지 않고 60 으로 나온다.
 *
 * 못 읽으면(webm · 조각난 mp4 · 깨진 파일) null.
 */

type Box = { type: string; start: number; end: number; body: number };

/** 한 상자의 머리(크기 · 이름)를 읽는다. 크기 1 이면 64비트 크기가 뒤따르고, 0 이면 끝까지다. */
function readBoxHead(view: DataView, at: number, limit: number): Box | null {
  if (at + 8 > limit) return null;
  let size = view.getUint32(at);
  const type = String.fromCharCode(
    view.getUint8(at + 4),
    view.getUint8(at + 5),
    view.getUint8(at + 6),
    view.getUint8(at + 7)
  );
  let body = at + 8;
  if (size === 1) {
    if (at + 16 > limit) return null;
    size = Number(view.getBigUint64(at + 8));
    body = at + 16;
  } else if (size === 0) {
    size = limit - at;
  }
  if (size < body - at) return null;
  return { type, start: at, end: at + size, body };
}

/** 부모 상자 안의 자식 상자들 */
function children(view: DataView, from: number, to: number): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at < to) {
    const box = readBoxHead(view, at, to);
    if (!box || box.end > to || box.end <= at) break;
    out.push(box);
    at = box.end;
  }
  return out;
}

function child(view: DataView, parent: Box, type: string): Box | undefined {
  return children(view, parent.body, parent.end).find((b) => b.type === type);
}

/** 파일 맨 위 상자들을 머리만 읽으며 건너뛰어 moov 를 찾고, 그것만 읽어 온다. */
async function readMoov(file: Blob): Promise<DataView | null> {
  let at = 0;
  for (let guard = 0; guard < 64 && at + 8 <= file.size; guard++) {
    const head = new DataView(await file.slice(at, at + 16).arrayBuffer());
    const box = readBoxHead(head, 0, Math.min(16, file.size - at));
    if (!box) return null;
    const size = box.end - box.start;
    if (box.type === 'moov') {
      /* moov 는 보통 수십 KB~수 MB — 그 이상이면 이상한 파일로 친다 */
      if (size > 64 * 1024 * 1024) return null;
      return new DataView(await file.slice(at, at + size).arrayBuffer());
    }
    if (size <= 0) return null;
    at += size;
  }
  return null;
}

/** 영상 트랙 하나의 fps — 가장 많이 나온 장면 길이로 센다 */
function trackFps(view: DataView, trak: Box): number | null {
  const mdia = child(view, trak, 'mdia');
  if (!mdia) return null;
  const hdlr = child(view, mdia, 'hdlr');
  /* hdlr: 판 · 표시(4) + 미리 정한 값(4) + 종류(4) — 종류가 'vide' 인 트랙만 */
  if (!hdlr || hdlr.body + 12 > hdlr.end) return null;
  const handler = String.fromCharCode(
    view.getUint8(hdlr.body + 8),
    view.getUint8(hdlr.body + 9),
    view.getUint8(hdlr.body + 10),
    view.getUint8(hdlr.body + 11)
  );
  if (handler !== 'vide') return null;

  const mdhd = child(view, mdia, 'mdhd');
  if (!mdhd) return null;
  const version = view.getUint8(mdhd.body);
  /* 판 0: 판 · 표시(4) 만든 때(4) 고친 때(4) 시간 단위(4) · 판 1: 만든 때 · 고친 때가 8씩 */
  const timescale = view.getUint32(mdhd.body + (version === 1 ? 20 : 12));
  if (!timescale) return null;

  const minf = child(view, mdia, 'minf');
  const stbl = minf && child(view, minf, 'stbl');
  const stts = stbl && child(view, stbl, 'stts');
  if (!stts) return null;
  const count = view.getUint32(stts.body + 4);
  let total = 0;
  let ticks = 0;
  /* 장면 길이별로 장면 수를 모아 가장 많이 나온 길이를 찾는다 */
  const byDelta = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const at = stts.body + 8 + i * 8;
    if (at + 8 > stts.end) break;
    const n = view.getUint32(at);
    const delta = view.getUint32(at + 4);
    total += n;
    ticks += n * delta;
    if (delta > 0) byDelta.set(delta, (byDelta.get(delta) ?? 0) + n);
  }
  if (total < 2 || ticks <= 0) return null;

  let modeDelta = 0;
  let modeCount = 0;
  for (const [delta, n] of byDelta) {
    if (n > modeCount) {
      modeDelta = delta;
      modeCount = n;
    }
  }
  /* 가장 많은 길이가 전체의 절반을 넘으면 그것으로, 아니면(고르지 않은 영상) 평균으로 */
  const fps = modeCount * 2 > total ? timescale / modeDelta : (total * timescale) / ticks;
  return Number.isFinite(fps) && fps > 0 && fps < 2000 ? fps : null;
}

export async function readVideoFps(file: Blob): Promise<number | null> {
  try {
    const moov = await readMoov(file);
    if (!moov) return null;
    const root: Box = { type: 'moov', start: 0, end: moov.byteLength, body: 8 };
    const head = readBoxHead(moov, 0, moov.byteLength);
    if (head) root.body = head.body;
    for (const trak of children(moov, root.body, root.end)) {
      if (trak.type !== 'trak') continue;
      const fps = trackFps(moov, trak);
      if (fps != null) return Math.round(fps * 100) / 100;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 영상 파일로 잴 수 있는 가장 낮은 fps — 30장(29.97 · 가변 30 포함) 급은 막고 60장 급부터 받는다.
 *
 * 30fps 면 공이 손을 떠나 네트에 닿기까지 두세 장면뿐이라 잴 수 없다(validate.ts 의 MIN_FPS).
 * 파일을 고르는 순간 이 값으로 먼저 막는다 — 한참 분석한 뒤에야 거부하면 무엇이 문제인지 늦게 안다.
 * 반올림해 30 이하면 막는다: 30.4 로 적힌 가변 30fps 도 30 으로 친다.
 */
export function isLowFrameRate(fps: number): boolean {
  return Math.round(fps) <= 30;
}
