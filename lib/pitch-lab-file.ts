/**
 * 3D 동작 분석에 올릴 영상의 머리(moov)에서 '언제 · 무엇으로 찍었나'를 읽는다 — 폰 안에서 파일 머리만(GPU · 서버 0).
 *
 * 2026-10-15 사용자: "녹화 영상 금지, 두 번 따로 촬영도 금지, 무조건 동시에". 쓰는 곳은 lib/pitch-lab-guard.ts:
 *   - 화면 녹화 알아채기: 카메라로 찍은 아이폰 영상은 렌즈 이름 · 35mm 환산 초점거리를 적는다. 화면 녹화에는 없다.
 *   - 따로 찍은 짝 알아채기: 두 영상의 찍은 시각이 영상 길이보다 멀면 같은 공을 같이 찍은 것이 아니다.
 *
 * 찍은 시각은 두 곳에 있다 — 아이폰의 com.apple.quicktime.creationdate(녹화를 시작한 때, 시간대 포함)와 mp4 · mov 공통의
 * mvhd 만든 시각(초 단위 UTC, 기기에 따라 시작 또는 끝). 기준이 섞일 수 있어 판정 쪽(labPairBlock)이 영상 길이만큼 넉넉히 본다.
 * 못 읽으면 null — 그 칸으로는 막지 않는다.
 *
 * 상자(box)를 차례로 읽는다: 맨 위 상자 머리만 훑어 moov 를 찾고(아이폰 mov 는 영상 뒤에 있다) moov 만 통째로 읽는다.
 */

export type LabFileFacts = {
  /** 찍은 시각(ms, UTC) — 없으면 null */
  startMs: number | null;
  /** 시각의 출처 — apple: 녹화 시작(아이폰) · mvhd: 파일 머리의 만든 시각(기기마다 시작 또는 끝) */
  timeSource: 'apple' | 'mvhd' | null;
  /** 영상 길이(초) — mvhd */
  durationSec: number | null;
  /** 카메라 렌즈 정보가 있나(아이폰 카메라 영상은 늘 있다) */
  hasLens: boolean;
  make: string | null;
  model: string | null;
};

/** moov 가 이보다 크면 읽지 않는다(보통 1MB 밑 — 이상한 파일에서 폰 메모리를 지킨다) */
const MAX_MOOV = 16 * 1024 * 1024;
/** 1904-01-01 과 1970-01-01 사이 초 */
const MAC_EPOCH = 2082844800;

const APPLE = {
  creation: 'com.apple.quicktime.creationdate',
  lens: 'com.apple.quicktime.camera.lens_model',
  focal35: 'com.apple.quicktime.camera.focal_length.35mm_equivalent',
  make: 'com.apple.quicktime.make',
  model: 'com.apple.quicktime.model',
} as const;

type Box = { type: string; start: number; end: number; body: number };

const fourcc = (b: Uint8Array, at: number) =>
  String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

function u32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
}

function u64(b: Uint8Array, at: number): number {
  return u32(b, at) * 2 ** 32 + u32(b, at + 4);
}

/** buf[from, to) 안의 상자들 */
function boxesIn(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let p = from;
  while (p + 8 <= to && out.length < 512) {
    let size = u32(b, p);
    let body = p + 8;
    if (size === 1) {
      if (p + 16 > to) break;
      size = u64(b, p + 8);
      body = p + 16;
    } else if (size === 0) {
      size = to - p;
    }
    if (size < body - p || p + size > to) break;
    out.push({ type: fourcc(b, p + 4), start: p, end: p + size, body });
    p += size;
  }
  return out;
}

/** 파일 맨 위 상자에서 moov 를 찾아 그 바이트를 돌려준다 */
async function readMoov(file: Blob): Promise<Uint8Array | null> {
  let p = 0;
  for (let n = 0; p + 8 <= file.size && n < 64; n++) {
    const h = new Uint8Array(
      await file.slice(p, Math.min(file.size, p + 16)).arrayBuffer()
    );
    if (h.length < 8) return null;
    let size = u32(h, 0);
    if (size === 1 && h.length >= 16) size = u64(h, 8);
    else if (size === 0) size = file.size - p;
    if (size < 8) return null;
    if (fourcc(h, 4) === 'moov') {
      if (size > MAX_MOOV) return null;
      return new Uint8Array(await file.slice(p, p + size).arrayBuffer());
    }
    p += size;
  }
  return null;
}

