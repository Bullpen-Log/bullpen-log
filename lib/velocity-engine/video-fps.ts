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
    return moov ? fpsFromMoov(moov) : null;
  } catch {
    return null;
  }
}

/** moov 상자(통째로 읽은 것)에서 영상 트랙의 fps — 파일 없이 표만으로 시험할 수 있게 뗐다 */
export function fpsFromMoov(moov: DataView): number | null {
  const root = moovRoot(moov);
  for (const trak of children(moov, root.body, root.end)) {
    if (trak.type !== 'trak') continue;
    const fps = trackFps(moov, trak);
    if (fps != null) return Math.round(fps * 100) / 100;
  }
  return null;
}

function moovRoot(moov: DataView): Box {
  const head = readBoxHead(moov, 0, moov.byteLength);
  return head ?? { type: 'moov', start: 0, end: moov.byteLength, body: 8 };
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

/* ───────────────────────── 장면마다의 실제 시각 ───────────────────────── */

/**
 * 영상 트랙의 장면 시각 표 — 장면마다 화면에 보이는 [시작, 끝)(초, 보이는 차례).
 *
 * 왜 필요한가(2026-09-29, 보정 영상 18개의 표를 읽어 봄): 예전에는 장면 i 를 (i+0.5)/fps 로 짚었다. 그런데
 *   - 사진 앱에서 잘라 낸 아이폰 영상은 첫 장면이 짧다(600 눈금 중 2~9 — 잘린 자리가 장면 한가운데였다).
 *   - 카메라 시계가 60 이 아니라 약 59.96fps 라, 600 눈금으로 적을 때 100~150 장면마다 11 눈금짜리가 한 번 끼인다.
 * 그래서 장면 경계가 i/60 에서 조금씩 밀려, (i+0.5)/60 이 경계에 딱 걸리는 영상이 생겼다(첫 장면 4 눈금 + 11 눈금
 * 하나 = 경계가 10i+5 눈금). 그러면 브라우저가 부동소수 오차에 따라 앞 · 뒤 장면을 오가며 내줘, 같은 장면이 두 번 ·
 * 한 장 건너뜀이 생겼다 — 18개 중 2개(9f3f2654 22장 · b3fb4050 11장, 원본이 한 바이트도 안 다른 장면). 공이 나는 사이에
 * 걸리면 16.7ms 어긋난 시각을 달고 맞춤에 들어간다. 표를 알면 장면 한가운데를 짚어 그런 일이 없다.
 *
 * 표는 stts(풀기 순서의 장면 길이) + ctts(B 장면의 보이는 시각 어긋남) + elst(편집 목록 — 트랙의 어디부터 보이나)로
 * 센다. 브라우저가 편집 목록을 모두 따른다고 믿기 어려운 파일은 표를 쓰지 않는다(null → 예전 방식):
 *   - 보이는 조각이 둘 이상(잘라 붙인 영상 · 슬로모션을 내보낸 영상) — 브라우저마다 첫 조각만 따르기도 한다.
 *   - 재생 배율(media_rate)이 1 이 아닌 조각 — 시각이 늘거나 줄어 표와 브라우저 시각이 다르다.
 */
export type FrameTable = {
  /** 장면마다 보이기 시작하는 시각(초, 편집 목록 적용 · 오름차순) */
  starts: number[];
  /** 장면마다 보이기가 끝나는 시각(초) — 다음 장면의 시작, 마지막 장면은 흔한 장면 길이만큼 */
  ends: number[];
  /**
   * 장면 k 의 시각(초) — 분석에 넘길 값. 카메라는 고른 간격으로 찍고 파일은 600 눈금 같은 거친 단위로 적으므로,
   * 간격이 고르면(한 가지 또는 눈금 하나 차이의 두 가지) 차례 × 맞춘 간격으로 편다 — 적힌 값 그대로면 '한 장만
   * 1.7ms 긴 장면'(11 눈금)이 맞춤에 들어간다. 고르지 않으면(가변 fps · 빠진 장면) 적힌 [시작, 끝) 의 한가운데.
   * 값은 장면의 한가운데다 — 예전 이름표 (i+0.5)/fps 와 같은 뜻이라 시각을 적은 기록과 견주기 쉽다.
   */
  clock: (k: number) => number;
  /** 고른 간격이면 한 장면 길이(초), 아니면 null */
  period: number | null;
};

/** 편집 목록 한 줄 */
type EditEntry = { segDur: number; mediaTime: number; rateInt: number; rateFrac: number };

/** 파일에서 장면 시각 표를 읽는다 — 못 읽거나 믿기 어려운 편집이면 null(예전 방식으로 짚는다) */
export async function readVideoFrameTable(file: Blob): Promise<FrameTable | null> {
  try {
    const moov = await readMoov(file);
    return moov ? frameTableFromMoov(moov) : null;
  } catch {
    return null;
  }
}

/** moov 상자에서 첫 영상 트랙의 장면 시각 표(파일 없이 시험할 수 있게 뗐다) */
export function frameTableFromMoov(moov: DataView): FrameTable | null {
  const root = moovRoot(moov);
  const mvhd = child(moov, root, 'mvhd');
  let movieTimescale: number | null = null;
  if (mvhd) {
    const v = moov.getUint8(mvhd.body);
    const ts = moov.getUint32(mvhd.body + (v === 1 ? 20 : 12));
    movieTimescale = ts > 0 ? ts : null;
  }
  for (const trak of children(moov, root.body, root.end)) {
    if (trak.type !== 'trak') continue;
    const track = videoTrackBoxes(moov, trak);
    if (!track) continue;
    return trackFrameTable(moov, trak, track, movieTimescale);
  }
  return null;
}

type VideoTrackBoxes = { mdia: Box; timescale: number; stbl: Box };

/** 영상('vide') 트랙이면 그 시간 단위와 표 상자(stbl) */
function videoTrackBoxes(view: DataView, trak: Box): VideoTrackBoxes | null {
  const mdia = child(view, trak, 'mdia');
  if (!mdia) return null;
  const hdlr = child(view, mdia, 'hdlr');
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
  const v = view.getUint8(mdhd.body);
  const timescale = view.getUint32(mdhd.body + (v === 1 ? 20 : 12));
  const minf = child(view, mdia, 'minf');
  const stbl = minf && child(view, minf, 'stbl');
  if (!timescale || !stbl) return null;
  return { mdia, timescale, stbl };
}

function trackFrameTable(
  view: DataView,
  trak: Box,
  { timescale, stbl }: VideoTrackBoxes,
  movieTimescale: number | null
): FrameTable | null {
  const stts = child(view, stbl, 'stts');
  if (!stts) return null;

  /* 1) 풀기 순서의 시각(stts) — 눈금 단위 정수 그대로 센다(부동소수 오차 없이 경계를 견주려고) */
  const decode: number[] = [];
  const deltaCount = new Map<number, number>();
  let dts = 0;
  const sttsCount = view.getUint32(stts.body + 4);
  for (let i = 0; i < sttsCount; i++) {
    const at = stts.body + 8 + i * 8;
    if (at + 8 > stts.end) break;
    const n = view.getUint32(at);
    const delta = view.getUint32(at + 4);
    if (decode.length + n > 2_000_000) return null;
    if (delta > 0) deltaCount.set(delta, (deltaCount.get(delta) ?? 0) + n);
    for (let k = 0; k < n; k++) {
      decode.push(dts);
      dts += delta;
    }
  }
  if (decode.length < 2) return null;
  let typicalDelta = 0;
  let typicalCount = 0;
  for (const [d, n] of deltaCount) {
    if (n > typicalCount) {
      typicalDelta = d;
      typicalCount = n;
    }
  }
  if (!(typicalDelta > 0)) return null;

  /* 2) 보이는 시각 어긋남(ctts) — 판 1 은 음수도 된다. 판 0 도 음수를 담는 파일이 있어 부호 있게 읽는다 */
  const ctts = child(view, stbl, 'ctts');
  if (ctts) {
    const count = view.getUint32(ctts.body + 4);
    let s = 0;
    for (let i = 0; i < count && s < decode.length; i++) {
      const at = ctts.body + 8 + i * 8;
      if (at + 8 > ctts.end) break;
      const n = view.getUint32(at);
      const off = view.getInt32(at + 4);
      for (let k = 0; k < n && s < decode.length; k++) decode[s++] += off;
    }
  }

  /*
   * 3) 편집 목록(elst). 보이는 조각(mediaTime ≥ 0)이 하나이고 배율이 1 일 때만 표를 쓴다. 그 앞의 빈 조각
   *    (mediaTime −1)은 영상이 시작되기 전의 빈 시간이라 그만큼 늦춘다(영화 시간 단위 → 초).
   */
  const edits = readEdits(view, trak);
  let mediaStart = 0;
  let mediaEnd = Number.POSITIVE_INFINITY;
  let delaySec = 0;
  if (edits) {
    const shown = edits.filter((e) => e.mediaTime >= 0);
    if (shown.length > 1) return null;
    if (shown.length === 1) {
      const e = shown[0];
      if (e.rateInt !== 1 || e.rateFrac !== 0) return null;
      const before = edits.slice(0, edits.indexOf(e));
      for (const b of before) {
        if (!movieTimescale) return null;
        delaySec += b.segDur / movieTimescale;
      }
      mediaStart = e.mediaTime;
      /* 조각 길이 0 은 '끝까지'(조각난 mp4 가 그렇게 적는다) */
      if (e.segDur > 0 && movieTimescale) mediaEnd = e.mediaTime + (e.segDur * timescale) / movieTimescale;
    }
  }

  /* 4) 보이는 차례로 정렬 → [시작, 끝) — 보이는 조각 밖은 자르고, 다 잘린 장면은 뺀다 */
  const pts = [...decode].sort((a, b) => a - b);
  const starts: number[] = [];
  const ends: number[] = [];
  for (let k = 0; k < pts.length; k++) {
    const a = Math.max(pts[k], mediaStart);
    const b = Math.min(k + 1 < pts.length ? pts[k + 1] : pts[k] + typicalDelta, mediaEnd);
    if (!(b > a)) continue;
    starts.push((a - mediaStart) / timescale + delaySec);
    ends.push((b - mediaStart) / timescale + delaySec);
  }
  if (starts.length < 2 || !starts.every(Number.isFinite)) return null;
  const { clock, period } = frameClock(starts, ends);
  return { starts, ends, clock, period };
}

/** 편집 목록(edts › elst) — 없으면 null */
function readEdits(view: DataView, trak: Box): EditEntry[] | null {
  const edts = child(view, trak, 'edts');
  const elst = edts && child(view, edts, 'elst');
  if (!elst) return null;
  const version = view.getUint8(elst.body);
  const count = view.getUint32(elst.body + 4);
  const size = version === 1 ? 20 : 12;
  const out: EditEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = elst.body + 8 + i * size;
    if (at + size > elst.end) break;
    const segDur = version === 1 ? Number(view.getBigUint64(at)) : view.getUint32(at);
    const mediaTime = version === 1 ? Number(view.getBigInt64(at + 8)) : view.getInt32(at + 4);
    const rateAt = at + (version === 1 ? 16 : 8);
    out.push({ segDur, mediaTime, rateInt: view.getInt16(rateAt), rateFrac: view.getInt16(rateAt + 2) });
  }
  return out;
}

