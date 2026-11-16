import type { Catalog, Detail, Entry } from '@/lib/admin-references/schema';
import { CATALOG_KEY, MAX_CATALOG_BYTES, MAX_DETAIL_BYTES, parseCatalog, parseDetail, validEntryId } from '@/lib/admin-references/schema';
import { listItemOf, type ListItem } from '@/lib/admin-references/view';

/**
 * EX-REF02 — 참고자료 읽기의 순서(순수: 저장소는 밖에서 넣는다 — 시험이 가짜 저장소로 돈다).
 *
 * 1) 보는 사람이 대표관리자(ADMIN)가 아니면 저장소를 묻지 않는다(로그인 안 함 · 일반 · 준관리자 모두).
 * 2) 자료 번호 모양이 틀리면 저장소를 묻지 않는다.
 * 3) 자료 열쇠는 목록(catalog)에 적힌 것만 쓴다 — 화면 · 주소가 열쇠를 정하지 못한다.
 * 4) 모양이 틀리면 보여 주지 않는다(fail closed). 실패 까닭은 종류만 돌려주고 경로 · 값은 담지 않는다.
 *
 * 서버의 진짜 저장소는 storage.ts(server-only). 화면은 그쪽의 loadReferenceCatalog · loadReferenceDetail 만 부른다.
 */

export type Viewer = { role: string } | null | undefined;

export type SourceRead = { ok: true; text: string } | { ok: false; reason: 'missing' | 'unavailable' | 'too_large' };

/** 비공개 저장소 한 칸 읽기 — maxBytes 를 넘으면 too_large */
export type ReferenceSource = { read(key: string, maxBytes: number): Promise<SourceRead> };

export type LoadFailure = 'forbidden' | 'missing' | 'unavailable' | 'too_large' | 'malformed' | 'not_found';
export type Failed = { ok: false; reason: LoadFailure };

const isOwnerViewer = (v: Viewer) => !!v && v.role === 'ADMIN';

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * 원본 보기 상태 — 이미 있는 두 값(목록의 rights · 한 건의 asset)으로만 정한다(저장소를 따로 묻지 않는다).
 * - original-not-offered: rights 'private-summary' — 옮긴 글 · 해설 · 요약은 비공개로 보여 주되(전체를 옮긴 자료일 수도 있다)
 *   원본 파일은 이 화면에서 제공하지 않는다
 * - permission-pending: rights 'pending', 또는 허락 자료인데 asset.rightsConfirmed 가 true 가 아님
 * - not-linked: rights 'licensed-private' 인데 한 건에 asset 이 아직 없음(허락은 됐고 파일이 연결 전)
 * - eligible: rights 'licensed-private' + asset.rightsConfirmed === true — 원본 통로(original.ts resolveOriginal)도 같은 두 조건을 따로 다시 본다
 * eligible 이어도 저장소에 실제 파일이 올라갔는지는 이 화면이 확인하지 않는다(없으면 원본 통로가 404).
 */
export type OriginalStatus = 'eligible' | 'permission-pending' | 'not-linked' | 'original-not-offered';
export type OriginalKind = 'pdf' | 'video' | 'audio' | 'image';

export function originalStatusOf(entry: Pick<Entry, 'rights'>, detail: Pick<Detail, 'asset'>): OriginalStatus {
  if (entry.rights === 'private-summary') return 'original-not-offered';
  if (entry.rights !== 'licensed-private') return 'permission-pending';
  if (!detail.asset) return 'not-linked';
  if (detail.asset.rightsConfirmed !== true) return 'permission-pending';
  return 'eligible';
}

function originalKindOf(mime: string): OriginalKind {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'image';
}

/** 원본 통로 주소 — 자료 번호만 담는다(저장소 열쇠 · 서명 주소 없음) */
export const originalHref = (id: string) => `/api/admin/references/${id}/original`;

/** 화면으로 보내는 한 자료 — 원본 열쇠(asset)는 빼고, 열 수 있을 때만 종류(쪽 · 시간 바로가기용) */
export type PublicDetail = Omit<Detail, 'asset'> & { original: OriginalStatus; originalKind: OriginalKind | null };

export function publicDetailOf(detail: Detail, entry: Pick<Entry, 'rights'>): PublicDetail {
  const { asset, ...rest } = detail;
  const original = originalStatusOf(entry, detail);
  return { ...rest, original, originalKind: original === 'eligible' && asset ? originalKindOf(asset.mime) : null };
}

export async function loadCatalogFor(viewer: Viewer, source: ReferenceSource): Promise<{ ok: true; catalog: Catalog } | Failed> {
  if (!isOwnerViewer(viewer)) return { ok: false, reason: 'forbidden' };
  let read: SourceRead;
  try {
    read = await source.read(CATALOG_KEY, MAX_CATALOG_BYTES);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!read.ok) return { ok: false, reason: read.reason };
  const json = parseJson(read.text);
  if (!json.ok) return { ok: false, reason: 'malformed' };
  const parsed = parseCatalog(json.value);
  if (!parsed.ok) return { ok: false, reason: 'malformed' };
  return { ok: true, catalog: parsed.value };
}

export type DetailLoaded = { ok: true; catalogTitle: string; updatedAt: string; entry: ListItem; detail: PublicDetail };

export async function loadDetailFor(viewer: Viewer, id: unknown, source: ReferenceSource): Promise<DetailLoaded | Failed> {
  if (!isOwnerViewer(viewer)) return { ok: false, reason: 'forbidden' };
  if (!validEntryId(id)) return { ok: false, reason: 'not_found' };
  const cat = await loadCatalogFor(viewer, source);
  if (!cat.ok) return cat;
  const entry = cat.catalog.entries.find((e) => e.id === id);
  if (!entry) return { ok: false, reason: 'not_found' };
  let read: SourceRead;
  try {
    read = await source.read(entry.detailKey, MAX_DETAIL_BYTES);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!read.ok) return { ok: false, reason: read.reason };
  const json = parseJson(read.text);
  if (!json.ok) return { ok: false, reason: 'malformed' };
  const parsed = parseDetail(json.value, entry);
  if (!parsed.ok) return { ok: false, reason: 'malformed' };
  return {
    ok: true,
    catalogTitle: cat.catalog.title,
    updatedAt: cat.catalog.updatedAt,
    entry: listItemOf(entry),
    detail: publicDetailOf(parsed.value, entry),
  };
}

/** 실패 까닭 → 화면 글(경로 · 내부 값 없이) */
export const FAILURE_TEXT: Record<Exclude<LoadFailure, 'forbidden' | 'not_found'>, { title: string; body: string }> = {
  missing: { title: '아직 올라온 참고자료가 없어요', body: '검토를 마친 자료 목록이 올라오면 여기에 보여요.' },
  unavailable: { title: '참고자료를 불러오지 못했어요', body: '저장소에 잠시 닿지 못했어요. 잠시 뒤 다시 시도해 주세요.' },
  too_large: { title: '자료가 너무 커서 열지 않았어요', body: '목록이나 자료 파일이 정해 둔 크기를 넘었어요. 자료를 나눠 다시 올려야 해요.' },
  malformed: { title: '자료 모양이 맞지 않아 보여 주지 않았어요', body: '목록이나 자료 파일의 형식이 약속과 달라요. 틀린 자료를 고쳐 다시 올리면 보여요.' },
};