/** QuickTime 메타(keys · ilst)의 값 — 글 · 정수 · 실수만 */
function decodeData(b: Uint8Array, box: Box): string | number | null {
  /* data 상자: [종류 4(앞 1바이트 판)][로케일 4][값] */
  if (box.end - box.body < 8) return null;
  const kind = u32(b, box.body) & 0xffffff;
  const v = box.body + 8;
  const len = box.end - v;
  if (kind === 1)
    return new TextDecoder().decode(b.subarray(v, box.end)).replace(/\0+$/g, '');
  const dv = new DataView(b.buffer, b.byteOffset + v, len);
  if (kind === 23 && len === 4) return dv.getFloat32(0);
  if (kind === 24 && len === 8) return dv.getFloat64(0);
  if ((kind === 21 || kind === 22) && len >= 1 && len <= 4) {
    let n = 0;
    for (let i = 0; i < len; i++) n = n * 256 + b[v + i];
    return kind === 21 && b[v] >= 128 ? n - 2 ** (8 * len) : n;
  }
  return null;
}

/** meta 상자 하나의 열쇠 → 값(아이폰 mdta) */
function readMeta(b: Uint8Array, meta: Box, into: Map<string, string | number>) {
  /* QuickTime 의 meta 는 판 · 깃발 4바이트가 없고, ISO 의 meta 는 있다 — 다음 상자가 hdlr 인 쪽으로 */
  const body = fourcc(b, meta.body + 4) === 'hdlr' ? meta.body : meta.body + 4;
  const kids = boxesIn(b, body, meta.end);
  const keys = kids.find((k) => k.type === 'keys');
  const ilst = kids.find((k) => k.type === 'ilst');
  if (!keys || !ilst) return;
  const names: string[] = [];
  const count = u32(b, keys.body + 4);
  let p = keys.body + 8;
  for (let i = 0; i < count && p + 8 <= keys.end; i++) {
    const size = u32(b, p);
    if (size < 8 || p + size > keys.end) break;
    names.push(new TextDecoder().decode(b.subarray(p + 8, p + size)));
    p += size;
  }
  for (const item of boxesIn(b, ilst.body, ilst.end)) {
    const idx = u32(b, item.start + 4) - 1;
    const name = names[idx];
    if (!name) continue;
    const data = boxesIn(b, item.body, item.end).find((d) => d.type === 'data');
    if (!data) continue;
    const value = decodeData(b, data);
    if (value != null && !into.has(name)) into.set(name, value);
  }
}

/** '2026-10-15T14:03:22+0900' → ms(시간대의 쌍점이 없어도) */
export function parseAppleDate(text: string): number | null {
  const iso = text.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export async function readLabFileFacts(file: Blob): Promise<LabFileFacts | null> {
  try {
    const moov = await readMoov(file);
    if (!moov) return null;
    const values = new Map<string, string | number>();
    /* 안쪽 함수가 채운다(let 이면 타입 좁히기가 바깥에서 null 로 굳는다) */
    const head: { ms: number | null; durationSec: number | null } = {
      ms: null,
      durationSec: null,
    };
    /* moov · trak · udta 안의 meta 와 mvhd — 깊이 넷까지 */
    const walk = (from: number, to: number, depth: number) => {
      for (const box of boxesIn(moov, from, to)) {
        if (box.type === 'mvhd' && box.end - box.body >= 20) {
          const v1 = moov[box.body] === 1;
          const created = v1 ? u64(moov, box.body + 4) : u32(moov, box.body + 4);
          const scale = v1 ? u32(moov, box.body + 20) : u32(moov, box.body + 12);
          const dur = v1 ? u64(moov, box.body + 24) : u32(moov, box.body + 16);
          /* 0 이나 2000년 앞 = 시각을 안 적은 파일 */
          if (created > MAC_EPOCH + 946684800) head.ms = (created - MAC_EPOCH) * 1000;
          if (scale > 0 && dur > 0) head.durationSec = dur / scale;
        } else if (box.type === 'meta') {
          readMeta(moov, box, values);
        } else if (
          depth < 4 &&
          (box.type === 'trak' || box.type === 'udta' || box.type === 'moov')
        ) {
          walk(box.body, box.end, depth + 1);
        }
      }
    };
    walk(0, moov.length, 0);
    const str = (k: string) => {
      const v = values.get(k);
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    const created = str(APPLE.creation);
    const appleMs = created ? parseAppleDate(created) : null;
    return {
      startMs: appleMs ?? head.ms,
      timeSource: appleMs != null ? 'apple' : head.ms != null ? 'mvhd' : null,
      durationSec: head.durationSec,
      hasLens: str(APPLE.lens) != null || values.has(APPLE.focal35),
      make: str(APPLE.make),
      model: str(APPLE.model),
    };
  } catch {
    return null;
  }
}