/**
 * 장면 시각을 고르게 편 시계. 첫 장면(잘려서 짧을 수 있다)은 빼고 1..n−1 의 시작 시각으로 직선을 맞춘다.
 * 고르다 = 간격 값이 한 가지이거나, 두 가지이고 그 차이가 평균 간격의 절반보다 작을 때(600 눈금의 10 · 11 처럼
 * 반올림 때문에 생긴 차이). 차이가 크면(한 장 빠짐 · 30/60 섞임) 진짜로 다른 간격이라 적힌 시각을 그대로 쓴다.
 */
export function frameClock(
  starts: number[],
  ends: number[]
): { clock: (k: number) => number; period: number | null } {
  const n = starts.length;
  const raw = (k: number) => {
    const j = Math.max(0, Math.min(n - 1, k));
    return (starts[j] + ends[j]) / 2;
  };
  if (n < 4) return { clock: raw, period: null };
  const gaps: number[] = [];
  for (let k = 2; k < n; k++) gaps.push(starts[k] - starts[k - 1]);
  const values = [...new Set(gaps.map((g) => Math.round(g * 1e7)))].sort((a, b) => a - b);
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const spread = (values[values.length - 1] - values[0]) / 1e7;
  if (!(meanGap > 0) || values.length > 2 || spread >= meanGap * 0.5) return { clock: raw, period: null };
  let mk = 0;
  let mt = 0;
  for (let k = 1; k < n; k++) {
    mk += k;
    mt += starts[k];
  }
  mk /= n - 1;
  mt /= n - 1;
  let num = 0;
  let den = 0;
  for (let k = 1; k < n; k++) {
    num += (k - mk) * (starts[k] - mt);
    den += (k - mk) ** 2;
  }
  const period = den > 0 ? num / den : meanGap;
  const t0 = mt - period * mk;
  return { clock: (k) => t0 + period * (k + 0.5), period };
}

