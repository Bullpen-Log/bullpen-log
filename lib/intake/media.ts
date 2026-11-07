/**
 * 올라간 파일의 머리를 읽어 사실만 모은다. 파일 이름 · 브라우저가 알려 준 종류 · 크기는 믿지 않고 바이트로 본다.
 *
 * 주의: 여기서 읽은 fps 는 '파일에 적힌 사실'이지 카메라 원본의 증거가 아니다. 재인코딩한 영상도 240fps 라고 적을 수 있다.
 * 그래서 화면 글은 '240fps 감지'까지만 말하고, 원본이라고 말하지 않는다. '선택한 파일 그대로 전송됨'은 해시 대조로만 말한다.
 *
 * 시간에 대해: 영상의 표본 시간(mdhd)과 재생 시간(편집 목록)은 다르다. 아이폰 슬로 모션은 240fps 로 찍고 편집 목록으로 가운데를 늘려 재생하므로,
 * 재생 길이를 촬영 길이로 읽으면 틀린다. 둘을 따로 돌려준다. 표본 시간도 촬영 길이의 증거는 아니다 — 슬로 모션을 내보낸 파일은 표본 자체가 늘어나 있다.
 * 앞뒤만 잘라 재생을 줄인 영상(trimmed)과 재생 속도를 바꾼 영상(retimed)은 다른 일이다. 편집 목록의 대응(1:1 인가)으로 가른다.
 *
 * 파일에서 읽은 글은 믿지 않는다: 코덱 · 상표 · 제조사 · 기종에서 제어 글자를 빼고, 범위 밖 촬영 시각은 버린다(cleanFileText · captureMs).
 * NUL 이 든 글은 Postgres jsonb 가 거절하고, 범위 밖 시각은 Date 가 되지 않아 검증이 끝나지 못한다.
 *
 * 받는 그릇은 MOV · MP4 뿐이다. 명세가 요구한 것은 카메라 원본이고 mkv · webm 은 머리를 읽을 수단이 없어, 네 바이트만 맞춰도 통과하게 둘 수 없다.
 * 머리 크기 한도 때문에 못 읽은 MOV · MP4 는 hasVideo null 이다 — 영상이 아니라고 말하지 않되 영상이라고도 말하지 않는다(mediaUnconfirmed).
 * 그런 파일의 자산은 'unconfirmed' 로 끝나고, 판은 'failed'(media_unconfirmed) · 접수는 needs_attention 이 되어 분석 가능 상태로 가지 않는다.
 *
 * 브라우저에서도 돈다(폰이 고른 파일의 사실을 미리 보일 때). 서버는 서명 주소 범위 읽기로 같은 함수를 쓴다.
 */
import {
  boxesIn,
  fourcc,
  readLabFileFacts,
  u32,
  u64,
  videoEditShift,
  type Box,
  type ByteReader,
} from '@/lib/pitch-lab-file';

export type MediaContainer = 'mov' | 'mp4' | 'matroska' | 'unknown';

export type IntakeMediaFacts = {
  container: MediaContainer;
  /** ftyp 의 주 상표(qt · isom 등) */
  brand: string | null;
  /** 영상 트랙이 있나 — 머리를 못 읽은 그릇이면 null */
  hasVideo: boolean | null;
  codec: string | null;
  /** 저장된 픽셀 크기 */
  width: number | null;
  height: number | null;
  /** 시계 방향 회전(도) — 0 · 90 · 180 · 270 */
  rotation: number | null;
  frameCount: number | null;
  /** 표본 시간의 길이(초) — 파일에 담긴 장면들의 시간이다. 촬영 길이의 증거가 아니다(슬로 모션을 내보낸 파일은 늘어나 있다) */
  sampleDurationSec: number | null;
  /** 재생 길이(초) — 편집 목록을 따른 시간. 슬로 모션이면 표본 시간보다 길다 */
  playbackDurationSec: number | null;
  /** 표본 수 ÷ 표본 시간(소수 그대로, 59.94 처럼) */
  averageFps: number | null;
  /** 흔한 값으로 맞춘 이름표용 숫자 — 239.76 이면 240 */
  nominalFps: number | null;
  /** 장면 간격이 일정한가 — unknown 은 못 읽음 */
  frameTiming: 'constant' | 'variable' | 'unknown';
  editList: {
    present: boolean;
    segments: number;
    /** 재생 속도가 바뀐 구간이 있다 — 표본과 재생의 대응이 1:1 이 아니다(슬로 모션 편집 등) */
    retimed: boolean;
    /** 속도는 그대로인데 일부 구간만 재생한다 — 앞뒤를 잘라 낸 영상. 이 칸이 생기기 전에 적은 사실에는 없다 */
    trimmed?: boolean;
    /** 3D 시각에 더할 앞머리(초) — lib/pitch-lab-file.ts videoEditShift */
    shiftSec: number;
  };
  /** 파일에 적힌 촬영 시각 — 접수일이 아니다 */
  captureAtMs: number | null;
  captureSource: 'apple' | 'mvhd' | null;
  make: string | null;
  model: string | null;
  /** 렌즈 정보가 있나 — 원본의 증거는 아니다 */
  hasLensInfo: boolean;
  /** 35mm 환산 초점거리(mm) — 파일에 적힌 값. 못 읽으면 null, 이 칸이 생기기 전에 적은 사실에는 없다 */
  focal35mm?: number | null;
};

