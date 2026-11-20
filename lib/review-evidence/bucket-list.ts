import { OP_FOLDER } from '@/lib/review-evidence/model';
import type { ListFailure, ListItem, ListPageResult } from '@/lib/review-evidence/store';

/**
 * EX-REF04 — 저장소 목록 한 쪽(순수: 'server-only' 없음 — 시험이 가짜 Supabase 클라이언트로 같이 쓴다).
 *
 * 설치된 @supabase/storage-js 의 listV2(목록 v2, POST /object/list-v2/<버킷>)만 쓴다. 이름 차례 + 다음 쪽 표(cursor)로 넘긴다:
 *  - prefix = 'review-evidence/v1/ops/', 폴더 묶기 없이(with_delimiter false), 이름 오름차순(sortBy name asc).
 *  - 첫 쪽은 cursor 를 보내지 않고, 다음 쪽부터는 앞 쪽이 준 nextCursor 를 그대로 보낸다(속을 풀어 보지 않는다).
 * 옛 목록(list · offset · 만든 시각 차례)으로 돌아가지 않는다 — 목록 v2 가 없으면 'unsupported' 로 멈춘다(운영 준비 조건).
 *
 * 받은 것은 비공개 자리 안의 이름으로만 바꾼다. 자리 밖 열쇠 · 하위 폴더 · 폴더 칸 · 모양이 틀린 응답이면 'unexpected'(자리 밖을 세지 않음).
 * 쪽 사이의 차례(이름이 늘 커지는지) · 다음 쪽 표 확인 · 다시 묻기는 store.ts listAllOps 가 한다.
 * listV2 는 설치본 주석에 '실험적(@experimental)'이라 적혀 있다 — 서명이 바뀌면 타입 검사 · 시험이 먼저 깨진다.
 */

export const LIST_V2_PREFIX = OP_FOLDER + '/';

/** 이 파일이 보내는 목록 v2 요청 — 설치본 SearchV2Options 의 부분 */
export type ListV2Options = {
  prefix: string;
  limit: number;
  cursor?: string;
  with_delimiter: boolean;
  sortBy: { column: 'name'; order: 'asc' };
};

/** 진짜 클라이언트(videoBucket())와 시험의 가짜 클라이언트가 함께 맞추는 가장 작은 모양 */
export type ListV2Client = {
  listV2(options: ListV2Options, parameters?: { signal?: AbortSignal }): Promise<{ data: unknown; error: unknown }>;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const UNEXPECTED: ListPageResult = { ok: false, reason: 'unexpected' };

/**
 * 목록 v2 가 이 서버에 없을 때의 오류인가 — HTTP 404 · 405 · 501(본문의 statusCode 포함), 또는 '경로 없음' 글.
 * 'ENOTFOUND'(이름 찾기 실패) 같은 연결 오류는 여기에 들지 않는다(잠시 못 닿음으로 다시 묻는다).
 */
export function isListV2Unsupported(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: unknown; status?: unknown; statusCode?: unknown; message?: unknown };
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return false;
  const codes = ['404', '405', '501'];
  if (typeof e.status === 'number' && codes.includes(String(e.status))) return true;
  if ((typeof e.statusCode === 'string' || typeof e.statusCode === 'number') && codes.includes(String(e.statusCode))) return true;
  const msg = typeof e.message === 'string' ? e.message : '';
  return /\broute\b[\s\S]*\bnot found\b/i.test(msg) || /\bnot implemented\b/i.test(msg) || /\bmethod not allowed\b/i.test(msg);
}

function failureOf(error: unknown): ListFailure {
  return isListV2Unsupported(error) ? 'unsupported' : 'unavailable';
}

/** 목록 v2 응답 본문 하나를 이 자리 안의 이름 목록으로. 모양이 틀리면 'unexpected' */
export function normalizeListV2Page(data: unknown): ListPageResult {
  if (!isObj(data) || typeof data.hasNext !== 'boolean' || !Array.isArray(data.objects)) return UNEXPECTED;
  const folders = data.folders;
  if (folders !== undefined && folders !== null && (!Array.isArray(folders) || folders.length > 0)) return UNEXPECTED;
  let nextCursor: string | null = null;
  if (data.nextCursor !== undefined && data.nextCursor !== null) {
    if (typeof data.nextCursor !== 'string') return UNEXPECTED;
    nextCursor = data.nextCursor || null;
  }
  const items: ListItem[] = [];
  let fullNames = 0;
  for (const o of data.objects) {
    if (!isObj(o)) return UNEXPECTED;
    const key = o.key;
    if (key !== undefined && key !== null && typeof key !== 'string') return UNEXPECTED;
    /* 열쇠가 있으면 꼭 이 자리 안이어야 한다 */
    if (typeof key === 'string' && !key.startsWith(LIST_V2_PREFIX)) return UNEXPECTED;
    const full = typeof key === 'string' ? key : o.name;
    if (typeof full !== 'string') return UNEXPECTED;
    let name = full;
    if (full.startsWith(LIST_V2_PREFIX)) {
      name = full.slice(LIST_V2_PREFIX.length);
      fullNames++;
    }
    /* 하위 폴더 안의 것 · 빈 이름 · 자리 밖 경로는 세지 않고 멈춘다 */
    if (!name || name.includes('/')) return UNEXPECTED;
    const m = isObj(o.metadata) ? o.metadata : {};
    items.push({
      name,
      size: typeof m.size === 'number' && Number.isFinite(m.size) ? m.size : null,
      etag: typeof m.eTag === 'string' ? m.eTag : null,
    });
  }
  /* 한 쪽 안에서 전체 경로와 짧은 이름이 섞이면 서버가 이 약속대로 답하지 않은 것 */
  if (fullNames > 0 && fullNames !== items.length) return UNEXPECTED;
  return { ok: true, items, nextCursor, hasNext: data.hasNext };
}

/** 한 쪽 묻기 — cursor 가 null 이면 첫 쪽. 시간이 지나면 끊는다(AbortSignal) */
export async function listOpsPageV2(client: ListV2Client, cursor: string | null, limit: number, timeoutMs: number): Promise<ListPageResult> {
  const options: ListV2Options = {
    prefix: LIST_V2_PREFIX,
    limit,
    with_delimiter: false,
    sortBy: { column: 'name', order: 'asc' },
  };
  if (cursor !== null) options.cursor = cursor;
  let res: { data: unknown; error: unknown };
  try {
    res = await client.listV2(options, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, reason: failureOf(e) };
  }
  if (!isObj(res)) return { ok: false, reason: 'unavailable' };
  if (res.error) return { ok: false, reason: failureOf(res.error) };
  return normalizeListV2Page(res.data);
}
