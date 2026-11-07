/**
 * 브라우저에서 원본을 그대로 보내는 도우미. 바이트를 바꾸는 일이 없다 — 줄이기 · 다시 만들기 · 메타 지우기를 하지 않는다.
 *
 * 메모리: 해시는 8MiB 씩, 전송은 6MiB 조각씩 file.slice 로 읽는다. 큰 파일을 통째로 쥐지 않는다. 전송은 한 파일씩 차례로.
 *
 * 이어 올리기: File 은 새로고침을 넘어 살아남지 않는다. 그래서 남기는 것은 업로드 주소 · 크기 · 해시뿐이다(토큰은 안 남긴다).
 *   다시 왔을 때 같은 파일을 고르면 크기 + 해시를 맞춘 뒤 이어 간다(matchesRecovery). 기록은 접수 + 자산 번호로 묶인다.
 *
 * 토큰: x-signature 는 요청마다 필요하다. 끝나기 전에 refreshGrant 로 새로 받아 같은 업로드 주소에 이어 간다(토큰은 경로에 묶이고 업로드에는 안 묶인다).
 * 업로드 주소(24시간)와 초대 만료는 다르다. 주소가 끝나면 저장소가 HEAD 에 404 · 410 을 주고 tus-js-client 가 새 업로드를 만든다.
 * 그 밖의 HEAD 거절(잠깐의 5xx, 끝난 토큰)은 새 업로드를 만들 까닭이 아니다 — 올린 바이트를 잃는다. 그래서 주소를 쥔 채 재시도로 돌린다(HeadRefused).
 *
 * 'conflict' 는 '이미 끝났을 수 있다'는 뜻이다 — 부르는 쪽은 confirmUpload 로 저장소를 직접 물어본다.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Upload, type DetailedError, type HttpRequest, type HttpResponse } from 'tus-js-client';
import { TUS_URL_TTL_MS } from '@/lib/intake/limits';

export const HASH_SLICE_BYTES = 8 * 1024 * 1024;
/** 토큰이 이 시간 안에 끝나면 미리 새로 받는다 */
const TOKEN_REFRESH_MARGIN_MS = 120_000;
/** 공식 문서 예시와 같은 재시도 간격 */
export const UPLOAD_RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

export type IntakeUploadErrorCode =
  /** 파일을 더 못 읽는다(iCloud 파일 · 권한이 끊김) — 같은 파일을 다시 골라야 한다 */
  | 'file_unreadable'
  /** 신호가 끊겼다 — 다시 시도하면 이어 간다 */
  | 'network'
  /** 저장소가 토큰을 거절했다 — 권한이 끝났을 수 있다 */
  | 'token_refused'
  /** 이미 끝났거나 다른 곳에서 올리는 중이다 — confirmUpload 로 물어본다 */
  | 'conflict'
  | 'aborted'
  | 'unknown';

export class IntakeUploadError extends Error {
  readonly code: IntakeUploadErrorCode;
  constructor(code: IntakeUploadErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'IntakeUploadError';
    this.code = code;
  }
}

/** 이어 갈 자리를 물었는데(HEAD) 저장소가 거절했다 — 주소는 살아 있을 수 있어 재시도로 돌린다. HEAD 응답에는 몸통이 없어 글자로 까닭을 못 가린다 */
class HeadRefused extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`tus: HEAD ${status}`);
    this.name = 'HeadRefused';
    this.status = status;
  }
}

/** 응답 상태 — HEAD 를 우리가 막았으면 그 안에 있다 */
const statusOf = (err: Error | DetailedError) => {
  const d = err as DetailedError;
  return d.originalResponse?.getStatus() ?? (d.causingError instanceof HeadRefused ? d.causingError.status : 0);
};

/** 파일 전체의 SHA-256 — 조각으로 읽어 잰다 */
export async function hashFileSha256(
  file: Blob,
  opts: { onProgress?: (doneBytes: number, totalBytes: number) => void; signal?: AbortSignal; sliceBytes?: number } = {},
): Promise<string> {
  const step = opts.sliceBytes ?? HASH_SLICE_BYTES;
  const hash = sha256.create();
  for (let at = 0; at < file.size; at += step) {
    if (opts.signal?.aborted) throw new IntakeUploadError('aborted');
    let part: Uint8Array;
    try {
      part = new Uint8Array(await file.slice(at, Math.min(at + step, file.size)).arrayBuffer());
    } catch {
      throw new IntakeUploadError('file_unreadable');
    }
    hash.update(part);
    opts.onProgress?.(Math.min(at + step, file.size), file.size);
  }
  return bytesToHex(hash.digest());
}

/** 서버의 UploadGrant 중 전송에 쓰는 칸 */
export type UploadGrantView = {
  endpoint: string;
  token: string;
  tokenTtlMs: number;
  apikey: string | null;
  bucket: string;
  objectName: string;
  contentType: string;
  chunkSize: number;
  uploadUrl: string | null;
  transportExpiresAt: string | null;
};