/**
 * 시각 t 에 보이는 장면 — 시작 ≤ t 인 마지막 장면. 경계에 딱 걸리면 뒤 장면(1e-9초 너그럽게 — 눈금 단위로는
 * 같은 시각이 부동소수로 조금 다르게 나와도 같은 규칙이 되게). 표 앞이면 0, 마지막 장면이 끝난 뒤면 −1.
 */
export function sampleAt(table: FrameTable, t: number): number {
  const s = table.starts;
  if (t + 1e-9 < s[0]) return 0;
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid] <= t + 1e-9) lo = mid;
    else hi = mid - 1;
  }
  return t < table.ends[lo] - 1e-9 ? lo : -1;
}

/** 시각 t 의 장면 번호 — 표 앞이면 첫 장면, 마지막 장면이 끝난 뒤면 마지막 장면(배경 · 거친 장면을 짚을 때) */
export function sampleIndexAt(table: FrameTable, t: number): number {
  const k = sampleAt(table, t);
  return k >= 0 ? k : table.starts.length - 1;
}

/** 장면 k 를 확실히 보이게 되감을 시각 — 그 장면이 보이는 동안의 한가운데 */
export function seekTimeOf(table: FrameTable, k: number): number {
  return (table.starts[k] + table.ends[k]) / 2;
}

