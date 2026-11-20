import 'server-only';
import { videoBucket } from '@/lib/storage';
import { listOpsPageV2 } from '@/lib/review-evidence/bucket-list';
import { localEvidenceStore } from '@/lib/review-evidence/local-store';
import { OP_FOLDER } from '@/lib/review-evidence/model';
import { loadLibrary, READ_TIMEOUT_MS, type EvidenceObjectStore, type LoadResult, type OpCache } from '@/lib/review-evidence/store';
import type { ApiDeps } from '@/lib/review-evidence/api';

/**
 * EX-REF04 — 검수 근거자료의 진짜 저장소(서버에서만).
 * 이미 있는 비공개 버킷 pitch-videos 의 새 자리 review-evidence/v1/ops/ 에 기록 JSON 만 둔다(버킷 · 정책 · DB 구조는 그대로).
 * 원문 · PDF · 영상은 받지도 두지도 않는다. 서명 주소를 만들지 않고 서버가 서비스 열쇠로 바로 읽고 쓴다(열쇠는 lib/storage.ts 가 환경변수에서).
 * 목록은 저장소의 목록 v2(이름 차례 + 다음 쪽 표, lib/review-evidence/bucket-list.ts)로만 모은다. 운영 저장소에 목록 v2 가 없으면
 * 목록 · 화면 · 등록 뒤 확인이 'unsupported' 로 멈춘다(옛 offset 목록으로 돌아가지 않음) — 운영 준비 조건.
 *
 * 내 컴퓨터 미리보기 · 시험만: REVIEW_EVIDENCE_LOCAL_DIR(서버 환경변수)가 있고 운영이 아니면 그 폴더를 저장소로 쓴다
 * (가짜 기록으로 화면을 볼 때 중앙 저장소에 쓰지 않도록). 운영에서는 이 갈래가 꺼진다.
 */

function isDuplicate(error: unknown): boolean {
  const e = error as { statusCode?: string | number; status?: number; message?: string } | null;
  return String(e?.statusCode ?? '') === '409' || e?.status === 409 || /already exists|duplicate/i.test(e?.message ?? '');
}

function isNotFound(error: unknown): boolean {
  const e = error as { statusCode?: string | number; status?: number; message?: string } | null;
  const code = String(e?.statusCode ?? e?.status ?? '');
  return code === '404' || /not.?found/i.test(e?.message ?? '');
}

function bucketStore(): EvidenceObjectStore {
  return {
    async createOnly(key, body) {
      if (!key.startsWith(OP_FOLDER + '/')) return 'error';
      const { error } = await videoBucket().upload(key, new Blob([body], { type: 'application/json' }), {
        upsert: false,
        contentType: 'application/json',
        cacheControl: '0',
      });
      if (!error) return 'created';
      return isDuplicate(error) ? 'exists' : 'error';
    },
    async read(key, maxBytes) {
      if (!key.startsWith(OP_FOLDER + '/')) return { ok: false, reason: 'missing' };
      let res: Awaited<ReturnType<ReturnType<typeof videoBucket>['download']>>;
      try {
        res = await videoBucket().download(key, {}, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
      const { data, error } = res;
      if (error || !data) return { ok: false, reason: isNotFound(error) ? 'missing' : 'unavailable' };
      if (data.size > maxBytes) return { ok: false, reason: 'too_large' };
      return { ok: true, text: await data.text() };
    },
    async list(cursor, limit) {
      return listOpsPageV2(videoBucket(), cursor, limit, READ_TIMEOUT_MS);
    },
  };
}

function localDir(): string | null {
  const dir = process.env.REVIEW_EVIDENCE_LOCAL_DIR;
  return dir && process.env.NODE_ENV !== 'production' ? dir : null;
}

/** 이 서버가 쓰는 저장소가 중앙(버킷)인지 — 화면 · 받음표에 '내 컴퓨터 시험 폴더'를 분명히 적으려고 */
export const evidenceStoreKind = (): 'central' | 'local-fixture' => (localDir() ? 'local-fixture' : 'central');

function evidenceStore(): EvidenceObjectStore {
  const dir = localDir();
  return dir ? localEvidenceStore(dir) : bucketStore();
}

/* 기록은 바뀌지 않으므로(이름 = 번호) 한 번 읽은 본문을 다시 쓴다 — 한도를 넘으면 비운다 */
const OP_CACHE: OpCache = new Map();
const OP_CACHE_MAX = 25_000;
function cache(): OpCache {
  if (OP_CACHE.size > OP_CACHE_MAX) OP_CACHE.clear();
  return OP_CACHE;
}

/** API 처리(lib/review-evidence/api.ts)에 넣을 진짜 저장소 */
export const evidenceDeps = (): ApiDeps => ({ store: evidenceStore, cache: cache(), storeKind: evidenceStoreKind() });

export type Viewer = { id: string; role: string; nickname?: string | null } | null | undefined;

/** 화면용 목록 — 보는 사람 검사가 먼저(대표관리자가 아니면 저장소를 묻지 않는다) */
export async function loadEvidenceLibrary(viewer: Viewer): Promise<LoadResult | { ok: false; reason: 'forbidden' }> {
  if (!viewer || viewer.role !== 'ADMIN') return { ok: false, reason: 'forbidden' };
  return loadLibrary(evidenceStore(), cache());
}
