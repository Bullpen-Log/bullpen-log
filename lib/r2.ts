import { createHash, createHmac } from 'node:crypto';

/**
 * 지금은 안 쓴다(2026-10-20 김민: "일단 Supabase 로, 사용자가 많이 생기면 R2 로") — 앱 업데이트 파일을 R2 로 옮길 때 lib/app-update-store.ts 를
 * 이 함수들로 바꾼다. SigV4 서명은 시험이 지킨다(npm run app-update:test).
 *
 * Cloudflare R2(S3 와 같은 약속) — 서명된 주소(presigned URL)를 직접 만든다(AWS SigV4). 서버(app/api/app-update)와 새 앱 업데이트 올리기
 * (native/scripts/publish-update.mts)가 같이 쓴다 — 그래서 '@/' 가져오기 없이 node:crypto 만. 새 패키지 없이 서명 한 가지(쿼리 서명)로
 * GET · PUT · HEAD 를 다 한다. 열쇠는 R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET(값은 .env · Vercel · GitHub 비밀).
 */

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s).digest();

export type PresignInput = {
  method: 'GET' | 'PUT' | 'HEAD';
  host: string;
  /** '/bucket/key' 처럼 — 조각마다 퍼센트 인코딩한다(/ 는 그대로) */
  path: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 서명 시각 — 시험에서 고정한다 */
  date: Date;
  expiresSec: number;
};

/** AWS SigV4 쿼리 서명 주소(S3 · R2 같은 꼴) — 본문은 서명하지 않는다(UNSIGNED-PAYLOAD) */
export function presignUrl(p: PresignInput): string {
  const amzDate = p.date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${p.region}/s3/aws4_request`;
  const path = p.path.split('/').map(enc).join('/');
  const query: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${p.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(p.expiresSec)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const canonicalQuery = query
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .sort()
    .join('&');
  const canonical = [p.method, path, canonicalQuery, `host:${p.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${p.secretAccessKey}`, day), p.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return `https://${p.host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

type R2Env = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export function r2Env(): R2Env | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return { accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET };
}

/** 버킷 안 key 의 서명 주소(기본 1시간) */
export function r2Url(env: R2Env, method: PresignInput['method'], key: string, expiresSec = 3600): string {
  return presignUrl({
    method,
    host: `${env.accountId}.r2.cloudflarestorage.com`,
    path: `/${env.bucket}/${key}`,
    region: 'auto',
    accessKeyId: env.accessKeyId,
    secretAccessKey: env.secretAccessKey,
    date: new Date(),
    expiresSec,
  });
}

/** 읽기 — 없으면 null */
export async function r2GetText(env: R2Env, key: string): Promise<string | null> {
  const res = await fetch(r2Url(env, 'GET', key, 300), { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 읽기 ${res.status} ${key}`);
  return res.text();
}

export async function r2Exists(env: R2Env, key: string): Promise<boolean> {
  const res = await fetch(r2Url(env, 'HEAD', key, 300));
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`R2 확인 ${res.status} ${key}`);
  return true;
}

export async function r2Put(env: R2Env, key: string, body: Uint8Array | string, contentType: string): Promise<void> {
  const res = await fetch(r2Url(env, 'PUT', key, 900), { method: 'PUT', body: body as BodyInit, headers: { 'content-type': contentType } });
  if (!res.ok) throw new Error(`R2 올리기 ${res.status} ${key}: ${(await res.text()).slice(0, 200)}`);
}