export type PlannedFrame = {
  /** 되감을 시각(초) */
  seek: number;
  /** 분석에 넘길 시각(초) */
  t: number;
  /** 장면 번호(표의 차례). 표 없이 짚었으면 null */
  sample: number | null;
  /** 예전 격자의 번호 i — (i+0.5)/fps */
  grid: number;
};

/**
 * 구간 [from, to] 에서 꺼낼 장면들. 어느 장면을 꺼내나는 예전 격자 그대로다 — i 는 ceil(from·fps) 부터
 * (i+0.5)/fps ≤ to 까지, 120장이 넘으면 같은 보폭으로 건너뛴다. 달라진 것은 그 격자 시각을 '그 시각에 보이는 장면'
 * (경계에 걸리면 뒤 장면)으로 바꿔 그 장면의 한가운데를 짚고, 이름표를 고르게 편 시계로 다는 것뿐이다. 그래서
 * 경계에 걸리지 않던 영상은 꺼내는 그림이 예전과 한 장도 다르지 않다(값을 흔들지 않고 두 번 · 건너뜀만 없앤다).
 * 두 격자 시각이 같은 장면이면(11 눈금 장면) 한 번만 꺼낸다. 표가 없으면 예전 그대로((i+0.5)/fps 로 짚고 단다).
 *
 * Math.ceil(from·fps) 는 예전 코드 그대로 둔다 — from·fps 가 정수에 부동소수 오차가 붙으면(0.30000000000000004 × 60)
 * 한 장 뒤부터 시작하는데, 이것을 고치면 10개 영상의 첫 장면이 바뀌어 값이 흔들렸다(1차 검증). 구간을 공으로
 * 정하는 지금은 첫 장면이 릴리스보다 0.1초 넘게 앞이라 이 한 장은 결과와 무관하다.
 */
export function planFrameSeeks(opts: {
  from: number;
  to: number;
  fps: number;
  table: FrameTable | null;
  maxFrames: number;
}): { frames: PlannedFrame[]; sampleFps: number } {
  const { from, to, fps, table, maxFrames } = opts;
  const span = Math.max(0, to - from);
  const stride = Math.max(1, Math.ceil((span * fps) / maxFrames));
  const frames: PlannedFrame[] = [];
  let last = -2;
  for (let i = Math.ceil(from * fps); (i + 0.5) / fps <= to; i += stride) {
    const g = (i + 0.5) / fps;
    if (!table) {
      frames.push({ seek: g, t: g, sample: null, grid: i });
      continue;
    }
    const k = sampleAt(table, g);
    if (k < 0 || k === last) continue;
    last = k;
    frames.push({ seek: seekTimeOf(table, k), t: table.clock(k), sample: k, grid: i });
  }
  const sampleFps = table?.period ? 1 / (table.period * stride) : fps / stride;
  return { frames, sampleFps };
}

