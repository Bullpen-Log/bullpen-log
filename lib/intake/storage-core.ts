/**
 * external-intake 버킷을 다루는 함수들 — 비밀 값을 인자로 받는다. 앱은 lib/intake/storage.ts 의 getIntakeStorage() 로 쓰고, 시험은 가짜 서버로 이 파일을 바로 부른다.
 *
 * 메모리: 해시는 응답 몸통을 읽는 대로 잰다(파일을 통째로 쥐지 않는다).
 * 사실 대조는 docs/designs/external-intake.md '공식 문서로 확인한 전송 사실'.
 */
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ByteReader } from '@/lib/pitch-lab-file';
import { IntakeError } from '@/lib/intake/errors';
import { READ_URL_TTL_SEC, UPLOAD_TOKEN_FALLBACK_TTL_MS } from '@/lib/intake/limits';
import { INTAKE_BUCKET } from '@/lib/intake/paths';

export type IssuedUpload = {
  /** TUS 끝점 — 서명 업로드는 /storage/v1/upload/resumable/sign */
  endpoint: string;
  /** x-signature 에 넣는 토큰. 그 경로 하나에만 쓴다 */
  token: string;
  /** 지금부터 토큰이 살아 있는 시간(ms) — 기기 시계가 달라도 되게 시각이 아니라 길이로 준다 */
  tokenTtlMs: number;
  /** 공개 키(publishable/anon) — apikey 머리. service role 키는 절대 아니다. 설정이 없으면 null */
  apikey: string | null;
  bucket: string;
  objectName: string;
};

export type ObjectStat = { size: number; contentType: string | null };

export type HashResult = { sha256: string; size: number };

/** 서비스가 쓰는 저장소 모양 — 시험은 이것을 가짜로 넘긴다 */
export type IntakeStorage = {
  /** TUS 주소가 이 값으로 시작해야 저장소의 주소다 */
  readonly uploadOrigin: string;
  issueUpload(objectPath: string): Promise<IssuedUpload>;
  /** 없으면 null */
  stat(objectPath: string): Promise<ObjectStat | null>;
  /** 범위 읽기 — 없으면 null */
  reader(objectPath: string): Promise<ByteReader | null>;
  /** 처음부터 끝까지 스트리밍으로 SHA-256 을 잰다 */
  hash(objectPath: string, opts?: { signal?: AbortSignal }): Promise<HashResult>;
  /** 짧은 서명 읽기 주소. download 를 주면 그 이름으로 내려받는다 */
  readUrl(objectPath: string, opts?: { ttlSec?: number; download?: string }): Promise<string>;
  list(prefix: string): Promise<string[]>;
  remove(objectPaths: string[]): Promise<void>;
};

/**
 * 분석 쪽이 더 쓰는 것 — GPU 가 결과를 PUT 할 서명 주소. 영상 전송 토큰(TUS)과 달리 일반 PUT 이고, 분석 서버가 올리기를 다시 시도해도 되게 덮어쓰기를 켠다.
 * 그래서 run 폴더 경로에만 쓴다. 원본 경로에는 쓰지 않는다(lib/intake/analysis.ts 가 경로를 만든다).
 */
export type IntakeRunStorage = IntakeStorage & {
  resultUploadUrl(objectPath: string): Promise<string>;
};

export type IntakeStorageConfig = {
  url: string;
  serviceKey: string;
  /** 공개 키 — 없으면 apikey 머리 없이 보낸다 */
  publishableKey?: string | null;
  bucket?: string;
  fetch?: typeof fetch;
};

/**
 * 공식 문서: 큰 파일은 직접 저장소 주소로 — https://<ref>.supabase.co → https://<ref>.storage.supabase.co.
 * 그 모양이 아닌 주소(로컬 · 시험)는 그대로 둔다.
 */
export function directStorageOrigin(url: string): string {
  const u = new URL(url);
  const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(u.hostname);
  return m ? `${u.protocol}//${m[1]}.storage.supabase.co` : u.origin;
}

/** 토큰의 exp 를 읽어 남은 시간을 구한다 — 서명은 저장소가 본다. 못 읽으면 짧은 기본값 */
export function tokenTtlOf(token: string, nowMs: number): number {
  try {
    const body = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: unknown };
    if (typeof body.exp === 'number') return Math.max(0, body.exp * 1000 - nowMs);
  } catch {
    /* 아래 기본값 */
  }
  return UPLOAD_TOKEN_FALLBACK_TTL_MS;
}

const unavailable = (cause: string) => new IntakeError('storage_unavailable', { cause });

/** 크기 확인 · 범위 읽기의 제한 시간 — 작은 읽기라 이보다 오래 걸리면 저장소 문제로 본다 */
const READ_TIMEOUT_MS = 30_000;

/**
 * 서버 안 GET 은 늘 signal 을 준다. Next 의 fetch(dedupe-fetch)는 signal 없는 GET 의 응답을 둘로 갈라(tee) 한 갈래를 쥐고 있어서
 * ① body.cancel() 이 남은 갈래가 가비지 수집될 때까지 안 끝나고(격리 브라우저 시험에서 전송 확인이 119초 걸렸다) ② 안 읽는 갈래에 파일 전체가 쌓인다.
 * signal 이 있으면 Next 가 가르지 않는다. 시험의 가짜 fetch 로는 안 드러나서 intake:transfer-test 가 Next 의 그 함수를 끼워 본다.
 */