const FILE_TEXT_MAX = 80;

/** 파일에서 읽은 글을 저장 · 표시할 수 있게 다듬는다 — 제어 · 보이지 않는 글자를 빼고 길이를 자른다. 남는 글이 없으면 null */
export function cleanFileText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const text = raw.replace(/[\p{C}\uFFFD]/gu, '').trim();
  return text ? [...text].slice(0, FILE_TEXT_MAX).join('') : null;
}

const CAPTURE_MIN_MS = Date.UTC(1990, 0, 1);
const CAPTURE_MAX_MS = Date.UTC(2100, 0, 1);

/** 파일에 적힌 촬영 시각 — 말이 안 되는 값은 없는 것으로 본다(판단 재료가 아니라 표시용이다) */
export function captureMs(ms: number | null | undefined): number | null {
  return ms != null && Number.isFinite(ms) && ms >= CAPTURE_MIN_MS && ms < CAPTURE_MAX_MS ? ms : null;
}

/** 파일 머리 바이트로 그릇을 가른다 — 종류 신고는 믿지 않는다 */
export function sniffContainer(head: Uint8Array): { container: MediaContainer; brand: string | null } {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return { container: 'matroska', brand: null };
  }
  if (head.length < 8) return { container: 'unknown', brand: null };
  const type = fourcc(head, 4);
  if (type === 'ftyp' && head.length >= 12) {
    const brand = fourcc(head, 8);
    return { container: brand === 'qt  ' ? 'mov' : 'mp4', brand: cleanFileText(brand) };
  }
  /* ftyp 없이 시작하는 옛 QuickTime 파일 */
  if (['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(type)) return { container: 'mov', brand: null };
  return { container: 'unknown', brand: null };
}

const NOMINAL = [24, 25, 30, 48, 50, 60, 90, 100, 120, 200, 240, 480, 960];

/** 23.976 → 24, 59.94 → 60, 119.88 → 120, 239.76 → 240 — 흔한 값에서 1.5% 안이면 그 값, 아니면 반올림 */
export function nominalFpsOf(fps: number): number {
  const near = NOMINAL.find((n) => Math.abs(fps - n) / n <= 0.015);
  return near ?? Math.round(fps);
}

type VideoTrack = {
  codec: string | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  frameCount: number | null;
  sampleDurationSec: number | null;
  averageFps: number | null;
  frameTiming: 'constant' | 'variable' | 'unknown';
  segments: number;
  /** 편집 목록을 따른 재생 길이 — 없으면 null */
  playbackDurationSec: number | null;
  retimed: boolean;
  trimmed: boolean;
};

const CODEC_NAME: Record<string, string> = {
  hvc1: 'HEVC',
  hev1: 'HEVC',
  avc1: 'H.264',
  avc3: 'H.264',
  av01: 'AV1',
  vp09: 'VP9',
  apch: 'ProRes',
  apcn: 'ProRes',
  apcs: 'ProRes',
  apco: 'ProRes',
  ap4h: 'ProRes',
  ap4x: 'ProRes',
};

function rotationOf(b: Uint8Array, tkhd: Box): number | null {
  const v1 = b[tkhd.body] === 1;
  const matrix = tkhd.body + (v1 ? 52 : 40);
  if (matrix + 36 > tkhd.end) return null;
  const fixed = (at: number) => (u32(b, at) | 0) / 65536;
  const angle = (Math.atan2(fixed(matrix + 4), fixed(matrix)) * 180) / Math.PI;
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
}

/** stts 표 → 표본 수 · 전체 시간 · 간격이 고른가. 끝 한 칸은 자주 달라서 간격 판정에서 뺀다 */
function readStts(b: Uint8Array, stts: Box): { count: number; total: number; timing: 'constant' | 'variable' } | null {
  const n = u32(b, stts.body + 4);
  const runs: { count: number; delta: number }[] = [];
  for (let i = 0; i < n; i++) {
    const at = stts.body + 8 + i * 8;
    if (at + 8 > stts.end) break;
    runs.push({ count: u32(b, at), delta: u32(b, at + 4) });
  }
  const count = runs.reduce((s, r) => s + r.count, 0);
  const total = runs.reduce((s, r) => s + r.count * r.delta, 0);
  if (!count || !total) return null;
  /* 끝 표본 하나를 뺀 나머지에서, 가장 많은 간격이 98% 넘게 차지하고 그 둘레 5% 안에 다 들면 고르다 */
  const body = runs.map((r) => ({ ...r }));
  const last = body[body.length - 1];
  if (last.count === 1 && body.length > 1) body.pop();
  else last.count -= 1;
  const bodyCount = body.reduce((s, r) => s + r.count, 0);
  if (!bodyCount) return { count, total, timing: 'constant' };
  const main = body.reduce((best, r) => (r.count > best.count ? r : best), body[0]);
  const within = body.filter((r) => Math.abs(r.delta - main.delta) <= main.delta * 0.05).reduce((s, r) => s + r.count, 0);
  return { count, total, timing: within / bodyCount >= 0.98 ? 'constant' : 'variable' };
}

type EditSegment = {
  /** 재생 시간(초) */
  durationSec: number;
  /** 미디어 시각(초) — 빈 조각이면 null. 표본 시간표를 몰라도 null */
  mediaSec: number | null;
  /** 재생 속도 — 1 이 그대로, 0 은 한 장면에 멈춤 */
  rate: number;
};

function readEdits(b: Uint8Array, elst: Box, movieScale: number, mediaScale: number): EditSegment[] {
  const v1 = b[elst.body] === 1;
  const step = v1 ? 20 : 12;
  const n = u32(b, elst.body + 4);
  const out: EditSegment[] = [];
  for (let i = 0; i < n; i++) {
    const at = elst.body + 8 + i * step;
    if (at + step > elst.end) break;
    const raw = v1 ? u64(b, at + 8) : u32(b, at + 4);
    /* 미디어 시각 −1 은 빈 조각 — 32/64 비트 부호 */
    const empty = raw >= (v1 ? 2 ** 63 : 2 ** 31);
    out.push({
      durationSec: (v1 ? u64(b, at) : u32(b, at)) / movieScale,
      mediaSec: empty || !mediaScale ? null : raw / mediaScale,
      rate: u32(b, at + (v1 ? 16 : 8)) / 65536,
    });
  }
  return out;
}

/** 첫 조각의 미디어 시각을 표시 시각의 앞머리로 보는 상한 — B 장면 몇 장이다. 이보다 길면 앞을 잘라 낸 것이라 뒤로 밀리지 않는다 */
const MAX_LEAD_SEC = 0.5;

/**
 * 편집 목록이 표본과 재생을 어떻게 잇나. 조각마다 재생 길이와, 그 조각이 쓸 수 있는 미디어 구간(다음 조각의 시작 또는 표본 끝까지)을 견준다.
 * 재생이 그 구간보다 길면 늘린 것이고(슬로 모션), 속도 칸이 1 이 아니어도 그렇다. 같거나 짧으면 1:1 이고, 전체가 표본보다 적으면 잘라 낸 것뿐이다.
 * 미디어 시각은 표시 시각이라 B 장면이 있으면 복호 시간 합보다 그 앞머리만큼 뒤에서 끝난다 — 마지막 조각의 끝을 그만큼 민다.
 * ffmpeg 가 쓰는 모양(미디어 시각 = 첫 표시 오프셋, 재생 = 표본 전체)을 늘린 것으로 읽지 않으려는 것이다.
 */
function editMapping(edits: readonly EditSegment[], mediaEndSec: number | null): { retimed: boolean; trimmed: boolean } {
  const shown = edits.filter((e) => e.mediaSec != null);
  if (!shown.length) return { retimed: false, trimmed: false };
  const lastEnd = mediaEndSec == null ? null : mediaEndSec + Math.min(shown[0].mediaSec!, MAX_LEAD_SEC);
  const retimed = shown.some((e, i) => {
    if (e.rate !== 1) return true;
    const next = shown[i + 1];
    const end = next && next.mediaSec! >= e.mediaSec! ? next.mediaSec! : lastEnd;
    return end != null && e.durationSec > end - e.mediaSec! + Math.max(0.05, e.durationSec * 0.02);
  });
  if (retimed || mediaEndSec == null) return { retimed, trimmed: false };
  /* B 장면 때문에 앞을 몇 장면 건너뛰는 편집은 흔하다 — 그만큼은 잘라 낸 것으로 안 친다 */
  const shownSec = shown.reduce((sum, e) => sum + e.durationSec, 0);
  return { retimed: false, trimmed: mediaEndSec - shownSec > Math.max(0.15, mediaEndSec * 0.01) };
}

function readVideoTrack(b: Uint8Array, trak: Box, movieScale: number): VideoTrack | null {
  const kids = boxesIn(b, trak.body, trak.end);
  const mdia = kids.find((k) => k.type === 'mdia');
  if (!mdia) return null;
  const mk = boxesIn(b, mdia.body, mdia.end);
  const hdlr = mk.find((k) => k.type === 'hdlr');
  if (!hdlr || fourcc(b, hdlr.body + 8) !== 'vide') return null;

  const mdhd = mk.find((k) => k.type === 'mdhd');
  const v1 = mdhd ? b[mdhd.body] === 1 : false;
  const mediaScale = mdhd ? u32(b, mdhd.body + (v1 ? 20 : 12)) : 0;

  const minf = mk.find((k) => k.type === 'minf');
  const stbl = minf && boxesIn(b, minf.body, minf.end).find((k) => k.type === 'stbl');
  const sk = stbl ? boxesIn(b, stbl.body, stbl.end) : [];
  const stsd = sk.find((k) => k.type === 'stsd');
  const stts = sk.find((k) => k.type === 'stts');

  let codec: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  if (stsd && stsd.end - stsd.body >= 44) {
    const entry = stsd.body + 8;
    const raw = fourcc(b, entry + 4);
    codec = CODEC_NAME[raw] ?? cleanFileText(raw);
    width = (b[entry + 32] << 8) | b[entry + 33];
    height = (b[entry + 34] << 8) | b[entry + 35];
  }

  const tkhd = kids.find((k) => k.type === 'tkhd');
  const table = stts ? readStts(b, stts) : null;
  const sampleDurationSec = table && mediaScale ? table.total / mediaScale : null;
  const averageFps = table && mediaScale ? (table.count * mediaScale) / table.total : null;

  const edts = kids.find((k) => k.type === 'edts');
  const elst = edts && boxesIn(b, edts.body, edts.end).find((k) => k.type === 'elst');
  const edits = elst && movieScale ? readEdits(b, elst, movieScale, mediaScale) : [];
  const mapping = editMapping(edits, sampleDurationSec);
  /* 재생 길이 — 빈 조각 · 멈춘 조각까지 다 합친 movie 시간 */
  const playbackDurationSec = edits.length ? edits.reduce((sum, e) => sum + e.durationSec, 0) : null;

  return {
    codec,
    width,
    height,
    rotation: tkhd ? rotationOf(b, tkhd) : null,
    frameCount: table?.count ?? null,
    sampleDurationSec,
    averageFps,
    frameTiming: table?.timing ?? 'unknown',
    segments: edits.length,
    playbackDurationSec,
    ...mapping,
  };
}

/** moov 상자의 몸이 시작하는 자리 — 큰 크기(64비트)로 적힌 상자는 머리가 16바이트다 */
const moovBody = (moov: Uint8Array) => (u32(moov, 0) === 1 ? 16 : 8);

function movieScaleOf(moov: Uint8Array): number {
  const mvhd = boxesIn(moov, moovBody(moov), moov.length).find((k) => k.type === 'mvhd');
  return mvhd ? u32(moov, mvhd.body + (moov[mvhd.body] === 1 ? 20 : 12)) : 0;
}

const EMPTY: Omit<IntakeMediaFacts, 'container' | 'brand'> = {
  hasVideo: null,
  codec: null,
  width: null,
  height: null,
  rotation: null,
  frameCount: null,
  sampleDurationSec: null,
  playbackDurationSec: null,
  averageFps: null,
  nominalFps: null,
  frameTiming: 'unknown',
  editList: { present: false, segments: 0, retimed: false, trimmed: false, shiftSec: 0 },
  captureAtMs: null,
  captureSource: null,
  make: null,
  model: null,
  hasLensInfo: false,
  focal35mm: null,
};

/** 같은 범위를 두 번 부르면 한 번만 읽는다(머리 moov 는 두 함수가 읽는다) */
function memoReader(r: ByteReader): ByteReader {
  const seen = new Map<string, Promise<Uint8Array>>();
  return {
    size: r.size,
    read: (start, end) => {
      const key = `${start}-${end}`;
      let hit = seen.get(key);
      if (!hit) {
        hit = r.read(start, end);
        seen.set(key, hit);
      }
      return hit;
    },
  };
}

/** 머리 안에서 찾아볼 맨 위 상자 수 · moov 크기 — lib/pitch-lab-file.ts readMoov 와 같은 값이다(이상한 파일에서 메모리를 지킨다) */
const MAX_TOP_BOXES = 64;
const MAX_MOOV_BYTES = 16 * 1024 * 1024;

type MoovLookup = { kind: 'found'; bytes: Uint8Array } | { kind: 'limit' } | { kind: 'absent' };

/**
 * 맨 위 상자를 훑어 moov 를 찾는다. 파일 끝까지 봤는데 없으면 'absent'(영상이 아니다), 한도 때문에 못 봤으면 'limit'(모른다).
 * 둘을 가르려고 readMoov 를 쓰지 않는다 — 그쪽은 둘 다 null 이다.
 */
async function lookUpMoov(r: ByteReader): Promise<MoovLookup> {
  let p = 0;
  for (let n = 0; p + 8 <= r.size; n++) {
    if (n >= MAX_TOP_BOXES) return { kind: 'limit' };
    const h = await r.read(p, Math.min(r.size, p + 16));
    if (h.length < 8) return { kind: 'absent' };
    let size = u32(h, 0);
    if (size === 1 && h.length >= 16) size = u64(h, 8);
    else if (size === 0) size = r.size - p;
    if (size < 8 || !Number.isFinite(size)) return { kind: 'absent' };
    if (fourcc(h, 4) === 'moov') {
      if (size > MAX_MOOV_BYTES) return { kind: 'limit' };
      return { kind: 'found', bytes: await r.read(p, p + size) };
    }
    p += size;
  }
  return { kind: 'absent' };
}

/** 파일에서 사실을 읽는다. 머리를 못 읽으면 그릇만 채워 돌려준다(던지지 않는다 — 읽기 실패 자체는 부른 쪽이 던진다) */
export async function readIntakeMediaFacts(source: ByteReader): Promise<IntakeMediaFacts> {
  const reader = memoReader(source);
  const head = await reader.read(0, Math.min(reader.size, 64));
  const { container, brand } = sniffContainer(head);
  if (container === 'unknown' || container === 'matroska') return { ...EMPTY, container, brand };

  const found = await lookUpMoov(reader);
  if (found.kind === 'limit') return { ...EMPTY, container, brand };
  if (found.kind === 'absent') return { ...EMPTY, container, brand, hasVideo: false };
  const moov = found.bytes;

  const scale = movieScaleOf(moov);
  const traks = boxesIn(moov, moovBody(moov), moov.length).filter((k) => k.type === 'trak');
  const track = traks.map((t) => readVideoTrack(moov, t, scale)).find((t) => t != null) ?? null;
  const facts = await readLabFileFacts(reader);

  const startMs = captureMs(facts?.startMs);

  return {
    container,
    brand,
    hasVideo: track != null,
    codec: track?.codec ?? null,
    width: track?.width ?? null,
    height: track?.height ?? null,
    rotation: track?.rotation ?? null,
    frameCount: track?.frameCount ?? null,
    sampleDurationSec: track?.sampleDurationSec ?? null,
    playbackDurationSec: track?.playbackDurationSec ?? track?.sampleDurationSec ?? null,
    averageFps: track?.averageFps ?? null,
    nominalFps: track?.averageFps != null ? nominalFpsOf(track.averageFps) : null,
    frameTiming: track?.frameTiming ?? 'unknown',
    editList: {
      present: (track?.segments ?? 0) > 0,
      segments: track?.segments ?? 0,
      retimed: track?.retimed ?? false,
      trimmed: track?.trimmed ?? false,
      shiftSec: track ? videoEditShift(moov) : 0,
    },
    captureAtMs: startMs,
    captureSource: startMs != null ? (facts?.timeSource ?? null) : null,
    make: cleanFileText(facts?.make),
    model: cleanFileText(facts?.model),
    hasLensInfo: facts?.hasLens ?? false,
    focal35mm: facts?.focal35 ?? null,
  };
}

export type MediaRejectCode = 'not_video' | 'unsupported_container';

/** 사람이 읽는 까닭 — 고를 때 화면과 영수증 쪽이 같은 글을 쓰게 여기 둔다 */
export const MEDIA_REJECT_TEXT: Record<MediaRejectCode, string> = {
  not_video: '영상 파일이 아니에요. 찍은 영상을 골라 주세요.',
  unsupported_container: 'MOV나 MP4 영상만 받을 수 있어요. 카메라로 찍은 원본 영상을 골라 주세요.',
};

/** 바이트만 봐서 막을 까닭 — 낮은 fps 나 재생 못 함으로는 막지 않는다. 머리를 못 읽은 MOV · MP4 도 막지 않는다(mediaUnconfirmed) */
export function mediaRejectCode(f: Pick<IntakeMediaFacts, 'container' | 'hasVideo'>): MediaRejectCode | null {
  if (f.container === 'matroska') return 'unsupported_container';
  if (f.container === 'unknown' || f.hasVideo === false) return 'not_video';
  return null;
}

/** 받지 않을 파일인가 — 화면이 고를 때도 쓴다 */
export const notAVideo = (f: Pick<IntakeMediaFacts, 'container' | 'hasVideo'>) => mediaRejectCode(f) != null;

/** 막지는 않지만 영상이라고 확인하지도 못한 파일 — 사람이 볼 때까지 분석 가능 상태로 가지 않는다 */
export const mediaUnconfirmed = (f: Pick<IntakeMediaFacts, 'container' | 'hasVideo'>) => !notAVideo(f) && f.hasVideo !== true;

/** 영상 정보 이름표 — fps 만 말한다. 장면 간격이 고르지 않으면 '약'을 붙인다 */
export function fpsLabel(f: Pick<IntakeMediaFacts, 'nominalFps' | 'frameTiming'>): string {
  if (f.nominalFps == null) return '영상 정보 확인 필요';
  return f.frameTiming === 'variable' ? `약 ${f.nominalFps}fps 감지` : `${f.nominalFps}fps 감지`;
}

/** 전송 무결성 이름표 — 서버가 해시까지 맞춘 뒤에만 '그대로' 라고 말한다. 카메라 원본 여부와는 다른 말이다 */
export function integrityLabel(status: string): string | null {
  if (status === 'verified') return '선택한 파일 그대로 전송됨';
  if (status === 'rejected' || status === 'unconfirmed') return '영상 정보 확인 필요';
  if (status === 'purging') return '보유 기간이 지나 원본을 지우고 있어요';
  if (status === 'purged') return '보유 기간이 지나 원본을 지웠어요';
  return null;
}

/** 재생과 표본이 다를 때의 안내 — 없으면 null. 표본 시간을 촬영 길이라고 말하지 않는다 */
export function timingNote(f: Pick<IntakeMediaFacts, 'editList' | 'frameTiming'>): string | null {
  if (f.editList.retimed) return '재생 속도를 바꾼 구간이 있어요. 재생 길이를 촬영 길이로 읽으면 안 돼요.';
  if (f.editList.trimmed) return '앞뒤를 잘라 일부 구간만 재생되는 영상이에요.';
  if (f.frameTiming === 'variable') return '장면 간격이 일정하지 않아요.';
  return null;
}