/** 이어 올리기 기록 — 토큰 · 초대 주소를 넣지 않는다 */
export type UploadRecovery = {
  uploadUrl: string;
  size: number;
  sha256: string;
  fileName: string;
  transportExpiresAt: string;
};

export type RecoveryStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** 기록 자리 — 접수 + 자산으로 묶는다 */
export const recoveryKey = (submissionId: string, assetId: string) => `intake-upload:${submissionId}:${assetId}`;

/** 이 기기의 저장소 — 못 쓰면(사생활 모드 등) 메모리에만 둔다 */
export function browserRecoveryStore(): RecoveryStore {
  const memory = new Map<string, string>();
  const fallback: RecoveryStore = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  };
  try {
    const probe = 'intake-upload:probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return fallback;
  }
}

export function readRecovery(store: RecoveryStore, key: string, now: Date = new Date()): UploadRecovery | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const r = JSON.parse(raw) as UploadRecovery;
    if (typeof r.uploadUrl !== 'string' || typeof r.size !== 'number' || typeof r.sha256 !== 'string') return null;
    if (new Date(r.transportExpiresAt).getTime() <= now.getTime()) {
      store.removeItem(key);
      return null;
    }
    return r;
  } catch {
    return null;
  }
}

/** 다시 고른 파일이 그 파일인가 — 크기를 먼저 보고 해시까지 맞춘다. 이름은 믿지 않는다 */
export async function matchesRecovery(
  file: Blob,
  recovery: Pick<UploadRecovery, 'size' | 'sha256'>,
  opts: { signal?: AbortSignal; onProgress?: (doneBytes: number, totalBytes: number) => void } = {},
): Promise<{ ok: true } | { ok: false; reason: 'size' | 'hash' }> {
  if (file.size !== recovery.size) return { ok: false, reason: 'size' };
  return (await hashFileSha256(file, opts)) === recovery.sha256 ? { ok: true } : { ok: false, reason: 'hash' };
}

/* tus-js-client 는 조각의 .size 로 끝을 판단한다 — Uint8Array 에는 없어서 달아 준다(라이브러리의 BufferSource 도 그렇게 한다) */
type Slice = { value: Uint8Array & { size: number }; done: boolean };

/** 조각 읽기 — 브라우저 · 시험이 같은 길을 쓴다. 읽기가 끊기면 표시를 남겨 'file_unreadable' 로 알린다 */
function blobReader(onFail: () => void) {
  return {
    openFile: async (input: unknown) => {
      const blob = input as Blob;
      return {
        size: blob.size,
        slice: async (start: number, end: number): Promise<Slice> => {
          const stop = Math.min(end, blob.size);
          try {
            const bytes = new Uint8Array(await blob.slice(start, stop).arrayBuffer());
            return { value: Object.assign(bytes, { size: bytes.byteLength }), done: stop >= blob.size };
          } catch (e) {
            onFail();
            throw e;
          }
        },
        close: () => {},
      };
    },
  };
}

export type StartUploadOptions = {
  file: Blob;
  fileName: string;
  sha256: string;
  grant: UploadGrantView;
  /** 토큰이 끝나 가면 부른다 — 서버의 issueUploadToken 을 다시 부르면 된다 */
  refreshGrant: () => Promise<{ token: string; tokenTtlMs: number }>;
  store: RecoveryStore;
  storeKey: string;
  /** 업로드 주소를 처음 받았을 때 — 서버의 registerUploadUrl 로 남긴다. 실패해도 전송은 계속된다 */
  onUploadUrl?: (uploadUrl: string) => void;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  /** 시험용 */
  retryDelays?: number[];
  now?: () => number;
};

export type UploadHandle = {
  /** 끝나면 풀리고, 실패하면 IntakeUploadError 로 막힌다 */
  done: Promise<void>;
  /** 멈춘다 — 기록은 남아 나중에 이어 갈 수 있다 */
  abort: () => Promise<void>;
};

