import type { Asset, Entry } from '@/lib/admin-references/schema';
import { CATALOG_KEY, MAX_CATALOG_BYTES, MAX_DETAIL_BYTES, parseCatalog, parseDetail, validEntryId } from '@/lib/admin-references/schema';
import type { ReferenceSource, Viewer } from '@/lib/admin-references/load';

/**
 * EX-REF02 — 원본 파일 보내기(대표관리자만, 순수: 저장소 · 원본 받기는 밖에서 넣는다 — 시험이 가짜로 돈다).
 *
 * 순서: 보는 사람 → 번호 모양 → 목록 → 그 항목의 한 건 → 한 건의 asset. 열쇠는 늘 목록 · 한 건에서만 온다(주소 · 화면이 정하지 못함).
 * 원본을 여는 조건: 목록의 rights 가 'licensed-private' 이고 한 건의 asset.rightsConfirmed === true. 아니면 저장소의 원본을 묻지 않는다.
 * 원본은 비공개 버킷 external-intake 의 admin-references/v1/assets/ 에 application/octet-stream 으로 있다 —
 * 보내는 Content-Type 은 검사한 한 건의 asset.mime(허용 목록)이다. 저장소의 형식 · 주소 · 오류 글은 응답에 싣지 않는다.
 *
 * Range: 'bytes=a-b' · 'bytes=a-' · 'bytes=-n' 한 구간만 받아 한 번에 CHUNK_BYTES 까지로 줄여 저장소에 넘긴다.
 * 여러 구간 · 틀린 모양은 무시하고(RFC 9110) 처음부터 보낸다. 받은 206 · 416 의 Content-Range 는 모양을 확인하고 그대로 싣는다.
 */

/** 한 번의 Range 응답 최대 크기 — 서버리스 응답 한도 아래로(영상 · PDF 보기는 다음 구간을 다시 청한다) */
export const CHUNK_BYTES = 4 * 1024 * 1024;

export type UpstreamResult = {
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
};

/** 원본 받기 — key 는 검사한 asset 열쇠, range 는 줄인 한 구간(없으면 null) */
export type AssetFetch = (key: string, range: string | null, signal?: AbortSignal) => Promise<UpstreamResult>;

const NO_STORE = 'private, no-store, max-age=0';

function plain(status: number, text: string, extra: Record<string, string> = {}): Response {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': NO_STORE,
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}

/** 줄인 Range 한 구간(저장소에 넘길 글) — 없거나 틀리면 null(처음부터 보냄) */
export function normalizeRange(header: string | null): string | null {
  if (!header) return null;
  const m = /^\s*bytes\s*=\s*(\d{0,15})\s*-\s*(\d{0,15})\s*$/i.exec(header);
  if (!m) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  if (a === '') {
    const n = Number(b);
    if (n <= 0) return null;
    return `bytes=-${Math.min(n, CHUNK_BYTES)}`;
  }
  const start = Number(a);
  if (b === '') return `bytes=${start}-${start + CHUNK_BYTES - 1}`;
  const end = Number(b);
  if (end < start) return null;
  return `bytes=${start}-${Math.min(end, start + CHUNK_BYTES - 1)}`;
}