/* ───────────────────────── 색(전달 함수) ───────────────────────── */

/**
 * 영상의 색 정보 — 영상 트랙의 표본 설명(stsd › avc1 · hvc1 …) 안 colr 상자('nclc' 퀵타임 · 'nclx' ISO).
 * 번호는 ITU-T H.273 그대로다.
 *
 * 왜 필요한가: 공 지름을 가장자리 밝기로 잴 때, 가장자리 픽셀의 밝기가 덮은 비율과 어떤 관계인지는 영상이 밝기를
 * 어떻게 적었나(전달 함수)에 달렸다. 보정 영상 18개는 모두 SDR BT.709(1/1/1, H.264)다. 아이폰의 기본 설정(HDR 비디오
 * 켬 · 고효율)은 HEVC HLG(전달 18)로 찍는다 — 브라우저는 그것을 캔버스(SDR)에 그릴 때 알 수 없는 곡선으로 톤 매핑한다.
 *
 * 크롬(윈도우, 하드웨어 NV12 풀기)에서 잰 것(2026-09-29, 017af066 두 장면): 캔버스 RGB 의 BT.709 밝기 =
 * (Y′ − 16) × 255/219 (±0.05, 0~255 전 구간 — 풀어낸 Y′ 평면과 픽셀마다 견줌). 즉 크롬은 BT.709 영상을 캔버스에 그릴 때
 * 행렬 변환 · 범위 늘리기만 하고 전달 함수는 바꾸지 않는다 — 엔진이 받는 밝기는 카메라가 적은 BT.709 부호값 그대로다.
 * 아이폰 사파리는 확인하지 못했다(아래 '엔진에 넘기지 않는 까닭').
 */
export type VideoColor = {
  /** 색 영역 번호(1 = BT.709, 9 = BT.2020, 12 = P3) */
  primaries: number | null;
  /** 전달 함수 번호(1 · 6 · 14 · 15 = BT.709 꼴 SDR, 13 = sRGB, 16 = PQ, 18 = HLG) */
  transfer: number | null;
  /** 행렬 번호(1 = BT.709, 6 = BT.601, 9 = BT.2020) */
  matrix: number | null;
  /** 전 범위(0~255)면 true, 좁은 범위(16~235)면 false, 모르면 null('nclc' 는 적지 않는다) */
  fullRange: boolean | null;
  /** 돌비 비전 상자(dvcC · dvvC)가 있나 — 아이폰 HDR 은 HLG 위에 돌비 비전을 싣는다 */
  dolbyVision: boolean;
  /** 표본 설명의 코덱 이름 — 'avc1' · 'hvc1' … */
  codec: string | null;
};

/**
 * 엔진에 넘길 전달 함수의 이름. 'bt709' 는 1 · 6 · 14 · 15(같은 OETF), 'srgb' 는 13, 'pq' 16, 'hlg' 18,
 * 색 상자가 없거나 모르는 번호는 'unknown'(엔진은 SDR BT.709 로 본다 — 대부분의 폰 SDR 영상이 그렇다).
 */
export type VideoTransfer = 'bt709' | 'srgb' | 'pq' | 'hlg' | 'unknown';

export function transferName(color: VideoColor | null): VideoTransfer {
  switch (color?.transfer) {
    case 1:
    case 6:
    case 14:
    case 15:
      return 'bt709';
    case 13:
      return 'srgb';
    case 16:
      return 'pq';
    case 18:
      return 'hlg';
    default:
      return 'unknown';
  }
}

/** HDR(PQ · HLG) 영상인가 — 브라우저가 캔버스에 그릴 때 알 수 없는 곡선으로 톤 매핑한다 */
export function isHdr(color: VideoColor | null): boolean {
  const t = transferName(color);
  return t === 'pq' || t === 'hlg';
}