/** 파일 하나를 보낸다. 살아 있는 업로드 주소가 있으면 거기서 이어 간다 */
export function startIntakeUpload(o: StartUploadOptions): UploadHandle {
  const now = o.now ?? Date.now;
  let token = o.grant.token;
  let tokenExpiresAt = now() + o.grant.tokenTtlMs;
  let refreshing: Promise<void> | null = null;
  let unreadable = false;
  let aborted = false;
  /* 새 토큰을 못 받으면(폐기 · 만료) 재시도해도 소용없다 */
  let refreshRefused = false;

  const refresh = () => {
    refreshing ??= o
      .refreshGrant()
      .then((g) => {
        token = g.token;
        tokenExpiresAt = now() + g.tokenTtlMs;
      })
      .catch((e: unknown) => {
        refreshRefused = true;
        throw e;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };

  /* 기록이 이 파일의 것일 때만 쓴다 — 크기 · 해시가 다르면 다른 바이트를 이어 붙이게 된다 */
  const known = readRecovery(o.store, o.storeKey, new Date(now()));
  const fits = known != null && known.size === o.file.size && known.sha256 === o.sha256;
  const resumeUrl = fits ? known.uploadUrl : o.grant.uploadUrl;

  let settle!: { resolve: () => void; reject: (e: IntakeUploadError) => void };
  const done = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });

  const upload: Upload = new Upload(o.file, {
    endpoint: o.grant.endpoint,
    uploadUrl: resumeUrl ?? undefined,
    chunkSize: o.grant.chunkSize,
    retryDelays: o.retryDelays ?? UPLOAD_RETRY_DELAYS,
    /* 먼저 주소를 받아 남긴 뒤 바이트를 보낸다 — 첫 조각에서 끊겨도 이어 갈 수 있게 */
    uploadDataDuringCreation: false,
    /* 이어 올리기 기록은 우리가 범위를 묶어 직접 남긴다 */
    storeFingerprintForResuming: false,
    fingerprint: async () => o.storeKey,
    fileReader: blobReader(() => {
      unreadable = true;
    }) as never,
    headers: o.grant.apikey ? { apikey: o.grant.apikey } : {},
    metadata: {
      bucketName: o.grant.bucket,
      objectName: o.grant.objectName,
      contentType: o.grant.contentType,
      cacheControl: '3600',
    },
    onBeforeRequest: async (req: HttpRequest) => {
      if (tokenExpiresAt - now() < TOKEN_REFRESH_MARGIN_MS) await refresh();
      req.setHeader('x-signature', token);
    },
    onAfterResponse: (req: HttpRequest, res: HttpResponse) => {
      if (req.getMethod() !== 'HEAD') return;
      const status = res.getStatus();
      /* 404 · 410 만 '이 주소는 끝났다'는 뜻이다. 423 은 라이브러리가 재시도로 돌린다 */
      if (status < 300 || status === 404 || status === 410 || status === 423) return;
      throw new HeadRefused(status);
    },
    onUploadUrlAvailable: () => {
      const url = upload.url;
      if (!url) return;
      const same = readRecovery(o.store, o.storeKey, new Date(now()));
      if (same?.uploadUrl === url) return;
      const record: UploadRecovery = {
        uploadUrl: url,
        size: o.file.size,
        sha256: o.sha256,
        fileName: o.fileName,
        transportExpiresAt: new Date(now() + TUS_URL_TTL_MS).toISOString(),
      };
      o.store.setItem(o.storeKey, JSON.stringify(record));
      o.onUploadUrl?.(url);
    },
    onProgress: (sent: number, total: number) => o.onProgress?.(sent, total),
    onShouldRetry: (err: DetailedError) => {
      if (unreadable || refreshRefused) return false;
      const status = statusOf(err);
      if (status === 409 || status === 423) return true;
      if (err.causingError instanceof HeadRefused && (status === 400 || status === 401 || status === 403)) {
        /* 몸통이 없어 글자를 못 본다 — 토큰이 끝났다고 보고 새로 받아 같은 주소를 다시 묻는다 */
        tokenExpiresAt = 0;
        return true;
      }
      if (status === 400 || status === 401 || status === 403) {
        /* 토큰이 끝난 것일 수 있다 — 한 번 새로 받아 본다 */
        const body = err.originalResponse?.getBody() ?? '';
        if (/signature|jwt|token|exp/i.test(body)) {
          tokenExpiresAt = 0;
          return true;
        }
        return false;
      }
      if (status >= 400 && status < 500) return false;
      return true;
    },
    onSuccess: () => {
      o.store.removeItem(o.storeKey);
      settle.resolve();
    },
    onError: (err: Error | DetailedError) => {
      if (aborted) return;
      if (unreadable) return settle.reject(new IntakeUploadError('file_unreadable'));
      if (refreshRefused) return settle.reject(new IntakeUploadError('token_refused'));
      const status = statusOf(err);
      if (status === 409 || status === 423) return settle.reject(new IntakeUploadError('conflict'));
      if (status === 400 || status === 401 || status === 403) {
        const body = (err as DetailedError).originalResponse?.getBody() ?? '';
        return settle.reject(new IntakeUploadError(/already exists|duplicate/i.test(body) ? 'conflict' : 'token_refused'));
      }
      if (status === 0) return settle.reject(new IntakeUploadError('network'));
      settle.reject(new IntakeUploadError('unknown', `status ${status}`));
    },
  });

  upload.start();
  return {
    done,
    abort: async () => {
      aborted = true;
      await upload.abort(false);
      settle.reject(new IntakeUploadError('aborted'));
    },
  };
}