/** 내려받기 이름 — 줄바꿈 · 따옴표 · 경로 글자를 지우고, 영문이 아닌 이름은 filename* 로 */
export function dispositionOf(filename: string): string {
  const clean = filename.replace(/[\u0000-\u001f\u007f"\\/]/g, '').trim().slice(0, 150) || 'original';
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

const DIGITS = /^\d{1,15}$/;
const RANGE_206 = /^bytes (\d{1,15})-(\d{1,15})\/(\d{1,15})$/;
const RANGE_416 = /^bytes \*\/(\d{1,15})$/;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

type Eligible = { ok: true; entry: Entry; asset: Asset } | { ok: false; response: Response };

/** 보는 사람 · 번호 · 목록 · 한 건 · 이용 허락 — 원본 저장소를 묻기 전의 모든 검사 */
export async function resolveOriginal(viewer: Viewer, id: unknown, source: ReferenceSource): Promise<Eligible> {
  if (!viewer) return { ok: false, response: plain(401, '로그인이 필요해요.') };
  if (viewer.role !== 'ADMIN') return { ok: false, response: plain(403, '열 수 없는 자료예요.') };
  const notFound = { ok: false as const, response: plain(404, '원본을 열 수 없어요.') };
  const unavailable = { ok: false as const, response: plain(503, '원본을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.') };
  if (!validEntryId(id)) return notFound;
  try {
    const cat = await source.read(CATALOG_KEY, MAX_CATALOG_BYTES);
    if (!cat.ok) return cat.reason === 'missing' ? notFound : unavailable;
    const catalog = parseCatalog(parseJson(cat.text));
    if (!catalog.ok) return unavailable;
    const entry = catalog.value.entries.find((e) => e.id === id);
    if (!entry || entry.rights !== 'licensed-private') return notFound;
    const det = await source.read(entry.detailKey, MAX_DETAIL_BYTES);
    if (!det.ok) return det.reason === 'missing' ? notFound : unavailable;
    const detail = parseDetail(parseJson(det.text), entry);
    if (!detail.ok) return unavailable;
    const asset = detail.value.asset;
    if (!asset || asset.rightsConfirmed !== true) return notFound;
    return { ok: true, entry, asset };
  } catch {
    return unavailable;
  }
}

/** 원본 보내기 — 응답은 늘 저장 금지(no-store), 형식은 검사한 asset.mime */
export async function serveOriginal(opts: {
  viewer: Viewer;
  id: unknown;
  rangeHeader: string | null;
  source: ReferenceSource;
  fetchAsset: AssetFetch;
  signal?: AbortSignal;
}): Promise<Response> {
  const r = await resolveOriginal(opts.viewer, opts.id, opts.source);
  if (!r.ok) return r.response;
  const range = normalizeRange(opts.rangeHeader);
  let up: UpstreamResult;
  try {
    up = await opts.fetchAsset(r.asset.key, range, opts.signal);
  } catch {
    return plain(503, '원본을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
  const base: Record<string, string> = {
    'Content-Type': r.asset.mime,
    'Content-Disposition': dispositionOf(r.asset.filename),
    'Accept-Ranges': 'bytes',
    'Cache-Control': NO_STORE,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  const cancel = () => {
    void up.body?.cancel().catch(() => {});
  };

  if (up.status === 416) {
    cancel();
    const cr = up.headers.get('content-range');
    return plain(416, '요청한 구간이 파일 밖이에요.', cr && RANGE_416.test(cr) ? { 'Content-Range': cr, 'Accept-Ranges': 'bytes' } : { 'Accept-Ranges': 'bytes' });
  }
  if (up.status === 404 || up.status === 400) {
    cancel();
    return plain(404, '원본을 열 수 없어요.');
  }
  if ((up.status !== 200 && up.status !== 206) || !up.body) {
    cancel();
    return plain(502, '원본을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
  /* 저장소가 구간을 무시하고 200 을 주면 그대로 처음부터(브라우저가 받아들인다). 206 은 Content-Range 를 확인 */
  if (up.status === 206) {
    const cr = up.headers.get('content-range') ?? '';
    const m = RANGE_206.exec(cr);
    if (!m || Number(m[1]) > Number(m[2]) || Number(m[2]) >= Number(m[3])) {
      cancel();
      return plain(502, '원본을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    }
    base['Content-Range'] = cr;
    base['Content-Length'] = String(Number(m[2]) - Number(m[1]) + 1);
  } else {
    const len = up.headers.get('content-length');
    if (len && DIGITS.test(len)) base['Content-Length'] = len;
  }
  return new Response(up.body, { status: up.status, headers: base });
}
