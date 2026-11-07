/**
 * 외부 접수 시험의 재료 — 진짜 카메라 영상이 아니라, 파일 머리 구조만 아이폰 mov 처럼 만든 가짜 영상이다.
 * 이것으로 확인하는 것은 '머리를 맞게 읽는가'뿐이다. 실제 기기의 영상 판별은 이 시험으로 말할 수 없다.
 */
import { randomBytes } from 'node:crypto';

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};
const box = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(body.length + 8), Buffer.from(type, 'latin1'), body]);
};
const zeros = (n: number) => Buffer.alloc(n);

export type MovOptions = {
  /** 장면 시간 단위 */
  timescale?: number;
  /** stts 칸 — [표본 수, 표본 길이] */
  stts: [number, number][];
  /** 편집 목록 — [재생 길이(movie 단위), 미디어 시각, 재생 속도(없으면 1)] */
  edits?: [number, number, number?][];
  /** 시계 방향 회전 */
  rotation?: 0 | 90 | 180 | 270;
  width?: number;
  height?: number;
  codec?: string;
  mdatBytes?: number;
  /** 아이폰 촬영 시각 글 */
  appleDate?: string;
  /** 아이폰 기종 글 — 제어 글자가 든 값을 넣어 본다 */
  appleModel?: string;
  /** com.apple.quicktime.camera.focal_length.35mm_equivalent 값 */
  appleFocal?: string;
  brand?: string;
  /** mvhd 판 1 의 만든 시각(초) — 말이 안 되는 값을 넣어 본다 */
  mvhdCreated?: bigint;
  /** moov 머리를 64비트 크기로 적는다 */
  largeMoov?: boolean;
  /** moov 앞에 끼울 빈 맨 위 상자 수 */
  fillerBoxes?: number;
};

const MOVIE_SCALE = 600;

export function buildMov(o: MovOptions): Buffer {
  const timescale = o.timescale ?? 600;
  const samples = o.stts.reduce((s, [c, d]) => s + c * d, 0);
  const movieDuration = Math.round((samples / timescale) * MOVIE_SCALE);

  const u64 = (n: bigint) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(n);
    return b;
  };
  const mvhd =
    o.mvhdCreated != null
      ? box('mvhd', Buffer.from([1, 0, 0, 0]), u64(o.mvhdCreated), u64(BigInt(0)), u32(MOVIE_SCALE), u64(BigInt(movieDuration)), zeros(80))
      : box('mvhd', zeros(4), u32(0), u32(0), u32(MOVIE_SCALE), u32(movieDuration), zeros(80));

  const rot = o.rotation ?? 0;
  const cos = [1, 0, -1, 0][rot / 90];
  const sin = [0, 1, 0, -1][rot / 90];
  const fixed = (v: number) => u32((v * 65536) >>> 0);
  const matrix = Buffer.concat([fixed(cos), fixed(sin), u32(0), fixed(-sin), fixed(cos), u32(0), u32(0), u32(0), u32(0x40000000)]);
  const tkhd = box(
    'tkhd',
    zeros(4),
    u32(0),
    u32(0),
    u32(1),
    zeros(4),
    u32(movieDuration),
    zeros(8),
    zeros(2),
    zeros(2),
    zeros(2),
    zeros(2),
    matrix,
    u32((o.width ?? 1920) * 65536),
    u32((o.height ?? 1080) * 65536),
  );

  const edts = o.edits
    ? box(
        'edts',
        box(
          'elst',
          zeros(4),
          u32(o.edits.length),
          ...o.edits.map(([dur, media, rate]) => Buffer.concat([u32(dur), u32(media), u32(Math.round((rate ?? 1) * 0x10000))])),
        ),
      )
    : null;

  const mdhd = box('mdhd', zeros(4), u32(0), u32(0), u32(timescale), u32(samples), zeros(4));
  const hdlr = box('hdlr', zeros(4), zeros(4), Buffer.from('vide', 'latin1'), zeros(12), Buffer.from('video\0', 'latin1'));
  const visual = Buffer.alloc(78);
  visual.writeUInt16BE(o.width ?? 1920, 24);
  visual.writeUInt16BE(o.height ?? 1080, 26);
  const stsd = box('stsd', zeros(4), u32(1), box(o.codec ?? 'hvc1', visual));
  const stts = box('stts', zeros(4), u32(o.stts.length), ...o.stts.map(([c, d]) => Buffer.concat([u32(c), u32(d)])));
  const minf = box('minf', box('stbl', stsd, stts));
  const mdia = box('mdia', mdhd, hdlr, minf);
  const trak = box('trak', tkhd, ...(edts ? [edts] : []), mdia);

  const metaValues: [string, string][] = [
    ...(o.appleDate ? ([['com.apple.quicktime.creationdate', o.appleDate]] as [string, string][]) : []),
    ...(o.appleModel ? ([['com.apple.quicktime.model', o.appleModel]] as [string, string][]) : []),
    ...(o.appleFocal ? ([['com.apple.quicktime.camera.focal_length.35mm_equivalent', o.appleFocal]] as [string, string][]) : []),
  ];
  const meta = metaValues.length
    ? box(
        'meta',
        box('hdlr', zeros(4), zeros(4), Buffer.from('mdta', 'latin1'), zeros(12), Buffer.from('\0', 'latin1')),
        box('keys', zeros(4), u32(metaValues.length), ...metaValues.map(([k]) => box('mdta', Buffer.from(k, 'latin1')))),
        box(
          'ilst',
          ...metaValues.map(([, v], i) => Buffer.concat([u32(8 + 8 + 8 + Buffer.byteLength(v)), u32(i + 1), box('data', u32(1), zeros(4), Buffer.from(v, 'utf8'))])),
        ),
      )
    : null;

  const moovBody = Buffer.concat([mvhd, trak, ...(meta ? [meta] : [])]);
  const moov = o.largeMoov ? Buffer.concat([u32(1), Buffer.from('moov', 'latin1'), u64(BigInt(moovBody.length + 16)), moovBody]) : box('moov', moovBody);
  const ftyp = box('ftyp', Buffer.from((o.brand ?? 'qt  ').padEnd(4), 'latin1'), zeros(4), Buffer.from('qt  ', 'latin1'));
  const mdat = box('mdat', randomBytes(o.mdatBytes ?? 1024));
  /* 아이폰처럼 moov 를 뒤에 둔다 — 서버가 범위 읽기로 찾아야 한다 */
  const filler = Array.from({ length: o.fillerBoxes ?? 0 }, () => box('free', zeros(8)));
  return Buffer.concat([ftyp, mdat, ...filler, moov]);
}

/** ftyp 뒤에 크기만 적은 moov 머리 — 몸은 없다. 머리 크기 한도를 넘긴 파일을 메모리에 안 만들고 흉내 낸다 */
export function hugeMoovHeader(moovBytes: number): Buffer {
  return Buffer.concat([box('ftyp', Buffer.from('qt  ', 'latin1'), zeros(4), Buffer.from('qt  ', 'latin1')), u32(moovBytes), Buffer.from('moov', 'latin1')]);
}

/** 119.88fps(1001/120000) 고른 영상 */
export const mov120 = (mdatBytes = 2048, extra: Partial<MovOptions> = {}) =>
  buildMov({ timescale: 120000, stts: [[600, 1001]], mdatBytes, ...extra });

/** 239.76fps, 세로로 든 폰 */
export const mov240 = (mdatBytes = 2048, extra: Partial<MovOptions> = {}) =>
  buildMov({ timescale: 240000, stts: [[1200, 1001]], rotation: 90, mdatBytes, ...extra });