/*
 * 엔진에 넘기지 않는 까닭 — 엔진(analyzeFrames)의 transfer 입력은 영상 파일 경로에서 넘기지 않는다. 캔버스에 그린 장면은 늘 엔진 기본값
 * ('브라우저 캔버스가 준 부호값 그대로', limb.ts 의 'srgb')이다. 까닭(2026-09-29, 2차 보정 video 조사):
 *   - 크롬은 BT.709 SDR 영상을 캔버스에 그릴 때 부호값을 바꾸지 않는다(위 VideoColor 설명의 측정). 엔진의 윤곽 비율 ·
 *     화각은 바로 이 값으로 맞췄고, 카메라로 바로 잴 때(live-capture — 같은 카메라 · 같은 BT.709 · 같은 캔버스)도 같은 값을
 *     받는다. 파일의 색 상자대로 'bt709' 를 넘기면 엔진이 그 값을 한 번 더 sRGB 로 옮겨(선형 → sRGB) 잰다 — 보정 영상
 *     15개에서 구속이 평균 −0.38%(−1.6 ~ +0.2%) 달라졌고 흩어짐은 그대로였다(배율만 바뀜). 영상 파일과 카메라가 서로 다른
 *     배율로 재게 되므로 넘기지 않는다.
 *   - HDR(HLG · PQ)은 브라우저가 알 수 없는 곡선으로 SDR 캔버스에 톤 매핑한 값이라 되돌릴 수 없다 — 그대로 재되
 *     analyze-video 가 신뢰도를 '중간' 밑으로 두고 SDR 로 찍기를 권한다.
 *   - 확인하지 못한 것: 아이폰 사파리(WebKit)가 BT.709 영상을 캔버스(sRGB)로 색 관리해 그리면, 받는 값은 크롬과 달리
 *     'bt709 → sRGB 로 옮긴 값'이 된다 — 위 −0.38% 만큼(영상마다 최대 1.6%) 어긋날 수 있다. 사파리 장면으로 한 번 재 봐야 한다.
 * 색 정보(readVideoColor)는 그래서 HDR 알림과 진단(결과의 video.color)에만 쓴다.
 */

export async function readVideoColor(file: Blob): Promise<VideoColor | null> {
  try {
    const moov = await readMoov(file);
    return moov ? colorFromMoov(moov) : null;
  } catch {
    return null;
  }
}

/** moov 상자에서 첫 영상 트랙의 색 정보(파일 없이 시험할 수 있게 뗐다). 표본 설명이 없으면 null */
export function colorFromMoov(moov: DataView): VideoColor | null {
  const root = moovRoot(moov);
  for (const trak of children(moov, root.body, root.end)) {
    if (trak.type !== 'trak') continue;
    const track = videoTrackBoxes(moov, trak);
    if (!track) continue;
    const stsd = child(moov, track.stbl, 'stsd');
    /* stsd: 판 · 표시(4) + 개수(4) + 표본 설명들. 첫 설명만 본다 */
    if (!stsd || stsd.body + 8 > stsd.end) return null;
    const entry = readBoxHead(moov, stsd.body + 8, stsd.end);
    if (!entry || entry.end > stsd.end) return null;
    /* 영상 표본 설명(VisualSampleEntry)은 머리 뒤 78 바이트가 고정 칸, 그 뒤가 자식 상자들(avcC · colr · pasp …) */
    const kids = children(moov, entry.body + 78, entry.end);
    const color: VideoColor = {
      primaries: null,
      transfer: null,
      matrix: null,
      fullRange: null,
      dolbyVision: kids.some((b) => b.type === 'dvcC' || b.type === 'dvvC' || b.type === 'dvwC'),
      codec: entry.type,
    };
    const colr = kids.find((b) => b.type === 'colr');
    if (colr && colr.body + 10 <= colr.end) {
      const kind = String.fromCharCode(
        moov.getUint8(colr.body),
        moov.getUint8(colr.body + 1),
        moov.getUint8(colr.body + 2),
        moov.getUint8(colr.body + 3)
      );
      if (kind === 'nclc' || kind === 'nclx') {
        color.primaries = moov.getUint16(colr.body + 4);
        color.transfer = moov.getUint16(colr.body + 6);
        color.matrix = moov.getUint16(colr.body + 8);
        if (kind === 'nclx' && colr.body + 11 <= colr.end) color.fullRange = (moov.getUint8(colr.body + 10) & 0x80) !== 0;
      }
    }
    return color;
  }
  return null;
}