const noTee = (headers?: HeadersInit, signal?: AbortSignal): RequestInit => ({
  ...(headers ? { headers } : {}),
  cache: 'no-store',
  signal: signal ?? AbortSignal.timeout(READ_TIMEOUT_MS),
});

export function createIntakeStorage(cfg: IntakeStorageConfig): IntakeRunStorage {
  const bucketName = cfg.bucket ?? INTAKE_BUCKET;
  const doFetch = cfg.fetch ?? fetch;
  const client: SupabaseClient = createClient(cfg.url, cfg.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(cfg.fetch ? { global: { fetch: cfg.fetch } } : {}),
  });
  const bucket = () => client.storage.from(bucketName);
  const origin = directStorageOrigin(cfg.url);

  async function signedRead(objectPath: string, ttlSec: number): Promise<string | null> {
    const { data, error } = await bucket().createSignedUrl(objectPath, ttlSec);
    if (error || !data?.signedUrl) {
      if (/not.?found/i.test(error?.message ?? '')) return null;
      throw unavailable('sign_read');
    }
    return data.signedUrl;
  }

  async function stat(objectPath: string): Promise<ObjectStat | null> {
    const url = await signedRead(objectPath, 60);
    if (!url) return null;
    const res = await doFetch(url, noTee({ Range: 'bytes=0-0' })).catch(() => {
      throw unavailable('stat_fetch');
    });
    await res.body?.cancel().catch(() => {});
    if (res.status === 404 || res.status === 400) return null;
    if (res.status === 416) {
      const empty = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
      return empty ? { size: Number(empty[1]), contentType: res.headers.get('content-type') } : null;
    }
    if (!res.ok) throw unavailable('stat');
    const total = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
    const size = total ? Number(total[1]) : Number(res.headers.get('content-length'));
    if (!Number.isFinite(size)) throw unavailable('stat_size');
    return { size, contentType: res.headers.get('content-type') };
  }

  return {
    uploadOrigin: origin,

    async issueUpload(objectPath) {
      const { data, error } = await bucket().createSignedUploadUrl(objectPath);
      if (error || !data?.token) throw unavailable('sign_upload');
      return {
        endpoint: `${origin}/storage/v1/upload/resumable/sign`,
        token: data.token,
        tokenTtlMs: tokenTtlOf(data.token, Date.now()),
        apikey: cfg.publishableKey ?? null,
        bucket: bucketName,
        objectName: objectPath,
      };
    },

    stat,

    async resultUploadUrl(objectPath) {
      const { data, error } = await bucket().createSignedUploadUrl(objectPath, { upsert: true });
      if (error || !data?.signedUrl) throw unavailable('sign_result');
      return data.signedUrl;
    },

    async reader(objectPath) {
      const size = (await stat(objectPath))?.size;
      if (size == null) return null;
      const url = await signedRead(objectPath, READ_URL_TTL_SEC);
      if (!url) return null;
      return {
        size,
        read: async (start, end) => {
          if (end <= start) return new Uint8Array(0);
          const res = await doFetch(url, noTee({ Range: `bytes=${start}-${end - 1}` })).catch(() => {
            throw unavailable('range_fetch');
          });
          if (res.status !== 206 && res.status !== 200) throw unavailable('range_read');
          const bytes = new Uint8Array(await res.arrayBuffer());
          /* 범위를 무시하고 통째로 준 저장소는 앞에서 잘라 쓴다 */
          return res.status === 200 ? bytes.subarray(start, end) : bytes;
        },
      };
    },

    async hash(objectPath, opts) {
      const url = await signedRead(objectPath, READ_URL_TTL_SEC);
      if (!url) throw unavailable('hash_missing');
      /* 전체 읽기는 파일 크기에 달려 시간을 안 묶는다 — 끊는 것은 부른 쪽 signal 과 함수 시간 제한이다 */
      const res = await doFetch(url, noTee(undefined, opts?.signal ?? new AbortController().signal));
      if (!res.ok || !res.body) throw unavailable('hash_read');
      const hash = createHash('sha256');
      let size = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        size += value.byteLength;
      }
      return { sha256: hash.digest('hex'), size };
    },

    async readUrl(objectPath, opts) {
      const signed = await signedRead(objectPath, opts?.ttlSec ?? READ_URL_TTL_SEC);
      if (!signed) throw unavailable('read_missing');
      if (!opts?.download) return signed;
      /*
       * SDK 의 download 옵션은 값을 URLSearchParams 로 인코딩한 뒤 주소 전체를 encodeURI 로 한 번 더 싸서 한글 이름이 깨진다(%EA → %25EA).
       * 그래서 서명 주소를 받은 뒤 직접 붙인다. 서명은 경로 · 토큰만 보므로 download 칸은 서명과 상관없다.
       */
      const url = new URL(signed);
      url.searchParams.set('download', opts.download);
      return url.toString();
    },

    async list(prefix) {
      const out: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket().list(prefix, { limit: 1000, offset });
        if (error) throw unavailable('list');
        out.push(...(data ?? []).map((f) => `${prefix}/${f.name}`));
        if (!data || data.length < 1000) return out;
      }
    },

    async remove(objectPaths) {
      if (!objectPaths.length) return;
      const { error } = await bucket().remove(objectPaths);
      if (error) throw unavailable('remove');
    },
  };
}
